import { useState } from 'react';
import { ShieldCheck, User, Lock, Eye, EyeOff, UserPlus, LogIn, Check, Keyboard, ToggleLeft, ToggleRight } from 'lucide-react';
import VirtualKeyboard from './VirtualKeyboard';
import type { UserRole } from '../App';

interface AuthPageProps {
  isDarkMode: boolean;
  onLoginSuccess: (username: string, role: UserRole) => void;
  globalVirtualKeyboard: boolean;
  setGlobalVirtualKeyboard: (val: boolean) => void;
}

export default function AuthPage({ isDarkMode, onLoginSuccess, globalVirtualKeyboard, setGlobalVirtualKeyboard }: AuthPageProps) {
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [keyboardState, setKeyboardState] = useState<{ visible: boolean, title: string, targetSetter: React.Dispatch<React.SetStateAction<string>> | null }>({ visible: false, title: '', targetSetter: null });

  const theme = {
    bg: isDarkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-100 text-gray-900',
    panel: isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-blue-400 focus:border-blue-500' : 'bg-gray-50 border-gray-300 text-blue-600 focus:border-blue-600',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    btnTouch: isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300',
  };

  const handleKeyboardInput = (key: string) => {
    if (!keyboardState.targetSetter) return;
    keyboardState.targetSetter((prev: string) => {
      if (key === 'BACK') return prev.slice(0, -1);
      return prev + key;
    });
  };

  const triggerKeyboard = (title: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    if (!globalVirtualKeyboard) return; // INTERSEPTOR: Jika mode fisik aktif, jangan munculkan keyboard virtual
    setKeyboardState({ visible: true, title, targetSetter: setter });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return alert('Username and Password cannot be empty!');
    
    if (authMode === 'REGISTER') {
      if (password !== confirmPassword) return alert('Passwords do not match!');
      alert('Registrasi Berhasil (Simulasi)! Silakan Login.');
      setAuthMode('LOGIN');
      setPassword('');
      setConfirmPassword('');
      return;
    }

    const role: UserRole = username.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'OPERATOR';
    onLoginSuccess(username, role);
    
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

        {/* === SLIDER INTERFACE UNTUK DISABLE/ENABLE KEYBOARD FISIK === */}
        <div className={`p-2.5 rounded-xl border mb-4 flex items-center justify-between bg-black/10 ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <Keyboard size={16} className={globalVirtualKeyboard ? 'text-blue-400' : 'text-gray-400'} />
            <div className="flex flex-col">
              <span className="text-[11px] font-bold">Gunakan Virtual Keyboard</span>
              <span className="text-[8px] text-gray-500">Matikan jika ada USB Keyboard fisik tersambung</span>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => { setGlobalVirtualKeyboard(!globalVirtualKeyboard); setKeyboardState({ visible: false, title: '', targetSetter: null }); }}
            className={`transition-colors p-0.5 rounded-lg ${globalVirtualKeyboard ? 'text-blue-500' : 'text-gray-400'}`}
          >
            {globalVirtualKeyboard ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          </button>
        </div>

        <div className={`flex rounded-xl border p-1 mb-4 bg-black/5 ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <button type="button" onClick={() => { setAuthMode('LOGIN'); setPassword(''); }} className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${authMode === 'LOGIN' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}><LogIn size={14}/> LOGIN</button>
          <button type="button" onClick={() => { setAuthMode('REGISTER'); setPassword(''); }} className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${authMode === 'REGISTER' ? 'bg-blue-600 text-white shadow' : theme.textMuted}`}><UserPlus size={14}/> REGISTER</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={`block text-[10px] font-bold mb-1 uppercase tracking-wider ${theme.textMuted}`}>Username / ID Operator</label>
            <div className="relative">
              <User size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme.textMuted}`} />
              <input 
                type="text" 
                readOnly={globalVirtualKeyboard} // Jika keyboard virtual mati, input otomatis bisa diketik pakai keyboard fisik
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