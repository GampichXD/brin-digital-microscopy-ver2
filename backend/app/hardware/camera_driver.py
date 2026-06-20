import cv2
import threading # <-- Tambahkan import ini

class IMX477CameraDriver:
    def __init__(self, sensor_id=0, width=1280, height=720, fps=30):
        self.sensor_id = sensor_id
        self.width = width
        self.height = height
        self.fps = fps
        self.cap = None
        self.is_initializing = False # Lock status inisialisasi

    def _gstreamer_pipeline(self):
        return (
            f"nvarguscamerasrc sensor-id={self.sensor_id} ! "
            f"video/x-raw(memory:NVMM), width=(int){self.width}, height=(int){self.height}, "
            f"format=(string)NV12, framerate=(fraction){self.fps}/1 ! "
            f"nvvidconv flip-method=0 ! "
            f"video/x-raw, width=(int){self.width}, height=(int){self.height}, format=(string)BGRx ! "
            f"videoconvert ! video/x-raw, format=(string)BGR ! appsink"
        )

    def _open_camera_hardware(self):
        pipeline = self._gstreamer_pipeline()
        try:
            import platform
            if platform.system() == "Windows":
                print("[HARDWARE] Threading: Membuka webcam Windows (Index 0)...")
                self.cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
            else:
                self.cap = cv2.VideoCapture(pipeline, cv2.CAP_GSTREAMER)
                if not self.cap.isOpened():
                    self.cap = cv2.VideoCapture(0)
        except Exception as e:
            print(f"[HARDWARE ERROR] Gagal membuka kamera: {e}")
            self.cap = cv2.VideoCapture(0)
            
        if self.cap.isOpened():
            print("[HARDWARE SUCCESS] Kamera berhasil di-lock oleh background thread.")
        else:
            print("[HARDWARE ERROR] Kamera gagal dibuka.")
        self.is_initializing = False

    def start(self):
        # Jika kamera sudah terbuka atau sedang proses inisialisasi, lewati
        if (self.cap and self.cap.isOpened()) or self.is_initializing:
            return
            
        self.is_initializing = True
        # Lempar inisialisasi OpenCV ke Thread terpisah agar FastAPI tidak freeze
        thread = threading.Thread(target=self._open_camera_hardware, daemon=True)
        thread.start()

    def get_frame_bytes(self):
        if self.cap is None or not self.cap.isOpened():
            return None
        
        success, frame = self.cap.read()
        if not success:
            return None
        
        ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ret:
            return None
            
        return buffer.tobytes()

    def stop(self):
        if self.cap and self.cap.isOpened():
            self.cap.release()
            self.cap = None
        print("[HARDWARE] Kamera dilepas dari memori.")

camera_driver = IMX477CameraDriver()