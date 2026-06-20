import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import axios from 'axios'; // <--- 1. TAMBAHKAN IMPORT AXIOS
import { Camera, Grid3X3, Play, Crosshair, Settings2, Image as ImageIcon, MousePointerSquareDashed, Gamepad2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, X, Save, Scan, Clock, ArrowUpLeft, Move, FolderPlus, Map, RefreshCcw, Trash2, AlertTriangle, Layers } from 'lucide-react';
import type { KeypadConfig } from '../App';
import VirtualKeyboard from './VirtualKeyboard';

interface DatasetFolder {
  id: string;
  name: string;
  object_type: string; // Ganti ke snake_case sesuai PostgreSQL backend
  date: string;
  operator: string;
  image_count: number; // Ganti ke snake_case sesuai PostgreSQL backend
}

interface ImageGatheringTabProps {
  isDarkMode: boolean;
  openKeypad: (config: KeypadConfig) => void;
  availableFolders?: DatasetFolder[]; 
  onNavigateToAnalysis?: (imageName: string) => void;
  globalVirtualKeyboard: boolean; 
}

interface CapturedImage {
  index: number;
  filename: string | null;
  coordX: number;
  coordY: number;
  gridX: number;
  gridY: number;
}

export default function ImageGatheringTab({ isDarkMode, openKeypad, availableFolders = [], onNavigateToAnalysis, globalVirtualKeyboard }: ImageGatheringTabProps) {
  const [gatherMode, setGatherMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [cols, setCols] = useState("5");
  const [rows, setRows] = useState("4");
  const [stepUnit, setStepUnit] = useState<'mm' | 'inch'>('mm');
  const [stepX, setStepX] = useState("1.5"); 
  const [stepY, setStepY] = useState("1.5"); 
  const [zStep, setZStep] = useState("100");
  const [camDelay, setCamDelay] = useState("500");
  const [autoStitch, setAutoStitch] = useState(false);
  const [controlMode, setControlMode] = useState<'dpad' | 'joystick'>('dpad');

  const [isProcessing, setIsProcessing] = useState(false);
  const [processTask, setProcessTask] = useState('');
  const [progress, setProgress] = useState(0);
  const [timerTick, setTimerTick] = useState(0);

  const [processTimes, setProcessTimes] = useState({ scan: 0, stitch: 0, total: 0 });
  const [isRetaking, setIsRetaking] = useState(false); 

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showStitchModal, setShowStitchModal] = useState(false);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  
  const [saveForm, setSaveForm] = useState({ folderName: '', objectType: '', operatorName: 'Abraham' });
  const [vk, setVk] = useState<{ visible: boolean, title: string, field: 'folderName' | 'objectType' | 'operatorName' | null }>({ visible: false, title: '', field: null });

  const c = parseInt(cols) || 1;
  const r = parseInt(rows) || 1;
  const sx = parseFloat(stepX) || 0;
  const sy = parseFloat(stepY) || 0;
  
  const totalImagesConfig = gatherMode === 'AUTO' ? c * r : capturedImages.length;
  const validImageCount = capturedImages.filter(img => img.filename !== null).length;

  const unitMultiplier = stepUnit === 'inch' ? 25.4 : 1;
  const totalAreaX_mm = (c - 1) * sx * unitMultiplier;
  const totalAreaY_mm = (r - 1) * sy * unitMultiplier;
  
  const MAX_CNC_X = 160;
  const MAX_CNC_Y = 100;
  const isLimitExceeded = totalAreaX_mm > MAX_CNC_X || totalAreaY_mm > MAX_CNC_Y;

  const delaySec = (parseInt(camDelay) || 500) / 1000;
  const motorMoveTimeSec = 1.2; 
  const estimatedTotalSeconds = c * r * (delaySec + motorMoveTimeSec);
  const estMins = Math.floor(estimatedTotalSeconds / 60);
  const estSecs = Math.floor(estimatedTotalSeconds % 60);

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-blue-400' : 'bg-white border-gray-300 text-blue-600',
    btnTouch: isDarkMode ? 'bg-gray-800 border-gray-600 hover:bg-gray-700 active:bg-gray-600' : 'bg-gray-100 border-gray-300 hover:bg-gray-200 active:bg-gray-300',
    modalBg: 'fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4',
    overlay: 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4' 
  };

  const fallbackFolders = [
    { id: '1', name: 'Riset_Coli_Tembalang_01', object_type: 'Bakteri E. Coli', operator: 'Abraham', date: '2026-06-12', image_count: 0 },
  ];

  const triggerGlobalKeypad = (title: string, currentValue: string, setter: (val: string) => void) => {
    if(!globalVirtualKeyboard) return; 
    openKeypad({ visible: true, title, value: currentValue, onUpdate: setter });
  };

  const handleVKInput = (key: string) => {
    if (!vk.field) return;
    const updateVal = (prev: string) => key === 'BACK' ? prev.slice(0, -1) : prev + key;
    setSaveForm({ ...saveForm, [vk.field]: updateVal(saveForm[vk.field]) });
  };

  const triggerVK = (title: string, field: 'folderName' | 'objectType' | 'operatorName') => {
    if (!globalVirtualKeyboard) return;
    setVk({ visible: true, title, field });
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isProcessing) interval = setInterval(() => setTimerTick(prev => prev + 1), 1000);
    return () => { if (interval) clearInterval(interval); };
  }, [isProcessing]);

  const elapsedTimeText = `${String(Math.floor(timerTick / 60)).padStart(2, '0')}:${String(timerTick % 60).padStart(2, '0')}`;

  // === 2. AKUISISI OTOMATIS RIIL BERBASIS HARDWARE ENDPOINT ===
  const handleStartAuto = async () => {
    setIsProcessing(true);
    setProcessTask('Mengambil Gambar & Koordinat CNC...');
    setTimerTick(0);
    setProgress(0);
    setProcessTimes({ scan: 0, stitch: 0, total: 0 }); 
    
    const startTime = new Date().getTime();

    try {
      // Kirim parameter grid ke backend untuk dieksekusi oleh hardware secara sekuensial
      const response = await axios.post('http://localhost:8000/api/hardware/scan/grid', {
        columns: c,
        rows: r,
        step_x: sx,
        step_y: sy,
        delay_ms: parseInt(camDelay),
        unit: stepUnit
      });

      // Simpan riwayat citra pecahan yang ditangkap oleh kamera IMX477
      setCapturedImages(response.data.images);
      const scanT = (new Date().getTime() - startTime) / 1000;

      if (autoStitch) {
        executeStitching(scanT); 
      } else { 
        setProcessTimes({ scan: scanT, stitch: 0, total: scanT });
        setIsProcessing(false); 
        setShowReviewModal(true); 
      }
    } catch (error) {
      console.error(error);
      alert("Proses pemindaian terputus. Periksa kabel limit switch atau port serial CNC.");
      setIsProcessing(false);
    }
  };

  const handleManualCapture = () => {
    const newIndex = capturedImages.length;
    setCapturedImages(prev => [...prev, { index: newIndex, filename: `IMG_MANUAL_${String(newIndex + 1).padStart(4, '0')}.jpg`, coordX: 0, coordY: 0, gridX: 0, gridY: 0 }]);
  };

  // === 3. EKSEKUSI AI TILE STITCHING NYATA DI SERVER FASTAPI ===
  const executeStitching = async (scanTParam = processTimes.scan) => {
    setShowReviewModal(false);
    setIsProcessing(true);
    setProcessTask('AI Tile Stitching Berjalan di Jetson Orin...');
    setTimerTick(0);
    setProgress(30); // Pre-load visual indicator

    const stitchStart = new Date().getTime();

    try {
      await axios.post('http://localhost:8000/api/hardware/stitch', {
        images: capturedImages.filter(img => img.filename !== null).map(img => img.filename)
      });

      const stitchT = (new Date().getTime() - stitchStart) / 1000;
      setProcessTimes({ scan: scanTParam, stitch: stitchT, total: scanTParam + stitchT });
      
      setIsProcessing(false);
      setShowStitchModal(true);
    } catch (error) {
      console.error(error);
      alert("Proses stitching gagal. Periksa OpenCV library di VPS/Jetson.");
      setIsProcessing(false);
    }
  };

  const removeCapturedImage = (index: number) => {
    setCapturedImages(prev => prev.map(img => img.index === index ? { ...img, filename: null } : img));
  };

  const retakeImage = (index: number, cx: number, cy: number) => {
    setIsProcessing(true);
    setProcessTask(`Retake Koordinat (X:${cx}, Y:${cy})...`);
    setTimerTick(0);
    setProgress(0);

    setTimeout(() => {
      setCapturedImages(prev => prev.map(img => img.index === index ? { ...img, filename: `IMG_RETAKE_${String(index+1).padStart(4, '0')}.jpg` } : img));
      setIsProcessing(false);
      setIsRetaking(true);
      setTimeout(() => setIsRetaking(false), 500); 
    }, 1500);
  };

  // === 4. SIMPAN HASIL TANGKAPAN KE POSTGRESQL MELALUI API ===
  const handleSaveToFolder = async () => {
    if (!selectedFolderId && (!saveForm.folderName || !saveForm.objectType)) {
      return alert("Isi nama folder dan jenis objek!");
    }

    try {
      if (selectedFolderId) {
        // Jika folder sudah ada, tambahkan image_count di backend
        await axios.put(`http://localhost:8000/api/dataset/folders/${selectedFolderId}/add-images`, {
          count: validImageCount
        });
      } else {
        // Jika buat folder baru dari modal simpan
        await axios.post('http://localhost:8000/api/dataset/folders', {
          name: saveForm.folderName,
          object_type: saveForm.objectType,
          date: new Date().toISOString().split('T')[0],
          operator: saveForm.operatorName
        });
      }
      alert('Dataset Berhasil Disimpan Secara Permanen!');
      setShowSaveModal(false);
      setCapturedImages([]);
    } catch (error) {
      console.error(error);
      alert("Gagal menyimpan dataset ke basis data.");
    }
  };

  const handleSendToAnalysis = (imageName: string | undefined) => {
    if (!imageName) return;
    if (onNavigateToAnalysis) onNavigateToAnalysis(imageName);
  };

  return (
    <div className="flex gap-3 h-full relative">
      
      {/* ==================== KIRI: PREVIEW KAMERA ==================== */}
      <div className={`relative w-[55%] h-full flex flex-col shrink-0 overflow-hidden rounded-2xl border-2 ${isDarkMode ? 'border-gray-700 bg-black' : 'border-gray-300 bg-gray-100'}`}>
        {isRetaking && <div className="absolute inset-0 bg-white z-50 animate-flash pointer-events-none"></div>}

        <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40">
          <Camera size={80} className={theme.textMuted} />
          <p className={`font-mono mt-4 font-bold text-lg ${theme.textMuted}`}>LIVE STREAM (IMX477)</p>
          <p className={`text-xs ${theme.textMuted} mt-1`}>Micro View Full Resolusi</p>
        </div>
        <div className="absolute top-4 left-4 p-2 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center shadow-lg text-white z-10">
          <Crosshair size={14} className="text-red-400 mr-2" />
          <span className="font-mono text-[10px] font-bold tracking-wider">POS: X:0.00 Y:0.00</span>
        </div>
      </div>

      {/* ==================== KANAN: PANEL KONTROL ==================== */}
      <div className="w-[45%] h-full flex flex-col gap-3">
        
        <div className={`flex rounded-xl border p-1 shrink-0 ${theme.panel}`}>
          <button onClick={() => setGatherMode('AUTO')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${gatherMode === 'AUTO' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}>AUTO GATHER</button>
          <button onClick={() => setGatherMode('MANUAL')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${gatherMode === 'MANUAL' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}>MANUAL GATHER</button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3" style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => axios.post('http://localhost:8000/api/hardware/motor/home')} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all text-xs shrink-0">
            <ArrowUpLeft size={18} className="mr-2" /> KEMBALIKAN KE POJOK KIRI ATAS (0,0)
          </button>

          {gatherMode === 'AUTO' && (
            <>
              <div className={`p-4 rounded-2xl border shrink-0 ${theme.panel}`}>
                <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center mb-3 ${theme.text}`}><Grid3X3 size={16} className="mr-2 text-blue-400" /> Parameter Grid</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${theme.textMuted}`}>Kolom</span>
                      <input 
                        readOnly={globalVirtualKeyboard}
                        value={cols}
                        onChange={(e) => setCols(e.target.value)}
                        onClick={() => triggerGlobalKeypad('Jumlah Kolom', cols, setCols)} 
                        className={`w-14 h-8 flex items-center justify-center text-center rounded-lg border font-mono font-bold cursor-pointer ${theme.input}`}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${theme.textMuted}`}>Baris</span>
                      <input 
                        readOnly={globalVirtualKeyboard}
                        value={rows}
                        onChange={(e) => setRows(e.target.value)}
                        onClick={() => triggerGlobalKeypad('Jumlah Baris', rows, setRows)} 
                        className={`w-14 h-8 flex items-center justify-center text-center rounded-lg border font-mono font-bold cursor-pointer ${theme.input}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <select value={stepUnit} onChange={(e: ChangeEvent<HTMLSelectElement>) => setStepUnit(e.target.value as 'mm' | 'inch')} className={`text-[10px] font-bold bg-transparent outline-none ${theme.textMuted}`}><option value="mm">Step X (mm)</option><option value="inch">Step X (in)</option></select>
                      <input 
                        readOnly={globalVirtualKeyboard}
                        value={stepX}
                        onChange={(e) => setStepX(e.target.value)}
                        onClick={() => triggerGlobalKeypad('Step X', stepX, setStepX)} 
                        className={`w-14 h-8 flex items-center justify-center text-center rounded-lg border font-mono font-bold cursor-pointer ${theme.input}`}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold ${theme.textMuted}`}>Step Y ({stepUnit})</span>
                      <input 
                        readOnly={globalVirtualKeyboard}
                        value={stepY}
                        onChange={(e) => setStepY(e.target.value)}
                        onClick={() => triggerGlobalKeypad('Step Y', stepY, setStepY)} 
                        className={`w-14 h-8 flex items-center justify-center text-center rounded-lg border font-mono font-bold cursor-pointer ${theme.input}`}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700/50">
                  <span className={`text-[10px] font-bold ${theme.textMuted}`}>Camera Settle Delay (ms)</span>
                  <input 
                    readOnly={globalVirtualKeyboard}
                    value={camDelay}
                    onChange={(e) => setCamDelay(e.target.value)}
                    onClick={() => triggerGlobalKeypad('Camera Delay (ms)', camDelay, setCamDelay)} 
                    className={`w-14 h-8 flex items-center justify-center text-center rounded-lg border font-mono font-bold cursor-pointer ${theme.input}`}
                  />
                </div>
              </div>

              <div className={`p-4 rounded-2xl border shrink-0 ${theme.panel}`}>
                <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center mb-3 ${theme.text}`}><Settings2 size={16} className="mr-2 text-purple-400" /> Post-Processing</h3>
                <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-xl bg-black/5">
                  <input type="checkbox" checked={autoStitch} onChange={(e: ChangeEvent<HTMLInputElement>) => setAutoStitch(e.target.checked)} className="w-5 h-5 rounded border-gray-400 text-blue-600 focus:ring-blue-500" />
                  <div className="flex flex-col">
                    <span className={`text-sm font-bold ${theme.text}`}>Langsung Tile Stitching</span>
                    <span className={`text-[10px] ${theme.textMuted}`}>Bypass pop-up review pecahan gambar</span>
                  </div>
                </label>
              </div>

              <div className={`p-3 rounded-2xl border shrink-0 flex flex-col ${theme.panel}`}>
                <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center mb-2 ${theme.textMuted}`}>
                  <Map size={14} className="mr-2" /> Minimap Area CNC (Macro)
                </h3>
                <div className="h-24 bg-black/5 rounded-xl border border-gray-600/30 overflow-hidden relative flex items-center justify-center p-1">
                  <div className="w-full h-full max-w-[200px] border border-blue-500/50 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols || 1}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows || 1}, minmax(0, 1fr))` }}>
                    {Array.from({ length: totalImagesConfig || 0 }).map((_, i) => (
                      <div key={i} className="rounded-sm bg-blue-500/10 border border-blue-500/30"></div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-2 pt-2">
                {isLimitExceeded ? (
                  <div className="bg-red-500/10 border border-red-500/50 p-2 rounded-xl flex items-center">
                    <AlertTriangle size={24} className="text-red-500 mr-3 shrink-0" />
                    <p className="text-red-500 font-bold text-[10px] leading-tight">PERINGATAN K3: Dimensi Grid ({Math.round(totalAreaX_mm)}x{Math.round(totalAreaY_mm)}mm) melebihi batas aman pergerakan motor mesin CNC ({MAX_CNC_X}x{MAX_CNC_Y}mm)!</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className={`text-[10px] font-bold ${theme.textMuted}`}>Estimasi Waktu Akuisisi: ~{estMins} Menit {estSecs} Detik</p>
                  </div>
                )}
                
                <button 
                  onClick={handleStartAuto} 
                  disabled={isLimitExceeded}
                  className={`py-4 rounded-2xl font-bold flex items-center justify-center transition-all ${isLimitExceeded ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white shadow-[0_0_20px_rgba(34,197,94,0.3)] active:scale-95'}`}
                >
                  <Play size={20} className="mr-2" /> CAPTURE {totalImagesConfig || 0} GAMBAR
                </button>
              </div>
            </>
          )}

          {gatherMode === 'MANUAL' && (
            <>
              <div className={`p-4 rounded-2xl border shrink-0 ${theme.panel}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-bold uppercase tracking-wider ${theme.text}`}>Kendali Motor</h3>
                  <div className={`flex rounded-lg border p-1 ${isDarkMode ? 'border-gray-700 bg-gray-950' : 'border-gray-300 bg-gray-100'}`}>
                    <button onClick={() => setControlMode('dpad')} className={`p-1.5 rounded-md ${controlMode === 'dpad' ? 'bg-blue-500 text-white' : theme.textMuted}`}><MousePointerSquareDashed size={14} /></button>
                    <button onClick={() => setControlMode('joystick')} className={`p-1.5 rounded-md ${controlMode === 'joystick' ? 'bg-blue-500 text-white' : theme.textMuted}`}><Gamepad2 size={14} /></button>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <select value={stepUnit} onChange={(e: ChangeEvent<HTMLSelectElement>) => setStepUnit(e.target.value as 'mm' | 'inch')} className={`text-[10px] font-bold bg-transparent outline-none ${theme.textMuted}`}><option value="mm">Meja (mm)</option><option value="inch">Meja (in)</option></select>
                      <input 
                        readOnly={globalVirtualKeyboard}
                        value={stepX}
                        onChange={(e) => setStepX(e.target.value)}
                        onClick={() => triggerGlobalKeypad('Step X/Y', stepX, setStepX)} 
                        className={`w-12 h-6 flex items-center justify-center text-center rounded border text-xs font-bold cursor-pointer ${theme.input}`}
                      />
                    </div>
                    {controlMode === 'dpad' ? (
                      <div className="grid grid-cols-3 gap-1 aspect-square">
                        <div />
                        <button onClick={() => axios.post('http://localhost:8000/api/hardware/motor/move', { axis: 'Y', value: parseFloat(stepX) })} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowUp size={24}/></button>
                        <div />
                        <button onClick={() => axios.post('http://localhost:8000/api/hardware/motor/move', { axis: 'X', value: -parseFloat(stepX) })} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowLeft size={24}/></button>
                        <button className="rounded-full border-2 border-blue-500/50 bg-blue-500/10 text-blue-500 flex items-center justify-center active:scale-95"><Crosshair size={20}/></button>
                        <button onClick={() => axios.post('http://localhost:8000/api/hardware/motor/move', { axis: 'X', value: parseFloat(stepX) })} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowRight size={24}/></button>
                        <div />
                        <button onClick={() => axios.post('http://localhost:8000/api/hardware/motor/move', { axis: 'Y', value: -parseFloat(stepX) })} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowDown size={24}/></button>
                        <div />
                      </div>
                    ) : (
                      <div className={`aspect-square rounded-full border-4 flex items-center justify-center relative touch-none ${isDarkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white"><Move size={20} /></div>
                      </div>
                    )}
                  </div>
                  <div className="w-16 flex flex-col">
                    <div className="flex flex-col mb-2">
                      <span className={`text-[10px] font-bold mb-1 ${theme.textMuted}`}>Z (stp)</span>
                      <input 
                        readOnly={globalVirtualKeyboard}
                        value={zStep}
                        onChange={(e) => setZStep(e.target.value)}
                        onClick={() => triggerGlobalKeypad('Step Z', zStep, setZStep)} 
                        className={`w-full h-6 flex items-center justify-center text-center rounded border text-xs font-bold cursor-pointer ${theme.input}`}
                      />
                    </div>
                    <button onClick={() => axios.post('http://localhost:8000/api/hardware/motor/move', { axis: 'Z', value: parseFloat(zStep) })} className={`flex-1 mb-1 rounded-xl border flex flex-col items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowUp size={20} className="text-blue-500"/></button>
                    <button onClick={() => axios.post('http://localhost:8000/api/hardware/motor/move', { axis: 'Z', value: -parseFloat(zStep) })} className={`flex-1 rounded-xl border flex flex-col items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowDown size={20} className="text-blue-500"/></button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-auto">
                <button onClick={handleManualCapture} className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold flex items-center justify-center active:scale-95 transition-all">
                  <Camera size={20} className="mr-2" /> CAPTURE ({capturedImages.length})
                </button>
                <button onClick={() => setShowReviewModal(true)} disabled={capturedImages.length === 0} className="px-6 py-4 bg-green-600 disabled:bg-gray-600 text-white rounded-2xl font-bold flex items-center justify-center active:scale-95 transition-all">
                  SELESAI
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ==================== OVERLAYS & MODALS ==================== */}

      {isProcessing && (
        <div className={theme.overlay}>
          <div className="flex flex-col items-center text-white w-full max-w-lg">
            {processTask.includes('Mengambil') ? (
              <div className="w-64 h-64 bg-black/50 border border-gray-600 rounded-xl p-2 mb-6">
                 <div className="w-full h-full border border-blue-500/50 grid gap-1" style={{ gridTemplateColumns: `repeat(${cols || 1}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows || 1}, minmax(0, 1fr))` }}>
                  {Array.from({ length: totalImagesConfig || 0 }).map((_, i) => (
                    <div key={i} className={`rounded-sm transition-all duration-200 ${i < progress ? 'bg-green-500/80 border border-green-500' : i === progress ? 'bg-yellow-400 border border-white animate-pulse' : 'bg-gray-800'}`}></div>
                  ))}
                </div>
              </div>
            ) : processTask.includes('Stitching') ? (
              <div className="w-full bg-gray-800 rounded-full h-4 mb-6 border border-gray-600 overflow-hidden">
                <div className="bg-purple-500 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
            ) : (
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            )}

            <h2 className="text-2xl font-bold mb-2">{processTask}</h2>
            <div className="flex items-center gap-4 text-blue-300 font-mono text-lg">
              <span>{processTask.includes('Mengambil') ? `${progress}/${totalImagesConfig}` : `${progress}%`}</span>
              <span>•</span>
              <span className="flex items-center"><Clock size={18} className="mr-2"/> {elapsedTimeText}</span>
            </div>
            <button onClick={() => setIsProcessing(false)} className="mt-8 px-8 py-3 bg-red-600 rounded-full font-bold shadow-lg shadow-red-600/50 active:scale-95">BATALKAN</button>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className={theme.overlay}>
          <div className={`w-[95%] max-w-6xl h-[90vh] rounded-3xl flex flex-col overflow-hidden shadow-2xl ${theme.panel}`}>
            <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-black/20 shrink-0">
              <div>
                <h2 className={`text-2xl font-bold ${theme.text}`}>Hasil Tangkapan Gambar</h2>
                <p className={`text-sm ${theme.textMuted}`}>{validImageCount} dari {totalImagesConfig} gambar terisi. Waktu Scan: {processTimes.scan.toFixed(1)}s.</p>
              </div>
              <button onClick={() => {setShowReviewModal(false); setCapturedImages([]);}} className={`p-2 rounded-xl border ${theme.btnTouch} ${theme.text}`}><X size={24}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-black/5">
              <div 
                className={`grid gap-3 p-4 bg-gray-800 rounded-xl border-2 border-gray-600 w-fit mx-auto h-fit ${gatherMode === 'MANUAL' ? 'grid-cols-4 md:grid-cols-5' : ''}`}
                style={gatherMode === 'AUTO' ? { gridTemplateColumns: `repeat(${cols}, minmax(100px, 1fr))` } : {}}
              >
                {capturedImages.map((img) => (
                  img.filename ? (
                    <div key={img.index} className={`aspect-square rounded-lg border flex flex-col items-center justify-center relative group overflow-hidden ${theme.panel} ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                      <ImageIcon size={28} className={`mb-1 ${theme.textMuted} opacity-50`} />
                      <div className="flex flex-col items-center text-center">
                         <span className={`text-[9px] font-mono font-bold ${theme.textMuted}`}>{img.filename.replace('.jpg','')}</span>
                         {gatherMode === 'AUTO' && <span className="text-[8px] font-bold text-blue-400 mt-0.5">X:{img.coordX} Y:{img.coordY}</span>}
                      </div>
                      <button onClick={() => removeCapturedImage(img.index)} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded hover:bg-red-600 active:scale-95 shadow-md"><X size={14}/></button>
                    </div>
                  ) : (
                    <div key={img.index} className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center bg-red-500/5 border-red-500/30 group">
                      <span className="text-[8px] font-bold text-red-400 mb-2 text-center">KOSONG<br/>X:{img.coordX} Y:{img.coordY}</span>
                      <button onClick={() => retakeImage(img.index, img.coordX, img.coordY)} className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold active:scale-95 shadow-lg"><RefreshCcw size={12} className="mr-1"/> Retake</button>
                    </div>
                  )
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-700 flex items-center bg-black/20 gap-4 shrink-0">
              <button onClick={() => {setShowReviewModal(false); setCapturedImages([]);}} className="px-6 py-4 rounded-xl font-bold flex items-center border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white active:scale-95 transition-colors">
                <Trash2 size={20} className="mr-2"/> BATAL & BUANG
              </button>
              <button onClick={() => setShowSaveModal(true)} disabled={validImageCount === 0} className={`px-6 py-4 rounded-xl font-bold flex items-center border border-transparent active:scale-95 ${theme.btnTouch} ${theme.text}`}>
                <Save size={20} className="mr-2"/> SIMPAN KE FOLDER
              </button>
              {validImageCount === 1 ? (
                <button onClick={() => handleSendToAnalysis(capturedImages.find(i => i.filename)?.filename || '')} className="flex-1 py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-orange-600/20">
                  <Scan size={20} className="mr-2"/> LANJUTKAN KE IMAGE ANALYSIS (1 Gambar)
                </button>
              ) : (
                <button onClick={() => executeStitching()} disabled={validImageCount === 0} className="flex-1 py-4 bg-purple-600 disabled:bg-gray-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-purple-600/20">
                  <Grid3X3 size={20} className="mr-2"/> LANJUTKAN KE TILE STITCHING ({validImageCount} Gambar)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showStitchModal && (
        <div className={theme.modalBg}>
           <div className={`w-[80%] max-w-3xl rounded-3xl flex flex-col overflow-hidden shadow-2xl ${theme.panel}`}>
            <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-black/20">
              <div><h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">Tile Stitching Selesai</h2></div>
              <button onClick={() => {setShowStitchModal(false); setCapturedImages([]);}} className={`p-2 rounded-xl border ${theme.btnTouch} ${theme.text}`}><X size={24}/></button>
            </div>
            
            <div className="p-8 flex flex-col justify-center items-center bg-black/40 border-y border-gray-800">
              <div className="w-full aspect-video border-2 border-purple-500/50 rounded-xl bg-purple-500/10 flex flex-col items-center justify-center relative overflow-hidden mb-4">
                 <ImageIcon size={64} className="text-purple-400 mb-4 opacity-80" />
                 <span className="font-mono font-bold text-purple-300">STITCHED_RESULT.jpg</span>
              </div>
              
              <div className="flex gap-4">
                <div className="px-4 py-2 bg-black/40 border border-gray-700 rounded-lg flex items-center text-xs font-mono text-gray-300">
                  <Camera size={14} className="text-blue-400 mr-2" /> Scan: {processTimes.scan.toFixed(1)}s
                </div>
                <div className="px-4 py-2 bg-black/40 border border-gray-700 rounded-lg flex items-center text-xs font-mono text-gray-300">
                  <Layers size={14} className="text-purple-400 mr-2" /> Stitch: {processTimes.stitch.toFixed(1)}s
                </div>
                <div className="px-4 py-2 bg-black/40 border border-green-700/50 rounded-lg flex items-center text-xs font-mono font-bold text-green-400">
                  <Clock size={14} className="mr-2" /> Total Waktu: {processTimes.total.toFixed(1)}s
                </div>
              </div>
            </div>

            <div className="p-6 flex items-center gap-4 bg-black/20">
              <button onClick={() => {setShowStitchModal(false); setCapturedImages([]);}} className="px-6 py-4 rounded-xl font-bold flex items-center border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white active:scale-95 transition-colors">
                <Trash2 size={20} className="mr-2"/> BUANG HASIL
              </button>
              <button onClick={() => setShowSaveModal(true)} className={`px-6 py-4 rounded-xl font-bold flex items-center border ${theme.btnTouch} ${theme.text}`}><Save size={20} className="mr-2"/> SIMPAN</button>
              <button onClick={() => { setShowStitchModal(false); handleSendToAnalysis("STITCHED_RESULT.jpg"); }} className="flex-1 py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-orange-600/20">
                <Scan size={20} className="mr-2"/> LANJUTKAN KE IMAGE ANALYSIS
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className={theme.modalBg}>
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border ${theme.panel}`}>
            <h2 className={`text-xl font-bold mb-4 ${theme.text}`}>Simpan Hasil Tangkapan</h2>
            <div className="space-y-6 mb-8">
              <div>
                <label className={`block text-xs font-bold mb-2 ${theme.textMuted}`}>Pilih Folder yang Ada:</label>
                <div className="grid gap-2 max-h-32 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none' }}>
                  {(availableFolders.length > 0 ? availableFolders : fallbackFolders).map((folder: {id: string, name: string}) => (
                    <div key={folder.id} onClick={() => { setSelectedFolderId(folder.id); setSaveForm({ folderName: '', objectType: '', operatorName: '' }); }} className={`p-3 rounded-xl border cursor-pointer flex items-center transition-colors ${selectedFolderId === folder.id ? 'border-blue-500 bg-blue-500/10 text-blue-400' : `${theme.panel} ${theme.text} hover:border-gray-500`}`}>
                      <FolderPlus size={18} className="mr-3" />
                      <span className="font-bold text-sm">{folder.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center text-xs font-bold text-gray-500"><div className="flex-1 border-t border-gray-600"></div><span className="px-3">ATAU BUAT BARU</span><div className="flex-1 border-t border-gray-600"></div></div>
              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>Nama Folder</label>
                  <input 
                    type="text" 
                    readOnly={globalVirtualKeyboard}
                    value={saveForm.folderName} 
                    onChange={(e) => setSaveForm({...saveForm, folderName: e.target.value})}
                    onClick={() => { setSelectedFolderId(null); triggerVK('Nama Folder Baru', 'folderName'); }} 
                    placeholder="Ketuk untuk mengisi..." 
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-bold shadow-inner cursor-pointer ${theme.input} ${vk.field === 'folderName' ? 'ring-2 ring-blue-500' : ''}`} 
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>Jenis Objek (Label AI)</label>
                  <input 
                    type="text" 
                    readOnly={globalVirtualKeyboard}
                    value={saveForm.objectType} 
                    onChange={(e) => setSaveForm({...saveForm, objectType: e.target.value})}
                    onClick={() => { setSelectedFolderId(null); triggerVK('Jenis Objek', 'objectType'); }} 
                    placeholder="Contoh: Bakteri, Sel..." 
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-bold shadow-inner cursor-pointer ${theme.input} ${vk.field === 'objectType' ? 'ring-2 ring-blue-500' : ''}`} 
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>Nama Operator</label>
                  <input 
                    type="text" 
                    readOnly={globalVirtualKeyboard}
                    value={saveForm.operatorName} 
                    onChange={(e) => setSaveForm({...saveForm, operatorName: e.target.value})}
                    onClick={() => { setSelectedFolderId(null); triggerVK('Nama Operator', 'operatorName'); }} 
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-bold shadow-inner cursor-pointer opacity-70 ${theme.input} ${vk.field === 'operatorName' ? 'ring-2 ring-blue-500' : ''}`} 
                  />
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

      {vk.visible && globalVirtualKeyboard && (
        <div className="fixed inset-0 z-[110] pointer-events-none flex items-end justify-center pb-4">
          <div className="pointer-events-auto">
            <VirtualKeyboard title={vk.title} onInput={handleVKInput} onClose={() => setVk({ visible: false, title: '', field: null })} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes flash { 0% { opacity: 0.8; background: white; } 100% { opacity: 0; background: transparent; } }
        .animate-flash { animation: flash 0.5s ease-out forwards; }
      `}</style>
    </div>
  );
}