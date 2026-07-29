import { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, FileSpreadsheet, Presentation, FilePlus, Search, ShieldAlert, CheckCircle, User, Activity } from 'lucide-react';
import { logSystemAction } from '../utils/logger';
import { translations } from '../i18n';
import type { Language } from '../i18n';

interface DatasetFolder {
  id: string;
  name: string;
  object_type: string;
  date?: string;
  operator?: string;
}

interface DocumentationTabProps {
  isDarkMode: boolean;
  availableFolders?: DatasetFolder[];
  language: Language;
}

interface ActivityLog {
  id: string;
  timestamp: string;
  operator: string;
  action: string;
  status: 'SUCCESS' | 'CANCELLED';
}

export default function DocumentationTab({ isDarkMode, availableFolders = [], language }: DocumentationTabProps) {
  const t = translations[language];
  // === STATE LOG AKTIVITAS (AUDIT TRAIL) ===
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  const fetchLogs = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/logs');
      setLogs(res.data);
    } catch (err) {
      console.error('Gagal mengambil log aktivitas:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [reportTitle, setReportTitle] = useState('Laporan Hasil Analisis Mikroskop');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedType, setGeneratedType] = useState('');

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-blue-400' : 'bg-white border-gray-300 text-blue-600',
    btnTouch: isDarkMode ? 'bg-gray-800 border-gray-600 hover:bg-gray-700 active:bg-gray-600' : 'bg-gray-100 border-gray-300 hover:bg-gray-200 active:bg-gray-300',
    tableHeader: isDarkMode ? 'bg-gray-950 text-gray-400' : 'bg-gray-100 text-gray-700',
    tableRow: isDarkMode ? 'border-gray-800 hover:bg-gray-850' : 'border-gray-100 hover:bg-gray-50',
    overlay: 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4'
  };

  const fallbackFolders: DatasetFolder[] = [
    { id: '1', name: 'Riset_Coli_Tembalang_01', object_type: 'Bakteri E. Coli', date: '2026-07-28', operator: 'Operator Lab' },
  ];

  const foldersToDisplay = availableFolders.length > 0 ? availableFolders : fallbackFolders;

  const handleGenerateReport = async (type: 'WORD' | 'EXCEL' | 'PPT') => {
    if (!selectedFolderId) return alert('Silakan pilih folder data terlebih dahulu!');
    setIsGenerating(true);
    setGeneratedType(type);

    // Ambil metadata folder yang dipilih untuk dikirim ke API
    const selectedFolder = foldersToDisplay.find(f => f.id === selectedFolderId);

    try {
      const response = await axios.post(
        `http://localhost:8000/api/documentation/generate?format=${type}`,
        {
          folder_id: selectedFolderId,
          title: reportTitle,
          folder_name: selectedFolder?.name || '',
          object_type: selectedFolder?.object_type || '',
          operator:    selectedFolder?.operator || '',
          date:        selectedFolder?.date || '',
        },
        { responseType: 'blob' }
      );

      const ext = type === 'WORD' ? 'docx' : type === 'EXCEL' ? 'xlsx' : 'pptx';
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reportTitle.replace(/\s+/g, '_')}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      // Catat log aktivitas
      await logSystemAction(`Generate Dokumen ${type} - ${reportTitle}`, 'SUCCESS');
      fetchLogs();
    } catch (err: any) {
      // Decode pesan error sebenarnya dari blob (axios blob mode menyembunyikan pesan JSON)
      try {
        const errBlob: Blob = err?.response?.data;
        if (errBlob instanceof Blob) {
          const text = await errBlob.text();
          const json = JSON.parse(text);
          alert(`Gagal generate laporan: ${json.detail || text}`);
        } else {
          alert(`Gagal generate laporan: ${err?.message || 'Error tidak diketahui'}`);
        }
      } catch {
        alert(`Gagal generate laporan: ${err?.message || 'Error tidak diketahui'}`);
      }
      console.error(err);
      
      // Catat log error
      await logSystemAction(`Gagal Generate ${type} - ${reportTitle}`, 'ERROR');
      fetchLogs();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex gap-3 h-full relative">
      
      <div className={`w-[60%] h-full rounded-2xl border flex flex-col overflow-hidden shadow-sm ${theme.panel}`}>
        <div className="p-4 border-b border-gray-800 bg-black/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-blue-500" />
            <h3 className={`font-bold text-sm uppercase tracking-wider ${theme.text}`}>{t.systemActivityLog}</h3>
          </div>
          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded text-[10px] font-bold">{t.automatedLog}</span>
        </div>

        <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'none' }}>
          <table className="w-full text-left border-collapse">
            <thead className={`sticky top-0 text-[10px] font-bold uppercase tracking-wider ${theme.tableHeader}`}>
              <tr>
                <th className="p-3">{t.time}</th>
                <th className="p-3">{t.operator}</th>
                <th className="p-3">{t.activity}</th>
                <th className="p-3 text-center">{t.status}</th>
              </tr>
            </thead>
            <tbody className={`text-xs font-mono ${theme.text}`}>
              {logs.map((log) => (
                <tr key={log.id} className={`border-b transition-colors ${theme.tableRow}`}>
                  <td className="p-3 whitespace-nowrap text-gray-500">{log.timestamp}</td>
                  <td className="p-3 font-bold flex items-center gap-1.5 whitespace-nowrap">
                    <User size={12} className="text-gray-400" /> {log.operator}
                  </td>
                  <td className="p-3 font-sans font-bold max-w-[200px] truncate">{log.action}</td>
                  <td className="p-3 text-center">
                    {log.status === 'SUCCESS' ? (
                      <span className="inline-flex items-center px-2 py-0.5 bg-green-500/10 text-green-500 rounded-full font-sans font-bold text-[9px]">
                        <CheckCircle size={10} className="mr-1" /> OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 bg-red-500/10 text-red-500 rounded-full font-sans font-bold text-[9px]">
                        <ShieldAlert size={10} className="mr-1" /> BATAL
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="w-[40%] h-full flex flex-col gap-3 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div className={`p-4 rounded-2xl border flex flex-col gap-3 shrink-0 ${theme.panel}`}>
          <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center ${theme.text}`}>
            <FilePlus size={16} className="mr-2 text-purple-400" /> Report Generator
          </h3>

          <div className="space-y-3">
            <div>
              <label className={`block text-[10px] font-bold mb-1 ${theme.textMuted}`}>{t.documentTitle}</label>
              <input 
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-bold shadow-inner ${theme.input}`}
              />
            </div>

            <div>
              <label className={`block text-[10px] font-bold mb-1 ${theme.textMuted}`}>{t.selectSourceFolder}</label>
              <div className="grid gap-1.5 max-h-32 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none' }}>
                {foldersToDisplay.map(folder => (
                  <div 
                    key={folder.id} 
                    onClick={() => setSelectedFolderId(folder.id)} 
                    className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-colors ${selectedFolderId === folder.id ? 'border-blue-500 bg-blue-500/10 text-blue-400' : `${theme.panel} ${theme.text} hover:border-gray-500`}`}
                  >
                    <div className="flex items-center min-w-0">
                      <Search size={14} className="mr-2 text-gray-500 shrink-0" />
                      <span className="font-bold text-xs truncate">{folder.name}</span>
                    </div>
                    <span className="text-[9px] opacity-60 px-1.5 py-0.5 bg-black/5 rounded shrink-0">{folder.object_type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border flex flex-col gap-3 shrink-0 ${theme.panel}`}>
          <div>
            <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 ${theme.textMuted}`}>{t.selectExportFormat}</h4>
            <div className="flex flex-col gap-2">
                <button onClick={() => handleGenerateReport('WORD')} disabled={!selectedFolderId} className={`group flex items-center p-4 rounded-2xl border text-left transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? 'bg-gray-800/40 border-gray-700/50 hover:bg-blue-900/20 hover:border-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'bg-white border-gray-200 hover:bg-blue-50/50 hover:border-blue-300 hover:shadow-lg'}`}>
                  <div className={`p-3 rounded-xl mr-4 transition-transform duration-300 group-hover:scale-110 ${isDarkMode ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20' : 'bg-blue-50 text-blue-600'}`}>
                    <FileText size={24} />
                  </div>
                  <div className="flex flex-col">
                    <span className={`font-bold transition-colors ${isDarkMode ? 'text-gray-200 group-hover:text-blue-400' : 'text-gray-800 group-hover:text-blue-700'}`}>{t.generateWord}</span>
                    <span className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{t.wordDesc}</span>
                  </div>
                </button>
                
                <button onClick={() => handleGenerateReport('EXCEL')} disabled={!selectedFolderId} className={`group flex items-center p-4 rounded-2xl border text-left transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? 'bg-gray-800/40 border-gray-700/50 hover:bg-green-900/20 hover:border-green-500/50 hover:shadow-[0_0_15px_rgba(34,197,94,0.15)]' : 'bg-white border-gray-200 hover:bg-green-50/50 hover:border-green-300 hover:shadow-lg'}`}>
                  <div className={`p-3 rounded-xl mr-4 transition-transform duration-300 group-hover:scale-110 ${isDarkMode ? 'bg-green-500/10 text-green-400 group-hover:bg-green-500/20' : 'bg-green-50 text-green-600'}`}>
                    <FileSpreadsheet size={24} />
                  </div>
                  <div className="flex flex-col">
                    <span className={`font-bold transition-colors ${isDarkMode ? 'text-gray-200 group-hover:text-green-400' : 'text-gray-800 group-hover:text-green-700'}`}>{t.generateExcel}</span>
                    <span className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{t.excelDesc}</span>
                  </div>
                </button>
                
                <button onClick={() => handleGenerateReport('PPT')} disabled={!selectedFolderId} className={`group flex items-center p-4 rounded-2xl border text-left transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? 'bg-gray-800/40 border-gray-700/50 hover:bg-orange-900/20 hover:border-orange-500/50 hover:shadow-[0_0_15px_rgba(249,115,22,0.15)]' : 'bg-white border-gray-200 hover:bg-orange-50/50 hover:border-orange-300 hover:shadow-lg'}`}>
                  <div className={`p-3 rounded-xl mr-4 transition-transform duration-300 group-hover:scale-110 ${isDarkMode ? 'bg-orange-500/10 text-orange-400 group-hover:bg-orange-500/20' : 'bg-orange-50 text-orange-600'}`}>
                    <Presentation size={24} />
                  </div>
                  <div className="flex flex-col">
                    <span className={`font-bold transition-colors ${isDarkMode ? 'text-gray-200 group-hover:text-orange-400' : 'text-gray-800 group-hover:text-orange-700'}`}>{t.generatePpt}</span>
                    <span className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{t.pptDesc}</span>
                  </div>
                </button>
            </div>
          </div>

          <p className="text-[10px] text-gray-500 text-center leading-normal mt-2">
            Dokumen disusun otomatis menggunakan library Python (python-docx, openpyxl, python-pptx) langsung dari penyimpanan lokal Jetson Orin.
          </p>
        </div>
      </div>

      {/* OVERLAY LOADING PROSES */}
      {isGenerating && (
        <div className={theme.overlay}>
          <div className="flex flex-col items-center text-white">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="text-2xl font-bold mb-2">{t.compilingFile.replace('{X}', generatedType || '')}</h2>
            <p className="text-sm text-blue-300 font-mono">{t.backendCompiling}</p>
          </div>
        </div>
      )}

    </div>
  );
}