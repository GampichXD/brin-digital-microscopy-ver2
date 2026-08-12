
import { Camera, Database, Grid3X3, Scan, FileText, ShieldAlert } from 'lucide-react';
import { useGlobalContext } from '../../context/GlobalContext';

export type TabName = 'Live Stream' | 'Database' | 'Image Gathering' | 'Image Analysis' | 'Documentation' | 'Admin Control';

interface NavigationTabsProps {
  availableTabs: TabName[];
  activeTab: TabName;
  setActiveTab: (tab: TabName) => void;
}

export default function NavigationTabs({ availableTabs, activeTab, setActiveTab }: NavigationTabsProps) {
  const { isDarkMode } = useGlobalContext();

  const getTabIcon = (tab: TabName, isMobile: boolean) => {
    const size = isMobile ? 22 : 14;
    switch (tab) {
      case 'Live Stream': return <Camera size={size} />;
      case 'Database': return <Database size={size} />;
      case 'Image Gathering': return <Grid3X3 size={size} />;
      case 'Image Analysis': return <Scan size={size} />;
      case 'Documentation': return <FileText size={size} />;
      case 'Admin Control': return <ShieldAlert size={size} className="text-red-500" />;
    }
  };

  return (
    <>
      {/* NAVIGATION BAR (HIDDEN ON MOBILE) */}
      <nav className={`hidden md:flex px-2 pt-2 space-x-1 border-b shrink-0 ${isDarkMode ? 'border-gray-800 bg-gray-900/80' : 'border-gray-200 bg-white'}`}>
        {availableTabs.map((tab) => (
          <button 
            key={tab} 
            onClick={() => setActiveTab(tab)}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2.5 ${
              activeTab === tab 
                ? (isDarkMode ? 'bg-gray-800 text-gray-100 border-blue-500' : 'bg-white text-gray-900 border-blue-600')
                : (isDarkMode ? 'text-gray-500 hover:bg-gray-800/50 border-transparent' : 'text-gray-500 hover:bg-gray-100 border-transparent')
            }`}
          >
            <span className={`p-1.5 rounded-lg transition-colors ${activeTab === tab ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : (isDarkMode ? 'text-gray-400' : 'text-gray-500')}`}>
              {getTabIcon(tab, false)}
            </span>
            <span>{tab}</span>
          </button>
        ))}
      </nav>

      {/* BOTTOM NAVIGATION BAR (VISIBLE ONLY ON MOBILE) */}
      <nav className={`flex px-1 md:hidden fixed bottom-0 left-0 w-full z-50 border-t pb-safe ${isDarkMode ? 'border-gray-800 bg-gray-900/95 backdrop-blur' : 'border-gray-200 bg-white/95 backdrop-blur'}`}>
        {availableTabs.map((tab) => (
          <button 
            key={tab} 
            onClick={() => setActiveTab(tab)}
            className="flex-1 flex justify-center items-center py-2.5"
          >
            <div className={`flex items-center justify-center px-3 py-1.5 rounded-full transition-all duration-300 ${
              activeTab === tab 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                : (isDarkMode ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-500')
            }`}>
              {getTabIcon(tab, true)}
            </div>
          </button>
        ))}
      </nav>
    </>
  );
}
