import React, { useState } from 'react';
import { User, X } from 'lucide-react';
import api from '../../utils/api';

interface UserProfileModalProps {
  isProfileOpen: boolean;
  setIsProfileOpen: (val: boolean) => void;
  currentUser: string | null;
  currentUserRole: string;
  isDarkMode: boolean;
}

export default function UserProfileModal({
  isProfileOpen,
  setIsProfileOpen,
  currentUser,
  currentUserRole,
  isDarkMode
}: UserProfileModalProps) {
  const [passwordForm, setPasswordForm] = useState({ old: '', new: '', confirm: '' });

  if (!isProfileOpen) return null;

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

  return (
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
  );
}
