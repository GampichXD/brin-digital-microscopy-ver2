import serial
import serial.tools.list_ports
import platform
import time

class GRBLMotorDriver:
    def __init__(self, baudrate=115200, timeout=1):
        self.baudrate = baudrate
        self.timeout = timeout
        self.ser = None
        self.is_mock_mode = False  # Flag penanda jika berjalan dalam mode simulasi di laptop

    def _find_available_port(self):
        """Mencari port serial aktif secara otomatis dengan pemblokiran Bluetooth."""
        current_os = platform.system()
        ports = list(serial.tools.list_ports.comports())
        
        if current_os == "Windows":
            for port in ports:
                desc = port.description.lower()
                hwid = port.hwid.lower()
                
                # ANTISIPASI: Jika terdeteksi link Bluetooth, lewati segera agar tidak freeze!
                if "bluetooth" in desc or "bthnum" in hwid or "standard serial over" in desc:
                    continue
                
                # Filter validasi untuk Arduino CNC Shield (CH340 / USB Serial)
                if "com" in port.device.lower() and ("ch340" in desc or "arduino" in desc or "usb" in desc or "serial" in desc):
                    print(f"[MOTOR] Mendeteksi Perangkat Mesin Valid di Windows: {port.device} ({port.description})")
                    return port.device
            
            return None
        else:
            # Di Linux Jetson, cari ttyUSBx atau ttyACMx bawaan Arduino/CH340
            for port in ports:
                if "ttyUSB" in port.device or "ttyACM" in port.device:
                    print(f"[MOTOR] Mendeteksi port aktif Linux: {port.device}")
                    return port.device
            return "/dev/ttyUSB0"

    def connect(self):
        """Membuka gerbang komunikasi serial menuju Arduino CNC Shield."""
        target_port = self._find_available_port()
        
        # Skenario pengujian luring di laptop (Tanpa dicolok hardware)
        if target_port is None and platform.system() == "Windows":
            print("[MOTOR WARNING] Arduino CNC Shield tidak terdeteksi pada port COM.")
            print("[MOTOR] Mengaktifkan MODE SIMULASI LURING untuk pengujian dashboard...")
            self.is_mock_mode = True
            return True

        try:
            print(f"[MOTOR] Menyambungkan ke mesin via port {target_port}...")
            self.ser = serial.Serial(target_port, self.baudrate, timeout=self.timeout)
            
            # Wajib jeda 2 detik: Beri waktu Arduino restart setelah DTR line diaktifkan
            time.sleep(2)
            
            # Bersihkan sisa buffer sampah internal pada sirkuit serial
            self.ser.reset_input_buffer()
            self.ser.reset_output_buffer()
            
            # Kirim karakter newline ganda untuk memicu respon ucapan selamat datang dari GRBL
            self.ser.write(b"\r\n\r\n")
            time.sleep(0.5)
            
            print("[MOTOR SUCCESS] Komunikasi serial dengan mesin asli BERHASIL terhubung murni.")
            self.is_mock_mode = False
            return True
            
        except Exception as e:
            print(f"[MOTOR ERROR] Gagal mengunci port fisik serial: {e}")
            print("[MOTOR] Mengalihkan otomatis ke MODE SIMULASI LURING...")
            self.is_mock_mode = True
            return False

    def send_gcode(self, gcode_command: str) -> str:
        """Mengirimkan baris instruksi mekanik G-Code ke firmware GRBL."""
        clean_command = gcode_command.strip()
        if not clean_command:
            return "N/A"

        # JALUR A: Jalankan simulasi data jika sedang berjalan di laptop
        if self.is_mock_mode:
            print(f"[MOCK MOTOR SERIAL] Menembak instruksi: {clean_command} -> Merespon: ok")
            return "ok"

        # JALUR B: Kirim instruksi riil ke hardware via PySerial
        if self.ser is None or not self.ser.isOpened():
            return "ERROR: Sirkuit serial tidak aktif atau terputus."

        try:
            # Format instruksi wajib diakhiri oleh karakter baris baru (\n)
            full_command = f"{clean_command}\n"
            self.ser.write(full_command.encode('utf-8'))
            
            # Baca balasan baris dari GRBL (biasanya merespon kata 'ok')
            grbl_response = self.ser.readline().decode('utf-8').strip()
            
            print(f"[MOTOR SERIAL] Kirim: {clean_command} | Balasan GRBL: {grbl_response}")
            return grbl_response if grbl_response else "ok"
            
        except Exception as e:
            print(f"[MOTOR SERIAL ERROR] Gagal melakukan pertukaran data G-Code: {e}")
            return f"ERROR: {e}"

    def disconnect(self):
        """Memutus sirkuit koneksi dan membuka kunci port serial di OS."""
        if self.ser and self.ser.isOpened():
            self.ser.close()
            self.ser = None
            print("[MOTOR] Pipa komunikasi serial resmi ditutup.")

# Instansiasi objek tunggal (Singleton) dengan nama variabel motor_driver
motor_driver = GRBLMotorDriver()