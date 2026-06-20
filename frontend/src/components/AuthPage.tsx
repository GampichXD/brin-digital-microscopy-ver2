import { useState } from 'react';
// import type { ElementType } from 'react';
import axios from 'axios'; // <--- 1. TAMBAHKAN IMPORT AXIOS
import { ShieldCheck, User, Lock, Eye, EyeOff, UserPlus, LogIn, Check, Keyboard, ToggleLeft, ToggleRight } from 'lucide-react';
import VirtualKeyboard from './VirtualKeyboard';
import type { UserRole } from '../App';

interface AuthPageProps {
  isDarkMode: boolean;
  onLoginSuccess: (username: string, role: UserRole) => void;
  globalVirtualKeyboard: boolean;
  setGlobalVirtualKeyboard: (val: boolean) => void;
}

// Definisikan bentuk tipe respons JWT backend kita
interface BackendLoginResponse {
  access_token: string;
  token_type: string;
  username: string;
  role: UserRole;
}

export default function AuthPage({ isDarkMode, onLoginSuccess, globalVirtualKeyboard, setGlobalVirtualKeyboard }: AuthPageProps) {
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState(''); // State penampung pesan error API

  const [keyboardState, setKeyboardState] = useState<{ visible: boolean, title: string, targetSetter: React.Dispatch<React.SetStateAction<string>> | null }>({ visible: false, title: '', targetSetter: null });

  const theme = {
    bg: isDarkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-100 text-gray-900',
    panel: isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-blue-400 focus:border-blue-500' : 'bg-gray-50 border-gray-300 text-blue-600 focus:border-blue-600',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    btnTouch: isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
  };

  const handleKeyboardInput = (key: string) => {
    if (!keyboardState.targetSetter) return;
    keyboardState.targetSetter((prev: string) => {
      if (key === 'BACK') return prev.slice(0, -1);
      return prev + key;
    });
  };

  const triggerKeyboard = (title: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    if (!globalVirtualKeyboard) return; 
    setKeyboardState({ visible: true, title, targetSetter: setter });
  };

  // === 2. MODIFIKASI LOGIKA SUBMIT MENEMBAK BACKEND DOCKER ===
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username || !password) return alert('Username dan password tidak boleh kosong!');
    
    try {
      if (authMode === 'REGISTER') {
        if (password !== confirmPassword) return alert('Konfirmasi password tidak cocok!');
        
        // Tembak endpoint Registrasi Operator baru
        await axios.post('http://localhost:8000/api/auth/register', {
          username,
          password,
          role: 'OPERATOR' // Default pendaftaran mandiri dari layar alat adalah OPERATOR
        });

        alert('Registrasi Operator Berhasil! Silakan Login.');
        setAuthMode('LOGIN');
        setPassword('');
        setConfirmPassword('');
      } else {
        // Tembak endpoint Login untuk mendapatkan Token JWT asli
        const response = await axios.post<BackendLoginResponse>('http://localhost:8000/api/auth/login', {
          username,
          password
        });

        // Simpan credentials jangka panjang ke LocalStorage browser
        localStorage.setItem('token', response.data.access_token);
        localStorage.setItem('role', response.data.role);
        localStorage.setItem('username', response.data.username);

        // Buka gerbang kunci instrumen utama App.tsx
        onLoginSuccess(response.data.username, response.data.role);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        setErrorMsg(error.response?.data?.detail || 'Gagal tersambung ke API Mikroskop');
      } else {
        setErrorMsg('Terjadi kegagalan sistem internal');
      }
    }
  };

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 transition-colors duration-300 ${theme.bg}`}>
      
      <div className={`w-full max-w-md rounded-3xl border-2 p-6 shadow-2xl flex flex-col justify-between transition-all ${theme.panel} ${keyboardState.visible ? '-translate-y-16 scale-95' : ''}`}>
        
        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mb-2 shadow-inner">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-lg font-black tracking-tight">AUTOMATED MICROSCOPE</h1>
          <p className={`text-[9px] font-bold uppercase tracking-widest ${theme.textMuted}`}>Lab Instrument Control Panel</p>
        </div>

        {/* Notifikasi Error Komunikasi Server */}
        {errorMsg && (
          <div className="mb-3 p-2.5 text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl text-center font-bold">
            {errorMsg}
          </div>
        )}

        {/* SLIDER INTERFACE */}
        <div 
  className={`p-2.5 rounded-xl border mb-4 flex items-center justify-between transition-all ${
    globalVirtualKeyboard 
      ? 'border-blue-500/40 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.05)]' 
      : (isDarkMode ? 'border-gray-800 bg-black/10' : 'border-gray-200 bg-black/5')
  }`}
>
  <div className="flex items-center gap-2">
    {/* Logo Keyboard ikut menyala biru */}
    <Keyboard size={16} className={globalVirtualKeyboard ? 'text-blue-400' : 'text-gray-400'} />
    <div className="flex flex-col">
      {/* Judul Teks "Gunakan Virtual Keyboard" ikut menyala biru */}
      <span className={`text-[11px] font-bold transition-colors ${globalVirtualKeyboard ? 'text-blue-400' : theme.text}`}> 
        Gunakan Virtual Keyboard
      </span>
      <span className="text-[8px] text-gray-500">Matikan jika ada USB Keyboard fisik tersambung</span>
    </div>
  </div>
  
  <button 
    type="button" 
    onClick={() => { 
      const nextState = !globalVirtualKeyboard;
      setGlobalVirtualKeyboard(nextState); 
      localStorage.setItem('useVirtualKeyboard', String(nextState));
      setKeyboardState({ visible: false, title: '', targetSetter: null }); 
    }}
    className={`transition-colors p-0.5 rounded-lg active:scale-95 ${globalVirtualKeyboard ? 'text-blue-500' : 'text-gray-400'}`}
  >
    {globalVirtualKeyboard ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
  </button>
</div>

        <div className={`flex rounded-xl border p-1 mb-4 bg-black/5 ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <button type="button" onClick={() => { setAuthMode('LOGIN'); setPassword(''); setErrorMsg(''); }} className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${authMode === 'LOGIN' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}><LogIn size={14}/> LOGIN</button>
          <button type="button" onClick={() => { setAuthMode('REGISTER'); setPassword(''); setErrorMsg(''); }} className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${authMode === 'REGISTER' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}><UserPlus size={14}/> REGISTER</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={`block text-[10px] font-bold mb-1 uppercase tracking-wider ${theme.textMuted}`}>Username / ID Operator</label>
            <div className="relative">
              <User size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme.textMuted}`} />
              <input 
                type="text" 
                readOnly={globalVirtualKeyboard} 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onClick={() => triggerKeyboard('Input Username', setUsername)}
                placeholder="Masukkan username..." 
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border font-bold text-sm shadow-inner ${theme.input} ${keyboardState.title.includes('Username') ? 'ring-2 ring-blue-500' : ''}`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-[10px] font-bold mb-1 uppercase tracking-wider ${theme.textMuted}`}>Password</label>
            <div className="relative">
              <Lock size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme.textMuted}`} />
              <input 
                type={showPassword ? 'text' : 'password'} 
                readOnly={globalVirtualKeyboard}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onClick={() => triggerKeyboard('Input Password', setPassword)}
                placeholder="Masukkan password..." 
                className={`w-full pl-10 pr-12 py-2.5 rounded-xl border font-bold text-sm shadow-inner ${theme.input} ${keyboardState.title.includes('Password') && !keyboardState.title.includes('Konfirmasi') ? 'ring-2 ring-blue-500' : ''}`}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg ${theme.textMuted}`}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {authMode === 'REGISTER' && (
            <div className="animate-fadeIn">
              <label className={`block text-[10px] font-bold mb-1 uppercase tracking-wider ${theme.textMuted}`}>Konfirmasi Password</label>
              <div className="relative">
                <Lock size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme.textMuted}`} />
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  readOnly={globalVirtualKeyboard}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onClick={() => triggerKeyboard('Konfirmasi Password', setConfirmPassword)}
                  placeholder="Ulangi password..." 
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border font-bold text-sm shadow-inner ${theme.input} ${keyboardState.title.includes('Konfirmasi') ? 'ring-2 ring-blue-500' : ''}`}
                />
              </div>
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-xs mt-4">
            <Check size={16} className="mr-2" /> {authMode === 'LOGIN' ? 'MASUK KE INSTRUMEN' : 'DAFTARKAN OPERATOR'}
          </button>
        </form>

      </div>

      {keyboardState.visible && globalVirtualKeyboard && (
        <div className="fixed inset-0 z-[110] pointer-events-none flex items-end justify-center pb-4 animate-slideUp">
          <div className="pointer-events-auto shadow-2xl">
            <VirtualKeyboard 
              title={keyboardState.title} 
              onInput={handleKeyboardInput} 
              onClose={() => setKeyboardState({ visible: false, title: '', targetSetter: null })} 
            />
          </div>
        </div>
      )}

    </div>
  );
}