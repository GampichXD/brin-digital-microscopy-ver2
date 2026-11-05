import { useEffect, useRef } from 'react';

interface HardwareSocketProps {
  isSystemHardwareEnabled: boolean;
  cameraActive: boolean;
  setVideoSrc: (src: string | null) => void;
  setGrblStatus: (status: string) => void;
  setJetsonTemperatures: (temps: { cpu: number | null; gpu: number | null }) => void;
  setLimitSwitchState: (state: string) => void;
  setJetsonRam: (ram: string) => void;
  setJetsonRom: (rom: string) => void;
  setLastEchoGCode: (gcode: string) => void;
  setEdgeTelemetry?: (data: { cpu: number; ram: number; temp: number }) => void;
  setStreamRole: (role: 'PILOT' | 'SPECTATOR' | 'QUEUED' | 'DISCONNECTED') => void;
  setRoomState?: (state: any) => void;
  currentUser: string | null;
  frameCounterRef?: { current: number };
}

export function useHardwareSocket({
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
  setStreamRole,
  setRoomState,
  currentUser,
  frameCounterRef,
}: HardwareSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const cameraActiveRef = useRef<boolean>(cameraActive);
  const lastInteractionTime = useRef<number>(Date.now());

  // Sync latest camera state to ref for websocket handlers
  useEffect(() => {
    cameraActiveRef.current = cameraActive;
  }, [cameraActive]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!isSystemHardwareEnabled || !token) {
      return;
    }

    console.log('[GLOBAL WEBSOCKET] Menginisialisasi sirkuit pusat lewat Redis Client...');
    
    // Connect to client websocket route with authentication token
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/hardware/client/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[GLOBAL WEBSOCKET] Tersambung penuh ke makelar data VPS. Pipa siaran aktif.');

      if (cameraActiveRef.current && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'START_STREAM' }));
      }
    };

    // Track user activity for PING mechanism
    const updateActivity = () => { lastInteractionTime.current = Date.now(); };
    const activityEvents = ['mousemove', 'keydown', 'click', 'pointerdown', 'touchstart', 'wheel', 'scroll'];
    activityEvents.forEach((name) => window.addEventListener(name, updateActivity, { passive: true }));

    // HEARTBEAT = tanda koneksi hidup, dikirim tanpa syarat. Bukan interaksi:
    // spectator yang hanya menonton tetap aman, Pilot yang diam tetap bisa diturunkan.
    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'HEARTBEAT' }));
      }
    }, 20000);

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        // Send PING only if user was active in the last 30 seconds
        if (Date.now() - lastInteractionTime.current < 30000) {
          ws.send(JSON.stringify({ action: 'PING' }));
        }
      }
    }, 10000);

    ws.onmessage = async (event) => {
      try {
        const res = JSON.parse(event.data);
        
        if (res.event === 'ROLE_ASSIGNED') {
          console.log(`[GLOBAL WEBSOCKET] Peran di-assign oleh server: ${res.role}`);
          if (res.role === 'MAX_DEVICES_REACHED') {
            alert('Akses Ditolak: Anda telah mencapai batas maksimal login (3 perangkat) dengan akun ini.');
            return;
          }
          if (res.role === 'IDLE_TIMEOUT') {
            alert('Koneksi ke server terputus terlalu lama. Muat ulang halaman untuk tersambung kembali.');
            return;
          }
          if (res.reason === 'IDLE') {
            const message = res.role === 'SPECTATOR'
              ? 'Anda tidak aktif lebih dari 10 menit. Anda kini Spectator.'
              : 'Anda tidak aktif lebih dari 10 menit. Anda kini masuk antrean.';
            window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type: 'info' } }));
          }
          setStreamRole(res.role as 'PILOT' | 'SPECTATOR' | 'QUEUED');
        }
        else if (res.event === 'COMMAND_REJECTED') {
          const messages: Record<string, string> = {
            NOT_PILOT: 'Perintah ditolak: Anda bukan Pilot.',
            BUS_DISABLED: 'Perintah ditolak: hardware bus sedang nonaktif.',
            RATE_LIMIT: 'Perintah terlalu cepat. Beri jeda minimal 0,5 detik antar gerakan.',
          };
          const message = messages[res.reason] || `Perintah ditolak server (${res.reason}).`;
          window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type: 'warning' } }));
        }
        else if (res.event === 'ROOM_STATE_UPDATE') {
          if (setRoomState) setRoomState(res);
        }
        else if (res.event === 'STREAM_DATA') {
          // Dihitung per pesan: React bisa menggabungkan beberapa setVideoSrc dalam satu render.
          if (frameCounterRef) frameCounterRef.current += 1;
          setVideoSrc(res.image);
        }
        else if (res.event === 'TELEMETRY_DATA') {
          setGrblStatus(res.status);
          
          let currentTemp = 0;
          if (res.jetson_temperatures) {
            setJetsonTemperatures(res.jetson_temperatures);
            currentTemp = res.jetson_temperatures.cpu || 0;
          } else {
            setJetsonTemperatures({ cpu: typeof res.jetson_temp_c === 'number' ? res.jetson_temp_c : null, gpu: null });
            currentTemp = typeof res.jetson_temp_c === 'number' ? res.jetson_temp_c : 0;
          }
          
          setLimitSwitchState(res.limit_switch ?? 'N/A');
          
          let parsedRamPercent = 0;
          if (res.ram_usage) {
            setJetsonRam(res.ram_usage);
            const parts = res.ram_usage.replace(' GB', '').split('/');
            if (parts.length === 2) {
              const used = parseFloat(parts[0]);
              const total = parseFloat(parts[1]);
              if (total > 0) parsedRamPercent = Math.round((used / total) * 100);
            }
          }
          
          if (res.rom_usage) setJetsonRom(res.rom_usage);
          if (res.position) {
            setLastEchoGCode(`X:${res.position.X.toFixed(2)} Y:${res.position.Y.toFixed(2)} Z:${res.position.Z}`);
          }
          
          if (setEdgeTelemetry) {
            setEdgeTelemetry({
              cpu: res.edge_cpu_usage || 0,
              ram: parsedRamPercent,
              temp: currentTemp
            });
          }
        }
      } catch (err) {
        console.error("Gagal memproses pesan WebSocket:", err);
      }
    };

    ws.onclose = (event) => {
      console.log(`[GLOBAL WEBSOCKET] Putus sirkuit broker (Code: ${event.code}). Memicu siaga.`);

      // 4001 = token JWT kadaluarsa/invalid (dikirim server setelah accept).
      // 1008 = policy violation. Keduanya berarti sesi login tidak sah lagi.
      if (event.code === 4001 || event.code === 1008) {
        localStorage.removeItem('token');
        alert('Sesi login Anda telah berakhir. Silakan login kembali.');
        window.location.reload();
        return;
      }

      if (wsRef.current === ws) {
        wsRef.current = null;
        setVideoSrc(null);
        setGrblStatus('OFFLINE');
        setStreamRole('DISCONNECTED');
      }
    };

    return () => {
      activityEvents.forEach((name) => window.removeEventListener(name, updateActivity));
      clearInterval(heartbeatInterval);
      clearInterval(pingInterval);

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
        setVideoSrc(null);
        setGrblStatus('OFFLINE');
        setStreamRole('DISCONNECTED');
      }
    };
  }, [isSystemHardwareEnabled, currentUser, setVideoSrc, setGrblStatus, setJetsonTemperatures, setLimitSwitchState, setJetsonRam, setJetsonRom, setLastEchoGCode, setEdgeTelemetry, setStreamRole, setRoomState, frameCounterRef]);

  return wsRef;
}
