import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHardwareSocket } from './useHardwareSocket';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: MockWebSocket[] = [];
  readyState = MockWebSocket.OPEN;
  sent: Record<string, unknown>[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
  }

  receive(message: unknown) {
    // Kurung kurawal wajib: onmessage async, dan act yang menerima promise tanpa await
    // membuat effect pada render berikutnya tidak pernah dijalankan.
    act(() => { void this.onmessage?.({ data: JSON.stringify(message) }); });
  }
}

function setup(overrides = {}) {
  const props = {
    isSystemHardwareEnabled: true,
    cameraActive: false,
    setVideoSrc: vi.fn(),
    setGrblStatus: vi.fn(),
    setJetsonTemperatures: vi.fn(),
    setLimitSwitchState: vi.fn(),
    setJetsonRam: vi.fn(),
    setJetsonRom: vi.fn(),
    setLastEchoGCode: vi.fn(),
    setStreamRole: vi.fn(),
    currentUser: 'uji',
    ...overrides,
  };
  renderHook(() => useHardwareSocket(props));
  return { props, ws: MockWebSocket.instances[MockWebSocket.instances.length - 1] };
}

describe('useHardwareSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('alert', vi.fn());
    // Hanya interval: React butuh setTimeout dan MessageChannel asli untuk menjalankan effect.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    localStorage.setItem('token', 'token-uji');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('tidak membuka koneksi tanpa token atau saat bus mati', () => {
    localStorage.clear();
    setup();
    expect(MockWebSocket.instances).toHaveLength(0);
    localStorage.setItem('token', 'x');
    setup({ isSystemHardwareEnabled: false });
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('ROLE_ASSIGNED mengubah peran', () => {
    const { props, ws } = setup();
    ws.receive({ event: 'ROLE_ASSIGNED', role: 'SPECTATOR' });
    expect(props.setStreamRole).toHaveBeenCalledWith('SPECTATOR');
  });

  it('diturunkan karena diam memakai toast, bukan alert', () => {
    const toast = vi.fn();
    window.addEventListener('show-toast', toast);
    const { props, ws } = setup();
    ws.receive({ event: 'ROLE_ASSIGNED', role: 'SPECTATOR', reason: 'IDLE' });
    window.removeEventListener('show-toast', toast);
    expect(toast).toHaveBeenCalledOnce();
    expect(window.alert).not.toHaveBeenCalled();
    expect(props.setStreamRole).toHaveBeenCalledWith('SPECTATOR');
  });

  it('IDLE_TIMEOUT menampilkan alert koneksi terputus', () => {
    const { props, ws } = setup();
    ws.receive({ event: 'ROLE_ASSIGNED', role: 'IDLE_TIMEOUT' });
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Koneksi ke server terputus terlalu lama'));
    expect(props.setStreamRole).not.toHaveBeenCalled();
  });

  it('TELEMETRY_DATA memperbarui status, dan suhu yang sama tidak memicu update ulang', () => {
    const { props, ws } = setup();
    const telemetry = {
      event: 'TELEMETRY_DATA', status: 'Idle', limit_switch: 'N/A', ram_usage: '2.00/8.00 GB',
      rom_usage: '1/2 GB', jetson_temperatures: { cpu: 50, gpu: 40 }, position: { X: 1, Y: 2, Z: 3 },
    };
    ws.receive(telemetry);
    ws.receive(telemetry);
    expect(props.setGrblStatus).toHaveBeenCalledWith('Idle');
    expect(props.setLastEchoGCode).toHaveBeenCalledWith('X:1.00 Y:2.00 Z:3');
    expect(props.setJetsonTemperatures).toHaveBeenCalledOnce();
  });

  it('STREAM_DATA dihitung per pesan', () => {
    const frameCounterRef = { current: 0 };
    const { ws } = setup({ frameCounterRef });
    ws.receive({ event: 'STREAM_DATA', image: 'a' });
    ws.receive({ event: 'STREAM_DATA', image: 'a' });
    expect(frameCounterRef.current).toBe(2);
  });

  it('HEARTBEAT tetap terkirim walau pengguna diam, PING berhenti setelah 30 detik', () => {
    const { ws } = setup();
    act(() => { vi.advanceTimersByTime(60000); });
    const count = (action: string) => ws.sent.filter((m) => m.action === action).length;
    expect(count('HEARTBEAT')).toBe(3);
    expect(count('PING')).toBe(2);
  });

  it('COMMAND_REJECTED menampilkan toast', () => {
    const messages: string[] = [];
    const listener = (e: Event) => messages.push((e as CustomEvent).detail.message);
    window.addEventListener('show-toast', listener);
    const { ws } = setup();
    ws.receive({ event: 'COMMAND_REJECTED', reason: 'NOT_PILOT' });
    window.removeEventListener('show-toast', listener);
    expect(messages[0]).toContain('bukan Pilot');
  });
});
