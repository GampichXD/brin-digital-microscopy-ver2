import { useState } from 'react';
import { Cpu, ToggleLeft, ToggleRight, Users, Trash2, Power, HardDrive } from 'lucide-react';

interface AdminControlTabProps {
  isDarkMode: boolean;
  isSystemHardwareEnabled: boolean;
  setIsSystemHardwareEnabled: (val: boolean) => void;
}

export default function AdminControlTab({ isDarkMode, isSystemHardwareEnabled, setIsSystemHardwareEnabled }: AdminControlTabProps) {
  // Simulasi User Database Manajemen Hak Akses (RBAC)
  const [userList, setUserList] = useState([
    { id: 1, name: 'Abraham', role: 'OPERATOR', status: 'ACTIVE', lastLogin: 'Hari ini, 08:30' },
    { id: 2, name: 'Admin', role: 'ADMIN', status: 'ACTIVE', lastLogin: 'Hari ini, 08:00' },
    { id: 3, name: 'Andhika_Magang', role: 'OPERATOR', status: 'LOCKED', lastLogin: '05 Jun 2026' }
  ]);

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    tableHeader: isDarkMode ? 'bg-gray-950 text-gray-400' : 'bg-gray-100 text-gray-600',
    rowHover: isDarkMode ? 'hover:bg-gray-800/40 border-gray-800' : 'hover:bg-gray-50 border-gray-100'
  };

  const toggleUserRole = (id: number) => {
    setUserList(userList.map(u => u.id === id ? { ...u, role: u.role === 'ADMIN' ? 'OPERATOR' : 'ADMIN' } : u));
  };

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-4 pr-1" style={{ scrollbarWidth: 'none' }}>
      
      {/* BARIS UTAMA: MASTER POWER CONTROL & JETSON PERFORMANCE HARDWARE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
        
        {/* PANEL LEVEL TERKUAT: EMERGENCY HARDWARE INTERRUPT CONTROL */}
        <div className={`p-4 rounded-2xl border-2 flex flex-col justify-between shadow-lg ${isSystemHardwareEnabled ? 'border-green-600/30 bg-green-500/5' : 'border-red-600/50 bg-red-500/5'}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${isSystemHardwareEnabled ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                <Power size={24} />
              </div>
              <div>
                <h3 className={`font-black text-sm tracking-wide ${theme.text}`}>INSTRUMEN POWER BUS</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Relay CNC & Shutter Sensor</p>
              </div>
            </div>
          </div>
          
          <div className="mt-6 flex items-center justify-between p-3 bg-black/20 rounded-xl border border-gray-800">
            <span className="text-xs font-bold flex items-center gap-2">
              Status Bus: {isSystemHardwareEnabled ? <span className="text-green-500 font-black">ONLINE (NORMAL)</span> : <span className="text-red-500 font-black">INTERRUPT LOCKED</span>}
            </span>
            <button onClick={() => setIsSystemHardwareEnabled(!isSystemHardwareEnabled)} className={`p-0.5 rounded-lg transition-colors ${isSystemHardwareEnabled ? 'text-green-500' : 'text-red-500'}`}>
              {isSystemHardwareEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
            </button>
          </div>
        </div>

        {/* MONITOR METRIK SERVER JETSON (CPU & GPU CLOCK) */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm ${theme.panel}`}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl"><Cpu size={24} /></div>
            <div className="w-full">
              <div className="flex justify-between text-xs font-bold"><span className={theme.text}>Jetson CPU Core Load</span><span className="text-blue-400">42%</span></div>
              <div className="w-full h-2 bg-gray-800 rounded-full mt-1.5 overflow-hidden border border-gray-700/50">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: '42%' }}></div>
              </div>
            </div>
          </div>
          <span className="text-[9px] font-mono text-gray-500 mt-2 block">TEGRA EMULATION CLOCK CORE: 1.4 GHz | ACTIVE THERMAL SPEED</span>
        </div>

        {/* MONITOR PERIFERAL STORAGE LOGS */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm ${theme.panel}`}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl"><HardDrive size={24} /></div>
            <div className="w-full">
              <div className="flex justify-between text-xs font-bold"><span className={theme.text}>Database Disk IOPS Logs</span><span className="text-purple-400">85% full</span></div>
              <div className="w-full h-2 bg-gray-800 rounded-full mt-1.5 overflow-hidden border border-gray-700/50">
                <div className="h-full bg-purple-500" style={{ width: '85%' }}></div>
              </div>
            </div>
          </div>
          <span className="text-[9px] font-mono text-gray-500 mt-2 block">AUTOCLEAN LOGS TRUNCATE CYCLE: SET 24 HOURS TIMER</span>
        </div>

      </div>

      {/* SEKSI BAWAH: MANAJEMEN OTORITAS AKSES (RBAC PANEL) */}
      <div className={`flex-1 rounded-2xl border flex flex-col overflow-hidden min-h-[300px] shadow-sm ${theme.panel}`}>
        <div className="p-4 border-b border-gray-800 bg-black/10 flex items-center gap-2">
          <Users size={18} className="text-blue-500" />
          <div>
            <h3 className={`font-black text-sm ${theme.text}`}>Role-Based Access Control (RBAC)</h3>
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Otoritas Akun Operator Laboratorium</p>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-left">
            <thead className={`sticky top-0 text-[10px] uppercase font-bold tracking-wider ${theme.tableHeader}`}>
              <tr>
                <th className="p-4">ID Operator</th>
                <th className="p-4">Tingkat Hak Akses</th>
                <th className="p-4">Status Token</th>
                <th className="p-4">Riwayat Login</th>
                <th className="p-4 text-right">Ubah Otoritas</th>
              </tr>
            </thead>
            <tbody className={`text-xs font-bold ${theme.text}`}>
              {userList.map(user => (
                <tr key={user.id} className={`border-t transition-colors ${theme.rowHover}`}>
                  <td className="p-4 flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${user.status === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    {user.name}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded font-mono font-black ${user.role === 'ADMIN' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-400'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500 font-medium">{user.status}</td>
                  <td className="p-4 font-mono text-gray-500">{user.lastLogin}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => toggleUserRole(user.id)} className="px-2 py-1 bg-gray-800 border border-gray-700 hover:border-blue-500 rounded-lg text-[10px] font-bold text-gray-300 transition-colors mr-1">
                      TOGGLE ROLE
                    </button>
                    {user.name !== 'Admin' && (
                      <button className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg"><Trash2 size={14}/></button>
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