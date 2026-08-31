import { useState, useEffect } from 'react';
import api from '../utils/api';
import {
  Cpu, ToggleLeft, ToggleRight, Trash2, Power, HardDrive, Download, Crosshair, CheckCircle2,
  ShieldAlert, Activity, Server, Thermometer, Scan, Video, Save, RotateCcw, Key,
  RefreshCw, Move, ArrowUp, ArrowDown, ArrowRightLeft, Users, MapPin, RefreshCcw,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { useGlobalContext } from '../context/GlobalContext';
import { useTranslation } from '../hooks/useTranslation';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface LabOperator {
  id: number;
  username: string;
  role: 'ADMIN' | 'OPERATOR';
  status: string;
  online?: boolean;
  last_login: string | null;
}

interface AdminControlTabProps {
  roomState?: any;
  lastEchoGCode?: string;
}

export default function AdminControlTab({ roomState, lastEchoGCode }: AdminControlTabProps) {
  const { isDarkMode, isSystemHardwareEnabled, setIsSystemHardwareEnabled, telemetryData } = useGlobalContext();
  const { t } = useTranslation();

  const [userList, setUserList] = useState<LabOperator[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  // Konfigurasi hardware
  const defaults = { feedRate: 100, shutterUs: 8000, gainIso: 400, confThreshold: 25 };
  const [feedRate, setFeedRate] = useState<number>(defaults.feedRate);
  const [shutterUs, setShutterUs] = useState<number>(defaults.shutterUs);
  const [gainIso, setGainIso] = useState<number>(defaults.gainIso);
  const [confThreshold, setConfThreshold] = useState<number>(defaults.confThreshold);

  // Koordinat & soft limit
  const [posForm, setPosForm] = useState({ x: '0', y: '0', z: '0' });
  const [slEnabled, setSlEnabled] = useState(false);
  const [sl, setSl] = useState({ xMin: '', xMax: '', yMin: '', yMax: '', zMin: '', zMax: '' });

  // Restart edge
  const [confirmRestart, setConfirmRestart] = useState(false);

  const num = (s: string) => (s === '' || s === '-' || isNaN(parseFloat(s)) ? null : parseFloat(s));

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    tableHeader: isDarkMode ? 'bg-gray-950 text-gray-400' : 'bg-gray-100 text-gray-600',
    rowHover: isDarkMode ? 'hover:bg-gray-800/40 border-gray-800' : 'hover:bg-gray-50 border-gray-100',
    inputBg: isDarkMode ? 'bg-gray-950 border-gray-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-800',
    slot: isDarkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200',
    overlay: 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4',
  };

  // Posisi motor terkini dari telemetri global (lastEchoGCode = "X:.. Y:.. Z:..")
  const livePos = (() => {
    const m = (lastEchoGCode || '').match(/X:([\d.-]+)\s+Y:([\d.-]+)\s+Z:([\d.-]+)/);
    return m ? { x: m[1], y: m[2], z: m[3] } : null;
  })();

  const fetchOperators = async () => {
    try {
      const res = await api.get<LabOperator[]>('/api/auth/operators');
      setUserList(res.data);
    } catch { /* ignore */ }
  };

  const fetchRecentLogs = async () => {
    try {
      const res = await api.get<any[]>('/api/logs');
      if (Array.isArray(res.data)) setRecentLogs(res.data.slice(0, 40));
    } catch { /* ignore */ }
  };

  const fetchSystemSettings = async () => {
    try {
      const { data } = await api.get<Record<string, string>>('/api/hardware/config');
      if (data.feedRate) setFeedRate(parseInt(data.feedRate) || defaults.feedRate);
      if (data.shutter_speed) setShutterUs(parseInt(data.shutter_speed) || defaults.shutterUs);
      if (data.exposure) setGainIso(parseInt(data.exposure) || defaults.gainIso);
      if (data.confThreshold) setConfThreshold(parseInt(data.confThreshold) || defaults.confThreshold);
      setSlEnabled(data.softLimitsEnabled === '1');
      setSl({
        xMin: data.softLimit_x_min ?? '', xMax: data.softLimit_x_max ?? '',
        yMin: data.softLimit_y_min ?? '', yMax: data.softLimit_y_max ?? '',
        zMin: data.softLimit_z_min ?? '', zMax: data.softLimit_z_max ?? '',
      });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchOperators();
    fetchRecentLogs();
    fetchSystemSettings();
    const a = setInterval(fetchOperators, 5000);
    const b = setInterval(fetchRecentLogs, 6000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  // ── RBAC ──
  const toggleUserRole = async (id: number, currentRole: string) => {
    try {
      const newRole = currentRole === 'ADMIN' ? 'OPERATOR' : 'ADMIN';
      await api.put(`/api/auth/operators/${id}/role`, { role: newRole });
      showToast(`Role menjadi ${newRole}`, 'success');
      fetchOperators();
    } catch { showToast('Gagal mengubah role', 'error'); }
  };
  const handleResetPassword = async (id: number) => {
    try {
      await api.put('/api/auth/reset-password', { user_id: id });
      showToast('Password di-reset ke 123456.', 'success');
    } catch { showToast('Gagal reset password.', 'error'); }
  };
  const handleDeleteOperator = async (id: number) => {
    if (!confirm('Hapus akun operator ini permanen?')) return;
    try { await api.delete(`/api/auth/operators/${id}`); fetchOperators(); showToast('Operator dihapus.', 'success'); }
    catch { showToast('Gagal menghapus operator.', 'error'); }
  };

  // ── Hardware bus & CNC maintenance ──
  const handleToggleHardwareBus = async () => {
    try {
      const target = !isSystemHardwareEnabled;
      await api.post('/api/hardware/bus/toggle', { enabled: target });
      setIsSystemHardwareEnabled(target);
      showToast(target ? 'Bus hardware DIHIDUPKAN.' : 'Bus hardware DIMATIKAN.', target ? 'success' : 'error');
    } catch { showToast('Gagal mengubah bus daya.', 'error'); }
  };
  const handleHoming = async () => {
    try { await api.post('/api/hardware/motor/home'); showToast('Homing ($H) dimulai.', 'info'); }
    catch { showToast('Gagal Homing.', 'error'); }
  };
  const handleClearAlarm = async () => {
    try { await api.post('/api/hardware/motor/unlock'); showToast('Alarm GRBL dilepas ($X).', 'success'); }
    catch { showToast('Gagal melepas alarm.', 'error'); }
  };

  // ── Koordinat & Soft Limit ──
  const handleSetPosition = async () => {
    const x = num(posForm.x), y = num(posForm.y), z = num(posForm.z);
    if (x === null || y === null || z === null) { showToast('Koordinat tidak valid.', 'error'); return; }
    try {
      await api.post('/api/hardware/motor/set-position', { x, y, z });
      showToast(`Koordinat kerja di-set ke X${x} Y${y} Z${z} (motor_position.json).`, 'success');
    } catch (e: any) { showToast(`Gagal set posisi: ${e?.response?.data?.detail || 'error'}`, 'error'); }
  };
  const handleApplySoftLimits = async () => {
    try {
      await api.post('/api/hardware/cnc/soft-limits', {
        enabled: slEnabled,
        x_min: num(sl.xMin), x_max: num(sl.xMax),
        y_min: num(sl.yMin), y_max: num(sl.yMax),
        z_min: num(sl.zMin), z_max: num(sl.zMax),
      });
      showToast('Soft limit diterapkan ke Jetson.', 'success');
    } catch { showToast('Gagal menerapkan soft limit.', 'error'); }
  };

  // ── Sesi (Pilot / Spectator / Queue) ──
  const roomAction = async (cid: string, action: string) => {
    try {
      await api.post('/api/hardware/room/admin_action', { cid, action });
      showToast(`Aksi ${action} dieksekusi.`, 'success');
    } catch { showToast(`Gagal aksi ${action}.`, 'error'); }
  };

  // ── Camera / AI apply ──
  const handleApply = async (section: 'CNC' | 'Camera' | 'AI') => {
    try {
      if (section === 'CNC') {
        await api.post('/api/hardware/cnc/settings', { feed_rate: feedRate, backlash: 0.1, acceleration: 100, settle_time: 100 });
      } else if (section === 'Camera') {
        await api.post('/api/hardware/camera/settings', { shutter_speed: shutterUs, iso: gainIso });
      } else if (section === 'AI') {
        await api.put('/api/hardware/config/ai', { confThreshold });
      }
      showToast(`Pengaturan ${section} diterapkan.`, 'success');
    } catch { showToast(`Gagal menerapkan ${section}.`, 'error'); }
  };
  const handleReset = async (section: 'CNC' | 'Camera' | 'AI') => {
    try {
      await api.post(`/api/hardware/config/${section.toLowerCase()}/default`);
      if (section === 'CNC') setFeedRate(defaults.feedRate);
      if (section === 'Camera') { setShutterUs(defaults.shutterUs); setGainIso(defaults.gainIso); }
      if (section === 'AI') setConfThreshold(defaults.confThreshold);
      await fetchSystemSettings();
      showToast(`${section} dikembalikan ke default.`, 'success');
    } catch { showToast(`Gagal reset ${section}.`, 'error'); }
  };

  // ── Storage ──
  const handleExportData = async () => {
    try {
      showToast('Menyiapkan ZIP dataset...', 'info');
      const res = await api.get('/api/dataset/storage/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url; link.setAttribute('download', 'dataset_export.zip');
      document.body.appendChild(link); link.click(); link.parentNode?.removeChild(link);
    } catch { showToast('Gagal ekspor data.', 'error'); }
  };
  const handlePurgeCache = async () => {
    if (!confirm('Hapus seluruh cache & file sementara?')) return;
    try { await api.delete('/api/dataset/storage/purge-cache'); showToast('Cache dibersihkan.', 'success'); }
    catch { showToast('Gagal membersihkan cache.', 'error'); }
  };
  const handlePurgeAllDatasets = async () => {
    if (prompt("BAHAYA! Ini MENGHAPUS SELURUH dataset (Server + Edge) permanen.\nKetik 'HAPUS SEMUA':") !== 'HAPUS SEMUA') {
      showToast('Dibatalkan.', 'info'); return;
    }
    try { await api.delete('/api/dataset/storage/purge-all'); showToast('Seluruh dataset dimusnahkan.', 'success'); }
    catch { showToast('Gagal memusnahkan dataset.', 'error'); }
  };
  const handleClearLogs = async () => {
    if (!confirm('Hapus seluruh audit log?')) return;
    try { await api.delete('/api/logs'); setRecentLogs([]); showToast('Log dihapus.', 'success'); }
    catch { showToast('Gagal menghapus log.', 'error'); }
  };

  // ── Restart Edge ──
  const doRestartEdge = async () => {
    setConfirmRestart(false);
    try {
      const res = await api.post('/api/hardware/edge/restart');
      showToast(res.data?.message || 'Perintah restart dikirim ke Edge.', 'info');
    } catch (e: any) {
      showToast(`Gagal restart Edge: ${e?.response?.data?.detail || 'error'}`, 'error');
    }
  };

  const SettingActionButtons = ({ section }: { section: 'CNC' | 'Camera' | 'AI' }) => (
    <div className="flex gap-2 mt-4 pt-3 border-t border-gray-800/30">
      <button onClick={() => handleReset(section)} className="flex-1 py-1.5 px-3 rounded-lg text-[10px] font-bold border border-gray-500/30 text-gray-500 hover:bg-gray-500/10 flex items-center justify-center gap-1.5">
        <RotateCcw size={12} /> Default
      </button>
      <button onClick={() => handleApply(section)} className="flex-1 py-1.5 px-3 rounded-lg text-[10px] font-bold bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 flex items-center justify-center gap-1.5">
        <Save size={12} /> Terapkan
      </button>
    </div>
  );

  // Tombol aksi per-slot sesi
  const roleBtn = (cid: string, action: string, title: string, Icon: any, cls: string) => (
    <button onClick={() => roomAction(cid, action)} title={title} className={`p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity ${cls}`}>
      <Icon size={14} />
    </button>
  );

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-6 pr-1 pb-10" style={{ scrollbarWidth: 'none' }}>

      {/* SECTION 1: POWER BUS + CNC MAINTENANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
        <div className={`p-4 rounded-2xl border-2 flex flex-col justify-between shadow-lg ${isSystemHardwareEnabled ? 'border-green-600/30 bg-green-500/5' : 'border-red-600/50 bg-red-500/5'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${isSystemHardwareEnabled ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}><Power size={24} /></div>
            <div>
              <h3 className={`font-black text-sm ${theme.text}`}>{t('powerBus')}</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase">{t('relayCnc')}</p>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between p-3 bg-black/20 rounded-xl border border-gray-800">
            <span className="text-xs font-bold flex items-center gap-2">
              {t('busStatus')} {isSystemHardwareEnabled ? <span className="text-green-500 font-black">{t('onlineNormal')}</span> : <span className="text-red-500 font-black">{t('interruptLocked')}</span>}
            </span>
            <button onClick={handleToggleHardwareBus} className={isSystemHardwareEnabled ? 'text-green-500' : 'text-red-500'}>
              {isSystemHardwareEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
            </button>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm lg:col-span-2 ${theme.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-500/10 text-orange-500 rounded-xl"><Crosshair size={24} /></div>
              <div>
                <h3 className={`font-black text-sm ${theme.text}`}>CNC & GRBL Maintenance</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Feed rate & recovery</p>
              </div>
            </div>
            <div className="flex flex-col items-end w-48">
              <span className="text-[10px] font-bold text-gray-500 mb-1">MAX FEED RATE: {feedRate} mm/min</span>
              <input type="range" min={10} max={2000} step={10} value={feedRate} onChange={(e) => setFeedRate(parseInt(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-auto">
            <button onClick={handleHoming} disabled={!isSystemHardwareEnabled} className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs ${!isSystemHardwareEnabled ? 'opacity-50 cursor-not-allowed bg-gray-800 border-gray-700 text-gray-500' : 'bg-blue-600/10 border-blue-500/30 text-blue-400 hover:bg-blue-600/20'}`}>
              <Crosshair size={16} /> Auto Homing ($H)
            </button>
            <button onClick={handleClearAlarm} disabled={!isSystemHardwareEnabled} className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs ${!isSystemHardwareEnabled ? 'opacity-50 cursor-not-allowed bg-gray-800 border-gray-700 text-gray-500' : 'bg-green-600/10 border-green-500/30 text-green-400 hover:bg-green-600/20'}`}>
              <CheckCircle2 size={16} /> Clear Alarm ($X)
            </button>
          </div>
          <SettingActionButtons section="CNC" />
        </div>
      </div>

      {/* SECTION 2: KOORDINAT JSON + SOFT LIMIT LOGIC */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
        <div className={`p-4 rounded-2xl border shadow-sm ${theme.panel}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-teal-500/10 text-teal-500 rounded-xl"><MapPin size={20} /></div>
            <div>
              <h3 className={`font-black text-sm ${theme.text}`}>Koordinat Kerja (motor_position.json)</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase">Set G92 tanpa menggerakkan motor</p>
            </div>
          </div>
          <div className={`mb-3 p-2.5 rounded-xl border text-[11px] font-mono ${theme.inputBg}`}>
            Posisi terkini (telemetri):{' '}
            {livePos ? <b className="text-teal-400">X{livePos.x} Y{livePos.y} Z{livePos.z}</b> : <span className="text-gray-500">menunggu telemetri Jetson…</span>}
            {livePos && (
              <button onClick={() => setPosForm({ x: livePos.x, y: livePos.y, z: livePos.z })} className="ml-2 text-blue-400 hover:underline">isi ↴</button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['x', 'y', 'z'] as const).map(ax => (
              <div key={ax}>
                <label className="text-[10px] text-gray-500 block mb-1 uppercase">{ax} (mm)</label>
                <input type="number" value={(posForm as any)[ax]} onChange={(e) => setPosForm(p => ({ ...p, [ax]: e.target.value }))} className={`w-full p-2 rounded-lg border text-sm font-bold font-mono ${theme.inputBg}`} />
              </div>
            ))}
          </div>
          <button onClick={handleSetPosition} disabled={!isSystemHardwareEnabled} className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold bg-teal-600/20 text-teal-400 border border-teal-500/30 hover:bg-teal-600/30 disabled:opacity-50 flex items-center justify-center gap-2">
            <Move size={14} /> Tulis Ulang Koordinat ke Jetson
          </button>
        </div>

        <div className={`p-4 rounded-2xl border shadow-sm ${theme.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500/10 text-red-500 rounded-xl"><ShieldAlert size={20} /></div>
              <div>
                <h3 className={`font-black text-sm ${theme.text}`}>Soft Limit Logic</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Batas gerak dipaksa di Edge</p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-[10px] font-bold text-gray-500">{slEnabled ? 'AKTIF' : 'NONAKTIF'}</span>
              <input type="checkbox" checked={slEnabled} onChange={(e) => setSlEnabled(e.target.checked)} className="w-9 h-5 accent-red-500" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([['xMin', '-X'], ['yMin', '-Y'], ['zMin', '-Z'], ['xMax', '+X'], ['yMax', '+Y'], ['zMax', '+Z']] as const).map(([key, label]) => (
              <div key={key}>
                <label className="text-[10px] text-gray-500 block mb-1">{label}</label>
                <input
                  type="number" value={(sl as any)[key]}
                  onChange={(e) => setSl(s => ({ ...s, [key]: e.target.value }))}
                  placeholder={label.startsWith('-') ? '-∞' : '+∞'}
                  className={`w-full p-2 rounded-lg border text-xs font-bold font-mono ${theme.inputBg}`}
                />
              </div>
            ))}
          </div>
          <button onClick={handleApplySoftLimits} className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 flex items-center justify-center gap-2">
            <Save size={14} /> Terapkan Batas ke Jetson
          </button>
        </div>
      </div>

      {/* SECTION 3: CAMERA (exposure runtime) + AI CONFIDENCE + RESTART EDGE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm ${theme.panel}`}>
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-pink-500/10 text-pink-500 rounded-xl"><Video size={20} /></div>
              <div>
                <h3 className={`font-black text-sm ${theme.text}`}>Camera Optics (IMX477)</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Berlaku langsung saat berjalan</p>
              </div>
            </div>
            <div className="space-y-4 text-xs font-bold">
              <div>
                <div className="flex justify-between mb-1"><label className="text-[10px] text-gray-500">Shutter / Exposure</label><span className="text-pink-500">{shutterUs} µs</span></div>
                <input type="range" min={100} max={33000} step={100} value={shutterUs} onChange={(e) => setShutterUs(parseInt(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
              </div>
              <div>
                <div className="flex justify-between mb-1"><label className="text-[10px] text-gray-500">Gain (ISO)</label><span className="text-pink-500">{gainIso}</span></div>
                <input type="range" min={100} max={2200} step={50} value={gainIso} onChange={(e) => setGainIso(parseInt(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
              </div>
              <p className="text-[9px] text-gray-500 font-medium">Menerapkan = pipeline GStreamer di Jetson di-restart ±1 dtk (aelock aktif).</p>
            </div>
          </div>
          <SettingActionButtons section="Camera" />
        </div>

        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm ${theme.panel}`}>
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-cyan-500/10 text-cyan-500 rounded-xl"><Scan size={20} /></div>
              <div>
                <h3 className={`font-black text-sm ${theme.text}`}>Vision AI Inference</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">YOLO Seg TensorRT (Edge)</p>
              </div>
            </div>
            <div className="text-xs font-bold">
              <div className="flex justify-between items-center mb-1"><label className="text-[10px] text-gray-500">Confidence Threshold</label><span className="text-cyan-500">{confThreshold}%</span></div>
              <input type="range" min={1} max={99} value={confThreshold} onChange={(e) => setConfThreshold(parseInt(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
              <p className="text-[9px] text-gray-500 mt-2 font-medium">Dipakai colony counter di tab Image Analysis (diteruskan ke <span className="font-mono">count_colonies(conf=…)</span> di Jetson).</p>
            </div>
          </div>
          <SettingActionButtons section="AI" />
        </div>

        <div className={`p-4 rounded-2xl border-2 border-amber-600/40 bg-amber-500/5 flex flex-col justify-between shadow-sm`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-amber-500/15 text-amber-500 rounded-xl"><RefreshCcw size={22} /></div>
            <div>
              <h3 className={`font-black text-sm ${theme.text}`}>Restart Layanan Edge</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase">Proses Python Jetson (bukan reboot OS)</p>
            </div>
          </div>
          <p className={`text-[11px] mb-3 ${theme.textMuted}`}>
            Memulihkan sensor kamera / port serial yang macet tanpa SSH. Edge terputus ±3–10 dtk lalu tersambung otomatis.
          </p>
          <button onClick={() => setConfirmRestart(true)} className="w-full py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2">
            <RefreshCcw size={14} /> Restart Sekarang
          </button>
        </div>
      </div>

      {/* SECTION 4: CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
        <div className={`p-4 rounded-2xl border flex flex-col shadow-sm h-[300px] ${theme.panel}`}>
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg"><Cpu size={18} /></div>
            <div><h3 className={`font-black text-sm ${theme.text}`}>Edge Device (Jetson)</h3><p className="text-[10px] text-gray-500 font-bold uppercase">Local Inference Node</p></div>
            <div className="ml-auto text-right">
              <div className="text-[10px] text-gray-500 font-bold">CPU TEMP</div>
              <div className="text-lg font-black text-blue-400 flex items-center justify-end gap-1">
                <Thermometer size={14} /> {telemetryData.length > 0 ? telemetryData[telemetryData.length - 1].edgeTemp.toFixed(1) : '--'}°C
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={telemetryData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEdgeCpu" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                  <linearGradient id="colorEdgeRam" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickMargin={10} minTickGap={20} />
                <YAxis tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 'bold' }} />
                <Area type="monotone" dataKey="edgeCpu" name="CPU" stroke="#3b82f6" strokeWidth={2} fill="url(#colorEdgeCpu)" isAnimationActive={false} />
                <Area type="monotone" dataKey="edgeRam" name="RAM" stroke="#10b981" strokeWidth={2} fill="url(#colorEdgeRam)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border flex flex-col shadow-sm h-[300px] ${theme.panel}`}>
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg"><Server size={18} /></div>
            <div><h3 className={`font-black text-sm ${theme.text}`}>Cloud Hosting Server</h3><p className="text-[10px] text-gray-500 font-bold uppercase">Backend API & PostgreSQL</p></div>
            <div className="ml-auto text-right">
              <div className="text-[10px] text-gray-500 font-bold">BANDWIDTH</div>
              <div className="text-lg font-black text-purple-400 flex items-center justify-end gap-1">
                <Activity size={14} /> {telemetryData.length > 0 ? telemetryData[telemetryData.length - 1].serverBandwidth.toFixed(0) : '--'} Mbps
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickMargin={10} minTickGap={20} />
                <YAxis yAxisId="left" tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickFormatter={(v) => `${v}%`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickFormatter={(v) => `${v}M`} />
                <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 'bold' }} />
                <Line yAxisId="left" type="monotone" dataKey="serverCpu" name="CPU" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="serverBandwidth" name="Bandwidth" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* SECTION 5: LIVE SESSIONS — pindah posisi */}
      <div className={`p-4 rounded-2xl border shadow-sm shrink-0 ${theme.panel}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl"><Users size={24} /></div>
          <div>
            <h3 className={`font-black text-sm ${theme.text}`}>Live Sessions Monitor</h3>
            <p className="text-[10px] text-gray-500 font-bold uppercase">Pindahkan Pilot · Spectator · Queue</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* PILOT */}
          <div className={`p-4 rounded-xl border ${theme.slot}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Pilot (Controller)</span>
              <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
            </div>
            {roomState?.pilot ? (
              <div className="flex items-center justify-between">
                <div className={`font-mono font-bold ${theme.text} break-all`}>
                  <div>{roomState.pilot.username}</div>
                  <div className="text-[10px] text-gray-500 font-normal">{roomState.pilot.ip}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {roleBtn(roomState.pilot.cid, 'MAKE_SPECTATOR', 'Turunkan ke Spectator', ArrowRightLeft, 'text-gray-400 hover:bg-gray-500/10')}
                  {roleBtn(roomState.pilot.cid, 'MAKE_QUEUE', 'Turunkan ke Queue', ArrowDown, 'text-orange-500 hover:bg-orange-500/10')}
                  {roleBtn(roomState.pilot.cid, 'KICK', 'Kick', Trash2, 'text-red-500 hover:bg-red-500/10')}
                </div>
              </div>
            ) : <span className="text-gray-500 italic text-xs">Kosong</span>}
          </div>

          {/* SPECTATORS */}
          <div className={`p-4 rounded-xl border ${theme.slot}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Spectators (Max 2)</span>
              <span className="text-xs font-bold text-gray-400">{roomState?.spectators?.length || 0}/2</span>
            </div>
            <div className="flex flex-col gap-2">
              {roomState?.spectators?.length ? roomState.spectators.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between border-b border-gray-700/30 pb-1 last:border-0">
                  <div className={`font-mono font-bold text-xs ${theme.text}`}>
                    <div>{s.username}</div><div className="text-[10px] text-gray-500 font-normal">{s.ip}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {roleBtn(s.cid, 'MAKE_PILOT', 'Jadikan Pilot', Activity, 'text-blue-500 hover:bg-blue-500/10')}
                    {roleBtn(s.cid, 'MAKE_QUEUE', 'Pindah ke Queue', ArrowDown, 'text-orange-500 hover:bg-orange-500/10')}
                    {roleBtn(s.cid, 'KICK', 'Kick', Trash2, 'text-red-500 hover:bg-red-500/10')}
                  </div>
                </div>
              )) : <span className="text-gray-500 italic text-xs">Kosong</span>}
            </div>
          </div>

          {/* QUEUE */}
          <div className={`p-4 rounded-xl border ${theme.slot}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Waiting Queue</span>
              <span className="text-xs font-bold text-orange-500">{roomState?.queue?.length || 0}</span>
            </div>
            <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
              {roomState?.queue?.length ? roomState.queue.map((q: any, i: number) => (
                <div key={i} className="flex items-center justify-between border-b border-gray-700/30 pb-1 last:border-0">
                  <div className={`font-mono font-bold text-xs ${theme.text}`}>
                    <div><span className="text-orange-500 mr-1">{i + 1}.</span>{q.username}</div>
                    <div className="text-[10px] text-gray-500 font-normal ml-4">{q.ip}</div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {roleBtn(q.cid, 'QUEUE_UP', 'Naik antrian', ArrowUp, 'text-gray-400 hover:bg-gray-500/10')}
                    {roleBtn(q.cid, 'QUEUE_DOWN', 'Turun antrian', ArrowDown, 'text-gray-400 hover:bg-gray-500/10')}
                    {roleBtn(q.cid, 'MAKE_SPECTATOR', 'Naikkan ke Spectator', ArrowRightLeft, 'text-gray-300 hover:bg-gray-500/10')}
                    {roleBtn(q.cid, 'MAKE_PILOT', 'Jadikan Pilot', Activity, 'text-blue-500 hover:bg-blue-500/10')}
                    {roleBtn(q.cid, 'KICK', 'Kick', Trash2, 'text-red-500 hover:bg-red-500/10')}
                  </div>
                </div>
              )) : <span className="text-gray-500 italic text-xs">Antrian kosong</span>}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 6: STORAGE + RBAC */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
        <div className={`p-4 rounded-2xl border flex flex-col shadow-sm ${theme.panel}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-slate-500/10 text-slate-500 rounded-xl"><HardDrive size={24} /></div>
            <div><h3 className={`font-black text-sm ${theme.text}`}>Storage Management</h3><p className="text-[10px] text-gray-500 font-bold uppercase">Dataset & Logs</p></div>
          </div>
          <div className="flex flex-col gap-3 mt-auto">
            <button onClick={handleExportData} className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
              <Download size={16} /> Export All Dataset
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handlePurgeCache} className="p-3 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1"><Trash2 size={16} /> Purge Cache</button>
              <button onClick={handlePurgeAllDatasets} className="p-3 bg-red-600/10 text-red-500 hover:bg-red-600 border border-red-600/30 hover:text-white rounded-xl text-[10px] font-bold flex flex-col items-center gap-1"><Trash2 size={16} /> PURGE ALL</button>
            </div>
            <button onClick={handleClearLogs} className="w-full p-2 bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 border border-gray-500/20 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5"><Trash2 size={14} /> Clear Audit Logs</button>
          </div>
        </div>

        <div className={`lg:col-span-2 rounded-2xl border flex flex-col overflow-hidden shadow-sm ${theme.panel}`}>
          <div className="p-4 border-b border-gray-800 bg-black/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-blue-500" />
              <div><h3 className={`font-black text-sm ${theme.text}`}>{t('rbac')}</h3><p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Login sync · hijau = online</p></div>
            </div>
            <button onClick={fetchOperators} className="p-1.5 rounded-lg border border-gray-700 hover:bg-gray-800" title="Muat ulang"><RefreshCw size={14} /></button>
          </div>
          <div className="overflow-auto flex-1 max-h-[280px]">
            <table className="w-full text-left relative">
              <thead className={`sticky top-0 z-10 text-[10px] uppercase font-bold tracking-wider ${theme.tableHeader}`}>
                <tr>
                  <th className="p-3 px-4">Operator</th>
                  <th className="p-3">Akses</th>
                  <th className="p-3">Sesi</th>
                  <th className="p-3">Login Terakhir</th>
                  <th className="p-3 text-right px-4">Aksi</th>
                </tr>
              </thead>
              <tbody className={`text-xs font-bold ${theme.text}`}>
                {userList.map(user => (
                  <tr key={user.id} className={`border-t transition-colors ${theme.rowHover}`}>
                    <td className="p-3 px-4 flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${user.online ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]' : 'bg-red-500'}`}></span>
                      {user.username}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-mono font-black ${user.role === 'ADMIN' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-400'}`}>{user.role}</span>
                    </td>
                    <td className="p-3">
                      <span className={`font-mono text-[10px] font-black ${user.online ? 'text-green-500' : 'text-gray-500'}`}>
                        {user.online ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 font-medium font-mono text-[10px]">{user.last_login || '—'}</td>
                    <td className="p-3 px-4 text-right flex items-center justify-end gap-1">
                      <button onClick={() => toggleUserRole(user.id, user.role)} className="px-2 py-1 bg-gray-800 border border-gray-700 hover:border-blue-500 rounded-lg text-[10px] font-bold text-gray-300">TOGGLE</button>
                      <button onClick={() => handleResetPassword(user.id)} className="p-1.5 text-yellow-500 hover:bg-yellow-500/10 rounded-lg" title="Reset Password"><Key size={14} /></button>
                      {user.username !== 'admin' && (
                        <button onClick={() => handleDeleteOperator(user.id)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg" title="Hapus Akun"><Trash2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
                {userList.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-500 font-sans">Belum ada operator terdaftar.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 7: RECENT AUDIT ACTIVITY (nyata dari /api/logs) */}
      <div className={`rounded-2xl border flex flex-col overflow-hidden shadow-sm shrink-0 ${theme.panel}`}>
        <div className="p-4 border-b border-gray-800 bg-black/10 flex items-center gap-2 shrink-0">
          <Activity size={18} className="text-gray-400" />
          <div>
            <h3 className={`font-black text-sm ${theme.text}`}>Aktivitas Terbaru</h3>
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">40 event audit terakhir (live)</p>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[240px]" style={{ scrollbarWidth: 'none' }}>
          <table className="w-full text-left border-collapse">
            <tbody className={`text-[11px] font-mono ${theme.text}`}>
              {recentLogs.map((log, i) => (
                <tr key={i} className={`border-b transition-colors ${theme.rowHover}`}>
                  <td className="p-2.5 whitespace-nowrap text-gray-500">{log.timestamp}</td>
                  <td className="p-2.5 font-bold whitespace-nowrap">{log.operator}</td>
                  <td className="p-2.5 font-sans truncate max-w-[280px]" title={log.action}>{log.action}</td>
                  <td className="p-2.5 text-center">
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-sans font-bold ${
                      String(log.status).toUpperCase() === 'SUCCESS' ? 'bg-green-500/10 text-green-500'
                      : String(log.status).toUpperCase() === 'CANCELLED' ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-red-500/10 text-red-500'}`}>
                      {String(log.status).toUpperCase() === 'SUCCESS' ? 'OK' : String(log.status).toUpperCase() === 'CANCELLED' ? 'BATAL' : 'GAGAL'}
                    </span>
                  </td>
                </tr>
              ))}
              {recentLogs.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-500 font-sans">Belum ada aktivitas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* KONFIRMASI RESTART EDGE */}
      {confirmRestart && (
        <div className={theme.overlay}>
          <div className={`w-full max-w-sm rounded-2xl p-6 border shadow-2xl text-center ${theme.panel}`}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center"><RefreshCcw size={28} /></div>
            <h3 className={`font-bold text-lg mb-1 ${theme.text}`}>Restart layanan Edge?</h3>
            <p className={`text-xs mb-5 ${theme.textMuted}`}>Proses kontrol di Jetson akan dijalankan ulang (os.execv). Live stream & kontrol motor terputus sesaat. Bukan reboot OS.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRestart(false)} className="flex-1 py-3 rounded-xl font-bold border border-gray-600 text-gray-300 hover:bg-gray-800">Batal</button>
              <button onClick={doRestartEdge} className="flex-1 py-3 rounded-xl font-bold bg-amber-600 hover:bg-amber-700 text-white">Restart</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
