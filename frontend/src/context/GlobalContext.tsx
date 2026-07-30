import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Language } from '../i18n';

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
}

const GlobalContext = createContext<GlobalContextProps | undefined>(undefined);

export const GlobalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });

  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('language') as Language) || 'id';
  });

  const [isSystemHardwareEnabled, setIsSystemHardwareEnabled] = useState(false);
  const [targetAnalysisImage, setTargetAnalysisImage] = useState<string | null>(null);
  const [globalVirtualKeyboard, setGlobalVirtualKeyboard] = useState(() => {
    return localStorage.getItem('virtualKeyboard') === 'true';
  });

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
