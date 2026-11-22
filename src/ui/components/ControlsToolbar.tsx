import React from 'react';
import { GameRuntimeClient } from '../services/GameRuntimeClient';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Crosshair,
  Save,
  Smartphone,
  Monitor,
  Pause,
  Play,
  ExternalLink,
} from 'lucide-react';

interface ControlsToolbarProps {
  client: GameRuntimeClient;
  engineRunning: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onRecenterCamera: () => void;
  isVerticalMode: boolean;
  onToggleViewMode: () => void;
}

export const ControlsToolbar: React.FC<ControlsToolbarProps> = ({
  client,
  engineRunning,
  isMuted,
  onToggleMute,
  onRecenterCamera,
  isVerticalMode,
  onToggleViewMode,
}) => {
  const handleReset = async () => {
    if (
      window.confirm(
        'Bạn có chắc muốn đặt lại toàn bộ thế giới Live City về ban đầu? (Hành động này sẽ xóa tiến trình hiện tại)'
      )
    ) {
      await client.resetWorld();
    }
  };

  const handleSave = async () => {
    await client.saveWorld();
  };

  return (
    <div className="flex items-center gap-1.5 glass-panel p-1.5 rounded-2xl">
      {/* Open OBS Stage link */}
      <a
        href="/stage"
        target="_blank"
        rel="noreferrer"
        title="Mở màn hình OBS Stage độc lập (/stage)"
        aria-label="Mở màn hình OBS Stage độc lập"
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-500/40 transition-all"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">OBS Stage</span>
      </a>

      {/* View Mode Toggle */}
      <button
        onClick={onToggleViewMode}
        aria-label={isVerticalMode ? 'Chuyển sang màn hình rộng' : 'Chuyển sang khung dọc livestream 9:16'}
        title={
          isVerticalMode
            ? 'Chuyển sang màn hình rộng'
            : 'Chuyển sang khung dọc livestream 9:16'
        }
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
          isVerticalMode
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
        }`}
      >
        {isVerticalMode ? (
          <Smartphone className="w-3.5 h-3.5" />
        ) : (
          <Monitor className="w-3.5 h-3.5" />
        )}
        <span className="hidden md:inline">
          {isVerticalMode ? '9:16' : 'Rộng'}
        </span>
      </button>

      {/* Pause / Resume Runtime */}
      <button
        onClick={() => client.togglePauseEngine()}
        aria-label={engineRunning ? 'Tạm dừng Game Runtime' : 'Tiếp tục Game Runtime'}
        title={engineRunning ? 'Tạm dừng Game Runtime' : 'Tiếp tục Game Runtime'}
        className={`p-1.5 rounded-xl border transition-all ${
          engineRunning
            ? 'bg-slate-800/80 hover:bg-slate-700 text-emerald-400 border-slate-700/60'
            : 'bg-amber-950/60 text-amber-300 border-amber-500/50 animate-pulse'
        }`}
      >
        {engineRunning ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </button>

      {/* Camera Recenter */}
      <button
        onClick={onRecenterCamera}
        aria-label="Canh giữa camera thành phố"
        title="Canh giữa thành phố"
        className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all"
      >
        <Crosshair className="w-4 h-4" />
      </button>

      {/* Sound Mute Toggle */}
      <button
        onClick={onToggleMute}
        aria-label={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
        title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
        className={`p-1.5 rounded-xl border transition-all ${
          isMuted
            ? 'bg-rose-950/40 text-rose-400 border-rose-800/50'
            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/60'
        }`}
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </button>

      {/* Save State */}
      <button
        onClick={handleSave}
        aria-label="Lưu trạng thái thành phố ngay lập tức"
        title="Lưu trạng thái thành phố ngay lập tức"
        className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all"
      >
        <Save className="w-4 h-4" />
      </button>

      {/* Reset World */}
      <button
        onClick={handleReset}
        aria-label="Đặt lại thế giới"
        title="Đặt lại thế giới (Reset)"
        className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-900/60 text-slate-400 hover:text-rose-200 border border-slate-700/60 transition-all"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
};
