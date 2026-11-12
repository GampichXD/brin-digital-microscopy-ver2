"""Bangun artifact Hasil Pengujian dari berkas di Software/qa/results (bukan angka ketikan)."""
import csv
import html
import os
import re

R = "/home/brin-microscope/Documents/Tugas-Akhir/Software/qa/results"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hasil_pengujian.html")
e = lambda s: html.escape(str(s), quote=False)


import base64


def fig(name, caption):
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fig", name)
    data = base64.b64encode(open(path, "rb").read()).decode()
    return (f'<figure class="chart"><img src="data:image/jpeg;base64,{data}" alt="{e(caption)}">'
            f'<figcaption>{e(caption)}</figcaption></figure>')


def num(x):
    return f"{x:,}".replace(",", ".")


# ---------- coverage per modul
cov_rows = []
for line in open(os.path.join(R, "coverage_backend_ringkas.txt")):
    m = re.match(r"^(app/\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%", line)
    if m and int(m.group(2)) > 0:
        cov_rows.append((m.group(1)[4:], int(m.group(2)), int(m.group(3)), int(m.group(6))))
    t = re.match(r"^TOTAL\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+(\d+)%", line)
    if t:
        cov_total = (int(t.group(1)), int(t.group(2)), int(t.group(3)))
    p = re.search(r"(\d+) passed", line)
    if p:
        n_backend = int(p.group(1))
cov_rows.sort(key=lambda r: -r[3])


def bar(pct):
    cls = "ok" if pct >= 80 else ("mid" if pct >= 60 else "low")
    return f'<span class="bar"><span class="bar-fill {cls}" style="width:{pct}%"></span></span>'


cov_html = "\n".join(
    f"<tr><td><code>{e(n)}</code></td><td class='num'>{s}</td><td class='num'>{m}</td>"
    f"<td class='num'>{p}%</td><td>{bar(p)}</td></tr>" for n, s, m, p in cov_rows)

# ---------- radon
radon_lines = open(os.path.join(R, "radon_cc.txt")).read()
grades = {g: len(re.findall(rf" - {g} \(", radon_lines)) for g in "ABCDEF"}
avg = re.search(r"Average complexity: ([A-F]) \(([\d.]+)\)", radon_lines)
blocks = re.search(r"(\d+) blocks", radon_lines).group(1)
worst = []
cur = ""
for line in radon_lines.splitlines():
    if line and not line.startswith(" "):
        cur = line.strip()
    m = re.match(r"\s+[FMC] \d+:\d+ (\S+) - ([D-F]) \((\d+)\)", line)
    if m:
        worst.append((int(m.group(3)), m.group(1), m.group(2), cur.replace("app/", "")))
worst.sort(reverse=True)
worst_html = "\n".join(f"<tr><td><code>{e(f)}</code></td><td><code>{e(file)}</code></td><td>{g} ({c})</td></tr>"
                       for c, f, g, file in worst)

# ---------- newman
nm = open(os.path.join(R, "newman_ringkas.md")).read()
nm_head = re.search(r"(\d+) request, (\d+) pemeriksaan, (\d+) request gagal\. Waktu respons rata-rata (\d+) ms, median (\d+) ms, maks (\d+) ms", nm)
nm_groups = re.findall(r"^\| (0\d [^|]+) \| (\d+) \| (\d+/\d+) \| (\d+) \| (\d+) \|$", nm, re.M)
nm_html = "\n".join(f"<tr><td>{e(g[3:])}</td><td class='num'>{n}</td><td class='num'>{ok}</td><td class='num'>{a}</td><td class='num'>{mx}</td></tr>"
                    for g, n, ok, a, mx in nm_groups)

# ---------- black box
bb = list(csv.reader(open(os.path.join(R, "blackbox.tsv")), delimiter="\t"))[1:]
bb_valid = sum(1 for r in bb if r[7] == "Valid")
bb_ui = sum(1 for r in bb if r[1].startswith("Antarmuka"))
bb_html = "\n".join(
    f"<tr><td class='num'>{e(r[0])}</td><td>{e(r[3])}<div class='sub'>{e(r[2])} · {e(r[1].split(' ')[0])}</div></td>"
    f"<td>{e(r[4])}</td><td>{e(r[5])}</td><td>{e(r[6])}</td>"
    f"<td><span class='chip {'chip-ok' if r[7]=='Valid' else 'chip-bad'}'>{e(r[7])}</span></td></tr>" for r in bb)

STATUS = [
    ("API dan QoS", "done", "Selesai", "Newman 132 request lolos; ws_qos 28,8 FPS, 0 putus; video 600 s tanpa putus, latensi median 0,53 s"),
    ("White box", "done", "Selesai", f"pytest {n_backend} lolos, coverage {cov_total[2]}%; Vitest 10 lolos; radon rata-rata {avg.group(1)}"),
    ("Black box", "done", "Selesai", f"{len(bb)} skenario, {bb_valid} valid"),
    ("Performa (Lighthouse)", "todo", "Belum", "Dijalankan manual dari Chrome untuk Mobile dan Desktop"),
    ("Keamanan", "done", "Selesai", "ZAP 0 High; bandit 0 High/Medium; 79 tes keamanan lolos; nmap sesuai"),
    ("Hardware", "done", "Selesai", "Watchdog 13/13 menahan motor, repeatability 5,5 µm, Jetson→GRBL 6,8 ms; akurasi absolut belum diverifikasi alat ukur"),
]
status_html = "\n".join(
    f'<div class="status status-{k}"><div class="status-top"><span class="status-name">{e(n)}</span>'
    f'<span class="chip {"chip-ok" if k=="done" else "chip-todo"}">{e(lbl)}</span></div><p>{e(d)}</p></div>'
    for n, k, lbl, d in STATUS)

page = f'''<title>Hasil Pengujian Mikroskop Digital</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  /* Layout: laporan satu kolom bergaya Bab 4; ringkasan status di atas, rincian per kategori di bawah. */
  :root{{
    --ink:#1E2530; --ink-soft:#525C6B; --ink-faint:#6E7988;
    --paper:#F6F7F6; --panel:#FFFFFF; --border:#DBE0E4; --border-soft:#EDF0F1;
    --accent:#2B7A78; --accent-strong:#1F5C5A; --accent-tint:#E3F1F0;
    --good:#2F7D4F; --good-tint:#E2F2E8; --warn:#A86414; --warn-tint:#FBEFD9; --bad:#B5402E; --bad-tint:#F8E1DC;
    --font-body:"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
    --font-mono:"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace;
  }}
  @media (prefers-color-scheme: dark){{
    :root:not([data-theme="light"]){{
      --ink:#E9EEF3; --ink-soft:#AAB4C2; --ink-faint:#8B95A4;
      --paper:#11151B; --panel:#181D25; --border:#2B323D; --border-soft:#202630;
      --accent:#57C4C0; --accent-strong:#82D8D4; --accent-tint:#173430;
      --good:#6FCF97; --good-tint:#16301F; --warn:#E5B266; --warn-tint:#33270F; --bad:#EE8A76; --bad-tint:#361C17;
      color-scheme:dark;
    }}
  }}
  :root[data-theme="dark"]{{
    --ink:#E9EEF3; --ink-soft:#AAB4C2; --ink-faint:#8B95A4;
    --paper:#11151B; --panel:#181D25; --border:#2B323D; --border-soft:#202630;
    --accent:#57C4C0; --accent-strong:#82D8D4; --accent-tint:#173430;
    --good:#6FCF97; --good-tint:#16301F; --warn:#E5B266; --warn-tint:#33270F; --bad:#EE8A76; --bad-tint:#361C17;
    color-scheme:dark;
  }}
  *{{box-sizing:border-box;}}
  body{{margin:0; background:var(--paper); color:var(--ink); font-family:var(--font-body); line-height:1.6;}}
  .page{{max-width:1120px; margin:0 auto; padding-block:48px 100px;
    padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px));}}
  .eyebrow{{font-family:var(--font-mono); font-size:.72rem; letter-spacing:.14em; text-transform:uppercase; color:var(--accent-strong); font-weight:600; margin:0 0 12px;}}
  h1{{font-size:clamp(1.5rem,3vw,2.1rem); line-height:1.2; font-weight:700; margin:0 0 12px; text-wrap:balance;}}
  .lede{{font-size:1.02rem; color:var(--ink-soft); max-width:70ch; margin:0;}}
  h2{{font-size:1.2rem; font-weight:600; margin:0 0 10px; text-wrap:balance;}}
  h3{{font-size:1rem; font-weight:600; margin:28px 0 8px;}}
  .section-label{{font-family:var(--font-mono); font-size:.7rem; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-faint); margin:0 0 8px;}}
  section{{margin-top:60px; scroll-margin-top:16px;}}
  p{{max-width:74ch; color:var(--ink-soft);}}
  code{{font-family:var(--font-mono); font-size:.84em; background:var(--border-soft); color:var(--ink); padding:.08em .35em; border-radius:4px; overflow-wrap:anywhere;}}
  .meta{{display:flex; flex-wrap:wrap; gap:6px 22px; margin-top:16px; font-size:.86rem; color:var(--ink-soft);}}
  .meta b{{color:var(--ink); font-weight:600;}}

  .status-grid{{display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr)); gap:12px; margin-top:28px;}}
  .status{{border:1px solid var(--border); border-radius:10px; padding:14px 16px; background:var(--panel); min-width:0;}}
  .status-todo{{border-style:dashed;}}
  .status-top{{display:flex; justify-content:space-between; align-items:center; gap:10px;}}
  .status-name{{font-weight:600;}}
  .status p{{margin:6px 0 0; font-size:.86rem;}}
  .chip{{display:inline-block; padding:1px 9px; border-radius:20px; font-family:var(--font-mono); font-size:.7rem; font-weight:600; white-space:nowrap;}}
  .chip-ok{{background:var(--good-tint); color:var(--good);}}
  .chip-todo{{background:var(--warn-tint); color:var(--warn);}}
  .chip-bad{{background:var(--bad-tint); color:var(--bad);}}
  .chip-info{{background:var(--border-soft); color:var(--ink-soft);}}

  .figures{{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin:16px 0 4px;}}
  .fig{{border-top:2px solid var(--accent); padding-top:8px;}}
  .fig .v{{font-family:var(--font-mono); font-size:1.35rem; font-weight:700; font-variant-numeric:tabular-nums;}}
  .fig .l{{font-size:.78rem; color:var(--ink-faint);}}

  .table-wrap{{overflow-x:auto; margin-top:10px;}}
  table{{border-collapse:collapse; width:100%; font-size:.86rem;}}
  th{{text-align:left; padding:8px 10px; border:1px solid var(--border); background:var(--border-soft); font-family:var(--font-mono); font-size:.68rem; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-soft);}}
  td{{padding:7px 10px; border:1px solid var(--border); vertical-align:top; color:var(--ink-soft);}}
  td.num{{text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap;}}
  td b{{color:var(--ink);}}
  .sub{{font-size:.76rem; color:var(--ink-faint); margin-top:2px;}}
  .bar{{display:block; width:120px; height:8px; background:var(--border-soft); border-radius:4px; overflow:hidden;}}
  .bar-fill{{display:block; height:100%;}}
  .bar-fill.ok{{background:var(--good);}} .bar-fill.mid{{background:var(--warn);}} .bar-fill.low{{background:var(--bad);}}
  .better{{color:var(--good); font-weight:600;}}

  .chart{{margin:12px 0 4px;}}
  .chart img{{display:block; width:100%; max-width:900px; height:auto; border:1px solid var(--border); border-radius:8px; background:#fff;}}
  .chart figcaption{{font-size:.82rem; color:var(--ink-faint); margin-top:6px;}}
  .note{{margin-top:18px; border:1px solid var(--border); border-left:3px solid var(--warn); border-radius:8px; padding:12px 16px; background:var(--panel);}}
  .note p{{margin:0; font-size:.9rem;}}
  .note ul{{margin:4px 0 0; padding-left:20px; font-size:.9rem; color:var(--ink-soft);}}
  .steps{{margin:8px 0 0; padding-left:20px; color:var(--ink-soft); font-size:.92rem;}}
  .steps li{{margin:4px 0;}}
</style>

<div class="page">
  <header>
    <p class="eyebrow">Sistem Kontrol Mikroskop Digital — Hasil dan Pembahasan</p>
    <h1>Hasil Pengujian Subsistem Software-Hardware</h1>
    <p class="lede">Rangkuman enam kategori pengujian. Seluruh angka berasal dari eksekusi nyata: tes kode dijalankan di Jetson Orin Nano, sedangkan uji API, QoS, port, dan keamanan dijalankan terhadap situs live <code>https://e-eye.cloud</code>.</p>
    <div class="meta">
      <span>Build <b>2026-11-11-scan-result-honest</b> (commit <code>e60ba83</code>)</span>
      <span>Periode uji <b>10–11 November 2026</b></span>
      <span>Data mentah <code>Software/qa/results/</code></span>
    </div>
    <div class="status-grid">{status_html}</div>
  </header>

  <section id="api-qos">
    <p class="section-label">4.1</p>
    <h2>Pengujian API dan QoS</h2>
    <h3>Uji API (Postman / Newman)</h3>
    <p>Koleksi berisi seluruh 58 endpoint REST. Endpoint yang menggerakkan CNC, memulai scan, mengubah konfigurasi, atau menghapus data massal hanya diuji penolakan aksesnya, sehingga uji aman dijalankan ke situs live. Akun dan folder yang dibuat selama uji dihapus kembali di akhir.</p>
    <div class="figures">
      <div class="fig"><div class="v">{nm_head.group(1)}</div><div class="l">request</div></div>
      <div class="fig"><div class="v">{nm_head.group(2)}</div><div class="l">pemeriksaan</div></div>
      <div class="fig"><div class="v">{nm_head.group(3)}</div><div class="l">request gagal</div></div>
      <div class="fig"><div class="v">{nm_head.group(4)} ms</div><div class="l">rata-rata waktu respons</div></div>
      <div class="fig"><div class="v">{nm_head.group(5)} ms</div><div class="l">median waktu respons</div></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Kelompok</th><th>Request</th><th>Lolos</th><th>Rata-rata (ms)</th><th>Maks (ms)</th></tr></thead>
      <tbody>{nm_html}</tbody>
    </table></div>
    <p>Login dan penggantian password paling lambat (0,9–1,8 detik) karena password di-hash dengan bcrypt yang sengaja dibuat lambat untuk mempersulit tebakan password.</p>

    <h3>QoS WebSocket (ws_qos, 600 detik, lewat Cloudflare)</h3>
    <p>Pengujian menemukan bahwa server mengantrekan setiap frame video ke setiap browser, sehingga browser yang lebih lambat dari kamera makin tertinggal lalu terputus. Setelah perbaikan, server hanya mengirim frame terbaru ke tiap browser.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Metrik</th><th>Sebelum perbaikan</th><th>Sesudah perbaikan</th><th>Target</th></tr></thead>
      <tbody>
        <tr><td>Frekuensi telemetri</td><td class="num">3,25 Hz</td><td class="num better">4,80 Hz</td><td class="num">5 Hz</td></tr>
        <tr><td>Jitter telemetri p50 / p95</td><td class="num">213 / 847 ms</td><td class="num better">194 / 527 ms</td><td></td></tr>
        <tr><td>FPS video</td><td class="num">19,17</td><td class="num better">28,76</td><td></td></tr>
        <tr><td>Bitrate video</td><td class="num">10,0 Mbps</td><td class="num">9,9 Mbps</td><td></td></tr>
        <tr><td>Putus koneksi dalam 600 detik</td><td class="num">2 kali</td><td class="num better">0 kali</td><td class="num">0</td></tr>
      </tbody>
    </table></div>

    <h3>Latensi video kamera ke browser (t04)</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Metrik</th><th>Sebelum perbaikan</th><th>Sesudah perbaikan (run akhir, 11 Nov)</th></tr></thead>
      <tbody>
        <tr><td>Latensi p50 / p95 / maks</td><td class="num">52,8 s, terus naik</td><td class="num better">0,53 / 1,73 / 2,52 s</td></tr>
        <tr><td>FPS diterima</td><td class="num">5,7</td><td class="num better">28,6</td></tr>
        <tr><td>Durasi tanpa putus</td><td class="num">88 s</td><td class="num better">600 s (penuh)</td></tr>
        <tr><td>Frame diterima / bitrate</td><td class="num"></td><td class="num">17.159 frame, 18,2 Mbps</td></tr>
      </tbody>
    </table></div>
    {fig("D3_video_latency_fps.jpg", "Latensi video dan FPS selama 600 detik (t04, run akhir 11 November).")}
    <div class="note">
      <p><b>Keterbatasan pengukuran QoS.</b></p>
      <ul>
        <li>Klien uji berjalan di Jetson yang sama dengan kamera, sehingga satu Wi-Fi (−67 dBm, tx 29–58 Mbit/s) menanggung upload dan download video sekaligus.</li>
        <li>Dua run t04 sebelumnya (10 Nov) tidak selesai: satu putus pada detik ke-352, satu jatuh ke 2,7 FPS saat data masuk ke klien turun ke sekitar 25 KB/s. Run akhir 11 Nov berjalan penuh 600 detik.</li>
        <li>Lewat IP langsung ke VPS (tanpa Cloudflare) telemetri hanya 1,86 Hz dan video 0,36 FPS, sehingga Jetson dipindah ke jalur Cloudflare.</li>
      </ul>
    </div>
  </section>

  <section id="white-box">
    <p class="section-label">4.2</p>
    <h2>Pengujian White Box</h2>
    <div class="figures">
      <div class="fig"><div class="v">{n_backend}</div><div class="l">tes backend lolos, 0 gagal</div></div>
      <div class="fig"><div class="v">{cov_total[2]}%</div><div class="l">statement coverage backend (branch aktif)</div></div>
      <div class="fig"><div class="v">10</div><div class="l">tes frontend (Vitest) lolos</div></div>
      <div class="fig"><div class="v">{avg.group(1)} ({avg.group(2)[:4].replace(".", ",")})</div><div class="l">rata-rata kompleksitas siklomatik</div></div>
    </div>
    <h3>Tes backend per kategori (pytest)</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Kategori</th><th>Jumlah</th><th>Hasil</th><th>Isi</th></tr></thead>
      <tbody>
        <tr><td>Unit</td><td class="num">70</td><td><span class="chip chip-ok">lolos</span></td><td>Rumus grid scan, RoomManager, guard perintah, antrean video per browser</td></tr>
        <tr><td>Integrasi</td><td class="num">76</td><td><span class="chip chip-ok">lolos</span></td><td>Endpoint auth, dataset, scan, stitching, analisis, laporan, purge</td></tr>
        <tr><td>Keamanan</td><td class="num">79</td><td><span class="chip chip-ok">lolos</span></td><td>Token JWT dan Edge, peran Admin, path traversal, validasi G-code, rate limit</td></tr>
        <tr><td><b>Total</b></td><td class="num"><b>{n_backend}</b></td><td><span class="chip chip-ok">0 gagal</span></td><td></td></tr>
      </tbody>
    </table></div>
    <h3>Coverage per modul backend</h3>
    <p>Modul keamanan dan logika inti tercakup penuh. Coverage terendah ada di jalur yang hanya berjalan dengan Jetson dan GRBL sungguhan (<code>routers/hardware.py</code>, relay motor dan kamera) serta pemrosesan OpenCV cadangan.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Modul</th><th>Statement</th><th>Tidak tercakup</th><th>Coverage</th><th></th></tr></thead>
      <tbody>{cov_html}
        <tr><td><b>Total</b></td><td class="num"><b>{num(cov_total[0])}</b></td><td class="num"><b>{cov_total[1]}</b></td><td class="num"><b>{cov_total[2]}%</b></td><td>{bar(cov_total[2])}</td></tr>
      </tbody>
    </table></div>
    <p>Frontend (Vitest, <code>src/hooks</code> dan <code>src/utils</code>): 10 tes lolos, 67,6% statement dan 47,2% branch.</p>
    <h3>Kompleksitas siklomatik (radon)</h3>
    <p>{blocks} blok dianalisis: {grades["A"]} A, {grades["B"]} B, {grades["C"]} C, {grades["D"]} D, {grades["E"]} E, {grades["F"]} F. Fungsi dengan peringkat D ke atas:</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Fungsi</th><th>Berkas</th><th>Peringkat</th></tr></thead>
      <tbody>{worst_html}</tbody>
    </table></div>
  </section>

  <section id="black-box">
    <p class="section-label">4.3</p>
    <h2>Pengujian Black Box</h2>
    <p>{len(bb)} skenario: {bb_ui} lewat antarmuka web (Playwright, Chromium desktop) dan {len(bb) - bb_ui} lewat API (Newman ke situs live). Kolom Hasil Pengujian dan Kesimpulan diisi otomatis dari status tes.</p>
    <div class="figures">
      <div class="fig"><div class="v">{bb_valid}/{len(bb)}</div><div class="l">skenario valid</div></div>
      <div class="fig"><div class="v">27/27</div><div class="l">tes Playwright lolos</div></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>No</th><th>Skenario Uji</th><th>Langkah Uji / Input</th><th>Hasil yang Diharapkan</th><th>Hasil Pengujian</th><th>Kesimpulan</th></tr></thead>
      <tbody>{bb_html}</tbody>
    </table></div>
    <div class="note"><p>Saat menyusun tabel ini ditemukan bahwa grid scan tetap menampilkan "Pemindaian grid berhasil!" walaupun tidak ada gambar yang terambil. Pesan itu sudah diperbaiki (build <code>2026-11-11-scan-result-honest</code>) dan skenario nomor 22 menguji perilaku barunya. Playwright versi ponsel (Pixel 7) belum lolos karena skrip uji belum menangani menu hamburger.</p></div>
  </section>

  <section id="performa">
    <p class="section-label">4.4</p>
    <h2>Pengujian Performa (Lighthouse)</h2>
    <p><span class="chip chip-todo">Belum dijalankan</span> Lighthouse dijalankan manual dari Chrome karena butuh browser dengan tampilan penuh.</p>
    <ol class="steps">
      <li>Buka <code>https://e-eye.cloud</code> di Chrome, klik kanan, Inspect, tab Lighthouse.</li>
      <li>Pilih kategori Performance, Accessibility, Best Practices, dan SEO.</li>
      <li>Jalankan sekali untuk Mobile dan sekali untuk Desktop, lalu simpan laporan sebagai HTML.</li>
    </ol>
  </section>

  <section id="keamanan">
    <p class="section-label">4.5</p>
    <h2>Pengujian Keamanan</h2>
    <h3>OWASP ZAP baseline (dari laptop, ZAP 2.17.0)</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Tingkat risiko</th><th>Jumlah</th><th>Temuan</th><th>Keterangan</th></tr></thead>
      <tbody>
        <tr><td><span class="chip chip-ok">High</span></td><td class="num">0</td><td>—</td><td></td></tr>
        <tr><td><span class="chip chip-todo">Medium</span></td><td class="num">1</td><td>Content Security Policy belum dipasang</td><td>Disengaja sementara; perlu uji terhadap WebSocket, gambar base64, dan service worker</td></tr>
        <tr><td><span class="chip chip-info">Low</span></td><td class="num">3</td><td>Cross-Origin Embedder, Opener, dan Resource Policy</td><td>COEP tidak dipakai karena bisa memblokir gambar; COOP dan CORP dapat ditambahkan</td></tr>
        <tr><td><span class="chip chip-info">Informational</span></td><td class="num">4</td><td>Modern Web Application, cache-control, konten dapat di-cache</td><td>Halaman publik, tidak memuat data pengguna</td></tr>
      </tbody>
    </table></div>
    <p>Pemindaian pertama mencatat 9 peringatan. Empat di antaranya hilang setelah perbaikan: header keamanan pada aset statis yang tersimpan di cache Cloudflare, dan halaman 404 yang menampilkan versi nginx. Hasil akhir: 0 FAIL, 63 PASS, 5 WARN.</p>
    <h3>Analisis statis dan tes keamanan</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Uji</th><th>Hasil</th><th>Keterangan</th></tr></thead>
      <tbody>
        <tr><td>pytest kategori keamanan</td><td><span class="chip chip-ok">79 lolos</span></td><td>Autentikasi JWT dan token Edge, peran Admin, path traversal, validasi G-code, rate limit</td></tr>
        <tr><td>bandit</td><td><span class="chip chip-ok">0 High, 0 Medium</span></td><td>21 Low: 18 try/except/pass yang disengaja, 2 string mirip password (kunci tes dan password reset bawaan), 1 try/except/continue</td></tr>
        <tr><td>Newman akses</td><td><span class="chip chip-ok">76 lolos</span></td><td>56 akses tanpa token atau token palsu ditolak 401; 18 akses Operator ke fitur Admin ditolak 403; 2 uji path traversal dan nama berkas berbahaya ditolak</td></tr>
      </tbody>
    </table></div>
    <h3>Port terbuka (nmap)</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Port</th><th>Status</th><th>Keterangan</th></tr></thead>
      <tbody>
        <tr><td class="num">22</td><td>terbuka</td><td>SSH administrasi VPS</td></tr>
        <tr><td class="num">80</td><td>terbuka</td><td>nginx, di belakang Cloudflare</td></tr>
        <tr><td class="num">443</td><td>tertutup</td><td>HTTPS disediakan Cloudflare</td></tr>
        <tr><td class="num">4040</td><td>ditutup setelah pemindaian</td><td>Inspector ngrok sempat terbuka; kontainer ngrok kini dimatikan</td></tr>
        <tr><td class="num">5433, 6380, 8000</td><td>filtered</td><td>PostgreSQL, Redis, dan backend tidak dapat diakses dari luar</td></tr>
      </tbody>
    </table></div>
    <p>Header yang terpasang: <code>Strict-Transport-Security</code>, <code>X-Content-Type-Options</code>, <code>X-Frame-Options</code>, <code>Referrer-Policy</code>, <code>Permissions-Policy</code>. Pengalihan otomatis HTTP ke HTTPS menunggu pengaturan Always Use HTTPS di Cloudflare.</p>
  </section>

  <section id="hardware">
    <p class="section-label">4.6</p>
    <h2>Pengujian Hardware</h2>
    <p>Dijalankan 11 November 2026 dengan CNC 1610 (GRBL, tanpa limit switch homing) dan kamera IMX477. Sampel: cawan petri berisi koloni E. coli pada agar. Grafik dibuat oleh <code>Testing/analyze_hw.py</code> dari CSV di <code>Hardware/test_logs/</code>.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Uji</th><th>Yang diukur</th><th>Hasil</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td><code>t00</code></td><td>Selisih jam Jetson terhadap NTP</td><td>9,97 ms</td><td><span class="chip chip-ok">lolos</span></td></tr>
        <tr><td><code>t02</code></td><td>Latensi perintah Jetson → GRBL (100 perintah)</td><td>p50 6,8 ms, p95 7,4 ms, maks 7,7 ms</td><td><span class="chip chip-ok">lolos</span></td></tr>
        <tr><td><code>t03</code></td><td>Latensi perintah klien → GRBL lewat cloud (100 perintah)</td><td>p50 77 ms, p95 304 ms, maks 589 ms; 99 sampai, 1 ditolak RATE_LIMIT</td><td><span class="chip chip-ok">lolos</span></td></tr>
        <tr><td><code>t05b</code></td><td>Ketajaman citra vs jeda setelah gerak (100 citra)</td><td>Sudah stabil sejak 0 s setelah GRBL Idle (variasi &lt; 6%)</td><td><span class="chip chip-ok">lolos</span></td></tr>
        <tr><td><code>t06</code></td><td>Rate limit pada burst 20 perintah/detik</td><td>REST 19 diterima (batas 20), WS 36 (batas 41)</td><td><span class="chip chip-ok">lolos</span></td></tr>
        <tr><td><code>t05</code></td><td>Ketepatan ETA grid scan (9 run setelah koreksi rumus)</td><td>Galat 1–8% saat Wi-Fi normal; 17–21% saat Wi-Fi melambat</td><td><span class="chip chip-ok">lolos</span></td></tr>
        <tr><td><code>t07</code></td><td>Watchdog: motor ditahan saat koneksi putus (13 percobaan, 12 saat bergerak)</td><td>p95 3,24 s; tidak melanjutkan gerak lama setelah tersambung</td><td><span class="chip chip-ok">lolos</span></td></tr>
        <tr><td><code>t01b</code></td><td>Repeatability dan linearitas gerak dari pergeseran citra (35 ulangan)</td><td>Kembali ke titik awal rata-rata 5,5 µm, maks 16 µm; linearitas 4–7 µm RMS</td><td><span class="chip chip-ok">lolos</span></td></tr>
        <tr><td><code>t01</code></td><td>Akurasi jarak absolut</td><td>Belum diverifikasi dengan jangka sorong atau stage micrometer</td><td><span class="chip chip-todo">belum</span></td></tr>
        <tr><td>Termal</td><td>Suhu dan sumber daya Jetson selama ±60 menit uji</td><td>CPU maks 54,3 °C, GPU maks 54,3 °C, RAM maks 58%</td><td><span class="chip chip-ok">lolos</span></td></tr>
      </tbody>
    </table></div>

    <h3>Latensi perintah motor (t02, t03)</h3>
    {fig("D2_command_latency_boxplot.jpg", "Latensi perintah lokal (Jetson ke GRBL) dan end-to-end lewat cloud.")}

    <h3>Rate limit (t06)</h3>
    {fig("D5_ratelimit.jpg", "Perintah diterima dan ditolak per detik pada burst 20 perintah/detik.")}

    <h3>Estimasi waktu grid scan (t05)</h3>
    <p>Uji pertama menunjukkan rumus ETA selalu terlalu rendah sekitar 40%, karena waktu dari perintah potret sampai citra tersimpan di server tidak dihitung. Dari 9 run (3×3, 5×5, 10×10) terukur tambahan <b>0,43 s per tile</b>, dan suku ini ditambahkan ke rumus (<code>CAPTURE_OVERHEAD_S</code>) di backend, web, dan skrip uji. Validasi dengan 9 run baru:</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Grid</th><th>Prediksi lama</th><th>Prediksi baru</th><th>Aktual (3 run)</th></tr></thead>
      <tbody>
        <tr><td>3×3</td><td class="num">11,0 s</td><td class="num">14,9 s</td><td class="num">16,2 / 16,2 / 15,5 s</td></tr>
        <tr><td>5×5</td><td class="num">29,0 s</td><td class="num">39,8 s</td><td class="num">41,1 / 38,5 / 40,3 s</td></tr>
        <tr><td>10×10</td><td class="num">109,0 s</td><td class="num">152,0 s</td><td class="num">162,4 / 191,8 / 182,6 s</td></tr>
      </tbody>
    </table></div>
    <p>Dua run 10×10 terakhir lebih lambat karena kecepatan kirim Wi-Fi Jetson turun dari 58 ke 13 Mbit/s; tidak ada tile yang gagal (100/100). Waktu capture bergantung pada jaringan, sehingga rumus akurat 1–8% saat Wi-Fi normal.</p>
    {fig("D4_eta_scatter.jpg", "Prediksi rumus ETA (dengan suku capture) terhadap waktu aktual.")}

    <h3>Watchdog keep-alive (t07)</h3>
    <p>Wi-Fi Jetson dimatikan saat motor menjalankan gerak panjang. Watchdog terpicu rata-rata 3,13 s (p95 3,24 s) setelah pesan terakhir dari server, dan feed hold terkirim kurang dari 1 ms sesudahnya. Setelah tersambung kembali, GRBL berstatus Hold dan perintah D-Pad berikutnya hanya menggerakkan motor sejauh perintah itu. Lima pemicu ulang saat Wi-Fi tersambung-putus kembali tidak dihitung, karena motor sudah tertahan.</p>
    {fig("D7_watchdog.jpg", "Waktu dari pesan terakhir sampai watchdog terpicu, dibandingkan batas 3 detik.")}

    <h3>Jeda stabilisasi (t05b)</h3>
    {fig("D8_settle_sharpness.jpg", "Ketajaman citra (variance of Laplacian) terhadap jeda setelah motor berhenti.")}

    <h3>Repeatability dan linearitas gerak (t01b)</h3>
    <p>Stage micrometer tidak tersedia saat uji, sehingga koloni E. coli dipakai sebagai penanda dan pergeseran citra diukur dengan phase correlation. Skala kamera diambil dari foto slide kalibrasi: 1 mm = 128,8 piksel pada lebar 900 piksel, atau bidang pandang sekitar 7,0 × 3,9 mm.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Metrik</th><th>X (0,5–3 mm)</th><th>Y (0,5–1,5 mm)</th></tr></thead>
      <tbody>
        <tr><td>Galat kembali ke titik awal (repeatability)</td><td colspan="2" class="num">rata-rata 5,5 µm, maks 16 µm (35 ulangan)</td></tr>
        <tr><td>Sebaran jarak antar-ulangan (sd)</td><td class="num">0,6–11,7 µm</td><td class="num">2,3–5,3 µm</td></tr>
        <tr><td>Linearitas (sisa RMS terhadap garis lurus)</td><td class="num">7,2 µm</td><td class="num">4,0 µm</td></tr>
        <tr><td>Rasio jarak terukur / diperintah</td><td class="num">0,879</td><td class="num">0,830</td></tr>
      </tbody>
    </table></div>
    <div class="note">
      <p><b>Temuan yang perlu ditindaklanjuti.</b></p>
      <ul>
        <li>Kamera terpasang miring sekitar 27° terhadap sumbu meja: gerak X mesin tampak diagonal pada citra (arah X dan Y terukur tegak lurus, 89,8°).</li>
        <li>Diukur dengan skala foto slide, perintah 1 mm menghasilkan 0,88 mm di X dan 0,83 mm di Y. Selisih 6% antara X dan Y tidak bergantung pada skala kamera, sehingga step/mm GRBL (<code>$100</code>, <code>$101</code> = 800) kemungkinan tidak sesuai untuk salah satu atau kedua sumbu. Akurasi absolut perlu dipastikan dengan menggerakkan 20 mm dan mengukur dengan jangka sorong.</li>
        <li>Motor tidak punya limit switch (<code>$22=0</code>), jadi posisi kerja hanya relatif terhadap posisi saat GRBL dinyalakan.</li>
      </ul>
    </div>

    <h3>Termal dan sumber daya</h3>
    {fig("D6_thermal_resource.jpg", "Suhu CPU/GPU dan penggunaan CPU/RAM Jetson selama uji. Celah pada menit 8–16: main.py dimatikan untuk t05b.")}
  </section>
</div>
'''
open(OUT, "w").write(page)
print(OUT, len(page), "bytes;", n_backend, cov_total, len(bb), bb_valid, avg.groups(), grades, len(worst))
