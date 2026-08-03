import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { UploadCloud, Undo2, Redo2, Save, X, Scan, Move, Ruler, Droplet, Maximize, FolderPlus, Layers, Activity, ZoomIn, ZoomOut, Database, ArrowLeft } from 'lucide-react';
import VirtualKeyboard from './VirtualKeyboard';
import { logSystemAction } from '../utils/logger';
import { useTranslation } from '../hooks/useTranslation';
import { useGlobalContext } from '../context/GlobalContext';
import { showToast } from '../utils/toast';

const API_BASE_URL = api.defaults.baseURL || 'http://localhost:8000';

interface DatasetFolder {
  id: string;
  name: string;
  object_type: string;
}

interface ImageAnalysisTabProps {
  onClearTarget?: () => void;  
  availableFolders?: DatasetFolder[];
  onRefreshFolders?: () => void;
}

interface ColonyPosition {
  x: number;
  y: number;
}

interface AnalysisState {
  id: number;
  processName: string;
  cssFilter: string;
  colonies: ColonyPosition[] | null;
  stats?: any;
  imageSrc: string | null;
}

export default function ImageAnalysisTab({ 
  onClearTarget, 
  availableFolders = [], 
  onRefreshFolders,
}: ImageAnalysisTabProps) {
  const { isDarkMode, globalVirtualKeyboard, targetAnalysisImage: targetImage, setTargetAnalysisImage } = useGlobalContext();
  const { t } = useTranslation();
  const [currentImage, setCurrentImage] = useState<string | null>(targetImage);
  
  const [history, setHistory] = useState<AnalysisState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const pinchStartDist = useRef(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processTask, setProcessTask] = useState('');
  
  const [selectedDatabaseFolderId, setSelectedDatabaseFolderId] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  const [folderImages, setFolderImages] = useState<{name: string, synced: boolean}[]>([]);
  
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [saveForm, setSaveForm] = useState({ folderName: '', objectType: '', operatorName: localStorage.getItem('username') || 'Operator' });
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ok: boolean, msg: string} | null>(null);
  const [vk, setVk] = useState<{ visible: boolean, title: string, field: 'folderName' | 'objectType' | 'operatorName' | null }>({ visible: false, title: '', field: null });

  const theme = {
    panel: isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-gray-100' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    input: isDarkMode ? 'bg-gray-950 border-gray-700 text-blue-400' : 'bg-white border-gray-300 text-blue-600',
    btnHover: isDarkMode ? 'hover:bg-gray-800 active:bg-gray-700' : 'hover:bg-gray-100 active:bg-gray-200',
    btnTouch: isDarkMode ? 'bg-gray-800 border-gray-600 hover:bg-gray-700 active:bg-gray-600' : 'bg-gray-100 border-gray-300 hover:bg-gray-200 active:bg-gray-300',
    modalBg: 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4'
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (targetImage) {
        setCurrentImage(targetImage);
        setHistory([
          {
            id: 1,
            processName: 'Original Image',
            cssFilter: 'brightness(1) contrast(1) blur(0px)',
            colonies: null,
            imageSrc: `${API_BASE_URL}/static/uploads/${targetImage}?t=${new Date().getTime()}`
          }
        ]);
        setHistoryIndex(0);
        setZoomLevel(1);
        setPan({ x: 0, y: 0 });
      } else {
        setCurrentImage(null);
        setHistory([]);
        setHistoryIndex(-1);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [targetImage]);

  const handleSelectFromDatabaseFolder = async (folderId: string, folderName: string) => {
    try {
      const response = await api.get(`${API_BASE_URL}/api/dataset/folders/${folderId}/images`);
      const images = response.data;
      
      if (images && images.length > 0) {
        setSelectedDatabaseFolderId(folderId);
        setSelectedFolderName(folderName);
        setFolderImages(images);
      } else {
        showToast("Folder ini kosong, belum ada gambar untuk dianalisis.", "warning");
        // alert("Folder ini kosong, belum ada gambar untuk dianalisis.");
      }
    } catch (err) {
      console.error(err);
      showToast("Gagal memuat daftar gambar dari folder database.", "error");
      // alert("Gagal memuat daftar gambar dari folder database.");
    }
  };

  const handleSelectDatabaseImage = (folderId: string, folderName: string, fileName: string) => {
    setCurrentImage(fileName);
    setHistory([{ 
      id: 1, 
      processName: `Loaded from ${folderName}`, 
      cssFilter: 'brightness(1) contrast(1) blur(0px)', 
      colonies: null,
      imageSrc: `${API_BASE_URL}/static/datasets/${folderId}/${fileName}` 
    }]);
    setHistoryIndex(0);
    setZoomLevel(1);
    setPan({x:0, y:0});
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  
  const handleWheel = (e: React.WheelEvent) => {
    // e.preventDefault() dihapus karena onWheel bersifat passive di React 17+
    if (e.deltaY < 0) setZoomLevel(prev => Math.min(prev + 0.1, 3));
    else setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0) {
      isDragging.current = true;
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDragging.current = true;
      dragStart.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y };
    } else if (e.touches.length === 2) {
      isDragging.current = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.sqrt(dx*dx + dy*dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging.current) {
      setPan({
        x: e.touches[0].clientX - dragStart.current.x,
        y: e.touches[0].clientY - dragStart.current.y
      });
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const delta = (dist - pinchStartDist.current) * 0.01;
      if (Math.abs(delta) > 0.05) {
        setZoomLevel(prev => Math.min(Math.max(prev + delta, 0.5), 3));
        pinchStartDist.current = dist;
      }
    }
  };

  const handleVKInput = (key: string) => {
    if (!vk.field) return;
    const updateVal = (prev: string) => key === 'BACK' ? prev.slice(0, -1) : prev + key;
    setSaveForm({ ...saveForm, [vk.field]: updateVal(saveForm[vk.field]) });
  };

  const triggerVK = (title: string, field: 'folderName' | 'objectType' | 'operatorName') => {
    if (!globalVirtualKeyboard) return;
    setVk({ visible: true, title, field });
  };

  const processImageUpload = async (file: File) => {
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    setIsProcessing(true);
    setProcessTask('Mengunggah citra mikroskop...');

    try {
      const response = await api.post(`${API_BASE_URL}/api/analysis/upload`, formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setCurrentImage(response.data.filename);
      setHistory([{ 
        id: 1, 
        processName: 'Original Image', 
        cssFilter: 'brightness(1) contrast(1) blur(0px)', 
        colonies: null,
        imageSrc: `${API_BASE_URL}${response.data.url}`
      }]);
      setHistoryIndex(0);
      setZoomLevel(1);
    } catch (error) {
      console.error("Gagal mengunggah berkas gambar:", error);
      showToast('Gagal mengunggah berkas gambar ke Jetson Orin.', 'error');
      // alert('Gagal mengunggah berkas gambar ke Jetson Orin.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageUpload(e.target.files[0]);
    }
  };

  const closeImage = () => {
    setCurrentImage(null);
    setHistory([]);
    setHistoryIndex(-1);
    if (onClearTarget) onClearTarget();
    else setTargetAnalysisImage(null);
  };

  const handleSaveToFolder = async () => {
    const activeImageSrc = history[historyIndex]?.imageSrc;
    if (!activeImageSrc) {
      showToast('Tidak ada gambar aktif di kanvas untuk disimpan.', 'warning');
      // alert('Tidak ada gambar aktif di kanvas untuk disimpan.');
      return;
    }

    const isCreatingNew = !selectedFolderId && (saveForm.folderName.trim() !== '');
    const isSavingToExisting = !!selectedFolderId;
    if (!isCreatingNew && !isSavingToExisting) {
      showToast('Pilih folder tujuan atau isi nama folder baru terlebih dahulu!', 'warning');
      // alert('Pilih folder tujuan atau isi nama folder baru terlebih dahulu!');
      return;
    }
    if (isCreatingNew && !saveForm.objectType.trim()) {
      showToast('Jenis objek harus diisi jika membuat folder baru!', 'warning');
      // alert('Jenis objek harus diisi jika membuat folder baru!');
      return;
    }

    setIsSaving(true);
    setSaveResult(null);

    try {
      const imgResp = await fetch(activeImageSrc);
      const blob = await imgResp.blob();

      const ext = blob.type.includes('png') ? 'png' : 'jpg';
      const processLabel = (history[historyIndex]?.processName || 'analysis').replace(/\s+/g, '_').toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outputFilename = `analysis_${processLabel}_${timestamp}.${ext}`;

      let targetFolderId = selectedFolderId;

      if (isCreatingNew) {
        const today = new Date().toISOString().slice(0, 10);
        const createResp = await api.post(`${API_BASE_URL}/api/dataset/folders`, {
          name: saveForm.folderName.trim(),
          object_type: saveForm.objectType.trim(),
          date: today,
          operator: saveForm.operatorName.trim() || 'Anonim',
        });
        targetFolderId = createResp.data.id;
      }

      const formData = new FormData();
      formData.append('files', blob, outputFilename);
      await api.post(`${API_BASE_URL}/api/dataset/folders/${targetFolderId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      await logSystemAction(`Simpan Hasil Analisis ke Database (${outputFilename})`, 'SUCCESS');

      setSaveResult({ ok: true, msg: `✓ Berhasil disimpan sebagai "${outputFilename}"` });
      onRefreshFolders?.();
      setTimeout(() => {
        setShowSaveModal(false);
        setSaveResult(null);
        setSelectedFolderId(null);
        setSaveForm({ folderName: '', objectType: '', operatorName: localStorage.getItem('username') || 'Operator' });
      }, 1800);

    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Kesalahan tidak diketahui';
      setSaveResult({ ok: false, msg: `✗ Gagal menyimpan: ${detail}` });
    } finally {
      setIsSaving(false);
    }
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = () => { if (canUndo) setHistoryIndex(prev => prev - 1); };
  const redo = () => { if (canRedo) setHistoryIndex(prev => prev + 1); };

  const executeTool = async (toolName: string, endpointPath: string, params: object = {}, isAI: boolean = false) => {
    if (!currentImage) return;
    setIsProcessing(true);
    setProcessTask(`Menerapkan ${toolName}...`);

    try {
      const currentState = history[historyIndex];
      const response = await api.post(`${API_BASE_URL}/api/analysis/${endpointPath}`, {
        filename: currentImage,
        current_src: currentState.imageSrc,
        ...params
      });
      let coloniesData = response.data.colonies || null;
      if (typeof coloniesData === 'number') {
        const count = coloniesData;
        coloniesData = Array.from({length: count}).map(() => ({
          x: 20 + Math.random() * 60,
          y: 20 + Math.random() * 60
        }));
      }

      const newState: AnalysisState = {
        id: history.length + 1,
        processName: toolName,
        cssFilter: isAI ? 'brightness(1)' : response.data.css_filter || 'brightness(1)',
        colonies: coloniesData,
        stats: response.data.stats || null,
        imageSrc: `${API_BASE_URL}${response.data.url}`
      };
      const newHistory = [...history.slice(0, historyIndex + 1), newState];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      logSystemAction(`Analisis Citra (${toolName}) Selesai`, 'SUCCESS');
    } catch (error) {
      console.error(error);
      showToast(`Gagal memproses metode ${toolName}. Periksa log tensor server.`, "error");
      // alert(`Gagal memproses metode ${toolName}. Periksa log tensor server.`);
      logSystemAction(`Analisis Citra (${toolName}) Gagal`, 'ERROR');
    } finally {
      setIsProcessing(false);
    }
  };

  const runDenoise = () => executeTool('Adaptive Thresholding', 'adaptive-thresh');
  const runCLAHE = () => executeTool('Ekstraksi Kontur Geometri', 'contour');
  const runEdgeDetection = () => executeTool('Deteksi Tepi Sobel', 'sobel');
  const runColonyCounter = () => executeTool('AI YOLO Colony Counter', 'colony-count', {}, true);
  
  const activeState = history[historyIndex];

  return (
    <div className="flex flex-col flex-1 h-full relative w-full">
       {!currentImage && (
        <div className="flex flex-col md:flex-row gap-4 h-full flex-1 min-h-0 md:pb-0">
          <div 
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) processImageUpload(e.dataTransfer.files[0]);
            }}
            className={`flex-1 min-h-0 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center transition-all p-4 sm:p-6 ${
              isDarkMode ? 'border-gray-700 bg-gray-900/40 hover:border-blue-500/50 hover:bg-blue-500/5' : 'border-gray-300 bg-gray-50 hover:border-blue-500/50 hover:bg-blue-500/5'
            }`}
          >
            <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer select-none group">
              <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                <UploadCloud size={32} />
              </div>
              <h2 className={`text-lg font-black mb-1 tracking-wide ${theme.text}`}>{t('dragImageTap')}</h2>
              <p className={`text-[11px] mb-4 max-w-xs text-center leading-relaxed ${theme.textMuted}`}>
                Tarik file dari Device, atau sentuh untuk mengakses penyimpanan lokal perangkat Anda, atau terima transmisi otomatis dari Tab Image Gathering.
              </p>
              <div className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md">
                CARI BERKAS CITRA
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleManualUpload} />
            </label>
          </div>

          <div className={`flex-1 min-h-0 w-full md:w-[40%] rounded-3xl border p-4 flex flex-col shadow-sm ${theme.panel}`}>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-800">
              <Database size={16} className="text-blue-400" />
              <h3 className={`text-xs font-black uppercase tracking-wider ${theme.text}`}>{t('selectFromDb')}</h3>
            </div>
            <p className={`text-[10px] mb-3 leading-normal ${theme.textMuted}`}>
              Pilih folder sampel mikroba/bakteri yang telah terdaftar di database laboratorium untuk memuat citra mentahnya ke dalam kanvas analisis.
            </p>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 md:pb-0" style={{ scrollbarWidth: 'none' }}>
              {!selectedDatabaseFolderId ? (
                availableFolders.length === 0 ? (
                  <div className="text-center py-8 text-[11px] font-medium text-gray-500">
                    Belum ada repositori data sampel di PostgreSQL
                  </div>
                ) : (
                  availableFolders.map(folder => (
                    <div 
                      key={folder.id}
                      onClick={() => handleSelectFromDatabaseFolder(folder.id, folder.name)}
                      className={`p-2.5 rounded-xl border border-gray-800/60 cursor-pointer flex flex-col gap-1 transition-all ${
                        isDarkMode ? 'bg-gray-950/40 hover:bg-blue-500/10 hover:border-blue-500/40' : 'bg-gray-50 hover:bg-blue-50/50 hover:border-blue-400'
                      }`}
                    >
                      <span className={`text-xs font-bold truncate ${theme.text}`}>{folder.name}</span>
                      <span className="text-[9px] font-mono font-bold text-blue-400 uppercase">{folder.object_type}</span>
                    </div>
                  ))
                )
              ) : (
                <>
                  <button 
                    onClick={() => setSelectedDatabaseFolderId(null)} 
                    className={`sticky top-0 z-10 mb-3 text-xs font-bold flex items-center gap-1 p-2.5 rounded-xl border transition-colors shadow-sm backdrop-blur-xl ${isDarkMode ? 'bg-gray-900/90 border-gray-700 text-blue-400 hover:bg-gray-800' : 'bg-white/90 border-gray-300 text-blue-600 hover:bg-gray-50'}`}
                  >
                    <ArrowLeft size={14} /> Kembali ke Pustaka
                  </button>
                  <div className="grid grid-cols-3 gap-2 pb-2">
                    {folderImages.map(img => (
                      <div 
                        key={img.name}
                        onClick={() => handleSelectDatabaseImage(selectedDatabaseFolderId, selectedFolderName, img.name)}
                        className={`aspect-square rounded-xl border border-gray-800/60 cursor-pointer overflow-hidden relative group transition-all shadow-sm ${
                          isDarkMode ? 'hover:border-blue-500/80 hover:shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'hover:border-blue-400 hover:shadow-md'
                        }`}
                        title={img.name}
                      >
                        <img 
                          src={`${API_BASE_URL}/static/datasets/${selectedDatabaseFolderId}/${img.name}`} 
                          className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                          alt={img.name}
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-1 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center backdrop-blur-sm">
                          <span className="text-[8px] font-mono text-gray-200 truncate">{img.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {currentImage && (
        <div className="flex flex-col lg:flex-row w-full gap-3 overflow-y-auto lg:overflow-hidden pb-4 lg:pb-0">
          <div className="sticky top-0 z-40 lg:relative lg:z-auto w-full lg:w-[70%] h-[350px] sm:h-[500px] lg:h-full flex flex-col gap-3 shrink-0">
            <div className={`p-3 rounded-2xl border flex items-center justify-between shrink-0 shadow-sm gap-2 overflow-hidden ${theme.panel}`}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button onClick={closeImage} className="p-2.5 rounded-xl border border-red-500/50 text-red-500 bg-red-500/10 hover:bg-red-500 hover:text-white active:scale-95 transition-colors shrink-0">
                  <X size={18}/>
                </button>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-sm font-bold font-mono truncate ${theme.text}`}>{currentImage}</span>
                  <span className={`text-[10px] font-bold text-blue-500 truncate flex gap-2`}>
                    <span>{t('statusLabel')} {activeState?.processName.toUpperCase()}</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className={`flex items-center border rounded-xl overflow-hidden p-1 ${isDarkMode ? 'bg-gray-950 border-gray-700' : 'bg-gray-100 border-gray-300'}`}>
                  <button onClick={undo} disabled={!canUndo} className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${canUndo ? 'text-blue-500 hover:bg-blue-500/10' : theme.textMuted}`}><Undo2 size={16}/></button>
                  <div className={`w-px h-5 mx-0.5 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                  <button onClick={redo} disabled={!canRedo} className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${canRedo ? 'text-blue-500 hover:bg-blue-500/10' : theme.textMuted}`}><Redo2 size={16}/></button>
                </div>
                <button onClick={() => setShowSaveModal(true)} className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold flex items-center shadow-md active:scale-95 transition-all text-xs whitespace-nowrap">
                  <Save size={16} className="mr-1.5"/> SIMPAN
                </button>
              </div>
            </div>

            <div className={`flex-1 rounded-2xl border-2 flex items-center justify-center relative overflow-hidden bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPHBhdGggZD0iTTAgMEw4IDhaTTAgOEw4IDBaIiBzdHJva2U9IiNmZmYiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+')] ${isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-300 bg-gray-200'}`}>
              <div className="absolute top-4 left-4 z-20 flex flex-col gap-1 bg-black/50 p-1.5 rounded-xl border border-gray-600 backdrop-blur-md">
                <button onClick={handleZoomIn} disabled={zoomLevel >= 3} className="p-2 text-white hover:bg-white/20 rounded-lg active:scale-95 disabled:opacity-30"><ZoomIn size={18}/></button>
                <div className="w-full h-px bg-gray-600 my-0.5"></div>
                <button onClick={handleZoomOut} disabled={zoomLevel <= 0.5} className="p-2 text-white hover:bg-white/20 rounded-lg active:scale-95 disabled:opacity-30"><ZoomOut size={18}/></button>
              </div>
              <div className="absolute top-4 left-16 ml-1 z-20 px-3 py-2 rounded-xl bg-black/50 border border-gray-600 backdrop-blur-md text-white font-mono text-xs font-bold flex items-center shadow-md">
                {t('zoomLabel')} {Math.round(zoomLevel * 100)}%
              </div>

              <div 
                className="w-3/4 aspect-video bg-blue-900/20 border-2 border-blue-500/30 rounded-xl relative transition-transform duration-75 ease-out origin-center overflow-hidden shadow-2xl cursor-grab active:cursor-grabbing touch-none"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})` }} 
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
              >
                {activeState?.imageSrc ? (
                  <img 
                    src={activeState.imageSrc} 
                    alt="Analysis Feed" 
                    className="w-full h-full object-contain"
                    style={{ filter: activeState.cssFilter }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center opacity-30">
                    <Layers size={80} className="text-blue-400" />
                  </div>
                )}

                {activeState?.colonies && activeState.colonies.map((colony, i) => (
                  <div 
                    key={i} 
                    className="absolute border-2 border-green-400 bg-green-400/20 rounded-full shadow-[0_0_10px_rgba(74,222,128,0.5)] flex items-center justify-center"
                    style={{ left: `${colony.x}%`, top: `${colony.y}%`, width: '20px', height: '20px', transform: 'translate(-50%, -50%)' }}
                  >
                    <span className="text-[6px] font-bold text-green-300 absolute -top-3">{t('cell')}</span>
                  </div>
                ))}
              </div>

              {activeState?.colonies && (
                <div className="absolute bottom-6 left-6 px-4 py-3 bg-green-900/80 border border-green-500 rounded-xl backdrop-blur-md flex items-center shadow-2xl">
                   <Activity size={24} className="text-green-400 mr-3" />
                   <div className="flex flex-col">
                     <span className="text-xs text-green-300 font-bold uppercase">{t('modelDetectionResults')}</span>
                     <span className="text-xl font-black text-white">{activeState.colonies.length} Koloni Ditemukan</span>
                   </div>
                </div>
              )}

              {activeState?.stats && (
                <div className="absolute bottom-6 right-6 px-4 py-3 bg-blue-900/80 border border-blue-500 rounded-xl backdrop-blur-md flex flex-col shadow-2xl min-w-[200px]">
                   <span className="text-xs text-blue-300 font-bold uppercase mb-2 border-b border-blue-500/50 pb-1">{t('morphologyStats')}</span>
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-sm text-gray-300">{t('totalObjects')}</span>
                     <span className="text-lg font-bold text-white">{activeState.stats?.total_cells || activeState.colonies?.length || 0}</span>
                   </div>
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-sm text-gray-300">{t('avgArea')}</span>
                     <span className="text-sm font-bold text-white">{activeState.stats?.avg_area || 0} px²</span>
                   </div>
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-sm text-gray-300">{t('avgPerimeter')}</span>
                     <span className="text-sm font-bold text-white">{activeState.stats?.avg_perimeter || 0} px</span>
                   </div>
                </div>
              )}
            </div>
          </div>

          {/* PANEL KANAN: TOOLS & HISTORY */}
          <div className="w-full lg:w-[30%] h-full flex flex-col gap-3">
            <div className={`p-4 rounded-2xl border shrink-0 ${theme.panel}`}>
              <h2 className={`font-bold text-lg mb-1 ${theme.text}`}>{t('analysisToolsTitle')}</h2>
              <p className={`text-xs ${theme.textMuted}`}>{t('selectProcessingMethod')}</p>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3" style={{ scrollbarWidth: 'none' }}>
              <div className={`p-3 rounded-2xl border flex flex-col gap-2 ${theme.panel}`}>
                <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${theme.textMuted}`}>1. Pemrosesan Kecerdasan Buatan</h3>
                <button onClick={runColonyCounter} className="w-full p-3 rounded-xl border border-purple-500/50 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 active:scale-95 flex items-center transition-colors text-sm font-bold text-left">
                  <Scan size={18} className="mr-3 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">{t('yoloCounter')}</span><span className="text-[9px] opacity-70 font-normal">{t('autoDetectCount')}</span></div>
                </button>
                <button onClick={() => executeTool('Kalkulasi Morfologi', 'morphology')} className="w-full p-3 rounded-xl border border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10 active:scale-95 flex items-center transition-colors text-sm font-bold text-left">
                  <Maximize size={18} className="mr-3 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">{t('morphologyCalc')}</span><span className="text-[9px] opacity-70 font-normal">{t('calcAreaPerimeter')}</span></div>
                </button>
              </div>

              <div className={`p-3 rounded-2xl border flex flex-col gap-2 ${theme.panel}`}>
                <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${theme.textMuted}`}>2. Image Enhancement</h3>
                <button onClick={runDenoise} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Activity size={18} className="mr-3 text-orange-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">{t('adaptiveThresholding')}</span><span className="text-[9px] font-normal text-gray-500">{t('binarizationDetect')}</span></div>
                </button>
                <button onClick={runCLAHE} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Layers size={18} className="mr-3 text-cyan-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">{t('contourExtraction')}</span><span className="text-[9px] font-normal text-gray-500">{t('findCellWalls')}</span></div>
                </button>
                <button onClick={runEdgeDetection} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Scan size={18} className="mr-3 text-yellow-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">{t('edgeDetectionSobel')}</span><span className="text-[9px] font-normal text-gray-500">{t('sobelLineExtraction')}</span></div>
                </button>
              </div>

              <div className={`p-3 rounded-2xl border flex flex-col gap-2 ${theme.panel}`}>
                <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${theme.textMuted}`}>3. Utilitas Editor</h3>
                <button onClick={() => executeTool('Pemotongan ROI', 'roi')} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Move size={18} className="mr-3 text-green-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">{t('roi')}</span><span className="text-[9px] font-normal text-gray-500">{t('cropSelectArea')}</span></div>
                </button>
                <button onClick={() => executeTool('Kalibrasi Skala', 'calibrate')} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Ruler size={18} className="mr-3 text-red-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">{t('scaleCalibration')}</span><span className="text-[9px] font-normal text-gray-500">{t('setPixelRatio')}</span></div>
                </button>
                <button onClick={() => executeTool('Pemisahan Warna', 'color-split')} className={`w-full p-3 rounded-xl border flex items-center transition-all text-sm font-bold text-left ${theme.btnHover} ${theme.text}`}>
                  <Droplet size={18} className="mr-3 text-pink-500 shrink-0" /> <div className="flex flex-col"><span className="leading-tight">{t('colorChannelSplit')}</span><span className="text-[9px] font-normal text-gray-500">{t('splitStainColor')}</span></div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="flex flex-col items-center text-white">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="text-2xl font-bold mb-2">{processTask}</h2>
            <p className="text-sm text-blue-300 font-mono">{t('aiProcessing')}</p>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className={theme.modalBg}>
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border ${theme.panel}`}>
            <h2 className={`text-xl font-bold mb-4 ${theme.text}`}>{t('saveAnalysisResults')}</h2>
            <div className="mb-4">
              <label className={`block text-xs font-bold mb-2 ${theme.textMuted}`}>{t('selectDestFolder')}</label>
              <div className="grid gap-2 max-h-32 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none' }}>
                  {availableFolders.map(folder => (
                    <div 
                      key={folder.id} 
                      onClick={() => { setSelectedFolderId(folder.id); setSaveForm({ folderName: '', objectType: '', operatorName: '' }); }} 
                      className={`p-3 rounded-xl border cursor-pointer flex items-center transition-colors ${selectedFolderId === folder.id ? 'border-blue-500 bg-blue-500/10 text-blue-400' : `${theme.panel} ${theme.text} hover:border-gray-500`}`}
                    >
                      <FolderPlus size={18} className="mr-3" />
                      <span className="font-bold text-sm">{folder.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center text-xs font-bold text-gray-500">
                <div className="flex-1 border-t border-gray-600"></div><span className="px-3">{t('orCreateNew')}</span><div className="flex-1 border-t border-gray-600"></div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>{t('folderName')}</label>
                  <input 
                    type="text" 
                    readOnly={globalVirtualKeyboard}
                    value={saveForm.folderName} 
                    onChange={(e) => setSaveForm({...saveForm, folderName: e.target.value})}
                    onClick={() => { setSelectedFolderId(null); triggerVK('Nama Folder', 'folderName'); }}
                    placeholder="Ketuk untuk mengisi..." 
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-bold shadow-inner cursor-pointer ${theme.input} ${vk.field === 'folderName' ? 'ring-2 ring-blue-500' : ''}`} 
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>{t('objectType')}</label>
                  <input 
                    type="text" 
                    readOnly={globalVirtualKeyboard}
                    value={saveForm.objectType} 
                    onChange={(e) => setSaveForm({...saveForm, objectType: e.target.value})}
                    onClick={() => { setSelectedFolderId(null); triggerVK('Jenis Objek', 'objectType'); }}
                    placeholder="Contoh: Bakteri, Sel..." 
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-bold shadow-inner cursor-pointer ${theme.input} ${vk.field === 'objectType' ? 'ring-2 ring-blue-500' : ''}`} 
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-1 ${theme.textMuted}`}>{t('operatorName')}</label>
                  <input 
                    type="text" 
                    readOnly={globalVirtualKeyboard}
                    value={saveForm.operatorName} 
                    onChange={(e) => setSaveForm({...saveForm, operatorName: e.target.value})}
                    onClick={() => { setSelectedFolderId(null); triggerVK('Nama Operator', 'operatorName'); }}
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-bold shadow-inner cursor-pointer opacity-70 ${theme.input} ${vk.field === 'operatorName' ? 'ring-2 ring-blue-500' : ''}`} 
                  />
                </div>
              </div>

            {saveResult && (
              <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-bold text-center ${saveResult.ok ? 'bg-green-500/15 border border-green-500 text-green-400' : 'bg-red-500/15 border border-red-500 text-red-400'}`}>
                {saveResult.msg}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-4">
              <button onClick={() => { setShowSaveModal(false); setSaveResult(null); }} disabled={isSaving} className={`flex-1 py-3 sm:py-4 rounded-xl font-bold border disabled:opacity-40 flex items-center justify-center ${theme.textMuted} ${theme.btnTouch}`}>{t('cancel')}</button>
              <button onClick={handleSaveToFolder} disabled={isSaving || !!saveResult?.ok} className="flex-1 py-3 sm:py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white rounded-xl font-bold flex items-center justify-center active:scale-95 shadow-lg transition-all text-sm sm:text-base">
                {isSaving ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 shrink-0"></div>{t('saving')}</>
                ) : (
                  <><Save size={18} className="mr-2 shrink-0"/> Konfirmasi Simpan</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {vk.visible && globalVirtualKeyboard && (
        <div className="fixed inset-0 z-[110] pointer-events-none flex items-end justify-center pb-4">
          <div className="pointer-events-auto">
            <VirtualKeyboard title={vk.title} onInput={handleVKInput} onClose={() => setVk({ visible: false, title: '', field: null })} />
          </div>
        </div>
      )}

    </div>
  );
}



