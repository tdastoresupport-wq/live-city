import React from 'react';
import { Building } from '../../core/types';
import { Hammer, Sparkles, Trophy } from 'lucide-react';

interface BuildingProgressBarProps {
  building?: Building;
}

export const BuildingProgressBar: React.FC<BuildingProgressBarProps> = ({ building }) => {
  if (!building) {
    return (
      <div className="glass-panel px-3 py-2 rounded-xl text-center text-xs text-slate-400">
        Thành phố đang thanh bình — sẵn sàng cho kỳ quy hoạch tiếp theo
      </div>
    );
  }

  const isCompleted = building.status === 'active';
  const pct = Math.min(100, Math.round((building.progress / building.requiredProgress) * 100));
  const contributorCount = Object.keys(building.contributions).length;

  return (
    <div className="glass-panel p-3 rounded-2xl border border-amber-500/30 glow-gold relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute -right-4 -top-4 w-20 h-20 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />

      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-construction">
            {isCompleted ? <Trophy className="w-4 h-4 text-amber-400" /> : <Hammer className="w-4 h-4 text-amber-300" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                {isCompleted ? 'Công trình hoàn tất' : 'Dự án đang xây dựng'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">({contributorCount} thợ)</span>
            </div>
            <h3 className="font-heading font-bold text-xs md:text-sm text-slate-100">{building.name}</h3>
          </div>
        </div>

        <div className="text-right">
          <span className="text-base font-extrabold text-amber-300 font-mono">{pct}%</span>
          <div className="text-[10px] text-slate-400 font-mono">
            {building.progress}/{building.requiredProgress} pt
          </div>
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full h-3 bg-slate-950/90 rounded-full overflow-hidden p-0.5 border border-slate-800">
        <div
          className="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 rounded-full transition-all duration-300 shadow-sm"
          style={{ width: `${pct}%` }}
        />
      </div>

      {!isCompleted && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-300 px-1">
          <span className="flex items-center gap-1 text-amber-300/90 font-medium">
            <Sparkles className="w-3 h-3 text-amber-400" /> Gõ <b className="bg-amber-950/80 px-1 py-0.5 rounded border border-amber-600/40 text-amber-200">XÂY</b> để đóng góp
          </span>
          <span className="text-slate-400 font-mono">Tiến độ công trình</span>
        </div>
      )}
    </div>
  );
};
