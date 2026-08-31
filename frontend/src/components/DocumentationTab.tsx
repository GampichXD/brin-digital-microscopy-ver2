import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import {
  FileText, FileSpreadsheet, Presentation, FilePlus, Search, ShieldAlert, CheckCircle,
  User, Activity, RefreshCw, Trash2, XCircle, ListChecks, Images, Wrench, Table2,
} from 'lucide-react';
import { logSystemAction } from '../utils/logger';
import { showToast } from '../utils/toast';
import { useGlobalContext } from '../context/GlobalContext';
import { useTranslation } from '../hooks/useTranslation';
import VirtualKeyboard from './VirtualKeyboard';

interface DatasetFolder {
  id: string;
  name: string;
  object_type: string;
  date?: string;
  operator?: string;
  image_count?: number;
}

interface DocumentationTabProps {
  availableFolders?: DatasetFolder[];
}

interface ActivityLog {
  id: string;
  timestamp: string;
  operator: string;
  action: string;
  status: 'SUCCESS' | 'ERROR' | 'CANCELLED' | string;
}

type VKField =
  | 'title' | 'author' | 'institution' | 'docNumber'
  | 'abstract' | 'conclusion' | 'supervisor' | 'logSearch' | null;

export default function DocumentationTab({ availableFolders = [] }: DocumentationTabProps) {
  const { isDarkMode, globalVirtualKeyboard } = useGlobalContext();
  const { t } = useTranslation();

  const role = (localStorage.getItem('role') || 'OPERATOR').toUpperCase();
  const isAdmin = role === 'ADMIN';

  // ── LOG AKTIVITAS ──
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logBusy, setLogBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const fetchLogs = async () => {
    setLogBusy(true);
    try {
      const res = await api.get('/api/logs');
      setLogs(res.data);
    } catch (err) {
      console.error('Gagal mengambil log aktivitas:', err);
      showToast('Gagal memuat log aktivitas.', 'error');
    } finally {
      setLogBusy(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const clearLogs = async () => {
    try {
      const res = await api.delete('/api/logs');
      showToast(res.data?.message || 'Log dibersihkan.', 'success');
      setConfirmClear(false);
      fetchLogs();
    } catch {
      showToast('Gagal membersihkan log (butuh hak Admin).', 'error');
    }
  };

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(l =>
      l.action.toLowerCase().includes(q) ||
      l.operator.toLowerCase().includes(q) ||
      l.status.toLowerCase().includes(q));
  }, [logs, logSearch]);

  // ── REPORT GENERATOR ──
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [form, setForm] = useState({
    title: 'Laporan Hasil Analisis Mikroskop',
    author: localStorage.getItem('username') || '',
    institution: 'BRIN × Universitas Diponegoro',
    docNumber: '',
    abstract: '',
    conclusion: '',
    supervisor: '',
  });
  const [opts, setOpts] = useState({ gallery: true, technical: true, table: true, maxImages: 12 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedType, setGeneratedType] = useState('');

  const [vk, setVk] = useState<{ visible: boolean; title: string; field: VKField }>({ visible: false, title: '', field: null });
  const triggerVK = (title: string, field: Exclude<VKField, null>) => {
    if (!globalVirtualKeyboard) return;
    setVk({ visible: true, title, field });
  };
  const handleVKInput = (key: string) => {
    const f = vk.field;
    if (!f) return;
    const upd = (prev: string) => (key === 'BACK' ? prev.slice(0, -1) : prev + key);
    if (f === 'logSearch') { setLogSearch(prev => upd(prev)); return; }
    setForm(prev => ({ ...prev, [f]: upd((prev as any)[f]) }));
  };

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-blue-400' : 'bg-white border-gray-300 text-blue-600',
    btnTouch: isDarkMode ? 'bg-gray-800 border-gray-600 hover:bg-gray-700 active:bg-gray-600' : 'bg-gray-100 border-gray-300 hover:bg-gray-200 active:bg-gray-300',
    tableHeader: isDarkMode ? 'bg-gray-950 text-gray-400' : 'bg-gray-100 text-gray-700',
    tableRow: isDarkMode ? 'border-gray-800 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-gray-50',
    overlay: 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4',
  };

  const selectedFolder = availableFolders.find(f => f.id === selectedFolderId);

  const handleGenerateReport = async (type: 'WORD' | 'EXCEL' | 'PPT') => {
    if (!selectedFolderId || !selectedFolder) {
      showToast('Silakan pilih folder data terlebih dahulu!', 'warning');
      return;
    }
    setIsGenerating(true);
    setGeneratedType(type);
    try {
      const response = await api.post(
        `/api/documentation/generate?format=${type}`,
        {
          folder_id: selectedFolderId,
          title: form.title,
          folder_name: selectedFolder.name || '',
          object_type: selectedFolder.object_type || '',
          operator: selectedFolder.operator || '',
          date: selectedFolder.date || '',
          author: form.author,
          institution: form.institution,
          doc_number: form.docNumber,
          abstract: form.abstract,
          conclusion: form.conclusion,
          supervisor: form.supervisor,
          include_gallery: opts.gallery,
          include_technical: opts.technical,
          include_table: opts.table,
          max_images: Number(opts.maxImages) || 0,
        },
        { responseType: 'blob' },
      );

      const ext = type === 'WORD' ? 'docx' : type === 'EXCEL' ? 'xlsx' : 'pptx';
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${form.title.replace(/\s+/g, '_')}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      await logSystemAction(`Generate Dokumen ${type} - ${form.title}`, 'SUCCESS');
      fetchLogs();
    } catch (err: any) {
      let msg = err?.message || 'Error tidak diketahui';
      try {
        const errBlob: Blob = err?.response?.data;
        if (errBlob instanceof Blob) {
          const text = await errBlob.text();
          try { msg = JSON.parse(text).detail || text; } catch { msg = text; }
        }
      } catch { /* ignore */ }
      showToast(`Gagal generate laporan: ${msg}`, 'error');
      await logSystemAction(`Gagal Generate ${type} - ${form.title}`, 'ERROR');
      fetchLogs();
    } finally {
      setIsGenerating(false);
    }
  };

  const statusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'SUCCESS') return <span className="inline-flex items-center px-2 py-0.5 bg-green-500/10 text-green-500 rounded-full font-sans font-bold text-[9px]"><CheckCircle size={10} className="mr-1" /> OK</span>;
    if (s === 'CANCELLED') return <span className="inline-flex items-center px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded-full font-sans font-bold text-[9px]"><ShieldAlert size={10} className="mr-1" /> BATAL</span>;
    return <span className="inline-flex items-center px-2 py-0.5 bg-red-500/10 text-red-500 rounded-full font-sans font-bold text-[9px]"><XCircle size={10} className="mr-1" /> GAGAL</span>;
  };

  const fieldInput = (field: Exclude<VKField, null>, label: string, placeholder = '', textarea = false) => (
    <div>
      <label className={`block text-[10px] font-bold mb-1 ${theme.textMuted}`}>{label}</label>
      {textarea ? (
        <textarea
          rows={3}
          readOnly={globalVirtualKeyboard}
          value={(form as any)[field]}
          onChange={(e) => setForm(prev => ({ ...prev, [field]: e.target.value }))}
          onClick={() => triggerVK(label, field)}
          placeholder={placeholder}
          className={`w-full px-3 py-2 rounded-xl border text-xs shadow-inner resize-none ${theme.input} ${vk.field === field ? 'ring-2 ring-blue-500' : ''}`}
        />
      ) : (
        <input
          type="text"
          readOnly={globalVirtualKeyboard}
          value={(form as any)[field]}
          onChange={(e) => setForm(prev => ({ ...prev, [field]: e.target.value }))}
          onClick={() => triggerVK(label, field)}
          placeholder={placeholder}
          className={`w-full px-3 py-2 rounded-xl border text-xs font-bold shadow-inner ${theme.input} ${vk.field === field ? 'ring-2 ring-blue-500' : ''}`}
        />
      )}
    </div>
  );

  const toggleChip = (active: boolean, onClick: () => void, Icon: any, label: string) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${
        active ? 'border-blue-500 bg-blue-500/15 text-blue-500' : `${theme.btnTouch} ${theme.textMuted}`
      }`}
    >
      <Icon size={12} /> {label}
    </button>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full relative w-full overflow-y-auto lg:overflow-hidden pb-4 lg:pb-0 pr-1 lg:pr-0">

      {/* ================= LOG AKTIVITAS ================= */}
      <div className={`w-full lg:w-[58%] h-[350px] lg:h-full shrink-0 lg:shrink rounded-2xl border flex flex-col overflow-hidden shadow-sm ${theme.panel}`}>
        <div className="p-3 border-b border-gray-800 bg-black/10 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-blue-500" />
            <h3 className={`font-bold text-sm uppercase tracking-wider ${theme.text}`}>{t('systemActivityLog')}</h3>
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded text-[10px] font-bold">{logs.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search size={12} className={`absolute left-2 top-1/2 -translate-y-1/2 ${theme.textMuted}`} />
              <input
                readOnly={globalVirtualKeyboard}
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                onClick={() => globalVirtualKeyboard && setVk({ visible: true, title: 'Cari Log', field: 'logSearch' })}
                placeholder="Cari operator / aktivitas..."
                className={`w-40 sm:w-52 pl-6 pr-2 py-1.5 rounded-lg border text-[11px] ${theme.input} ${vk.field === 'logSearch' ? 'ring-2 ring-blue-500' : ''}`}
              />
            </div>
            <button onClick={fetchLogs} disabled={logBusy} title="Muat ulang" className={`p-1.5 rounded-lg border ${theme.btnTouch} disabled:opacity-40`}>
              <RefreshCw size={14} className={logBusy ? 'animate-spin' : ''} />
            </button>
            {isAdmin && (
              <button onClick={() => setConfirmClear(true)} title="Bersihkan semua log" className="p-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'none' }}>
          <table className="w-full text-left border-collapse">
            <thead className={`sticky top-0 text-[10px] font-bold uppercase tracking-wider ${theme.tableHeader}`}>
              <tr>
                <th className="p-3">{t('time')}</th>
                <th className="p-3">{t('operator')}</th>
                <th className="p-3">{t('activity')}</th>
                <th className="p-3 text-center">{t('status')}</th>
              </tr>
            </thead>
            <tbody className={`text-xs font-mono ${theme.text}`}>
              {filteredLogs.map((log) => (
                <tr key={log.id} className={`border-b transition-colors ${theme.tableRow}`}>
                  <td className="p-3 whitespace-nowrap text-gray-500">{log.timestamp}</td>
                  <td className="p-3 font-bold flex items-center gap-1.5 whitespace-nowrap">
                    <User size={12} className="text-gray-400" /> {log.operator}
                  </td>
                  <td className="p-3 font-sans font-bold max-w-[220px] truncate" title={log.action}>{log.action}</td>
                  <td className="p-3 text-center">{statusBadge(log.status)}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-xs text-gray-500 font-sans">
                  {logs.length === 0 ? 'Belum ada aktivitas tercatat.' : 'Tidak ada log yang cocok dengan pencarian.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= REPORT GENERATOR ================= */}
      <div className="w-full lg:w-[42%] h-auto lg:h-full shrink-0 lg:shrink flex flex-col gap-3 lg:overflow-y-auto pr-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

        {/* Pemilihan folder + isi laporan */}
        <div className={`p-4 rounded-2xl border flex flex-col gap-3 shrink-0 ${theme.panel}`}>
          <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center ${theme.text}`}>
            <FilePlus size={16} className="mr-2 text-purple-400" /> Isi Laporan
          </h3>

          <div>
            <label className={`block text-[10px] font-bold mb-1 ${theme.textMuted}`}>{t('selectSourceFolder')}</label>
            {availableFolders.length === 0 ? (
              <div className={`p-3 rounded-xl border border-dashed text-[11px] ${theme.textMuted}`}>
                Belum ada folder dataset. Buat dulu di tab Database / Image Gathering.
              </div>
            ) : (
              <div className="grid gap-1.5 max-h-28 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none' }}>
                {availableFolders.map(folder => (
                  <div
                    key={folder.id}
                    onClick={() => setSelectedFolderId(folder.id)}
                    className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-colors ${selectedFolderId === folder.id ? 'border-blue-500 bg-blue-500/10 text-blue-400' : `${theme.panel} ${theme.text} hover:border-gray-500`}`}
                  >
                    <div className="flex items-center min-w-0">
                      <Search size={14} className="mr-2 text-gray-500 shrink-0" />
                      <span className="font-bold text-xs truncate">{folder.name}</span>
                    </div>
                    <span className="text-[9px] opacity-60 px-1.5 py-0.5 bg-black/5 rounded shrink-0">
                      {folder.object_type}{typeof folder.image_count === 'number' ? ` · ${folder.image_count} img` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {fieldInput('title', t('documentTitle'), 'Judul dokumen')}
          <div className="grid grid-cols-2 gap-2">
            {fieldInput('author', 'Penyusun', 'Nama peneliti')}
            {fieldInput('docNumber', 'No. Dokumen', 'opsional')}
          </div>
          {fieldInput('institution', 'Institusi')}
          {fieldInput('abstract', 'Abstrak / Ringkasan', 'Kosongkan untuk teks otomatis', true)}
          {fieldInput('conclusion', 'Kesimpulan', 'Kosongkan untuk teks otomatis', true)}
          {fieldInput('supervisor', 'Mengetahui (pembimbing)', 'opsional')}

          <div className="flex flex-wrap gap-1.5 pt-1">
            {toggleChip(opts.gallery, () => setOpts(o => ({ ...o, gallery: !o.gallery })), Images, 'Galeri citra')}
            {toggleChip(opts.technical, () => setOpts(o => ({ ...o, technical: !o.technical })), Wrench, 'Metadata teknis')}
            {toggleChip(opts.table, () => setOpts(o => ({ ...o, table: !o.table })), Table2, 'Tabel rincian')}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold ${theme.btnTouch} ${theme.textMuted}`}>
              <ListChecks size={12} /> Maks gambar
              <input
                type="number" min={0} max={200}
                value={opts.maxImages}
                onChange={(e) => setOpts(o => ({ ...o, maxImages: parseInt(e.target.value || '0') }))}
                className={`w-12 text-center rounded border bg-transparent ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}
              />
            </div>
          </div>
        </div>

        {/* Ringkasan yang akan digenerate */}
        <div className={`p-3 rounded-2xl border text-[11px] ${theme.panel} ${theme.textMuted}`}>
          <span className={`font-bold ${theme.text}`}>Pratinjau laporan:</span>{' '}
          {selectedFolder
            ? <>“{form.title || 'Tanpa judul'}” untuk folder <b>{selectedFolder.name}</b> ({selectedFolder.object_type}); penyusun <b>{form.author || '—'}</b>; bagian:
                {' '}{[opts.technical && 'metadata teknis', opts.table && 'tabel rincian', opts.gallery && `galeri (maks ${opts.maxImages || '∞'})`].filter(Boolean).join(', ') || 'ringkas'}.</>
            : <>Pilih folder untuk melihat ringkasan.</>}
        </div>

        {/* Tombol export */}
        <div className={`p-4 rounded-2xl border flex flex-col gap-3 shrink-0 ${theme.panel}`}>
          <h4 className={`text-xs font-bold uppercase tracking-wider ${theme.textMuted}`}>{t('selectExportFormat')}</h4>
          <div className="flex flex-col gap-2">
            <button onClick={() => handleGenerateReport('WORD')} disabled={!selectedFolderId || isGenerating} className={`group flex items-center p-4 rounded-2xl border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? 'bg-gray-800/40 border-gray-700/50 hover:bg-blue-900/20 hover:border-blue-500/50' : 'bg-white border-gray-200 hover:bg-blue-50/50 hover:border-blue-300 hover:shadow-lg'}`}>
              <div className={`p-3 rounded-xl mr-4 ${isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><FileText size={24} /></div>
              <div className="flex flex-col">
                <span className={`font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t('generateWord')}</span>
                <span className="text-xs mt-0.5 text-gray-500">{t('wordDesc')}</span>
              </div>
            </button>
            <button onClick={() => handleGenerateReport('EXCEL')} disabled={!selectedFolderId || isGenerating} className={`group flex items-center p-4 rounded-2xl border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? 'bg-gray-800/40 border-gray-700/50 hover:bg-green-900/20 hover:border-green-500/50' : 'bg-white border-gray-200 hover:bg-green-50/50 hover:border-green-300 hover:shadow-lg'}`}>
              <div className={`p-3 rounded-xl mr-4 ${isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600'}`}><FileSpreadsheet size={24} /></div>
              <div className="flex flex-col">
                <span className={`font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t('generateExcel')}</span>
                <span className="text-xs mt-0.5 text-gray-500">{t('excelDesc')}</span>
              </div>
            </button>
            <button onClick={() => handleGenerateReport('PPT')} disabled={!selectedFolderId || isGenerating} className={`group flex items-center p-4 rounded-2xl border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? 'bg-gray-800/40 border-gray-700/50 hover:bg-orange-900/20 hover:border-orange-500/50' : 'bg-white border-gray-200 hover:bg-orange-50/50 hover:border-orange-300 hover:shadow-lg'}`}>
              <div className={`p-3 rounded-xl mr-4 ${isDarkMode ? 'bg-orange-500/10 text-orange-400' : 'bg-orange-50 text-orange-600'}`}><Presentation size={24} /></div>
              <div className="flex flex-col">
                <span className={`font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t('generatePpt')}</span>
                <span className="text-xs mt-0.5 text-gray-500">{t('pptDesc')}</span>
              </div>
            </button>
          </div>
          <p className="text-[10px] text-gray-500 text-center leading-normal mt-1">
            Disusun di server (python-docx / openpyxl / python-pptx) dari folder dataset yang sudah tersinkron dari Jetson.
          </p>
        </div>
      </div>

      {/* OVERLAY LOADING */}
      {isGenerating && (
        <div className={theme.overlay}>
          <div className="flex flex-col items-center text-white">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="text-2xl font-bold mb-2">{t('compilingFile').replace('{X}', generatedType || '')}</h2>
            <p className="text-sm text-blue-300 font-mono">{t('backendCompiling')}</p>
          </div>
        </div>
      )}

      {/* KONFIRMASI CLEAR LOG */}
      {confirmClear && (
        <div className={theme.overlay}>
          <div className={`w-full max-w-sm rounded-2xl p-6 border shadow-2xl text-center ${theme.panel}`}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center"><Trash2 size={28} /></div>
            <h3 className={`font-bold text-lg mb-1 ${theme.text}`}>Bersihkan semua log?</h3>
            <p className={`text-xs mb-5 ${theme.textMuted}`}>Seluruh {logs.length} baris audit trail akan dihapus permanen dari database.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmClear(false)} className={`flex-1 py-3 rounded-xl font-bold border ${theme.btnTouch} ${theme.text}`}>Batal</button>
              <button onClick={clearLogs} className="flex-1 py-3 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white">Hapus Semua</button>
            </div>
          </div>
        </div>
      )}

      {vk.visible && globalVirtualKeyboard && (
        <div className="fixed inset-0 z-[110] pointer-events-none flex items-end justify-center pb-4">
          <div className="pointer-events-auto">
            <VirtualKeyboard title={vk.title} onInput={handleVKInput} onClose={() => setVk({ visible: false, title: '', field: null })} />
          </div>
        </div>
      )}
    </div>
  );
}
