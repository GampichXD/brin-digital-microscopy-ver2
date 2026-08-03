import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';
import type { Language } from '../i18n';

export interface TelemetryData {
  time: string;
  serverCpu: number;
  serverRam: number;
  serverBandwidth: number;
  edgeCpu: number;
  edgeRam: number;
  edgeTemp: number;
}

interface GlobalContextProps {
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  language: Language;
  setLanguage: (val: Language) => void;
  isSystemHardwareEnabled: boolean;
  setIsSystemHardwareEnabled: (val: boolean) => void;
  targetAnalysisImage: string | null;
  setTargetAnalysisImage: (val: string | null) => void;
  globalVirtualKeyboard: boolean;
  setGlobalVirtualKeyboard: (val: boolean) => void;
  telemetryData: TelemetryData[];
}

const GlobalContext = createContext<GlobalContextProps | undefined>(undefined);

export const GlobalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });

  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('language')?.toUpperCase() as Language) || 'ID';
  });

  const [isSystemHardwareEnabled, setIsSystemHardwareEnabled] = useState(false);
  const [targetAnalysisImage, setTargetAnalysisImage] = useState<string | null>(null);
  const [globalVirtualKeyboard, setGlobalVirtualKeyboard] = useState(() => {
    return localStorage.getItem('virtualKeyboard') === 'true';
  });

  const [telemetryData, setTelemetryData] = useState<TelemetryData[]>([]);

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const response = await api.get('/api/hardware/telemetry/stats');
        const data = response.data;
        const d = new Date();
        const newEntry: TelemetryData = {
          time: d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          serverCpu: data.serverCpu || 0,
          serverRam: data.serverRam || 0,
          serverBandwidth: data.serverBandwidth || 0,
          edgeCpu: data.edgeCpu || 0,
          edgeRam: data.edgeRam || 0,
          edgeTemp: data.edgeTemp || 0,
        };
        
        if (data.hardwareBus !== undefined) {
          setIsSystemHardwareEnabled(data.hardwareBus);
        }
        
        setTelemetryData(prev => {
          const newData = [...prev, newEntry];
          if (newData.length > 20) return newData.slice(newData.length - 20);
          return newData;
        });
      } catch (err) {
        // Silently fail if backend is unreachable
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('virtualKeyboard', String(globalVirtualKeyboard));
  }, [globalVirtualKeyboard]);

  return (
    <GlobalContext.Provider
      value={{
        isDarkMode,
        setIsDarkMode,
        language,
        setLanguage,
        isSystemHardwareEnabled,
        setIsSystemHardwareEnabled,
        targetAnalysisImage,
        setTargetAnalysisImage,
        globalVirtualKeyboard,
        setGlobalVirtualKeyboard,
        telemetryData,
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
};

export const useGlobalContext = () => {
  const context = useContext(GlobalContext);
  if (!context) {
    throw new Error('useGlobalContext must be used within a GlobalProvider');
  }
  return context;
};
