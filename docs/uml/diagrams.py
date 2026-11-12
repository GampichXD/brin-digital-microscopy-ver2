# Sumber Mermaid untuk artifact UML revisi. Satu sumber dipakai untuk gambar dan kotak salin.

USE_CASE = r'''flowchart LR
  Operator(["Operator"])
  Admin(["Admin"])
  Edge(["Edge Device (Jetson Orin Nano)"])
  Admin -. generalisasi .-> Operator

  subgraph SYS["Sistem Monitoring dan Kendali Mikroskop Digital «Subsistem Software-Hardware»"]
    UC1(["UC1 Login"])
    UC2(["UC2 Registrasi Operator"])
    UC3(["UC3 Ubah Password Sendiri"])
    UC4(["UC4 Pantau Streaming dan Telemetri"])
    UC5(["UC5 Kendali Motor Manual"])
    UC6(["UC6 Atur Parameter Kamera dan CNC"])
    UC7(["UC7 Rekam Video Mikroskop"])
    UC8(["UC8 Jalankan Grid Scan"])
    UC9(["UC9 Kelola Sesi Pemindaian"])
    UC10(["UC10 Gabungkan Citra (Stitching)"])
    UC11(["UC11 Jalankan Analisis Citra"])
    UC12(["UC12 Kelola Dataset"])
    UC13(["UC13 Kelola Isi Folder Dataset"])
    UC14(["UC14 Buat Laporan Otomatis"])
    UC15(["UC15 Lihat Log Aktivitas"])
    UC16(["UC16 Kelola Operator «Admin»"])
    UC17(["UC17 Kendali Hardware Bus «Admin»"])
    UC18(["UC18 Kelola Sesi Pengguna «Admin»"])
    UC19(["UC19 Kelola Penyimpanan dan Sinkronisasi «Admin»"])
    UC20(["UC20 Konfigurasi dan Pemeliharaan Edge «Admin»"])
    INC1{{"«include» Validasi Pilot (Concurrency Lock)"}}
    INC2{{"«include» Cek Hardware Bus (Fail-safe)"}}
    INC3{{"«include» Validasi Peran Admin"}}
  end

  Operator --> UC1
  Operator --> UC2
  Operator --> UC3
  Operator --> UC4
  Operator --> UC5
  Operator --> UC6
  Operator --> UC7
  Operator --> UC8
  Operator --> UC9
  Operator --> UC10
  Operator --> UC11
  Operator --> UC12
  Operator --> UC13
  Operator --> UC14
  Operator --> UC15
  Admin --> UC16
  Admin --> UC17
  Admin --> UC18
  Admin --> UC19
  Admin --> UC20

  UC5 -. include .-> INC1
  UC6 -. include .-> INC1
  UC7 -. include .-> INC1
  UC8 -. include .-> INC1
  UC9 -. include .-> INC1
  UC5 -. include .-> INC2
  UC6 -. include .-> INC2
  UC8 -. include .-> INC2
  UC10 -. include .-> INC2
  UC16 -. include .-> INC3
  UC17 -. include .-> INC3
  UC18 -. include .-> INC3
  UC19 -. include .-> INC3
  UC20 -. include .-> INC3

  Edge --- UC4
  Edge --- UC5
  Edge --- UC6
  Edge --- UC7
  Edge --- UC8
  Edge --- UC10
  Edge --- UC11
  Edge --- UC19
  Edge --- UC20'''

CLASS = r'''classDiagram
  class User {
    -int id
    -string username
    -string hashed_password
    -string role = "OPERATOR"
  }
  class DatasetFolder {
    -string id
    -string name
    -string object_type
    -string date
    -string operator
    -int image_count = 0
  }
  class SystemLog {
    -int id
    -string timestamp
    -string operator
    -string action
    -string status = "SUCCESS"
  }
  class SystemSetting {
    -string key
    -string value
  }
  class RoomManager {
    <<runtime>>
    -dict pilot
    -list spectators
    -list queue
    -Lock lock
    +get_state_payload()
    +broadcast_state()
    +get_user_connection_count(username)
    +connect(ws, username, role)
    +disconnect(ws)
    +takeover(ws)
    +admin_action(cid, action)
    +get_role(ws)
    +update_activity(ws, active)
    +idle_sweep(now)
    +idle_timeout_check()
  }
  class ClientOutbox {
    <<runtime>>
    -deque control
    -string video
    -Event wake
    +int sent_frames
    +int dropped_frames
    +put(text, is_video)
    +pending()
    +run()
  }
  class GRBLMotorVPSRelay {
    <<runtime>>
    -WebSocket jetson_websocket
    -dict last_edge_position
    +register_jetson(ws)
    +unregister_jetson()
  }
  class IMX477CameraVPSRelay {
    <<runtime>>
    -string latest_frame
    -bool is_streaming
    +update_frame(base64_data)
    +get_frame_bytes()
    +stop()
  }
  class AuthDeps {
    <<module deps.py>>
    +get_current_user(token)
    +require_admin(user)
    +get_media_user(token, bearer)
    +get_user_or_edge(x_edge_token, token, bearer)
    +edge_token_valid(token)
  }
  class HardwareRouter {
    <<module hardware.py>>
    +validate_client_command(data, ws_role, token_role, username, now)
    +check_motor_rate_limit(username, now, channel)
    +ensure_pilot(user)
    +ensure_cnc_online()
    +scan_grid(payload)
    +stitch_images(payload)
  }
  class ScanPlanner {
    <<module scan_planner.py>>
    +plan_serpentine(rows, cols, x0, y0, dx, dy)
    +compute_delay(distance, feed, delay_ms, row_change)
    +estimate_scan_seconds(...)
  }
  class SafePath {
    <<module safe_path.py>>
    +safe_join(base, parts)
    +safe_name(name)
  }

  User "1" --> "0..*" SystemLog : mencatat aktivitas
  User "1" --> "0..*" DatasetFolder : mengelola
  RoomManager "1" o-- "0..*" User : pilot / spectator / antrean
  RoomManager "1" --> "0..*" ClientOutbox : satu per koneksi browser
  AuthDeps ..> User : memuat dari token
  HardwareRouter ..> AuthDeps : get_current_user, require_admin
  HardwareRouter ..> RoomManager : membaca kursi
  HardwareRouter ..> GRBLMotorVPSRelay : status Jetson, posisi
  HardwareRouter ..> IMX477CameraVPSRelay : update_frame
  HardwareRouter ..> ScanPlanner : rencana grid scan
  HardwareRouter ..> SafePath : validasi nama file
  HardwareRouter ..> SystemSetting : save_setting'''

ERD = r'''erDiagram
  users {
    INTEGER id PK
    VARCHAR username UK
    VARCHAR hashed_password
    VARCHAR role
  }
  dataset_folders {
    VARCHAR id PK
    VARCHAR name UK
    VARCHAR object_type
    VARCHAR date
    VARCHAR operator "logis, bukan FK"
    INTEGER image_count
  }
  system_logs {
    INTEGER id PK
    VARCHAR timestamp
    VARCHAR operator "logis, bukan FK"
    VARCHAR action
    VARCHAR status
  }
  system_settings {
    VARCHAR key PK
    VARCHAR value
  }
  users ||..o{ dataset_folders : "operator (logis)"
  users ||..o{ system_logs : "operator (logis)"'''

# (no, nama, aktor, endpoint utama, ringkasan, activity, sequence)
UC = []

UC.append(dict(no=1, name="Login", actor="Operator, Admin",
 endpoints=["POST /api/auth/login", "WS /api/hardware/client/ws"],
 summary="Pengguna masuk dengan username dan password. Setelah token JWT diterima, browser langsung membuka WebSocket klien dan RoomManager menentukan kursinya: Pilot, Spectator, atau antrean.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Pengguna mengisi username dan password")
  A1 --> A2("Klik MASUK KE INSTRUMEN")
  A2 --> D0{"Form kosong?"}
  D0 -- ya --> A3("Tampilkan peringatan form kosong")
  A3 --> E1((("Selesai")))
  D0 -- tidak --> B1["Backend mencari user dan memverifikasi hash bcrypt"]
  B1 --> D1{"Kredensial valid?"}
  D1 -- tidak --> A4("Tampilkan pesan 401: ID atau password salah")
  A4 --> E1
  D1 -- ya --> B2["Catat login terakhir (presence dan SystemSetting)"]
  B2 --> B3["Terbitkan token JWT berisi username dan peran"]
  B3 --> A5("Browser menyimpan token dan peran")
  A5 --> A6("Browser membuka WebSocket klien dengan token")
  A6 --> B4["RoomManager menetapkan kursi: Pilot, Spectator, atau Antrean"]
  B4 --> A7("Tampilkan dashboard sesuai peran")
  A7 --> E2((("Selesai")))''',
 sequence=r'''sequenceDiagram
  actor P as Pengguna
  participant B as Browser (React)
  participant BE as Backend API
  participant D as PostgreSQL
  participant RM as RoomManager
  P->>B: isi username dan password, klik Masuk
  alt form kosong
    B-->>P: peringatan form kosong
  else form terisi
    B->>BE: POST /api/auth/login {username, password}
    BE->>D: SELECT user WHERE username
    D-->>BE: baris user
    Note over BE: verify_password (bcrypt)
    alt kredensial valid
      BE->>D: simpan lastlogin:username di system_settings
      Note over BE: create_access_token(sub, role)
      BE-->>B: 200 {access_token, role}
      B->>BE: WS /api/hardware/client/ws?token=JWT
      BE->>RM: connect(ws, username, role)
      RM-->>B: ROLE_ASSIGNED {PILOT, SPECTATOR, atau QUEUED}
      RM-->>B: ROOM_STATE_UPDATE
      B-->>P: tampilkan dashboard
    else kredensial salah
      BE-->>B: 401 ID Operator atau Password salah
      B-->>P: tampilkan pesan error
    end
  end'''))

UC.append(dict(no=2, name="Registrasi Operator", actor="Calon Operator",
 endpoints=["POST /api/auth/register"],
 summary="Siapa pun dapat mendaftar, tetapi akun baru selalu berperan Operator. Akun Admin hanya dibuat dari server (create_admin.py) atau dipromosikan oleh Admin lain.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Klik REGISTER")
  A1 --> A2("Isi username, password, dan ulangi password")
  A2 --> A3("Klik DAFTARKAN OPERATOR")
  A3 --> D1{"Konfirmasi password cocok?"}
  D1 -- tidak --> A4("Tampilkan peringatan konfirmasi tidak cocok")
  A4 --> E1((("Selesai")))
  D1 -- ya --> B1["Backend memeriksa username"]
  B1 --> D2{"Username sudah terdaftar?"}
  D2 -- ya --> A5("Tampilkan pesan 400: sudah terdaftar")
  A5 --> E1
  D2 -- tidak --> B2["Hash password dengan bcrypt"]
  B2 --> B3["Simpan user baru dengan peran OPERATOR"]
  B3 --> A6("Tampilkan registrasi sukses dan kembali ke form login")
  A6 --> E2((("Selesai")))''',
 sequence=r'''sequenceDiagram
  actor P as Calon Operator
  participant B as Browser (React)
  participant BE as Backend API
  participant D as PostgreSQL
  P->>B: isi form registrasi, klik Daftarkan
  alt konfirmasi password tidak cocok
    B-->>P: peringatan konfirmasi tidak cocok
  else cocok
    B->>BE: POST /api/auth/register {username, password}
    BE->>D: SELECT user WHERE username
    alt username sudah ada
      BE-->>B: 400 Username sudah terdaftar
      B-->>P: tampilkan pesan error
    else username baru
      Note over BE: hash_password (bcrypt), role = OPERATOR
      BE->>D: INSERT users
      BE-->>B: 201 Registrasi sukses sebagai OPERATOR
      B-->>P: kembali ke form login
    end
  end'''))

UC.append(dict(no=3, name="Ubah Password Sendiri", actor="Operator, Admin",
 endpoints=["PUT /api/auth/profile/password"],
 summary="Pengguna yang sudah login mengganti password akunnya sendiri. Username diambil dari token, bukan dari isi form, sehingga seseorang tidak bisa mengganti password akun lain.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Buka Profil Akun")
  A1 --> A2("Isi password lama, password baru, dan ulangi password baru")
  A2 --> D1{"Password baru cocok dan minimal 6 karakter?"}
  D1 -- tidak --> A3("Tampilkan peringatan validasi")
  A3 --> E1((("Selesai")))
  D1 -- ya --> B1["Backend memvalidasi token JWT dan memuat user dari token"]
  B1 --> D2{"Password lama benar?"}
  D2 -- tidak --> A4("Tampilkan pesan 401: password lama salah")
  A4 --> E1
  D2 -- ya --> B2["Hash password baru dan simpan"]
  B2 --> A5("Tampilkan: password berhasil diubah")
  A5 --> E2((("Selesai")))''',
 sequence=r'''sequenceDiagram
  actor P as Pengguna
  participant B as Browser (React)
  participant BE as Backend API
  participant D as PostgreSQL
  P->>B: isi password lama dan baru, klik Simpan
  B->>BE: PUT /api/auth/profile/password (Bearer JWT)
  Note over BE: get_current_user: decode JWT, muat user
  BE->>D: SELECT user WHERE id dari token
  alt password lama salah
    BE-->>B: 401 Password lama salah
    B-->>P: tampilkan pesan error
  else benar
    BE->>D: UPDATE users SET hashed_password
    BE-->>B: 200 Password berhasil diperbarui
    B-->>P: tampilkan konfirmasi
  end'''))

UC.append(dict(no=4, name="Pantau Streaming dan Telemetri", actor="Operator, Admin, Edge Device",
 endpoints=["WS /api/hardware/client/ws", "WS /api/hardware/ws", "GET /api/hardware/telemetry/stats"],
 summary="Jetson mengirim video dan telemetri lewat WebSocket Edge yang diautentikasi device token. Backend meneruskannya ke setiap browser lewat Redis dan ClientOutbox: telemetri dikirim semua, video hanya frame terbaru supaya browser lambat tidak tertinggal.",
 activity=r'''flowchart TD
  S(("Mulai")) --> C1[["Jetson membuka WebSocket Edge dengan device token"]]
  C1 --> D0{"Device token valid?"}
  D0 -- tidak --> B0["Backend menutup koneksi dengan kode 4003"]
  B0 --> E0((("Selesai")))
  D0 -- ya --> B1["Backend mendaftarkan Jetson dan mulai mengirim PING tiap 1 detik"]
  B1 --> A1("Pengguna membuka dashboard, browser tersambung WebSocket klien")
  A1 --> D1{"Kursi pengguna QUEUED?"}
  D1 -- ya --> B2["Kirim telemetri saja, video tidak dikirim"]
  D1 -- tidak --> A2("Browser mengirim START_STREAM")
  A2 --> C2[["Jetson mengirim STREAM_DATA dan TELEMETRY_DATA"]]
  C2 --> B3["Backend menerbitkan ke Redis microscope_video_stream dan microscope_telemetry"]
  B3 --> B4["ClientOutbox per browser: telemetri antre, video simpan frame terbaru saja"]
  B2 --> A3("Tampilkan posisi XYZ, status GRBL, suhu, dan status kamera")
  B4 --> A3
  B4 --> A4("Tampilkan video langsung")
  A3 --> A5("Browser mengirim HEARTBEAT tiap 20 detik")
  A4 --> A5
  A5 --> D2{"Pengguna menutup halaman atau tidak ada heartbeat 90 detik?"}
  D2 -- tidak --> C2
  D2 -- ya --> B5["RoomManager melepas kursi dan mengisi kekosongan"]
  B5 --> E1((("Selesai")))''',
 sequence=r'''sequenceDiagram
  actor P as Pengguna
  participant B as Browser (React)
  participant BE as Backend (WS klien)
  participant O as ClientOutbox
  participant R as Redis
  participant WE as Backend (WS Edge)
  participant J as Jetson (vps_bridge)
  J->>WE: WS /api/hardware/ws?device_token
  alt token salah
    WE-->>J: close 4003
  else token benar
    WE->>WE: register_jetson
    loop tiap 1 detik
      WE->>J: PING (untuk watchdog Jetson)
    end
  end
  P->>B: buka dashboard
  B->>BE: WS /api/hardware/client/ws?token=JWT
  BE-->>B: ROLE_ASSIGNED
  B->>BE: START_STREAM
  BE->>R: publish hardware_commands
  R->>WE: START_STREAM
  WE->>J: START_STREAM
  loop selama streaming
    J->>WE: STREAM_DATA {frame base64, t_cap}
    WE->>R: publish microscope_video_stream
    J->>WE: TELEMETRY_DATA {posisi, status, suhu, camera_status}
    WE->>R: publish microscope_telemetry
    R->>BE: pesan video dan telemetri
    BE->>O: put(pesan, is_video)
    Note over O: video lama yang belum terkirim diganti frame terbaru
    O-->>B: telemetri (semua) dan frame video terbaru
    B-->>P: video dan panel telemetri
  end
  loop tiap 20 detik
    B->>BE: HEARTBEAT
  end'''))

UC.append(dict(no=5, name="Kendali Motor Manual", actor="Operator (Pilot), Edge Device",
 endpoints=["WS MOVE_MOTOR / HOMING / UNLOCK", "POST /api/hardware/motor/move", "POST /api/hardware/motor/home", "POST /api/hardware/motor/unlock"],
 summary="Pilot menggerakkan meja X/Y dan fokus Z lewat D-Pad, Go-To Coordinate, Home, atau Unlock. Setiap perintah melewati guard di server. Jetson memotong gerak di luar soft limit dan menahan motor (feed hold) bila PING dari server berhenti lebih dari 3 detik.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Pilot menekan D-Pad, Go-To, Home, atau Unlock")
  A1 --> B1["Backend menerima perintah lewat WebSocket"]
  B1 --> D1{"Pengguna Pilot atau Admin?"}
  D1 -- tidak --> R1("COMMAND_REJECTED: NOT_PILOT")
  D1 -- ya --> D2{"Hardware bus aktif?"}
  D2 -- tidak --> R2("COMMAND_REJECTED: BUS_DISABLED")
  D2 -- ya --> D3{"G-code sesuai pola yang diizinkan?"}
  D3 -- tidak --> R3("COMMAND_REJECTED: INVALID_GCODE")
  D3 -- ya --> D4{"Jeda sejak perintah gerak terakhir cukup?"}
  D4 -- tidak --> R4("COMMAND_REJECTED: RATE_LIMIT")
  D4 -- ya --> D5{"CNC tersambung ke Jetson?"}
  D5 -- tidak --> R5("COMMAND_REJECTED: CNC_OFFLINE")
  D5 -- ya --> B2["Terbitkan perintah ke Redis hardware_commands"]
  B2 --> C1[["Jetson memotong target sesuai soft limit"]]
  C1 --> C2[["Jetson mengirim G-code ke GRBL lewat serial"]]
  C2 --> C3[["Motor bergerak, posisi baru dikirim lewat telemetri"]]
  C3 --> A2("Posisi XYZ di dashboard diperbarui")
  R1 --> A3("Tampilkan notifikasi penolakan")
  R2 --> A3
  R3 --> A3
  R4 --> A3
  R5 --> A3
  A2 --> E1((("Selesai")))
  A3 --> E1''',
 sequence=r'''sequenceDiagram
  actor P as Pilot
  participant B as Browser (React)
  participant BE as Backend API
  participant G as CommandGuard
  participant R as Redis
  participant J as Jetson
  participant M as GRBL
  P->>B: tekan D-Pad atau Go-To
  B->>BE: WS {action: MOVE_MOTOR, gcode: G1 X0.5 F250, cmd_id}
  BE->>G: validate_client_command(data, kursi, peran, username)
  alt ditolak (NOT_PILOT, BUS_DISABLED, INVALID_GCODE, RATE_LIMIT, CNC_OFFLINE)
    G-->>BE: alasan
    BE-->>B: COMMAND_REJECTED {reason, cmd_id}
    B-->>P: notifikasi penolakan
  else lolos
    BE->>R: publish hardware_commands
    R->>J: MOVE_MOTOR
    Note over J: clamp ke soft limit
    J->>M: G1 X.. Y.. F..
    M-->>J: ok
    J-->>BE: TELEMETRY_DATA {posisi baru}
    BE-->>B: telemetri lewat ClientOutbox
    B-->>P: posisi diperbarui
  end
  opt jalur REST (Home, Unlock, atau tombol gerak)
    B->>BE: POST /api/hardware/motor/home (Bearer JWT)
    Note over BE: cek bus, ensure_pilot, ensure_cnc_online
    BE->>R: publish HOMING
    BE-->>B: 200 SUCCESS (atau 403, 409, 429, 503)
  end
  opt koneksi VPS putus lebih dari 3 detik
    Note over J: watchdog: tidak ada PING
    J->>M: feed hold (!)
  end'''))

UC.append(dict(no=6, name="Atur Parameter Kamera dan CNC", actor="Operator (Pilot), Admin, Edge Device",
 endpoints=["POST /api/hardware/camera/settings", "POST /api/hardware/cnc/settings", "WS SET_FPS"],
 summary="Pilot mengatur shutter, ISO, dan FPS kamera. Setelan CNC (feed rate, backlash, akselerasi, waktu tunggu) hanya untuk Admin; bagi Operator tombolnya nonaktif dan server menjawab 403. Nilai disimpan di system_settings lalu diteruskan ke Jetson.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Buka panel Live Stream")
  A1 --> D0{"Yang diatur?"}
  D0 -- kamera --> A2("Pilot mengubah shutter, ISO, atau FPS lalu klik TERAPKAN")
  A2 --> D1{"Hardware bus aktif dan pengguna Pilot?"}
  D1 -- tidak --> A3("Tampilkan penolakan 403 atau 503")
  D1 -- ya --> B1["Simpan exposure dan shutter_speed di system_settings"]
  B1 --> B2["Terbitkan APPLY_CAMERA_SETTINGS ke Redis"]
  B2 --> C1[["Jetson menerapkan setelan ke sensor IMX477"]]
  D0 -- CNC --> D2{"Pengguna Admin?"}
  D2 -- tidak --> A4("Tombol CNC nonaktif: hanya untuk Admin")
  D2 -- ya --> A5("Admin mengubah feed rate, backlash, akselerasi, waktu tunggu lalu klik TERAPKAN")
  A5 --> B3["Simpan nilai CNC di system_settings"]
  B3 --> B4["Terbitkan APPLY_CNC_SETTINGS ke Redis"]
  B4 --> C2[["Jetson menulis parameter ke GRBL"]]
  C1 --> A6("Tampilkan setelan diterapkan")
  C2 --> A6
  A3 --> E1((("Selesai")))
  A4 --> E1
  A6 --> E1''',
 sequence=r'''sequenceDiagram
  actor P as Pilot / Admin
  participant B as Browser (React)
  participant BE as Backend API
  participant D as PostgreSQL
  participant R as Redis
  participant J as Jetson
  alt setelan kamera
    P->>B: ubah shutter dan ISO, klik Terapkan
    B->>BE: POST /api/hardware/camera/settings (Bearer JWT)
    Note over BE: cek bus, ensure_pilot
    BE->>D: save_setting exposure, shutter_speed
    BE->>R: publish APPLY_CAMERA_SETTINGS
    R->>J: APPLY_CAMERA_SETTINGS
    BE-->>B: 200 Pengaturan kamera disimpan
  else setelan CNC
    P->>B: ubah feed rate dan backlash, klik Terapkan
    B->>BE: POST /api/hardware/cnc/settings (Bearer JWT)
    Note over BE: require_admin
    alt bukan Admin
      BE-->>B: 403 Hanya untuk Admin
    else Admin
      BE->>D: save_setting feedRate, backlash, acceleration, settle_time
      BE->>R: publish APPLY_CNC_SETTINGS
      R->>J: APPLY_CNC_SETTINGS
      J->>J: tulis parameter GRBL
      BE-->>B: 200 Pengaturan CNC disimpan
    end
  end
  opt ubah FPS stream
    B->>BE: WS {action: SET_FPS, fps}
    BE->>R: publish SET_FPS (jika Pilot dan 1-120)
  end
  B-->>P: tampilkan hasil'''))

UC.append(dict(no=7, name="Rekam Video Mikroskop", actor="Operator (Pilot), Edge Device",
 endpoints=["WS START_RECORDING / STOP_RECORDING", "GET /api/dataset/video/{folder_id}/{filename}"],
 summary="Pilot merekam video ke sebuah folder dataset. Jetson merekam MJPG sementara, mengubahnya ke H.264 MP4 agar bisa diputar di browser, lalu vps_syncer mengunggahnya ke VPS. Video diputar lewat endpoint streaming yang mendukung Range.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Pilot memilih folder tujuan dan klik Rekam")
  A1 --> D1{"Pengguna Pilot atau Admin?"}
  D1 -- tidak --> A2("COMMAND_REJECTED: NOT_PILOT")
  A2 --> E1((("Selesai")))
  D1 -- ya --> B1["Backend meneruskan START_RECORDING ke Redis"]
  B1 --> C1[["Jetson mulai menulis frame ke berkas MJPG sementara"]]
  C1 --> A3("Pilot klik Berhenti")
  A3 --> B2["Backend meneruskan STOP_RECORDING"]
  B2 --> C2[["Jetson menutup berkas dan mengonversi ke H.264 MP4 di latar belakang"]]
  C2 --> D2{"Konversi berhasil?"}
  D2 -- tidak --> C3[["Simpan berkas sementara apa adanya dan catat galat"]]
  D2 -- ya --> C4[["Simpan video_tanggal.mp4 di local_datasets/folder"]]
  C4 --> C5[["vps_syncer mengunggah video ke VPS dengan token Edge"]]
  C5 --> A4("Video tampil di folder dataset")
  A4 --> A5("Pengguna memutar video lewat endpoint streaming")
  C3 --> E2((("Selesai")))
  A5 --> E2''',
 sequence=r'''sequenceDiagram
  actor P as Pilot
  participant B as Browser (React)
  participant BE as Backend API
  participant R as Redis
  participant J as Jetson
  participant S as vps_syncer (Jetson)
  P->>B: pilih folder, klik Rekam
  B->>BE: WS {action: START_RECORDING, folder_id}
  Note over BE: validate_client_command (Pilot saja)
  BE->>R: publish START_RECORDING
  R->>J: START_RECORDING
  J->>J: tulis frame ke _temp_video.avi (MJPG)
  P->>B: klik Berhenti
  B->>BE: WS {action: STOP_RECORDING}
  BE->>R: publish STOP_RECORDING
  R->>J: STOP_RECORDING
  J->>J: transcode H.264 (x264, faststart) ke video.mp4
  loop tiap 10 detik
    S->>BE: GET /api/dataset/vps/sync-index (X-Edge-Token)
    BE-->>S: daftar file di VPS
    S->>BE: POST /api/dataset/folders/{id}/files video.mp4 (X-Edge-Token)
    BE-->>S: 200 tersimpan
  end
  P->>B: buka video di folder dataset
  B->>BE: GET /api/dataset/video/{id}/video.mp4?token=JWT (Range)
  BE-->>B: 206 Partial Content
  B-->>P: video diputar'''))

UC.append(dict(no=8, name="Jalankan Grid Scan", actor="Operator (Pilot), Edge Device",
 endpoints=["POST /api/hardware/scan/grid", "WS microscope_scan_progress"],
 summary="Pilot memasukkan jumlah kolom, baris, langkah X/Y, dan jeda. Server merencanakan lintasan serpentine dari posisi motor saat ini, lalu memotret tiap titik di latar belakang. Progres dikirim per tile dengan jumlah berhasil dan gagal. Bila tidak ada gambar yang terambil, aplikasi menampilkan kegagalan, bukan keberhasilan.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Pilot mengisi kolom, baris, langkah, dan jeda lalu klik CAPTURE")
  A1 --> D1{"Hardware bus aktif, Pilot, tidak ada scan berjalan?"}
  D1 -- tidak --> A2("Tampilkan penolakan 503, 403, atau 409")
  A2 --> E1((("Selesai")))
  D1 -- ya --> B1["Ambil posisi motor terakhir dari telemetri sebagai titik awal"]
  B1 --> B2["Rencanakan lintasan serpentine dan hitung jeda tiap titik"]
  B2 --> B3["Mulai task latar belakang, balas STARTED beserta ID sesi"]
  B3 --> L1["Gerakkan motor ke titik berikutnya"]
  L1 --> C1[["Jetson memotret tile dan mengirim IMAGE_CAPTURED"]]
  C1 --> D2{"Gambar tiba sebelum batas waktu?"}
  D2 -- ya --> B4["Tambah hitungan berhasil"]
  D2 -- tidak --> B5["Tambah hitungan gagal, tile bisa di-retake"]
  B4 --> B6["Kirim SCAN_PROGRESS: tile ke-n, berhasil, gagal"]
  B5 --> B6
  B6 --> D3{"Dibatalkan atau semua titik selesai?"}
  D3 -- lanjut --> L1
  D3 -- selesai --> B7["Kirim SCAN_COMPLETE beserta daftar gambar"]
  B7 --> D4{"Jumlah gambar berhasil?"}
  D4 -- nol --> A3("Tampilkan error: tidak ada gambar yang berhasil diambil")
  D4 -- sebagian --> A4("Tampilkan peringatan: X dari N berhasil")
  D4 -- semua --> A5("Tampilkan: pemindaian grid berhasil")
  A3 --> A6("Tampilkan hasil tangkapan untuk ditinjau")
  A4 --> A6
  A5 --> A6
  A6 --> E2((("Selesai")))''',
 sequence=r'''sequenceDiagram
  actor P as Pilot
  participant B as Browser (React)
  participant BE as Backend API
  participant SP as ScanPlanner
  participant R as Redis
  participant J as Jetson
  participant M as GRBL dan Kamera
  P->>B: isi parameter grid, klik CAPTURE
  B->>BE: POST /api/hardware/scan/grid {columns, rows, step_x, step_y, delay_ms}
  Note over BE: cek bus, ensure_pilot, tidak ada scan berjalan, ensure_cnc_online
  BE->>SP: plan_serpentine(rows, cols, posisi saat ini, step)
  SP-->>BE: daftar titik
  BE-->>B: 200 {status: STARTED, session, images terencana}
  loop setiap titik
    BE->>R: publish MOVE_MOTOR G1 X.. Y..
    R->>J: MOVE_MOTOR
    J->>M: gerak motor
    Note over BE: tunggu compute_delay(jarak, feed, delay)
    BE->>R: publish CAPTURE_IMAGE {filename, session, grid_x, grid_y}
    R->>J: CAPTURE_IMAGE
    J->>M: ambil gambar
    J-->>BE: IMAGE_CAPTURED {filename, image_data}
    BE->>BE: simpan ke static/uploads
    BE->>R: publish SCAN_PROGRESS {index, total, ok, captured, failed}
    R-->>B: SCAN_PROGRESS
    B-->>P: overlay progres dan hitungan berhasil/gagal
  end
  BE->>R: publish SCAN_COMPLETE {images, session}
  R-->>B: SCAN_COMPLETE
  alt 0 gambar berhasil
    B-->>P: error: tidak ada gambar yang berhasil diambil
  else sebagian gagal
    B-->>P: peringatan X dari N berhasil
  else semua berhasil
    B-->>P: pemindaian grid berhasil
  end'''))

UC.append(dict(no=9, name="Kelola Sesi Pemindaian", actor="Operator (Pilot)",
 endpoints=["GET /api/hardware/scan/status", "POST /api/hardware/scan/cancel", "POST /api/hardware/scan/retake", "DELETE /api/hardware/scan/session/{session_id}"],
 summary="Selama dan sesudah scan, Pilot dapat memantau progres (termasuk setelah halaman dimuat ulang), membatalkan scan dengan gambar yang sudah terambil tetap disimpan, mengambil ulang tile yang gagal, atau menghapus berkas kerja satu sesi di VPS dan Jetson.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A0("Halaman dibuka atau dimuat ulang")
  A0 --> B0["Browser memanggil scan/status untuk memulihkan progres"]
  B0 --> D0{"Aksi pengguna?"}
  D0 -- batalkan --> A1("Klik BATAL saat scan berjalan")
  A1 --> B1["Set penanda batal, loop berhenti di tile berikutnya"]
  B1 --> B2["Kirim SCAN_CANCELLED, gambar yang sudah terambil tetap ada"]
  B2 --> A2("Tampilkan: pemindaian dibatalkan, n gambar terambil")
  D0 -- retake --> A3("Klik retake pada tile yang gagal")
  A3 --> D1{"Pilot dan Jetson online?"}
  D1 -- tidak --> A4("Tampilkan 403 atau 504")
  D1 -- ya --> C1[["Motor ke koordinat tile lalu Jetson memotret ulang"]]
  C1 --> D2{"Gambar baru tiba sebelum batas waktu?"}
  D2 -- ya --> A5("Ganti tile di hasil tangkapan")
  D2 -- tidak --> A4
  D0 -- hapus sesi --> A6("Klik Hapus Hasil Sesi Ini")
  A6 --> D3{"Sesi masih berjalan?"}
  D3 -- ya --> A7("Tampilkan 409: batalkan scan dulu")
  D3 -- tidak --> B3["Hapus IMG_sesi_* di VPS"]
  B3 --> C2[["Jetson menghapus folder kerja sesi (PURGE_SESSION)"]]
  C2 --> A8("Hasil sesi dikosongkan, dataset tersimpan tidak terpengaruh")
  A2 --> E1((("Selesai")))
  A4 --> E1
  A5 --> E1
  A7 --> E1
  A8 --> E1''',
 sequence=r'''sequenceDiagram
  actor P as Pilot
  participant B as Browser (React)
  participant BE as Backend API
  participant R as Redis
  participant J as Jetson
  B->>BE: GET /api/hardware/scan/status
  BE-->>B: {running, index, total, captured, failed, images, session}
  alt batalkan
    P->>B: klik BATAL
    B->>BE: POST /api/hardware/scan/cancel
    BE-->>B: {status: CANCELLING}
    BE->>R: publish SCAN_CANCELLED {images}
    R-->>B: SCAN_CANCELLED
    B-->>P: dibatalkan, n gambar terambil
  else retake tile
    P->>B: klik retake tile r,c
    B->>BE: POST /api/hardware/scan/retake {coord_x, coord_y, filename, session}
    BE->>R: publish MOVE_MOTOR (relatif ke posisi terakhir)
    BE->>R: publish CAPTURE_IMAGE
    R->>J: CAPTURE_IMAGE
    J-->>BE: IMAGE_CAPTURED
    alt gambar baru tiba
      BE-->>B: 200 {filename}
    else habis waktu
      BE-->>B: 504 Edge tidak merespons
    end
  else hapus hasil sesi
    P->>B: klik Hapus Hasil Sesi Ini
    B->>BE: DELETE /api/hardware/scan/session/{session_id}
    alt sesi masih berjalan
      BE-->>B: 409 batalkan scan dulu
    else
      BE->>BE: hapus IMG_session_r*_c*.jpg
      BE->>R: publish PURGE_SESSION
      R->>J: PURGE_SESSION
      BE-->>B: 200 {deleted}
    end
  end'''))

UC.append(dict(no=10, name="Gabungkan Citra (Stitching)", actor="Operator, Edge Device",
 endpoints=["POST /api/hardware/stitch", "GET /api/hardware/stitch/status", "POST /api/hardware/stitch/place", "POST /api/hardware/stitch/place-from-dataset", "POST /api/hardware/stitch/place-folder"],
 summary="Tile hasil grid scan, atau tile yang disusun manual dari unggahan dan dataset (mode Input Images), digabung menjadi satu mosaik oleh Jetson memakai SuperPoint-LightGlue. Proses berjalan asinkron dan progresnya dapat dipulihkan setelah halaman dimuat ulang.",
 activity=r'''flowchart TD
  S(("Mulai")) --> D0{"Sumber tile?"}
  D0 -- hasil grid scan --> A1("Pilih hasil tangkapan grid scan")
  D0 -- input images --> A2("Isi sel grid dari unggahan, gambar dataset, atau satu folder")
  A2 --> B0["Backend menyalin tiap gambar ke uploads dengan nama sesuai posisi grid"]
  A1 --> D1{"Ada minimal satu tile valid?"}
  B0 --> D1
  D1 -- tidak --> A3("Tombol TILE STITCHING nonaktif")
  A3 --> E1((("Selesai")))
  D1 -- ya --> A4("Pilih metode stitching lalu klik TILE STITCHING")
  A4 --> D2{"Hardware bus aktif?"}
  D2 -- tidak --> A5("Tampilkan 503")
  A5 --> E1
  D2 -- ya --> B1["Validasi nama file, reset status stitching, terbitkan START_STITCHING"]
  B1 --> C1[["Jetson menjalankan SuperPoint-LightGlue dan mengirim STITCH_PROGRESS"]]
  C1 --> D3{"Berhasil?"}
  D3 -- tidak --> B2["Status gagal, kirim STITCH_FAILED"]
  B2 --> A6("Tampilkan pesan gagal")
  D3 -- ya --> C2[["Jetson mengirim STITCHING_COMPLETE beserta mosaik"]]
  C2 --> B3["Simpan stitched_ta_output.jpg, kirim STITCH_COMPLETE"]
  B3 --> A7("Tampilkan pratinjau mosaik penuh dan opsi simpan ke dataset")
  A6 --> E2((("Selesai")))
  A7 --> E2''',
 sequence=r'''sequenceDiagram
  actor P as Operator
  participant B as Browser (React)
  participant BE as Backend API
  participant R as Redis
  participant J as Jetson (SP-LightGlue)
  opt mode Input Images
    P->>B: isi sel grid
    B->>BE: POST /api/hardware/stitch/place (file, grid_x, grid_y)
    B->>BE: POST /api/hardware/stitch/place-from-dataset {folder_id, image_name, grid_x, grid_y}
    B->>BE: POST /api/hardware/stitch/place-folder {folder_id, rows, columns, order}
    BE-->>B: nama file sesuai posisi grid
  end
  P->>B: pilih metode, klik TILE STITCHING
  B->>BE: POST /api/hardware/stitch {tiles, model, session}
  Note over BE: cek bus, safe_name tiap file, _stitch_reset
  BE->>R: publish START_STITCHING
  BE-->>B: 200 {status: STARTED}
  R->>J: START_STITCHING
  loop selama proses
    J-->>BE: STITCH_PROGRESS {pct, phase}
    BE->>R: publish microscope_scan_progress
    R-->>B: STITCH_PROGRESS
    B-->>P: progres persen
  end
  alt berhasil
    J-->>BE: STITCHING_COMPLETE {image_data}
    BE->>BE: simpan stitched_ta_output.jpg
    BE->>R: publish STITCH_COMPLETE
    R-->>B: STITCH_COMPLETE
    B-->>P: pratinjau mosaik penuh
  else gagal
    J-->>BE: STITCHING_FAILED {detail}
    BE->>R: publish STITCH_FAILED
    R-->>B: STITCH_FAILED
    B-->>P: pesan gagal
  end
  opt halaman dimuat ulang
    B->>BE: GET /api/hardware/stitch/status
    BE-->>B: {running, pct, phase, done, error}
  end'''))

UC.append(dict(no=11, name="Jalankan Analisis Citra", actor="Operator, Edge Device",
 endpoints=["POST /api/analysis/upload", "POST /api/analysis/{tool_name}", "GET /api/analysis/status"],
 summary="Pengguna mengunggah citra atau memilih dari dataset, lalu menjalankan alat analisis (colony-count, adaptive-thresh, contour, morphology, sobel, roi, calibrate, color-split). Pemrosesan dikirim ke Jetson. Bila Jetson offline, server memakai OpenCV sebagai cadangan. Hasil diambil dengan polling status.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Unggah citra atau pilih dari dataset")
  A1 --> B1["Simpan citra di uploads dengan nama aman"]
  B1 --> A2("Pilih alat analisis")
  A2 --> D1{"Alat dikenal?"}
  D1 -- tidak --> A3("Tampilkan 400: metode tidak dikenali")
  A3 --> E1((("Selesai")))
  D1 -- ya --> D2{"Jetson online?"}
  D2 -- ya --> B2["Kirim perintah CV ke Jetson beserta citra base64"]
  B2 --> C1[["Jetson memproses (colony count memakai YOLO TensorRT di subprocess)"]]
  C1 --> C2[["Jetson mengirim CV_RESULT atau CV_FAILED"]]
  D2 -- tidak --> B3["Proses di server dengan OpenCV (cadangan)"]
  C2 --> B4["Simpan hasil dan berkas ringkasan .json"]
  B3 --> B4
  B4 --> A4("Browser memanggil status sampai selesai")
  A4 --> D3{"Berhasil?"}
  D3 -- ya --> A5("Tampilkan citra hasil, jumlah koloni, atau statistik")
  D3 -- tidak --> A6("Tampilkan pesan gagal")
  A5 --> E2((("Selesai")))
  A6 --> E2''',
 sequence=r'''sequenceDiagram
  actor P as Operator
  participant B as Browser (React)
  participant BE as Backend API
  participant R as Redis
  participant J as Jetson
  participant CV as OpenCV server (cadangan)
  P->>B: unggah citra
  B->>BE: POST /api/analysis/upload (file)
  BE-->>B: {filename, url}
  P->>B: pilih alat, mis. colony-count
  B->>BE: POST /api/analysis/{tool_name} {filename, current_src, params}
  alt alat tidak dikenal
    BE-->>B: 400 Metode tidak dikenali
  else Jetson online
    BE->>R: publish CV_COLONY_COUNT {image_b64, output_name, params}
    BE-->>B: {status: STARTED, output, processed_by: edge}
    R->>J: perintah CV
    J-->>BE: CV_RESULT {image_data, colonies atau stats}
    BE->>BE: simpan hasil dan sidecar .json
  else Jetson offline
    BE->>CV: proses lokal di latar belakang
    BE-->>B: {status: STARTED, processed_by: server}
  end
  loop sampai selesai
    B->>BE: GET /api/analysis/status?output
    BE-->>B: {done, url, colonies, stats} atau {error}
  end
  B-->>P: tampilkan hasil analisis'''))

UC.append(dict(no=12, name="Kelola Dataset", actor="Operator",
 endpoints=["POST /api/dataset/folders", "GET /api/dataset/folders", "DELETE /api/dataset/folders/{folder_id}", "POST /api/dataset/folders/{folder_id}/files", "PUT /api/dataset/folders/{folder_id}/add-images"],
 summary="Pengguna membuat folder dataset (nama unik, jenis objek, operator), mengunggah gambar, menyimpan hasil scan atau analisis ke folder, dan menghapus folder. Menghapus folder juga meminta Jetson menghapus salinan lokalnya.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Buka tab Database")
  A1 --> B1["Tampilkan daftar folder dataset"]
  B1 --> D0{"Aksi?"}
  D0 -- buat folder --> A2("Klik BUAT BARU, isi nama, jenis objek, operator, klik SIMPAN")
  A2 --> D1{"Nama folder sudah dipakai?"}
  D1 -- ya --> A3("Tampilkan 400: nama sudah digunakan")
  D1 -- tidak --> B2["Buat ID folder dan direktori, simpan metadata"]
  B2 --> A4("Folder baru muncul di daftar")
  D0 -- unggah gambar --> A5("Pilih berkas lalu unggah")
  A5 --> D2{"Nama berkas aman?"}
  D2 -- tidak --> A6("Tampilkan 400: nama berkas tidak sah")
  D2 -- ya --> B3["Simpan berkas, tandai .synced, tambah image_count"]
  D0 -- simpan hasil scan --> A7("Pilih folder tujuan untuk hasil grid scan")
  A7 --> B4["Salin gambar dari uploads, tambah image_count"]
  D0 -- hapus folder --> A8("Klik hapus dan konfirmasi")
  A8 --> B5["Hapus direktori dan metadata"]
  B5 --> C1[["Jetson menghapus salinan lokal (PURGE_DATASET_FOLDER)"]]
  A3 --> E1((("Selesai")))
  A4 --> E1
  A6 --> E1
  B3 --> E1
  B4 --> E1
  C1 --> E1''',
 sequence=r'''sequenceDiagram
  actor P as Operator
  participant B as Browser (React)
  participant BE as Backend API
  participant D as PostgreSQL
  participant FS as Disk VPS
  participant R as Redis
  participant J as Jetson
  B->>BE: GET /api/dataset/folders (Bearer JWT)
  BE->>D: SELECT dataset_folders
  BE-->>B: daftar folder
  alt buat folder
    P->>B: isi form, klik Simpan
    B->>BE: POST /api/dataset/folders {name, object_type, date, operator}
    alt nama sudah ada
      BE-->>B: 400 nama sudah digunakan
    else
      BE->>FS: mkdir datasets/id
      BE->>D: INSERT dataset_folders
      BE-->>B: 201 folder
    end
  else unggah gambar
    B->>BE: POST /api/dataset/folders/{id}/files (multipart)
    Note over BE: safe_name tiap berkas
    BE->>FS: tulis berkas dan penanda .synced
    BE->>D: UPDATE image_count
    BE-->>B: 200 {current_image_count}
  else simpan hasil scan
    B->>BE: PUT /api/dataset/folders/{id}/add-images {count, filenames}
    BE->>FS: salin dari uploads
    BE-->>B: 200 {current_image_count}
  else hapus folder
    B->>BE: DELETE /api/dataset/folders/{id}
    BE->>FS: hapus direktori
    BE->>D: DELETE dataset_folders
    BE->>R: publish PURGE_DATASET_FOLDER
    R->>J: hapus local_datasets/id
    BE-->>B: 200 terhapus
  end
  B-->>P: daftar diperbarui'''))

UC.append(dict(no=13, name="Kelola Isi Folder Dataset", actor="Operator",
 endpoints=["PUT /api/dataset/folders/{folder_id}", "GET /api/dataset/folders/{folder_id}/images", "GET /api/dataset/folders/{folder_id}/files/{filename}/download", "GET /api/dataset/folders/{folder_id}/download", "DELETE /api/dataset/folders/{folder_id}/images"],
 summary="Di dalam satu folder, pengguna melihat gambar dan video beserta status sinkronnya, mengubah metadata folder, mengunduh satu berkas, mengunduh folder sebagai zip biasa atau format YOLO, dan menghapus gambar terpilih. Semua jalur berkas diperiksa agar tidak bisa keluar dari folder dataset.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Buka satu folder dataset")
  A1 --> B1["Tampilkan gambar dan video beserta tanda synced"]
  B1 --> D0{"Aksi?"}
  D0 -- ubah metadata --> A2("Ubah nama, jenis objek, atau operator lalu simpan")
  A2 --> B2["Perbarui metadata folder"]
  D0 -- unduh satu --> A3("Klik unduh pada satu berkas")
  A3 --> D1{"Jalur berkas aman dan berkas ada?"}
  D1 -- tidak --> A4("Tampilkan 400 atau 404")
  D1 -- ya --> B3["Kirim berkas"]
  D0 -- unduh folder --> A5("Pilih zip biasa atau format YOLO")
  A5 --> B4["Susun zip sementara, kirim, lalu hapus zip dari disk"]
  D0 -- hapus gambar --> A6("Pilih gambar lalu hapus")
  A6 --> D2{"Semua nama berkas aman?"}
  D2 -- tidak --> A7("Tampilkan 400, tidak ada yang terhapus")
  D2 -- ya --> B5["Hapus berkas dan penanda .synced, kurangi image_count"]
  B5 --> C1[["Jetson menghapus salinan lokal (PURGE_DATASET_FILES)"]]
  B2 --> E1((("Selesai")))
  B3 --> E1
  A4 --> E1
  B4 --> E1
  A7 --> E1
  C1 --> E1''',
 sequence=r'''sequenceDiagram
  actor P as Operator
  participant B as Browser (React)
  participant BE as Backend API
  participant D as PostgreSQL
  participant FS as Disk VPS
  participant R as Redis
  participant J as Jetson
  B->>BE: GET /api/dataset/folders/{id}/images
  BE->>FS: list berkas
  BE-->>B: [{name, synced}]
  alt ubah metadata
    B->>BE: PUT /api/dataset/folders/{id} {name, object_type, operator}
    BE->>D: UPDATE dataset_folders
    BE-->>B: 200 folder
  else unduh satu berkas
    B->>BE: GET /api/dataset/folders/{id}/files/{filename}/download
    Note over BE: safe_join menolak path traversal
    BE-->>B: berkas (atau 400 / 404)
  else unduh folder
    B->>BE: GET /api/dataset/folders/{id}/download?format=yolo&token=JWT
    BE->>FS: susun zip sementara
    BE-->>B: zip
    BE->>FS: hapus zip (BackgroundTask)
  else hapus gambar
    B->>BE: DELETE /api/dataset/folders/{id}/images {filenames}
    alt ada nama berbahaya
      BE-->>B: 400 tidak ada yang dihapus
    else aman
      BE->>FS: hapus berkas dan .synced
      BE->>D: UPDATE image_count
      BE->>R: publish PURGE_DATASET_FILES
      R->>J: hapus salinan lokal
      BE-->>B: 200 {current_image_count}
    end
  end
  B-->>P: tampilan folder diperbarui'''))

UC.append(dict(no=14, name="Buat Laporan Otomatis", actor="Operator",
 endpoints=["POST /api/documentation/generate?format=WORD|EXCEL|PPT"],
 summary="Pengguna memilih folder dataset dan mengisi data laporan, lalu server menyusun dokumen Word, Excel, atau PowerPoint berisi metadata, thumbnail, resolusi, dan metode akuisisi tiap gambar.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Buka tab Documentation")
  A1 --> A2("Pilih folder dataset dan isi judul, penyusun, instansi")
  A2 --> A3("Pilih format: Word, Excel, atau PowerPoint")
  A3 --> B1["Backend membaca daftar gambar folder"]
  B1 --> D1{"Folder ada?"}
  D1 -- tidak --> A4("Tampilkan 404")
  A4 --> E1((("Selesai")))
  D1 -- ya --> D2{"Format dikenal?"}
  D2 -- tidak --> A5("Tampilkan 400: format tidak dikenali")
  A5 --> E1
  D2 -- ya --> B2["Baca resolusi, ukuran, dan buat thumbnail tiap gambar"]
  B2 --> B3["Susun dokumen sesuai format"]
  B3 --> A6("Browser menerima dan mengunduh berkas laporan")
  A6 --> B4["Catat aktivitas ke log"]
  B4 --> E2((("Selesai")))''',
 sequence=r'''sequenceDiagram
  actor P as Operator
  participant B as Browser (React)
  participant BE as Backend API
  participant FS as Disk VPS
  P->>B: pilih folder dan format, klik Generate
  B->>BE: POST /api/documentation/generate?format=WORD {folder_id, title, author, ...}
  BE->>FS: list gambar folder
  alt folder tidak ada
    BE-->>B: 404
  else format tidak dikenal
    BE-->>B: 400 Format tidak dikenali
  else
    loop setiap gambar
      BE->>FS: baca resolusi dan ukuran, buat thumbnail
    end
    Note over BE: python-docx, openpyxl, atau python-pptx
    BE-->>B: 200 berkas .docx / .xlsx / .pptx
    B->>BE: POST /api/logs {action: laporan dibuat}
    B-->>P: unduh laporan
  end'''))

UC.append(dict(no=15, name="Lihat Log Aktivitas", actor="Operator, Admin",
 endpoints=["GET /api/logs", "POST /api/logs", "DELETE /api/logs"],
 summary="Setiap aksi penting dicatat oleh aplikasi. Pengguna melihat dan mencari log terbaru. Menghapus seluruh log hanya boleh dilakukan Admin.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Buka tab Documentation")
  A1 --> B1["Ambil log terbaru dari server"]
  B1 --> A2("Tampilkan tabel log")
  A2 --> D0{"Aksi?"}
  D0 -- cari --> A3("Ketik kata kunci operator atau aktivitas")
  A3 --> A4("Saring tabel di browser")
  D0 -- hapus semua --> D1{"Pengguna Admin?"}
  D1 -- tidak --> A5("Tampilkan 403")
  D1 -- ya --> A6("Konfirmasi hapus")
  A6 --> B2["Hapus seluruh baris system_logs"]
  B2 --> A7("Tabel log kosong")
  A4 --> E1((("Selesai")))
  A5 --> E1
  A7 --> E1''',
 sequence=r'''sequenceDiagram
  actor P as Pengguna
  participant B as Browser (React)
  participant BE as Backend API
  participant D as PostgreSQL
  Note over B,BE: aksi lain di aplikasi memanggil POST /api/logs {operator, action, status}
  B->>BE: GET /api/logs?limit=100 (Bearer JWT)
  BE->>D: SELECT system_logs ORDER BY timestamp DESC
  BE-->>B: daftar log
  B-->>P: tabel log
  opt cari
    P->>B: ketik kata kunci
    B-->>P: tabel tersaring
  end
  opt hapus semua log
    P->>B: klik hapus, konfirmasi
    B->>BE: DELETE /api/logs
    alt bukan Admin
      BE-->>B: 403 Hanya untuk Admin
    else Admin
      BE->>D: DELETE FROM system_logs
      BE-->>B: 200 {deleted}
    end
  end'''))

UC.append(dict(no=16, name="Kelola Operator", actor="Admin",
 endpoints=["GET /api/auth/operators", "PUT /api/auth/operators/{user_id}/role", "PUT /api/auth/reset-password", "DELETE /api/auth/operators/{user_id}"],
 summary="Admin melihat daftar akun beserta status online dan login terakhir, mengubah peran, mereset password ke bawaan, dan menghapus akun. Token akun yang sudah dihapus langsung ditolak.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Admin membuka Admin Control")
  A1 --> D0{"Peran Admin?"}
  D0 -- tidak --> A2("Tab tidak tampil, API menjawab 403")
  A2 --> E1((("Selesai")))
  D0 -- ya --> B1["Ambil daftar operator, status online, dan login terakhir"]
  B1 --> D1{"Aksi?"}
  D1 -- ubah peran --> A3("Pilih peran baru")
  A3 --> B2["Simpan peran"]
  D1 -- reset password --> A4("Klik Reset Password dan konfirmasi")
  A4 --> B3["Set password ke bawaan dan hash"]
  D1 -- hapus akun --> A5("Klik hapus dan konfirmasi")
  A5 --> B4["Hapus akun, token lamanya tidak berlaku lagi"]
  B2 --> D2{"Operator ditemukan?"}
  B3 --> D2
  B4 --> D2
  D2 -- tidak --> A6("Tampilkan 404")
  D2 -- ya --> A7("Daftar operator diperbarui")
  A6 --> E2((("Selesai")))
  A7 --> E2''',
 sequence=r'''sequenceDiagram
  actor A as Admin
  participant B as Browser (React)
  participant BE as Backend API
  participant D as PostgreSQL
  A->>B: buka Admin Control
  B->>BE: GET /api/auth/operators (Bearer JWT)
  Note over BE: require_admin, selain Admin dijawab 403
  BE->>D: SELECT users dan lastlogin
  BE-->>B: [{id, username, role, online, last_login}]
  alt ubah peran
    B->>BE: PUT /api/auth/operators/{id}/role {role}
    BE->>D: UPDATE users SET role
  else reset password
    B->>BE: PUT /api/auth/reset-password {user_id}
    BE->>D: UPDATE hashed_password = hash(bawaan)
  else hapus akun
    B->>BE: DELETE /api/auth/operators/{id}
    BE->>D: DELETE users
  end
  alt id tidak ditemukan
    BE-->>B: 404 Operator tidak ditemukan
  else
    BE-->>B: 200 berhasil
  end
  B-->>A: daftar diperbarui'''))

UC.append(dict(no=17, name="Kendali Hardware Bus", actor="Admin",
 endpoints=["POST /api/hardware/bus/toggle", "GET /api/hardware/telemetry/stats"],
 summary="Hardware bus adalah saklar pengaman. Saat Admin mematikannya, server menolak semua perintah gerak, scan, stitching, dan setelan hardware dengan 503 atau BUS_DISABLED sampai bus dinyalakan lagi.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Admin membuka Admin Control")
  A1 --> A2("Klik toggle INSTRUMEN POWER BUS")
  A2 --> D1{"Peran Admin?"}
  D1 -- tidak --> A3("Tampilkan 403")
  A3 --> E1((("Selesai")))
  D1 -- ya --> B1["Ubah status hardware bus di server"]
  B1 --> B2["Kirim status bus ke browser lewat telemetri dan stats"]
  B2 --> D2{"Bus mati?"}
  D2 -- ya --> B3["Perintah gerak, scan, stitching, dan setelan hardware ditolak"]
  D2 -- tidak --> B4["Perintah hardware kembali diterima"]
  B3 --> A4("Indikator bus tampil mati")
  B4 --> A5("Indikator bus tampil aktif")
  A4 --> E2((("Selesai")))
  A5 --> E2''',
 sequence=r'''sequenceDiagram
  actor A as Admin
  participant B as Browser (React)
  participant BE as Backend API
  actor P as Pilot lain
  A->>B: klik toggle Power Bus
  B->>BE: POST /api/hardware/bus/toggle {enabled: false} (Bearer JWT)
  Note over BE: require_admin
  BE->>BE: hardware_bus_enabled = false
  BE-->>B: 200 {enabled: false}
  B->>BE: GET /api/hardware/telemetry/stats
  BE-->>B: {hardwareBus: false}
  B-->>A: indikator bus mati
  P->>BE: WS MOVE_MOTOR atau POST /api/hardware/scan/grid
  BE-->>P: COMMAND_REJECTED BUS_DISABLED atau 503'''))

UC.append(dict(no=18, name="Kelola Sesi Pengguna", actor="Admin",
 endpoints=["POST /api/hardware/room/admin_action", "WS ROOM_STATE_UPDATE / TAKEOVER"],
 summary="Hanya satu Pilot yang boleh mengendalikan alat, maksimal dua Spectator menonton video, sisanya antre. Admin dapat mengeluarkan pengguna, menjadikan Pilot, Spectator, atau antrean, dan menggeser urutan antrean. Server juga melepas koneksi tanpa heartbeat 90 detik dan menyerahkan kursi Pilot yang menganggur 10 menit.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Admin membuka panel sesi aktif")
  A1 --> B1["Tampilkan Pilot, Spectator, dan antrean (ROOM_STATE_UPDATE)"]
  B1 --> A2("Admin memilih pengguna dan aksi")
  A2 --> D1{"Aksi?"}
  D1 -- KICK --> B2["Tutup koneksi pengguna dan isi kursi kosong dari antrean"]
  D1 -- MAKE_PILOT --> B3["Pindahkan Pilot lama, jadikan pengguna Pilot"]
  D1 -- MAKE_SPECTATOR atau MAKE_QUEUE --> B4["Pindahkan kursi pengguna"]
  D1 -- QUEUE_UP atau QUEUE_DOWN --> B5["Geser urutan antrean"]
  B2 --> D2{"ID koneksi ditemukan?"}
  B3 --> D2
  B4 --> D2
  B5 --> D2
  D2 -- tidak --> A3("Tampilkan 404")
  D2 -- ya --> B6["Kirim ROLE_ASSIGNED ke pengguna terkait dan ROOM_STATE_UPDATE ke semua"]
  B6 --> A4("Panel sesi diperbarui")
  A3 --> E1((("Selesai")))
  A4 --> E1
  B0["Pemeriksaan berkala: tanpa heartbeat 90 detik dilepas, Pilot menganggur 10 menit diganti"] --> B6''',
 sequence=r'''sequenceDiagram
  actor A as Admin
  participant B as Browser Admin
  participant BE as Backend API
  participant RM as RoomManager
  participant U as Browser pengguna lain
  RM-->>B: ROOM_STATE_UPDATE {pilot, spectators, queue}
  A->>B: pilih pengguna, aksi MAKE_PILOT
  B->>BE: POST /api/hardware/room/admin_action {cid, action}
  Note over BE: require_admin
  BE->>RM: admin_action(cid, action)
  alt cid tidak ditemukan
    RM-->>BE: false
    BE-->>B: 404 Connection ID not found
  else
    RM-->>U: ROLE_ASSIGNED {role: PILOT}
    RM-->>B: ROOM_STATE_UPDATE
    BE-->>B: 200 SUCCESS
  end
  loop pemeriksaan berkala (idle_sweep)
    RM->>RM: lepas koneksi tanpa HEARTBEAT 90 detik
    RM->>RM: ganti Pilot yang menganggur 10 menit bila ada yang menunggu
    RM-->>U: ROLE_ASSIGNED dan ROOM_STATE_UPDATE
  end'''))

UC.append(dict(no=19, name="Kelola Penyimpanan dan Sinkronisasi", actor="Admin, Edge Device",
 endpoints=["GET /api/dataset/storage-info", "GET /api/dataset/storage/export", "DELETE /api/dataset/storage/purge-cache", "DELETE /api/dataset/storage/purge-all", "GET /api/dataset/vps/sync-index"],
 summary="Admin memantau kapasitas disk, mengunduh cadangan seluruh dataset, dan membersihkan penyimpanan. Purge Cache hanya menghapus berkas sementara (unggahan, hasil analisis, zip), sedangkan Purge All menghapus seluruh dataset. Keduanya ditolak saat scan atau stitching berjalan. Di Jetson, vps_syncer mengunggah dataset lokal ke VPS dengan token Edge.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Admin membuka Storage Management")
  A1 --> B1["Tampilkan kapasitas dan pemakaian disk"]
  B1 --> D0{"Aksi?"}
  D0 -- ekspor --> B2["Susun zip seluruh dataset dan kirim"]
  D0 -- purge cache --> D1{"Ada scan atau stitching berjalan?"}
  D0 -- purge all --> D1
  D1 -- ya --> A2("Tampilkan 409: tunggu proses selesai")
  D1 -- tidak --> D2{"Jenis purge?"}
  D2 -- cache --> B3["Hapus isi uploads dan zip sementara, dataset tetap utuh"]
  B3 --> C1[["Jetson membersihkan cache lokal (PURGE_CACHE)"]]
  D2 -- all --> A3("Admin mengonfirmasi penghapusan seluruh dataset")
  A3 --> B4["Hapus semua folder dataset dan metadatanya"]
  B4 --> C2[["Jetson menghapus dataset lokal (PURGE_ALL_DATASETS)"]]
  C1 --> A4("Kapasitas disk diperbarui")
  C2 --> A4
  B2 --> E1((("Selesai")))
  A2 --> E1
  A4 --> E1
  SY(("Tiap 10 detik")) --> C3[["vps_syncer mengambil sync-index dengan token Edge"]]
  C3 --> C4[["Unggah berkas yang belum ada di VPS"]]
  C4 --> E2((("Selesai")))''',
 sequence=r'''sequenceDiagram
  actor A as Admin
  participant B as Browser (React)
  participant BE as Backend API
  participant FS as Disk VPS
  participant R as Redis
  participant J as Jetson
  participant S as vps_syncer
  B->>BE: GET /api/dataset/storage-info
  BE-->>B: {used, total, percent}
  alt ekspor
    B->>BE: GET /api/dataset/storage/export
    BE-->>B: zip seluruh dataset
  else purge cache
    B->>BE: DELETE /api/dataset/storage/purge-cache
    Note over BE: require_admin, _ensure_no_active_job
    alt scan atau stitching berjalan
      BE-->>B: 409
    else
      BE->>FS: hapus uploads dan zip sementara
      BE->>R: publish PURGE_CACHE
      R->>J: PURGE_CACHE
      BE-->>B: 200 cache dibersihkan
    end
  else purge all
    B->>BE: DELETE /api/dataset/storage/purge-all
    Note over BE: require_admin, _ensure_no_active_job
    BE->>FS: hapus seluruh datasets
    BE->>R: publish PURGE_ALL_DATASETS
    R->>J: PURGE_ALL_DATASETS
    BE-->>B: 200 dataset dimusnahkan
  end
  loop tiap 10 detik (ditunda saat stitching)
    S->>BE: GET /api/dataset/vps/sync-index (X-Edge-Token)
    BE-->>S: daftar berkas per folder
    S->>BE: POST /api/dataset/folders/{id}/files (X-Edge-Token)
  end'''))

UC.append(dict(no=20, name="Konfigurasi dan Pemeliharaan Edge", actor="Admin, Edge Device",
 endpoints=["GET /api/hardware/config", "PUT /api/hardware/config/ai", "PUT /api/hardware/config/autogather", "POST /api/hardware/config/{section}/default", "POST /api/hardware/cnc/soft-limits", "POST /api/hardware/motor/set-position", "POST /api/hardware/camera/flatfield", "POST /api/hardware/edge/restart"],
 summary="Admin mengatur ambang keyakinan AI, nilai bawaan Auto Gather, soft limit gerak CNC, dan koordinat kerja motor, mengambil referensi flat-field atau dark-frame kamera, serta me-restart layanan Edge tanpa SSH.",
 activity=r'''flowchart TD
  S(("Mulai")) --> A1("Admin membuka Admin Control")
  A1 --> B1["Ambil konfigurasi tersimpan"]
  B1 --> D0{"Aksi?"}
  D0 -- ambang AI atau default Auto Gather --> B2["Simpan ke system_settings"]
  D0 -- kembalikan bawaan --> B3["Reset satu bagian konfigurasi"]
  D0 -- soft limit --> B4["Simpan batas X, Y, Z dan kirim APPLY_SOFT_LIMITS"]
  B4 --> C1[["Jetson memotong gerak di luar batas"]]
  D0 -- set posisi --> B5["Kirim SET_POSITION"]
  B5 --> C2[["Jetson mengirim G92 dan menyimpan posisi"]]
  D0 -- kalibrasi kamera --> D1{"Jetson online?"}
  D0 -- restart Edge --> D1
  D1 -- tidak --> A2("Tampilkan 409: Jetson offline")
  D1 -- ya --> D2{"Jenis?"}
  D2 -- flat atau dark --> C3[["Jetson mengambil referensi flat-field atau dark-frame"]]
  D2 -- restart --> C4[["Jetson me-restart prosesnya, terputus 3-10 detik lalu tersambung lagi"]]
  B2 --> A3("Tampilkan konfigurasi tersimpan")
  B3 --> A3
  C1 --> A3
  C2 --> A3
  C3 --> A3
  C4 --> A3
  A2 --> E1((("Selesai")))
  A3 --> E1''',
 sequence=r'''sequenceDiagram
  actor A as Admin
  participant B as Browser (React)
  participant BE as Backend API
  participant D as PostgreSQL
  participant R as Redis
  participant J as Jetson
  B->>BE: GET /api/hardware/config
  BE->>D: SELECT system_settings
  BE-->>B: konfigurasi
  Note over BE: semua aksi di bawah memakai require_admin
  alt ambang AI atau Auto Gather
    B->>BE: PUT /api/hardware/config/ai {confThreshold}
    BE->>D: save_setting
  else soft limit
    B->>BE: POST /api/hardware/cnc/soft-limits {enabled, x_min..z_max}
    BE->>D: save_setting softLimit_*
    BE->>R: publish APPLY_SOFT_LIMITS
    R->>J: APPLY_SOFT_LIMITS
  else set posisi
    B->>BE: POST /api/hardware/motor/set-position {x, y, z}
    BE->>R: publish SET_POSITION
    R->>J: G92 dan simpan motor_position.json
  else kalibrasi flat-field
    B->>BE: POST /api/hardware/camera/flatfield?mode=flat
    BE->>R: publish CALIBRATE_FLATFIELD
  else restart Edge
    B->>BE: POST /api/hardware/edge/restart
    alt Jetson offline
      BE-->>B: 409 Jetson sedang offline
    else
      BE->>R: publish RESTART_EDGE
      R->>J: RESTART_EDGE
      J-->>BE: EDGE_RESTARTING, koneksi putus lalu tersambung lagi
    end
  end
  BE-->>B: 200 SUCCESS
  B-->>A: konfigurasi diperbarui'''))

# Endpoint -> UC (traceability)
TRACE = [
 ("GET /", "—", "na", "health check backend, hanya dari dalam VPS"),
 ("GET /api/version", "—", "na", "infrastruktur, dipakai verifikasi deploy"),
 ("POST /api/auth/login", "UC1", "ok", ""),
 ("POST /api/auth/register", "UC2", "ok", ""),
 ("PUT /api/auth/profile/password", "UC3", "ok", ""),
 ("GET /api/auth/operators", "UC16", "ok", ""),
 ("PUT /api/auth/operators/{user_id}/role", "UC16", "ok", ""),
 ("PUT /api/auth/reset-password", "UC16", "ok", ""),
 ("DELETE /api/auth/operators/{user_id}", "UC16", "ok", ""),
 ("POST /api/dataset/folders", "UC12", "ok", ""),
 ("GET /api/dataset/folders", "UC12", "ok", ""),
 ("DELETE /api/dataset/folders/{folder_id}", "UC12", "ok", ""),
 ("POST /api/dataset/folders/{folder_id}/files", "UC12, UC7, UC19", "ok", "juga dipakai vps_syncer"),
 ("PUT /api/dataset/folders/{folder_id}/add-images", "UC12", "ok", ""),
 ("PUT /api/dataset/folders/{folder_id}", "UC13", "ok", ""),
 ("GET /api/dataset/folders/{folder_id}/images", "UC13", "ok", ""),
 ("GET /api/dataset/folders/{folder_id}/files/{filename}/download", "UC13", "ok", ""),
 ("GET /api/dataset/folders/{folder_id}/download", "UC13", "ok", ""),
 ("DELETE /api/dataset/folders/{folder_id}/images", "UC13", "ok", ""),
 ("GET /api/dataset/video/{folder_id}/{filename}", "UC7", "ok", ""),
 ("GET /api/dataset/storage-info", "UC19", "ok", ""),
 ("GET /api/dataset/storage/export", "UC19", "ok", ""),
 ("DELETE /api/dataset/storage/purge-cache", "UC19", "ok", ""),
 ("DELETE /api/dataset/storage/purge-all", "UC19", "ok", ""),
 ("GET /api/dataset/vps/sync-index", "UC19, UC7", "ok", ""),
 ("GET /api/hardware/telemetry/stats", "UC4, UC17", "ok", ""),
 ("GET /api/hardware/config", "UC20", "ok", ""),
 ("PUT /api/hardware/config/ai", "UC20", "ok", ""),
 ("PUT /api/hardware/config/autogather", "UC20", "mid", "varian pesan yang sama dengan config/ai"),
 ("POST /api/hardware/config/{section}/default", "UC20", "mid", "di activity diagram"),
 ("POST /api/hardware/room/admin_action", "UC18", "ok", ""),
 ("POST /api/hardware/motor/move", "UC5", "mid", "jalur REST, digambar lewat motor/home"),
 ("POST /api/hardware/motor/home", "UC5", "ok", ""),
 ("POST /api/hardware/motor/unlock", "UC5", "mid", "guard sama dengan motor/home"),
 ("POST /api/hardware/motor/set-position", "UC20", "ok", ""),
 ("POST /api/hardware/edge/restart", "UC20", "ok", ""),
 ("POST /api/hardware/camera/settings", "UC6", "ok", ""),
 ("POST /api/hardware/camera/flatfield", "UC20", "ok", ""),
 ("POST /api/hardware/cnc/settings", "UC6", "ok", ""),
 ("POST /api/hardware/cnc/soft-limits", "UC20", "ok", ""),
 ("POST /api/hardware/scan/grid", "UC8", "ok", ""),
 ("GET /api/hardware/scan/status", "UC9", "ok", ""),
 ("POST /api/hardware/scan/cancel", "UC9", "ok", ""),
 ("POST /api/hardware/scan/retake", "UC9", "ok", ""),
 ("DELETE /api/hardware/scan/session/{session_id}", "UC9", "ok", ""),
 ("POST /api/hardware/stitch", "UC10", "ok", ""),
 ("GET /api/hardware/stitch/status", "UC10", "ok", ""),
 ("POST /api/hardware/stitch/place", "UC10", "ok", ""),
 ("POST /api/hardware/stitch/place-from-dataset", "UC10", "ok", ""),
 ("POST /api/hardware/stitch/place-folder", "UC10", "ok", ""),
 ("POST /api/hardware/bus/toggle", "UC17", "ok", ""),
 ("POST /api/analysis/upload", "UC11", "ok", ""),
 ("POST /api/analysis/{tool_name}", "UC11", "ok", ""),
 ("GET /api/analysis/status", "UC11", "ok", ""),
 ("POST /api/documentation/generate", "UC14", "ok", ""),
 ("GET /api/logs", "UC15", "ok", ""),
 ("POST /api/logs", "UC15, UC14", "ok", "dipanggil aplikasi setelah aksi penting"),
 ("DELETE /api/logs", "UC15", "ok", ""),
 ("WS /api/hardware/ws", "UC4, UC5, UC7, UC8, UC10, UC11", "ok", "WebSocket Jetson, device token"),
 ("WS /api/hardware/client/ws", "UC1, UC4, UC5, UC6, UC7, UC18", "ok", "WebSocket browser, JWT"),
]
