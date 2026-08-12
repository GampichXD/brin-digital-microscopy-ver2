import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import api from '../utils/api';
import { Camera, Grid3X3, Play, Crosshair, Settings2, Image as ImageIcon, MousePointerSquareDashed, Gamepad2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, X, Save, Scan, Clock, ArrowUpLeft, Move, FolderPlus, Map, RefreshCcw, Trash2, AlertTriangle, Layers, CameraOff, Image } from 'lucide-react';
import type { KeypadConfig } from '../App';
import VirtualKeyboard from './VirtualKeyboard';
import { logSystemAction } from '../utils/logger';
import { useTranslation } from '../hooks/useTranslation';
import { useGlobalContext } from '../context/GlobalContext';
import { showToast } from '../utils/toast';

interface DatasetFolder {
  id: string;
  name: string;
  object_type: string; 
  date: string;
  operator: string;
  image_count: number; 
}

interface ImageGatheringTabProps {
  openKeypad: (config: KeypadConfig) => void;
  availableFolders?: DatasetFolder[]; 
  onNavigateToAnalysis: (imageName: string) => void;
  videoSrc: string | null;
  cameraActive: boolean;       
  wsRef: React.MutableRefObject<WebSocket | null>; 
  onRefreshFolders?: () => void;
}

interface CapturedImage {
  index: number;
  filename: string | null;
  coordX: number;
  coordY: number;
  gridX: number;
  gridY: number;
  timestamp: number;
}

export default function ImageGatheringTab({ 
  openKeypad, 
  availableFolders = [], 
  onNavigateToAnalysis, 
  videoSrc,
  cameraActive,
}: ImageGatheringTabProps) {
  const { isDarkMode, globalVirtualKeyboard } = useGlobalContext();
  const { t } = useTranslation();
  const [gatherMode, setGatherMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [cols, setCols] = useState("5");
  const [rows, setRows] = useState("4");
  const [stepUnit, setStepUnit] = useState<'mm' | 'inch'>('mm');
  const [stepX, setStepX] = useState("1"); 
  const [stepY, setStepY] = useState("1"); 
  const [zStep, setZStep] = useState("1");
  const [camDelay, setCamDelay] = useState("500");
  const [autoStitch, setAutoStitch] = useState(false);
  const [controlMode, setControlMode] = useState<'dpad' | 'joystick'>('dpad');
  
  const [targetX, setTargetX] = useState<string>("0");
  const [targetY, setTargetY] = useState<string>("0");
  const [targetZ, setTargetZ] = useState<string>("0");
  
  const [motorPos, setMotorPos] = useState({ x: 0.00, y: 0.00, z: 0 });

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
  const [targetSaveMode, setTargetSaveMode] = useState<'GRID' | 'STITCH' | 'ALL'>('ALL');
  
  const cancelRef = useRef(false);
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickActive = useRef(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  
  const [saveForm, setSaveForm] = useState({ folderName: '', objectType: '', operatorName: localStorage.getItem('username') || 'Operator' });
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



  const handleGoToCoordinates = async () => {
    const x = parseFloat(targetX);
    const y = parseFloat(targetY);
    const z = parseFloat(targetZ);
    
    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      showToast('Koordinat tidak valid', 'error');
      return;
    }
    
    const gcodeStr = `G0 X${x.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)}`;
    
    setMotorPos({ x, y, z });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'MOVE_MOTOR',
        gcode: gcodeStr
      }));
    } else {
      showToast('Koneksi WebSocket terputus', 'error');
    }
  };

  const handleHome = async () => {
    try {
      await api.post('/api/hardware/motor/home');
      setMotorPos({ x: 0, y: 0, z: 0 });
      showToast('Motor diarahkan ke titik nol (0,0)...', 'info');
    } catch (_error) {
      showToast('Gagal mengeksekusi perintah homing', 'error');
    }
  };

  const handleStartAuto = async () => {
    cancelRef.current = false;
    setIsProcessing(true);
    setProcessTask('Mengambil Gambar & Koordinat CNC...');
    setTimerTick(0);
    setProgress(0);
    setProcessTimes({ scan: 0, stitch: 0, total: 0 }); 
    
    const startTime = new Date().getTime();
    const timePerGridMs = parseInt(camDelay) + 1200; 
    let currentProgress = 0;
    const totalGrids = c * r;
    const progressInterval = setInterval(() => {
      currentProgress++;
      if (currentProgress <= totalGrids) setProgress(currentProgress);
    }, timePerGridMs);

    try {
      const response = await api.post('/api/hardware/scan/grid', {
        columns: c,
        rows: r,
        step_x: sx,
        step_y: sy,
        delay_ms: parseInt(camDelay),
        unit: stepUnit
      });
      clearInterval(progressInterval);
      setProgress(totalGrids);
      setCapturedImages(response.data.images.map((img: any) => ({
        ...img,
        timestamp: Date.now()
      })));
      const scanT = (new Date().getTime() - startTime) / 1000;
      
      if (cancelRef.current) return;
      
      showToast('Pemindaian grid berhasil!', 'success');
      logSystemAction('Gathering Image (Grid Scan 2D) Selesai', 'SUCCESS');
      if (autoStitch) {
        executeStitching(scanT);
      } else { 
        setProcessTimes({ scan: scanT, stitch: 0, total: scanT });
        setIsProcessing(false);
        setShowReviewModal(true); 
      }
    } catch (_error) {
      clearInterval(progressInterval);
      showToast('Proses pemindaian terputus!', 'error');
      logSystemAction('Gathering Image (Grid Scan 2D) Gagal', 'ERROR');
      setIsProcessing(false);
    }
  };

  const handleManualCapture = async () => {
    const newIndex = capturedImages.length;
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '').slice(0, 15);
    const filename = `IMG_MANUAL_${timestamp}_${String(newIndex + 1).padStart(4, '0')}.jpg`;

    setIsProcessing(true);
    setProcessTask(`Mengambil Gambar Manual (X:${motorPos.x}, Y:${motorPos.y})...`);
    setTimerTick(0);
    try {
      await api.post('/api/hardware/scan/retake', {
        coord_x: motorPos.x,
        coord_y: motorPos.y,
        filename: filename,
        delay_ms: parseInt(camDelay)
      });
      setCapturedImages(prev => [...prev, { 
        index: newIndex, 
        filename: filename, 
        coordX: motorPos.x, 
        coordY: motorPos.y, 
        gridX: 0, 
        gridY: 0,
        timestamp: Date.now()
      }]);
      showToast('Gambar manual berhasil diambil!', 'success');
      logSystemAction('Gathering Image (Manual Capture) Selesai', 'SUCCESS');
      setIsProcessing(false);
    } catch (_error) {
      showToast('Gagal mengambil gambar manual!', 'error');
      logSystemAction('Gathering Image (Manual Capture) Gagal', 'ERROR');
      setIsProcessing(false);
    }
  };

  const executeStitching = async (scanTParam = processTimes.scan) => {
    setShowReviewModal(false);
    setIsProcessing(true);
    setProcessTask('AI Tile Stitching Berjalan di Edge Device...');
    setTimerTick(0);
    const stitchStart = new Date().getTime();
    try {
      await api.post('/api/hardware/stitch', {
        images: capturedImages.filter(img => img.filename !== null).map(img => img.filename)
      });
      const stitchT = (new Date().getTime() - stitchStart) / 1000;
      setProcessTimes({ scan: scanTParam, stitch: stitchT, total: scanTParam + stitchT });
      setIsProcessing(false);
      setShowStitchModal(true);
      showToast('Proses tile stitching berhasil diselesaikan!', 'success');
      logSystemAction('Tile Stitching Mosaik Selesai', 'SUCCESS');
    } catch (_error) {
      showToast('Proses Tile Stitching gagal!', 'error');
      logSystemAction('Tile Stitching Mosaik Gagal', 'ERROR');
      setIsProcessing(false);
    }
  };

  const removeCapturedImage = (index: number) => {
    setCapturedImages(prev => prev.map(img => img.index === index ? { ...img, filename: null } : img));
    showToast('Gambar dihapus dari list', 'info');
  };

  const retakeImage = async (index: number, cx: number, cy: number) => {
    setShowReviewModal(false);
    setIsProcessing(true);
    setProcessTask(`Retake Koordinat (X:${cx}, Y:${cy})...`);
    setTimerTick(0);
    const newFilename = `IMG_${String(index+1).padStart(4, '0')}.jpg`;

    try {
      setIsRetaking(true);
      await api.post('/api/hardware/scan/retake', {
        coord_x: cx,
        coord_y: cy,
        filename: newFilename,
        delay_ms: parseInt(camDelay)
      });
      setTimeout(() => setIsRetaking(false), 400);
      setCapturedImages(prev => prev.map(img => img.index === index ? { ...img, filename: newFilename, timestamp: Date.now() } : img));
      setIsProcessing(false);
      setShowReviewModal(true);
      showToast('Retake gambar berhasil', 'success');
      logSystemAction('Retake Gambar Selesai', 'SUCCESS');
    } catch (_error) {
      showToast('Gagal melakukan retake!', 'error');
      logSystemAction('Retake Gambar Gagal', 'ERROR');
      setIsProcessing(false);
      setShowReviewModal(true);
    }
  };

  const handleSaveFinal = async () => {
    if (!selectedFolderId && (!saveForm.folderName || !saveForm.objectType)) {
      showToast('Isi nama folder dan jenis objek!', 'error');
      return;
    }

    try {
      let filesToMove: string[] = [];
      let countToSave = 0;
      
      if (targetSaveMode === 'GRID') {
        filesToMove = capturedImages.filter(img => img.filename !== null).map(img => img.filename as string);
        countToSave = validImageCount;
      } else if (targetSaveMode === 'STITCH') {
        filesToMove = ["stitched_ta_output.jpg"];
        countToSave = 1;
      } else {
        filesToMove = capturedImages.filter(img => img.filename !== null).map(img => img.filename as string);
        countToSave = validImageCount;
        if (showStitchModal) {
            filesToMove.push("stitched_ta_output.jpg");
            countToSave += 1;
        }
      }

      if (selectedFolderId) {
        await api.put(`/api/dataset/folders/${selectedFolderId}/add-images`, { 
          count: countToSave,
          filenames: filesToMove 
        });
      } else {
        const res = await api.post('/api/dataset/folders', {
          name: saveForm.folderName,
          object_type: saveForm.objectType,
          date: new Date().toISOString().split('T')[0],
          operator: saveForm.operatorName
        });
        await api.put(`/api/dataset/folders/${res.data.id}/add-images`, { 
          count: countToSave,
          filenames: filesToMove 
        });
      }
      showToast('Data berhasil disimpan ke database!', 'success');
      logSystemAction('Simpan Data Gathering ke Database', 'SUCCESS');
      setShowSaveModal(false);
    } catch (_error) {
      showToast('Gagal menyimpan ke database!', 'error');
      logSystemAction('Gagal Simpan Data Gathering ke Database', 'ERROR');
    }
  };

  const handleSendToAnalysis = (imageName: string | undefined) => {
    if (!imageName) return;
    showToast(`Meneruskan ${imageName} ke modul Analysis...`, 'info');
    onNavigateToAnalysis(imageName);
  };

  const sendHttpMove = (axis: 'X' | 'Y' | 'Z', multiplier: number) => {
    const stepValue = axis === 'Z' ? parseFloat(zStep) : parseFloat(stepX);
    const calculatedValue = stepValue * multiplier;
    
    setMotorPos(prev => ({
      ...prev,
      [axis.toLowerCase()]: parseFloat((prev[axis.toLowerCase() as keyof typeof prev] + calculatedValue).toFixed(2))
    }));

    api.post('/api/hardware/motor/move', { 
      axis, 
      value: calculatedValue,
      feed_rate: axis === 'Z' ? 200 : 250,
      unit: axis === 'Z' ? 'step' : stepUnit
    }).catch(err => console.error("Gagal menggerakkan motor:", err));
  };

  const handleJoystickMove = (e: React.PointerEvent) => {
    if (!joystickRef.current || !joystickActive.current) return;
    const rect = joystickRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    let dx = e.clientX - rect.left - cx;
    let dy = e.clientY - rect.top - cy;
    const maxR = rect.width / 2 - 24; 
    const r = Math.sqrt(dx*dx + dy*dy);
    if (r > maxR) { dx = dx * maxR / r; dy = dy * maxR / r; }
    setJoystickPos({ x: dx, y: dy });
  };

  const handleJoystickUp = () => {
     if (!joystickActive.current) return;
     joystickActive.current = false;
     
     if (Math.abs(joystickPos.x) > 10 || Math.abs(joystickPos.y) > 10) {
        if (Math.abs(joystickPos.x) > Math.abs(joystickPos.y)) {
           const dir = joystickPos.x > 0 ? 1 : -1;
           const power = Math.max(1, Math.min(5, Math.floor(Math.abs(joystickPos.x) / 10)));
           sendHttpMove('X', dir * power);
        } else {
           const dir = joystickPos.y < 0 ? 1 : -1; 
           const power = Math.max(1, Math.min(5, Math.floor(Math.abs(joystickPos.y) / 10)));
           sendHttpMove('Y', dir * power);
        }
     }
     setJoystickPos({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-full relative pb-4 lg:pb-0 overflow-y-auto lg:overflow-hidden">
      
      <div className={`sticky top-0 z-40 lg:relative lg:z-auto w-full lg:w-[55%] h-[300px] sm:h-[450px] lg:h-full flex flex-col shrink-0 overflow-hidden rounded-2xl border-2 ${cameraActive && videoSrc ? 'border-purple-500 bg-black' : 'border-dashed border-gray-700 justify-center items-center ' + theme.panel}`}>
        {isRetaking && <div className="absolute inset-0 bg-white z-50 animate-flash pointer-events-none"></div>}

        {cameraActive && videoSrc ? (
          <img 
            src={videoSrc} 
            alt="Microscope Live Feed Global" 
            className="w-full h-full object-cover rounded-2xl"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <CameraOff size={64} className={`mb-4 ${theme.textMuted}`} />
            <p className={`font-mono font-bold text-base ${theme.text}`}>{t('noCameraFeed')}</p>
            <p className={`text-xs ${theme.textMuted} mt-1 max-w-xs`}>{t('turnOnCameraFirst')}</p>
          </div>
        )}

        {cameraActive && videoSrc && (
          <div className="absolute top-4 left-4 p-3 bg-black/75 backdrop-blur-md rounded-xl border border-white/10 flex flex-col gap-1 shadow-2xl text-white z-10 min-w-[220px]">
            <div className="flex items-center border-b border-white/10 pb-1.5 mb-1">
              <Crosshair size={14} className="text-red-400 mr-2 animate-pulse" />
              <span className="font-mono text-[10px] font-bold tracking-wider text-gray-300">
                PIPELINE SCAN: ACTIVE (X: {stepX} | Y: {stepY})
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 font-mono text-[11px] font-bold">
              <div className="flex flex-col bg-white/5 px-2 py-1 rounded border border-white/5">
                <span className="text-red-400 text-[9px] uppercase tracking-wide">{t('motorX')}</span>
                <span className="text-white mt-0.5">{motorPos.x.toFixed(2)} <span className="text-[9px] text-gray-400">mm</span></span>
              </div>
              <div className="flex flex-col bg-white/5 px-2 py-1 rounded border border-white/5">
                <span className="text-green-400 text-[9px] uppercase tracking-wide">{t('motorY')}</span>
                <span className="text-white mt-0.5">{motorPos.y.toFixed(2)} <span className="text-[9px] text-gray-400">mm</span></span>
              </div>
              <div className="flex flex-col bg-white/5 px-2 py-1 rounded border border-white/5">
                <span className="text-blue-400 text-[9px] uppercase tracking-wide">{t('motorZ')}</span>
                <span className="text-white mt-0.5">{motorPos.z} <span className="text-[9px] text-gray-400">stp</span></span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PANEL KANAN */}
      <div className="w-full lg:w-[45%] lg:h-full overflow-y-visible lg:overflow-y-auto pr-1 flex flex-col gap-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div className={`flex rounded-xl border p-1 shrink-0 ${theme.panel}`}>
          <button onClick={() => setGatherMode('AUTO')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${gatherMode === 'AUTO' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}>{t('autoGather')}</button>
          <button onClick={() => setGatherMode('MANUAL')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${gatherMode === 'MANUAL' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}>{t('manualGather')}</button>
        </div>

        <button onClick={handleHome} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all text-xs shrink-0">
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
                <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center mb-2 ${theme.textMuted}`}><Map size={14} className="mr-2" /> Minimap Area CNC (Macro)</h3>
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
                    <p className="text-red-500 font-bold text-[10px] leading-tight">
                      {t('safetyWarning').replace('{X}', Math.round(totalAreaX_mm).toString()).replace('{Y}', Math.round(totalAreaY_mm).toString()).replace('{MAX_X}', MAX_CNC_X.toString()).replace('{MAX_Y}', MAX_CNC_Y.toString())}
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className={`text-[10px] font-bold ${theme.textMuted}`}>
                      {t('estTime').replace('{M}', estMins.toString()).replace('{S}', estSecs.toString())}
                    </p>
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
                        <button onClick={() => sendHttpMove('Y', 1)} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowUp size={24}/></button>
                        <div />
                        <button onClick={() => sendHttpMove('X', -1)} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowLeft size={24}/></button>
                        <button onClick={() => api.post('/api/hardware/motor/unlock')} title="Unlock GRBL" className="rounded-full border-2 border-blue-500/50 bg-blue-500/10 text-blue-500 flex items-center justify-center active:scale-95"><Crosshair size={20}/></button>
                        <button onClick={() => sendHttpMove('X', 1)} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowRight size={24}/></button>
                        <div />
                        <button onClick={() => sendHttpMove('Y', -1)} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowDown size={24}/></button>
                        <div />
                      </div>
                    ) : (
                      <div 
                        ref={joystickRef}
                        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); joystickActive.current = true; }}
                        onPointerMove={handleJoystickMove}
                        onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); handleJoystickUp(); }}
                        onPointerCancel={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); handleJoystickUp(); }}
                        className={`aspect-square rounded-full border-4 flex items-center justify-center relative touch-none ${isDarkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}
                      >
                        <div 
                          className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg transition-transform"
                          style={{ transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`, transitionDuration: joystickActive.current ? '0s' : '0.2s' }}
                        >
                          <Move size={20} />
                        </div>
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
                    <button onClick={() => sendHttpMove('Z', 1)} className={`flex-1 mb-1 rounded-xl border flex flex-col items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowUp size={20} className="text-blue-500"/></button>
                    <button onClick={() => sendHttpMove('Z', -1)} className={`flex-1 rounded-xl border flex flex-col items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowDown size={20} className="text-blue-500"/></button>
                  </div>
                </div>
              </div>

              {/* 1.5. KONTROL KOORDINAT ABSOLUT */}
              <div className={`p-4 rounded-2xl border shrink-0 ${theme.panel} relative`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-sm font-bold uppercase tracking-wider ${theme.text}`}>Go-To Coordinate</h3>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex flex-col flex-1">
                    <span className={`text-[10px] font-bold mb-1 ${theme.textMuted}`}>X (mm)</span>
                    <input
                      type="number"
                      readOnly={globalVirtualKeyboard}
                      value={targetX}
                      onChange={(e) => setTargetX(e.target.value)}
                      onClick={() => triggerGlobalKeypad('Koordinat X', targetX, setTargetX)}
                      className={`w-full h-8 px-2 rounded border text-sm font-bold outline-none ${theme.input}`}
                    />
                  </div>
                  <div className="flex flex-col flex-1">
                    <span className={`text-[10px] font-bold mb-1 ${theme.textMuted}`}>Y (mm)</span>
                    <input
                      type="number"
                      readOnly={globalVirtualKeyboard}
                      value={targetY}
                      onChange={(e) => setTargetY(e.target.value)}
                      onClick={() => triggerGlobalKeypad('Koordinat Y', targetY, setTargetY)}
                      className={`w-full h-8 px-2 rounded border text-sm font-bold outline-none ${theme.input}`}
                    />
                  </div>
                  <div className="flex flex-col flex-1">
                    <span className={`text-[10px] font-bold mb-1 ${theme.textMuted}`}>Z (stp)</span>
                    <input
                      type="number"
                      readOnly={globalVirtualKeyboard}
                      value={targetZ}
                      onChange={(e) => setTargetZ(e.target.value)}
                      onClick={() => triggerGlobalKeypad('Koordinat Z', targetZ, setTargetZ)}
                      className={`w-full h-8 px-2 rounded border text-sm font-bold outline-none ${theme.input}`}
                    />
                  </div>
                  <button 
                    onClick={handleGoToCoordinates}
                    className={`h-8 px-4 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors shrink-0`}
                  >
                    GO
                  </button>
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

      {isProcessing && (
        <div className={theme.overlay} style={{ zIndex: 60 }}>
          <div className="flex flex-col items-center text-white w-full max-w-lg">
            {processTask.includes('Mengambil') && !processTask.includes('Manual') ? (
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
            <button onClick={() => { cancelRef.current = true; setIsProcessing(false); }} className="mt-8 px-8 py-3 bg-red-600 rounded-full font-bold shadow-lg shadow-red-600/50 active:scale-95">{t('cancel')}</button>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className={theme.overlay}>
          <div className={`w-[95%] max-w-6xl h-[90vh] rounded-3xl flex flex-col overflow-hidden shadow-2xl ${theme.panel}`}>
            <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-black/20 shrink-0">
              <div className="flex items-center space-x-3">
                <Grid3X3 size={24} className="text-blue-500" />
                <h2 className={`text-2xl font-bold ${theme.text}`}>{t('captureResults')}</h2>
              </div>
              <button onClick={() => {setShowReviewModal(false); setCapturedImages([]);}} className={`p-2 rounded-xl border ${theme.btnTouch} ${theme.text}`}><X size={24}/></button>
            </div>
            
            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-black/5">
              <div 
                className={`grid gap-3 p-4 bg-gray-800 rounded-xl border-2 border-gray-600 w-full sm:w-fit mx-auto h-fit ${gatherMode === 'MANUAL' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5' : ''}`}
                style={gatherMode === 'AUTO' ? { gridTemplateColumns: `repeat(${cols}, minmax(130px, 1fr))` } : {}}
              >
                {capturedImages.map((img) => (
                  img.filename ? (
                    <div key={img.index} className={`aspect-square rounded-lg border flex flex-col items-center justify-center relative group overflow-hidden ${theme.panel} ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                      <img src={`${api.defaults.baseURL}/static/uploads/${img.filename}?t=${img.timestamp}`} className="w-full h-full object-cover absolute inset-0 z-0 opacity-80 group-hover:opacity-100 transition-opacity" alt="grid-tile" />
                      <div className="flex flex-col items-center text-center z-10 bg-black/50 w-full p-1 mt-auto">
                         <span className="text-[9px] font-mono font-bold text-white shadow-sm">{img.filename.replace('.jpg','')}</span>
                         {gatherMode === 'AUTO' && <span className="text-[8px] font-bold text-blue-300 mt-0.5">X:{img.coordX} Y:{img.coordY}</span>}
                      </div>
                      <button onClick={() => removeCapturedImage(img.index)} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded hover:bg-red-600 active:scale-95 shadow-md"><X size={14}/></button>
                    </div>
                  ) : (
                    <div key={img.index} className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center bg-red-500/5 border-red-500/30 group">
                      <span className="text-[8px] font-bold text-red-400 mb-2 text-center">{t('empty')}<br/>X:{img.coordX} Y:{img.coordY}</span>
                      <button onClick={() => retakeImage(img.index, img.coordX, img.coordY)} className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold active:scale-95 shadow-lg"><RefreshCcw size={12} className="mr-1"/> Retake</button>
                    </div>
                  )
                ))}
              </div>
            </div>

            <div className="p-4 sm:p-6 border-t border-gray-700 flex flex-col sm:flex-row items-stretch sm:items-center bg-black/20 gap-3 sm:gap-4 shrink-0">
              <div className="flex gap-3 sm:gap-4 flex-row w-full sm:w-auto">
                <button onClick={() => {setShowReviewModal(false); setCapturedImages([]); showToast('Hasil akuisisi telah dibuang', 'info');}} className="flex-1 sm:flex-none px-3 sm:px-6 py-3 sm:py-4 rounded-xl font-bold flex items-center justify-center border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white active:scale-95 transition-colors text-sm sm:text-base">
                  <Trash2 size={18} className="mr-1 sm:mr-2 shrink-0"/> {t('cancel')}
                </button>
                <button onClick={() => { setTargetSaveMode('GRID'); setShowSaveModal(true); }} disabled={validImageCount === 0} className={`flex-1 sm:flex-none px-3 sm:px-6 py-3 sm:py-4 rounded-xl font-bold flex items-center justify-center border border-transparent active:scale-95 text-sm sm:text-base ${theme.btnTouch} ${theme.text}`}>
                  <Save size={18} className="mr-1 sm:mr-2 shrink-0"/> {t('save')}
                </button>
              </div>
              {validImageCount === 1 ? (
                <button onClick={() => handleSendToAnalysis(capturedImages.find(i => i.filename)?.filename || '')} className="flex-1 py-3 sm:py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-orange-600/20 text-xs sm:text-base px-2 text-center">
                  <Scan size={18} className="mr-1 sm:mr-2 shrink-0"/> <span className="hidden sm:inline">LANJUTKAN KE IMAGE ANALYSIS</span><span className="sm:hidden">ANALISIS (1 Gbr)</span>
                </button>
              ) : (
                <button onClick={() => executeStitching()} disabled={validImageCount === 0} className="flex-1 py-3 sm:py-4 bg-purple-600 disabled:bg-gray-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-purple-600/20 text-[11px] xs:text-xs sm:text-base px-2 text-center">
                  <Grid3X3 size={18} className="mr-1 sm:mr-2 shrink-0"/> <span className="hidden sm:inline">LANJUTKAN KE TILE STITCHING</span><span className="sm:hidden">STITCHING</span> ({validImageCount} Gbr)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showStitchModal && (
        <div className={theme.modalBg}>
           <div className={`w-[95%] sm:w-[80%] max-w-3xl rounded-3xl flex flex-col overflow-hidden shadow-2xl ${theme.panel}`}>
            <div className="p-4 sm:p-6 border-b border-gray-700 flex justify-between items-center bg-black/20">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-500/20 rounded-full flex items-center justify-center mr-3 sm:mr-4 shrink-0">
                <Image size={20} className="text-purple-400 sm:w-6 sm:h-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">{t('stitchComplete')}</h2>
              </div>
              <button onClick={() => {setShowStitchModal(false); setCapturedImages([]);}} className={`p-2 rounded-xl border ${theme.btnTouch} ${theme.text} shrink-0 ml-2`}><X size={20} className="sm:w-6 sm:h-6"/></button>
            </div>
            
            <div className="p-8 flex flex-col justify-center items-center bg-black/40 border-y border-gray-800">
              <div className="w-full aspect-video border-2 border-purple-500/50 rounded-xl bg-purple-500/10 flex flex-col items-center justify-center relative overflow-hidden mb-4 group">
                 <img src={`${api.defaults.baseURL}/static/uploads/stitched_ta_output.jpg?t=${processTimes.total}`} className="w-full h-full object-cover absolute inset-0 z-0 opacity-90 group-hover:opacity-100 transition-opacity" alt="stitched-result" />
                 <div className="z-10 bg-black/60 p-2 rounded-lg mt-auto mb-2 flex items-center shadow-lg backdrop-blur-sm">
                   <ImageIcon size={18} className="text-purple-400 mr-2" />
                   <span className="font-mono font-bold text-purple-300">stitched_ta_output.jpg</span>
                 </div>
              </div>
              
              <div className="flex flex-wrap justify-center gap-2 sm:gap-4 w-full">
                <div className="px-3 sm:px-4 py-2 bg-black/40 border border-gray-700 rounded-lg flex items-center text-[10px] sm:text-xs font-mono text-gray-300 flex-1 sm:flex-none justify-center">
                  <Camera size={14} className="text-blue-400 mr-1.5 sm:mr-2" /> Scan: {processTimes.scan.toFixed(1)}s
                </div>
                <div className="px-3 sm:px-4 py-2 bg-black/40 border border-gray-700 rounded-lg flex items-center text-[10px] sm:text-xs font-mono text-gray-300 flex-1 sm:flex-none justify-center">
                  <Layers size={14} className="text-purple-400 mr-1.5 sm:mr-2" /> Stitch: {processTimes.stitch.toFixed(1)}s
                </div>
                <div className="px-3 sm:px-4 py-2 bg-black/40 border border-green-700/50 rounded-lg flex items-center text-[10px] sm:text-xs font-mono font-bold text-green-400 flex-1 min-w-full sm:min-w-0 sm:flex-none justify-center">
                  <Clock size={14} className="mr-1.5 sm:mr-2" /> Total Waktu: {processTimes.total.toFixed(1)}s
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 bg-black/20 shrink-0">
              <div className="flex gap-3 sm:gap-4 flex-row w-full sm:w-auto">
                <button onClick={() => {setShowStitchModal(false); setCapturedImages([]); showToast('Hasil jahitan tile telah dibuang', 'info');}} className="flex-1 sm:flex-none px-3 sm:px-6 py-3 sm:py-4 rounded-xl font-bold flex items-center justify-center border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white active:scale-95 transition-colors text-sm sm:text-base">
                  <Trash2 size={18} className="mr-1 sm:mr-2 shrink-0"/> {t('cancel')}
                </button>
                <button onClick={() => { setTargetSaveMode('STITCH'); setShowSaveModal(true); }} className={`flex-1 sm:flex-none px-3 sm:px-6 py-3 sm:py-4 rounded-xl font-bold flex items-center justify-center border text-sm sm:text-base ${theme.btnTouch} ${theme.text}`}>
                  <Save size={18} className="mr-1 sm:mr-2 shrink-0"/> {t('save')}
                </button>
              </div>
              <button onClick={() => { setShowStitchModal(false); handleSendToAnalysis("stitched_ta_output.jpg"); }} className="flex-1 py-3 sm:py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-orange-600/20 text-xs sm:text-base px-2 text-center">
                <Scan size={18} className="mr-1 sm:mr-2 shrink-0"/> <span className="hidden sm:inline">LANJUTKAN KE IMAGE ANALYSIS</span><span className="sm:hidden">LANJUTKAN KE ANALISIS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className={theme.modalBg}>
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border ${theme.panel}`}>
            <h2 className={`text-xl font-bold mb-4 ${theme.text}`}>{t('saveResults')}</h2>
            <div className="space-y-4">
              <div>
                <label className={`block text-xs font-bold mb-2 ${theme.textMuted}`}>{t('chooseExistingFolder')}</label>
                <div className="grid gap-2 max-h-32 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {availableFolders.map((folder: {id: string, name: string}) => (
                    <div key={folder.id} onClick={() => { setSelectedFolderId(folder.id); setSaveForm({ folderName: '', objectType: '', operatorName: '' }); }} className={`p-3 rounded-xl border cursor-pointer flex items-center transition-colors ${selectedFolderId === folder.id ? 'border-blue-500 bg-blue-500/10 text-blue-400' : `${theme.panel} ${theme.text} hover:border-gray-500`}`}>
                      <FolderPlus size={18} className="mr-3" />
                      <span className="font-bold text-sm">{folder.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center text-xs font-bold text-gray-500">
                <div className="flex-1 border-t border-gray-600"></div>
                <span className="px-3">{t('orCreateNew')}</span>
                <div className="flex-1 border-t border-gray-600"></div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>{t('folderName')}</label>
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
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>{t('objectType')}</label>
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
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>{t('operatorName')}</label>
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
            <div className="flex space-x-3 mt-6">
              <button onClick={() => setShowSaveModal(false)} className={`flex-1 py-3 rounded-xl font-bold border ${theme.textMuted} ${theme.btnTouch}`}>{t('cancel')}</button>
              <button onClick={handleSaveFinal} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 shadow-lg">
                <Save size={18} className="mr-2"/> {t('save')}
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




