import serial
import time
import threading

class GRBLMotorDriver:
    def __init__(self, port="/dev/ttyUSB0", baudrate=115200):
        self.port = port
        self.baudrate = baudrate
        self.serial_conn = None
        self.is_connected = False
        self.lock = threading.Lock() # Mencegah tabrakan data serial

    def connect(self):
        try:
            with self.lock:
                self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1)
                self.is_connected = True
                time.sleep(2)  # Tunggu inisialisasi GRBL selesai
                self.serial_conn.flushInput()
            print(f"[HARDWARE] Terhubung ke GRBL CNC pada {self.port}")
            return True
        except Exception as e:
            print(f"[HARDWARE ERROR] Gagal membuka port serial: {e}")
            self.is_connected = False
            return False

    def send_gcode(self, gcode_command: str) -> str:
        if not self.is_connected or not self.serial_conn:
            return "ERROR: Serial port tidak aktif"
        
        try:
            with self.lock:
                cmd = f"{gcode_command.strip()}\n"
                self.serial_conn.write(cmd.encode('utf-8'))
                response = self.serial_conn.readline().decode('utf-8').strip()
                return response
        except Exception as e:
            return f"ERROR: Transmisi G-Code gagal ({e})"

    def disconnect(self):
        with self.lock:
            if self.serial_conn and self.serial_conn.is_open:
                self.serial_conn.close()
            self.is_connected = False
            print("[HARDWARE] Koneksi serial GRBL ditutup.")

# Instansiasi objek driver secara global agar bisa dipakai di WebSocket router
motor_driver = GRBLMotorDriver(port="/dev/ttyUSB0")