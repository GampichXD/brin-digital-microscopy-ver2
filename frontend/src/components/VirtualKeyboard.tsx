import { useState } from 'react';
import { X, Delete, Space } from 'lucide-react';

interface VirtualKeyboardProps {
  title: string;
  onInput: (key: string) => void;
  onClose: () => void;
}

export default function VirtualKeyboard({ title, onInput, onClose }: VirtualKeyboardProps) {
  // === STATE UNTUK LOGIKA DRAG POSISI MELAYANG ===
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const row1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const row2 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  const row3 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'];
  const row4 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '_', '.'];

  // === HANDLER POINTER DRAG MENGGUNAKAN POINTER EVENTS ===
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      className="w-[520px] bg-gray-900 border-2 border-gray-700 rounded-3xl p-4 shadow-2xl flex flex-col gap-2 select-none touch-none"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      
      {/* HEADER KEYBOARD (BERTINDAK SEBAGAI HANDLE DRAG) */}
      <div 
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="p-3 border-b border-gray-800 flex justify-between items-center cursor-move active:bg-gray-850 rounded-t-2xl bg-black/10"
      >
        <span className="text-xs font-black text-blue-400 tracking-wider uppercase">{title} (Geser di Sini)</span>
        <button 
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()} 
          className="p-1 hover:bg-red-500 hover:text-white rounded-lg transition-colors text-gray-400"
        >
          <X size={16} />
        </button>
      </div>

      {/* BODY KEYBOARD KEYS */}
      <div className="flex flex-col gap-1.5 mt-2">
        
        {/* BARIS 1 */}
        <div className="flex gap-1 justify-center">
          {row1.map(key => (
            <button key={key} type="button" onClick={() => onInput(key)} className="flex-1 h-11 bg-gray-800 hover:bg-gray-700 active:scale-95 text-white font-bold rounded-lg text-sm transition-all shadow-sm">
              {key}
            </button>
          ))}
        </div>

        {/* BARIS 2 (SUDAH DIPERBAIKI SINTAKSISNYA) */}
        <div className="flex gap-1 justify-center">
          {row2.map(key => (
            <button key={key} type="button" onClick={() => onInput(key)} className="flex-1 h-11 bg-gray-800 hover:bg-gray-700 active:scale-95 text-white font-bold rounded-lg text-sm transition-all shadow-sm">
              {key}
            </button>
          ))}
        </div>

        {/* BARIS 3 */}
        <div className="flex gap-1 justify-center px-2">
          {row3.map(key => (
            <button key={key} type="button" onClick={() => onInput(key)} className="flex-1 h-11 bg-gray-800 hover:bg-gray-700 active:scale-95 text-white font-bold rounded-lg text-sm transition-all shadow-sm">
              {key}
            </button>
          ))}
        </div>

        {/* BARIS 4 + BACKSPACE */}
        <div className="flex gap-1 justify-center">
          {row4.map(key => (
            <button key={key} type="button" onClick={() => onInput(key)} className="flex-1 h-11 bg-gray-800 hover:bg-gray-700 active:scale-95 text-white font-bold rounded-lg text-sm transition-all shadow-sm">
              {key}
            </button>
          ))}
          <button type="button" onClick={() => onInput('BACK')} className="w-16 h-11 bg-red-600/20 border border-red-500/30 hover:bg-red-600 text-red-400 hover:text-white font-bold rounded-lg flex items-center justify-center active:scale-95 transition-all shadow-sm">
            <Delete size={18} />
          </button>
        </div>

        {/* BARIS 5: SPACE & DONE */}
        <div className="flex gap-2 mt-1">
          <button type="button" onClick={() => onInput(' ')} className="flex-[3] h-11 bg-gray-800 hover:bg-gray-700 active:scale-95 text-white rounded-lg flex items-center justify-center transition-all shadow-sm">
            <Space size={18} />
          </button>
          <button type="button" onClick={onClose} className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs tracking-wider active:scale-95 transition-all shadow-md uppercase">
            Selesai
          </button>
        </div>

      </div>
    </div>
  );
}