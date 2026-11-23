#!/usr/bin/env python3
"""Gabungkan seluruh data pengujian ke satu workbook Excel (satu sheet per uji).

    python3 Software/docs/hasil/build_excel.py

Keluaran: Software/qa/results/Data_Pengujian_Mikroskop_Digital.xlsx
Waktu nanodetik (19 digit) tidak muat di presisi Excel (15 digit), jadi disimpan sebagai
milidetik relatif terhadap awal tiap sesi; selisihnya dihitung dengan rumus Excel.
"""
import csv
import json
import math
import os
import re

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = "/home/brin-microscope/Documents/Tugas-Akhir"
SW = f"{ROOT}/Software/qa/results"
HW = f"{ROOT}/Hardware/test_logs"
OUT = f"{SW}/Data_Pengujian_Mikroskop_Digital.xlsx"

FONT = "Arial"
F_BASE = Font(name=FONT, size=10)
F_HEAD = Font(name=FONT, size=10, bold=True, color="FFFFFF")
F_TITLE = Font(name=FONT, size=13, bold=True)
F_NOTE = Font(name=FONT, size=9, italic=True, color="555555")
F_INPUT = Font(name=FONT, size=10, color="0000FF")
F_BOLD = Font(name=FONT, size=10, bold=True)
FILL_HEAD = PatternFill("solid", fgColor="1F5C5A")
FILL_SUM = PatternFill("solid", fgColor="E3F1F0")
THIN = Side(style="thin", color="BFC7CC")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

wb = Workbook()
wb.remove(wb.active)


def rows_csv(path, delim=","):
    with open(path, newline="") as f:
        return list(csv.DictReader(f, delimiter=delim))


def sheet(name, title, note=None):
    ws = wb.create_sheet(name)
    ws["A1"] = title
    ws["A1"].font = F_TITLE
    if note:
        ws["A2"] = note
        ws["A2"].font = F_NOTE
    return ws


def header(ws, row, cols, widths=None):
    for i, c in enumerate(cols, 1):
        cell = ws.cell(row=row, column=i, value=c)
        cell.font = F_HEAD
        cell.fill = FILL_HEAD
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BORDER
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = ws.cell(row=row + 1, column=1)


def put(ws, row, values, fmts=None, border=True, font=F_BASE, wrap=False):
    for i, v in enumerate(values, 1):
        cell = ws.cell(row=row, column=i, value=v)
        cell.font = font
        if border:
            cell.border = BORDER
        if fmts and i - 1 < len(fmts) and fmts[i - 1]:
            cell.number_format = fmts[i - 1]
        if wrap:
            cell.alignment = Alignment(wrap_text=True, vertical="top")


def stats_block(ws, row, col, label, rng, unit="ms", fmt="0.0"):
    """Blok statistik dengan rumus: n, rata-rata, sd, p50, p95, maks."""
    c = col
    ws.cell(row=row, column=c, value=label).font = F_BOLD
    items = [("n", f"=COUNT({rng})", "0"), ("Rata-rata", f"=AVERAGE({rng})", fmt),
             ("SD", f"=STDEV({rng})", fmt), ("p50 (median)", f"=MEDIAN({rng})", fmt),
             ("p95", f"=PERCENTILE({rng},0.95)", fmt), ("Maks", f"=MAX({rng})", fmt),
             ("Min", f"=MIN({rng})", fmt)]
    for i, (k, f, nf) in enumerate(items, 1):
        a = ws.cell(row=row + i, column=c, value=f"{k}" + (f" ({unit})" if k != "n" else ""))
        a.font = F_BASE
        a.fill = FILL_SUM
        a.border = BORDER
        b = ws.cell(row=row + i, column=c + 1, value=f)
        b.font = F_BOLD
        b.fill = FILL_SUM
        b.border = BORDER
        b.number_format = nf
    return {k: f"{get_column_letter(c + 1)}{row + i}" for i, (k, _, _) in enumerate(items, 1)}


summary_rows = []  # (kategori, uji, metrik, rumus/nilai, format, kriteria, sumber)

# ============================================================== SOFTWARE
# --- Black box
ws = sheet("SW_BlackBox", "Pengujian Black Box (Playwright + Newman)",
           "Sumber: Software/qa/results/blackbox.tsv (Hasil Pengujian dan Kesimpulan diisi otomatis dari hasil tes).")
bb = rows_csv(f"{SW}/blackbox.tsv", "\t")
cols = list(bb[0].keys())
header(ws, 4, cols, [5, 18, 22, 32, 48, 42, 34, 12])
for i, r in enumerate(bb, 5):
    put(ws, i, [int(r["No"])] + [r[c] for c in cols[1:]], wrap=True)
last = 4 + len(bb)
ws.cell(row=last + 2, column=1, value="Valid").font = F_BOLD
ws.cell(row=last + 2, column=2, value=f'=COUNTIF(H5:H{last},"Valid")').font = F_BOLD
ws.cell(row=last + 3, column=1, value="Total").font = F_BOLD
ws.cell(row=last + 3, column=2, value=f"=COUNTA(H5:H{last})").font = F_BOLD
summary_rows.append(("Black box", "Playwright + Newman", "Skenario valid",
                     f"=SW_BlackBox!B{last + 2}&\" dari \"&SW_BlackBox!B{last + 3}", None, "semua valid", "SW_BlackBox"))

# --- Newman per request
ws = sheet("SW_Newman", "Uji API (Newman) ke https://e-eye.cloud — per request",
           "Sumber: Software/qa/results/newman.json. Waktu respons dalam milidetik.")
nj = json.load(open(f"{SW}/newman.json"))
folder_of = {}


def walk(items, folder=None):
    for it in items:
        if "item" in it:
            walk(it["item"], it["name"])
        else:
            folder_of[it["id"]] = folder


walk(nj["collection"]["item"])
header(ws, 4, ["No", "Kelompok", "Request", "Metode", "Status HTTP", "Waktu (ms)", "Pemeriksaan", "Lolos"],
       [5, 36, 46, 9, 11, 11, 12, 8])
r0 = 5
for i, ex in enumerate(nj["run"]["executions"]):
    asserts = ex.get("assertions", [])
    ok = all(not a.get("error") for a in asserts)
    put(ws, r0 + i, [i + 1, folder_of.get(ex["item"]["id"], ""), ex["item"]["name"], ex["request"]["method"],
                     ex["response"]["code"], ex["response"]["responseTime"], len(asserts), "ya" if ok else "tidak"],
        [None, None, None, None, "0", "0", "0", None])
rl = r0 + len(nj["run"]["executions"]) - 1
s = stats_block(ws, 4, 10, "Waktu respons", f"F{r0}:F{rl}")
ws.cell(row=13, column=10, value="Request lolos").font = F_BOLD
ws.cell(row=13, column=11, value=f'=COUNTIF(H{r0}:H{rl},"ya")').font = F_BOLD
ws.cell(row=14, column=10, value="Total pemeriksaan").font = F_BOLD
ws.cell(row=14, column=11, value=f"=SUM(G{r0}:G{rl})").font = F_BOLD
ws.column_dimensions["J"].width = 22
ws.column_dimensions["K"].width = 12
summary_rows += [
    ("API dan QoS", "Newman", "Request lolos", f"=SW_Newman!K13&\" dari \"&SW_Newman!{s['n']}", None, "semua lolos", "SW_Newman"),
    ("API dan QoS", "Newman", "Waktu respons median (ms)", f"=SW_Newman!{s['p50 (median)']}", "0", "", "SW_Newman"),
    ("API dan QoS", "Newman", "Waktu respons rata-rata (ms)", f"=SW_Newman!{s['Rata-rata']}", "0", "", "SW_Newman"),
]

# --- Coverage
ws = sheet("SW_Coverage", "Coverage backend (pytest --cov, branch aktif)",
           "Sumber: Software/qa/results/coverage_backend_ringkas.txt.")
header(ws, 4, ["Modul", "Statement", "Tidak tercakup", "Branch", "Branch sebagian", "Coverage"], [40, 11, 14, 10, 15, 11])
r = 5
n_tests = None
for line in open(f"{SW}/coverage_backend_ringkas.txt"):
    m = re.match(r"^(app/\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%", line)
    if m and int(m.group(2)) > 0:
        put(ws, r, [m.group(1)[4:], int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)),
                    int(m.group(6)) / 100], [None, "0", "0", "0", "0", "0%"])
        ws.cell(row=r, column=6).font = F_INPUT
        r += 1
    t = re.match(r"^TOTAL\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)%", line)
    if t:
        total_pct = int(t.group(1)) / 100
    p = re.search(r"(\d+) passed", line)
    if p:
        n_tests = int(p.group(1))
put(ws, r, ["TOTAL", f"=SUM(B5:B{r - 1})", f"=SUM(C5:C{r - 1})", f"=SUM(D5:D{r - 1})", f"=SUM(E5:E{r - 1})",
            total_pct], [None, "0", "0", "0", "0", "0%"], font=F_BOLD)
ws.cell(row=r, column=6).font = Font(name=FONT, size=10, bold=True, color="0000FF")
ws.cell(row=r, column=6).comment = Comment("Persentase resmi dari laporan coverage.py (statement + branch); tidak dihitung ulang di Excel.", "data")
ws.cell(row=r + 2, column=1, value="Kolom Coverage (biru) disalin dari laporan coverage.py, yang menghitung statement dan cabang yang benar-benar dilewati.").font = F_NOTE
ws.cell(row=r + 3, column=1, value="Jumlah tes backend lolos").font = F_BOLD
c = ws.cell(row=r + 3, column=2, value=n_tests)
c.font = F_INPUT
c.comment = Comment("Dari baris akhir coverage_backend_ringkas.txt (pytest).", "data")
summary_rows += [
    ("White box", "pytest", "Tes backend lolos", f"=SW_Coverage!B{r + 3}", "0", "0 gagal", "SW_Coverage"),
    ("White box", "pytest --cov", "Coverage backend", f"=SW_Coverage!F{r}", "0.0%", "", "SW_Coverage"),
]

# --- Radon
ws = sheet("SW_Radon", "Kompleksitas siklomatik (radon cc)", "Sumber: Software/qa/results/radon_cc.txt.")
header(ws, 4, ["Berkas", "Jenis", "Nama", "Peringkat", "Kompleksitas"], [36, 8, 40, 10, 13])
r = 5
cur = ""
for line in open(f"{SW}/radon_cc.txt"):
    if line and not line.startswith(" ") and line.strip().endswith(".py"):
        cur = line.strip().replace("app/", "")
    m = re.match(r"\s+([FMC]) \d+:\d+ (\S+) - ([A-F]) \((\d+)\)", line)
    if m:
        put(ws, r, [cur, {"F": "fungsi", "M": "method", "C": "kelas"}[m.group(1)], m.group(2), m.group(3), int(m.group(4))],
            [None, None, None, None, "0"])
        r += 1
rl = r - 1
ws.cell(row=4, column=7, value="Peringkat").font = F_BOLD
ws.cell(row=4, column=8, value="Jumlah blok").font = F_BOLD
for i, g in enumerate("ABCDEF", 5):
    ws.cell(row=i, column=7, value=g).font = F_BASE
    ws.cell(row=i, column=8, value=f'=COUNTIF(D5:D{rl},"{g}")').font = F_BASE
ws.cell(row=11, column=7, value="Rata-rata").font = F_BOLD
ws.cell(row=11, column=8, value=f"=AVERAGE(E5:E{rl})").font = F_BOLD
ws["H11"].number_format = "0.00"
summary_rows.append(("White box", "radon", "Kompleksitas rata-rata", "=SW_Radon!H11", "0.00", "A (≤ 5)", "SW_Radon"))

# --- Keamanan
ws = sheet("SW_Keamanan", "Pengujian keamanan", "Sumber: bandit.txt, nmap.txt, security_headers.txt, zap.html (laptop).")
header(ws, 4, ["Uji", "Butir", "Hasil", "Keterangan"], [22, 34, 22, 70])
sec = [
    ("OWASP ZAP baseline", "High", 0, ""),
    ("OWASP ZAP baseline", "Medium", 1, "Content-Security-Policy belum dipasang (disengaja sementara)"),
    ("OWASP ZAP baseline", "Low", 3, "Cross-Origin Embedder/Opener/Resource Policy"),
    ("OWASP ZAP baseline", "Informational", 4, "Modern Web App, cache-control, konten dapat di-cache"),
    ("bandit", "High", 0, ""), ("bandit", "Medium", 0, ""),
    ("bandit", "Low", 21, "18 try/except/pass disengaja, 2 string mirip password (kunci tes, password reset bawaan), 1 try/except/continue"),
    ("pytest (keamanan)", "Tes lolos", 79, "JWT dan token Edge, peran Admin, path traversal, G-code, rate limit"),
    ("Newman akses", "Ditolak 401 tanpa token/token palsu", 56, ""),
    ("Newman akses", "Ditolak 403 operator di fitur Admin", 18, ""),
    ("nmap", "Port 22 (SSH)", "terbuka", "administrasi VPS"),
    ("nmap", "Port 80 (nginx)", "terbuka", "di belakang Cloudflare"),
    ("nmap", "Port 443", "tertutup", "HTTPS disediakan Cloudflare"),
    ("nmap", "Port 4040 (ngrok)", "ditutup", "sempat terbuka, kontainer ngrok dimatikan"),
    ("nmap", "Port 5433, 6380, 8000", "filtered", "PostgreSQL, Redis, backend tidak terjangkau dari luar"),
    ("Header", "HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy", "terpasang", "CSP belum"),
]
for i, row in enumerate(sec, 5):
    put(ws, i, list(row), wrap=True)
summary_rows += [("Keamanan", "OWASP ZAP", "Temuan High", "=SW_Keamanan!C5", "0", "0", "SW_Keamanan"),
                 ("Keamanan", "bandit", "Temuan High + Medium", "=SW_Keamanan!C9+SW_Keamanan!C10", "0", "0", "SW_Keamanan")]

# --- QoS WebSocket
ws = sheet("QoS_WebSocket", "QoS WebSocket (ws_qos, 600 s, lewat Cloudflare) — setelah perbaikan",
           "Sumber: Software/qa/results/ws_qos_cloudflare_outbox.csv. Waktu relatif (ms) dari pesan pertama.")
q = rows_csv(f"{SW}/ws_qos_cloudflare_outbox.csv")
t0 = int(q[0]["t_ns"])
header(ws, 4, ["t (ms)", "Event", "Bytes", "Jarak telemetri (ms)"], [12, 18, 10, 20])
r = 5
last_tel_row = None
for x in q:
    vals = [round((int(x["t_ns"]) - t0) / 1e6, 3), x["event"], int(x["bytes"])]
    if x["event"] == "TELEMETRY_DATA":
        vals.append(f"=A{r}-A{last_tel_row}" if last_tel_row else None)
        last_tel_row = r
    else:
        vals.append(None)
    put(ws, r, vals, ["0.000", None, "0", "0.0"], border=False)
    r += 1
rl = r - 1
ws.cell(row=4, column=6, value="Ringkasan").font = F_BOLD
calc = [
    ("Durasi (s)", f"=(MAX(A5:A{rl})-MIN(A5:A{rl}))/1000", "0.0"),
    ("Frame video", f'=COUNTIF(B5:B{rl},"STREAM_DATA")', "0"),
    ("FPS", "=G6/G5", "0.00"),
    ("Pesan telemetri", f'=COUNTIF(B5:B{rl},"TELEMETRY_DATA")', "0"),
    ("Frekuensi telemetri (Hz)", "=G8/G5", "0.00"),
    ("Jitter telemetri p50 (ms)", f"=MEDIAN(D5:D{rl})", "0.0"),
    ("Jitter telemetri p95 (ms)", f"=PERCENTILE(D5:D{rl},0.95)", "0.0"),
    ("Bitrate video (Mbps)", f'=SUMIF(B5:B{rl},"STREAM_DATA",C5:C{rl})*8/G5/1000000', "0.00"),
]
for i, (k, f, nf) in enumerate(calc, 5):
    ws.cell(row=i, column=6, value=k).font = F_BASE
    cc = ws.cell(row=i, column=7, value=f)
    cc.font = F_BOLD
    cc.number_format = nf
    cc.fill = FILL_SUM
ws.column_dimensions["F"].width = 26
ws.column_dimensions["G"].width = 12
ws.cell(row=15, column=6, value="Pembanding sebelum perbaikan (RINGKASAN.md)").font = F_BOLD
for i, (k, v) in enumerate([("Frekuensi telemetri (Hz)", 3.25), ("FPS", 19.17), ("Jitter p95 (ms)", 847), ("Putus koneksi", 2)], 16):
    ws.cell(row=i, column=6, value=k).font = F_BASE
    cc = ws.cell(row=i, column=7, value=v)
    cc.font = F_INPUT
    cc.comment = Comment("Hasil ws_qos 10 Nov 2026 sebelum perbaikan ClientOutbox (ws_qos_cloudflare.csv).", "data")
summary_rows += [("API dan QoS", "ws_qos", "FPS video", "=QoS_WebSocket!G7", "0.0", "", "QoS_WebSocket"),
                 ("API dan QoS", "ws_qos", "Frekuensi telemetri (Hz)", "=QoS_WebSocket!G9", "0.00", "5 Hz", "QoS_WebSocket")]

# ============================================================== HARDWARE
# --- t02
ws = sheet("HW_t02_Lokal", "t02 — Latensi perintah Jetson → GRBL (100 perintah)",
           "Sumber: Hardware/test_logs/cmd_local.csv. Waktu dalam ms relatif terhadap perintah pertama.")
d = rows_csv(f"{HW}/cmd_local.csv")
t0 = int(d[0]["t_sent_ns"])
header(ws, 4, ["cmd_id", "t kirim (ms)", "t ok (ms)", "Latensi (ms)"], [9, 14, 14, 13])
for i, x in enumerate(d, 5):
    put(ws, i, [int(x["cmd_id"]), round((int(x["t_sent_ns"]) - t0) / 1e6, 4), round((int(x["t_ok_ns"]) - t0) / 1e6, 4),
                f"=C{i}-B{i}"], ["0", "0.0000", "0.0000", "0.00"])
rl = 4 + len(d)
s = stats_block(ws, 4, 6, "Latensi lokal", f"D5:D{rl}", fmt="0.00")
ws.column_dimensions["F"].width = 18
summary_rows += [("Hardware", "t02", "Jetson→GRBL p50 (ms)", f"=HW_t02_Lokal!{s['p50 (median)']}", "0.0", "", "HW_t02_Lokal"),
                 ("Hardware", "t02", "Jetson→GRBL p95 (ms)", f"=HW_t02_Lokal!{s['p95']}", "0.0", "", "HW_t02_Lokal")]

# --- t03
ws = sheet("HW_t03_Cloud", "t03 — Latensi perintah klien → Jetson → GRBL lewat cloud",
           "Sumber: cmd_client.csv (waktu kirim) digabung cmd.csv (Jetson) lewat cmd_id. Klien dan Jetson di perangkat yang sama (jam sama).")
cl = rows_csv(f"{HW}/cmd_client.csv")
ed = {x["cmd_id"]: x for x in rows_csv(f"{HW}/cmd.csv") if x["cmd_id"]}
t0 = int(cl[0]["t_sent_ns"])
header(ws, 4, ["cmd_id", "Jalur", "t kirim (ms)", "t diterima Jetson (ms)", "t ok GRBL (ms)",
               "Klien→Jetson (ms)", "Klien→GRBL (ms)", "Jetson→GRBL (ms)"], [16, 7, 13, 20, 15, 16, 15, 16])
for i, x in enumerate(cl, 5):
    e = ed.get(x["cmd_id"])
    tr = round((int(e["t_rx_ns"]) - t0) / 1e6, 3) if e else None
    to = round((int(e["t_ok_ns"]) - t0) / 1e6, 3) if e else None
    put(ws, i, [x["cmd_id"], x["path"], round((int(x["t_sent_ns"]) - t0) / 1e6, 3), tr, to,
                f'=IF(D{i}="","",D{i}-C{i})', f'=IF(E{i}="","",E{i}-C{i})', f'=IF(E{i}="","",E{i}-D{i})'],
        [None, None, "0.000", "0.000", "0.000", "0.0", "0.0", "0.0"])
rl = 4 + len(cl)
s1 = stats_block(ws, 4, 10, "Klien→Jetson", f"F5:F{rl}")
s2 = stats_block(ws, 13, 10, "Klien→GRBL", f"G5:G{rl}")
s3 = stats_block(ws, 22, 10, "Jetson→GRBL", f"H5:H{rl}")
ws.cell(row=31, column=10, value="Tidak sampai ke Jetson").font = F_BOLD
ws.cell(row=31, column=11, value=f'=COUNTBLANK(D5:D{rl})').font = F_BOLD
ws.column_dimensions["J"].width = 22
summary_rows += [("Hardware", "t03", "Klien→GRBL p50 (ms)", f"=HW_t03_Cloud!{s2['p50 (median)']}", "0", "", "HW_t03_Cloud"),
                 ("Hardware", "t03", "Klien→GRBL p95 (ms)", f"=HW_t03_Cloud!{s2['p95']}", "0", "", "HW_t03_Cloud"),
                 ("Hardware", "t03", "Perintah tidak sampai", "=HW_t03_Cloud!K31", "0", "", "HW_t03_Cloud")]

# --- t04
ws = sheet("HW_t04_Video", "t04 — Latensi video kamera → browser (600 s, run akhir 11 Nov)",
           "Sumber: Hardware/test_logs/video.csv. Waktu dalam ms relatif terhadap frame pertama.")
v = rows_csv(f"{HW}/video.csv")
t0 = int(v[0]["t_cap_ns"])
header(ws, 4, ["frame_id", "t capture (ms)", "t diterima (ms)", "Bytes", "Latensi (ms)"], [10, 15, 15, 9, 13])
for i, x in enumerate(v, 5):
    put(ws, i, [int(x["frame_id"]), round((int(x["t_cap_ns"]) - t0) / 1e6, 3), round((int(x["t_recv_ns"]) - t0) / 1e6, 3),
                int(x["bytes"]), f"=C{i}-B{i}"], ["0", "0.000", "0.000", "0", "0.0"], border=False)
rl = 4 + len(v)
s = stats_block(ws, 4, 7, "Latensi video", f"E5:E{rl}", fmt="0")
ws.cell(row=13, column=7, value="Durasi (s)").font = F_BASE
ws.cell(row=13, column=8, value=f"=(MAX(C5:C{rl})-MIN(C5:C{rl}))/1000").number_format = "0.0"
ws.cell(row=14, column=7, value="FPS").font = F_BASE
ws.cell(row=14, column=8, value=f"=COUNT(E5:E{rl})/H13").number_format = "0.00"
ws.cell(row=15, column=7, value="Bitrate (Mbps)").font = F_BASE
ws.cell(row=15, column=8, value=f"=SUM(D5:D{rl})*8/H13/1000000").number_format = "0.0"
for rr in (13, 14, 15):
    ws.cell(row=rr, column=8).font = F_BOLD
ws.column_dimensions["G"].width = 18
summary_rows += [("API dan QoS", "t04", "Latensi video p50 (ms)", f"=HW_t04_Video!{s['p50 (median)']}", "0", "", "HW_t04_Video"),
                 ("API dan QoS", "t04", "Latensi video p95 (ms)", f"=HW_t04_Video!{s['p95']}", "0", "", "HW_t04_Video"),
                 ("API dan QoS", "t04", "FPS video", "=HW_t04_Video!H14", "0.0", "", "HW_t04_Video")]

# --- t05
ws = sheet("HW_t05_ETA", "t05 — Ketepatan estimasi waktu grid scan",
           "Sumber: eta_sebelum_koreksi.csv (rumus lama) dan eta.csv (rumus dengan waktu capture 0,43 s/tile).")
header(ws, 4, ["Versi rumus", "Grid", "Run", "Tile", "Prediksi (s)", "Aktual (s)", "Selisih (s)", "Galat (%)", "Selisih per tile (s)"],
       [26, 8, 6, 7, 13, 12, 12, 11, 18])
r = 5
for label, fn in (("Lama (tanpa capture)", "eta_sebelum_koreksi.csv"), ("Baru (+0,43 s/tile)", "eta.csv")):
    for x in rows_csv(f"{HW}/{fn}"):
        put(ws, r, [label, x["grid"], int(x["run"]), int(x["n_tiles"]), float(x["predicted_s"]), float(x["actual_s"]),
                    f"=F{r}-E{r}", f"=(F{r}-E{r})/F{r}", f"=G{r}/D{r}"],
            [None, None, "0", "0", "0.0", "0.0", "0.0", "0.0%", "0.00"])
        r += 1
ws.cell(row=r + 1, column=1, value="MAPE rumus lama").font = F_BOLD
ws.cell(row=r + 1, column=2, value="=SUMPRODUCT(ABS(H5:H13))/9").number_format = "0.0%"
ws.cell(row=r + 2, column=1, value="MAPE rumus baru").font = F_BOLD
ws.cell(row=r + 2, column=2, value="=SUMPRODUCT(ABS(H14:H22))/9").number_format = "0.0%"
ws.cell(row=r + 3, column=1, value="Waktu capture per tile, rumus lama (s)").font = F_BOLD
ws.cell(row=r + 3, column=2, value="=SUMPRODUCT(D5:D13,G5:G13)/SUMPRODUCT(D5:D13,D5:D13)").number_format = "0.000"
ws.cell(row=r + 4, column=1, value="Catatan: run 10x10 ke-2 dan ke-3 rumus baru melambat karena kecepatan kirim Wi-Fi Jetson turun ke 13 Mbit/s (100/100 tile berhasil).").font = F_NOTE
summary_rows += [("Hardware", "t05", "MAPE ETA rumus lama", f"=HW_t05_ETA!B{r + 1}", "0.0%", "", "HW_t05_ETA"),
                 ("Hardware", "t05", "MAPE ETA rumus baru", f"=HW_t05_ETA!B{r + 2}", "0.0%", "", "HW_t05_ETA")]

# --- t05b
ws = sheet("HW_t05b_Settle", "t05b — Ketajaman citra vs jeda setelah motor berhenti",
           "Sumber: Hardware/test_logs/settle.csv. Ketajaman = variance of Laplacian kanal hijau.")
st = rows_csv(f"{HW}/settle.csv")
header(ws, 4, ["Jenis gerak", "Jeda (s)", "Ulangan", "Ketajaman"], [14, 10, 9, 12])
for i, x in enumerate(st, 5):
    put(ws, i, [x["move_type"], float(x["delay_s"]), int(x["rep"]), float(x["sharpness"])], [None, "0.00", "0", "0.00"])
rl = 4 + len(st)
ws.cell(row=4, column=6, value="Jeda (s)").font = F_BOLD
ws.cell(row=4, column=7, value="Rata-rata dalam baris").font = F_BOLD
ws.cell(row=4, column=8, value="SD dalam baris").font = F_BOLD
ws.cell(row=4, column=9, value="Rata-rata pindah baris").font = F_BOLD
for i, dly in enumerate([0, 0.25, 0.5, 1.0, 1.5], 5):
    ws.cell(row=i, column=6, value=dly).number_format = "0.00"
    ws.cell(row=i, column=7, value=f'=AVERAGEIFS(D$5:D${rl},A$5:A${rl},"in_row",B$5:B${rl},F{i})').number_format = "0.00"
    ws.cell(row=i, column=8, value=f'=SQRT(SUMPRODUCT((A$5:A${rl}="in_row")*(B$5:B${rl}=F{i})*(D$5:D${rl}-G{i})^2)/COUNTIFS(A$5:A${rl},"in_row",B$5:B${rl},F{i}))').number_format = "0.00"
    ws.cell(row=i, column=9, value=f'=AVERAGEIFS(D$5:D${rl},A$5:A${rl},"row_change",B$5:B${rl},F{i})').number_format = "0.00"
for col in "FGHI":
    ws.column_dimensions[col].width = 20
ws.cell(row=11, column=6, value="Rentang rata-rata dalam baris antar-jeda (maks−min)/maks").font = F_BOLD
ws.cell(row=12, column=6, value="Ketajaman tidak naik seiring jeda (tertinggi di 0,25 s, terendah di 1,0 s): variasi acak, tidak ada efek getaran yang mereda.").font = F_NOTE
ws.cell(row=11, column=9, value="=(MAX(G5:G9)-MIN(G5:G9))/MAX(G5:G9)").number_format = "0.0%"
summary_rows.append(("Hardware", "t05b", "Variasi ketajaman antar-jeda", "=HW_t05b_Settle!I11", "0.0%", "tidak naik seiring jeda", "HW_t05b_Settle"))

# --- t06
ws = sheet("HW_t06_RateLimit", "t06 — Rate limit pada burst 20 perintah/detik",
           "Sumber: Hardware/test_logs/ratelimit.csv. Waktu dalam ms relatif terhadap perintah pertama tiap kanal.")
rlm = rows_csv(f"{HW}/ratelimit.csv")
header(ws, 4, ["Kanal", "t kirim (ms)", "Hasil"], [8, 13, 12])
firsts = {}
for x in rlm:
    firsts.setdefault(x["channel"], int(x["t_send_ns"]))
    firsts[x["channel"]] = min(firsts[x["channel"]], int(x["t_send_ns"]))
for i, x in enumerate(rlm, 5):
    put(ws, i, [x["channel"], round((int(x["t_send_ns"]) - firsts[x["channel"]]) / 1e6, 2), x["result"]], [None, "0.00", None])
rl = 4 + len(rlm)
header_r = 4
for j, h in enumerate(["Kanal", "Dikirim", "Diterima", "Ditolak", "Durasi (s)", "Batas interval (s)", "Batas teoretis diterima"], 5):
    cc = ws.cell(row=header_r, column=j, value=h)
    cc.font = F_BOLD
for i, (ch, iv) in enumerate([("rest", 0.5), ("ws", 0.25)], 5):
    ws.cell(row=i, column=5, value=ch)
    ws.cell(row=i, column=6, value=f'=COUNTIF(A$5:A${rl},E{i})')
    ws.cell(row=i, column=7, value=f'=COUNTIFS(A$5:A${rl},E{i},C$5:C${rl},"ACCEPTED")')
    ws.cell(row=i, column=8, value=f'=COUNTIFS(A$5:A${rl},E{i},C$5:C${rl},"REJECTED")')
    ws.cell(row=i, column=9, value=f'=SUMPRODUCT(MAX((A$5:A${rl}=E{i})*B$5:B${rl}))/1000').number_format = "0.0"
    cc = ws.cell(row=i, column=10, value=iv)
    cc.font = F_INPUT
    cc.comment = Comment("Dari kode: REST_MOTOR_INTERVAL_S = 0,5; WS_MOTOR_INTERVAL_S = 0,25 (hardware.py).", "data")
    ws.cell(row=i, column=11, value=f"=INT(I{i}/J{i})+1")
for col in "EFGHIJK":
    ws.column_dimensions[col].width = 15
summary_rows += [("Hardware", "t06", "REST diterima / batas", '=HW_t06_RateLimit!G5&" / "&HW_t06_RateLimit!K5', None, "≤ batas", "HW_t06_RateLimit"),
                 ("Hardware", "t06", "WS diterima / batas", '=HW_t06_RateLimit!G6&" / "&HW_t06_RateLimit!K6', None, "≤ batas", "HW_t06_RateLimit")]

# --- t07
ws = sheet("HW_t07_Watchdog", "t07 — Watchdog keep-alive: motor ditahan saat koneksi putus",
           "Sumber: watchdog_log.csv, hanya selama sesi uji t07 (11 Nov 2026). Pemicu dengan umur pesan < 1 s (Wi-Fi tersambung lalu putus lagi) tidak dihitung.")
wd = rows_csv(f"{HW}/watchdog_log.csv")
tel = rows_csv(f"{HW}/telemetry_t07_watchdog.csv")
tel_t = [int(y["t_ns"]) for y in tel]
# Jendela uji t07 = rentang telemetri sesi watchdog (main.py dengan TEST_TELEMETRY_INTERVAL=0,05).
wd = [x for x in wd if tel_t[0] <= int(x["t_ns"]) <= tel_t[-1]]
header(ws, 4, ["Percobaan", "Jam (WIB)", "Status motor saat terpicu", "Pesan terakhir → watchdog (ms)",
               "Pesan terakhir → feed hold terkirim (ms)", "X sebelum (mm)", "X setelah tersambung (mm)", "Status setelah tersambung"],
       [11, 12, 16, 18, 22, 14, 16, 16])
import bisect
import datetime
n = 0
r = 5
holds = sorted(int(x["t_ns"]) for x in wd if x["event"] == "FEED_HOLD_SENT")
for x in wd:
    if x["event"] != "WATCHDOG_TRIGGERED" or float(x["last_rx_age_ms"]) < 1000:
        continue
    t = int(x["t_ns"])
    age = float(x["last_rx_age_ms"])
    h = holds[bisect.bisect_left(holds, t)]
    i_b = bisect.bisect_left(tel_t, t) - 1
    i_a = bisect.bisect_right(tel_t, t)
    n += 1
    put(ws, r, [n, datetime.datetime.fromtimestamp(t / 1e9).strftime("%H:%M:%S"), x["motor_state"], age,
                round(age + (h - t) / 1e6, 2), float(tel[i_b]["x"]) if i_b >= 0 else None,
                float(tel[i_a]["x"]) if i_a < len(tel) else None, tel[i_a]["status"] if i_a < len(tel) else None],
        ["0", None, None, "0.0", "0.0", "0.000", "0.000", None])
    r += 1
rl = r - 1
s = stats_block(ws, 4, 10, "Pesan terakhir → feed hold", f"E5:E{rl}", fmt="0")
ws.cell(row=13, column=10, value="Percobaan saat motor bergerak").font = F_BOLD
ws.cell(row=13, column=11, value=f'=COUNTIF(C5:C{rl},"Run")').font = F_BOLD
ws.cell(row=14, column=10, value="Status Hold setelah tersambung").font = F_BOLD
ws.cell(row=14, column=11, value=f'=COUNTIF(H5:H{rl},"Hold*")&" dari "&COUNT(A5:A{rl})').font = F_BOLD
ws.column_dimensions["J"].width = 30
ws.cell(row=rl + 2, column=1, value="Langkah 5 protokol (motor tidak melanjutkan gerak lama setelah tersambung) diamati langsung oleh penguji: lolos.").font = F_NOTE
summary_rows += [("Hardware", "t07", "Putus → feed hold p95 (ms)", f"=HW_t07_Watchdog!{s['p95']}", "0", "≤ 3500", "HW_t07_Watchdog"),
                 ("Hardware", "t07", "Percobaan saat bergerak", "=HW_t07_Watchdog!K13", "0", "", "HW_t07_Watchdog")]

# --- t01b
ws = sheet("HW_t01b_Posisi", "t01b — Repeatability dan linearitas gerak dari pergeseran citra",
           "Sumber: positioning_img.csv. Pergeseran diukur phase correlation; kamera miring ±27° sehingga dipakai panjang vektor. "
           "Pergeseran > setengah frame dibuka (unwrap) di Python memakai arah gerak 0,5 mm.")
pos = rows_csv(f"{HW}/positioning_img.csv")
W, H = 1280, 720
dirs = {}
for ax in "XY":
    s05 = [(float(x["shift_x_px"]), float(x["shift_y_px"])) for x in pos if x["axis"] == ax and float(x["distance_mm"]) == 0.5]
    dirs[ax] = (sum(a for a, _ in s05) / len(s05) / 0.5, sum(b for _, b in s05) / len(s05) / 0.5)
ws["L4"] = "Skala kamera (px/mm, lebar 900 px)"
ws["L4"].font = F_BOLD
ws["M4"] = 128.8
ws["M4"].font = F_INPUT
ws["M4"].comment = Comment("Diukur dari foto slide kalibrasi (1 garis kecil = 0,1 mm): 12,88 px per 0,1 mm pada lebar 900 px.", "data")
ws["L5"] = "Lebar frame uji (px)"
ws["M5"] = W
ws["M5"].font = F_INPUT
ws["L6"] = "Skala pada frame uji (px/mm)"
ws["M6"] = "=M4*M5/900"
ws["M6"].number_format = "0.00"
ws.column_dimensions["L"].width = 34
header(ws, 8, ["Sumbu", "Jarak perintah (mm)", "Ulangan", "dx mentah (px)", "dy mentah (px)", "dx (px)", "dy (px)",
               "Panjang (px)", "Terukur (mm)", "Galat kembali (µm)"], [7, 12, 8, 12, 12, 10, 10, 12, 12, 14])
ws.freeze_panes = "A9"
for i, x in enumerate(pos, 9):
    ax = x["axis"]
    dmm = float(x["distance_mm"])
    dx, dy = float(x["shift_x_px"]), float(x["shift_y_px"])
    ux, uy = dirs[ax]
    dxu = min((dx, dx - W, dx + W), key=lambda c: abs(c - ux * dmm))
    dyu = min((dy, dy - H, dy + H), key=lambda c: abs(c - uy * dmm))
    put(ws, i, [ax, dmm, int(x["rep"]), dx, dy, dxu, dyu, f"=SQRT(F{i}^2+G{i}^2)", f"=H{i}/$M$6",
                float(x["return_error_mm"]) * 1000], [None, "0.00", "0", "0.00", "0.00", "0.00", "0.00", "0.00", "0.000", "0.0"])
rl = 8 + len(pos)
ws["L8"] = "Hasil"
ws["L8"].font = F_BOLD
# Kemiringan garis kuadrat terkecil per sumbu dengan SUMPRODUCT (tanpa rumus array).
def slope_formula(axis):
    a = f'(A9:A{rl}="{axis}")'
    n_ = f"SUMPRODUCT(--{a})"
    sx = f"SUMPRODUCT({a}*B9:B{rl})"
    sy = f"SUMPRODUCT({a}*H9:H{rl})"
    sxy = f"SUMPRODUCT({a}*B9:B{rl}*H9:H{rl})"
    sxx = f"SUMPRODUCT({a}*B9:B{rl}^2)"
    return f"=({n_}*{sxy}-{sx}*{sy})/({n_}*{sxx}-{sx}^2)"
items = [("Kemiringan X (px/mm)", slope_formula("X"), "0.0"),
         ("Kemiringan Y (px/mm)", slope_formula("Y"), "0.0"),
         ("Rasio terukur/diperintah X", "=M9/M6", "0.000"),
         ("Rasio terukur/diperintah Y", "=M10/M6", "0.000"),
         ("Galat kembali rata-rata (µm)", f"=AVERAGE(J9:J{rl})", "0.0"),
         ("Galat kembali maks (µm)", f"=MAX(J9:J{rl})", "0.0")]
for i, (k, f, nf) in enumerate(items, 9):
    ws.cell(row=i, column=12, value=k).font = F_BASE
    cc = ws.cell(row=i, column=13, value=f)
    cc.font = F_BOLD
    cc.number_format = nf
    cc.fill = FILL_SUM
ws.cell(row=16, column=12, value="Rasio < 1 berarti meja bergerak lebih pendek dari perintah menurut skala slide; akurasi absolut belum diverifikasi alat ukur fisik.").font = F_NOTE
summary_rows += [("Hardware", "t01b", "Repeatability rata-rata (µm)", "=HW_t01b_Posisi!M13", "0.0", "", "HW_t01b_Posisi"),
                 ("Hardware", "t01b", "Repeatability maks (µm)", "=HW_t01b_Posisi!M14", "0.0", "", "HW_t01b_Posisi"),
                 ("Hardware", "t01b", "Rasio jarak X", "=HW_t01b_Posisi!M11", "0.000", "1,000 ideal", "HW_t01b_Posisi"),
                 ("Hardware", "t01b", "Rasio jarak Y", "=HW_t01b_Posisi!M12", "0.000", "1,000 ideal", "HW_t01b_Posisi")]

# --- Termal
ws = sheet("HW_Termal", "Termal dan sumber daya Jetson selama uji (t05, sampel tiap ±0,1 s)",
           "Sumber: Hardware/test_logs/telemetry_t05_termal.csv. Waktu dalam detik relatif terhadap sampel pertama.")
te = rows_csv(f"{HW}/telemetry_t05_termal.csv")
t0 = int(te[0]["t_ns"])
header(ws, 4, ["t (s)", "Status", "X", "Y", "Z", "CPU (%)", "Suhu CPU (°C)", "Suhu GPU (°C)", "RAM terpakai (GB)", "RAM total (GB)"],
       [9, 8, 8, 8, 7, 9, 13, 13, 16, 14])
for i, x in enumerate(te, 5):
    put(ws, i, [round((int(x["t_ns"]) - t0) / 1e9, 2), x["status"], float(x["x"]), float(x["y"]), float(x["z"]),
                float(x["cpu"]), float(x["cpu_temp"]), float(x["gpu_temp"]), float(x["ram_used_gb"]), float(x["ram_total_gb"])],
        ["0.00", None, "0.000", "0.000", "0.000", "0.0", "0.0", "0.0", "0.00", "0.00"], border=False)
rl = 4 + len(te)
calc = [("Suhu CPU maks (°C)", f"=MAX(G5:G{rl})", "0.0"), ("Suhu GPU maks (°C)", f"=MAX(H5:H{rl})", "0.0"),
        ("CPU rata-rata (%)", f"=AVERAGE(F5:F{rl})", "0.0"), ("RAM maks (%)", f"=MAX(I5:I{rl})/MAX(J5:J{rl})", "0.0%"),
        ("Durasi (menit)", f"=MAX(A5:A{rl})/60", "0.0")]
for i, (k, f, nf) in enumerate(calc, 5):
    ws.cell(row=i, column=12, value=k).font = F_BASE
    cc = ws.cell(row=i, column=13, value=f)
    cc.font = F_BOLD
    cc.number_format = nf
    cc.fill = FILL_SUM
ws.column_dimensions["L"].width = 22
summary_rows += [("Hardware", "Termal", "Suhu CPU maks (°C)", "=HW_Termal!M5", "0.0", "", "HW_Termal"),
                 ("Hardware", "Termal", "RAM maks", "=HW_Termal!M8", "0.0%", "< 75%", "HW_Termal")]

# ============================================================== RINGKASAN (sheet pertama)
ws = wb.create_sheet("Ringkasan", 0)
ws["A1"] = "Data Pengujian Sistem Mikroskop Digital"
ws["A1"].font = F_TITLE
ws["A2"] = ("Uji 10–19 Nov 2026. Semua nilai di bawah dihitung dengan rumus dari sheet sumbernya. "
            "Teks biru = angka yang diketik dari sumber lain (lihat komentar sel).")
ws["A2"].font = F_NOTE
header(ws, 4, ["Kategori", "Uji", "Metrik", "Nilai", "Kriteria", "Sheet sumber"], [14, 16, 34, 16, 16, 20])
for i, (kat, uji, met, val, fmt, krit, src) in enumerate(summary_rows, 5):
    put(ws, i, [kat, uji, met, val, krit, src], [None, None, None, fmt, None, None])
    ws.cell(row=i, column=4).font = F_BOLD
    ws.cell(row=i, column=6).hyperlink = f"#'{src}'!A1"
    ws.cell(row=i, column=6).font = Font(name=FONT, size=10, color="1F5C5A", underline="single")
ws.cell(row=len(summary_rows) + 6, column=1,
        value="Belum diuji: Lighthouse (performa, dijalankan manual dari Chrome) dan akurasi jarak absolut CNC (perlu jangka sorong).").font = F_NOTE

for w in wb.worksheets:
    w.sheet_view.showGridLines = True
wb.save(OUT)
print(OUT, [w.title for w in wb.worksheets])
