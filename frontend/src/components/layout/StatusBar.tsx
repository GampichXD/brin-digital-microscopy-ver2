import { useState, useEffect } from 'react';
import { Server, Activity, Calendar, Clock, MapPin } from 'lucide-react';
import { useGlobalContext } from '../../context/GlobalContext';

interface StatusBarProps {
  grblStatus: string;
  jetsonRam: string;
  jetsonRom: string;
}

export default function StatusBar({ grblStatus, jetsonRam, jetsonRom }: StatusBarProps) {
  const { isDarkMode, isSystemHardwareEnabled } = useGlobalContext();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  return (
    <div className={`px-4 py-2 flex items-center text-[10px] sm:text-[11px] font-bold border-b shrink-0 overflow-x-auto whitespace-nowrap gap-4 sm:justify-between [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${isDarkMode ? 'bg-gray-900/50 border-gray-800 text-gray-400' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
        <span className="flex items-center"><Server size={12} className="mr-1.5 text-blue-500" /> Jetson</span>
        <span className={`flex items-center ${isSystemHardwareEnabled ? 'text-yellow-500' : 'text-red-500'}`}>
          <Activity size={12} className="mr-1.5" /> {isSystemHardwareEnabled ? grblStatus : 'Locked'}
        </span>
        <span>RAM: {jetsonRam}</span>
        <span>ROM: {jetsonRom}</span>
      </div>
      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
        <span className="flex items-center"><Calendar size={12} className="mr-1.5 hidden sm:inline" /> {formatDate(currentTime)}</span>
        <span className="flex items-center"><Clock size={12} className="mr-1.5 hidden sm:inline" /> {formatTime(currentTime)}</span>
        <span className="flex items-center text-red-500"><MapPin size={12} className="mr-1.5 hidden sm:inline" /> Semarang</span>
      </div>
    </div>
  );
}
