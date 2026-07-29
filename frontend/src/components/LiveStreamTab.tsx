import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Camera, CameraOff, Crosshair, Settings, Activity, Thermometer, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Save, Move, Gamepad2, MousePointerSquareDashed, RotateCcw, Aperture, AlertOctagon, Maximize, Video, Square, Folder, ChevronDown } from 'lucide-react';
import type { KeypadConfig } from '../App';
import type { Language } from '../i18n';
import { translations } from '../i18n';

interface LiveStreamTabProps {
  isDarkMode: boolean;
  openKeypad: (config: KeypadConfig) => void;
  globalVirtualKeyboard: boolean;
  isSystemHardwareEnabled: boolean;
  cameraActive: boolean;
  setCameraActive: (val: boolean) => void;
  videoSrc: string | null;
  grblStatus: string;
  setGrblStatus: (val: string) => void;
  lastEchoGCode: string;
  setLastEchoGCode: (val: string) => void;
  jetsonTemperatures: { cpu: number | null, gpu: number | null };
  limitSwitchState: string;
  wsRef: React.MutableRefObject<WebSocket | null>;
  triggerToast: (message: string, type?: 'SUCCESS' | 'ERROR' | 'INFO') => void;
  availableFolders: {id: string, name: string}[];
  onRefreshFolders: () => void;
  language: Language;
}

export default function LiveStreamTab({ 
  isDarkMode, 
  openKeypad, 
  globalVirtualKeyboard, 
  isSystemHardwareEnabled,
  cameraActive,
  setCameraActive,
  videoSrc,
  grblStatus,
  setGrblStatus,
  lastEchoGCode,
  setLastEchoGCode,
  jetsonTemperatures,
  limitSwitchState,
  wsRef,
  triggerToast,
  availableFolders,
  onRefreshFolders,
  language
}: LiveStreamTabProps) {
  
  const t = translations[language];
  
  const [controlMode, setControlMode] = useState<'dpad' | 'joystick'>('dpad');
  const joystickVectorRef = useRef({ x: 0, y: 0 });
  const joystickActiveRef = useRef(false);
  const lastMoveDirectionRef = useRef<Record<'X' | 'Y' | 'Z', '+' | '-'> >({ X: '+', Y: '+', Z: '+' });
  
  const [xyStepUnit, setXyStepUnit] = useState<'mm' | 'inch'>('mm');
  const [xyStepValue, setXyStepValue] = useState<string>("1");
  const [zStepValue, setZStepValue] = useState<string>("1");

  const [feedRate, setFeedRate] = useState<string>("250");
  const [backlash, setBacklash] = useState<string>("0.05");
  const [acceleration, setAcceleration] = useState<string>("10");
  const [settleTime, setSettleTime] = useState<string>("500");

  const [shutterSpeed, setShutterSpeed] = useState<string>("15000"); 
  const [iso, setIso] = useState<string>("200");
  const [targetFps, setTargetFps] = useState<string>("30");

  const [showFps, setShowFps] = useState(true);
  const [showCoordinates, setShowCoordinates] = useState(true);
  const [showFpsGraph, setShowFpsGraph] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const videoCountRef = useRef<number>(0);
  const activeRecordFolderIdRef = useRef<string>('');
  const checkVideoIntervalRef = useRef<any>(null);

  const [selectedFolderId, setSelectedFolderId] = useState<string>('');

  const videoContainerRef = useRef<HTMLDivElement>(null);

  // State koordinat lokal untuk keperluan interpolasi transisi D-Pad
  const [motorPos, setMotorPos] = useState({ x: 0.00, y: 0.00, z: 0 });
  const [joystickVector, setJoystickVector] = useState({ x: 0, y: 0 });

  const themeClasses = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    btnTouch: isDarkMode ? 'bg-gray-800 border-gray-600 hover:bg-gray-700 active:bg-gray-600' : 'bg-gray-100 border-gray-300 hover:bg-gray-200 active:bg-gray-300',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-blue-400' : 'bg-white border-gray-300 text-blue-600',
  };



  useEffect(() => {
    if (lastEchoGCode && lastEchoGCode.startsWith("X:")) {
      const timer = setTimeout(() => {
        try {
          const parts = lastEchoGCode.split(" ");
          const xVal = parseFloat(parts[0].split(":")[1]);
          const yVal = parseFloat(parts[1].split(":")[1]);
          const zVal = parseFloat(parts[2].split(":")[1]);
          setMotorPos({ x: xVal, y: yVal, z: zVal });
        } catch (e) {
          console.error("Gagal mem-parsing koordinat motor dari lastEchoGCode:", e);
        }
      }, 0);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [lastEchoGCode]);

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (checkVideoIntervalRef.current) clearInterval(checkVideoIntervalRef.current);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoContainerRef.current?.requestFullscreen().catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const triggerKeypad = (title: string, currentValue: string, setter: (val: string) => void) => {
    if (!globalVirtualKeyboard) return; 
    openKeypad({
      visible: true,
      title: title,
      value: currentValue,
      onUpdate: setter
    });
  };

  const toMm = (axis: 'X' | 'Y' | 'Z') => {
    const rawValue = axis === 'Z' ? parseFloat(zStepValue) : parseFloat(xyStepValue);
    const safeValue = Number.isFinite(rawValue) ? rawValue : 0;
    return axis === 'Z' ? safeValue : safeValue * (xyStepUnit === 'inch' ? 25.4 : 1);
  };

  const sendCncSettings = async () => {
    try {
      await axios.post('http://localhost:8000/api/hardware/cnc/settings', {
        feed_rate: parseFloat(feedRate),
        backlash: parseFloat(backlash),
        acceleration: parseFloat(acceleration),
        settle_time: parseInt(settleTime, 10),
      });
      triggerToast('Parameter CNC berhasil diterapkan ke controller.', 'SUCCESS');
    } catch (error) {
      console.error('Gagal menerapkan parameter CNC:', error);
      triggerToast('Gagal menerapkan parameter CNC.', 'ERROR');
    }
  };

  const sendMotorCommand = async (axis: 'X' | 'Y' | 'Z', direction: '+' | '-') => {
    if (!isSystemHardwareEnabled) return;
    
    const stepMm = toMm(axis);
    const backlashMm = axis === 'Z' ? 0 : Math.max(0, parseFloat(backlash) || 0);
    const lastDirection = lastMoveDirectionRef.current[axis];
    const compensatedValue = direction === '+' ? stepMm : -stepMm;
    const adjustedValue = axis !== 'Z' && lastDirection && lastDirection !== direction
      ? compensatedValue + (direction === '+' ? backlashMm : -backlashMm)
      : compensatedValue;
    
    const gcodeStr = axis === 'Z' 
      ? `G1 Z${adjustedValue.toFixed(3)} F200`
      : `G1 ${axis}${adjustedValue.toFixed(3)} F${feedRate}`;

    lastMoveDirectionRef.current[axis] = direction;
    
    setMotorPos(prev => ({
      ...prev,
      [axis.toLowerCase()]: parseFloat((prev[axis.toLowerCase() as keyof typeof prev] + adjustedValue).toFixed(2))
    }));

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setGrblStatus('MOVING...');
      setLastEchoGCode(gcodeStr);
      wsRef.current.send(JSON.stringify({
        action: 'MOVE_MOTOR',
        gcode: gcodeStr
      }));
    } else {
      await axios.post('http://localhost:8000/api/hardware/motor/move', {
        axis,
        value: adjustedValue,
        feed_rate: parseFloat(feedRate),
        unit: axis === 'Z' ? 'step' : xyStepUnit
      }).catch(err => console.error(err));
    }

    const settleMs = Math.max(0, parseInt(settleTime, 10) || 0);
    if (settleMs > 0) {
      await new Promise(resolve => setTimeout(resolve, settleMs));
    }
  };

  const handleApplyCameraSettings = async () => {
    try {
      await axios.post('http://localhost:8000/api/hardware/camera/settings', {
        shutter_speed: parseInt(shutterSpeed), iso: parseInt(iso)
      });
      triggerToast('Konfigurasi Pengaturan Sensor IMX477 Berhasil Diterapkan!', 'SUCCESS');
    } catch (error) {
      console.error("Gagal menerapkan konfigurasi kamera:", error);
      triggerToast('Gagal menerapkan konfigurasi kamera ke Jetson Orin', 'ERROR');
    }
  };

  const handleDefaultParams = () => {
    setFeedRate("250");
    setBacklash("0.05");
    setAcceleration("10");
    setSettleTime("500");
  };

  const handleDefaultCamera = () => {
    setShutterSpeed("15000");
    setIso("200");
  };

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-full w-full select-none overflow-y-auto lg:overflow-hidden pb-4 lg:pb-0">
      
      {/* KIRI: VIDEO & HUD LAYER */}
      <div ref={videoContainerRef} className={`sticky top-0 z-40 lg:relative lg:z-auto w-full lg:w-[60%] h-[300px] sm:h-[450px] lg:h-full rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 overflow-hidden ${cameraActive ? 'border-green-500/50 bg-black' : 'border-dashed ' + themeClasses.panel}`}>
        {cameraActive ? (
          videoSrc ? (
            <img 
              src={videoSrc} 
              alt="Microscope Live Feed" 
              className="w-full h-full object-cover rounded-2xl"
            />
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className={`text-sm font-bold ${themeClasses.textMuted}`}>Menghubungkan Aliran Citra Global...</p>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center">
            <CameraOff size={64} className={`mb-4 ${themeClasses.textMuted}`} />
            <p className={`text-xl font-bold ${themeClasses.textMuted}`}>Kamera Mati</p>
          </div>
        )}

        {/* TOP LEFT HUD: COORDINATES */}
        {cameraActive && showCoordinates && (
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3 text-white shadow-lg pointer-events-none z-10 flex gap-4">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-red-400 font-bold mb-0.5 tracking-wider">X (mm)</span>
              <span className="font-mono font-bold text-sm">{motorPos.x.toFixed(2)}</span>
            </div>
            <div className="w-px bg-white/20"></div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-green-400 font-bold mb-0.5 tracking-wider">Y (mm)</span>
              <span className="font-mono font-bold text-sm">{motorPos.y.toFixed(2)}</span>
            </div>
            <div className="w-px bg-white/20"></div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-blue-400 font-bold mb-0.5 tracking-wider">Z (stp)</span>
              <span className="font-mono font-bold text-sm">{motorPos.z}</span>
            </div>
          </div>
        )}

        {/* TOP RIGHT HUD: TOGGLES & FPS */}
        {cameraActive && (
          <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-10">
            <div className="flex gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-1 shadow-lg">
              <button onClick={() => setShowCoordinates(!showCoordinates)} className={`p-2 rounded-lg transition-colors ${showCoordinates ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`} title="Toggle Coordinates">
                <Crosshair size={18} />
              </button>
              <button onClick={() => setShowFps(!showFps)} className={`p-2 rounded-lg transition-colors ${showFps ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`} title="Toggle FPS">
                <Activity size={18} />
              </button>
              <button onClick={toggleFullscreen} className="p-2 rounded-lg text-gray-400 hover:text-white transition-colors" title="Fullscreen">
                <Maximize size={18} />
              </button>
            </div>
            {showFps && (
              <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-sm shadow-lg pointer-events-none">
                FPS: {targetFps}
              </div>
            )}
          </div>
        )}

        {/* BOTTOM LEFT HUD: RECORDING */}
        {cameraActive && (
          <div className="absolute bottom-6 left-6 z-10 flex gap-3">
            {!isRecording ? (
              <>
                {/* FOLDER SELECTION ICON -> EXPANDS TO DROPDOWN */}
                <div className="relative flex items-center bg-black/60 hover:bg-gray-900/80 backdrop-blur-md border border-white/10 rounded-full p-3 shadow-2xl transition-all duration-300 overflow-hidden group max-w-[48px] hover:max-w-[250px]">
                  <Folder size={20} className="shrink-0 text-gray-300 group-hover:text-blue-400 transition-colors" />
                  <div className="w-0 opacity-0 group-hover:w-auto group-hover:opacity-100 group-hover:ml-3 overflow-hidden transition-all duration-300">
                    <select 
                      value={selectedFolderId} 
                      onChange={(e) => setSelectedFolderId(e.target.value)}
                      className="bg-transparent text-sm text-white font-bold outline-none appearance-none pr-6 cursor-pointer w-[150px] text-ellipsis overflow-hidden whitespace-nowrap"
                    >
                      <option value="" className={isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}>{t.autoCreate}</option>
                      {availableFolders.map(f => (
                        <option key={f.id} value={f.id} className={isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}>{f.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="text-gray-400 absolute right-3 pointer-events-none top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* RECORD VIDEO ICON -> EXPANDS TO TEXT */}
                <button onClick={async () => {
                  let folderIdToUse = selectedFolderId;
                  if (!folderIdToUse) {
                    try {
                      const now = new Date();
                      const pad = (n: number) => n.toString().padStart(2, '0');
                      const folderName = `Live Video ${pad(now.getDate())}-${pad(now.getMonth()+1)}-${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
                      const currentUser = localStorage.getItem('username') || "Unknown User";
                      const res = await axios.post('http://localhost:8000/api/dataset/folders', {
                        name: folderName,
                        object_type: "Video",
                        date: now.toISOString().split('T')[0],
                        operator: currentUser
                      });
                      folderIdToUse = res.data.id;
                      setSelectedFolderId(folderIdToUse);
                      onRefreshFolders();
                    } catch (e) {
                      triggerToast("Gagal membuat folder otomatis", "ERROR");
                      return;
                    }
                  }
                  activeRecordFolderIdRef.current = folderIdToUse;

                  setIsRecording(true);
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ action: "START_RECORDING", folder_id: folderIdToUse }));
                    const folder = availableFolders.find(f => f.id === folderIdToUse);
                    videoCountRef.current = folder ? (folder as any).video_count || 0 : 0;
                  }
                }} className="flex items-center p-3 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-2xl transition-all duration-300 overflow-hidden group max-w-[48px] hover:max-w-[200px]">
                  <Video size={20} className="shrink-0" />
                  <span className="w-0 opacity-0 group-hover:w-auto group-hover:opacity-100 group-hover:ml-3 overflow-hidden whitespace-nowrap transition-all duration-300 font-bold">
                    Record Video
                  </span>
                </button>
              </>
            ) : (
              <div className="flex gap-3 bg-red-600/90 backdrop-blur-md rounded-xl p-2 shadow-lg items-center animate-pulse-slow">
                <div className="px-3 py-1 flex items-center font-mono font-bold text-white tracking-widest border-r border-white/20">
                  <div className="w-2 h-2 rounded-full bg-white animate-ping mr-3"></div>
                  {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:{(recordingTime % 60).toString().padStart(2, '0')}
                </div>
                <button onClick={() => {
                  setIsRecording(false);
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ action: "STOP_RECORDING" }));
                  }
                  triggerToast("Menyimpan video... Estimasi upload: ~15 detik.", "INFO");
                  
                  // Polling backend untuk memeriksa apakah video_count bertambah (upload selesai)
                  if (checkVideoIntervalRef.current) clearInterval(checkVideoIntervalRef.current);
                  let attempts = 0;
                  const targetFolder = activeRecordFolderIdRef.current;
                  checkVideoIntervalRef.current = setInterval(async () => {
                    attempts++;
                    // 60 attempts * 1000ms = 60s timeout
                    if (attempts > 60) {
                      if (checkVideoIntervalRef.current) clearInterval(checkVideoIntervalRef.current);
                      triggerToast("Waktu sinkronisasi video habis. Periksa koneksi VPS.", "ERROR");
                      return;
                    }
                    try {
                      const res = await axios.get('http://localhost:8000/api/dataset/folders');
                      const updatedFolder = res.data.find((f: any) => f.id === targetFolder);
                      if (updatedFolder && (updatedFolder.video_count || 0) > videoCountRef.current) {
                        triggerToast("Video berhasil diunggah ke Database!", "SUCCESS");
                        onRefreshFolders();
                        if (checkVideoIntervalRef.current) clearInterval(checkVideoIntervalRef.current);
                      }
                    } catch (e) {}
                  }, 1000);
                }} className="px-4 py-2 bg-white text-red-600 hover:bg-gray-100 font-bold rounded-full flex items-center shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all overflow-hidden group max-w-[50px] hover:max-w-[150px]">
                  <Square size={16} fill="currentColor" className="shrink-0 group-hover:mr-2 transition-all" />
                  <span className="opacity-0 group-hover:opacity-100 whitespace-nowrap transition-all duration-300">STOP</span>
                </button>
                <div className="flex flex-col ml-2">
                  <span className="text-[10px] text-red-200 font-bold uppercase tracking-wider">REC</span>
                  <span className="font-mono font-bold text-sm text-white animate-pulse">
                    LIVE
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* BOTTOM RIGHT: CAMERA ON/OFF */}
        <button 
          disabled={!isSystemHardwareEnabled} 
          onClick={() => {
            const nextState = !cameraActive;
            setCameraActive(nextState);
            triggerToast(
              nextState ? 'Sensor Optik IMX477 Berhasil Diaktifkan!' : 'Stream Kamera Dinonaktifkan.',
              nextState ? 'SUCCESS' : 'INFO'
            );
          }} 
          className={`absolute bottom-6 right-6 p-4 rounded-full text-lg font-bold flex items-center shadow-2xl z-10 overflow-hidden group transition-all duration-300 max-w-[60px] hover:max-w-[200px] ${
            !isSystemHardwareEnabled ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50' :
            cameraActive ? 'bg-black/60 hover:bg-gray-800 text-white backdrop-blur-md border border-gray-600' : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {!isSystemHardwareEnabled ? (
            <><AlertOctagon size={24} className="shrink-0 group-hover:mr-3 transition-all" /><span className="opacity-0 group-hover:opacity-100 whitespace-nowrap transition-all duration-300">Hardware Locked</span></>
          ) : cameraActive ? (
            <><CameraOff size={24} className="shrink-0 text-red-400 group-hover:mr-3 transition-all" /><span className="opacity-0 group-hover:opacity-100 whitespace-nowrap transition-all duration-300">Matikan</span></>
          ) : (
            <><Camera size={24} className="shrink-0 group-hover:mr-3 transition-all" /><span className="opacity-0 group-hover:opacity-100 whitespace-nowrap transition-all duration-300">Nyalakan</span></>
          )}
        </button>
      </div>

      {/* KANAN: PANEL KONTROL ASLI */}
      <div className="w-full lg:w-[40%] lg:h-full overflow-y-visible lg:overflow-y-auto pr-1 flex flex-col gap-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        
        {/* 1. KENDALI MOTOR */}
        <div className={`p-4 rounded-2xl border shrink-0 ${themeClasses.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-bold uppercase tracking-wider ${themeClasses.text}`}>Kendali Motor</h3>
            <div className="flex items-center space-x-2">
              <button 
                disabled={!isSystemHardwareEnabled}
                onClick={() => {
                  triggerToast('Perintah Homing Dikirim! Mengembalikan CNC ke (0,0,0)', 'INFO');
                  setMotorPos({ x: 0, y: 0, z: 0 });
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ action: "HOMING" }));
                  } else {
                    axios.post('http://localhost:8000/api/hardware/motor/home');
                  }
                }}
                className="px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg flex items-center text-xs font-bold hover:bg-red-500 hover:text-white transition-all disabled:opacity-30 active:scale-95"
              >
                <RotateCcw size={14} className="mr-1" /> TO ZERO
              </button>
              <div className={`flex rounded-lg border p-1 ${isDarkMode ? 'border-gray-700 bg-gray-950' : 'border-gray-300 bg-gray-100'}`}>
                <button onClick={() => setControlMode('dpad')} className={`p-1.5 rounded-md ${controlMode === 'dpad' ? 'bg-blue-500 text-white' : themeClasses.textMuted}`}><MousePointerSquareDashed size={16} /></button>
                <button onClick={() => setControlMode('joystick')} className={`p-1.5 rounded-md ${controlMode === 'joystick' ? 'bg-blue-500 text-white' : themeClasses.textMuted}`}><Gamepad2 size={16} /></button>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1 relative">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-bold ${themeClasses.textMuted}`}>MEJA (X/Y)</span>
                <div className="flex items-center">
                  <input
                    type="number"
                    readOnly={globalVirtualKeyboard}
                    value={xyStepValue}
                    onChange={(e) => setXyStepValue(e.target.value)}
                    onClick={() => triggerKeypad('Step X/Y', xyStepValue, setXyStepValue)}
                    className={`w-12 h-6 px-1 text-center rounded-l border text-xs font-bold shadow-inner outline-none ${themeClasses.input}`}
                  />
                  <select value={xyStepUnit} onChange={(e) => setXyStepUnit(e.target.value as 'mm' | 'inch')} className={`h-6 px-1 rounded-r border-y border-r text-[10px] font-bold cursor-pointer outline-none ${themeClasses.input}`}>
                    <option value="mm">mm</option><option value="inch">in</option>
                  </select>
                </div>
              </div>
              
              {controlMode === 'dpad' ? (
                <div className="grid grid-cols-3 gap-1 aspect-square">
                  <div />
                  <button onClick={() => sendMotorCommand('Y', '+')} disabled={!isSystemHardwareEnabled} className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed ${themeClasses.btnTouch}`}><ArrowUp size={24}/></button>
                  <div />
                  <button onClick={() => sendMotorCommand('X', '-')} disabled={!isSystemHardwareEnabled} className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed ${themeClasses.btnTouch}`}><ArrowLeft size={24}/></button>
                  <button onClick={() => axios.post('http://localhost:8000/api/hardware/motor/unlock')} title="Unlock GRBL" className="rounded-full border-2 border-blue-500/50 bg-blue-500/10 text-blue-500 flex items-center justify-center active:scale-95 cursor-pointer"><Crosshair size={20}/></button>
                  <button onClick={() => sendMotorCommand('X', '+')} disabled={!isSystemHardwareEnabled} className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed ${themeClasses.btnTouch}`}><ArrowRight size={24}/></button>
                  <div />
                  <button onClick={() => sendMotorCommand('Y', '-')} disabled={!isSystemHardwareEnabled} className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed ${themeClasses.btnTouch}`}><ArrowDown size={24}/></button>
                  <div />
                </div>
              ) : (
                <div
                  className={`w-full aspect-square rounded-full border-4 flex flex-col items-center justify-center relative touch-none select-none transition-all ${isSystemHardwareEnabled ? 'border-gray-600/30 bg-black/20 hover:border-blue-500/50 cursor-grab active:cursor-grabbing shadow-inner' : 'border-red-900/30 bg-red-950/20 opacity-50 cursor-not-allowed'}`}
                  onPointerDown={(e) => {
                    if (!isSystemHardwareEnabled) return;
                    joystickActiveRef.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!joystickActiveRef.current) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
                    const y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
                    const nextVector = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
                    joystickVectorRef.current = nextVector;
                    setJoystickVector(nextVector);
                  }}
                  onPointerUp={async (e) => {
                    if (!joystickActiveRef.current) return;
                    joystickActiveRef.current = false;
                    e.currentTarget.releasePointerCapture(e.pointerId);

                    const { x, y } = joystickVectorRef.current;
                    const threshold = 0.28;
                    const absX = Math.abs(x);
                    const absY = Math.abs(y);

                    if (absX > threshold || absY > threshold) {
                      if (absX >= absY) {
                        await sendMotorCommand('X', x >= 0 ? '+' : '-');
                      } else {
                        await sendMotorCommand('Y', y <= 0 ? '+' : '-');
                      }
                    }

                    joystickVectorRef.current = { x: 0, y: 0 };
                    setJoystickVector({ x: 0, y: 0 });
                  }}
                >
                  <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg transition-transform" style={{ transform: `translate(${joystickVector.x * 32}px, ${joystickVector.y * 32}px)` }}>
                    <Move size={24} />
                  </div>
                  
                  <div className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 text-xs font-bold ${isSystemHardwareEnabled ? (joystickActiveRef.current ? 'text-blue-400' : themeClasses.textMuted) : 'text-red-400'}`}>
                      {isSystemHardwareEnabled 
                        ? (joystickActiveRef.current ? t.cameraMoving : t.dragToMove)
                        : t.panTiltLocked}
                  </div>
                </div>
              )}
            </div>

            <div className="w-28 sm:w-32 flex flex-col shrink-0">
              <div className="flex flex-col mb-2">
                <span className={`text-[10px] font-bold mb-1 truncate ${themeClasses.textMuted}`}>FOKUS (Z)</span>
                <div className="flex items-center">
                  <input
                    type="number"
                    readOnly={globalVirtualKeyboard}
                    value={zStepValue}
                    onChange={(e) => setZStepValue(e.target.value)}
                    onClick={() => triggerKeypad('Step Z (Pulse)', zStepValue, setZStepValue)}
                    className={`w-full min-w-0 h-6 px-1.5 text-center rounded-l border text-xs font-bold shadow-inner outline-none ${themeClasses.input}`}
                  />
                  <span className={`h-6 px-2 flex items-center justify-center rounded-r border-y border-r text-[10px] font-bold shrink-0 ${isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-gray-200 border-gray-300 text-gray-700'}`}>stp</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <button onClick={() => sendMotorCommand('Z', '+')} disabled={!isSystemHardwareEnabled} className={`flex-1 rounded-xl border flex flex-col items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed ${themeClasses.btnTouch}`}><ArrowUp size={24} className="text-blue-500"/><span className="text-[10px] font-bold mt-1">NAIK</span></button>
                <button onClick={() => sendMotorCommand('Z', '-')} disabled={!isSystemHardwareEnabled} className={`flex-1 rounded-xl border flex flex-col items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed ${themeClasses.btnTouch}`}><ArrowDown size={24} className="text-blue-500"/><span className="text-[10px] font-bold mt-1">TURUN</span></button>
              </div>
            </div>
          </div>
        </div>

        {/* 2. PENGATURAN KAMERA (IMX477) */}
        <div className={`p-4 rounded-2xl border shrink-0 ${themeClasses.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center ${themeClasses.text}`}>
              <Aperture size={16} className="mr-2 text-purple-400" /> {t.cameraParams}
            </h3>
            <div className="flex space-x-2">
              <button onClick={handleDefaultCamera} className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1.5 rounded-lg text-[10px] font-bold shadow-sm active:scale-95 transition-colors">{t.default}</button>
              <button onClick={handleApplyCameraSettings} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg flex items-center text-[10px] font-bold shadow-sm active:scale-95 transition-colors"><Save size={14} className="mr-1" /> {t.apply}</button>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Target FPS <span className="text-[9px]">(1-60)</span></span>
              <input
                type="number"
                readOnly={globalVirtualKeyboard}
                value={targetFps}
                onChange={(e) => {
                  setTargetFps(e.target.value);
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ action: "SET_FPS", fps: parseInt(e.target.value) || 30 }));
                  }
                }}
                onClick={() => triggerKeypad('Target FPS', targetFps, setTargetFps)}
                className={`w-20 h-8 px-2 text-right rounded-lg border font-mono font-bold outline-none ${themeClasses.input}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Shutter Speed <span className="text-[9px]">(µs)</span></span>
              <input
                type="number"
                readOnly={globalVirtualKeyboard}
                value={shutterSpeed}
                onChange={(e) => setShutterSpeed(e.target.value)}
                onClick={() => triggerKeypad('Shutter (µs)', shutterSpeed, setShutterSpeed)}
                className={`w-20 h-8 px-2 text-right rounded-lg border font-mono font-bold outline-none ${themeClasses.input}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Sensor Gain <span className="text-[9px]">(ISO)</span></span>
              <input
                type="number"
                readOnly={globalVirtualKeyboard}
                value={iso}
                onChange={(e) => setIso(e.target.value)}
                onClick={() => triggerKeypad('ISO', iso, setIso)}
                className={`w-20 h-8 px-2 text-right rounded-lg border font-mono font-bold outline-none ${themeClasses.input}`}
              />
            </div>
          </div>
        </div>

        {/* 3. PARAMETER CNC */}
        <div className={`p-4 rounded-2xl border shrink-0 ${themeClasses.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-bold uppercase tracking-wider ${themeClasses.text}`}>{t.cncParams}</h3>
            <div className="flex space-x-2">
              <button onClick={handleDefaultParams} className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1.5 rounded-lg text-[10px] font-bold shadow-sm active:scale-95 transition-colors">{t.default}</button>
              <button 
                onClick={sendCncSettings}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center text-[10px] font-bold shadow-sm active:scale-95 transition-colors"
              >
                <Save size={14} className="mr-1" /> {t.apply}
              </button>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Motor Speed / Feed <span className="text-[9px]">(mm/min)</span></span>
              <input
                type="number"
                readOnly={globalVirtualKeyboard}
                value={feedRate}
                onChange={(e) => setFeedRate(e.target.value)}
                onClick={() => triggerKeypad('Feed Rate', feedRate, setFeedRate)}
                className={`w-16 h-8 px-2 text-right rounded-lg border font-mono font-bold outline-none ${themeClasses.input}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Backlash Y <span className="text-[9px]">(mm)</span></span>
              <input
                type="number"
                readOnly={globalVirtualKeyboard}
                value={backlash}
                onChange={(e) => setBacklash(e.target.value)}
                onClick={() => triggerKeypad('Backlash Y', backlash, setBacklash)}
                className={`w-16 h-8 px-2 text-right rounded-lg border font-mono font-bold outline-none ${themeClasses.input}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Acceleration <span className="text-[9px]">(mm/s²)</span></span>
              <input
                type="number"
                readOnly={globalVirtualKeyboard}
                value={acceleration}
                onChange={(e) => setAcceleration(e.target.value)}
                onClick={() => triggerKeypad('Acceleration', acceleration, setAcceleration)}
                className={`w-16 h-8 px-2 text-right rounded-lg border font-mono font-bold outline-none ${themeClasses.input}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Settle Time <span className="text-[9px]">(ms)</span></span>
              <input
                type="number"
                readOnly={globalVirtualKeyboard}
                value={settleTime}
                onChange={(e) => setSettleTime(e.target.value)}
                onClick={() => triggerKeypad('Cam Delay (ms)', settleTime, setSettleTime)}
                className={`w-16 h-8 px-2 text-right rounded-lg border font-mono font-bold outline-none ${themeClasses.input}`}
              />
            </div>
          </div>
        </div>

        {/* 4. STATUS HARDWARE BAR */}
        <div className={`p-4 rounded-2xl border shrink-0 mb-4 ${themeClasses.panel}`}>
           <div className="flex items-center justify-between mb-3">
             <h3 className={`text-sm font-bold uppercase tracking-wider ${themeClasses.text}`}>{t.systemStatus}</h3>
             <button onClick={() => setShowFpsGraph(!showFpsGraph)} className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center shadow-sm active:scale-95 transition-colors ${showFpsGraph ? 'bg-blue-600 text-white' : 'bg-gray-600 hover:bg-gray-700 text-white'}`}>
               <Activity size={12} className="mr-1" /> FPS GRAPH
             </button>
           </div>
           
           <div className="grid grid-cols-2 gap-3 mb-3">
             <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center mb-1"><Thermometer size={14} className="text-orange-400 mr-2"/><span className={`text-[10px] font-bold uppercase ${themeClasses.textMuted}`}>CPU Temp</span></div>
               <div className={`text-sm font-bold font-mono ${jetsonTemperatures.cpu && jetsonTemperatures.cpu > 75 ? 'text-red-500' : themeClasses.text}`}>{jetsonTemperatures.cpu !== null ? `${jetsonTemperatures.cpu.toFixed(1)}°C` : 'N/A'}</div>
             </div>
             <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center mb-1"><Thermometer size={14} className="text-orange-400 mr-2"/><span className={`text-[10px] font-bold uppercase ${themeClasses.textMuted}`}>GPU Temp</span></div>
               <div className={`text-sm font-bold font-mono ${jetsonTemperatures.gpu && jetsonTemperatures.gpu > 75 ? 'text-red-500' : themeClasses.text}`}>{jetsonTemperatures.gpu !== null ? `${jetsonTemperatures.gpu.toFixed(1)}°C` : 'N/A'}</div>
             </div>
             <div className={`col-span-2 p-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center mb-1"><Settings size={14} className="text-green-500 mr-2"/><span className={`text-[10px] font-bold uppercase ${themeClasses.textMuted}`}>Limit Switch</span></div>
               <div className={`text-sm font-bold font-mono ${limitSwitchState !== 'N/A' ? 'text-green-500' : themeClasses.textMuted}`}>{limitSwitchState}</div>
             </div>
           </div>

           {/* FPS GRAPH AREA */}
           {showFpsGraph && (
             <div className={`p-3 rounded-xl border flex flex-col h-24 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
               <div className="flex justify-between items-center mb-2">
                 <span className={`text-[10px] font-bold uppercase ${themeClasses.textMuted}`}>Network Stream FPS</span>
                 <span className="text-xs font-mono font-bold text-blue-500">{targetFps} FPS</span>
               </div>
               <svg viewBox="0 0 100 40" className="w-full h-full text-blue-500 overflow-visible" preserveAspectRatio="none">
                 <polyline
                   fill="none"
                   stroke="currentColor"
                   strokeWidth="2"
                   points="0,30 5,25 10,28 15,10 20,15 25,20 30,12 35,5 40,10 45,20 50,15 55,25 60,30 65,35 70,25 75,20 80,10 85,15 90,5 95,10 100,5"
                 />
                 <polyline
                   fill="url(#fpsGradient)"
                   stroke="none"
                   points="0,40 0,30 5,25 10,28 15,10 20,15 25,20 30,12 35,5 40,10 45,20 50,15 55,25 60,30 65,35 70,25 75,20 80,10 85,15 90,5 95,10 100,5 100,40"
                 />
                 <defs>
                   <linearGradient id="fpsGradient" x1="0" x2="0" y1="0" y2="1">
                     <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
                     <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                   </linearGradient>
                 </defs>
               </svg>
             </div>
           )}

           <div className={`col-span-2 p-3 rounded-xl border flex justify-between items-center ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
              <div className="flex items-center">
                <Activity size={14} className="text-blue-400 mr-2"/>
                <span className={`text-[10px] font-bold uppercase ${themeClasses.textMuted}`}>Status GRBL ({lastEchoGCode})</span>
              </div>
              <div className="px-3 py-1 bg-blue-500/20 text-blue-500 rounded-lg text-[10px] font-bold uppercase">{grblStatus}</div>
           </div>
        </div>

      </div>
    </div>
  );
}