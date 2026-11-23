import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TabName } from './layout/NavigationTabs';

// Panduan langkah demi langkah untuk pengguna baru. Tiap langkah boleh pindah tab dan
// menyorot satu bagian layar. Target dicari lewat atribut data-tour; kalau tidak ketemu
// (mis. panel belum dimuat), kartu tampil di tengah layar tanpa sorotan.

type Target = { sel?: string; text?: string };
type Step = { tab?: TabName; target?: Target; title: string; body: string; adminOnly?: boolean };

const STEPS: Step[] = [
  {
    title: 'Selamat datang di Digital Microscopy',
    body: 'Panduan singkat ini menunjukkan bagian-bagian utama aplikasi, dari menyalakan kamera sampai menyimpan hasil. Anda bisa melewatinya kapan saja dan membukanya lagi lewat tombol ? di bagian atas.',
  },
  {
    target: { sel: '[data-tour="status"]' },
    title: 'Status alat',
    body: 'CONNECTED berarti mikroskop siap. DISCONNECTED berarti Jetson atau CNC belum tersambung. MACHINE LOCKED berarti Admin sedang mematikan hardware bus, jadi motor dan kamera tidak bisa dipakai.',
  },
  {
    target: { sel: '[data-tour="statusbar"]' },
    title: 'Kondisi Jetson',
    body: 'Baris ini menampilkan apakah Jetson online, pemakaian RAM dan penyimpanannya. Kalau tertulis OFFLINE, tunggu sebentar atau hubungi Admin.',
  },
  {
    target: { sel: '[data-tour="tab-Live Stream"]' },
    title: 'Menu utama',
    body: 'Pindah antarfitur lewat menu ini. Di HP, menu ada di bagian bawah layar dalam bentuk ikon.',
  },
  {
    tab: 'Live Stream',
    target: { sel: '[data-tour="live-video"]' },
    title: 'Live Stream',
    body: 'Tekan tombol kamera di pojok kanan bawah untuk menyalakan video. Kotak kiri atas menampilkan posisi X, Y, Z motor. Tombol kiri bawah memilih folder dan merekam video.',
  },
  {
    tab: 'Live Stream',
    target: { sel: '[data-tour="live-room"]' },
    title: 'Pilot, penonton, dan antrean',
    body: 'Hanya satu orang (Pilot) yang bisa menggerakkan mikroskop. Maksimal dua orang lain menonton video, sisanya antre. Pilot yang diam 10 menit akan digantikan orang berikutnya.',
  },
  {
    tab: 'Live Stream',
    target: { sel: '[data-tour="live-motor"]' },
    title: 'Menggerakkan meja dan fokus',
    body: 'Pakai tombol arah untuk menggeser meja X/Y dan tombol fokus untuk Z. Atur jarak per klik di sini. Kalau motor terkunci (alarm), tekan Unlock.',
  },
  {
    tab: 'Live Stream',
    target: { sel: '[data-tour="live-camera"]' },
    title: 'Pengaturan kamera',
    body: 'Shutter 13–33.000 µs dan ISO 100–2.200. Setelah Terapkan, gambar berhenti sekitar 5 detik selama kamera dinyalakan ulang. Tombol Default langsung mengembalikan pengaturan bawaan.',
  },
  {
    tab: 'Live Stream',
    target: { sel: '[data-tour="live-cnc"]' },
    adminOnly: true,
    title: 'Parameter CNC (Admin)',
    body: 'Feed rate, backlash, akselerasi, dan waktu tunggu motor. Hanya Admin yang bisa mengubahnya, karena nilai yang salah bisa membuat motor kehilangan langkah.',
  },
  {
    tab: 'Image Gathering',
    target: { sel: '[data-tour="ig-modes"]' },
    title: 'Image Gathering',
    body: 'Auto Gather memotret grid otomatis. Manual Gather memotret satu per satu di koordinat pilihan. Input Images menyusun gambar yang sudah ada untuk digabung.',
  },
  {
    tab: 'Image Gathering',
    target: { text: 'Parameter Grid' },
    title: 'Memindai grid otomatis',
    body: 'Isi jumlah kolom, baris, jarak langkah, dan jeda, lalu tekan CAPTURE. Perkiraan waktu muncul sebelum mulai. Selama memindai, kotak hijau berarti tile berhasil dan merah berarti gagal (bisa diambil ulang). Hasilnya bisa langsung digabung (stitching) atau disimpan ke Database.',
  },
  {
    tab: 'Image Analysis',
    target: { text: 'CARI BERKAS CITRA' },
    title: 'Image Analysis',
    body: 'Unggah citra atau pilih dari Database, lalu pilih alat: hitung koloni, kalkulasi morfologi (luas dan bentuk koloni), threshold, kontur, dan lainnya. Hasil bisa disimpan kembali ke Database.',
  },
  {
    tab: 'Database',
    target: { sel: '[data-tour="tab-Database"]' },
    title: 'Database',
    body: 'Semua gambar dan video tersimpan per folder. Buat folder baru, buka folder untuk melihat isinya, unduh sebagai zip atau format YOLO, dan hapus yang tidak diperlukan.',
  },
  {
    tab: 'Documentation',
    target: { sel: '[data-tour="tab-Documentation"]' },
    title: 'Laporan dan log',
    body: 'Pilih folder untuk membuat laporan otomatis dalam format Word, Excel, atau PowerPoint. Di bawahnya ada catatan aktivitas semua pengguna.',
  },
  {
    tab: 'Admin Control',
    target: { text: 'INSTRUMEN POWER BUS' },
    adminOnly: true,
    title: 'Saklar pengaman (Admin)',
    body: 'Mematikan hardware bus langsung menolak semua perintah motor, scan, dan pengaturan alat. Pakai saat ada kondisi tidak aman.',
  },
  {
    tab: 'Admin Control',
    target: { text: 'Storage Management' },
    adminOnly: true,
    title: 'Pengguna dan penyimpanan (Admin)',
    body: 'Di Admin Control, Admin mengatur akun operator, sesi pengguna, ambang AI, batas gerak CNC, serta mengekspor atau membersihkan penyimpanan. Purge Cache hanya menghapus berkas sementara; Purge All menghapus seluruh dataset.',
  },
  {
    title: 'Siap dipakai',
    body: 'Itu saja dasarnya. Buka panduan ini lagi kapan saja lewat tombol ? di bagian atas layar.',
  },
];

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

function findTarget(t?: Target): HTMLElement | null {
  if (!t) return null;
  if (t.sel) {
    const el = Array.from(document.querySelectorAll(t.sel)).find(visible);
    if (el) return el as HTMLElement;
  }
  if (t.text) {
    const want = t.text.trim().toUpperCase();
    const el = Array.from(document.querySelectorAll('h1,h2,h3,h4,span,p,label,button'))
      .find(e => (e.textContent || '').trim().toUpperCase() === want && visible(e));
    if (el) return ((el.closest('.rounded-2xl, .rounded-3xl') || el) as HTMLElement);
  }
  return null;
}

import { tourStorageKey } from './tourStorage';

interface Props {
  open: boolean;
  role: string;
  username: string;
  availableTabs: TabName[];
  setActiveTab: (tab: TabName) => void;
  onClose: () => void;
}

export default function GuidedTour({ open, role, username, availableTabs, setActiveTab, onClose }: Props) {
  const steps = useMemo(
    () => STEPS.filter(s => (!s.adminOnly || role === 'ADMIN') && (!s.tab || availableTabs.includes(s.tab))),
    [role, availableTabs],
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const step = steps[Math.min(index, steps.length - 1)];

  const finish = useCallback(() => {
    try { localStorage.setItem(tourStorageKey(username), '1'); } catch { /* ignore */ }
    setIndex(0);
    onClose();
  }, [onClose, username]);

  // Pindah tab bila perlu, tunggu panel dimuat, lalu cari dan gulir ke target.
  useEffect(() => {
    if (!open || !step) return;
    if (step.tab) setActiveTab(step.tab);
    let tries = 0;
    let timer: number | undefined;
    const locate = () => {
      if (tries === 0) setRect(null);
      const el = findTarget(step.target);
      if (el) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        timer = window.setTimeout(() => setRect(el.getBoundingClientRect()), 120);
      } else if (step.target && tries++ < 12) {
        timer = window.setTimeout(locate, 150);
      }
    };
    timer = window.setTimeout(locate, step.tab ? 250 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      const el = findTarget(step?.target);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') setIndex(i => Math.min(i + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish, steps.length]);

  if (!open || !step) return null;

  const isMobile = viewport.w < 768;
  const last = index === steps.length - 1;
  const pad = 6;
  const CARD_W = Math.min(360, viewport.w - 24);

  // Posisi kartu: di HP selalu di bawah (di atas navigasi bawah); di layar lebar dekat target.
  let cardStyle: React.CSSProperties;
  if (isMobile) {
    const targetLow = rect && rect.top > viewport.h * 0.5;
    cardStyle = targetLow
      ? { left: 12, right: 12, top: 'max(12px, env(safe-area-inset-top, 0px))' }
      : { left: 12, right: 12, bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' };
  } else if (rect) {
    const below = rect.bottom + 12 + 220 < viewport.h;
    const left = Math.max(12, Math.min(rect.left, viewport.w - CARD_W - 12));
    cardStyle = below ? { left, top: rect.bottom + 12, width: CARD_W } : { left, top: Math.max(12, rect.top - 12 - 220), width: CARD_W };
  } else {
    cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: CARD_W };
  }

  return (
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          className="absolute rounded-2xl ring-2 ring-blue-400 transition-all duration-200 pointer-events-none"
          style={{
            left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(3, 7, 18, 0.72)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gray-950/75" />
      )}

      <div className="absolute rounded-2xl border border-blue-500/40 bg-gray-900 text-gray-100 shadow-2xl p-4 sm:p-5" style={cardStyle}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Panduan {index + 1}/{steps.length}</p>
            <h2 id="tour-title" className="mt-1 text-base sm:text-lg font-bold leading-snug">{step.title}</h2>
          </div>
          <button aria-label="Tutup panduan" onClick={finish} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 shrink-0">
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-gray-300">{step.body}</p>
        <div className="mt-3 h-1 w-full rounded-full bg-gray-700 overflow-hidden">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={finish} className="text-xs font-bold text-gray-400 hover:text-white px-1 py-2">
            {last ? '' : 'Lewati'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setIndex(i => Math.max(i - 1, 0))}
              disabled={index === 0}
              className="px-3 py-2 rounded-xl border border-gray-600 text-sm font-bold flex items-center gap-1 disabled:opacity-30"
            >
              <ChevronLeft size={16} /> Kembali
            </button>
            <button
              onClick={() => (last ? finish() : setIndex(i => i + 1))}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1"
              autoFocus
            >
              {last ? 'Selesai' : <>Lanjut <ChevronRight size={16} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
