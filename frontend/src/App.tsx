import { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Activity, Server, MapPin, Calendar, Clock, X, Delete, User, Keyboard, ToggleLeft, ToggleRight, Camera, Database, Grid3X3, Scan, FileText, ShieldAlert, LogOut, Globe } from 'lucide-react';
import LiveStreamTab from './components/LiveStreamTab';
import DatabaseTab from './components/DatabaseTab';
import ImageGatheringTab from './components/ImageGatheringTab';
import ImageAnalysisTab from './components/ImageAnalysisTab';
import DocumentationTab from './components/DocumentationTab';
import AdminControlTab from './components/AdminControlTab'; 
import AuthPage from './components/AuthPage';
import logoUndip from './assets/logo-undip.png';
import logoBrin from './assets/logo-brin.png';
import axios from 'axios';
import type { Language } from './i18n';

type TabName = 'Live Stream' | 'Database' | 'Image Gathering' | 'Image Analysis' | 'Documentation' | 'Admin Control';
export type UserRole = 'ADMIN' | 'OPERATOR';

export interface KeypadConfig {
  visible: boolean;
  title: string;
  value: string;
  onUpdate: (val: string) => void;
}

interface DatasetFolder {
  id: string;
  name: string;
  object_type: string;
  date: string;
  operator: string;
  image_count: number;
}

export default function App() {
  const [folders, setFolders] = useState<DatasetFolder[]>([]);
  
  // === GLOBAL HARDWARE STREAM PIPELINE ===
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [grblStatus, setGrblStatus] = useState<string>("OFFLINE");
  const [lastEchoGCode, setLastEchoGCode] = useState<string>("N/A");
  const [jetsonTemperature, setJetsonTemperature] = useState<number | null>(null);
  const [limitSwitchState, setLimitSwitchState] = useState<string>("N/A");
  const [jetsonRam, setJetsonRam] = useState<string>("5.12/7.62 GB");
  const [jetsonRom, setJetsonRom] = useState<string>("2.10/50.00 GB");
  const wsRef = useRef<WebSocket | null>(null);
  const cameraActiveRef = useRef<boolean>(cameraActive);

  useEffect(() => {
    cameraActiveRef.current = cameraActive;
  }, [cameraActive]);

  const fetchFolders = async () => {
    try {
      const response = await axios.get<DatasetFolder[]>('http://localhost:8000/api/dataset/folders');
      setFolders(response.data);
    } catch (error) {
      console.error("Gagal memuat database folder di App.tsx:", error);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    let delayFetch: number;

    if (token) {
      delayFetch = setTimeout(() => {
        fetchFolders();
      }, 0);
    }
    return () => { if (delayFetch) clearTimeout(delayFetch); };
  }, []);
  
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('username'));
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>(() => (localStorage.getItem('role') as UserRole) || 'OPERATOR');
  const [activeTab, setActiveTabState] = useState<TabName>(() => {
    const savedTab = localStorage.getItem('activeTab') as TabName | null;
    if (savedTab) return savedTab;
    const savedRole = localStorage.getItem('role') as UserRole | null;
    return savedRole === 'ADMIN' ? 'Admin Control' : 'Live Stream';
  });

  const setActiveTab = (tab: TabName) => {
    setActiveTabState(tab);
    localStorage.setItem('activeTab', tab);
    if (['Database', 'Image Analysis', 'Documentation', 'Live Stream'].includes(tab)) {
      fetchFolders();
    }
  };

  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language') as Language | null;
    return saved || 'ID';
  });
  const [targetAnalysisImage, setTargetAnalysisImage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isSystemHardwareEnabled, setIsSystemHardwareEnabled] = useState<boolean>(true); 
  const [useVirtualKeyboard, setUseVirtualKeyboard] = useState<boolean>(() => {
    const savedKB = localStorage.getItem('useVirtualKeyboard');
    return savedKB !== null ? savedKB === 'true' : true;
  });

  const [keypad, setKeypad] = useState<KeypadConfig>({
    visible: false,
    title: '',
    value: '',
    onUpdate: () => { },
  });

  const [keypadPos, setKeypadPos] = useState({ x: 300, y: 150 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragRel, setDragRel] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ====================================================================
  // 🟢 PIPELINE WEBSOCKET GLOBAL LEVEL APP (TERINTEGRASI REDIS BROKER)
  // ====================================================================
  useEffect(() => {
    if (!isSystemHardwareEnabled) {
      return;
    }

    console.log('[GLOBAL WEBSOCKET] Menginisialisasi sirkuit pusat lewat Redis Client...');
    
    // Menghubungkan ke rute broker khusus klien agar tidak memblokir websocket utama milik Jetson
    const ws = new WebSocket('ws://127.0.0.1:8000/api/hardware/client/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[GLOBAL WEBSOCKET] Tersambung penuh ke makelar data VPS. Pipa siaran aktif.');

      if (cameraActiveRef.current && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'START_STREAM' }));
      }
    };

    ws.onmessage = async (event) => {
      try {
        // Seluruh payload biner dan telemetri dibungkus dalam format tekstual JSON via Redis Pub/Sub
        const res = JSON.parse(event.data);
        
        // CASE 1: Tangkap Gambar Live Stream Base64 dari Jetson
        if (res.event === 'STREAM_DATA') {
          setVideoSrc(res.image);
        }
        
        // CASE 2: Sinkronkan penangkap data koordinat aktual & status GRBL mesin asli
        else if (res.event === 'TELEMETRY_DATA') {
          setGrblStatus(res.status);
          setJetsonTemperature(typeof res.jetson_temp_c === 'number' ? res.jetson_temp_c : null);
          setLimitSwitchState(res.limit_switch ?? 'N/A');
          if (res.ram_usage) setJetsonRam(res.ram_usage);
          if (res.rom_usage) setJetsonRom(res.rom_usage);
          if (res.position) {
            setLastEchoGCode(`X:${res.position.X.toFixed(2)} Y:${res.position.Y.toFixed(2)} Z:${res.position.Z}`);
          }
        }
      } catch (err) {
        console.error("Gagal memproses pesan WebSocket:", err);
        // Mencegah crash fatal jika menerima format non-JSON di sirkuit luar
      }
    };

    ws.onclose = (event) => {
      console.log(`[GLOBAL WEBSOCKET] Putus sirkuit broker (Code: ${event.code}). Memicu siaga.`);
      if (wsRef.current === ws) {
        wsRef.current = null;
        setVideoSrc(null);
        setGrblStatus('OFFLINE');
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
        setVideoSrc(null);
        setGrblStatus('OFFLINE');
      }
    };
  }, [isSystemHardwareEnabled]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (cameraActive) {
        wsRef.current.send(JSON.stringify({ action: 'START_STREAM' }));
      } else {
        wsRef.current.send(JSON.stringify({ action: 'STOP_STREAM' }));
        setVideoSrc(null);
      }
    }
  }, [cameraActive]);

  const formatDate = (date: Date) => date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const formatTime = (date: Date) => date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragRel({ x: e.clientX - keypadPos.x, y: e.clientY - keypadPos.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setKeypadPos({ x: e.clientX - dragRel.x, y: e.clientY - dragRel.y });
  };
  
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleKeypadPress = (num: string) => setKeypad({ ...keypad, value: keypad.value + num });
  const handleKeypadDel = () => setKeypad({ ...keypad, value: keypad.value.slice(0, -1) });
  const handleKeypadClear = () => setKeypad({ ...keypad, value: '' });
  const handleKeypadEnter = () => {
    keypad.onUpdate(keypad.value || '0'); 
    setKeypad({ ...keypad, visible: false });
  };

  const handleOpenKeypadGlobal = (config: KeypadConfig) => {
    if (!useVirtualKeyboard) return; 
    setKeypad(config);
  };

  const availableTabs: TabName[] = currentUserRole === 'ADMIN' 
    ? ['Live Stream', 'Database', 'Image Gathering', 'Image Analysis', 'Documentation', 'Admin Control']
    : ['Live Stream', 'Database', 'Image Gathering', 'Image Analysis', 'Documentation'];
  
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'SUCCESS' | 'ERROR' | 'INFO' }>({
    visible: false,
    message: '',
    type: 'SUCCESS'
  });

  const showNotification = (message: string, type: 'SUCCESS' | 'ERROR' | 'INFO' = 'SUCCESS') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  if (!currentUser) {
    return (
      <AuthPage 
        isDarkMode={isDarkMode} 
        onLoginSuccess={(username, role) => {
          setCurrentUser(username);
          setCurrentUserRole(role);
          if (role === 'ADMIN') setActiveTab('Admin Control');
        }}
        globalVirtualKeyboard={useVirtualKeyboard}
        setGlobalVirtualKeyboard={setUseVirtualKeyboard}
      />
    );
  }

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col font-sans transition-colors duration-300 ${isDarkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>

      {/* HEADER UTAMA */}
      <header className={`px-4 py-2 flex items-center justify-between border-b shrink-0 gap-4 ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center space-x-3 shrink-0">
          <div className="flex items-center gap-2 shrink-0 bg-white/5 p-1 rounded-xl border border-gray-700/30">
            <img src={logoBrin} alt="BRIN Logo" className="h-6 w-auto object-contain bg-white rounded-md p-0.5" />
            <div className="w-px h-5 bg-gray-700 mx-0.5"></div>
            <img src={logoUndip} alt="UNDIP Logo" className="h-6 w-auto object-contain" />
          </div>
          <div className={`flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
            !isSystemHardwareEnabled 
              ? 'bg-red-500/10 border border-red-500/20 text-red-500' 
              : grblStatus === 'OFFLINE'
                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500'
                : 'bg-green-500/10 border border-green-500/20 text-green-500'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
              !isSystemHardwareEnabled 
                ? 'bg-red-500' 
                : grblStatus === 'OFFLINE'
                  ? 'bg-amber-500'
                  : 'bg-green-500 animate-pulse'
            }`}></div>
            {!isSystemHardwareEnabled 
              ? 'MACHINE LOCKED' 
              : grblStatus === 'OFFLINE'
                ? 'DISCONNECTED'
                : 'CONNECTED'}
          </div>
        </div>

        <div className="flex-1 text-center min-w-0">
          <h1 className="text-sm sm:text-base font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 truncate tracking-wider uppercase">
            Digital Microscopy {currentUserRole === 'ADMIN' && <span className="text-red-500 text-xs font-black ml-1">[ADMIN]</span>}
          </h1>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button 
            onClick={() => {
              const nextState = !useVirtualKeyboard;
              setUseVirtualKeyboard(nextState);
              localStorage.setItem('useVirtualKeyboard', String(nextState));
            }}
            className={`p-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 transition-all ${
              isDarkMode ? 'bg-gray-950 border-gray-800' : 'bg-gray-100 border-gray-300'
            } ${useVirtualKeyboard ? 'text-blue-400 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.15)]' : 'text-gray-400'}`}
          >
            <Keyboard size={14} className={useVirtualKeyboard ? 'text-blue-400' : 'text-gray-400'} />
            <span className="hidden sm:inline">Screen KB</span>
            {useVirtualKeyboard ? <ToggleRight size={16} className="text-blue-500" /> : <ToggleLeft size={16} className="text-gray-500" />}
          </button>

          <span className={`text-[11px] font-bold px-2.5 py-1.5 bg-black/20 rounded-xl border flex items-center gap-1.5 shadow-inner ${currentUserRole === 'ADMIN' ? 'border-red-500/30 text-red-400' : 'border-gray-700/60 text-blue-400'}`}>
            <User size={13} />
            <span className="text-gray-400 hidden xs:inline">User:</span>
            <span className="max-w-[80px] truncate">{currentUser}</span>
          </span>

          <button 
            onClick={() => {
              const nextLang: Language = language === 'ID' ? 'EN' : 'ID';
              setLanguage(nextLang);
              localStorage.setItem('language', nextLang);
            }}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
              isDarkMode ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700' : 'bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200'
            }`}
            title="Switch Language / Ganti Bahasa"
          >
            <span className="text-sm leading-none"><Globe size={14} /></span>
            <span>{language}</span>
          </button>

          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'}`}>
            {isDarkMode ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-slate-600" />}
          </button>

          <button 
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('role');
              localStorage.removeItem('username');
              setCurrentUser(null); 
              setActiveTab('Live Stream'); 
              setCameraActive(false);
            }} 
            className="p-2 bg-red-600/10 border border-red-500/30 text-red-500 hover:bg-red-600 hover:text-white rounded-lg transition-all active:scale-95 shadow-md"
            title="Keluar dari Instrumen"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* STATUS BAR MONITORS */}
      <div className={`px-4 py-2 flex items-center justify-between text-[11px] font-bold border-b shrink-0 ${isDarkMode ? 'bg-gray-900/50 border-gray-800 text-gray-400' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
        <div className="flex items-center space-x-6">
          <span className="flex items-center"><Server size={12} className="mr-1.5 text-blue-500" /> Jetson Orin Nano</span>
          <span className={`flex items-center ${isSystemHardwareEnabled ? 'text-yellow-500' : 'text-red-500'}`}><Activity size={12} className="mr-1.5" /> {isSystemHardwareEnabled ? grblStatus : 'Locked by Admin'}</span>
          <span>RAM: {jetsonRam}</span>
          <span>ROM: {jetsonRom}</span>
        </div>
        <div className="flex items-center space-x-6">
          <span className="flex items-center"><Calendar size={12} className="mr-1.5" /> {formatDate(currentTime)}</span>
          <span className="flex items-center"><Clock size={12} className="mr-1.5" /> {formatTime(currentTime)}</span>
          <span className="flex items-center text-red-500"><MapPin size={12} className="mr-1.5" /> Semarang</span>
        </div>
      </div>

      {/* NAVIGATION BAR */}
      <nav className={`px-2 pt-2 flex space-x-1 border-b shrink-0 ${isDarkMode ? 'border-gray-800 bg-gray-900/80' : 'border-gray-200 bg-white'}`}>
        {availableTabs.map((tab) => {
          const getTabIcon = () => {
            switch (tab) {
              case 'Live Stream': return <Camera size={14} />;
              case 'Database': return <Database size={14} />;
              case 'Image Gathering': return <Grid3X3 size={14} />;
              case 'Image Analysis': return <Scan size={14} />;
              case 'Documentation': return <FileText size={14} />;
              case 'Admin Control': return <ShieldAlert size={14} className="text-red-500" />;
            }
          };

          return (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                activeTab === tab 
                  ? (isDarkMode ? 'bg-gray-800 text-blue-400 border-blue-500' : 'bg-gray-100 text-blue-600 border-blue-600')
                  : (isDarkMode ? 'text-gray-500 hover:bg-gray-800/50 border-transparent' : 'text-gray-500 hover:bg-gray-100 border-transparent')
              }`}
            >
              <span className={activeTab === tab ? (isDarkMode ? 'text-blue-400' : 'text-blue-600') : 'text-gray-500'}>
                {getTabIcon()}
              </span>
              <span>{tab}</span>
            </button>
          );
        })}
      </nav>

      {/* APPLICATION CONTENT CONTAINER */}
      <main className="flex-1 min-h-0 p-3 relative">
        {activeTab === 'Live Stream' && (
          <LiveStreamTab 
            isDarkMode={isDarkMode} 
            openKeypad={handleOpenKeypadGlobal} 
            globalVirtualKeyboard={useVirtualKeyboard} 
            isSystemHardwareEnabled={isSystemHardwareEnabled}
            cameraActive={cameraActive}
            setCameraActive={setCameraActive}
            videoSrc={videoSrc}
            grblStatus={grblStatus}
            setGrblStatus={setGrblStatus}
            lastEchoGCode={lastEchoGCode}
            setLastEchoGCode={setLastEchoGCode}
            jetsonTemperatures={{ cpu: jetsonTemperature, gpu: jetsonTemperature }}
            limitSwitchState={limitSwitchState}
            wsRef={wsRef}
            triggerToast={showNotification}
            availableFolders={folders}
            onRefreshFolders={fetchFolders}
            language={language}
          />
        )}
        {activeTab === 'Database' && (
          <DatabaseTab 
            isDarkMode={isDarkMode} 
            globalVirtualKeyboard={useVirtualKeyboard} 
            triggerToast={showNotification}
            availableFolders={folders}
            onRefreshFolders={fetchFolders}
            language={language}
          />
        )}
        {activeTab === 'Image Gathering' && (
          <ImageGatheringTab 
            isDarkMode={isDarkMode} 
            openKeypad={handleOpenKeypadGlobal}
            globalVirtualKeyboard={useVirtualKeyboard}
            videoSrc={videoSrc}
            cameraActive={cameraActive}
            wsRef={wsRef}
            triggerToast={showNotification}
            availableFolders={folders}
            onRefreshFolders={fetchFolders}
            onNavigateToAnalysis={(imageName) => {
              setTargetAnalysisImage(imageName); 
              setActiveTab('Image Analysis'); 
            }}
            language={language}
          />
        )}
        {activeTab === 'Image Analysis' && (
          <ImageAnalysisTab 
            isDarkMode={isDarkMode} 
            targetImage={targetAnalysisImage} 
            globalVirtualKeyboard={useVirtualKeyboard}
            onClearTarget={() => setTargetAnalysisImage(null)}
            availableFolders={folders}
            onRefreshFolders={fetchFolders}
            language={language}
          />
        )}
        {activeTab === 'Documentation' &&
        <DocumentationTab
        isDarkMode={isDarkMode}
        availableFolders={folders}
        language={language}
        />}
        
        {activeTab === 'Admin Control' && currentUserRole === 'ADMIN' && (
          <AdminControlTab 
            isDarkMode={isDarkMode} 
            isSystemHardwareEnabled={isSystemHardwareEnabled} 
            setIsSystemHardwareEnabled={setIsSystemHardwareEnabled}
            language={language}
          />
        )}
      </main>

      {/* GLOBAL VIRTUAL NUMPAD MELAYANG */}
      {keypad.visible && useVirtualKeyboard && (
        <div className={`absolute z-50 rounded-xl shadow-2xl border-2 flex flex-col touch-none ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`} style={{ left: keypadPos.x, top: keypadPos.y, width: '260px' }}>
          <div className={`p-3 border-b flex justify-between items-center cursor-move select-none rounded-t-xl ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-100 border-gray-200 text-black'}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            <span className="text-xs font-bold">{keypad.title}</span>
            <button 
              onPointerDown={(e) => {
                e.stopPropagation();
                setKeypad(prev => ({ ...prev, visible: false }));
              }} 
              className="p-1 hover:bg-red-500 hover:text-white rounded transition-colors text-gray-400"
            >
              <X size={16} />
            </button>
          </div>

          <div className={`p-3 text-right text-xl font-mono font-bold tracking-wider ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{keypad.value || '0'}</div>

          <div className="grid grid-cols-3 gap-1 p-2 bg-black/5 rounded-b-xl">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0'].map((btn) => (
              <button key={btn} onClick={() => handleKeypadPress(btn)} className={`p-3 text-lg font-bold rounded-lg shadow-sm active:scale-95 transition-transform ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-white hover:bg-gray-100 border'}`}>{btn}</button>
            ))}
            <button onClick={handleKeypadDel} className={`p-3 text-lg font-bold rounded-lg shadow-sm active:scale-95 flex items-center justify-center ${isDarkMode ? 'bg-gray-700 text-red-400' : 'bg-gray-200 text-red-600'}`}><Delete size={20} /></button>
            <button onClick={handleKeypadClear} className={`col-span-1 p-3 text-sm font-bold rounded-lg shadow-sm active:scale-95 text-yellow-500 ${isDarkMode ? 'bg-gray-800' : 'bg-white border'}`}>CLR</button>
            <button onClick={handleKeypadEnter} className="col-span-2 p-3 text-sm font-bold rounded-lg shadow-sm active:scale-95 bg-blue-600 text-white">ENTER</button>
          </div>
        </div>
      )}

      {/* GLOBAL TOAST NOTIFICATION */}
      {toast.visible && (
        <div className="fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-2xl border shadow-2xl backdrop-blur-md bg-gray-900/90 border-green-500/30 text-white min-w-[300px]">
          <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-ping"></div>
          </div>
          <div className="flex flex-col flex-1">
            <span className="text-[10px] text-green-400 font-bold uppercase tracking-widest">Status Hubungan Alat</span>
            <span className="text-xs font-bold text-gray-200 mt-0.5">{toast.message}</span>
          </div>
          <button onClick={() => setToast(prev => ({ ...prev, visible: false }))} className="p-1 hover:bg-white/10 rounded-lg text-gray-400 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

    </div>
  );
}