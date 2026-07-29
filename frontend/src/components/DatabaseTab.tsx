import { useState, useEffect } from 'react';
import type { ElementType } from 'react';
import axios from 'axios';
import { Folder, Search, Plus, Edit2, Trash2, Download, ArrowLeft, AlertTriangle, Check, FileArchive, Filter, ChevronDown, UploadCloud, X, CheckSquare, Square, ListChecks, HardDrive, Box, ChevronLeft, ChevronRight, Video, Camera, Activity } from 'lucide-react';
import type { Language } from '../i18n';
import { translations } from '../i18n';
import VirtualKeyboard from './VirtualKeyboard';
import { logSystemAction } from '../utils/logger';

interface DatabaseTabProps {
  isDarkMode: boolean;
  globalVirtualKeyboard: boolean;
  triggerToast: (msg: string, type?: 'SUCCESS' | 'ERROR' | 'INFO') => void;
  availableFolders: DatasetFolder[]; 
  onRefreshFolders: () => void;
  language: Language;
}

interface DatasetFolder {
  id: string;
  name: string;
  object_type: string; 
  date: string;
  operator: string;
  image_count: number; 
  video_count?: number;
}

interface TouchDropdownProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  isDarkMode: boolean;
  icon?: ElementType;
}

function TouchDropdown({ options, value, onChange, isDarkMode, icon: Icon }: TouchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = {
    bg: isDarkMode ? 'bg-gray-900' : 'bg-white',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-300',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    hover: isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100',
  };

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className={`flex items-center justify-between w-full sm:w-auto px-4 py-2.5 rounded-xl border ${theme.bg} ${theme.border} ${theme.text} active:scale-95 transition-transform font-bold text-xs shadow-sm`}>
        <div className="flex items-center">
          {Icon && <Icon size={14} className="mr-2 text-gray-500" />}
          <span className="mr-3">{value}</span>
        </div>
        <ChevronDown size={14} className="text-gray-500" />
      </button>
      {isOpen && <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)}></div>}
      {isOpen && (
        <div className={`absolute left-0 mt-2 min-w-[160px] rounded-xl shadow-xl border z-40 overflow-hidden ${theme.bg} ${theme.border}`}>
          {options.map((opt) => (
            <div key={opt} onClick={() => { onChange(opt); setIsOpen(false); }} className={`px-4 py-3 text-sm cursor-pointer border-b last:border-b-0 ${theme.border} ${theme.text} ${theme.hover} transition-colors`}>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DatabaseTab({ isDarkMode, globalVirtualKeyboard, triggerToast, availableFolders, onRefreshFolders, language }: DatabaseTabProps) {
  const t = translations[language];
  const [searchQuery, setSearchQuery] = useState('');
  const [filterObject, setFilterObject] = useState('Semua Objek');
  const [filterOperator, setFilterOperator] = useState('Semua Operator');
  const [filterDate, setFilterDate] = useState('Semua Waktu');

  const [viewMode, setViewMode] = useState<'folders' | 'images'>('folders');
  const [activeFolder, setActiveFolder] = useState<DatasetFolder | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({ id: '', name: '', object_type: '', operator: '' });

  const [keyboardState, setKeyboardState] = useState<{ visible: boolean, targetField: 'search' | 'name' | 'object_type' | 'operator' | '', title: string }>({ visible: false, targetField: '', title: '' });

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [targetDelete, setTargetDelete] = useState<string | null>(null);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isConfirmImageOpen, setIsConfirmImageOpen] = useState(false);
  const [targetImageDelete, setTargetImageDelete] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const [storageInfo, setStorageInfo] = useState<{ total_gb: number, used_gb: number, used_percentage: number }>({ total_gb: 50.0, used_gb: 10.0, used_percentage: 20 });

  useEffect(() => {
    axios.get('http://localhost:8000/api/dataset/storage-info')
      .then(res => setStorageInfo(res.data))
      .catch(err => console.error("Gagal memuat info storage:", err));
  }, [availableFolders]);

  const [currentImages, setCurrentImages] = useState<{name: string, synced: boolean}[]>([]);

  useEffect(() => {
    if (activeFolder && viewMode === 'images') {
      axios.get(`http://localhost:8000/api/dataset/folders/${activeFolder.id}/images`)
        .then(res => setCurrentImages(res.data))
        .catch(err => console.error("Gagal memuat gambar dari folder:", err));
    }
  }, [activeFolder, viewMode]);

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900',
    btnHover: isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100',
    modalOverlay: 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4',
  };

  const uniqueObjects = ['Semua Objek', ...Array.from(new Set(availableFolders.map(f => f.object_type)))];
  const uniqueOperators = ['Semua Operator', ...Array.from(new Set(availableFolders.map(f => f.operator)))];
  const dateOptions = ['Semua Waktu', 'Hari Ini', 'Bulan Ini'];

  const filteredFolders = availableFolders.filter(f => {
    const matchSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchObj = filterObject === 'Semua Objek' || f.object_type === filterObject;
    const matchOp = filterOperator === 'Semua Operator' || f.operator === filterOperator;
    let matchDate = true;
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.slice(0, 7);
    if (filterDate === 'Hari Ini') matchDate = f.date === today;
    if (filterDate === 'Bulan Ini') matchDate = f.date.startsWith(currentMonth);
    return matchSearch && matchObj && matchOp && matchDate;
  });

  const handleSimulateDownload = (fileName: string) => {
    if (!activeFolder) return;
    
    triggerToast(`Mempersiapkan unduhan ${fileName}...`, 'INFO');
    
    const a = document.createElement('a');
    if (fileName.endsWith('.zip') || fileName.endsWith('.csv')) {
      a.href = `http://localhost:8000/api/dataset/folders/${activeFolder.id}/download`;
    } else {
      a.href = `http://localhost:8000/api/dataset/folders/${activeFolder.id}/files/${fileName}/download`;
    }
    
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    logSystemAction(`Download File Dataset (${fileName})`, 'SUCCESS');
  };

  const openEditForm = (folder: DatasetFolder) => {
    setFormData({ id: folder.id, name: folder.name, object_type: folder.object_type, operator: folder.operator });
    setFormMode('edit');
    setIsFormOpen(true);
  };

  const openCreateForm = () => {
    setFormData({ id: '', name: '', object_type: '', operator: '' });
    setFormMode('create');
    setIsFormOpen(true);
  };

  const saveForm = async () => {
    if(!formData.name || !formData.object_type || !formData.operator) return alert("Semua kolom harus diisi!");
    try {
      if (formMode === 'create') {
        await axios.post('http://localhost:8000/api/dataset/folders', {
          name: formData.name,
          object_type: formData.object_type,
          date: new Date().toISOString().split('T')[0],
          operator: formData.operator
        });
        triggerToast(`Folder "${formData.name}" berhasil diciptakan di PostgreSQL!`, 'SUCCESS');
        logSystemAction(`Buat Folder Dataset (${formData.name})`, 'SUCCESS');
        onRefreshFolders();
      } else {
        await axios.put(`http://localhost:8000/api/dataset/folders/${formData.id}`, {
          name: formData.name,
          object_type: formData.object_type,
          operator: formData.operator
        });
        triggerToast('Metadata folder berhasil diperbarui!', 'SUCCESS');
        logSystemAction(`Update Metadata Folder (${formData.name})`, 'SUCCESS');
        onRefreshFolders();
      }
      setIsFormOpen(false);
      setKeyboardState({ visible: false, targetField: '', title: '' });
      onRefreshFolders(); 
    } catch (error) {
      console.error(error);
      triggerToast('Gagal menyimpan folder dataset', 'ERROR');
      logSystemAction('Gagal Simpan Folder Dataset', 'ERROR');
    }
  };

  const confirmDelete = (id: string) => { setTargetDelete(id); setIsConfirmOpen(true); };

  const executeDelete = async () => {
    if (!targetDelete) return;
    try {
      await axios.delete(`http://localhost:8000/api/dataset/folders/${targetDelete}`);
      if (activeFolder?.id === targetDelete) setActiveFolder(null);
      setIsConfirmOpen(false);
      setTargetDelete(null);
      onRefreshFolders(); 
      triggerToast('Folder dataset telah dihapus permanen dari basis data.', 'SUCCESS');
      logSystemAction(`Hapus Folder Dataset (ID: ${targetDelete})`, 'SUCCESS');
    } catch (error) {
      console.error(error);
      triggerToast('Gagal menghapus folder dari server.', 'ERROR');
      logSystemAction('Gagal Hapus Folder Dataset', 'ERROR');
    }
  };

  const exitImageView = () => {
    setViewMode('folders');
    setIsSelectMode(false);
    setSelectedImages([]);
  };

  const toggleSelectImage = (imgName: string) => {
    setSelectedImages(prev => prev.includes(imgName) ? prev.filter(i => i !== imgName) : [...prev, imgName]);
  };

  const toggleSelectAll = () => {
    if (selectedImages.length === currentImages.length) setSelectedImages([]);
    else setSelectedImages(currentImages.map(img => img.name));
  };

  const confirmDeleteImages = (images: string[]) => {
    if (images.length === 0) return;
    setTargetImageDelete(images);
    setIsConfirmImageOpen(true);
  };

  const executeDeleteImages = async () => {
    if (!activeFolder || targetImageDelete.length === 0) return;
    try {
      await axios.delete(`http://localhost:8000/api/dataset/folders/${activeFolder.id}/images`, {
        data: { filenames: targetImageDelete }
      });
      triggerToast(`${targetImageDelete.length} gambar berhasil dihapus dari server.`, 'SUCCESS');
      logSystemAction(`Hapus ${targetImageDelete.length} Gambar dari Folder ${activeFolder.name}`, 'SUCCESS');
      
      const res = await axios.get(`http://localhost:8000/api/dataset/folders/${activeFolder.id}/images`);
      setCurrentImages(res.data);
      onRefreshFolders();
    } catch (error) {
      console.error("Gagal menghapus gambar:", error);
      triggerToast("Gagal menghapus gambar dari server.", 'ERROR');
      logSystemAction("Gagal Menghapus Gambar Dataset", 'ERROR');
    } finally {
      setIsConfirmImageOpen(false);
      setTargetImageDelete([]);
      setSelectedImages([]);
      setIsSelectMode(false);
      setPreviewIndex(null);
    }
  };

  const handleBatchDownload = () => {
    if (selectedImages.length === 0) return;
    handleSimulateDownload(`Dataset_${activeFolder?.name}_${selectedImages.length}_Images.zip`);
    setSelectedImages([]);
    setIsSelectMode(false);
  };

  const handleKeyboardInput = (key: string) => {
    const field = keyboardState.targetField;
    if (!field) return;

    if (field === 'search') {
      setSearchQuery(prev => key === 'BACK' ? prev.slice(0, -1) : prev + key);
    } else {
      setFormData(prev => {
        const currentValue = prev[field] as string;
        if (key === 'BACK') return { ...prev, [field]: currentValue.slice(0, -1) };
        return { ...prev, [field]: currentValue + key };
      });
    }
  };

  const triggerKeyboard = (title: string, targetField: 'search' | 'name' | 'object_type' | 'operator') => {
    if (!globalVirtualKeyboard) return;
    setKeyboardState({ visible: true, title, targetField });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!activeFolder || files.length === 0) return;
    triggerToast(`Mengunggah ${files.length} file...`, 'INFO');
    
    const formDataObj = new FormData();
    for (let i = 0; i < files.length; i++) {
      formDataObj.append('files', files[i]);
    }

    try {
      await axios.post(`http://localhost:8000/api/dataset/folders/${activeFolder.id}/files`, formDataObj, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      triggerToast(`Berhasil mengunggah ${files.length} gambar!`, 'SUCCESS');
      logSystemAction(`Upload ${files.length} Gambar ke Folder ${activeFolder.name}`, 'SUCCESS');
      setIsUploadOpen(false);
      onRefreshFolders();
      // Segarkan daftar gambar di view saat ini
      axios.get(`http://localhost:8000/api/dataset/folders/${activeFolder.id}/images`)
        .then(res => setCurrentImages(res.data));
    } catch (err) {
      console.error(err);
      triggerToast("Gagal mengunggah gambar", 'ERROR');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  };

  return (
    <div className="h-full flex flex-col relative">

      {/* ================= HEADER TAB ================= */}
      <div className={`flex flex-col gap-3 p-4 rounded-2xl border shrink-0 mb-4 ${theme.panel}`}>
        {viewMode === 'folders' ? (
          <>
            <div className="flex gap-2 w-full">
              <div className="flex-1 relative min-w-[200px]">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${theme.textMuted}`} size={18} />
                <input
                  type="text"
                  readOnly={globalVirtualKeyboard}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={() => triggerKeyboard('Pencarian Database', 'search')}
                  placeholder="Cari nama folder..."
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm font-bold shadow-inner ${theme.input} ${keyboardState.targetField === 'search' ? 'ring-2 ring-blue-500' : ''}`}
                />
              </div>

              <div className={`hidden md:flex items-center px-4 py-2 rounded-xl border ${theme.input} shadow-inner`} title={`Kapasitas: ${storageInfo.used_gb} / ${storageInfo.total_gb} GB`}>
                <HardDrive size={18} className={`mr-3 ${storageInfo.used_percentage > 80 ? 'text-red-500' : 'text-green-500'}`} />
                <div className="flex flex-col w-32">
                  <div className="flex justify-between text-[10px] font-bold mb-1">
                    <span className={theme.textMuted}>{t.serverRom}</span>
                    <span className={storageInfo.used_percentage > 80 ? 'text-red-500' : theme.text}>{storageInfo.used_percentage}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${storageInfo.used_percentage > 80 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${storageInfo.used_percentage}%` }}></div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => openCreateForm()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                >
                  <Plus size={14} className="mr-1.5" />
                  {t.createNew}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pb-1 pt-1 z-20">
              <TouchDropdown options={dateOptions} value={filterDate} onChange={setFilterDate} isDarkMode={isDarkMode} icon={Filter} />
              <TouchDropdown options={uniqueObjects} value={filterObject} onChange={setFilterObject} isDarkMode={isDarkMode} />
              <TouchDropdown options={uniqueOperators} value={filterOperator} onChange={setFilterOperator} isDarkMode={isDarkMode} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <div className="flex items-center">
              <button onClick={exitImageView} className={`p-2 mr-3 rounded-lg border ${theme.btnHover} ${isDarkMode ? 'border-gray-700' : 'border-gray-300'} active:scale-95`}>
                <ArrowLeft size={24} className={theme.text} />
              </button>
              <div>
                <h2 className={`font-bold text-lg ${theme.text}`}>{activeFolder?.name}</h2>
                <p className={`text-xs ${theme.textMuted}`}>{activeFolder?.image_count} Gambar • Objek: {activeFolder?.object_type}</p>
              </div>
            </div>

            {!isSelectMode ? (
              <div className="flex gap-2">
                <button onClick={() => setIsSelectMode(true)} className={`px-4 py-2 rounded-xl font-bold flex items-center shadow-md active:scale-95 text-sm transition-transform border ${isDarkMode ? 'bg-gray-800 text-white border-gray-600' : 'bg-gray-100 text-gray-900 border-gray-300'}`}>
                  <ListChecks size={16} className="mr-2" /> PILIH
                </button>
                <div className="w-px bg-gray-600/50 mx-1"></div>
                <button onClick={() => handleSimulateDownload(`${activeFolder?.name}_YOLO_Format.zip`)} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold flex items-center shadow-md active:scale-95 text-sm transition-transform">
                  <Box size={16} className="mr-2" /> YOLO
                </button>
                <button onClick={() => handleSimulateDownload(`${activeFolder?.name}_Archive.zip`)} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center shadow-md active:scale-95 text-sm transition-transform">
                  <FileArchive size={16} className="mr-2" /> ZIP
                </button>
                <button onClick={() => setIsUploadOpen(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center shadow-md active:scale-95 text-sm transition-transform">
                  <Plus size={16} className="mr-2" /> TAMBAH
                </button>
              </div>
            ) : (
              <div className="flex gap-2 bg-blue-500/10 p-1.5 rounded-xl border border-blue-500/20">
                <button onClick={toggleSelectAll} className={`px-3 py-2 rounded-lg font-bold flex items-center active:scale-95 text-sm transition-transform ${selectedImages.length === currentImages.length ? 'bg-blue-600 text-white' : (isDarkMode ? 'text-blue-400 hover:bg-blue-900/50' : 'text-blue-600 hover:bg-blue-100')}`}>
                  {selectedImages.length === currentImages.length ? <CheckSquare size={18} className="mr-2" /> : <Square size={18} className="mr-2" />}
                  PILIH SEMUA
                </button>
                <button onClick={() => setIsSelectMode(false)} className={`px-3 py-2 rounded-lg font-bold flex items-center active:scale-95 text-sm transition-transform ${theme.text}`}>{t.cancel}</button>
                <div className="w-px bg-gray-500/30 mx-1"></div>
                <button onClick={() => confirmDeleteImages(selectedImages)} disabled={selectedImages.length === 0} className="px-4 py-2 bg-red-600 disabled:bg-red-900 disabled:text-red-400 hover:bg-red-700 text-white rounded-lg font-bold flex items-center shadow-md active:scale-95 text-sm transition-transform">
                  <Trash2 size={16} className="mr-2" /> HAPUS ({selectedImages.length})
                </button>
                <button onClick={handleBatchDownload} disabled={selectedImages.length === 0} className="px-4 py-2 bg-green-600 disabled:bg-green-900 disabled:text-green-400 hover:bg-green-700 text-white rounded-lg font-bold flex items-center shadow-md active:scale-95 text-sm transition-transform">
                  <Download size={16} className="mr-2" /> UNDUH ZIP
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= KONTEN UTAMA ================= */}
      <div className="flex-1 overflow-y-auto pr-2 z-10" style={{ scrollbarWidth: 'none' }}>
        {viewMode === 'folders' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-2 pb-10">
            {filteredFolders.map((folder) => (
              <div
                key={folder.id}
                className={`p-4 rounded-2xl border flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-blue-500/50 cursor-pointer ${theme.panel}`}>
                <div className="flex items-start gap-4 cursor-pointer mb-4" onClick={() => { setActiveFolder(folder); setViewMode('images'); }}>
                  <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                    <Folder size={32} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-bold text-lg truncate ${theme.text}`}>{folder.name}</h3>
                    <p className={`text-xs font-bold text-blue-500 mb-1`}>{folder.object_type}</p>
                    <div className={`text-[10px] space-y-0.5 ${theme.textMuted}`}>
                      <p>{t.taken} {folder.date}</p>
                      <p>{t.by} {folder.operator}</p>
                    </div>
                  </div>
                </div>
                <div className={`h-px w-full mb-3 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'}`}></div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center ${isDarkMode ? 'bg-gray-900/50 border-gray-700 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                      <Camera size={12} className="mr-1.5 text-blue-500" />
                      {folder.image_count} {t.images}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center ${isDarkMode ? 'bg-gray-900/50 border-gray-700 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                      <Video size={12} className="mr-1.5 text-red-500" />
                      {folder.video_count || 0} {t.videos}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEditForm(folder)} className={`p-2 rounded-lg border ${theme.btnHover} ${isDarkMode ? 'border-gray-700 text-yellow-500' : 'border-gray-300 text-yellow-600'} active:scale-95`}><Edit2 size={16} /></button>
                    <button onClick={() => confirmDelete(folder.id)} className={`p-2 rounded-lg border ${theme.btnHover} ${isDarkMode ? 'border-gray-700 text-red-400' : 'border-gray-300 text-red-500'} active:scale-95`}><Trash2 size={16} /></button>
                    <button onClick={() => handleSimulateDownload(`${folder.name}_Report.csv`)} className={`p-2 rounded-lg border ${theme.btnHover} ${isDarkMode ? 'border-gray-700 text-green-400' : 'border-gray-300 text-green-600'} active:scale-95`}><Download size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'images' && (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pb-10">
            {currentImages.map((imgObj, i) => {
              const fileName = imgObj.name;
              const isSelected = selectedImages.includes(fileName);
              return (
                <div
                  key={i}
                  onClick={() => isSelectMode ? toggleSelectImage(fileName) : setPreviewIndex(i)}
                  className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center relative group overflow-hidden transition-all cursor-pointer ${isSelected ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-2' : `border-transparent ${theme.panel}`}`}
                >
                  {fileName.toLowerCase().endsWith('.mp4') || fileName.toLowerCase().endsWith('.webm') || fileName.toLowerCase().endsWith('.avi') ? (
                    <>
                      <video src={`http://localhost:8000/api/dataset/video/${activeFolder?.id}/${fileName}`} className="absolute inset-0 w-full h-full object-cover z-0" preload="metadata" onError={(e) => { (e.target as HTMLVideoElement).style.display='none'; }} />
                      <div className="absolute inset-0 flex items-center justify-center z-0 bg-black/20">
                        <Video size={32} className="text-white/70" />
                      </div>
                    </>
                  ) : (
                    <img src={`http://localhost:8000/static/datasets/${activeFolder?.id}/${fileName}`} alt={fileName} className="absolute inset-0 w-full h-full object-cover z-0" />
                  )}
                  
                  {isSelectMode && (
                    <div className={`absolute top-2 left-2 z-20 ${isSelected ? 'text-blue-500' : 'text-white drop-shadow-md'}`}>
                      {isSelected ? <CheckSquare size={20} className="bg-white rounded" /> : <Square size={20} />}
                    </div>
                  )}

                  <div className={`absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent z-10 flex flex-col items-center`}>
                    <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-300 font-bold' : 'text-gray-200'}`}>{fileName}</span>
                  </div>

                  {!isSelectMode && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm z-10">
                      <button onClick={(e) => { e.stopPropagation(); confirmDeleteImages([fileName]); }} className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-95"><Trash2 size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleSimulateDownload(fileName); }} className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 active:scale-95"><Download size={16} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= MODALS & POPUPS ================= */}
      {previewIndex !== null && (
        <div className="fixed inset-0 bg-black/95 z-[70] flex flex-col items-center justify-center backdrop-blur-xl">
          {/* HEADER PADA PREVIEW */}
          <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none">
            <div className="flex flex-col">
              <span className="font-mono text-gray-400 text-xs tracking-widest uppercase">PREVIEW</span>
              <span className="font-bold text-xl text-white drop-shadow-md">{currentImages[previewIndex]?.name}</span>
            </div>
            <button onClick={() => setPreviewIndex(null)} className="p-3 bg-white/10 hover:bg-red-500 text-white rounded-full transition-all pointer-events-auto backdrop-blur-md">
              <X size={24} />
            </button>
          </div>

          {/* TOMBOL NAVIGASI KIRI */}
          <button
            onClick={() => setPreviewIndex(prev => Math.max(0, prev! - 1))}
            disabled={previewIndex === 0}
            className="absolute left-6 p-4 bg-white/5 hover:bg-white/20 text-white rounded-full active:scale-95 disabled:opacity-10 transition-all z-10 backdrop-blur-md"
          >
            <ChevronLeft size={36} />
          </button>

          {/* KONTEN UTAMA */}
          <div className="w-full h-full max-w-[85vw] max-h-[80vh] flex items-center justify-center z-0">
            <div className="w-full h-full flex items-center justify-center rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              {currentImages[previewIndex]?.name.toLowerCase().endsWith('.mp4') || currentImages[previewIndex]?.name.toLowerCase().endsWith('.webm') || currentImages[previewIndex]?.name.toLowerCase().endsWith('.avi') ? (
                <video src={`http://localhost:8000/api/dataset/video/${activeFolder?.id}/${currentImages[previewIndex]?.name}`} controls autoPlay className="max-w-full max-h-full object-contain rounded-2xl" onError={(e) => { const el = e.target as HTMLVideoElement; el.style.display='none'; el.insertAdjacentHTML('afterend', '<div class="text-red-400 text-center p-8 bg-gray-900 rounded-xl border border-red-500/30"><p class="font-bold text-xl mb-2">File video tidak dapat diputar.</p><p class="text-gray-400">File mungkin kosong atau belum selesai disinkronkan dari perangkat edge.</p></div>'); }} />
              ) : (
                <img src={`http://localhost:8000/static/datasets/${activeFolder?.id}/${currentImages[previewIndex]?.name}`} alt="Preview" className="max-w-full max-h-full object-contain rounded-2xl" />
              )}
            </div>
          </div>

          {/* TOMBOL NAVIGASI KANAN */}
          <button
            onClick={() => setPreviewIndex(prev => Math.min(currentImages.length - 1, prev! + 1))}
            disabled={previewIndex === currentImages.length - 1}
            className="absolute right-6 p-4 bg-white/5 hover:bg-white/20 text-white rounded-full active:scale-95 disabled:opacity-10 transition-all z-10 backdrop-blur-md"
          >
            <ChevronRight size={36} />
          </button>

          {/* FOOTER ACTION BUTTONS */}
          <div className="absolute bottom-0 inset-x-0 p-8 flex justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent z-10">
            <button onClick={() => { confirmDeleteImages([currentImages[previewIndex]?.name]); }} className="px-8 py-4 bg-red-600/80 hover:bg-red-600 text-white rounded-2xl font-bold flex items-center active:scale-95 transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] backdrop-blur-md">
              <Trash2 size={20} className="mr-3" /> Hapus Permanen
            </button>
            <button onClick={() => handleSimulateDownload(currentImages[previewIndex]?.name)} className="px-8 py-4 bg-blue-600/80 hover:bg-blue-600 text-white rounded-2xl font-bold flex items-center active:scale-95 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] backdrop-blur-md">
              <Download size={20} className="mr-3" /> Unduh Raw Dataset
            </button>
          </div>
        </div>
      )}

      {isConfirmImageOpen && (
        <div className={`${theme.modalOverlay} backdrop-blur-md`}>
          <div className={`w-full max-w-sm rounded-3xl p-8 shadow-2xl border flex flex-col items-center text-center ${theme.panel}`}>
            <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse">
              <AlertTriangle size={48} />
            </div>
            <div className={`text-2xl font-black mb-3 ${theme.text}`}>{t.sureDeleteImage}</div>
            <p className={`text-sm mb-8 ${theme.textMuted} font-medium`}>{t.deleteImageConfirmMsg.replace('{X}', targetImageDelete.length.toString())}</p>
            <div className="flex gap-4 w-full">
              <button onClick={() => setIsConfirmImageOpen(false)} className={`flex-1 py-4 rounded-xl font-bold border ${theme.textMuted} ${theme.btnHover} active:scale-95 transition-all`}>{t.cancel}</button>
              <button onClick={executeDeleteImages} className="flex-1 py-4 rounded-xl font-bold bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 shadow-lg shadow-red-600/40 text-white flex items-center justify-center active:scale-95 transition-all"><Trash2 size={20} className="mr-2" /> {t.delete}</button>
            </div>
          </div>
        </div>
      )}

      {isConfirmOpen && (
        <div className={`${theme.modalOverlay} backdrop-blur-md`}>
          <div className={`w-full max-w-sm rounded-3xl p-8 shadow-2xl border flex flex-col items-center text-center ${theme.panel}`}>
            <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse">
              <AlertTriangle size={48} />
            </div>
            <h2 className={`text-2xl font-black mb-3 ${theme.text}`}>{t.sureDeleteFolder}</h2>
            <p className={`text-sm mb-8 ${theme.textMuted} font-medium`}>{t.deleteFolderConfirmMsg}</p>
            <div className="flex gap-4 w-full">
              <button onClick={() => setIsConfirmOpen(false)} className={`flex-1 py-4 rounded-xl font-bold border ${theme.textMuted} ${theme.btnHover} active:scale-95 transition-all`}>{t.cancel}</button>
              <button onClick={executeDelete} className="flex-1 py-4 rounded-xl font-bold bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 shadow-lg shadow-red-600/40 text-white flex items-center justify-center active:scale-95 transition-all"><Trash2 size={20} className="mr-2" /> {t.deleteFolder}</button>
            </div>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className={theme.modalOverlay}>
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border ${theme.panel}`}>
            <h2 className={`text-xl font-bold mb-4 ${theme.text}`}>{formMode === 'create' ? t.createFolder : t.editFolder}</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>{t.folderName}</label>
                <input
                  type="text"
                  readOnly={globalVirtualKeyboard}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onClick={() => triggerKeyboard(t.folderName, 'name')}
                  className={`w-full p-3 rounded-xl border text-sm font-bold shadow-inner outline-none ${theme.input} ${keyboardState.targetField === 'name' ? 'ring-2 ring-blue-500' : ''}`}
                  placeholder={t.folderName}
                />
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>{t.objectType}</label>
                <input
                  type="text"
                  readOnly={globalVirtualKeyboard}
                  value={formData.object_type}
                  onChange={(e) => setFormData({ ...formData, object_type: e.target.value })}
                  onClick={() => triggerKeyboard(t.objectType, 'object_type')}
                  className={`w-full p-3 rounded-xl border text-sm font-bold shadow-inner outline-none ${theme.input} ${keyboardState.targetField === 'object_type' ? 'ring-2 ring-blue-500' : ''}`}
                  placeholder={t.objectType}
                />
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>{t.operatorName}</label>
                <input
                  type="text"
                  readOnly={globalVirtualKeyboard}
                  value={formData.operator}
                  onChange={(e) => setFormData({ ...formData, operator: e.target.value })}
                  onClick={() => triggerKeyboard(t.operatorName, 'operator')}
                  className={`w-full p-3 rounded-xl border text-sm font-bold shadow-inner outline-none ${theme.input} ${keyboardState.targetField === 'operator' ? 'ring-2 ring-blue-500' : ''}`}
                  placeholder={t.operatorName}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setIsFormOpen(false); setKeyboardState({ visible: false, targetField: '', title: '' }); }} className={`flex-1 py-3 rounded-xl font-bold border ${theme.textMuted} ${theme.btnHover}`}>{t.cancel}</button>
              <button onClick={saveForm} className="flex-1 py-3 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center active:scale-95"><Check size={18} className="mr-2" /> {t.save}</button>
            </div>
          </div>
        </div>
      )}

      {isUploadOpen && (
        <div className={theme.modalOverlay}>
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border ${theme.panel}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-bold ${theme.text}`}>{t.uploadImage}</h2>
              <button onClick={() => setIsUploadOpen(false)} className={`p-2 rounded-full ${theme.btnHover}`}>
                <X size={24} className={theme.textMuted} />
              </button>
            </div>
            <label onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} htmlFor="file-upload" className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${dragActive ? 'border-blue-500 bg-blue-500/10' : `${isDarkMode ? 'border-gray-700 hover:border-blue-500 bg-gray-800/50 hover:bg-gray-800' : 'border-gray-300 hover:border-blue-500 bg-gray-50 hover:bg-gray-100'}`}`}>
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                <UploadCloud size={32} className="text-blue-500" />
              </div>
              <div className="text-center">
                <p className={`mb-2 text-sm font-bold ${theme.text}`}>{t.touchToUpload}</p>
                <p className={`text-xs ${theme.textMuted}`}>{t.dragDrop}</p>
                <p className={`text-[10px] mt-2 ${theme.textMuted}`}>{t.supportFormat}</p>
              </div>
              <input id="file-upload" type="file" className="hidden" multiple accept="image/*" onChange={handleFileChange} />
            </label>
            <div className="mt-6 flex gap-4">
              <button onClick={() => setIsUploadOpen(false)} className={`flex-1 py-3 rounded-xl font-bold border ${theme.textMuted} ${theme.btnHover}`}>{t.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {keyboardState.visible && globalVirtualKeyboard && (
        <div className="fixed inset-0 z-[110] pointer-events-none flex items-end justify-center pb-4">
          <div className="pointer-events-auto">
            <VirtualKeyboard title={keyboardState.title} onInput={handleKeyboardInput} onClose={() => setKeyboardState({ visible: false, targetField: '', title: '' })} />
          </div>
        </div>
      )}

    </div>
  );
}