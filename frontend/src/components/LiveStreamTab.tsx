import { useState } from 'react';
import { Camera, CameraOff, Crosshair, Settings, Activity, Thermometer, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Save, Move, Gamepad2, MousePointerSquareDashed, RotateCcw, Aperture } from 'lucide-react';
import type { KeypadConfig } from '../App';

interface LiveStreamTabProps {
  isDarkMode: boolean;
  openKeypad: (config: KeypadConfig) => void;
}

export default function LiveStreamTab({ isDarkMode, openKeypad }: LiveStreamTabProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [controlMode, setControlMode] = useState<'dpad' | 'joystick'>('dpad');
  
  const [xyStepUnit, setXyStepUnit] = useState<'mm' | 'inch'>('mm');
  const [xyStepValue, setXyStepValue] = useState<string>("5");
  const [zStepValue, setZStepValue] = useState<string>("100");

  const [feedRate, setFeedRate] = useState<string>("250");
  const [backlash, setBacklash] = useState<string>("0.05");
  const [acceleration, setAcceleration] = useState<string>("10");
  const [settleTime, setSettleTime] = useState<string>("500");

  // === NEW: Parameter Kamera IMX477 ===
  const [shutterSpeed, setShutterSpeed] = useState<string>("15000"); // dalam micro-seconds
  const [iso, setIso] = useState<string>("200");

  const motorPos = { x: 12.55, y: 8.20, z: 1200 };

  const themeClasses = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    btnTouch: isDarkMode ? 'bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border-gray-600' : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 border-gray-300',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-blue-400' : 'bg-white border-gray-300 text-blue-600',
  };

  const triggerKeypad = (title: string, currentValue: string, setter: (val: string) => void) => {
    openKeypad({
      visible: true,
      title: title,
      value: currentValue,
      onUpdate: setter
    });
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
    <div className="flex gap-3 h-full">
      
      {/* ==================== KIRI: VIDEO & HUD ==================== */}
      <div className={`relative w-[60%] h-full rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 ${cameraActive ? 'border-green-500/50 bg-black' : 'border-dashed ' + themeClasses.panel}`}>
        {cameraActive ? (
          <div className="absolute inset-0 flex items-center justify-center text-green-500/50 font-mono text-lg">[ VIDEO FEED ]</div>
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

        <button onClick={() => setCameraActive(!cameraActive)} className={`absolute bottom-6 right-6 px-6 py-4 rounded-xl text-lg font-bold flex items-center shadow-2xl z-10 ${cameraActive ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
          {cameraActive ? <><CameraOff size={24} className="mr-3" /> Matikan</> : <><Camera size={24} className="mr-3" /> Nyalakan</>}
        </button>
      </div>

      {/* ==================== KANAN: PANEL KONTROL ==================== */}
      <div className="w-[40%] h-full overflow-y-auto pr-1 flex flex-col gap-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>
        
        {/* 1. KENDALI MOTOR */}
        <div className={`p-4 rounded-2xl border shrink-0 ${themeClasses.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-bold uppercase tracking-wider ${themeClasses.text}`}>Kendali Motor</h3>
            <div className="flex items-center space-x-2">
              <button className="px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg flex items-center text-xs font-bold hover:bg-red-500 hover:text-white transition-colors active:scale-95">
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
                  <div onClick={() => triggerKeypad('Step X/Y', xyStepValue, setXyStepValue)} className={`w-12 h-6 flex items-center justify-center rounded-l border text-xs font-bold cursor-pointer shrink-0 ${themeClasses.input}`}>{xyStepValue || '0'}</div>
                  <select value={xyStepUnit} onChange={(e) => setXyStepUnit(e.target.value as 'mm' | 'inch')} className={`h-6 px-1 rounded-r border-y border-r text-[10px] font-bold cursor-pointer outline-none ${themeClasses.input}`}>
                    <option value="mm">mm</option><option value="inch">in</option>
                  </select>
                </div>
              </div>
              
              {controlMode === 'dpad' ? (
                <div className="grid grid-cols-3 gap-2 aspect-square">
                  <div /><button className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 ${themeClasses.btnTouch}`}><ArrowUp size={32}/></button><div />
                  <button className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 ${themeClasses.btnTouch}`}><ArrowLeft size={32}/></button>
                  <button className="rounded-full border-2 border-blue-500/50 bg-blue-500/10 text-blue-500 flex items-center justify-center active:scale-95"><Crosshair size={28}/></button>
                  <button className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 ${themeClasses.btnTouch}`}><ArrowRight size={32}/></button>
                  <div /><button className={`rounded-xl border flex items-center justify-center shadow-sm active:scale-95 ${themeClasses.btnTouch}`}><ArrowDown size={32}/></button><div />
                </div>
              ) : (
                <div className={`aspect-square rounded-full border-4 flex items-center justify-center relative touch-none ${isDarkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white"><Move size={24} /></div>
                </div>
              )}
            </div>

            <div className="w-20 flex flex-col">
              <div className="flex flex-col mb-2">
                <span className={`text-[10px] font-bold mb-1 ${themeClasses.textMuted}`}>FOKUS (Z)</span>
                <div className="flex items-center">
                  <div onClick={() => triggerKeypad('Step Z (Pulse)', zStepValue, setZStepValue)} className={`flex-1 h-6 flex items-center justify-center rounded border text-xs font-bold cursor-pointer shrink-0 ${themeClasses.input}`}>{zStepValue || '0'}</div>
                  <span className={`text-[10px] ml-1 font-bold ${themeClasses.textMuted}`}>stp</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <button className={`flex-1 rounded-xl border flex flex-col items-center justify-center shadow-sm active:scale-95 ${themeClasses.btnTouch}`}><ArrowUp size={24} className="text-blue-500"/><span className="text-[10px] font-bold mt-1">NAIK</span></button>
                <button className={`flex-1 rounded-xl border flex flex-col items-center justify-center shadow-sm active:scale-95 ${themeClasses.btnTouch}`}><ArrowDown size={24} className="text-blue-500"/><span className="text-[10px] font-bold mt-1">TURUN</span></button>
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
              <button className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg flex items-center text-[10px] font-bold shadow-sm active:scale-95 transition-colors"><Save size={14} className="mr-1" /> TERAPAN</button>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Shutter Speed <span className="text-[9px]">(µs)</span></span>
              <div onClick={() => triggerKeypad('Shutter (µs)', shutterSpeed, setShutterSpeed)} className={`w-20 h-8 px-2 flex items-center justify-end rounded-lg border font-mono font-bold cursor-pointer shrink-0 ${themeClasses.input}`}>{shutterSpeed || '0'}</div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Sensor Gain <span className="text-[9px]">(ISO)</span></span>
              <div onClick={() => triggerKeypad('ISO', iso, setIso)} className={`w-20 h-8 px-2 flex items-center justify-end rounded-lg border font-mono font-bold cursor-pointer shrink-0 ${themeClasses.input}`}>{iso || '0'}</div>
            </div>
          </div>
        </div>

        {/* 3. PARAMETER CNC */}
        <div className={`p-4 rounded-2xl border shrink-0 ${themeClasses.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-bold uppercase tracking-wider ${themeClasses.text}`}>Parameter CNC</h3>
            <div className="flex space-x-2">
              <button onClick={handleDefaultParams} className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1.5 rounded-lg text-[10px] font-bold shadow-sm active:scale-95 transition-colors">DEFAULT</button>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center text-[10px] font-bold shadow-sm active:scale-95 transition-colors"><Save size={14} className="mr-1" /> TERAPAN</button>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Feed Rate <span className="text-[9px]">(mm/min)</span></span>
              <div onClick={() => triggerKeypad('Feed Rate', feedRate, setFeedRate)} className={`w-16 h-8 px-2 flex items-center justify-end rounded-lg border font-mono font-bold cursor-pointer shrink-0 ${themeClasses.input}`}>{feedRate || '0'}</div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Backlash Y <span className="text-[9px]">(mm)</span></span>
              <div onClick={() => triggerKeypad('Backlash Y', backlash, setBacklash)} className={`w-16 h-8 px-2 flex items-center justify-end rounded-lg border font-mono font-bold cursor-pointer shrink-0 ${themeClasses.input}`}>{backlash || '0'}</div>
            </div>
             <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Acceleration <span className="text-[9px]">(mm/s²)</span></span>
              <div onClick={() => triggerKeypad('Acceleration', acceleration, setAcceleration)} className={`w-16 h-8 px-2 flex items-center justify-end rounded-lg border font-mono font-bold cursor-pointer shrink-0 ${themeClasses.input}`}>{acceleration || '0'}</div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${themeClasses.textMuted}`}>Settle Time <span className="text-[9px]">(ms)</span></span>
              <div onClick={() => triggerKeypad('Cam Delay (ms)', settleTime, setSettleTime)} className={`w-16 h-8 px-2 flex items-center justify-end rounded-lg border font-mono font-bold cursor-pointer shrink-0 ${themeClasses.input}`}>{settleTime || '0'}</div>
            </div>
          </div>
        </div>

        {/* 4. STATUS HARDWARE */}
        <div className={`p-4 rounded-2xl border shrink-0 mb-4 ${themeClasses.panel}`}>
           <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${themeClasses.text}`}>Status Sistem</h3>
           <div className="grid grid-cols-2 gap-3">
             <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center mb-1"><Thermometer size={14} className="text-orange-400 mr-2"/><span className={`text-[10px] font-bold uppercase ${themeClasses.textMuted}`}>Suhu Jetson</span></div>
                <div className={`text-sm font-bold font-mono ${themeClasses.text}`}>52°C</div>
             </div>
             <div className={`p-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center mb-1"><Settings size={14} className="text-green-500 mr-2"/><span className={`text-[10px] font-bold uppercase ${themeClasses.textMuted}`}>Limit Switch</span></div>
                <div className={`text-sm font-bold font-mono text-green-500`}>Aman</div>
             </div>
             <div className={`col-span-2 p-3 rounded-xl border flex justify-between items-center ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-center">
                  <Activity size={14} className="text-blue-400 mr-2"/>
                  <span className={`text-[10px] font-bold uppercase ${themeClasses.textMuted}`}>Status GRBL</span>
                </div>
                <div className="px-3 py-1 bg-blue-500/20 text-blue-500 rounded-lg text-[10px] font-bold">IDLE</div>
             </div>
           </div>
        </div>

      </div>
    </div>
  );
}