import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Camera, CameraOff, Crosshair, Settings, Activity, Thermometer, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Save, Move, Gamepad2, MousePointerSquareDashed, RotateCcw, Aperture, AlertOctagon } from 'lucide-react';
import type { KeypadConfig } from '../App';

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
  jetsonTemperature: number | null;
  limitSwitchState: string;
  wsRef: React.MutableRefObject<WebSocket | null>;
  triggerToast: (message: string, type?: 'SUCCESS' | 'ERROR' | 'INFO') => void;
}

export default function LiveStreamTab({ 
  isDarkMode, 
  openKeypad, 
  globalVirtualKeyboard, 
  isSystemHardwareEnabled,
  cameraActive,
  setCameraActive,
  videoSrc, // 🟢 GUNTING LOGIKA LOKAL: Gunakan referensi stream langsung dari level pusat App.tsx
  grblStatus,
  setGrblStatus,
  lastEchoGCode,
  setLastEchoGCode,
  jetsonTemperature,
  limitSwitchState,
  wsRef,
  triggerToast
}: LiveStreamTabProps) {
  
  const [controlMode, setControlMode] = useState<'dpad' | 'joystick'>('dpad');
  const joystickVectorRef = useRef({ x: 0, y: 0 });
  const joystickActiveRef = useRef(false);
  const lastMoveDirectionRef = useRef<Record<'X' | 'Y' | 'Z', '+' | '-'> >({ X: '+', Y: '+', Z: '+' });
  
  const [xyStepUnit, setXyStepUnit] = useState<'mm' | 'inch'>('mm');
  const [xyStepValue, setXyStepValue] = useState<string>("5");
  const [zStepValue, setZStepValue] = useState<string>("100");

  const [feedRate, setFeedRate] = useState<string>("250");
  const [backlash, setBacklash] = useState<string>("0.05");
  const [acceleration, setAcceleration] = useState<string>("10");
  const [settleTime, setSettleTime] = useState<string>("500");

  const [shutterSpeed, setShutterSpeed] = useState<string>("15000"); 
  const [iso, setIso] = useState<string>("200");

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

  // ====================================================================
  // 🟢 AMANKAN HANDSHAKE: HANYA BERTUGAS MEMICU TOMBOL START/STOP STREAM
  // ====================================================================
  useEffect(() => {
    // 1. Salin referensi ref ke variabel lokal untuk mengamankan fungsi cleanup linting
    const currentWs = wsRef.current;

    if (cameraActive && currentWs && currentWs.readyState === WebSocket.OPEN) {
      console.log("[REACT TAB] Sirkuit WebSocket aktif. Mengirim sinyal akselerasi optik...");
      currentWs.send(JSON.stringify({ action: "START_STREAM" }));
    }

    // 2. Gunakan setTimeout agar update state motorPos dijadwalkan secara asinkron
    // Langkah ini memecah cascading render berantai yang dilarang linter
    if (lastEchoGCode && lastEchoGCode.startsWith("X:")) {
      const timer = setTimeout(() => {
        try {
          const parts = lastEchoGCode.split(" ");
          const xVal = parseFloat(parts[0].split(":")[1]);
          const yVal = parseFloat(parts[1].split(":")[1]);
          const zVal = parseInt(parts[2].split(":")[1]);
          setMotorPos({ x: xVal, y: yVal, z: zVal });
        } catch (e) {
          console.error("Gagal mem-parsing koordinat motor dari lastEchoGCode:", e);
          // Abaikan format sisa inisial N/A
        }
      }, 0);

      return () => {
        clearTimeout(timer);
        if (currentWs && currentWs.readyState === WebSocket.OPEN) {
          currentWs.send(JSON.stringify({ action: "STOP_STREAM" }));
        }
      };
    }

    return () => {
      if (currentWs && currentWs.readyState === WebSocket.OPEN) {
        currentWs.send(JSON.stringify({ action: "STOP_STREAM" }));
      }
    };
  }, [cameraActive, wsRef, lastEchoGCode]);

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
    <div className="flex gap-3 h-full w-full select-none">
      
      {/* KIRI: VIDEO & HUD LAYER */}
      <div className={`relative w-[60%] h-full rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 ${cameraActive ? 'border-green-500/50 bg-black' : 'border-dashed ' + themeClasses.panel}`}>
        {cameraActive ? (
          /* 🟢 PERBAIKAN SEJATI: Membaca props global 'videoSrc' secara langsung */
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

        {cameraActive && (
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

        <button 
          disabled={!isSystemHardwareEnabled} 
          onClick={() => {
            const nextState = !cameraActive;
            setCameraActive(nextState);
            triggerToast(
              nextState ? 'Sensor Optik IMX477 Berhasil Diaktifkan!' : 'Aliran Kamera Dinonaktifkan.',
              nextState ? 'SUCCESS' : 'INFO'
            );
          }} 
          className={`absolute bottom-6 right-6 px-6 py-4 rounded-xl text-lg font-bold flex items-center shadow-2xl z-10 ${
            !isSystemHardwareEnabled ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50' :
            cameraActive ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {!isSystemHardwareEnabled ? <><AlertOctagon size={24} className="mr-3"/> Hardware Locked</> :
           cameraActive ? <><CameraOff size={24} className="mr-3" /> Matikan</> : <><Camera size={24} className="mr-3" /> Nyalakan</>}
        </button>
      </div>

      {/* KANAN: PANEL KONTROL ASLI */}
      <div className="w-[40%] h-full overflow-y-auto pr-1 flex flex-col gap-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        
        {/* 1. KENDALI MOTOR */}
        <div className={`p-4 rounded-2xl border shrink-0 ${themeClasses.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-bold uppercase tracking-wider ${themeClasses.text}`}>Kendali Motor</h3>
            <div className="flex items-center space-x-2">
              <button 
                disabled={!isSystemHardwareEnabled}
                onClick={() => {
                  triggerToast('Perintah Homing Dikirim! Mengembalikan CNC ke (0,0,0)', 'INFO');
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
            <div className="flex-1">
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
                <div className="grid grid-cols-3 gap-2 aspect-square">
                  <div />
                  <button onClick={() => sendMotorCommand('Y', '+')} disabled={!isSystemHardwareEnabled} className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 ${themeClasses.btnTouch}`}><ArrowUp size={32}/></button>
                  <div />
                  <button onClick={() => sendMotorCommand('X', '-')} disabled={!isSystemHardwareEnabled} className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 ${themeClasses.btnTouch}`}><ArrowLeft size={32}/></button>
                  <button onClick={() => axios.post('http://localhost:8000/api/hardware/motor/unlock')} title="Unlock GRBL" className="rounded-full border-2 border-blue-500/50 bg-blue-500/10 text-blue-500 flex items-center justify-center active:scale-95"><Crosshair size={28}/></button>
                  <button onClick={() => sendMotorCommand('X', '+')} disabled={!isSystemHardwareEnabled} className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 ${themeClasses.btnTouch}`}><ArrowRight size={32}/></button>
                  <div />
                  <button onClick={() => sendMotorCommand('Y', '-')} disabled={!isSystemHardwareEnabled} className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 ${themeClasses.btnTouch}`}><ArrowDown size={32}/></button>
                  <div />
                </div>
              ) : (
                <div
                  className={`aspect-square rounded-full border-4 flex items-center justify-center relative touch-none overflow-hidden ${isDarkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}
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
                </div>
              )}
            </div>

            <div className="w-20 flex flex-col">
              <div className="flex flex-col mb-2">
                <span className={`text-[10px] font-bold mb-1 ${themeClasses.textMuted}`}>FOKUS (Z)</span>
                <div className="flex items-center">
                  <input
                    type="number"
                    readOnly={globalVirtualKeyboard}
                    value={zStepValue}
                    onChange={(e) => setZStepValue(e.target.value)}
                    onClick={() => triggerKeypad('Step Z (Pulse)', zStepValue, setZStepValue)}
                    className={`flex-1 h-6 px-1 text-center rounded border text-xs font-bold shadow-inner outline-none ${themeClasses.input}`}
                  />
                  <span className={`text-[10px] ml-1 font-bold ${themeClasses.textMuted}`}>stp</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <button onClick={() => sendMotorCommand('Z', '+')} disabled={!isSystemHardwareEnabled} className={`flex-1 rounded-xl border flex flex-col items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 ${themeClasses.btnTouch}`}><ArrowUp size={24} className="text-blue-500"/><span className="text-[10px] font-bold mt-1">NAIK</span></button>
                <button onClick={() => sendMotorCommand('Z', '-')} disabled={!isSystemHardwareEnabled} className={`flex-1 rounded-xl border flex flex-col items-center justify-center shadow-sm active:scale-95 disabled:opacity-30 ${themeClasses.btnTouch}`}><ArrowDown size={24} className="text-blue-500"/><span className="text-[10px] font-bold mt-1">TURUN</span></button>
              </div>
            </div>
          </div>
        </div>

        {/* 2. PENGATURAN KAMERA (IMX477) */}
        <div className={`p-4 rounded-2xl border shrink-0 ${themeClasses.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center ${themeClasses.text}`}>
              <Aperture size={16} className="mr-2 text-purple-400" /> Kamera IMX477
            </h3>
            <div className="flex space-x-2">
              <button onClick={handleDefaultCamera} className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1.5 rounded-lg text-[10px] font-bold shadow-sm active:scale-95 transition-colors">DEFAULT</button>
              <button onClick={handleApplyCameraSettings} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg flex items-center text-[10px] font-bold shadow-sm active:scale-95 transition-colors"><Save size={14} className="mr-1" /> TERAPAN</button>
            </div>
          </div>
          
          <div className="space-y-3">
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
            <h3 className={`text-sm font-bold uppercase tracking-wider ${themeClasses.text}`}>Parameter CNC</h3>
            <div className="flex space-x-2">
              <button onClick={handleDefaultParams} className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1.5 rounded-lg text-[10px] font-bold shadow-sm active:scale-95 transition-colors">DEFAULT</button>
              <button 
                onClick={sendCncSettings}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center text-[10px] font-bold shadow-sm active:scale-95 transition-colors"
              >
                <Save size={14} className="mr-1" /> TERAPAN
              </button>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Feed Rate <span className="text-[9px]">(mm/min)</span></span>
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
           <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${themeClasses.text}`}>Status Sistem</h3>
           <div className="grid grid-cols-2 gap-3">
             <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center mb-1"><Thermometer size={14} className="text-orange-400 mr-2"/><span className={`text-[10px] font-bold uppercase ${themeClasses.textMuted}`}>Suhu Jetson</span></div>
               <div className={`text-sm font-bold font-mono ${themeClasses.text}`}>{jetsonTemperature !== null ? `${jetsonTemperature.toFixed(1)}°C` : 'N/A'}</div>
             </div>
             <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center mb-1"><Settings size={14} className="text-green-500 mr-2"/><span className={`text-[10px] font-bold uppercase ${themeClasses.textMuted}`}>Limit Switch</span></div>
               <div className={`text-sm font-bold font-mono ${limitSwitchState !== 'N/A' ? 'text-green-500' : themeClasses.textMuted}`}>{limitSwitchState}</div>
             </div>
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
    </div>
  );
}