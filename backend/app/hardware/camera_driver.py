import json

class IMX477CameraVPSRelay:
    def __init__(self):
        # Menyimpan frame gambar terbaru dalam format string Base64 / Bytes
        # Diinisialisasi dengan gambar blank hitam atau placeholder transparan
        self.latest_frame = None
        self.is_streaming = False

    def update_frame(self, base64_image_data: str):
        """
        Fungsi pemicu yang dipanggil saat WebSocket Router menerima 
        kiriman paket biner video stream dari Jetson Orin Nano di lab.
        """
        self.latest_frame = base64_image_data
        self.is_streaming = True

    def get_frame_bytes(self):
        """
        Menyediakan data frame terbaru untuk disiarkan ke Frontend React.
        Tetap mempertahankan nama fungsi lama agar tidak merusak sirkuit streaming FastAPI.
        """
        if self.latest_frame is None:
            # Mengembalikan None atau data gambar placeholder jika Jetson sedang offline
            return None
        return self.latest_frame

    def stop(self):
        """Menghentikan sirkuit buffer aliran video streaming."""
        self.latest_frame = None
        self.is_streaming = False
        print("[VPS CAMERA RELAY] Buffer video stream dibersihkan.")

# Instansiasi objek tunggal (Singleton) dengan nama variabel cam_driver
# Sesuai dengan alias yang dipakai di routers/hardware.py: `from ..hardware.camera_driver import cam_driver as camera_driver`
cam_driver = IMX477CameraVPSRelay()