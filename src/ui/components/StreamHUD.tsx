import React from 'react';
import {
  CityActiveEvent,
  CityResources,
  CityStats,
  VotingSession,
} from '../../core/types';
import {
  Users,
  Trees,
  Mountain,
  Wheat,
  Coins,
  Sparkles,
  Sun,
  Moon,
  Sunset,
  Vote,
  Flame,
} from 'lucide-react';

interface StreamHUDProps {
  stats: CityStats;
  resources: CityResources;
  maxStorage?: CityResources;
  activeVote?: VotingSession | null;
  activeEvent?: CityActiveEvent | null;
}

export const StreamHUD: React.FC<StreamHUDProps> = ({
  stats,
  resources,
  maxStorage,
  activeVote,
  activeEvent,
}) => {
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
              <div className="w-28 md:w-40 h-2 bg-slate-950/80 rounded-full overflow-hidden border border-slate-800">
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
            <span className="text-[10px] text-slate-400 font-medium">Cư dân</span>
            <span className="text-sm font-bold text-cyan-300 font-mono leading-none">
              {stats.citizensCount}/{stats.activeCitizensCap || 40}
            </span>
          </div>
        </div>
      </div>

      {/* Resource Badges Row */}
      <div className="grid grid-cols-5 gap-1.5 py-0.5">
        {/* Wood */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-panel-subtle border border-emerald-500/20 shadow-md">
          <div className="p-1 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
            <Trees className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] text-slate-400 uppercase font-semibold truncate">
              Gỗ {maxStorage ? `(${maxStorage.wood})` : ''}
            </span>
            <span className="text-xs md:text-sm font-extrabold text-emerald-300 font-mono leading-tight">
              {resources.wood}
            </span>
          </div>
        </div>

        {/* Stone */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-panel-subtle border border-sky-500/20 shadow-md">
          <div className="p-1 rounded-lg bg-sky-950/80 text-sky-400 border border-sky-500/30">
            <Mountain className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] text-slate-400 uppercase font-semibold truncate">
              Đá {maxStorage ? `(${maxStorage.stone})` : ''}
            </span>
            <span className="text-xs md:text-sm font-extrabold text-sky-300 font-mono leading-tight">
              {resources.stone}
            </span>
          </div>
        </div>

        {/* Food */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-panel-subtle border border-rose-500/20 shadow-md">
          <div className="p-1 rounded-lg bg-rose-950/80 text-rose-400 border border-rose-500/30">
            <Wheat className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] text-slate-400 uppercase font-semibold truncate">
              Thực phẩm
            </span>
            <span className="text-xs md:text-sm font-extrabold text-rose-300 font-mono leading-tight">
              {resources.food}
            </span>
          </div>
        </div>

        {/* Gold */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-panel-subtle border border-amber-500/20 shadow-md">
          <div className="p-1 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-500/30">
            <Coins className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] text-slate-400 uppercase font-semibold truncate">
              Vàng
            </span>
            <span className="text-xs md:text-sm font-extrabold text-amber-300 font-mono leading-tight">
              {resources.gold}
            </span>
          </div>
        </div>

        {/* Territory Explored */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass-panel-subtle border border-purple-500/20 shadow-md">
          <div className="p-1 rounded-lg bg-purple-950/80 text-purple-400 border border-purple-500/30">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] text-slate-400 uppercase font-semibold truncate">
              Mở đất
            </span>
            <span className="text-xs md:text-sm font-extrabold text-purple-300 font-mono leading-tight">
              {stats.exploredPercentage}%
            </span>
          </div>
        </div>
      </div>

      {/* Active City Event Banner */}
      {activeEvent && (
        <div className="glass-panel px-3.5 py-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-950/80 via-slate-900/90 to-amber-950/80 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400 animate-bounce shrink-0" />
            <div>
              <span className="text-[11px] font-extrabold text-amber-300 uppercase tracking-wide">
                {activeEvent.name}
              </span>
              <p className="text-[10px] text-slate-200 leading-tight">
                {activeEvent.description}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 shrink-0">
            {Math.max(0, Math.ceil((activeEvent.endsAt - Date.now()) / 1000))}s
          </span>
        </div>
      )}

      {/* Active Community Voting Banner */}
      {activeVote && activeVote.status === 'open' && (
        <div className="glass-panel px-3.5 py-2.5 rounded-xl border border-cyan-400/50 glow-cyan pointer-events-auto">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Vote className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-cyan-200">
                Bình chọn công trình kế tiếp
              </span>
            </div>
            <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
              Còn {Math.max(0, Math.ceil((activeVote.endsAt - Date.now()) / 1000))}s • Gõ VOTE 1..{activeVote.options.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {activeVote.options.map((opt) => (
              <div
                key={opt.index}
                className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-700/80 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-amber-300 bg-amber-950/80 px-1.5 py-0.2 rounded">
                    VOTE {opt.index}
                  </span>
                  <span className="text-xs font-black text-cyan-300 font-mono">
                    {opt.votes} phiếu
                  </span>
                </div>
                <div className="text-[11px] font-bold text-slate-100 truncate mt-1">
                  {opt.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
