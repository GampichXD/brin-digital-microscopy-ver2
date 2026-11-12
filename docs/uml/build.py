import html
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import diagrams as D  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uml_revisi.html")

INIT = ("%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','primaryColor':'#ffffff',"
        "'primaryTextColor':'#000000','primaryBorderColor':'#000000','lineColor':'#000000',"
        "'secondaryColor':'#ffffff','tertiaryColor':'#ffffff','clusterBkg':'#ffffff','clusterBorder':'#000000',"
        "'actorBkg':'#ffffff','actorBorder':'#000000','actorTextColor':'#000000','actorLineColor':'#000000',"
        "'signalColor':'#000000','signalTextColor':'#000000','labelBoxBkgColor':'#ffffff',"
        "'labelBoxBorderColor':'#000000','labelTextColor':'#000000','loopTextColor':'#000000',"
        "'noteBkgColor':'#ffffff','noteBorderColor':'#000000','noteTextColor':'#000000',"
        "'activationBkgColor':'#ffffff','activationBorderColor':'#000000','edgeLabelBackground':'#ffffff',"
        "'fontFamily':'Arial, Helvetica, sans-serif','fontSize':'14px'}}}%%\n")

counter = {"n": 0}


def diagram(code, caption, label_note=""):
    counter["n"] += 1
    i = counter["n"]
    esc = html.escape(code, quote=False)
    note = f'<span class="box-note"> — {label_note}</span>' if label_note else ""
    return f'''
    <figure>
      <div class="diagram-frame"><pre class="mermaid">{html.escape(INIT + code, quote=False)}</pre></div>
      <figcaption><b>Gambar.</b> {caption}</figcaption>
    </figure>
    <div class="mermaid-box">
      <div class="mermaid-box-head">
        <p class="mermaid-box-label">Kode Mermaid.js{note}</p>
        <button type="button" class="copy-btn" data-target="code-{i}" id="copy-{i}">Salin kode</button>
      </div>
      <pre><code id="code-{i}">{esc}</code></pre>
    </div>'''


uc_rows = "\n".join(
    f'<tr><td>UC{u["no"]}</td><td><a href="#uc-{u["no"]}">{html.escape(u["name"])}</a></td>'
    f'<td>{html.escape(u["actor"])}</td><td>{len(u["endpoints"])}</td></tr>' for u in D.UC)

toc = "\n".join(f'<li><a href="#uc-{u["no"]}"><span class="toc-no">UC{u["no"]}</span> {html.escape(u["name"])}</a></li>'
                for u in D.UC)

uc_sections = []
for u in D.UC:
    eps = "".join(f"<code>{html.escape(e)}</code>" for e in u["endpoints"])
    uc_sections.append(f'''
  <section id="uc-{u["no"]}">
    <p class="section-label">Use Case {u["no"]} — {html.escape(u["name"])}</p>
    <h2>{html.escape(u["name"])}</h2>
    <p class="uc-summary">{html.escape(u["summary"])}</p>
    <div class="uc-meta"><span class="meta-key">Aktor</span><span>{html.escape(u["actor"])}</span></div>
    <div class="uc-meta"><span class="meta-key">Endpoint</span><span class="ep-list">{eps}</span></div>
    <h3>Activity Diagram: {html.escape(u["name"])}</h3>
    {diagram(u["activity"], f"Activity Diagram {html.escape(u['name'])}.", "flowchart TD")}
    <h3>Sequence Diagram: {html.escape(u["name"])}</h3>
    {diagram(u["sequence"], f"Sequence Diagram {html.escape(u['name'])}.")}
  </section>''')

status_txt = {"ok": ("Digambar", "st-ok"), "mid": ("Tercakup", "st-mid"), "na": ("N/A", "st-na")}
trace_rows = "\n".join(
    f'<tr><td><code>{html.escape(e)}</code></td><td>{html.escape(uc)}</td>'
    f'<td><span class="st {status_txt[s][1]}">{status_txt[s][0]}</span>{(" " + html.escape(n)) if n else ""}</td></tr>'
    for e, uc, s, n in D.TRACE)
n_drawn = sum(1 for t in D.TRACE if t[2] == "ok")
n_cov = sum(1 for t in D.TRACE if t[2] == "mid")
n_na = sum(1 for t in D.TRACE if t[2] == "na")

page = f'''<title>UML Mikroskop Digital Revisi</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  /* Layout: satu kolom dokumen teknis; diagram selalu hitam-putih di kotak putih agar siap ditempel ke skripsi. */
  :root{{
    --ink:#1E2530; --ink-soft:#525C6B; --ink-faint:#6E7988;
    --paper:#F6F7F6; --panel:#FFFFFF; --border:#DBE0E4; --border-soft:#EDF0F1;
    --accent:#2B7A78; --accent-strong:#1F5C5A; --accent-tint:#E3F1F0;
    --warn:#B5502E;
    --font-body:"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
    --font-mono:"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace;
  }}
  @media (prefers-color-scheme: dark){{
    :root:not([data-theme="light"]){{
      --ink:#E9EEF3; --ink-soft:#AAB4C2; --ink-faint:#8B95A4;
      --paper:#11151B; --panel:#181D25; --border:#2B323D; --border-soft:#202630;
      --accent:#57C4C0; --accent-strong:#82D8D4; --accent-tint:#173430; --warn:#E08A66;
      color-scheme:dark;
    }}
  }}
  :root[data-theme="dark"]{{
    --ink:#E9EEF3; --ink-soft:#AAB4C2; --ink-faint:#8B95A4;
    --paper:#11151B; --panel:#181D25; --border:#2B323D; --border-soft:#202630;
    --accent:#57C4C0; --accent-strong:#82D8D4; --accent-tint:#173430; --warn:#E08A66;
    color-scheme:dark;
  }}
  *{{box-sizing:border-box;}}
  body{{margin:0; background:var(--paper); color:var(--ink); font-family:var(--font-body); line-height:1.6;}}
  .page{{max-width:1120px; margin:0 auto; padding-block:48px 100px;
    padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px));}}
  header.hero{{margin-bottom:36px;}}
  .eyebrow{{font-family:var(--font-mono); font-size:.72rem; letter-spacing:.14em; text-transform:uppercase; color:var(--accent-strong); font-weight:600; margin:0 0 12px;}}
  h1{{font-size:clamp(1.5rem,3vw,2.1rem); line-height:1.2; font-weight:700; margin:0 0 12px; text-wrap:balance;}}
  .lede{{font-size:1.02rem; color:var(--ink-soft); max-width:68ch; margin:0;}}
  h2{{font-size:1.2rem; font-weight:600; margin:0 0 10px; text-wrap:balance;}}
  h3{{font-size:1rem; font-weight:600; margin:32px 0 12px;}}
  .section-label{{font-family:var(--font-mono); font-size:.7rem; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-faint); margin:0 0 8px;}}
  section{{margin-top:64px; scroll-margin-top:16px;}}
  p{{max-width:72ch;}}
  a{{color:var(--accent-strong);}}
  a:focus-visible, button:focus-visible{{outline:2px solid var(--accent); outline-offset:2px;}}
  figure{{margin:0;}}
  .diagram-frame{{background:#FFFFFF; border:1px solid #000000; border-radius:12px; padding:18px; overflow-x:auto;}}
  .diagram-frame pre.mermaid{{margin:0; background:#FFFFFF; color:#000000; display:flex; justify-content:center; min-width:min-content;}}
  .diagram-frame svg{{max-width:none; height:auto;}}
  figcaption{{margin-top:10px; font-size:.86rem; color:var(--ink-faint);}}
  figcaption b{{color:var(--ink-soft);}}

  .mermaid-box{{margin:14px 0 0; border:1px solid var(--border); border-radius:10px; background:var(--panel); overflow:hidden;}}
  .mermaid-box-head{{display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:6px 10px 6px 14px; background:var(--border-soft); border-bottom:1px solid var(--border);}}
  .mermaid-box-label{{margin:0; font-family:var(--font-mono); font-size:.68rem; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-faint);}}
  .box-note{{text-transform:none; letter-spacing:0;}}
  .mermaid-box pre{{margin:0; padding:14px; overflow:auto; max-height:360px;}}
  .mermaid-box code{{font-family:var(--font-mono); font-size:.76rem; line-height:1.65; color:var(--ink); white-space:pre;}}
  .copy-btn{{font-family:var(--font-mono); font-size:.72rem; font-weight:600; color:var(--accent-strong); background:var(--panel); border:1px solid var(--border); border-radius:6px; padding:5px 10px; cursor:pointer;}}
  .copy-btn:hover{{border-color:var(--accent);}}

  .stat-row{{display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; margin:24px 0 0;}}
  .stat{{border:1px solid var(--border); border-radius:10px; padding:12px 14px; background:var(--panel);}}
  .stat .num{{font-family:var(--font-mono); font-size:1.4rem; font-weight:700; font-variant-numeric:tabular-nums;}}
  .stat .lbl{{font-size:.76rem; color:var(--ink-faint);}}

  .note{{margin-top:32px; border:1px solid var(--border); border-radius:10px; padding:16px 20px; background:var(--panel);}}
  .note-label{{font-family:var(--font-mono); font-size:.7rem; letter-spacing:.12em; text-transform:uppercase; color:var(--accent-strong); font-weight:600; margin:0 0 8px;}}
  .note ul{{margin:6px 0 0; padding-left:20px; color:var(--ink-soft); font-size:.92rem;}}
  .note li{{margin:3px 0;}}
  .note p{{margin:0; color:var(--ink-soft); font-size:.92rem;}}

  .toc{{columns:2 260px; column-gap:28px; padding:0; margin:12px 0 0; list-style:none;}}
  .toc li{{break-inside:avoid; padding:3px 0;}}
  .toc a{{text-decoration:none; color:var(--ink);}}
  .toc a:hover{{color:var(--accent-strong);}}
  .toc-no{{display:inline-block; min-width:3.2em; font-family:var(--font-mono); font-size:.8rem; color:var(--ink-faint);}}

  .uc-summary{{color:var(--ink-soft); margin:0 0 12px;}}
  .uc-meta{{display:flex; gap:12px; font-size:.86rem; margin:4px 0; align-items:baseline;}}
  .meta-key{{flex:0 0 72px; font-family:var(--font-mono); font-size:.7rem; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint);}}
  .ep-list{{display:flex; flex-wrap:wrap; gap:6px; min-width:0;}}
  code{{font-family:var(--font-mono); font-size:.82em;}}
  .ep-list code, td code{{background:var(--border-soft); color:var(--ink); padding:.1em .4em; border-radius:4px; overflow-wrap:anywhere;}}

  .table-wrap{{overflow-x:auto; margin-top:12px;}}
  table{{border-collapse:collapse; width:100%; font-size:.86rem;}}
  th{{text-align:left; padding:8px 10px; border:1px solid var(--border); background:var(--border-soft); font-family:var(--font-mono); font-size:.7rem; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-soft);}}
  td{{padding:7px 10px; border:1px solid var(--border); vertical-align:top; color:var(--ink-soft); font-variant-numeric:tabular-nums;}}
  .st{{display:inline-block; padding:1px 8px; border-radius:20px; font-family:var(--font-mono); font-size:.7rem; font-weight:600;}}
  .st-ok{{background:var(--accent-tint); color:var(--accent-strong);}}
  .st-mid{{background:var(--border-soft); color:var(--ink-soft); border:1px solid var(--border);}}
  .st-na{{background:var(--border-soft); color:var(--ink-faint);}}

  .legend{{display:flex; flex-wrap:wrap; gap:10px 22px; font-size:.84rem; color:var(--ink-soft); margin-top:12px;}}
  .legend code{{background:var(--border-soft); padding:.1em .4em; border-radius:4px; color:var(--ink);}}
  @media (prefers-reduced-motion: reduce){{ *{{scroll-behavior:auto !important;}} }}
</style>

<div class="page">
  <header class="hero">
    <p class="eyebrow">Sistem Kontrol Mikroskop Digital — Perancangan UML (revisi)</p>
    <h1>Diagram UML Subsistem Software-Hardware</h1>
    <p class="lede">Use Case, Class, ERD, serta Activity dan Sequence Diagram untuk setiap use case, disusun ulang dari kode yang berjalan per build <code>2026-11-11-scan-result-honest</code>. Setiap diagram di halaman ini digambar dari kode Mermaid yang ada tepat di bawahnya, jadi kode yang Anda salin menghasilkan gambar yang sama.</p>
    <div class="stat-row">
      <div class="stat"><div class="num">20</div><div class="lbl">Use case</div></div>
      <div class="stat"><div class="num">20</div><div class="lbl">Activity Diagram</div></div>
      <div class="stat"><div class="num">20</div><div class="lbl">Sequence Diagram</div></div>
      <div class="stat"><div class="num">1 + 1</div><div class="lbl">Class Diagram dan ERD</div></div>
      <div class="stat"><div class="num">58 + 2</div><div class="lbl">Endpoint REST dan WebSocket</div></div>
    </div>
  </header>

  <div class="note">
    <p class="note-label">Yang berubah dari versi sebelumnya</p>
    <ul>
      <li>Semua endpoint kecuali login, registrasi, versi, dan statistik telemetri kini wajib token JWT. Fitur pengaturan, purge, manajemen operator, dan restart Edge khusus Admin (403 untuk Operator).</li>
      <li>Setelan CNC (feed rate, backlash, akselerasi) dan soft limit pindah menjadi khusus Admin. Pengaturan kamera tetap untuk Pilot.</li>
      <li>Jetson tersambung dengan device token (ditolak dengan kode 4003 bila salah), dan sinkronisasi dataset memakai header <code>X-Edge-Token</code>. Endpoint <code>vps-mock/sync</code> dihapus.</li>
      <li>Setiap perintah browser ke hardware melewati guard: NOT_PILOT, BUS_DISABLED, INVALID_GCODE, RATE_LIMIT, CNC_OFFLINE. Jetson menahan motor (feed hold) bila PING dari server berhenti lebih dari 3 detik.</li>
      <li>Video ke browser memakai <code>ClientOutbox</code>: browser lambat menerima frame terbaru, bukan antrean frame basi.</li>
      <li>Grid scan melaporkan jumlah gambar berhasil dan gagal, tidak mengaku berhasil bila tidak ada gambar, dan hasil sesi bisa dihapus (<code>DELETE /scan/session</code>).</li>
      <li>Use case baru: <b>UC7 Rekam Video Mikroskop</b>. Endpoint baru: <code>storage/export</code>, <code>config/autogather</code>, <code>camera/flatfield</code>, <code>scan/session/{{id}}</code>, <code>stitch/place-folder</code>, <code>analysis/status</code>.</li>
      <li>Penomoran use case disusun ulang per kelompok fitur: akun (UC1-3), pemantauan dan kendali (UC4-7), akuisisi dan pengolahan citra (UC8-11), data dan laporan (UC12-15), Admin (UC16-20).</li>
    </ul>
  </div>

  <div class="note">
    <p class="note-label">Memakai kode di draw.io</p>
    <p>Di draw.io pilih <b>Arrange → Insert → Advanced → Mermaid</b> (atau tombol <b>+</b> → Advanced → Mermaid), tempel kode, lalu klik Insert. Diagram Use Case dan Activity memakai tipe <code>flowchart</code> karena Mermaid tidak punya tipe use case atau activity bawaan. Sequence, Class, dan ERD memakai tipe bawaannya.</p>
  </div>

  <section id="daftar">
    <p class="section-label">Daftar isi</p>
    <h2>Use case</h2>
    <ul class="toc">{toc}</ul>
  </section>

  <section id="use-case">
    <p class="section-label">Diagram 1</p>
    <h2>Use Case Diagram</h2>
    {diagram(D.USE_CASE, "Use Case Diagram — 20 use case. Admin adalah generalisasi Operator, jadi mewarisi UC1-UC15 dan menambah lima use case khusus. Selain UC1 dan UC2, semua use case juga meng-include validasi token JWT; relasi itu tidak digambar agar diagram tetap terbaca.", "flowchart LR, Mermaid tidak punya tipe use case bawaan")}
    <div class="table-wrap">
      <table>
        <thead><tr><th>No</th><th>Use case</th><th>Aktor</th><th>Jumlah endpoint</th></tr></thead>
        <tbody>{uc_rows}</tbody>
      </table>
    </div>
  </section>

  <section id="class">
    <p class="section-label">Diagram 2</p>
    <h2>Class Diagram</h2>
    <p class="uc-summary">Empat kelas domain persisten dari <code>models.py</code>, empat kelas runtime yang hidup di memori server, dan empat modul fungsi yang dipakai router. Skema request/response Pydantic di <code>schemas.py</code> tidak digambar karena itu kontrak validasi, bukan kelas domain.</p>
    {diagram(D.CLASS, "Class Diagram. «runtime» = objek di memori server; «module» = kumpulan fungsi tanpa state.")}
  </section>

  <section id="erd">
    <p class="section-label">Diagram 3</p>
    <h2>Entity Relationship Diagram (ERD)</h2>
    <p class="uc-summary">Empat tabel PostgreSQL. Kolom <code>operator</code> di <code>dataset_folders</code> dan <code>system_logs</code> berisi username, tetapi tidak dikunci sebagai FOREIGN KEY, sehingga relasinya digambar putus-putus sebagai relasi logis. <code>system_settings</code> menyimpan pasangan kunci-nilai seperti <code>feedRate</code>, <code>softLimit_x_max</code>, <code>confThreshold</code>, dan <code>lastlogin:&lt;username&gt;</code>.</p>
    {diagram(D.ERD, "ERD. Garis putus-putus = relasi logis lewat kecocokan nilai operator dan username, bukan FOREIGN KEY.", "relasi .. = bukan FK")}
  </section>

  <section id="legenda">
    <p class="section-label">Notasi Activity Diagram</p>
    <h2>Cara membaca Activity Diagram</h2>
    <div class="legend">
      <span><code>("...")</code> kotak membulat: aksi pengguna atau browser</span>
      <span><code>["..."]</code> kotak siku: proses backend VPS</span>
      <span><code>[["..."]]</code> kotak bergaris ganda: proses di Jetson (Edge)</span>
      <span><code>{{"...?"}}</code> belah ketupat: keputusan</span>
      <span><code>(("Mulai"))</code> dan <code>((("Selesai")))</code>: titik awal dan akhir</span>
    </div>
  </section>

  {"".join(uc_sections)}

  <section id="traceability">
    <p class="section-label">Traceability</p>
    <h2>Matriks Endpoint → Use Case</h2>
    <p class="uc-summary">Seluruh 58 endpoint REST dan 2 WebSocket. <b>Digambar</b> = muncul sebagai pesan di Sequence Diagram ({n_drawn}). <b>Tercakup</b> = bagian dari alur use case yang sama tetapi tidak digambar sebagai pesan tersendiri ({n_cov}). <b>N/A</b> = infrastruktur, bukan aksi pengguna ({n_na}).</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Endpoint</th><th>Use case</th><th>Status</th></tr></thead>
        <tbody>{trace_rows}</tbody>
      </table>
    </div>
  </section>
</div>

<script>
  document.querySelectorAll('.copy-btn').forEach(function (btn) {{
    btn.addEventListener('click', function () {{
      var code = document.getElementById(btn.dataset.target);
      var text = code.textContent;
      var done = function () {{ btn.textContent = 'Tersalin'; setTimeout(function () {{ btn.textContent = 'Salin kode'; }}, 1600); }};
      var fallback = function () {{
        var r = document.createRange(); r.selectNodeContents(code);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        btn.textContent = 'Tekan Ctrl+C';
      }};
      try {{
        if (navigator.clipboard && navigator.clipboard.writeText) {{
          navigator.clipboard.writeText(text).then(done, fallback);
        }} else {{ fallback(); }}
      }} catch (e) {{ fallback(); }}
    }});
  }});
</script>
'''

open(OUT, "w").write(page)
print(OUT, len(page), "bytes,", counter["n"], "diagram")
