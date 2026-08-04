import os
import io
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ── Library pembuatan dokumen ──────────────────────────────────────
# pip install python-docx openpyxl python-pptx Pillow
try:
    from docx import Document
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    XLSX_AVAILABLE = True
except ImportError:
    XLSX_AVAILABLE = False

try:
    from pptx import Presentation
    from pptx.util import Inches as PptInches, Pt as PptPt
    from pptx.dml.color import RGBColor as PptRGB
    PPTX_AVAILABLE = True
except ImportError:
    PPTX_AVAILABLE = False

try:
    from PIL import Image as PILImage
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

DATASET_DIR = "./static/datasets"

router = APIRouter(
    prefix="/api/documentation",
    tags=["Documentation & Report Generator"]
)

from ..schemas import ReportPayload

def _list_images(folder_id: str):
    folder_path = os.path.join(DATASET_DIR, folder_id)
    if not os.path.exists(folder_path):
        return []
    return [f for f in sorted(os.listdir(folder_path))
            if f.lower().endswith(('.png', '.jpg', '.jpeg'))]


# ─────────────────────────────────────────────────────────────────────
#  ENDPOINT: POST /api/documentation/generate?format=WORD|EXCEL|PPT
# ─────────────────────────────────────────────────────────────────────
@router.post("/generate")
async def generate_report(
    payload: ReportPayload,
    format: str = Query(..., description="Format dokumen: WORD, EXCEL, atau PPT"),
):
    # Buat objek namespace sederhana agar generator bisa akses atribut .name, .object_type, dll
    class FolderMeta:
        def __init__(self, p: ReportPayload):
            self.id          = p.folder_id
            self.name        = p.folder_name or p.folder_id
            self.object_type = p.object_type or "Tidak diketahui"
            self.operator    = p.operator    or "Tidak diketahui"
            self.date        = p.date        or datetime.now().strftime("%Y-%m-%d")

    folder      = FolderMeta(payload)
    images      = _list_images(payload.folder_id)
    folder_path = os.path.join(DATASET_DIR, payload.folder_id)

    fmt = format.upper()
    if fmt == "WORD":
        return _generate_word(payload.title, folder, images, folder_path)
    elif fmt == "EXCEL":
        return _generate_excel(payload.title, folder, images)
    elif fmt == "PPT":
        return _generate_ppt(payload.title, folder, images, folder_path)
    else:
        raise HTTPException(status_code=400, detail=f"Format tidak dikenali: {format}")


# ──────────────────────────────────────────────
#  GENERATOR 1: Microsoft Word (.docx)
# ──────────────────────────────────────────────
def _generate_word(title, folder, images, folder_path):
    try:
        if not DOCX_AVAILABLE:
            raise HTTPException(status_code=500, detail="python-docx tidak terinstall di server.")

        doc = Document()
        for section in doc.sections:
            section.top_margin = Inches(1)
            section.bottom_margin = Inches(1)
            section.left_margin = Inches(1.2)
            section.right_margin = Inches(1.2)

        h = doc.add_heading(title, level=0)
        h.alignment = WD_ALIGN_PARAGRAPH.CENTER
        h.runs[0].font.color.rgb = RGBColor(0x1a, 0x56, 0xdb)

        doc.add_paragraph("\u2500" * 68)

        meta = doc.add_paragraph()
        rows = [
            ("Nama Folder",       folder.name),
            ("Jenis Objek",       folder.object_type),
            ("Operator",          folder.operator),
            ("Tanggal Pengambilan", folder.date),
            ("Jumlah Citra",      str(len(images))),
            ("Waktu Pembuatan",   datetime.now().strftime("%d %B %Y, %H:%M:%S")),
        ]
        for label, val in rows:
            run = meta.add_run(f"{label:<32}: {val}\n")
            run.font.size = Pt(10)
            run.font.name = "Courier New"

        doc.add_paragraph()
        doc.add_heading("1. Deskripsi Penelitian", level=1)
        p = doc.add_paragraph(
            f'Dokumen ini dikompilasi otomatis oleh sistem Digital Microscopy BRIN/UNDIP. '
            f'Folder dataset "{folder.name}" berisi citra mikroskopik objek biologi '
            f'bertipe "{folder.object_type}" yang diambil oleh operator "{folder.operator}" '
            f'pada tanggal {folder.date}. Citra telah diproses menggunakan algoritma Computer '
            f'Vision berbasis OpenCV dan inferensi YOLO pada perangkat Edge Computing Jetson Orin Nano.'
        )
        p.runs[0].font.size = Pt(11)

        if images:
            doc.add_heading("2. Galeri Citra Mikroskopik", level=1)
            doc.add_paragraph(f"Total {len(images)} berkas gambar terdokumentasi dalam folder ini.")
            for i, img_name in enumerate(images):
                img_path = os.path.join(folder_path, img_name)
                if not os.path.exists(img_path):
                    continue
                if PIL_AVAILABLE:
                    try:
                        with PILImage.open(img_path) as pil_img:
                            pil_img.thumbnail((800, 600))
                            # Konversi RGBA/P ke RGB agar bisa disimpan sebagai JPEG
                            if pil_img.mode in ('RGBA', 'P', 'LA'):
                                pil_img = pil_img.convert('RGB')
                            buf = io.BytesIO()
                            pil_img.save(buf, format="JPEG", quality=75)
                            buf.seek(0)
                            try:
                                doc.add_picture(buf, width=Inches(4.5))
                            except Exception:
                                pass
                    except Exception:
                        # Fallback jika PIL gagal open (misal corrupted / 0 byte / dummy)
                        try:
                            doc.add_picture(img_path, width=Inches(4.5))
                        except Exception:
                            pass
                else:
                    try:
                        doc.add_picture(img_path, width=Inches(4.5))
                    except Exception:
                        pass
                cap = doc.add_paragraph(f"Gambar {i+1}: {img_name}")
                cap.runs[0].font.size = Pt(9)
                cap.runs[0].font.italic = True
                cap.alignment = WD_ALIGN_PARAGRAPH.CENTER

        doc.add_heading("3. Kesimpulan", level=1)
        doc.add_paragraph(
            f"Sistem berhasil mendokumentasikan {len(images)} citra mikroskopik dari eksperimen "
            f"yang dilakukan. Dokumen ini dapat digunakan sebagai lampiran resmi laporan penelitian "
            f"atau tugas akhir."
        )
        doc.add_paragraph()
        footer = doc.add_paragraph(
            f"Digenerate otomatis oleh Digital Microscopy System \u2014 {datetime.now().year}"
        )
        footer.runs[0].font.size = Pt(8)
        footer.runs[0].font.color.rgb = RGBColor(0x9c, 0xa3, 0xaf)
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        safe = title.replace(" ", "_")
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{safe}.docx"'}
        )
    except Exception as e:
        import traceback
        print(f"ERROR IN _generate_word: {e}", flush=True)
        traceback.print_exc()
        raise


# ──────────────────────────────────────────────
#  GENERATOR 2: Microsoft Excel (.xlsx)
# ──────────────────────────────────────────────
def _generate_excel(title, folder, images):
    if not XLSX_AVAILABLE:
        raise HTTPException(status_code=500, detail="openpyxl tidak terinstall di server.")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Data Citra"

    BLUE_DARK  = "1A56DB"
    BLUE_LIGHT = "EFF6FF"
    GRAY       = "F3F4F6"

    hdr_font  = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
    thin_side = Side(style="thin", color="D1D5DB")
    border    = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

    # Judul
    ws.merge_cells("A1:G1")
    ws["A1"] = title
    ws["A1"].font      = Font(name="Calibri", bold=True, size=14, color=BLUE_DARK)
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws["A1"].fill      = PatternFill("solid", fgColor=BLUE_LIGHT)
    ws.row_dimensions[1].height = 30

    # Metadata
    meta_items = [
        ("Nama Folder",       folder.name),
        ("Jenis Objek",       folder.object_type),
        ("Operator",          folder.operator),
        ("Tanggal",           folder.date),
        ("Total Gambar",      len(images)),
        ("Waktu Laporan",     datetime.now().strftime("%d/%m/%Y %H:%M")),
    ]
    for ri, (key, val) in enumerate(meta_items, start=2):
        ws.cell(ri, 1, key).font = Font(name="Calibri", bold=True, size=10)
        ws.cell(ri, 1).fill     = PatternFill("solid", fgColor=GRAY)
        ws.cell(ri, 2, str(val))

    # Header tabel
    hr = len(meta_items) + 3
    headers = ["No", "Nama File", "Ekstensi", "Ukuran (bytes)", "Indeks Sampel", "Metode Akuisisi", "Catatan"]
    for ci, hdr in enumerate(headers, start=1):
        cell = ws.cell(hr, ci, hdr)
        cell.font      = hdr_font
        cell.fill      = PatternFill("solid", fgColor=BLUE_DARK)
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border    = border
    ws.row_dimensions[hr].height = 22

    # Baris data
    for i, img_name in enumerate(images):
        dr  = hr + 1 + i
        ext = os.path.splitext(img_name)[1].upper().replace(".", "")
        img_path = os.path.join(DATASET_DIR, folder.id, img_name)
        sz  = os.path.getsize(img_path) if os.path.exists(img_path) else 0
        row_data = [i+1, img_name, ext, sz, f"S-{i+1:03d}", "Otomatis (Grid Scan)", ""]
        rf = PatternFill("solid", fgColor="FFFFFF" if i % 2 == 0 else GRAY)
        for ci, val in enumerate(row_data, start=1):
            c = ws.cell(dr, ci, val)
            c.border = border; c.fill = rf; c.alignment = Alignment(vertical="center")

    for ci, w in enumerate([5, 40, 10, 18, 15, 25, 30], start=1):
        ws.column_dimensions[get_column_letter(ci)].width = w

    # Sheet ringkasan
    ws2 = wb.create_sheet("Ringkasan")
    ws2["A1"] = "Ringkasan Dataset"
    ws2["A1"].font = Font(bold=True, size=13, color=BLUE_DARK)
    srows = [
        ["Parameter", "Nilai"],
        ["Total Gambar", len(images)],
        ["Format Gambar", "JPG/PNG"],
        ["Objek Penelitian", folder.object_type],
        ["Operator", folder.operator],
        ["Tanggal", folder.date],
        ["Sistem Akuisisi", "Jetson Orin Nano + IMX477"],
    ]
    for ri, row in enumerate(srows, start=3):
        for ci, val in enumerate(row, start=1):
            cell = ws2.cell(ri, ci, val)
            if ri == 3:
                cell.font = Font(bold=True, color="FFFFFF")
                cell.fill = PatternFill("solid", fgColor=BLUE_DARK)
            cell.border = border
    ws2.column_dimensions["A"].width = 30
    ws2.column_dimensions["B"].width = 30

    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)
    safe = title.replace(" ", "_")
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe}.xlsx"'}
    )


# ──────────────────────────────────────────────
#  GENERATOR 3: PowerPoint (.pptx)
# ──────────────────────────────────────────────
def _generate_ppt(title, folder, images, folder_path):
    if not PPTX_AVAILABLE:
        raise HTTPException(status_code=500, detail="python-pptx tidak terinstall di server.")

    prs = Presentation()
    prs.slide_width  = PptInches(13.33)
    prs.slide_height = PptInches(7.5)
    blank = prs.slide_layouts[6]

    def rgb(h: str):
        return PptRGB(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

    BLUE   = rgb("1A56DB"); WHITE = rgb("FFFFFF")
    DARK   = rgb("111827"); GRAY_T = rgb("6B7280")

    def bg(slide, color_hex):
        sh = slide.shapes.add_shape(1, PptInches(0), PptInches(0), prs.slide_width, prs.slide_height)
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(color_hex); sh.line.fill.background()

    def rect(slide, x, y, w, h, color_hex):
        sh = slide.shapes.add_shape(1, PptInches(x), PptInches(y), PptInches(w), PptInches(h))
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(color_hex); sh.line.fill.background()

    # PP_ALIGN: LEFT=1, CENTER=2, RIGHT=3 — pakai enum agar tidak crash
    from pptx.enum.text import PP_ALIGN

    def tb(slide, x, y, w, h, text, size, bold=False, color=None, align='center'):
        txb = slide.shapes.add_textbox(PptInches(x), PptInches(y), PptInches(w), PptInches(h))
        tf  = txb.text_frame; tf.word_wrap = True
        p   = tf.paragraphs[0]; p.text = text
        run = p.runs[0]; run.font.size = PptPt(size); run.font.bold = bold
        if color: run.font.color.rgb = color
        # Mapping string ke PP_ALIGN agar tidak bergantung pada integer mentah
        align_map = {'left': PP_ALIGN.LEFT, 'center': PP_ALIGN.CENTER, 'right': PP_ALIGN.RIGHT,
                     0: PP_ALIGN.LEFT, 1: PP_ALIGN.LEFT, 2: PP_ALIGN.CENTER, 3: PP_ALIGN.RIGHT}
        p.alignment = align_map.get(align, PP_ALIGN.CENTER)


    # ── Slide 1: Cover ──
    s1 = prs.slides.add_slide(blank)
    bg(s1, "0F172A")
    rect(s1, 0, 3.4, 13.33, 0.06, "1A56DB")
    tb(s1, 1, 1.5, 11.33, 1.5, title, 36, bold=True, color=WHITE)
    tb(s1, 1, 3.6, 11.33, 1.2,
       f"Folder: {folder.name}  |  Objek: {folder.object_type}  |  Operator: {folder.operator}  |  {folder.date}",
       13, color=rgb("93C5FD"))
    tb(s1, 1, 6.8, 11.33, 0.5,
       f"Digital Microscopy System \u2014 BRIN / UNDIP \u2014 {datetime.now().year}", 9, color=GRAY_T)

    # ── Slide 2: Ringkasan ──
    s2 = prs.slides.add_slide(blank)
    bg(s2, "F9FAFB")
    rect(s2, 0, 0, 13.33, 1.1, "1A56DB")
    tb(s2, 0.4, 0.2, 12, 0.7, "Ringkasan Dataset", 22, bold=True, color=WHITE, align=0)
    stats = [
        ("Total Gambar",        str(len(images))),
        ("Nama Folder",         folder.name),
        ("Jenis Objek",         folder.object_type),
        ("Operator",            folder.operator),
        ("Tanggal",             folder.date),
        ("Perangkat Akuisisi",  "Jetson Orin Nano + IMX477"),
    ]
    for i, (k, v) in enumerate(stats):
        y = 1.3 + i * 0.85
        tb(s2, 0.5, y, 5,   0.6, k, 11, bold=True, color=DARK,  align=0)
        tb(s2, 5.8, y, 7,   0.6, v, 11,             color=BLUE,  align=0)

    # ── Slide Galeri ──
    for cs in range(0, len(images), 2):
        chunk = images[cs:cs + 2]
        si = prs.slides.add_slide(blank)
        bg(si, "111827")
        tb(si, 0.3, 0.15, 12, 0.5,
           f"Galeri Citra ({cs+1}\u2013{min(cs+2, len(images))} / {len(images)})",
           14, bold=True, color=rgb("93C5FD"), align=0)
        positions = [(0.3, 0.8), (6.83, 0.8)]
        for j, img_name in enumerate(chunk):
            img_path = os.path.join(folder_path, img_name)
            if not os.path.exists(img_path):
                continue
            xp, yp = positions[j]
            try:
                if PIL_AVAILABLE:
                    with PILImage.open(img_path) as pil_img:
                        pil_img.thumbnail((900, 700))
                        # Konversi RGBA/P ke RGB agar bisa disimpan sebagai JPEG
                        if pil_img.mode in ('RGBA', 'P', 'LA'):
                            pil_img = pil_img.convert('RGB')
                        buf = io.BytesIO()
                        pil_img.save(buf, format="JPEG", quality=80)
                        buf.seek(0)
                        si.shapes.add_picture(buf, PptInches(xp), PptInches(yp), width=PptInches(6.2))
                else:
                    si.shapes.add_picture(img_path, PptInches(xp), PptInches(yp), width=PptInches(6.2))
                tb(si, xp, yp + 5.9, 6.2, 0.35, img_name, 8, color=GRAY_T)
            except Exception:
                pass

    buf = io.BytesIO()
    prs.save(buf); buf.seek(0)
    safe = title.replace(" ", "_")
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{safe}.pptx"'}
    )