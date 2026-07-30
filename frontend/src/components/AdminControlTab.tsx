import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Cpu, ToggleLeft, ToggleRight, Users, Trash2, Power, HardDrive } from 'lucide-react';
import { showToast } from '../utils/toast';
import { useGlobalContext } from '../context/GlobalContext';
import { useTranslation } from '../hooks/useTranslation';

interface LabOperator {
  id: number;
  username: string;
  role: 'ADMIN' | 'OPERATOR';
  status: string;
  last_login: string | null;
}

export default function AdminControlTab() {
  const { isDarkMode, isSystemHardwareEnabled, setIsSystemHardwareEnabled } = useGlobalContext();
  const { t } = useTranslation();
  // === 2. UBAH STATE MENJADI DINAMIS DARI DATABASE BACKEND ===
  const [userList, setUserList] = useState<LabOperator[]>([]);

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    tableHeader: isDarkMode ? 'bg-gray-950 text-gray-400' : 'bg-gray-100 text-gray-600',
    rowHover: isDarkMode ? 'hover:bg-gray-800/40 border-gray-800' : 'hover:bg-gray-50 border-gray-100'
  };

  // === 3. FUNGSI AMBIL DATA OPERATOR DARI POSTGRESQL ===
  const fetchOperators = async () => {
    try {
      const response = await api.get<LabOperator[]>('/api/auth/operators');
      setUserList(response.data);
    } catch (error) {
      console.error("Gagal memuat daftar operator lab:", error);
    }
  };

  useEffect(() => {
    const delayFetch = setTimeout(() => {
      fetchOperators();
    }, 0);
    return () => clearTimeout(delayFetch);
  }, []);

  // === 4. MUTASI ROLE NYATA (ADMIN <=> OPERATOR) KERS SERVER ===
  const toggleUserRole = async (id: number, currentRole: 'ADMIN' | 'OPERATOR') => {
    try {
      const targetRole = currentRole === 'ADMIN' ? 'OPERATOR' : 'ADMIN';
      
      await api.put(`/api/auth/operators/${id}/role`, 
        { role: targetRole }
      );
      
      fetchOperators(); // Segarkan tabel data
      showToast("Otoritas akun berhasil diperbarui.", "success");
    } catch (error) {
      console.error("Gagal mengubah otoritas akun operator:", error);
      showToast("Gagal mengubah otoritas akun. Pastikan kamu memiliki hak akses root.", "error");
    }
  };

  // === 5. PENGHAPUSAN AKUN OPERATOR DARI DATABASE ===
  const handleDeleteOperator = async (id: number) => {
    if (!confirm("Yakin ingin menghapus akun operator ini dari sistem?")) return;
    try {
      await api.delete(`/api/auth/operators/${id}`);
      fetchOperators();
      showToast("Operator berhasil dihapus secara permanen.", "success");
    } catch (error) {
      console.error("Gagal menghapus operator:", error);
      showToast("Gagal menghapus operator.", "error");
    }
  };

  // === 6. INTERUPSI RELAY GLOBAL KELUARAN PERANGKAT UTAMA ===
  const handleToggleHardwareBus = async () => {
    try {
      const targetStatus = !isSystemHardwareEnabled;
      
      await api.post('/api/hardware/bus/toggle', 
        { enabled: targetStatus }
      );
      setIsSystemHardwareEnabled(targetStatus); // Perbarui saklar di header global App.tsx
    } catch (error) {
      console.error("Gagal mengirim sinyal interupsi ke bus daya:", error);
      showToast("Gagal mengirim sinyal interupsi ke bus daya.", "error");
    }
  };

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-4 pr-1" style={{ scrollbarWidth: 'none' }}>
      
      {/* BARIS UTAMA: MASTER POWER CONTROL & JETSON PERFORMANCE HARDWARE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
        
        {/* PANEL LEVEL TERKUAT: EMERGENCY HARDWARE INTERRUPT CONTROL */}
        <div className={`p-4 rounded-2xl border-2 flex flex-col justify-between shadow-lg transition-colors ${isSystemHardwareEnabled ? 'border-green-600/30 bg-green-500/5' : 'border-red-600/50 bg-red-500/5'}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${isSystemHardwareEnabled ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                <Power size={24} />
              </div>
              <div>
                <h3 className={`font-black text-sm tracking-wide ${theme.text}`}>{t('powerBus')}</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">{t('relayCnc')}</p>
              </div>
            </div>
          </div>
          
          <div className="mt-6 flex items-center justify-between p-3 bg-black/20 rounded-xl border border-gray-800">
            <span className="text-xs font-bold flex items-center gap-2">
              {t('busStatus')} {isSystemHardwareEnabled ? <span className="text-green-500 font-black">{t('onlineNormal')}</span> : <span className="text-red-500 font-black">{t('interruptLocked')}</span>}
            </span>
            <button onClick={handleToggleHardwareBus} className={`p-0.5 rounded-lg transition-colors ${isSystemHardwareEnabled ? 'text-green-500' : 'text-red-500'}`}>
              {isSystemHardwareEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
            </button>
          </div>
        </div>

        {/* MONITOR METRIK SERVER JETSON (CPU & GPU CLOCK) */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm ${theme.panel}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl"><Cpu size={24} /></div>
            <div className="w-full">
              <div className="flex justify-between text-xs font-bold"><span className={theme.text}>{t('jetsonCpuLoad')}</span><span className="text-blue-400">42%</span></div>
              <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-1 mb-2">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '42%' }}></div>
              </div>
              <div className="flex justify-between text-xs font-bold"><span className={theme.text}>NVIDIA Jetson RAM</span><span className="text-green-400">5.12/7.62 GB</span></div>
              <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-1 mb-2">
                <div className="h-full bg-green-500 rounded-full" style={{ width: '65%' }}></div>
              </div>
            </div>
          </div>
          <span className="text-[9px] font-mono text-gray-500 mt-2 block">{t('tegraClock')}</span>
        </div>

        {/* MONITOR PERIFERAL STORAGE LOGS */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm ${theme.panel}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl"><HardDrive size={24} /></div>
            <div className="w-full">
              <div className="flex justify-between text-xs font-bold"><span className={theme.text}>{t('dbDiskIops')}</span><span className="text-purple-400">85% full</span></div>
              <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-1 mb-2">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: '85%' }}></div>
              </div>
              <div className="flex justify-between text-xs font-bold"><span className={theme.text}>ROM Data Usage</span><span className="text-orange-400">2.10/50.00 GB</span></div>
              <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mt-1 mb-2">
                <div className="h-full bg-orange-500 rounded-full" style={{ width: '50%' }}></div>
              </div>
            </div>
          </div>
          <span className="text-[9px] font-mono text-gray-500 mt-2 block">{t('autocleanLogs')}</span>
        </div>

      </div>

      {/* SEKSI BAWAH: MANAJEMEN OTORITAS AKSES (RBAC PANEL) */}
      <div className={`flex-1 rounded-2xl border flex flex-col overflow-hidden min-h-[300px] shadow-sm ${theme.panel}`}>
        <div className="p-4 border-b border-gray-800 bg-black/10 flex items-center gap-2">
          <Users size={18} className="text-blue-500" />
          <div>
            <h3 className={`font-black text-sm ${theme.text}`}>{t('rbac')}</h3>
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{t('labOperatorAuth')}</p>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-left">
            <thead className={`sticky top-0 text-[10px] uppercase font-bold tracking-wider ${theme.tableHeader}`}>
              <tr>
                <th className="p-4">{t('operatorId')}</th>
                <th className="p-4">{t('accessLevel')}</th>
                <th className="p-4">{t('tokenStatus')}</th>
                <th className="p-4">{t('loginHistory')}</th>
                <th className="p-4 text-right">{t('changeAuth')}</th>
              </tr>
            </thead>
            <tbody className={`text-xs font-bold ${theme.text}`}>
              {userList.map(user => (
                <tr key={user.id} className={`border-t transition-colors ${theme.rowHover}`}>
                  <td className="p-4 flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${user.status === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    {user.username}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded font-mono font-black ${user.role === 'ADMIN' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-400'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500 font-medium">{user.status}</td>
                  <td className="p-4 font-mono text-gray-500">{user.last_login || 'N/A'}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => toggleUserRole(user.id, user.role)} className="px-2 py-1 bg-gray-800 border border-gray-700 hover:border-blue-500 rounded-lg text-[10px] font-bold text-gray-300 transition-colors mr-1">
                      TOGGLE ROLE
                    </button>
                    {user.username !== 'admin' && (
                      <button onClick={() => handleDeleteOperator(user.id)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg"><Trash2 size={14}/></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}


