import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import api from '../utils/api';
import { Camera, Grid3X3, Play, Crosshair, Settings2, Image as ImageIcon, MousePointerSquareDashed, Gamepad2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, X, Save, Scan, Clock, ArrowUpLeft, Move, FolderPlus, Map, RefreshCcw, Trash2, AlertTriangle, Layers, CameraOff, Image, Upload, Database, Boxes, Cpu, Plus } from 'lucide-react';

const STITCH_MODELS = [
  { value: 'sp_lg_tensorrt', label: 'SuperPoint + LightGlue (TensorRT)' },
  { value: 'sift_bfm', label: 'SIFT + BFMatcher' },
  { value: 'sift_lg', label: 'SIFT + LightGlue' },
  { value: 'brute_force', label: 'Brute-Force (Subtraksi)' },
];
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
  lastEchoGCode?: string;
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
  wsRef,
  lastEchoGCode
}: ImageGatheringTabProps) {
  const { isDarkMode, globalVirtualKeyboard } = useGlobalContext();
  const { t } = useTranslation();
  const [gatherMode, setGatherMode] = useState<'AUTO' | 'MANUAL' | 'INPUT'>('AUTO');
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
  const [processKind, setProcessKind] = useState<'scan' | 'stitch' | 'manual' | ''>('');
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

  // ── Tile stitching: pilihan model (dipakai AUTO/MANUAL/INPUT) ──
  const [stitchModel, setStitchModel] = useState<string>(STITCH_MODELS[0].value);
  // ID sesi scan aktif (dari backend) -> Edge memakai folder tmp_images/<session>
  // terisolasi, jadi tile antar-scan tidak pernah tercampur saat stitching.
  const [scanSession, setScanSession] = useState<string | null>(null);

  // ── Mode INPUT IMAGES ──
  type InputTile = { gridX: number; gridY: number; filename: string; url: string; preview?: string };
  const [showInputModal, setShowInputModal] = useState(false);
  const [inputSession, setInputSession] = useState<string>('');
  const [inputTiles, setInputTiles] = useState<Record<string, InputTile>>({});
  const [inputTarget, setInputTarget] = useState<{ gx: number; gy: number } | null>(null);
  const [showDbPicker, setShowDbPicker] = useState(false);
  const [dbPickerMode, setDbPickerMode] = useState<'cell' | 'grid'>('cell');
  const [dbPickerFolder, setDbPickerFolder] = useState<string | null>(null);
  const [dbPickerImages, setDbPickerImages] = useState<{ name: string }[]>([]);
  const [inputBusy, setInputBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cancelRef = useRef(false);
  const stitchAbortRef = useRef<(() => void) | null>(null);
  // Fungsi pembersih pemantau aktif (scan/stitch) — dipanggil saat tab dilepas
  // supaya interval/listener tidak bocor & tidak setState pada komponen mati.
  const monitorTeardownRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { monitorTeardownRef.current?.(); }, []);
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

  // Pulihkan pemantauan scan yang masih jalan setelah halaman di-refresh.
  const resumeScan = (status: any) => {
    const totalGrids = status.total || (c * r) || 1;
    setIsProcessing(true);
    setProcessKind('scan');
    setProgress(Math.min(status.index || 0, totalGrids));
    setProcessTask(`Menyambungkan kembali… Tile ${status.index || 0}/${totalGrids}`);
    setTimerTick(0);
    if (status.session) setScanSession(status.session);
    cancelRef.current = false;
    let finished = false;
    const fin = (imgs: any[], kind: 'ok' | 'cancel' | 'fail', detail?: string) => {
      if (finished) return;
      finished = true;
      monitorTeardownRef.current = null;
      clearInterval(poll); clearInterval(keep);
      wsRef.current?.removeEventListener('message', onWs);
      try { localStorage.removeItem('ig_resume'); } catch { /* ignore */ }
      setIsProcessing(false);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: cameraActive ? 'START_STREAM' : 'STOP_STREAM' }));
      }
      if (kind === 'fail') { showToast(detail || 'Pemindaian gagal.', 'error'); return; }
      if (imgs.length) {
        setCapturedImages(imgs.map((im: any) => ({ ...im, timestamp: Date.now() })));
        setProcessTimes({ scan: 0, stitch: 0, total: 0 });
        setShowReviewModal(true);
      }
      showToast(kind === 'ok' ? 'Pemindaian selesai (dipulihkan).' : 'Pemindaian dibatalkan.', kind === 'ok' ? 'success' : 'info');
    };
    const onWs = (ev: MessageEvent) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.event === 'SCAN_PROGRESS' && typeof m.index === 'number') {
          setProgress(Math.min(m.index, totalGrids));
          setProcessTask(`Tile ${m.index}/${m.total ?? totalGrids}`);
        } else if (m.event === 'SCAN_COMPLETE') fin(m.images || [], 'ok');
        else if (m.event === 'SCAN_CANCELLED') fin(m.images || [], 'cancel');
        else if (m.event === 'SCAN_FAILED') fin([], 'fail', m.detail);
      } catch { /* ignore */ }
    };
    wsRef.current?.addEventListener('message', onWs);
    const keep = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ action: 'PING' }));
    }, 20000);
    const poll = setInterval(async () => {
      if (finished) return;
      try {
        const { data } = await api.get('/api/hardware/scan/status');
        if (typeof data.index === 'number') setProgress(Math.min(data.index, totalGrids));
        if (!data.running) {
          if (data.error) fin([], 'fail', data.error);
          else if (data.cancelled) fin(data.images || [], 'cancel');
          else fin(data.images || [], 'ok');
        }
      } catch { /* ignore */ }
    }, 3000);
    monitorTeardownRef.current = () => {
      finished = true;
      clearInterval(poll); clearInterval(keep);
      wsRef.current?.removeEventListener('message', onWs);
    };
  };

  // ── Saat tab dimuat: (2) terapkan default Auto-Gather dari Admin,
  //    (1) pulihkan overlay proses yang masih berjalan (scan / stitch). ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: cfg } = await api.get('/api/hardware/config');
        if (!cancelled && cfg) {
          if (cfg.ag_columns) setCols(String(cfg.ag_columns));
          if (cfg.ag_rows) setRows(String(cfg.ag_rows));
          if (cfg.ag_step_x) setStepX(String(cfg.ag_step_x));
          if (cfg.ag_step_y) setStepY(String(cfg.ag_step_y));
          if (cfg.ag_z_step) setZStep(String(cfg.ag_z_step));
          if (cfg.ag_delay_ms) setCamDelay(String(cfg.ag_delay_ms));
          if (cfg.ag_unit === 'mm' || cfg.ag_unit === 'inch') setStepUnit(cfg.ag_unit);
          if (cfg.ag_model) setStitchModel(cfg.ag_model);
          if (cfg.ag_auto_stitch != null) setAutoStitch(cfg.ag_auto_stitch === '1' || cfg.ag_auto_stitch === 'true');
        }
      } catch { /* ignore */ }

      let hint: any = null;
      try { hint = JSON.parse(localStorage.getItem('ig_resume') || 'null'); } catch { /* ignore */ }
      try {
        const [sc, st] = await Promise.all([
          api.get('/api/hardware/scan/status').then(r => r.data).catch(() => null),
          api.get('/api/hardware/stitch/status').then(r => r.data).catch(() => null),
        ]);
        if (cancelled) return;
        if (sc && sc.running) { resumeScan(sc); return; }
        if (st && st.running) { attachStitchMonitor({ startPct: st.pct, startPhase: st.phase || 'menyambungkan kembali…' }); return; }
        // Stitching selesai selagi halaman di-refresh -> tampilkan hasilnya sekali.
        if (hint?.kind === 'stitch' && st && (st.done || st.output_exists) && !st.error) {
          setProcessTimes(p => ({ ...p, stitch: 0 }));
          setShowStitchModal(true);
          showToast('Tile stitching selesai saat halaman dimuat ulang.', 'success');
        }
        if (hint) { try { localStorage.removeItem('ig_resume'); } catch { /* ignore */ } }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sinkronisasi koordinat dengan Telemetry (dari WebSocket)
  useEffect(() => {
    if (lastEchoGCode && lastEchoGCode.startsWith("X:")) {
      const match = lastEchoGCode.match(/X:([\d.-]+)\s+Y:([\d.-]+)\s+Z:([\d.-]+)/);
      if (match) {
        setMotorPos({
          x: parseFloat(match[1]),
          y: parseFloat(match[2]),
          z: parseFloat(match[3])
        });
      }
    }
  }, [lastEchoGCode]);


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
    setProcessKind('scan');
    setProcessTask('Memulai pemindaian...');
    setTimerTick(0);
    setProgress(0);
    setProcessTimes({ scan: 0, stitch: 0, total: 0 });

    const startTime = Date.now();
    const totalGrids = c * r;
    // Penanda supaya overlay bisa dipulihkan bila halaman di-refresh.
    try { localStorage.setItem('ig_resume', JSON.stringify({ kind: 'scan', total: totalGrids, cols: c, rows: r, ts: Date.now() })); } catch { /* ignore */ }
    let lastIndex = 0;
    let lastIndexAt = Date.now();

    // Scan berjalan ASINKRON di backend (background task). Frontend TIDAK
    // menunggu response HTTP panjang (Cloudflare memutus di ~120 dtk) — cukup
    // dengarkan event SCAN_PROGRESS / SCAN_COMPLETE / SCAN_FAILED via WebSocket,
    // dengan polling /scan/status sebagai cadangan kalau WS sempat putus.
    let finished = false;
    let lastWsEventAt = Date.now();
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    let poller: ReturnType<typeof setInterval> | undefined;

    const onWsMessage = (ev: MessageEvent) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.session) setScanSession(m.session);
        if (m.event === 'SCAN_PROGRESS' && typeof m.index === 'number') {
          lastWsEventAt = Date.now();
          if (m.index !== lastIndex) { lastIndex = m.index; lastIndexAt = Date.now(); }
          setProgress(Math.min(m.index, totalGrids));
          setProcessTask(`Tile ${m.index}/${m.total} — X:${m.coordX} Y:${m.coordY}`);
        } else if (m.event === 'SCAN_COMPLETE') {
          finishSuccess(m.images || []);
        } else if (m.event === 'SCAN_CANCELLED') {
          finishCancelled(m.images || []);
        } else if (m.event === 'SCAN_FAILED') {
          finishError(m.detail);
        }
      } catch { /* pesan non-JSON diabaikan */ }
    };

    const cleanup = () => {
      monitorTeardownRef.current = null;
      if (keepAlive) clearInterval(keepAlive);
      if (poller) clearInterval(poller);
      try { localStorage.removeItem('ig_resume'); } catch { /* ignore */ }
      wsRef.current?.removeEventListener('message', onWsMessage);
      // Kembalikan streaming video ke keadaan sesuai toggle kamera.
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: cameraActive ? 'START_STREAM' : 'STOP_STREAM' }));
      }
    };

    const finishSuccess = (imgs: any[]) => {
      if (finished) return;
      finished = true;
      cleanup();
      setProgress(totalGrids);
      setCapturedImages(imgs.map((img: any) => ({ ...img, timestamp: Date.now() })));
      const scanT = (Date.now() - startTime) / 1000;
      if (cancelRef.current) { setIsProcessing(false); return; }
      showToast('Pemindaian grid berhasil!', 'success');
      logSystemAction('Gathering Image (Grid Scan 2D) Selesai', 'SUCCESS');
      if (autoStitch) {
        executeStitching(scanT);
      } else {
        setProcessTimes({ scan: scanT, stitch: 0, total: scanT });
        setIsProcessing(false);
        setShowReviewModal(true);
      }
    };

    const finishError = (msg?: string) => {
      if (finished) return;
      finished = true;
      cleanup();
      showToast(msg || 'Proses pemindaian terputus!', 'error');
      logSystemAction('Gathering Image (Grid Scan 2D) Gagal', 'ERROR');
      setIsProcessing(false);
    };

    const finishCancelled = (imgs: any[]) => {
      if (finished) return;
      finished = true;
      cleanup();
      showToast(`Pemindaian dibatalkan (${imgs.length} gambar terambil).`, 'info');
      logSystemAction('Gathering Image (Grid Scan 2D) Dibatalkan', 'ERROR');
      setIsProcessing(false);
      if (imgs.length > 0) {
        setCapturedImages(imgs.map((img: any) => ({ ...img, timestamp: Date.now() })));
        setProcessTimes({ scan: (Date.now() - startTime) / 1000, stitch: 0, total: (Date.now() - startTime) / 1000 });
        setShowReviewModal(true);
      }
    };

    wsRef.current?.addEventListener('message', onWsMessage);
    monitorTeardownRef.current = () => {
      finished = true;
      if (keepAlive) clearInterval(keepAlive);
      if (poller) clearInterval(poller);
      wsRef.current?.removeEventListener('message', onWsMessage);
    };

    // Jaga sesi tetap hidup selama scan panjang (idle-timeout server 10 menit).
    keepAlive = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'PING' }));
      }
    }, 20000);

    // Cadangan: kalau WS putus, tarik progres/hasil via HTTP.
    poller = setInterval(async () => {
      if (finished) return;
      // Tetap tampilkan tanda "Edge lambat" walau WS sehat, jika indeks macet lama.
      if (!finished && isProcessing && Date.now() - lastIndexAt > 25000) {
        setProcessTask(prev => (prev.includes('menunggu Edge') ? prev : `${prev} · menunggu Edge…`));
      }
      if (Date.now() - lastWsEventAt < 15000) return; // WS masih sehat, tak perlu polling status
      try {
        const { data } = await api.get('/api/hardware/scan/status');
        if (typeof data.index === 'number') {
          if (data.index !== lastIndex) { lastIndex = data.index; lastIndexAt = Date.now(); }
          setProgress(Math.min(data.index, totalGrids));
        }
        if (!data.running) {
          if (data.error) finishError(data.error);
          else if (data.cancelled) finishCancelled(data.images || []);
          else if (Array.isArray(data.images) && data.images.length >= totalGrids) finishSuccess(data.images);
        }
      } catch { /* abaikan, coba lagi tick berikutnya */ }
    }, 5000);

    setScanSession(null);

    // Matikan live-stream selama scan: kamera terus berpindah (video tak berguna)
    // dan payload video bersaing dengan upload tile -> WS bisa putus untuk grid besar.
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'STOP_STREAM' }));
    }

    try {
      const response = await api.post('/api/hardware/scan/grid', {
        columns: c, rows: r, step_x: sx, step_y: sy,
        delay_ms: parseInt(camDelay), unit: stepUnit,
        start_x: motorPos.x, start_y: motorPos.y
      });
      if (response.data?.session) setScanSession(response.data.session);
      // Backend baru membalas cepat {status:"STARTED"}. Backend lama (sinkron)
      // membalas {status:"SUCCESS", images:[...]} -> langsung selesaikan.
      if (response.data?.status !== 'STARTED') {
        finishSuccess(response.data?.images || []);
      }
      // else: tunggu SCAN_COMPLETE dari WebSocket / poller.
    } catch (error: any) {
      finishError(error?.response?.data?.detail);
    }
  };

  const handleManualCapture = async () => {
    const newIndex = capturedImages.length;
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '').slice(0, 15);
    const filename = `IMG_MANUAL_${timestamp}_${String(newIndex + 1).padStart(4, '0')}.jpg`;

    setIsProcessing(true);
    setProcessKind('manual');
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
        gridX: -1,   // -1 -> stitching pakai koordinat mm, bukan indeks grid
        gridY: -1,
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

  // Pemantau tile stitching — dipakai baik saat memulai (runStitching) maupun
  // saat memulihkan setelah refresh (resumeStitch). Event WS + polling status +
  // "creep" halus + watchdog adaptif (5 menit sunyi total = gagal).
  const attachStitchMonitor = (opts: { scanTParam?: number; startPct?: number; startPhase?: string }) => {
    const scanTParam = opts.scanTParam ?? 0;
    setShowReviewModal(false);
    setShowInputModal(false);
    setIsProcessing(true);
    setProcessKind('stitch');
    setProcessTask(`Tile Stitching — ${opts.startPhase || 'berjalan di Edge Device'}`);
    setTimerTick(0);
    setProgress(Math.max(5, Math.min(97, opts.startPct || 5)));
    const stitchStart = Date.now();
    let finished = false;
    let lastBeat = Date.now();
    let ceiling = Math.max(12, opts.startPct || 12);
    try { localStorage.setItem('ig_resume', JSON.stringify({ kind: 'stitch', ts: Date.now() })); } catch { /* ignore */ }

    const bump = (pct: number, phase?: string) => {
      lastBeat = Date.now();
      if (typeof pct === 'number') { ceiling = Math.max(ceiling, Math.min(97, pct)); setProgress(p => Math.max(p, Math.min(97, pct))); }
      if (phase) setProcessTask(`Tile Stitching — ${phase}`);
    };
    const done = (ok: boolean, detail?: string) => {
      if (finished) return;
      finished = true;
      stitchAbortRef.current = null;
      monitorTeardownRef.current = null;
      clearInterval(poll); clearInterval(keepAlive); clearInterval(watchdog); clearInterval(creep);
      wsRef.current?.removeEventListener('message', onWs);
      try { localStorage.removeItem('ig_resume'); } catch { /* ignore */ }
      setIsProcessing(false);
      setProgress(100);
      const stitchT = (Date.now() - stitchStart) / 1000;
      if (detail === '__ABORT__') return;
      if (ok) {
        setProcessTimes(prev => ({ scan: scanTParam || prev.scan, stitch: stitchT, total: (scanTParam || prev.scan) + stitchT }));
        setShowStitchModal(true);
        showToast('Proses tile stitching berhasil diselesaikan!', 'success');
        logSystemAction('Tile Stitching Mosaik Selesai', 'SUCCESS');
      } else {
        showToast(detail || 'Proses Tile Stitching gagal!', 'error');
        logSystemAction('Tile Stitching Mosaik Gagal', 'ERROR');
      }
    };
    const onWs = (ev: MessageEvent) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.event === 'STITCH_PROGRESS' && typeof m.pct === 'number') bump(m.pct, m.phase);
        else if (m.event === 'STITCH_COMPLETE') done(true);
        else if (m.event === 'STITCH_FAILED') done(false, m.detail);
      } catch { /* ignore */ }
    };
    wsRef.current?.addEventListener('message', onWs);
    const creep = setInterval(() => {
      if (finished) return;
      setProgress(p => (p < ceiling - 0.5 ? Math.min(ceiling - 0.5, p + 0.3) : p));
    }, 1000);
    const poll = setInterval(async () => {
      if (finished) return;
      try {
        const { data } = await api.get('/api/hardware/stitch/status');
        if (data.running) bump(typeof data.pct === 'number' ? data.pct : ceiling, data.phase);
        else if (data.done || data.output_exists) done(true);
        else if (data.error) done(false, data.error);
      } catch { /* ignore */ }
    }, 4000);
    const keepAlive = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ action: 'PING' }));
    }, 20000);
    const watchdog = setInterval(() => {
      if (!finished && Date.now() - lastBeat > 5 * 60 * 1000) {
        done(false, 'Edge tidak mengirim kabar selama 5 menit — proses dianggap gagal.');
      }
    }, 30000);
    stitchAbortRef.current = () => done(false, '__ABORT__');
    monitorTeardownRef.current = () => {
      finished = true;
      clearInterval(poll); clearInterval(keepAlive); clearInterval(watchdog); clearInterval(creep);
      wsRef.current?.removeEventListener('message', onWs);
    };
    return done;
  };

  const runStitching = async (
    tilesPayload: { images: (string | null)[]; tiles: any[]; session?: string | null },
    scanTParam = 0,
  ) => {
    const done = attachStitchMonitor({ scanTParam });
    try {
      await api.post('/api/hardware/stitch', {
        images: tilesPayload.images,
        tiles: tilesPayload.tiles,
        model: stitchModel,
        session: tilesPayload.session ?? null,
      }, { timeout: 30000 });
    } catch (error: any) {
      done(false, error?.response?.data?.detail);
    }
  };

  const executeStitching = (scanTParam = processTimes.scan) => {
    const valid = capturedImages.filter(img => img.filename !== null);
    if (valid.length < 2) { showToast('Butuh minimal 2 gambar untuk stitching', 'error'); return; }
    runStitching({
      session: scanSession,
      images: valid.map(img => img.filename),
      tiles: valid.map(img => ({
        filename: img.filename,
        coordX: img.coordX, coordY: img.coordY,
        gridX: img.gridX, gridY: img.gridY,
      })),
    }, scanTParam);
  };

  const executeStitchingInput = () => {
    const tiles = Object.values(inputTiles);
    if (tiles.length < 2) { showToast('Isi minimal 2 sel grid dengan gambar', 'error'); return; }
    runStitching({
      session: inputSession,
      images: tiles.map(tl => tl.filename),
      tiles: tiles.map(tl => ({
        filename: tl.filename, url: tl.url,
        gridX: tl.gridX, gridY: tl.gridY,
      })),
    }, 0);
  };

  // ── Handler mode INPUT IMAGES ──
  const openInputModal = () => {
    // 1 sesi Input = 1 folder tmp_images/<session> terisolasi di Edge.
    if (!inputSession) {
      setInputSession('INPUT' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14));
    }
    setShowInputModal(true);
  };
  const openCellSource = (gx: number, gy: number) => setInputTarget({ gx, gy });

  const handleInputFileChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !inputTarget) return;
    const { gx, gy } = inputTarget;
    setInputBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('grid_x', String(gx));
      fd.append('grid_y', String(gy));
      fd.append('session', inputSession || 'INPUT');
      const { data } = await api.post('/api/hardware/stitch/place', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setInputTiles(prev => ({
        ...prev,
        [`${gy}-${gx}`]: { gridX: gx, gridY: gy, filename: data.filename, url: data.url, preview: URL.createObjectURL(file) },
      }));
      showToast(`Sel (${gx + 1},${gy + 1}) terisi`, 'success');
    } catch {
      showToast('Gagal mengunggah gambar', 'error');
    } finally {
      setInputBusy(false);
      setInputTarget(null);
    }
  };

  const openDbPicker = () => { setDbPickerMode('cell'); setShowDbPicker(true); setDbPickerFolder(null); setDbPickerImages([]); };

  // Isi SELURUH grid dari satu folder database sekaligus. Sistem mengenali
  // posisi tiap gambar dari nama berkas ('..._r<n>_c<n>...'); jika tidak,
  // diisi berurutan (row-major). Setelah itu tinggal "MULAI TILE STITCHING".
  const openFolderFill = () => {
    if (!inputSession) setInputSession('INPUT' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14));
    setShowInputModal(true);
    setDbPickerMode('grid');
    setShowDbPicker(true);
    setDbPickerFolder(null);
    setDbPickerImages([]);
  };

  const fillGridFromFolder = async (folderId: string) => {
    const sess = inputSession || ('INPUT' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14));
    if (!inputSession) setInputSession(sess);
    setInputBusy(true);
    try {
      const { data } = await api.post('/api/hardware/stitch/place-folder', {
        folder_id: folderId, rows: r, columns: c, session: sess,
      });
      const next: Record<string, InputTile> = {};
      for (const tl of (data.tiles || [])) {
        next[`${tl.gridY}-${tl.gridX}`] = { gridX: tl.gridX, gridY: tl.gridY, filename: tl.filename, url: tl.url };
      }
      setInputTiles(next);
      setShowDbPicker(false);
      setDbPickerMode('cell');
      showToast(
        data.recognized_from_name
          ? `${data.count} gambar dikenali dari nama berkas & ditempatkan sesuai posisi grid.`
          : `${data.count} dari ${data.total_in_folder} gambar diisi berurutan ke grid ${data.rows}×${data.columns}.`,
        'success');
    } catch (e: any) {
      showToast(e?.response?.data?.detail || 'Gagal mengisi grid dari folder.', 'error');
    } finally {
      setInputBusy(false);
    }
  };

  const loadDbFolderImages = async (folderId: string) => {
    setDbPickerFolder(folderId);
    setInputBusy(true);
    try {
      const { data } = await api.get(`/api/dataset/folders/${folderId}/images`);
      setDbPickerImages((data || []).filter((im: any) => /\.(png|jpe?g)$/i.test(im.name)));
    } catch {
      showToast('Gagal memuat gambar folder', 'error');
    } finally {
      setInputBusy(false);
    }
  };

  const pickDbImage = async (imageName: string) => {
    if (!inputTarget || !dbPickerFolder) return;
    const { gx, gy } = inputTarget;
    setInputBusy(true);
    try {
      const { data } = await api.post('/api/hardware/stitch/place-from-dataset', {
        folder_id: dbPickerFolder, image_name: imageName, grid_x: gx, grid_y: gy,
        session: inputSession || 'INPUT',
      });
      setInputTiles(prev => ({
        ...prev,
        [`${gy}-${gx}`]: {
          gridX: gx, gridY: gy, filename: data.filename, url: data.url,
          preview: `${api.defaults.baseURL}/static/datasets/${dbPickerFolder}/${imageName}`,
        },
      }));
      showToast(`Sel (${gx + 1},${gy + 1}) terisi dari database`, 'success');
      setShowDbPicker(false);
      setInputTarget(null);
    } catch {
      showToast('Gagal menempatkan gambar', 'error');
    } finally {
      setInputBusy(false);
    }
  };

  const removeInputTile = (gx: number, gy: number) => {
    setInputTiles(prev => {
      const next = { ...prev };
      delete next[`${gy}-${gx}`];
      return next;
    });
  };

  const removeCapturedImage = (index: number) => {
    setCapturedImages(prev => prev.map(img => img.index === index ? { ...img, filename: null } : img));
    showToast('Gambar dihapus dari list', 'info');
  };

  const retakeImage = async (index: number, cx: number, cy: number) => {
    setShowReviewModal(false);
    setIsProcessing(true);
    setProcessKind('manual');
    setProcessTask(`Retake Koordinat (X:${cx}, Y:${cy})...`);
    setTimerTick(0);
    // Pakai ulang nama file tile ini supaya posisinya di grid tidak berubah.
    const existing = capturedImages.find(im => im.index === index);
    // Retake tile GRID -> sertakan sesi + posisi grid supaya Edge menimpa tile
    // di folder sesi (kalau tidak, stitching ulang tetap pakai tile lama).
    const isGridTile = !!scanSession && (existing?.gridX ?? -1) >= 0 && (existing?.gridY ?? -1) >= 0;
    // Tile yang gagal punya filename=null -> rekonstruksi nama dari sesi + posisi.
    const newFilename =
      existing?.filename ||
      (isGridTile ? `IMG_${scanSession}_r${existing!.gridY}_c${existing!.gridX}.jpg`
                  : `IMG_${String(index + 1).padStart(4, '0')}.jpg`);

    try {
      setIsRetaking(true);
      await api.post('/api/hardware/scan/retake', {
        coord_x: cx,
        coord_y: cy,
        filename: newFilename,
        delay_ms: parseInt(camDelay),
        ...(isGridTile ? { session: scanSession, grid_x: existing!.gridX, grid_y: existing!.gridY } : {}),
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
           const dir = joystickPos.y < 0 ? -1 : 1; // Inversi Y-axis
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
          <button onClick={() => setGatherMode('AUTO')} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-colors ${gatherMode === 'AUTO' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}>{t('autoGather')}</button>
          <button onClick={() => setGatherMode('MANUAL')} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-colors ${gatherMode === 'MANUAL' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}>{t('manualGather')}</button>
          <button onClick={() => setGatherMode('INPUT')} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${gatherMode === 'INPUT' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}><Boxes size={13}/> INPUT IMAGES</button>
        </div>

        {gatherMode !== 'INPUT' && (
          <button onClick={handleHome} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all text-xs shrink-0">
            <ArrowUpLeft size={18} className="mr-2" /> KEMBALIKAN KE POJOK KIRI ATAS (0,0)
          </button>
        )}

        {gatherMode === 'INPUT' && (
          <>
            <div className={`p-4 rounded-2xl border shrink-0 ${theme.panel}`}>
              <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center mb-3 ${theme.text}`}><Grid3X3 size={16} className="mr-2 text-blue-400" /> Pengaturan Grid</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${theme.textMuted}`}>Kolom</span>
                  <input readOnly={globalVirtualKeyboard} value={cols} onChange={(e) => setCols(e.target.value)} onClick={() => triggerGlobalKeypad('Jumlah Kolom', cols, setCols)} className={`w-14 h-8 text-center rounded-lg border font-mono font-bold cursor-pointer ${theme.input}`} />
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${theme.textMuted}`}>Baris</span>
                  <input readOnly={globalVirtualKeyboard} value={rows} onChange={(e) => setRows(e.target.value)} onClick={() => triggerGlobalKeypad('Jumlah Baris', rows, setRows)} className={`w-14 h-8 text-center rounded-lg border font-mono font-bold cursor-pointer ${theme.input}`} />
                </div>
              </div>
              <p className={`text-[10px] mt-3 ${theme.textMuted}`}>{c} × {r} = {c * r} sel. Isi tiap sel dengan gambar dari perangkat atau database; nama file otomatis mengikuti posisi grid.</p>
            </div>

            <div className={`p-4 rounded-2xl border shrink-0 ${theme.panel}`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center mb-2 ${theme.textMuted}`}><Cpu size={14} className="mr-2" /> Model Tile Stitching</h3>
              <select value={stitchModel} onChange={(e) => setStitchModel(e.target.value)} className={`w-full h-9 px-2 rounded-lg border text-xs font-bold outline-none ${theme.input}`}>
                {STITCH_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div className="mt-auto pt-2 flex flex-col gap-2">
              <button onClick={openFolderFill} className="w-full py-3 rounded-2xl font-bold flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all">
                <Database size={18} className="mr-2" /> ISI GRID DARI FOLDER DATABASE
              </button>
              <button onClick={openInputModal} className="w-full py-3 rounded-2xl font-bold flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white active:scale-95 transition-all">
                <Grid3X3 size={18} className="mr-2" /> SUSUN MANUAL ({Object.keys(inputTiles).length}/{c * r})
              </button>
              <p className={`text-[10px] text-center ${theme.textMuted}`}>Folder: sistem menaruh gambar sesuai posisi grid otomatis (kenali dari nama <span className="font-mono">_r_c_</span>, atau berurutan).</p>
            </div>
          </>
        )}

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
                {autoStitch && (
                  <div className="mt-3">
                    <span className={`text-[10px] font-bold flex items-center mb-1 ${theme.textMuted}`}><Cpu size={12} className="mr-1.5" /> Model Stitching</span>
                    <select value={stitchModel} onChange={(e) => setStitchModel(e.target.value)} className={`w-full h-9 px-2 rounded-lg border text-xs font-bold outline-none ${theme.input}`}>
                      {STITCH_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                )}
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
                        <button onClick={() => sendHttpMove('Y', -1)} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowUp size={24}/></button>
                        <div />
                        <button onClick={() => sendHttpMove('X', -1)} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowLeft size={24}/></button>
                        <button onClick={() => api.post('/api/hardware/motor/unlock')} title="Unlock GRBL" className="rounded-full border-2 border-blue-500/50 bg-blue-500/10 text-blue-500 flex items-center justify-center active:scale-95"><Crosshair size={20}/></button>
                        <button onClick={() => sendHttpMove('X', 1)} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowRight size={24}/></button>
                        <div />
                        <button onClick={() => sendHttpMove('Y', 1)} className={`rounded-xl border flex items-center justify-center active:scale-95 ${theme.btnTouch}`}><ArrowDown size={24}/></button>
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
            <button
              onClick={async () => {
                cancelRef.current = true;
                if (processKind === 'scan') {
                  setProcessTask('Membatalkan pemindaian...');
                  try { await api.post('/api/hardware/scan/cancel'); } catch { /* ignore */ }
                  // Tunggu event SCAN_CANCELLED; paksa tutup kalau tidak datang.
                  setTimeout(() => setIsProcessing(false), 12000);
                } else if (processKind === 'stitch') {
                  stitchAbortRef.current?.();
                  showToast('Menutup pemantauan stitching (proses Edge tetap berjalan).', 'info');
                } else {
                  setIsProcessing(false);
                }
              }}
              className="mt-8 px-8 py-3 bg-red-600 rounded-full font-bold shadow-lg shadow-red-600/50 active:scale-95"
            >
              {t('cancel')}
            </button>
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
                <div className="flex-1 flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="flex items-center gap-2 sm:w-64">
                    <Cpu size={16} className="text-purple-400 shrink-0" />
                    <select value={stitchModel} onChange={(e) => setStitchModel(e.target.value)} className={`w-full h-10 px-2 rounded-lg border text-[11px] font-bold outline-none ${theme.input}`}>
                      {STITCH_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <button onClick={() => executeStitching()} disabled={validImageCount < 2} className="flex-1 py-3 sm:py-4 bg-purple-600 disabled:bg-gray-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-purple-600/20 text-[11px] xs:text-xs sm:text-base px-2 text-center">
                    <Grid3X3 size={18} className="mr-1 sm:mr-2 shrink-0"/> <span className="hidden sm:inline">TILE STITCHING</span><span className="sm:hidden">STITCHING</span> ({validImageCount})
                  </button>
                </div>
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

      {/* ── MODAL: INPUT IMAGES (isi tiap sel grid) ── */}
      {showInputModal && (
        <div className={theme.overlay}>
          <div className={`w-[95%] max-w-5xl h-[90vh] rounded-3xl flex flex-col overflow-hidden shadow-2xl ${theme.panel}`}>
            <div className="p-4 sm:p-6 border-b border-gray-700 flex justify-between items-center bg-black/20 shrink-0">
              <div className="flex items-center gap-3">
                <Boxes size={24} className="text-blue-500" />
                <h2 className={`text-xl sm:text-2xl font-bold ${theme.text}`}>Susun Grid {c} × {r}</h2>
              </div>
              <button onClick={() => setShowInputModal(false)} className={`p-2 rounded-xl border ${theme.btnTouch} ${theme.text}`}><X size={22} /></button>
            </div>

            <div className="p-3 sm:p-4 border-b border-gray-700 flex flex-col sm:flex-row gap-2 sm:items-center bg-black/10 shrink-0">
              <span className={`text-xs font-bold flex items-center ${theme.textMuted}`}><Cpu size={14} className="mr-1.5" /> Model:</span>
              <select value={stitchModel} onChange={(e) => setStitchModel(e.target.value)} className={`h-9 px-2 rounded-lg border text-xs font-bold outline-none flex-1 sm:max-w-xs ${theme.input}`}>
                {STITCH_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <span className={`text-xs font-bold sm:ml-auto ${theme.textMuted}`}>{Object.keys(inputTiles).length}/{c * r} sel terisi</span>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-black/5">
              <div className="grid gap-3 mx-auto w-fit" style={{ gridTemplateColumns: `repeat(${c}, minmax(110px, 1fr))` }}>
                {Array.from({ length: r }).map((_, gy) =>
                  Array.from({ length: c }).map((__, gx) => {
                    const key = `${gy}-${gx}`;
                    const tile = inputTiles[key];
                    return (
                      <div key={key} className={`aspect-square rounded-lg border-2 relative flex flex-col items-center justify-center overflow-hidden ${tile ? 'border-blue-500' : 'border-dashed border-gray-500 bg-black/10'}`}>
                        <span className="absolute top-1 left-1 z-20 text-[9px] font-mono font-bold px-1 rounded bg-black/60 text-white">r{gy} c{gx}</span>
                        {tile ? (
                          <>
                            <img src={tile.preview || `${api.defaults.baseURL}${tile.url}`} className="absolute inset-0 w-full h-full object-cover" alt={key} />
                            <button onClick={() => removeInputTile(gx, gy)} className="absolute top-1 right-1 z-20 p-1 bg-red-500 text-white rounded hover:bg-red-600"><X size={12} /></button>
                          </>
                        ) : (
                          <button onClick={() => openCellSource(gx, gy)} className="w-full h-full flex flex-col items-center justify-center text-gray-400 hover:text-blue-400 hover:bg-blue-500/5">
                            <Plus size={22} />
                            <span className="text-[9px] font-bold mt-1">Isi</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-4 sm:p-6 border-t border-gray-700 flex gap-3 bg-black/20 shrink-0">
              <button onClick={() => { setInputTiles({}); setInputSession(''); showToast('Grid dikosongkan', 'info'); }} className="px-4 py-3 rounded-xl font-bold border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white active:scale-95 transition-colors text-sm">
                <Trash2 size={16} className="inline mr-1" /> Kosongkan
              </button>
              <button onClick={executeStitchingInput} disabled={Object.keys(inputTiles).length < 2} className="flex-1 py-3 bg-purple-600 disabled:bg-gray-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all shadow-lg">
                <Grid3X3 size={18} className="mr-2" /> MULAI TILE STITCHING ({Object.keys(inputTiles).length})
              </button>
            </div>
          </div>

          {/* Sub-popup: pilih sumber untuk satu sel */}
          {inputTarget && !showDbPicker && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[120]" onClick={() => setInputTarget(null)}>
              <div className={`w-[90%] max-w-xs rounded-2xl p-5 border ${theme.panel}`} onClick={(e) => e.stopPropagation()}>
                <h3 className={`text-sm font-bold mb-4 ${theme.text}`}>Sumber gambar untuk sel (r{inputTarget.gy} c{inputTarget.gx})</h3>
                <div className="flex flex-col gap-2">
                  <button onClick={() => fileInputRef.current?.click()} disabled={inputBusy} className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2 active:scale-95"><Upload size={16} /> Dari Perangkat</button>
                  <button onClick={openDbPicker} disabled={inputBusy} className={`py-3 rounded-xl font-bold flex items-center justify-center gap-2 border active:scale-95 ${theme.btnTouch} ${theme.text}`}><Database size={16} /> Dari Database</button>
                  <button onClick={() => setInputTarget(null)} className={`py-2 text-xs font-bold ${theme.textMuted}`}>Batal</button>
                </div>
              </div>
            </div>
          )}

          {/* Sub-modal: pilih dari dataset folder */}
          {showDbPicker && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[130] p-4" onClick={() => setShowDbPicker(false)}>
              <div className={`w-[95%] max-w-2xl max-h-[80vh] rounded-2xl flex flex-col overflow-hidden border ${theme.panel}`} onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-black/20">
                  <h3 className={`font-bold ${theme.text}`}>
                    {dbPickerMode === 'grid'
                      ? `Isi grid ${c}×${r} dari folder`
                      : (dbPickerFolder ? 'Pilih Gambar' : 'Pilih Folder Dataset')}
                  </h3>
                  <button onClick={() => (dbPickerMode === 'cell' && dbPickerFolder) ? setDbPickerFolder(null) : setShowDbPicker(false)} className={`p-1.5 rounded-lg border ${theme.btnTouch} ${theme.text}`}><X size={18} /></button>
                </div>
                <div className="p-4 overflow-auto">
                  {dbPickerMode === 'grid' ? (
                    <div className="grid gap-2">
                      {inputBusy && <p className={`text-xs ${theme.textMuted}`}>Menempatkan gambar ke grid…</p>}
                      {!inputBusy && availableFolders.length === 0 && <p className={`text-xs ${theme.textMuted}`}>Belum ada folder dataset.</p>}
                      {!inputBusy && availableFolders.map((f) => (
                        <button key={f.id} onClick={() => fillGridFromFolder(f.id)} className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 hover:border-emerald-500 ${theme.text}`}>
                          <span className="flex items-center gap-2"><FolderPlus size={16} /> <span className="font-bold text-sm">{f.name}</span></span>
                          <span className="text-[10px] opacity-60">{f.object_type}</span>
                        </button>
                      ))}
                    </div>
                  ) : !dbPickerFolder ? (
                    <div className="grid gap-2">
                      {availableFolders.length === 0 && <p className={`text-xs ${theme.textMuted}`}>Belum ada folder dataset.</p>}
                      {availableFolders.map((f) => (
                        <button key={f.id} onClick={() => loadDbFolderImages(f.id)} className={`p-3 rounded-xl border text-left flex items-center gap-2 hover:border-blue-500 ${theme.text}`}>
                          <FolderPlus size={16} /> <span className="font-bold text-sm">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : inputBusy ? (
                    <p className={`text-xs ${theme.textMuted}`}>Memuat...</p>
                  ) : dbPickerImages.length === 0 ? (
                    <p className={`text-xs ${theme.textMuted}`}>Folder ini tidak punya gambar.</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {dbPickerImages.map((im) => (
                        <button key={im.name} onClick={() => pickDbImage(im.name)} disabled={inputBusy} className="aspect-square rounded-lg border border-gray-600 overflow-hidden hover:border-blue-500 relative group">
                          <img src={`${api.defaults.baseURL}/static/datasets/${dbPickerFolder}/${im.name}`} className="w-full h-full object-cover" alt={im.name} />
                          <span className="absolute bottom-0 inset-x-0 text-[8px] font-mono bg-black/60 text-white truncate px-1">{im.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleInputFileChosen} />

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




