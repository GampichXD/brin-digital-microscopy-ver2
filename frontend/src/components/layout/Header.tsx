import { useState } from 'react';
import { User, Download, Keyboard, ToggleRight, ToggleLeft, Globe, Sun, Moon, LogOut, Menu, X } from 'lucide-react';
import { useGlobalContext } from '../../context/GlobalContext';

// Import logos (adjust path as necessary relative to App.tsx)
import logoBrin from '../../assets/logo-brin.png';
import logoUndip from '../../assets/logo-undip.png';

interface HeaderProps {
  currentUser: string | null;
  currentUserRole: string;
  grblStatus: string;
  setIsProfileOpen: (val: boolean) => void;
  deferredPrompt: any;
  handleInstallClick: () => void;
  onLogout: () => void;
}

export default function Header({
  currentUser,
  currentUserRole,
  grblStatus,
  setIsProfileOpen,
  deferredPrompt,
  handleInstallClick,
  onLogout
}: HeaderProps) {
  const {
    isDarkMode, setIsDarkMode,
    globalVirtualKeyboard, setGlobalVirtualKeyboard,
    language, setLanguage,
    isSystemHardwareEnabled
  } = useGlobalContext();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
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
                onClick={onLogout} 
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
              onLogout();
              setMobileMenuOpen(false);
            }} 
            className="px-3 py-2 bg-red-600/10 border border-red-500/30 text-red-500 hover:bg-red-600 hover:text-white rounded-xl font-bold transition-all w-full flex items-center gap-2 text-xs"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      )}
    </>
  );
}
