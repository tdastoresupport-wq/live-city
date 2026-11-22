import React from 'react';
import { CityResources, CityStats } from '../../core/types';
import { Users, Trees, Mountain, Sparkles, Sun, Moon, Sunset } from 'lucide-react';

interface StreamHUDProps {
  stats: CityStats;
  resources: CityResources;
}

export const StreamHUD: React.FC<StreamHUDProps> = ({ stats, resources }) => {
  // Day cycle icon
  const getDayIcon = () => {
    if (stats.dayTime < 0.2 || stats.dayTime > 0.8) {
      return <Moon className="w-4 h-4 text-indigo-300" />;
    } else if (stats.dayTime > 0.65 && stats.dayTime <= 0.8) {
      return <Sunset className="w-4 h-4 text-amber-400" />;
    }
    return <Sun className="w-4 h-4 text-amber-300" />;
  };

  const getDayLabel = () => {
    if (stats.dayTime < 0.2 || stats.dayTime > 0.8) return 'Đêm trăng';
    if (stats.dayTime > 0.65 && stats.dayTime <= 0.8) return 'Hoàng hôn';
    return 'Nắng ấm';
  };

  const expPct = Math.min(100, Math.round((stats.exp / stats.expToNextLevel) * 100));

  return (
    <div className="flex flex-col gap-2 pointer-events-none">
      {/* Top Main Banner */}
      <div className="flex items-center justify-between glass-panel px-4 py-2.5 rounded-2xl pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center font-bold text-white shadow-lg glow-gold text-base">
            {stats.level}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-extrabold text-sm md:text-base tracking-wide text-amber-100 uppercase drop-shadow">
                {stats.name}
              </h1>
              <div className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/60">
                {getDayIcon()}
                <span>{getDayLabel()}</span>
              </div>
            </div>
            {/* Exp Bar */}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-32 md:w-44 h-2 bg-slate-950/80 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-300"
                  style={{ width: `${expPct}%` }}
                />
              </div>
              <span className="text-[10px] text-amber-300/80 font-mono">
                {stats.exp}/{stats.expToNextLevel} EXP
              </span>
            </div>
          </div>
        </div>

        {/* Citizens counter */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-cyan-500/30">
          <Users className="w-4 h-4 text-cyan-400 animate-pulse" />
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-400 font-medium">Cư dân</span>
            <span className="text-sm font-bold text-cyan-300 font-mono leading-none">
              {stats.citizensCount}
            </span>
          </div>
        </div>
      </div>

      {/* Resource Badges Row */}
      <div className="flex items-center gap-2 overflow-x-auto py-1">
        {/* Wood */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-panel-subtle border border-emerald-500/20 shadow-md">
          <div className="p-1 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
            <Trees className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Gỗ</span>
            <span className="text-sm font-extrabold text-emerald-300 font-mono leading-tight">
              {resources.wood}
            </span>
          </div>
        </div>

        {/* Stone */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-panel-subtle border border-sky-500/20 shadow-md">
          <div className="p-1 rounded-lg bg-sky-950/80 text-sky-400 border border-sky-500/30">
            <Mountain className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Đá</span>
            <span className="text-sm font-extrabold text-sky-300 font-mono leading-tight">
              {resources.stone}
            </span>
          </div>
        </div>

        {/* Territory Explored */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-panel-subtle border border-purple-500/20 shadow-md">
          <div className="p-1 rounded-lg bg-purple-950/80 text-purple-400 border border-purple-500/30">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Khám phá</span>
            <span className="text-sm font-extrabold text-purple-300 font-mono leading-tight">
              {stats.exploredPercentage}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
