import { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Activity, Server, MapPin, Calendar, Clock, X, Delete, User, Keyboard, ToggleLeft, ToggleRight, Camera, Database, Grid3X3, Scan, FileText, ShieldAlert, LogOut, Globe, Menu, Download, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useGlobalContext } from './context/GlobalContext';
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
import api from './utils/api';
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
  const { isDarkMode, globalVirtualKeyboard, setGlobalVirtualKeyboard, language, setLanguage, isSystemHardwareEnabled, setIsDarkMode, setTargetAnalysisImage } = useGlobalContext();
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

  const [keypad, setKeypad] = useState<KeypadConfig>({
    visible: false,
    title: '',
    value: '',
    onUpdate: () => { },
  });

  const [keypadPos, setKeypadPos] = useState({ x: 300, y: 150 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragRel, setDragRel] = useState({ x: 0, y: 0 });

  // === USER PROFILE STATE ===
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ old: '', new: '', confirm: '' });

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "Konfirmasi password baru tidak cocok!", type: "error" } }));
      return;
    }
    if (passwordForm.new.length < 6) {
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "Password minimal 6 karakter.", type: "warning" } }));
      return;
    }
    
    try {
      const username = localStorage.getItem('username');
      if (!username) throw new Error("Username tidak ditemukan");
      
      await api.put('/api/auth/profile/password', {
        username: username,
        old_password: passwordForm.old,
        new_password: passwordForm.new
      });
      
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: "Password berhasil diubah secara permanen.", type: "success" } }));
      setIsProfileOpen(false);
      setPasswordForm({ old: '', new: '', confirm: '' });
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || "Gagal mengubah password via API.";
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: errorMsg, type: "error" } }));
    }
  };
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  const [globalToast, setGlobalToast] = useState<{message: string, type: string, id: number} | null>(null);

  useEffect(() => {
    const handleToast = (e: any) => {
      setGlobalToast({ message: e.detail.message, type: e.detail.type, id: Date.now() });
      setTimeout(() => setGlobalToast(null), 4000);
    };
    window.addEventListener('show-toast', handleToast);
    return () => window.removeEventListener('show-toast', handleToast);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
    }
  };

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
  const [currentTime, setCurrentTime] = useState(new Date());

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
    if (!globalVirtualKeyboard) return; 
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

  if (!currentUser) {
    return (
      <AuthPage 
        onLoginSuccess={(username, role) => {
          setCurrentUser(username);
          setCurrentUserRole(role);
          if (role === 'ADMIN') setActiveTab('Admin Control');
          else setActiveTab('Live Stream');
        }}
      />
    );
  }

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col font-sans transition-colors duration-300 ${isDarkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>

      {/* HEADER UTAMA */}
      <header className={`px-4 py-2 flex flex-col md:flex-row items-center justify-between border-b shrink-0 gap-3 md:gap-4 ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        
        {/* ROW 1 (Mobile) / CENTER (Desktop) */}
        <div className="flex-1 text-center min-w-0 w-full md:w-auto md:order-2">
          <h1 className="text-sm sm:text-base font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 truncate tracking-wider uppercase">
            Digital Microscopy {currentUserRole === 'ADMIN' && <span className="text-red-500 text-xs font-black ml-1">[ADMIN]</span>}
          </h1>
        </div>

        {/* ROW 2 (Mobile) / LEFT & RIGHT (Desktop) */}
        <div className="flex items-center justify-center flex-wrap gap-2 sm:gap-4 w-full md:w-auto md:contents mt-1 md:mt-0">
          
          <div className="flex items-center space-x-3 shrink-0 md:order-1">
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

          <div className="flex items-center space-x-2 shrink-0 md:order-3">
            <button 
              onClick={() => setIsProfileOpen(true)}
              className={`text-[11px] font-bold px-2.5 py-1.5 bg-black/20 rounded-xl border flex items-center gap-1.5 shadow-inner hover:bg-black/40 transition-colors ${currentUserRole === 'ADMIN' ? 'border-red-500/30 text-red-400 hover:border-red-500/50' : 'border-gray-700/60 text-blue-400 hover:border-blue-500/50'}`}
              title="Profil Akun & Pengaturan"
            >
              <User size={13} />
              <span className="text-gray-400 hidden xs:inline">User:</span>
              <span className="max-w-[80px] truncate">{currentUser}</span>
            </button>

            {/* Desktop Buttons (Hidden on Mobile) */}
            <div className="hidden md:flex items-center space-x-2">
              {deferredPrompt && (
                <button 
                  onClick={handleInstallClick}
                  className="px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all bg-green-600 text-white hover:bg-green-700 border-green-500 shadow-lg shadow-green-500/20 mr-2"
                  title="Install Aplikasi PWA"
                >
                  <Download size={14} />
                  <span>Install App</span>
                </button>
              )}
              <button 
                onClick={() => setGlobalVirtualKeyboard(!globalVirtualKeyboard)}
                className={`p-1.5 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 transition-all ${
                  isDarkMode ? 'bg-gray-950 border-gray-800' : 'bg-gray-100 border-gray-300'
                } ${globalVirtualKeyboard ? 'text-blue-400 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.15)]' : 'text-gray-400'}`}
              >
                <Keyboard size={14} className={globalVirtualKeyboard ? 'text-blue-400' : 'text-gray-400'} />
                <span>Screen KB</span>
                {globalVirtualKeyboard ? <ToggleRight size={16} className="text-blue-500" /> : <ToggleLeft size={16} className="text-gray-500" />}
              </button>

              <button 
                onClick={() => setLanguage(language === 'ID' ? 'EN' : 'ID')}
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

            {/* Mobile Hamburger Button */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`md:hidden p-1.5 rounded-lg border flex items-center justify-center transition-all ${isDarkMode ? 'bg-gray-950 border-gray-800 text-gray-300 hover:text-white' : 'bg-gray-100 border-gray-300 text-gray-700 hover:text-black'}`}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE DROPDOWN MENU */}
      {mobileMenuOpen && (
        <div className={`md:hidden absolute top-[90px] right-4 z-[250] flex flex-col gap-2 p-3 rounded-2xl shadow-2xl border backdrop-blur-md animate-in fade-in slide-in-from-top-2 ${isDarkMode ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-200'}`}>
          {deferredPrompt && (
            <button 
              onClick={() => {
                handleInstallClick();
                setMobileMenuOpen(false);
              }}
              className="px-3 py-2 bg-green-600 border border-green-500 text-white hover:bg-green-700 rounded-xl font-bold transition-all w-full flex items-center gap-2 text-xs mb-1"
            >
              <Download size={14} />
              <span>Install App</span>
            </button>
          )}
          <button 
            onClick={() => {
              setGlobalVirtualKeyboard(!globalVirtualKeyboard);
              setMobileMenuOpen(false);
            }}
            className={`px-3 py-2 rounded-xl border text-[11px] font-bold flex items-center gap-2 transition-all w-full justify-between ${
              isDarkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-100/50 border-gray-300'
            } ${globalVirtualKeyboard ? 'text-blue-400 border-blue-500/50' : 'text-gray-400'}`}
          >
            <div className="flex items-center gap-2">
              <Keyboard size={14} className={globalVirtualKeyboard ? 'text-blue-400' : 'text-gray-400'} />
              <span>Screen KB</span>
            </div>
            {globalVirtualKeyboard ? <ToggleRight size={16} className="text-blue-500" /> : <ToggleLeft size={16} className="text-gray-500" />}
          </button>

          <button 
            onClick={() => {
              setLanguage(language === 'ID' ? 'EN' : 'ID');
              setMobileMenuOpen(false);
            }}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all w-full ${
              isDarkMode ? 'bg-gray-800/50 border-gray-700 text-white' : 'bg-gray-100/50 border-gray-300 text-gray-800'
            }`}
          >
            <Globe size={14} />
            <span>Language: {language}</span>
          </button>

          <button 
            onClick={() => {
              setIsDarkMode(!isDarkMode);
              setMobileMenuOpen(false);
            }} 
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all w-full ${
              isDarkMode ? 'bg-gray-800/50 border-gray-700 text-white' : 'bg-gray-100/50 border-gray-300 text-gray-800'
            }`}
          >
            {isDarkMode ? <Sun size={14} className="text-yellow-400" /> : <Moon size={14} className="text-slate-600" />}
            <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          <button 
            onClick={() => {
              setIsProfileOpen(true);
              setMobileMenuOpen(false);
            }} 
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all w-full ${
              isDarkMode ? 'bg-gray-800/50 border-gray-700 text-white' : 'bg-gray-100/50 border-gray-300 text-gray-800'
            }`}
          >
            <User size={14} className="text-blue-500" />
            <span>Profil Akun</span>
          </button>

          <button 
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('role');
              localStorage.removeItem('username');
              setCurrentUser(null); 
              setActiveTab('Live Stream'); 
              setCameraActive(false);
              setMobileMenuOpen(false);
            }} 
            className="px-3 py-2 bg-red-600/10 border border-red-500/30 text-red-500 hover:bg-red-600 hover:text-white rounded-xl font-bold transition-all w-full flex items-center gap-2 text-xs"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      )}

      {/* STATUS BAR MONITORS */}
      <div className={`px-4 py-2 flex items-center text-[10px] sm:text-[11px] font-bold border-b shrink-0 overflow-x-auto whitespace-nowrap gap-4 sm:justify-between [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${isDarkMode ? 'bg-gray-900/50 border-gray-800 text-gray-400' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          <span className="flex items-center"><Server size={12} className="mr-1.5 text-blue-500" /> Jetson</span>
          <span className={`flex items-center ${isSystemHardwareEnabled ? 'text-yellow-500' : 'text-red-500'}`}><Activity size={12} className="mr-1.5" /> {isSystemHardwareEnabled ? grblStatus : 'Locked'}</span>
          <span>RAM: {jetsonRam}</span>
          <span>ROM: {jetsonRom}</span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          <span className="flex items-center"><Calendar size={12} className="mr-1.5 hidden sm:inline" /> {formatDate(currentTime)}</span>
          <span className="flex items-center"><Clock size={12} className="mr-1.5 hidden sm:inline" /> {formatTime(currentTime)}</span>
          <span className="flex items-center text-red-500"><MapPin size={12} className="mr-1.5 hidden sm:inline" /> Semarang</span>
        </div>
      </div>

      {/* NAVIGATION BAR (HIDDEN ON MOBILE) */}
      <nav className={`hidden md:flex px-2 pt-2 space-x-1 border-b shrink-0 ${isDarkMode ? 'border-gray-800 bg-gray-900/80' : 'border-gray-200 bg-white'}`}>
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
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2.5 ${
                activeTab === tab 
                  ? (isDarkMode ? 'bg-gray-800 text-gray-100 border-blue-500' : 'bg-white text-gray-900 border-blue-600')
                  : (isDarkMode ? 'text-gray-500 hover:bg-gray-800/50 border-transparent' : 'text-gray-500 hover:bg-gray-100 border-transparent')
              }`}
            >
              <span className={`p-1.5 rounded-lg transition-colors ${activeTab === tab ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : (isDarkMode ? 'text-gray-400' : 'text-gray-500')}`}>
                {getTabIcon()}
              </span>
              <span>{tab}</span>
            </button>
          );
        })}
      </nav>

      {/* BOTTOM NAVIGATION BAR (VISIBLE ONLY ON MOBILE) */}
      <nav className={`flex md:hidden fixed bottom-0 left-0 w-full z-50 border-t ${isDarkMode ? 'border-gray-800 bg-gray-900/95 backdrop-blur' : 'border-gray-200 bg-white/95 backdrop-blur'}`}>
        {availableTabs.map((tab) => {
          const getTabIcon = () => {
            switch (tab) {
              case 'Live Stream': return <Camera size={22} />;
              case 'Database': return <Database size={22} />;
              case 'Image Gathering': return <Grid3X3 size={22} />;
              case 'Image Analysis': return <Scan size={22} />;
              case 'Documentation': return <FileText size={22} />;
              case 'Admin Control': return <ShieldAlert size={22} className="text-red-500" />;
            }
          };

          return (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className="flex-1 flex justify-center items-center py-2.5"
            >
              <div className={`flex items-center justify-center px-5 py-1.5 rounded-full transition-all duration-300 ${
                activeTab === tab 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                  : (isDarkMode ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-500')
              }`}>
                {getTabIcon()}
              </div>
            </button>
          );
        })}
      </nav>

      {/* APPLICATION CONTENT CONTAINER */}
      <main className="flex-1 min-h-0 p-3 pb-20 md:pb-3 relative overflow-y-auto">
        {activeTab === 'Live Stream' && (
          <LiveStreamTab 
            openKeypad={handleOpenKeypadGlobal} 
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
            availableFolders={folders}
            onRefreshFolders={fetchFolders}
          />
        )}
        {activeTab === 'Database' && (
          <DatabaseTab
            availableFolders={folders}
            onRefreshFolders={fetchFolders}
          />
        )}
        {activeTab === 'Image Gathering' && (
          <ImageGatheringTab 
            openKeypad={handleOpenKeypadGlobal}
            videoSrc={videoSrc}
            cameraActive={cameraActive}
            wsRef={wsRef}
            availableFolders={folders}
            onRefreshFolders={fetchFolders}
            onNavigateToAnalysis={(imageName) => {
              setTargetAnalysisImage(imageName); 
              setActiveTab('Image Analysis'); 
            }}
          />
        )}
        {activeTab === 'Image Analysis' && (
          <ImageAnalysisTab 
            onClearTarget={() => setTargetAnalysisImage(null)}
            availableFolders={folders}
            onRefreshFolders={fetchFolders}
          />
        )}
        {activeTab === 'Documentation' &&
        <DocumentationTab
        availableFolders={folders}
        />}
        
        {activeTab === 'Admin Control' && currentUserRole === 'ADMIN' && (
          <AdminControlTab />
        )}
      </main>

      {/* GLOBAL VIRTUAL NUMPAD MELAYANG */}
      {keypad.visible && globalVirtualKeyboard && (
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
        <div className="fixed top-4 md:top-auto md:bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-2xl border shadow-2xl backdrop-blur-md bg-gray-900/90 border-green-500/30 text-white w-[90%] md:w-auto min-w-[300px] animate-in fade-in slide-in-from-top-5 md:slide-in-from-bottom-5 duration-300">
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

      {/* NEW SYSTEM TOAST NOTIFICATION UI */}
      {globalToast && (
        <div 
          key={globalToast.id}
          className={`fixed top-[90px] right-4 z-[9999] px-4 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 max-w-[360px] w-max animate-in fade-in slide-in-from-top-4 duration-300 ${
            globalToast.type === 'error' ? (isDarkMode ? 'bg-red-950/90 border-red-900 text-red-200' : 'bg-red-50 border-red-200 text-red-800') :
            globalToast.type === 'success' ? (isDarkMode ? 'bg-green-950/90 border-green-900 text-green-200' : 'bg-green-50 border-green-200 text-green-800') :
            (isDarkMode ? 'bg-blue-950/90 border-blue-900 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-800')
          }`}
        >
          <div className="shrink-0">
            {globalToast.type === 'error' ? <AlertCircle size={20} className="text-red-500" /> :
             globalToast.type === 'success' ? <CheckCircle2 size={20} className="text-green-500" /> :
             <Info size={20} className="text-blue-500" />}
          </div>
          <p className="text-[13px] font-medium leading-tight">{globalToast.message}</p>
          <button onClick={() => setGlobalToast(null)} className="ml-2 p-1 hover:bg-black/10 rounded-full transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* USER PROFILE & PASSWORD RESET MODAL */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm rounded-3xl border shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="p-5 border-b border-gray-800/50 bg-black/10 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${currentUserRole === 'ADMIN' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                  <User size={20} />
                </div>
                <div>
                  <h3 className={`font-black text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Profil Pengguna</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Ganti Password</p>
                </div>
              </div>
              <button onClick={() => setIsProfileOpen(false)} className="p-2 bg-gray-800/30 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handlePasswordSubmit} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex justify-between items-center mb-2">
                <span className="text-[11px] font-bold text-gray-400">Username:</span>
                <span className="text-xs font-black text-blue-400 uppercase">{currentUser} ({currentUserRole})</span>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1.5">Password Saat Ini</label>
                <input 
                  type="password" required 
                  value={passwordForm.old} onChange={e => setPasswordForm({...passwordForm, old: e.target.value})}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs font-bold outline-none transition-colors ${isDarkMode ? 'bg-gray-950 border-gray-800 text-white focus:border-blue-500' : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500'}`} 
                  placeholder="Masukkan password lama"
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1.5">Password Baru</label>
                <input 
                  type="password" required 
                  value={passwordForm.new} onChange={e => setPasswordForm({...passwordForm, new: e.target.value})}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs font-bold outline-none transition-colors ${isDarkMode ? 'bg-gray-950 border-gray-800 text-white focus:border-blue-500' : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500'}`} 
                  placeholder="Minimal 6 karakter"
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1.5">Konfirmasi Password Baru</label>
                <input 
                  type="password" required 
                  value={passwordForm.confirm} onChange={e => setPasswordForm({...passwordForm, confirm: e.target.value})}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs font-bold outline-none transition-colors ${isDarkMode ? 'bg-gray-950 border-gray-800 text-white focus:border-blue-500' : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500'}`} 
                  placeholder="Ketik ulang password baru"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsProfileOpen(false)} className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-gray-800/40 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
                  Batal
                </button>
                <button type="submit" className="flex-[2] py-3 px-4 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20">
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}





