import React from 'react';
import { GameEngine } from '../../core/engine/GameEngine';
import { Volume2, VolumeX, RotateCcw, Crosshair, Save, Smartphone, Monitor } from 'lucide-react';

interface ControlsToolbarProps {
  engine: GameEngine;
  isMuted: boolean;
  onToggleMute: () => void;
  onRecenterCamera: () => void;
  isVerticalMode: boolean;
  onToggleViewMode: () => void;
}

export const ControlsToolbar: React.FC<ControlsToolbarProps> = ({
  engine,
  isMuted,
  onToggleMute,
  onRecenterCamera,
  isVerticalMode,
  onToggleViewMode,
}) => {
  const handleReset = async () => {
    if (window.confirm('Bạn có chắc muốn đặt lại toàn bộ thế giới Live City về ban đầu?')) {
      await engine.resetWorld();
    }
  };

  const handleSave = async () => {
    await engine.saveState();
    alert('Đã lưu trạng thái thành phố vào bộ nhớ cục bộ!');
  };

  return (
    <div className="flex items-center gap-2 glass-panel p-2 rounded-2xl">
      {/* View Mode Toggle */}
      <button
        onClick={onToggleViewMode}
        title={isVerticalMode ? 'Chuyển sang màn hình rộng' : 'Chuyển sang khung dọc livestream 9:16'}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
          isVerticalMode
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
        }`}
      >
        {isVerticalMode ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
        <span>{isVerticalMode ? 'Livestream 9:16' : 'Màn hình rộng'}</span>
      </button>

      {/* Camera Recenter */}
      <button
        onClick={onRecenterCamera}
        title="Canh giữa thành phố"
        className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all"
      >
        <Crosshair className="w-4 h-4" />
      </button>

      {/* Sound Mute Toggle */}
      <button
        onClick={onToggleMute}
        title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
        className={`p-2 rounded-xl border transition-all ${
          isMuted
            ? 'bg-rose-950/40 text-rose-400 border-rose-800/50'
            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/60'
        }`}
      >
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>

      {/* Save State */}
      <button
        onClick={handleSave}
        title="Lưu trạng thái thành phố"
        className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all"
      >
        <Save className="w-4 h-4" />
      </button>

      {/* Reset World */}
      <button
        onClick={handleReset}
        title="Đặt lại thế giới"
        className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-900/60 text-slate-400 hover:text-rose-200 border border-slate-700/60 transition-all ml-auto"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
};
