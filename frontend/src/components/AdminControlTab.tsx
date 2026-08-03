import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Cpu, ToggleLeft, ToggleRight, Trash2, Power, HardDrive, Download, Crosshair, CheckCircle2, ShieldAlert, Activity, Server, Thermometer, Scan, Network, Terminal, Video, Save, RotateCcw, Key } from 'lucide-react';
import { showToast } from '../utils/toast';
import { useGlobalContext } from '../context/GlobalContext';
import { useTranslation } from '../hooks/useTranslation';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface LabOperator {
  id: number;
  username: string;
  role: 'ADMIN' | 'OPERATOR';
  status: string;
  last_login: string | null;
}

export default function AdminControlTab() {
  const { isDarkMode, isSystemHardwareEnabled, setIsSystemHardwareEnabled, telemetryData } = useGlobalContext();
  const { t } = useTranslation();
  
  const [userList, setUserList] = useState<LabOperator[]>([]);
  const [auditLogs, setAuditLogs] = useState<string[]>([]);

  // Default values
  const defaultSettings = {
    feedRate: 100,
    cameraRes: '1080p',
    cameraFps: '60',
    exposure: 50,
    videoSource: '/dev/video0',
    confThreshold: 60,
    aiModel: 'YOLOv8-Nano',
    ipBinding: '192.168.1.100',
    apiPort: '8000',
  };

  // Mock Settings States
  const [feedRate, setFeedRate] = useState(defaultSettings.feedRate);
  const [cameraRes, setCameraRes] = useState(defaultSettings.cameraRes);
  const [cameraFps, setCameraFps] = useState(defaultSettings.cameraFps);
  const [exposure, setExposure] = useState(defaultSettings.exposure);
  const [videoSource, setVideoSource] = useState(defaultSettings.videoSource);
  const [confThreshold, setConfThreshold] = useState(defaultSettings.confThreshold);
  const [aiModel, setAiModel] = useState(defaultSettings.aiModel);
  const [ipBinding, setIpBinding] = useState(defaultSettings.ipBinding);
  const [apiPort, setApiPort] = useState(defaultSettings.apiPort);

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    tableHeader: isDarkMode ? 'bg-gray-950 text-gray-400' : 'bg-gray-100 text-gray-600',
    rowHover: isDarkMode ? 'hover:bg-gray-800/40 border-gray-800' : 'hover:bg-gray-50 border-gray-100',
    inputBg: isDarkMode ? 'bg-gray-950 border-gray-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-800'
  };

  const fetchOperators = async () => {
    try {
      const response = await api.get<LabOperator[]>('/api/auth/operators');
      setUserList(response.data);
    } catch (error) {
      console.error("Gagal mengambil data operator:", error);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await api.get<any[]>('/api/logs'); // Logs router is just /api/logs
      if (Array.isArray(response.data)) {
        // Format to array of strings if they are objects, assuming response has a 'message' or 'detail'
        const strings = response.data.map(l => l.message || JSON.stringify(l));
        setAuditLogs(strings);
      }
    } catch (error) {
      // Fail silently for logs
    }
  };

  useEffect(() => {
    fetchOperators();
    fetchAuditLogs();
    const interval = setInterval(fetchAuditLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleUserRole = async (id: number, currentRole: string) => {
    try {
      const newRole = currentRole === 'ADMIN' ? 'OPERATOR' : 'ADMIN';
      await api.put(`/api/auth/operators/${id}/role`, { role: newRole });
      showToast(`Berhasil mengubah role menjadi ${newRole}`, 'success');
      fetchOperators();
    } catch (err) {
      console.error(err);
      showToast('Gagal merubah role operator', 'error');
    }
  };

  const handleResetPassword = async (id: number) => {
    try {
      await api.put('/api/auth/reset-password', { user_id: id });
      showToast("Password berhasil di-reset ke default (123456).", "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal mereset password via API. Pastikan endpoint tersedia di backend.", "error");
    }
  };

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

  const handleToggleHardwareBus = async () => {
    try {
      const targetStatus = !isSystemHardwareEnabled;
      await api.post('/api/hardware/bus/toggle', { enabled: targetStatus });
      setIsSystemHardwareEnabled(targetStatus);
      showToast(targetStatus ? "Bus daya hardware DIHIDUPKAN." : "Bus daya hardware DIMATIKAN.", targetStatus ? "success" : "error");
    } catch (error) {
      console.error("Gagal mengirim sinyal interupsi ke bus daya:", error);
      showToast("Gagal mengirim sinyal interupsi ke bus daya.", "error");
    }
  };

  const handleHoming = async () => {
    try {
      await api.post('/api/hardware/motor/home');
      showToast("Siklus Homing ($H) dimulai.", "info");
    } catch (error) {
      showToast("Gagal memulai Homing.", "error");
    }
  };

  const handleClearAlarm = async () => {
    try {
      await api.post('/api/hardware/motor/unlock');
      showToast("Alarm GRBL berhasil dilepas ($X).", "success");
    } catch (error) {
      showToast("Gagal melepas alarm.", "error");
    }
  };

  const handleExportData = async () => {
    try {
      showToast("Memulai unduhan dataset ZIP...", "info");
      const response = await api.get('/api/dataset/storage/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'dataset_export.zip');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      showToast("Unduhan dataset berhasil.", "success");
    } catch (err) {
      showToast("Gagal mengekspor data. Backend API mungkin belum tersedia.", "error");
    }
  };

  const handlePurgeCache = async () => {
    if (!confirm("Yakin ingin menghapus seluruh cache dan file sementara?")) return;
    try {
      showToast("Membersihkan cache memory dan logs...", "info");
      await api.delete('/api/dataset/storage/purge-cache');
      showToast("Cache berhasil dibersihkan.", "success");
    } catch (err) {
      showToast("Gagal membersihkan cache via API.", "error");
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("Yakin ingin menghapus seluruh System Audit Logs?")) return;
    try {
      await api.delete('/api/logs');
      setAuditLogs([]);
      showToast("Seluruh log berhasil dihapus.", "success");
    } catch (err) {
      showToast("Gagal menghapus log.", "error");
    }
  };

  const handleApply = async (section: string) => {
    try {
      showToast(`Menerapkan pengaturan ${section}...`, "info");
      
      switch(section) {
        case 'CNC':
          await api.post('/api/hardware/cnc/settings', { feed_rate: feedRate, backlash: 0.1, acceleration: 100, settle_time: 100 });
          break;
        case 'Camera':
          await api.post('/api/hardware/camera/settings', { 
            shutter_speed: 1000, 
            iso: exposure
          });
          break;
        case 'AI':
          await api.put('/api/hardware/config/ai', { 
            model: aiModel, 
            confThreshold 
          });
          break;
        case 'Network':
          await api.put('/api/hardware/config/network', { 
            ipBinding, 
            apiPort 
          });
          break;
      }
      
      showToast(`Pengaturan ${section} berhasil diterapkan!`, "success");
    } catch (err) {
      showToast(`Gagal menerapkan pengaturan ${section}. Pastikan peladen aktif.`, "error");
    }
  };

  const handleReset = async (section: string) => {
    try {
      showToast(`Mengembalikan pengaturan ${section} ke default...`, "info");
      
      // Tell backend to reset this section
      await api.post(`/api/hardware/config/${section.toLowerCase()}/default`);
      
      // Update local state to match defaults visually
      switch(section) {
        case 'CNC':
          setFeedRate(defaultSettings.feedRate);
          break;
        case 'Camera':
          setCameraRes(defaultSettings.cameraRes);
          setCameraFps(defaultSettings.cameraFps);
          setExposure(defaultSettings.exposure);
          setVideoSource(defaultSettings.videoSource);
          break;
        case 'AI':
          setAiModel(defaultSettings.aiModel);
          setConfThreshold(defaultSettings.confThreshold);
          break;
        case 'Network':
          setIpBinding(defaultSettings.ipBinding);
          setApiPort(defaultSettings.apiPort);
          break;
      }
      showToast(`Pengaturan ${section} dikembalikan ke Default.`, "success");
    } catch (err) {
      showToast(`Gagal mereset pengaturan ${section}.`, "error");
    }
  };

  // Action Buttons Component for Reuse
  const SettingActionButtons = ({ sectionName }: { sectionName: string }) => (
    <div className="flex gap-2 mt-4 pt-3 border-t border-gray-800/30">
      <button 
        onClick={() => handleReset(sectionName)}
        className="flex-1 py-1.5 px-3 rounded-lg text-[10px] font-bold border border-gray-500/30 text-gray-500 hover:bg-gray-500/10 hover:text-gray-400 transition-colors flex items-center justify-center gap-1.5"
      >
        <RotateCcw size={12} /> Default
      </button>
      <button 
        onClick={() => handleApply(sectionName)}
        className="flex-1 py-1.5 px-3 rounded-lg text-[10px] font-bold bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 transition-colors flex items-center justify-center gap-1.5"
      >
        <Save size={12} /> Terapkan
      </button>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-6 pr-1 pb-10" style={{ scrollbarWidth: 'none' }}>
      
      {/* SECTION 1: MASTER HARDWARE & CNC CONTROL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
        
        {/* PANEL: POWER BUS */}
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

        {/* PANEL: CNC MAINTENANCE */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm col-span-1 lg:col-span-2 ${theme.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-500/10 text-orange-500 rounded-xl"><Crosshair size={24} /></div>
              <div>
                <h3 className={`font-black text-sm ${theme.text}`}>CNC & GRBL Maintenance</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Motor Calibration & Feed Rate</p>
              </div>
            </div>
            
            {/* Feed Rate Override */}
            <div className="flex flex-col items-end w-48">
              <span className="text-[10px] font-bold text-gray-500 mb-1">FEED RATE OVERRIDE: {feedRate}%</span>
              <input 
                type="range" min="10" max="200" step="10" 
                value={feedRate} onChange={(e) => setFeedRate(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mt-auto">
            <button 
              onClick={handleHoming}
              disabled={!isSystemHardwareEnabled}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all ${!isSystemHardwareEnabled ? 'opacity-50 cursor-not-allowed bg-gray-800 border-gray-700 text-gray-500' : 'bg-blue-600/10 border-blue-500/30 text-blue-400 hover:bg-blue-600/20 hover:border-blue-500'}`}
            >
              <Crosshair size={16} /> Auto Homing ($H)
            </button>
            <button 
              onClick={handleClearAlarm}
              disabled={!isSystemHardwareEnabled}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all ${!isSystemHardwareEnabled ? 'opacity-50 cursor-not-allowed bg-gray-800 border-gray-700 text-gray-500' : 'bg-green-600/10 border-green-500/30 text-green-400 hover:bg-green-600/20 hover:border-green-500'}`}
            >
              <CheckCircle2 size={16} /> Clear Alarm ($X)
            </button>
          </div>
          
          <SettingActionButtons sectionName="CNC" />
        </div>
      </div>

      {/* SECTION 2: OPTICS & VISION AI SETTINGS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
        
        {/* CAMERA SETTINGS */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm ${theme.panel}`}>
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-pink-500/10 text-pink-500 rounded-xl"><Video size={20} /></div>
              <div>
                <h3 className={`font-black text-sm ${theme.text}`}>Camera Optics</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Webcam / Sensor Settings</p>
              </div>
            </div>
            <div className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Resolution</label>
                  <select value={cameraRes} onChange={(e) => setCameraRes(e.target.value)} className={`w-full p-2.5 rounded-xl border outline-none ${theme.inputBg}`}>
                    <option value="144p">144p (Ultra Low)</option>
                    <option value="240p">240p (Very Low)</option>
                    <option value="360p">360p (Low)</option>
                    <option value="480p">480p (SD)</option>
                    <option value="720p">720p (HD)</option>
                    <option value="1080p">1080p (FHD)</option>
                    <option value="4K">4K (UHD)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">Framerate (FPS)</label>
                  <select value={cameraFps} onChange={(e) => setCameraFps(e.target.value)} className={`w-full p-2.5 rounded-xl border outline-none ${theme.inputBg}`}>
                    <option value="30">30 FPS</option>
                    <option value="60">60 FPS</option>
                    <option value="120">120 FPS</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Video Source Node</label>
                <select value={videoSource} onChange={(e) => setVideoSource(e.target.value)} className={`w-full p-2.5 rounded-xl border outline-none ${theme.inputBg}`}>
                  <option value="/dev/video0">/dev/video0 (Main Camera)</option>
                  <option value="/dev/video1">/dev/video1 (Secondary)</option>
                  <option value="usb-camera">USB WebCam Generic</option>
                </select>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] text-gray-500">Exposure & White Balance Lock</label>
                  <span className="text-pink-500">{exposure}%</span>
                </div>
                <input type="range" min="10" max="100" value={exposure} onChange={(e) => setExposure(parseInt(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
              </div>
            </div>
          </div>
          <SettingActionButtons sectionName="Camera" />
        </div>

        {/* AI INFERENCE SETTINGS */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm ${theme.panel}`}>
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-cyan-500/10 text-cyan-500 rounded-xl"><Scan size={20} /></div>
              <div>
                <h3 className={`font-black text-sm ${theme.text}`}>Vision AI Inference</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Machine Learning Model</p>
              </div>
            </div>
            <div className="space-y-4 text-xs font-bold">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Model Selection (Weights)</label>
                <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} className={`w-full p-2.5 rounded-xl border outline-none ${theme.inputBg}`}>
                  <option value="YOLOv8-Nano">YOLOv8-Nano (Fastest, Edge)</option>
                  <option value="YOLOv8-Medium">YOLOv8-Medium (Balanced)</option>
                  <option value="Custom-ResNet">Custom ResNet50 (Accurate)</option>
                </select>
              </div>
              <div className="pt-2">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] text-gray-500">Confidence Threshold</label>
                  <span className="text-cyan-500">{confThreshold}%</span>
                </div>
                <input type="range" min="1" max="100" value={confThreshold} onChange={(e) => setConfThreshold(parseInt(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                <p className="text-[9px] text-gray-500 mt-2 font-medium">Hanya mendeteksi objek/koloni yang akurasinya di atas batas minimal ini.</p>
              </div>
            </div>
          </div>
          <SettingActionButtons sectionName="AI" />
        </div>
      </div>

      {/* SECTION 3: CHARTS MONITORING */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
        
        {/* EDGE DEVICE (JETSON) CHART */}
        <div className={`p-4 rounded-2xl border flex flex-col shadow-sm h-[320px] ${theme.panel}`}>
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg"><Cpu size={18} /></div>
            <div>
              <h3 className={`font-black text-sm ${theme.text}`}>Edge Device (Jetson)</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase">Local Inference Node</p>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[10px] text-gray-500 font-bold">AVG CPU TEMP</div>
              <div className="text-lg font-black text-blue-400 flex items-center justify-end gap-1">
                <Thermometer size={14} /> 
                {telemetryData.length > 0 ? telemetryData[telemetryData.length - 1].edgeTemp.toFixed(1) : '--'}°C
              </div>
            </div>
          </div>
          
          <div className="flex-1 min-h-0 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={telemetryData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEdgeCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorEdgeRam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickMargin={10} minTickGap={20} />
                <YAxis tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickFormatter={(val) => `${val}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}
                  itemStyle={{ color: isDarkMode ? '#e5e7eb' : '#1f2937' }}
                />
                <Area type="monotone" dataKey="edgeCpu" name="CPU Usage" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorEdgeCpu)" isAnimationActive={false} />
                <Area type="monotone" dataKey="edgeRam" name="RAM Usage" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorEdgeRam)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CLOUD HOSTING CHART */}
        <div className={`p-4 rounded-2xl border flex flex-col shadow-sm h-[320px] ${theme.panel}`}>
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg"><Server size={18} /></div>
            <div>
              <h3 className={`font-black text-sm ${theme.text}`}>Cloud Hosting Server</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase">PostgreSQL & Backend API</p>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[10px] text-gray-500 font-bold">BANDWIDTH</div>
              <div className="text-lg font-black text-purple-400 flex items-center justify-end gap-1">
                <Activity size={14} />
                {telemetryData.length > 0 ? telemetryData[telemetryData.length - 1].serverBandwidth.toFixed(0) : '--'} Mbps
              </div>
            </div>
          </div>
          
          <div className="flex-1 min-h-0 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickMargin={10} minTickGap={20} />
                <YAxis yAxisId="left" tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickFormatter={(val) => `${val}%`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickFormatter={(val) => `${val}M`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}
                />
                <Line yAxisId="left" type="monotone" dataKey="serverCpu" name="CPU Usage" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="serverBandwidth" name="Bandwidth" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* SECTION 4: NETWORK & SYSTEM AUDIT LOGS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
        
        {/* NETWORK SETTINGS */}
        <div className={`p-4 rounded-2xl border flex flex-col justify-between shadow-sm ${theme.panel}`}>
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-yellow-500/10 text-yellow-500 rounded-xl"><Network size={20} /></div>
              <div>
                <h3 className={`font-black text-sm ${theme.text}`}>Network Configuration</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Socket & IP Binding</p>
              </div>
            </div>
            <div className="space-y-4 text-xs font-bold mt-auto">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Local Edge IP Binding</label>
                <input type="text" value={ipBinding} onChange={(e) => setIpBinding(e.target.value)} className={`w-full p-2.5 rounded-xl border outline-none font-mono ${theme.inputBg}`} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Backend API Port</label>
                <input type="text" value={apiPort} onChange={(e) => setApiPort(e.target.value)} className={`w-full p-2.5 rounded-xl border outline-none font-mono ${theme.inputBg}`} />
              </div>
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-between mt-2">
                <span className="text-green-500 text-[10px] font-black uppercase">Socket Status</span>
                <span className="flex items-center gap-1 text-green-400 font-mono text-xs"><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping mr-1"></div> LISTENING</span>
              </div>
            </div>
          </div>
          <SettingActionButtons sectionName="Network" />
        </div>

        {/* AUDIT LOGS TERMINAL */}
        <div className={`col-span-1 lg:col-span-2 rounded-2xl border flex flex-col shadow-sm ${theme.panel}`}>
          <div className="p-4 border-b border-gray-800 bg-black/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Terminal size={18} className="text-gray-400" />
              <div>
                <h3 className={`font-black text-sm ${theme.text}`}>System Audit Logs</h3>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Live Backend Events</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearLogs}
                title="Hapus semua log"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
              >
                <Trash2 size={12} /> CLEAR
              </button>
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
          </div>
          <div className={`flex-1 p-4 overflow-y-auto font-mono text-[10px] sm:text-xs min-h-[220px] ${isDarkMode ? 'bg-[#0d1117] text-gray-300' : 'bg-gray-900 text-gray-300'}`}>
            <p className="text-blue-400 mb-2">admin@jetson-node:~# tail -f /var/log/digimic/audit.log</p>
            {auditLogs.length > 0 ? (
              auditLogs.map((log, index) => (
                <p key={index} dangerouslySetInnerHTML={{__html: log.replace(/\[WARN\]/g, '<span class="text-red-400">[WARN]</span>').replace(/\[INFO\]/g, '<span class="text-green-400">[INFO]</span>').replace(/\[ACTN\]/g, '<span class="text-yellow-400">[ACTN]</span>').replace(/\[SYST\]/g, '<span class="text-blue-400">[SYST]</span>')}}></p>
              ))
            ) : (
              <p className="text-gray-500 italic">Menunggu log dari peladen...</p>
            )}
            <p className="mt-2 text-gray-500 animate-pulse">_ menunggu log baru...</p>
          </div>
        </div>

      </div>

      {/* SECTION 5: DB & RBAC */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
        
        {/* DATABASE MANAGEMENT */}
        <div className={`p-4 rounded-2xl border flex flex-col shadow-sm ${theme.panel}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-slate-500/10 text-slate-500 rounded-xl"><HardDrive size={24} /></div>
            <div>
              <h3 className={`font-black text-sm ${theme.text}`}>Storage Management</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase">Dataset & Logs</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 mt-auto">
            <button onClick={handleExportData} className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
              <Download size={16} /> Export All Dataset
            </button>
            <button onClick={handlePurgeCache} className="w-full p-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2">
              <Trash2 size={16} /> Purge Temporary Cache
            </button>
          </div>
        </div>

        {/* RBAC MANAGEMENT */}
        <div className={`col-span-1 lg:col-span-2 rounded-2xl border flex flex-col overflow-hidden shadow-sm h-full ${theme.panel}`}>
          <div className="p-4 border-b border-gray-800 bg-black/10 flex items-center gap-2 shrink-0">
            <ShieldAlert size={18} className="text-blue-500" />
            <div>
              <h3 className={`font-black text-sm ${theme.text}`}>{t('rbac')}</h3>
              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{t('labOperatorAuth')}</p>
            </div>
          </div>
          <div className="overflow-auto flex-1 max-h-[250px]">
            <table className="w-full text-left relative">
              <thead className={`sticky top-0 z-10 text-[10px] uppercase font-bold tracking-wider ${theme.tableHeader}`}>
                <tr>
                  <th className="p-3 px-4">{t('operatorId')}</th>
                  <th className="p-3">{t('accessLevel')}</th>
                  <th className="p-3">{t('tokenStatus')}</th>
                  <th className="p-3 text-right px-4">{t('changeAuth')}</th>
                </tr>
              </thead>
              <tbody className={`text-xs font-bold ${theme.text}`}>
                {userList.map(user => (
                  <tr key={user.id} className={`border-t transition-colors ${theme.rowHover}`}>
                    <td className="p-3 px-4 flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${user.status === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      {user.username}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-mono font-black ${user.role === 'ADMIN' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-400'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 font-medium">{user.status}</td>
                    <td className="p-3 px-4 text-right flex items-center justify-end gap-1">
                      <button onClick={() => toggleUserRole(user.id, user.role)} className="px-2 py-1 bg-gray-800 border border-gray-700 hover:border-blue-500 rounded-lg text-[10px] font-bold text-gray-300 transition-colors">
                        TOGGLE
                      </button>
                      <button onClick={() => handleResetPassword(user.id)} className="p-1.5 text-yellow-500 hover:bg-yellow-500/10 rounded-lg ml-1" title="Reset Password">
                        <Key size={14}/>
                      </button>
                      {user.username !== 'admin' && (
                        <button onClick={() => handleDeleteOperator(user.id)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg" title="Hapus Akun">
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
