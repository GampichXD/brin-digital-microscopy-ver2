import cv2
import threading
import platform

class IMX477CameraDriver:
    def __init__(self, sensor_id=0, width=1280, height=720, fps=30):
        self.sensor_id = sensor_id
        self.width = width
        self.height = height
        self.fps = fps
        self.cap = None
        self.is_initializing = False  # Lock status untuk mencegah inisialisasi ganda

    def _gstreamer_pipeline(self):
        """Membuat string pipa GStreamer khusus akselerasi hardware Jetson nvargus."""
        return (
            f"nvarguscamerasrc sensor-id={self.sensor_id} ! "
            f"video/x-raw(memory:NVMM), width=(int){self.width}, height=(int){self.height}, "
            f"format=(string)NV12, framerate=(fraction){self.fps}/1 ! "
            f"nvvidconv flip-method=0 ! "
            f"video/x-raw, width=(int){self.width}, height=(int){self.height}, format=(string)BGRx ! "
            f"videoconvert ! video/x-raw, format=(string)BGR ! appsink"
        )

    def _open_camera_hardware(self):
        """Fungsi pekerja internal yang berjalan di dalam thread terpisah."""
        pipeline = self._gstreamer_pipeline()
        try:
            if platform.system() == "Windows":
                print("[HARDWARE] Threading: Membuka webcam Windows (Index 0) via CAP_DSHOW...")
                self.cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
            else:
                print(f"[HARDWARE] Threading: Membuka MIPI CSI IMX477 via GStreamer (Sensor ID: {self.sensor_id})...")
                self.cap = cv2.VideoCapture(pipeline, cv2.CAP_GSTREAMER)
                
                # Fallback jika GStreamer gagal memuat modul perangkat keras
                if not self.cap.isOpened():
                    print("[HARDWARE WARNING] Pipa GStreamer gagal dibuka. Mencoba fallback ke V4L2 USB...")
                    self.cap = cv2.VideoCapture(0)
        except Exception as e:
            print(f"[HARDWARE ERROR] Eksepsi kritis saat membuka kamera: {e}")
            self.cap = cv2.VideoCapture(0)
            
        if self.cap.isOpened():
            print("[HARDWARE SUCCESS] Sensor kamera berhasil dikunci oleh background thread.")
        else:
            print("[HARDWARE ERROR] Sensor kamera gagal total saat diinisialisasi.")
            
        self.is_initializing = False

    def start(self):
        """Menyalakan aliran kamera secara asinkron tanpa memblokir siklus FastAPI."""
        if (self.cap and self.cap.isOpened()) or self.is_initializing:
            print("[HARDWARE] Kamera sudah aktif atau sedang dalam proses pemuatan.")
            return
            
        self.is_initializing = True
        # Melempar inisialisasi ke Thread terpisah agar Uvicorn/FastAPI tidak freeze/lag
        thread = threading.Thread(target=self._open_camera_hardware, daemon=True)
        thread.start()

    def get_frame_bytes(self):
        """Mengambil frame gambar terbaru dan mengubahnya ke format biner JPEG untuk streaming."""
        if self.cap is None or not self.cap.isOpened():
            return None
        
        success, frame = self.cap.read()
        if not success:
            return None
        
        # Kompresi frame ke JPEG dengan kualitas 80% untuk menghemat bandwidth data web
        ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ret:
            return None
            
        return buffer.tobytes()

    def stop(self):
        """Melepas sensor kamera dan membebaskan alokasi memori buffer."""
        if self.cap and self.cap.isOpened():
            self.cap.release()
            self.cap = None
            print("[HARDWARE] Koneksi kamera diputus dan memori dibersihkan.")

# Instansiasi objek tunggal (Singleton) dengan nama variabel cam_driver
cam_driver = IMX477CameraDriver()