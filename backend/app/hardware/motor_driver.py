import asyncio

import json



class GRBLMotorVPSRelay:

    def __init__(self):

        # Menyimpan referensi koneksi WebSocket aktif milik Jetson Orin Nano

        self.jetson_websocket = None 



    def register_jetson(self, websocket):

        """Mendaftarkan pipa WebSocket Jetson yang sedang aktif mengetuk VPS."""

        self.jetson_websocket = websocket

        print("[VPS MOTOR RELAY] Perangkat keras Jetson Orin Nano resmi terdaftar di sirkuit.")



    def unregister_jetson(self):

        self.jetson_websocket = None

        print("[VPS MOTOR RELAY] Pipa Jetson terputus. Sistem kembali siaga.")



    def send_gcode(self, gcode_command: str) -> str:

        """Meneruskan string instruksi G-Code dari D-Pad React langsung ke Jetson via jaringan."""

        clean_command = gcode_command.strip()

        if not clean_command:

            return "N/A"



        # Cek apakah Jetson Edge sedang daring dan terhubung ke VPS

        if self.jetson_websocket is None:

            print(f"[VPS WARNING] Perintah '{clean_command}' diabaikan. Jetson Orin Nano sedang LURING!")

            return "ERROR: Edge Device Offline"



        try:

            # Bungkus perintah menjadi format paket data JSON standar

            payload = {

                "action": "MOVE_MOTOR",

                "gcode": clean_command

            }

            

            # Tembak paket data menembus jaringan internet menuju Jetson Orin Nano secara asinkron

            # Karena send_gcode dipanggil di fungsi sinkron router, kita pemicu thread-safe loop

            loop = asyncio.get_event_loop()

            if loop.is_running():

                asyncio.run_coroutine_threadsafe(self.jetson_websocket.send(json.dumps(payload)), loop)

            

            print(f"[VPS RELAY SUCCESS] Instruksi '{clean_command}' berhasil dipancarkan ke Jetson.")

            return "ok" # Kembalikan sinyal 'ok' tiruan ke router agar frontend tidak gantung

            

        except Exception as e:

            print(f"[VPS RELAY ERROR] Gagal memantulkan data ke jaringan: {e}")

            return f"ERROR: {e}"



# Instansiasi objek tunggal (Singleton) tetap menggunakan nama variabel lama

# Langkah ini krusial agar file 'app/routers/hardware.py' TIDAK PERLU mengubah baris import-nya!

motor_driver = GRBLMotorVPSRelay()