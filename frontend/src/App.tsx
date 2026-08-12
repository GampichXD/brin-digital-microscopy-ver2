import { useState, useEffect } from 'react';
import { X, Delete, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useGlobalContext } from './context/GlobalContext';
import { useHardwareSocket } from './hooks/useHardwareSocket';
import api from './utils/api';
import LiveStreamTab from './components/LiveStreamTab';
import DatabaseTab from './components/DatabaseTab';
import ImageGatheringTab from './components/ImageGatheringTab';
import ImageAnalysisTab from './components/ImageAnalysisTab';
import DocumentationTab from './components/DocumentationTab';
import AdminControlTab from './components/AdminControlTab'; 
import AuthPage from './components/AuthPage';

import Header from './components/layout/Header';
import StatusBar from './components/layout/StatusBar';
import NavigationTabs, { type TabName } from './components/layout/NavigationTabs';
import UserProfileModal from './components/profile/UserProfileModal';

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
  const { isDarkMode, globalVirtualKeyboard, isSystemHardwareEnabled, setTargetAnalysisImage, setEdgeTelemetry } = useGlobalContext();
  const [folders, setFolders] = useState<DatasetFolder[]>([]);
  
  // Hardware State
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [grblStatus, setGrblStatus] = useState<string>("OFFLINE");
  const [lastEchoGCode, setLastEchoGCode] = useState<string>("N/A");
  const [jetsonTemperatures, setJetsonTemperatures] = useState<{cpu: number | null, gpu: number | null}>({ cpu: null, gpu: null });
  const [limitSwitchState, setLimitSwitchState] = useState<string>("N/A");
  const [jetsonRam, setJetsonRam] = useState<string>("5.12/7.62 GB");
  const [jetsonRom, setJetsonRom] = useState<string>("2.10/50.00 GB");
  const [streamRole, setStreamRole] = useState<'PILOT' | 'SPECTATOR' | 'QUEUED' | 'DISCONNECTED'>('DISCONNECTED');

  const wsRef = useHardwareSocket({
    isSystemHardwareEnabled,
    cameraActive,
    setVideoSrc,
    setGrblStatus,
    setJetsonTemperatures,
    setLimitSwitchState,
    setJetsonRam,
    setJetsonRom,
    setLastEchoGCode,
    setEdgeTelemetry,
    setStreamRole
  });

  const fetchFolders = async () => {
    try {
      const response = await api.get<DatasetFolder[]>('/api/dataset/folders');
      setFolders(response.data);
    } catch (error) {
      console.error("Gagal memuat database folder di App.tsx:", error);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    let delayFetch: number;
    if (token) {
      delayFetch = window.setTimeout(() => { fetchFolders(); }, 0);
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

  const [isProfileOpen, setIsProfileOpen] = useState(false);
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

  const handleOpenKeypadGlobal = (config: KeypadConfig) => {
    setKeypad(config);
  };
  const handleKeypadPress = (k: string) => setKeypad(prev => ({ ...prev, value: prev.value + k }));
  const handleKeypadDel = () => setKeypad(prev => ({ ...prev, value: prev.value.slice(0, -1) }));
  const handleKeypadClear = () => setKeypad(prev => ({ ...prev, value: '' }));
  const handleKeypadEnter = () => {
    keypad.onUpdate(keypad.value);
    setKeypad(prev => ({ ...prev, visible: false }));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragRel({ x: e.clientX - keypadPos.x, y: e.clientY - keypadPos.y });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setKeypadPos({ x: e.clientX - dragRel.x, y: e.clientY - dragRel.y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    setCurrentUser(null); 
    setActiveTab('Live Stream'); 
    setCameraActive(false);
  };

  const availableTabs: TabName[] = currentUserRole === 'ADMIN' 
    ? ['Live Stream', 'Database', 'Image Gathering', 'Image Analysis', 'Documentation', 'Admin Control']
    : ['Live Stream', 'Database', 'Image Gathering', 'Image Analysis', 'Documentation'];

  const [toast, setToast] = useState({
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
      
      <Header 
        currentUser={currentUser}
        currentUserRole={currentUserRole}
        grblStatus={grblStatus}
        setIsProfileOpen={setIsProfileOpen}
        deferredPrompt={deferredPrompt}
        handleInstallClick={handleInstallClick}
        onLogout={handleLogout}
      />

      <StatusBar 
        grblStatus={grblStatus}
        jetsonRam={jetsonRam}
        jetsonRom={jetsonRom}
      />

      <NavigationTabs 
        availableTabs={availableTabs}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

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
            jetsonTemperatures={jetsonTemperatures}
            limitSwitchState={limitSwitchState}
            wsRef={wsRef}
            availableFolders={folders}
            onRefreshFolders={fetchFolders}
            streamRole={streamRole}
            currentUserRole={currentUserRole}
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
        {activeTab === 'Documentation' && (
          <DocumentationTab
            availableFolders={folders}
          />
        )}
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

      <UserProfileModal 
        isProfileOpen={isProfileOpen}
        setIsProfileOpen={setIsProfileOpen}
        currentUser={currentUser}
        currentUserRole={currentUserRole}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
