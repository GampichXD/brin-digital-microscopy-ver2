import { useState } from 'react';
// import type { ChangeEvent } from 'react';
import { UploadCloud, Undo2, Redo2, Save, X, Scan, Wand2, Contrast, Move, Ruler, Droplet, Maximize, FolderPlus, Layers, Activity } from 'lucide-react';
import VirtualKeyboard from './VirtualKeyboard';

interface ImageAnalysisTabProps {
  isDarkMode: boolean;
  targetImage: string | null; 
  onClearTarget: () => void;  
}

interface AnalysisState {
  id: number;
  processName: string;
  cssFilter: string;
  colonies: { x: number; y: number }[] | null;
}

export default function ImageAnalysisTab({ isDarkMode, targetImage, onClearTarget }: ImageAnalysisTabProps) {
  // === STATE SINKRONISASI PROPS ===
  const [prevTargetImage, setPrevTargetImage] = useState<string | null>(targetImage);
  
  // === STATE GAMBAR & HISTORY ===
  const [currentImage, setCurrentImage] = useState<string | null>(targetImage);
  
  // SOLUSI PURITY: Menggunakan angka index statis (1) sebagai id inisialisasi awal, bukan Date.now()
  const [history, setHistory] = useState<AnalysisState[]>(
    targetImage ? [{ id: 1, processName: 'Original Image', cssFilter: 'brightness(1) contrast(1) blur(0px)', colonies: null }] : []
  );
  const [historyIndex, setHistoryIndex] = useState(targetImage ? 0 : -1);

  // === LOGIKA DERIVING STATE (MURNI TANPA DATE.NOW) ===
  if (targetImage !== prevTargetImage) {
    setPrevTargetImage(targetImage);
    if (targetImage) {
      setCurrentImage(targetImage);
      setHistory([{ id: 1, processName: 'Original Image', cssFilter: 'brightness(1) contrast(1) blur(0px)', colonies: null }]);
      setHistoryIndex(0);
    } else {
      setCurrentImage(null);
      setHistory([]);
      setHistoryIndex(-1);
    }
  }

  // === STATE PROSES ===
  const [isProcessing, setIsProcessing] = useState(false);
  const [processTask, setProcessTask] = useState('');
  
  // === STATE MODAL SIMPAN & FORM ===
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderObjType, setNewFolderObjType] = useState('');
  const [newFolderOperator, setNewFolderOperator] = useState('Abraham');

  const [localKeyboard, setLocalKeyboard] = useState<{ visible: boolean, title: string, targetSetter: React.Dispatch<React.SetStateAction<string>> | null }>({ visible: false, title: '', targetSetter: null });

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-blue-400' : 'bg-white border-gray-300 text-blue-600',
    btnHover: isDarkMode ? 'hover:bg-gray-800 active:bg-gray-700' : 'hover:bg-gray-100 active:bg-gray-200',
    btnTouch: isDarkMode ? 'bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border-gray-600' : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 border-gray-300',
    overlay: 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4'
  };

  const dummyFolders = [
    { id: '1', name: 'E_Coli_Sample_A' },
    { id: '2', name: 'Yeast_Cells_01' },
    { id: '3', name: 'Micro_Plastics_B' },
  ];

  const handleLocalKeyboardInput = (key: string) => {
    if (!localKeyboard.targetSetter) return;
    localKeyboard.targetSetter((prev: string) => {
      if (key === 'BACK') return prev.slice(0, -1);
      return prev + key;
    });
  };

  const triggerLocalKeyboard = (title: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    setLocalKeyboard({ visible: true, title, targetSetter: setter });
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const filename = e.target.files[0].name;
      setCurrentImage(filename);
      setHistory([{ id: 1, processName: 'Original Image', cssFilter: 'brightness(1) contrast(1) blur(0px)', colonies: null }]);
      setHistoryIndex(0);
    }
  };

  const closeImage = () => {
    setCurrentImage(null);
    setHistory([]);
    setHistoryIndex(-1);
    onClearTarget(); 
  };

  const handleSaveToFolder = () => {
    if (!selectedFolderId && (!newFolderName || !newFolderObjType)) return alert("Pilih folder atau isi data folder baru dengan lengkap!");
    alert(`Hasil Analisis berhasil disimpan ke folder ${newFolderName ? newFolderName : 'yang dipilih'}.`);
    setShowSaveModal(false);
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = () => { if (canUndo) setHistoryIndex(prev => prev - 1); };
  const redo = () => { if (canRedo) setHistoryIndex(prev => prev + 1); };

  const executeTool = (toolName: string, cssUpdate: string, isAI: boolean = false) => {
    setIsProcessing(true);
    setProcessTask(`Menerapkan ${toolName}...`);

    setTimeout(() => {
      const currentState = history[historyIndex];
      const newColonies = isAI ? Array.from({ length: Math.floor(Math.random() * 15) + 5 }, () => ({
        x: Math.random() * 80 + 10, 
        y: Math.random() * 80 + 10  
      })) : currentState.colonies;

      // Event handler aman menggunakan state length + timestamp internal
      const newState: AnalysisState = {
        id: history.length + 1,
        processName: toolName,
        cssFilter: cssUpdate,
        colonies: newColonies
      };

      const newHistory = [...history.slice(0, historyIndex + 1), newState];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      
      setIsProcessing(false);
    }, 1500); 
  };

  const runDenoise = () => executeTool('Denoising & Smoothing', 'brightness(1) contrast(1) blur(2px)');
  const runCLAHE = () => executeTool('CLAHE (Contrast Adjustment)', 'brightness(1.2) contrast(1.5) blur(0px)');
  const runEdgeDetection = () => executeTool('Edge Detection (Sobel)', 'invert(1) grayscale(100%) contrast(200%)');
  const runColonyCounter = () => executeTool('AI YOLO Colony Counter', history[historyIndex].cssFilter, true);

  const activeState = history[historyIndex];

  return (
    <div className="flex h-full relative">
      
      {!currentImage && (
        <div className={`w-full h-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-colors ${isDarkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-300 bg-gray-50'}`}>
          <div className="w-24 h-24 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center mb-6">
            <UploadCloud size={48} />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${theme.text}`}>Pilih Gambar untuk Dianalisis</h2>
          <p className={`text-sm mb-8 max-w-md text-center ${theme.textMuted}`}>Kamu bisa menekan tombol di bawah untuk mengunggah gambar dari penyimpanan lokal, atau lempar gambar secara otomatis dari Tab Image Gathering.</p>
          
          <label className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold flex items-center justify-center cursor-pointer shadow-lg active:scale-95 transition-all">
            <UploadCloud size={20} className="mr-2" /> UNGGAH DARI PERANGKAT
            <input type="file" className="hidden" accept="image/*" onChange={handleManualUpload} />
          </label>
        </div>
      )}

      {currentImage && (
        <div className="flex w-full gap-3">
          
          <div className="relative w-[70%] h-full flex flex-col gap-3 shrink-0">
            
            {/* PERBAIKAN TATA LETAK HEADER AGAR ADAPTIVE & TIDAK OVERFLOW */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between shrink-0 shadow-sm gap-2 overflow-hidden ${theme.panel}`}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button onClick={closeImage} className="p-2.5 rounded-xl border border-red-500/50 text-red-500 bg-red-500/10 hover:bg-red-500 hover:text-white active:scale-95 transition-colors shrink-0">
                  <X size={18}/>
                </button>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-sm font-bold font-mono truncate ${theme.text}`}>{currentImage}</span>
                  <span className="text-[10px] font-bold text-blue-500 truncate">STATUS: {activeState?.processName.toUpperCase()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className={`flex items-center border rounded-xl overflow-hidden p-1 ${isDarkMode ? 'bg-gray-950 border-gray-700' : 'bg-gray-100 border-gray-300'}`}>
                  <button onClick={undo} disabled={!canUndo} className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${canUndo ? 'text-blue-500 hover:bg-blue-500/10' : theme.textMuted}`}><Undo2 size={16}/></button>
                  <div className={`w-px h-5 mx-0.5 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                  <button onClick={redo} disabled={!canRedo} className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${canRedo ? 'text-blue-500 hover:bg-blue-500/10' : theme.textMuted}`}><Redo2 size={16}/></button>
                </div>
                <button onClick={() => setShowSaveModal(true)} className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold flex items-center shadow-md active:scale-95 transition-all text-xs whitespace-nowrap">
                  <Save size={16} className="mr-1.5"/> SIMPAN
                </button>
              </div>
            </div>

            <div className={`flex-1 rounded-2xl border-2 flex items-center justify-center relative overflow-hidden bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPHBhdGggZD0iTTAgMEw4IDhaTTAgOEw4IDBaIiBzdHJva2U9IiNmZmYiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+')] ${isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-300 bg-gray-200'}`}>
              <div 
                className="w-3/4 aspect-video bg-blue-900/20 border-2 border-blue-500/30 rounded-xl relative transition-all duration-500"
                style={{ filter: activeState?.cssFilter }} 
              >
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                  <Layers size={80} className="text-blue-400" />
                </div>
                {activeState?.colonies && activeState.colonies.map((colony, i) => (
                  <div 
                    key={i} 
                    className="absolute border-2 border-green-400 bg-green-400/20 rounded-full shadow-[0_0_10px_rgba(74,222,128,0.5)] flex items-center justify-center"
                    style={{ left: `${colony.x}%`, top: `${colony.y}%`, width: '20px', height: '20px', transform: 'translate(-50%, -50%)' }}
                  >
                    <span className="text-[6px] font-bold text-green-300 absolute -top-3">SEL</span>
                  </div>
                ))}
              </div>
              {activeState?.colonies && (
                <div className="absolute bottom-6 left-6 px-4 py-3 bg-green-900/80 border border-green-500 rounded-xl backdrop-blur-md flex items-center shadow-2xl">
                   <Activity size={24} className="text-green-400 mr-3" />
                   <div className="flex flex-col">
                     <span className="text-xs text-green-300 font-bold uppercase">Hasil Deteksi Model</span>
                     <span className="text-xl font-black text-white">{activeState.colonies.length} Koloni Ditemukan</span>
                   </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-[30%] h-full flex flex-col gap-3">
            <div className={`p-4 rounded-2xl border shrink-0 ${theme.panel}`}>
              <h2 className={`font-bold text-lg mb-1 ${theme.text}`}>Analysis Tools</h2>
              <p className={`text-xs ${theme.textMuted}`}>Pilih metode pemrosesan gambar.</p>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3" style={{ scrollbarWidth: 'none' }}>
              <div className={`p-3 rounded-2xl border flex flex-col gap-2 ${theme.panel}`}>
                <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${theme.textMuted}`}>1. Pemrosesan Kecerdasan Buatan</h3>
                <button onClick={runColonyCounter} className="w-full p-3 rounded-xl border border-purple-500/50 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 active:scale-95 flex items-center transition-colors text-sm font-bold text-left">
                  <Scan size={18} className="mr-3 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">AI YOLO Colony Counter</span><span className="text-[9px] opacity-70 font-normal">Deteksi & Hitung Otomatis</span></div>
                </button>
                <button onClick={() => executeTool('Morphological Analysis', activeState?.cssFilter || '', false)} className="w-full p-3 rounded-xl border border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10 active:scale-95 flex items-center transition-colors text-sm font-bold text-left">
                  <Maximize size={18} className="mr-3 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">Kalkulasi Morfologi</span><span className="text-[9px] opacity-70 font-normal">Hitung Area & Keliling Sel</span></div>
                </button>
              </div>

              <div className={`p-3 rounded-2xl border flex flex-col gap-2 ${theme.panel}`}>
                <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${theme.textMuted}`}>2. Image Enhancement</h3>
                <button onClick={runCLAHE} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Contrast size={18} className="mr-3 text-orange-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">CLAHE Thresholding</span><span className="text-[9px] font-normal text-gray-500">Pertajam Kontras Lokal</span></div>
                </button>
                <button onClick={runDenoise} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Wand2 size={18} className="mr-3 text-yellow-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">Denoising & Smoothing</span><span className="text-[9px] font-normal text-gray-500">Bersihkan Noise Sensor</span></div>
                </button>
                <button onClick={runEdgeDetection} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Layers size={18} className="mr-3 text-cyan-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">Edge Detection (Sobel)</span><span className="text-[9px] font-normal text-gray-500">Ekstraksi Dinding Sel</span></div>
                </button>
              </div>

              <div className={`p-3 rounded-2xl border flex flex-col gap-2 ${theme.panel}`}>
                <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${theme.textMuted}`}>3. Utilitas & Kalibrasi</h3>
                <button onClick={() => executeTool('ROI Selection', activeState?.cssFilter || '')} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Move size={18} className="mr-3 text-green-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">Region of Interest (ROI)</span><span className="text-[9px] font-normal text-gray-500">Potong/Pilih Area Spesifik</span></div>
                </button>
                <button onClick={() => executeTool('Scale Calibration', activeState?.cssFilter || '')} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Ruler size={18} className="mr-3 text-red-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">Kalibrasi Skala (µm)</span><span className="text-[9px] font-normal text-gray-500">Set Rasio Pixel ke Mikrometer</span></div>
                </button>
                <button onClick={() => executeTool('Color Split', activeState?.cssFilter || '')} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Droplet size={18} className="mr-3 text-pink-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">Color Channel Split</span><span className="text-[9px] font-normal text-gray-500">Pisahkan Warna Staining</span></div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className={theme.overlay}>
          <div className="flex flex-col items-center text-white">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="text-2xl font-bold mb-2">{processTask}</h2>
            <p className="text-sm text-blue-300 font-mono">Mohon tunggu, AI sedang memproses tensor...</p>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[80] flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border ${theme.panel}`}>
            <h2 className={`text-xl font-bold mb-4 ${theme.text}`}>Simpan Hasil Analisis</h2>
            <div className="space-y-6 mb-8">
              <div>
                <label className={`block text-xs font-bold mb-2 ${theme.textMuted}`}>Pilih Folder Destinasi:</label>
                <div className="grid gap-2 max-h-32 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none' }}>
                  {dummyFolders.map(folder => (
                    <div key={folder.id} onClick={() => { setSelectedFolderId(folder.id); setNewFolderName(''); setNewFolderObjType(''); }} className={`p-3 rounded-xl border cursor-pointer flex items-center transition-colors ${selectedFolderId === folder.id ? 'border-blue-500 bg-blue-500/10 text-blue-400' : `${theme.panel} ${theme.text} hover:border-gray-500`}`}>
                      <FolderPlus size={18} className="mr-3" />
                      <span className="font-bold text-sm">{folder.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center text-xs font-bold text-gray-500"><div className="flex-1 border-t border-gray-600"></div><span className="px-3">ATAU BUAT BARU</span><div className="flex-1 border-t border-gray-600"></div></div>
              <div className="space-y-3">
                <div onClick={() => { setSelectedFolderId(null); triggerLocalKeyboard('Nama Folder Baru', setNewFolderName); }}>
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>Nama Folder</label>
                  <input type="text" readOnly value={newFolderName} placeholder="Ketuk untuk mengisi..." className={`w-full px-4 py-3 rounded-xl border text-sm font-bold shadow-inner cursor-pointer ${theme.input}`} />
                </div>
                <div onClick={() => { setSelectedFolderId(null); triggerLocalKeyboard('Jenis Objek (Label AI)', setNewFolderObjType); }}>
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>Jenis Objek (Label AI)</label>
                  <input type="text" readOnly value={newFolderObjType} placeholder="Contoh: Bakteri, Sel..." className={`w-full px-4 py-3 rounded-xl border text-sm font-bold shadow-inner cursor-pointer ${theme.input}`} />
                </div>
                <div onClick={() => { setSelectedFolderId(null); triggerLocalKeyboard('Nama Operator', setNewFolderOperator); }}>
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>Nama Operator</label>
                  <input type="text" readOnly value={newFolderOperator} className={`w-full px-4 py-3 rounded-xl border text-sm font-bold shadow-inner cursor-pointer opacity-70 ${theme.input}`} />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSaveModal(false)} className={`flex-1 py-3 rounded-xl font-bold border ${theme.textMuted} ${theme.btnTouch}`}>Batal</button>
              <button onClick={handleSaveToFolder} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 shadow-lg">
                <Save size={18} className="mr-2"/> Konfirmasi Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {localKeyboard.visible && (
        <div className="fixed inset-0 z-[90] pointer-events-none flex items-end justify-center pb-6">
          <div className="pointer-events-auto">
            <VirtualKeyboard title={localKeyboard.title} onInput={handleLocalKeyboardInput} onClose={() => setLocalKeyboard({ visible: false, title: '', targetSetter: null })} />
          </div>
        </div>
      )}

    </div>
  );
}