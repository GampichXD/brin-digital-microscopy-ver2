import { useState, useEffect } from 'react';
import type { ElementType } from 'react';
import axios from 'axios'; // <--- 1. IMPORT AXIOS UNTUK HTTP REQUEST
import { Folder, Search, Plus, Edit2, Trash2, Download, ArrowLeft, Image as ImageIcon, AlertTriangle, Check, FileArchive, Filter, ChevronDown, UploadCloud, X, CheckSquare, Square, ListChecks, HardDrive, Box, ChevronLeft, ChevronRight } from 'lucide-react';
import VirtualKeyboard from './VirtualKeyboard';

interface DatabaseTabProps {
  isDarkMode: boolean;
  globalVirtualKeyboard: boolean;
}

// === 2. SINKRONISASI INTERFACE DENGAN POSTGRESQL DOCKER ===
interface DatasetFolder {
  id: string;
  name: string;
  object_type: string; // Menggunakan snake_case
  date: string;
  operator: string;
  image_count: number; // Menggunakan snake_case
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

export default function DatabaseTab({ isDarkMode, globalVirtualKeyboard }: DatabaseTabProps) {
  // === 3. KOSONGKAN DATA BAWAAN & AMBIL DARI POSTGRESQL DOCKER ===
  const [folders, setFolders] = useState<DatasetFolder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterObject, setFilterObject] = useState('Semua Objek');
  const [filterOperator, setFilterOperator] = useState('Semua Operator');
  const [filterDate, setFilterDate] = useState('Semua Waktu');

  const [viewMode, setViewMode] = useState<'folders' | 'images'>('folders');
  const [activeFolder, setActiveFolder] = useState<DatasetFolder | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  // Sinkronisasi variabel penampung form internal
  const [formData, setFormData] = useState({ id: '', name: '', object_type: '', operator: '' });

  // Perbaikan Tipe Literal untuk Virtual Keyboard targetField
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

  const storageUsedPercentage = 85;

  // === 4. FUNGSI FETCH DATA NYATA DARI BACKEND FASTAPI ===
  const fetchFolders = async () => {
    try {
      const response = await axios.get<DatasetFolder[]>('http://localhost:8000/api/dataset/folders');
      setFolders(response.data);
    } catch (error) {
      console.error("Gagal sinkronisasi data folder riset:", error);
    }
  };

  // Trigger amankan lifecycle agar bebas bug cascading render ESLint
  useEffect(() => {
    const delayFetch = setTimeout(() => {
      fetchFolders();
    }, 0);
    return () => clearTimeout(delayFetch);
  }, []);

  const currentImages = Array.from({ length: activeFolder?.image_count || 0 }, (_, i) => `IMG_${String(i + 1).padStart(4, '0')}.jpg`).slice(0, 20);

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900',
    btnHover: isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100',
    modalOverlay: 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4',
  };

  // Sinkronisasi variabel peta dropdown filter
  const uniqueObjects = ['Semua Objek', ...Array.from(new Set(folders.map(f => f.object_type)))];
  const uniqueOperators = ['Semua Operator', ...Array.from(new Set(folders.map(f => f.operator)))];
  const dateOptions = ['Semua Waktu', 'Hari Ini', 'Bulan Ini'];

  const filteredFolders = folders.filter(f => {
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
    const fileContent = `SIMULASI DOWNLOAD!\nFile: ${fileName}\nIni adalah simulasi download ZIP atau File frontend.`;
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace('.jpg', '.txt');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  // === 5. OPERASI POST FORM NYATA KE DATABASE (DOCKER POSTGRES) ===
  const saveForm = async () => {
    if (!formData.name || !formData.object_type || !formData.operator) return alert("Semua kolom harus diisi!");
    try {
      if (formMode === 'create') {
        await axios.post('http://localhost:8000/api/dataset/folders', {
          name: formData.name,
          object_type: formData.object_type,
          date: new Date().toISOString().split('T')[0],
          operator: formData.operator
        });
        alert('Folder Dataset Sukses Disimpan ke PostgreSQL Docker!');
      } else {
        alert('Fungsi Edit Folder Terpanggil (Simulasi UI)');
      }
      setIsFormOpen(false);
      fetchFolders(); // Tarik ulang data segar dari database kontainer
    } catch (error) {
      console.error("Detail error saat menyimpan form:", error); // <--- Tambahkan ini agar variabel terpakai
      alert('Gagal menyimpan folder dataset ke backend server.');
    }
  };

  const confirmDelete = (id: string) => { setTargetDelete(id); setIsConfirmOpen(true); };

  // === 6. OPERASI DELETE NYATA DARI DATABASE ===
  const executeDelete = async () => {
    if (!targetDelete) return;
    try {
      await axios.delete(`http://localhost:8000/api/dataset/folders/${targetDelete}`);
      setIsConfirmOpen(false);
      setTargetDelete(null);
      fetchFolders(); // Refresh visual tabel
    } catch (error) {
      console.error("Detail error saat menghapus folder:", error); // <--- Tambahkan ini agar variabel terpakai
      alert('Gagal menghapus folder dataset dari basis data.');
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
    else setSelectedImages([...currentImages]);
  };

  const confirmDeleteImages = (images: string[]) => {
    if (images.length === 0) return;
    setTargetImageDelete(images);
    setIsConfirmImageOpen(true);
  };

  const executeDeleteImages = () => {
    alert(`Mensimulasikan penghapusan ${targetImageDelete.length} gambar...`);
    setIsConfirmImageOpen(false);
    setTargetImageDelete([]);
    setSelectedImages([]);
    setIsSelectMode(false);
    setPreviewIndex(null);
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      alert(`Berhasil menangkap file: ${e.dataTransfer.files[0].name}`);
      setIsUploadOpen(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      alert(`Berhasil menangkap file: ${e.target.files[0].name}`);
      setIsUploadOpen(false);
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

              <div className={`hidden md:flex items-center px-4 py-2 rounded-xl border ${theme.input} shadow-inner`}>
                <HardDrive size={18} className={`mr-3 ${storageUsedPercentage > 80 ? 'text-red-500' : 'text-green-500'}`} />
                <div className="flex flex-col w-28">
                  <div className="flex justify-between text-[10px] font-bold mb-1">
                    <span className={theme.textMuted}>Jetson NVMe</span>
                    <span className={storageUsedPercentage > 80 ? 'text-red-500' : theme.text}>{storageUsedPercentage}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${storageUsedPercentage > 80 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${storageUsedPercentage}%` }}></div>
                  </div>
                </div>
              </div>

              <button onClick={openCreateForm} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center shadow-lg active:scale-95 transition-transform text-sm whitespace-nowrap">
                <Plus size={18} className="mr-2" /> BUAT FOLDER
              </button>
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
                <button onClick={() => setIsSelectMode(false)} className={`px-3 py-2 rounded-lg font-bold flex items-center active:scale-95 text-sm transition-transform ${theme.text}`}>BATAL</button>
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
                      <p>Diambil: {folder.date}</p>
                      <p>Oleh: {folder.operator}</p>
                    </div>
                  </div>
                </div>
                <div className={`h-px w-full mb-3 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'}`}></div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold px-2 py-1 rounded bg-black/5 ${theme.textMuted}`}>{folder.image_count} Gambar</span>
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
            {currentImages.map((fileName, i) => {
              const isSelected = selectedImages.includes(fileName);
              return (
                <div
                  key={i}
                  onClick={() => isSelectMode ? toggleSelectImage(fileName) : setPreviewIndex(i)}
                  className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center relative group overflow-hidden transition-all cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-500/10' : `border-dashed ${theme.panel}`}`}
                >
                  {isSelectMode && (
                    <div className={`absolute top-2 left-2 z-20 ${isSelected ? 'text-blue-500' : theme.textMuted}`}>
                      {isSelected ? <CheckSquare size={20} className="bg-white/10 rounded" /> : <Square size={20} />}
                    </div>
                  )}
                  <ImageIcon size={32} className={`mb-2 ${isSelected ? 'text-blue-500' : theme.textMuted} ${!isSelected && 'opacity-50'}`} />
                  <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-400 font-bold' : theme.textMuted}`}>{fileName}</span>

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
        <div className="fixed inset-0 bg-black/95 z-[70] flex flex-col items-center justify-center p-4 backdrop-blur-md">
          <div className="absolute top-4 left-6 right-6 flex justify-between items-center text-white">
            <div className="flex flex-col">
              <span className="font-bold text-lg">{currentImages[previewIndex]}</span>
              <span className="text-xs text-gray-400">Pratinjau Resolusi Tinggi (IMX477)</span>
            </div>
            <button onClick={() => setPreviewIndex(null)} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-full active:scale-95 transition-colors"><X size={24} /></button>
          </div>

          <button
            onClick={() => setPreviewIndex(prev => Math.max(0, prev! - 1))}
            disabled={previewIndex === 0}
            className="absolute left-6 p-4 bg-gray-800/80 hover:bg-gray-700 text-white rounded-full active:scale-95 disabled:opacity-20 transition-all"
          >
            <ChevronLeft size={32} />
          </button>

          <div className="w-[70%] max-w-2xl aspect-video bg-gray-900 border-2 border-gray-700 rounded-2xl flex flex-col items-center justify-center shadow-2xl">
            <ImageIcon size={80} className="text-gray-600 mb-6" />
            <span className="text-gray-500 font-mono text-2xl tracking-widest">{currentImages[previewIndex]}</span>
          </div>

          <button
            onClick={() => setPreviewIndex(prev => Math.min(currentImages.length - 1, prev! + 1))}
            disabled={previewIndex === currentImages.length - 1}
            className="absolute right-6 p-4 bg-gray-800/80 hover:bg-gray-700 text-white rounded-full active:scale-95 disabled:opacity-20 transition-all"
          >
            <ChevronRight size={32} />
          </button>

          <div className="absolute bottom-8 flex gap-4">
            <button onClick={() => { confirmDeleteImages([currentImages[previewIndex]]); }} className="px-6 py-3 bg-red-600/80 hover:bg-red-600 text-white rounded-xl font-bold flex items-center active:scale-95 transition-colors border border-red-500/50">
              <Trash2 size={20} className="mr-2" /> Hapus
            </button>
            <button onClick={() => handleSimulateDownload(currentImages[previewIndex])} className="px-6 py-3 bg-blue-600/80 hover:bg-blue-600 text-white rounded-xl font-bold flex items-center active:scale-95 transition-colors border border-blue-500/50">
              <Download size={20} className="mr-2" /> Unduh
            </button>
          </div>
        </div>
      )}

      {isConfirmImageOpen && (
        <div className={theme.modalOverlay}>
          <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl border flex flex-col items-center text-center ${theme.panel}`}>
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4"><AlertTriangle size={32} /></div>
            <h2 className={`text-xl font-bold mb-2 ${theme.text}`}>Yakin Hapus Gambar?</h2>
            <p className={`text-sm mb-6 ${theme.textMuted}`}>Kamu akan menghapus <strong>{targetImageDelete.length} gambar</strong> secara permanen.</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setIsConfirmImageOpen(false)} className={`flex-1 py-3 rounded-xl font-bold border ${theme.textMuted} ${theme.btnHover}`}>Batal</button>
              <button onClick={executeDeleteImages} className="flex-1 py-3 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white flex items-center justify-center active:scale-95"><Trash2 size={18} className="mr-2" /> Hapus</button>
            </div>
          </div>
        </div>
      )}

      {isConfirmOpen && (
        <div className={theme.modalOverlay}>
          <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl border flex flex-col items-center text-center ${theme.panel}`}>
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4"><AlertTriangle size={32} /></div>
            <h2 className={`text-xl font-bold mb-2 ${theme.text}`}>Yakin Hapus Folder?</h2>
            <p className={`text-sm mb-6 ${theme.textMuted}`}>Semua dataset gambar di folder ini akan terhapus permanen.</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setIsConfirmOpen(false)} className={`flex-1 py-3 rounded-xl font-bold border ${theme.textMuted} ${theme.btnHover}`}>Batal</button>
              <button onClick={executeDelete} className="flex-1 py-3 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white flex items-center justify-center active:scale-95"><Trash2 size={18} className="mr-2" /> Hapus Folder</button>
            </div>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className={theme.modalOverlay}>
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border ${theme.panel}`}>
            <h2 className={`text-xl font-bold mb-4 ${theme.text}`}>{formMode === 'create' ? 'Buat Folder Dataset' : 'Edit Folder'}</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>Nama Folder</label>
                <input
                  type="text"
                  readOnly={globalVirtualKeyboard}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onClick={() => triggerKeyboard('Input Nama Folder', 'name')}
                  className={`w-full px-4 py-3 rounded-xl border cursor-pointer font-mono font-bold ${theme.input} ${keyboardState.targetField === 'name' ? 'ring-2 ring-blue-500' : ''}`}
                  placeholder="Ketuk di sini..."
                />
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>Jenis Objek (Label AI)</label>
                <input
                  type="text"
                  readOnly={globalVirtualKeyboard}
                  value={formData.object_type}
                  onChange={(e) => setFormData({ ...formData, object_type: e.target.value })}
                  onClick={() => triggerKeyboard('Input Jenis Objek', 'object_type')}
                  className={`w-full px-4 py-3 rounded-xl border cursor-pointer font-mono font-bold ${theme.input} ${keyboardState.targetField === 'object_type' ? 'ring-2 ring-blue-500' : ''}`}
                  placeholder="Ketuk di sini..."
                />
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>Nama Operator</label>
                <input
                  type="text"
                  readOnly={globalVirtualKeyboard}
                  value={formData.operator}
                  onChange={(e) => setFormData({ ...formData, operator: e.target.value })}
                  onClick={() => triggerKeyboard('Input Nama Operator', 'operator')}
                  className={`w-full px-4 py-3 rounded-xl border cursor-pointer font-mono font-bold ${theme.input} ${keyboardState.targetField === 'operator' ? 'ring-2 ring-blue-500' : ''}`}
                  placeholder="Ketuk di sini..."
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setIsFormOpen(false); setKeyboardState({ visible: false, targetField: '', title: '' }); }} className={`flex-1 py-3 rounded-xl font-bold border ${theme.textMuted} ${theme.btnHover}`}>Batal</button>
              <button onClick={saveForm} className="flex-1 py-3 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center active:scale-95"><Check size={18} className="mr-2" /> Simpan</button>
            </div>
          </div>
        </div>
      )}

      {isUploadOpen && (
        <div className={theme.modalOverlay}>
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border ${theme.panel}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-bold ${theme.text}`}>Unggah Gambar</h2>
              <button onClick={() => setIsUploadOpen(false)} className={`p-1 rounded-md ${theme.btnHover} ${theme.textMuted}`}><X size={20} /></button>
            </div>
            <label onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} htmlFor="file-upload" className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${dragActive ? 'border-blue-500 bg-blue-500/10' : `${isDarkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-gray-50'} ${theme.btnHover}`}`}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                <UploadCloud size={40} className={`mb-3 ${dragActive ? 'text-blue-500' : theme.textMuted}`} />
                <p className={`mb-2 text-sm font-bold ${theme.text}`}>Sentuh untuk mengunggah</p>
                <p className={`text-xs ${theme.textMuted}`}>atau drag & drop file di sini</p>
                <p className={`text-[10px] mt-2 ${theme.textMuted}`}>Mendukung: JPG, PNG (Max 10MB)</p>
              </div>
              <input id="file-upload" type="file" className="hidden" multiple accept="image/*" onChange={handleFileChange} />
            </label>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setIsUploadOpen(false)} className={`flex-1 py-3 rounded-xl font-bold border ${theme.textMuted} ${theme.btnHover}`}>Batal</button>
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