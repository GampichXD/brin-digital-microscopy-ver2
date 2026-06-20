import cv2

class IMX477CameraDriver:
    def __init__(self, sensor_id=0, width=1280, height=720, fps=30):
        self.sensor_id = sensor_id
        self.width = width
        self.height = height
        self.fps = fps
        self.cap = None

    def _gstreamer_pipeline(self):
        # Pipa GStreamer khusus untuk performa tinggi sensor CSI Jetson Orin Nano
        return (
            f"nvarguscamerasrc sensor-id={self.sensor_id} ! "
            f"video/x-raw(memory:NVMM), width=(int){self.width}, height=(int){self.height}, "
            f"format=(string)NV12, framerate=(fraction){self.fps}/1 ! "
            f"nvvidconv flip-method=0 ! "
            f"video/x-raw, width=(int){self.width}, height=(int){self.height}, format=(string)BGRx ! "
            f"videoconvert ! video/x-raw, format=(string)BGR ! appsink"
        )

    def start(self):
        pipeline = self._gstreamer_pipeline()
        try:
            self.cap = cv2.VideoCapture(pipeline, cv2.CAP_GSTREAMER)
            if not self.cap.isOpened():
                print("[HARDWARE WARNING] CSI GStreamer tidak terdeteksi, beralih ke Fallback Camera...")
                self.cap = cv2.VideoCapture(0) # Fallback ke webcam biasa jika tidak di Jetson
        except Exception:
            self.cap = cv2.VideoCapture(0)

    def get_frame_bytes(self):
        if self.cap is None or not self.cap.isOpened():
            return None
        
        success, frame = self.cap.read()
        if not success:
            return None
        
        # Kompres gambar mentah menjadi format (.jpg) biner agar transmisi WebSocket ringan
        ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ret:
            return None
            
        return buffer.tobytes()

    def stop(self):
        if self.cap and self.cap.isOpened():
            self.cap.release()
        print("[HARDWARE] Kamera IMX477 dihentikan.")

# Instansiasi objek kamera secara global
camera_driver = IMX477CameraDriver()