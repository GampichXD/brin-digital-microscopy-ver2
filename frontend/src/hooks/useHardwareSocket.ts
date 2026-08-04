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
}: HardwareSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const cameraActiveRef = useRef<boolean>(cameraActive);

  // Sync latest camera state to ref for websocket handlers
  useEffect(() => {
    cameraActiveRef.current = cameraActive;
  }, [cameraActive]);

  useEffect(() => {
    if (!isSystemHardwareEnabled) {
      return;
    }

    console.log('[GLOBAL WEBSOCKET] Menginisialisasi sirkuit pusat lewat Redis Client...');
    
    // Connect to client websocket route
    const ws = new WebSocket('ws://127.0.0.1:8000/api/hardware/client/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[GLOBAL WEBSOCKET] Tersambung penuh ke makelar data VPS. Pipa siaran aktif.');

      if (cameraActiveRef.current && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'START_STREAM' }));
      }
    };

    ws.onmessage = async (event) => {
      try {
        const res = JSON.parse(event.data);
        
        if (res.event === 'STREAM_DATA') {
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
      if (wsRef.current === ws) {
        wsRef.current = null;
        setVideoSrc(null);
        setGrblStatus('OFFLINE');
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
        setVideoSrc(null);
        setGrblStatus('OFFLINE');
      }
    };
  }, [isSystemHardwareEnabled, setVideoSrc, setGrblStatus, setJetsonTemperatures, setLimitSwitchState, setJetsonRam, setJetsonRom, setLastEchoGCode, setEdgeTelemetry]);

  return wsRef;
}
