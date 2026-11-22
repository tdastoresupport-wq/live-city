import React, { useState } from 'react';
import { Citizen } from '../../core/types';
import { Award, Trees, Mountain, Hammer } from 'lucide-react';

interface LeaderboardHUDProps {
  citizens: Citizen[];
}

export const LeaderboardHUD: React.FC<LeaderboardHUDProps> = ({ citizens }) => {
  const [tab, setTab] = useState<'build' | 'wood' | 'stone'>('build');

  const sortedList = [...citizens].sort((a, b) => {
    if (tab === 'wood') return b.stats.woodHarvested - a.stats.woodHarvested;
    if (tab === 'stone') return b.stats.stoneHarvested - a.stats.stoneHarvested;
    return b.stats.buildingsContributed - a.stats.buildingsContributed;
  }).slice(0, 5);

  return (
    <div className="glass-panel p-3 rounded-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Award className="w-4 h-4 text-amber-400" />
          <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-slate-200">
            Bảng vinh danh
          </h4>
        </div>

        {/* Tab switch */}
        <div className="flex bg-slate-900/80 p-0.5 rounded-lg border border-slate-800" role="tablist" aria-label="Bảng xếp hạng theo tiêu chí">
          <button
            onClick={() => setTab('build')}
            aria-label="Xếp hạng theo điểm xây dựng"
            className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-all ${
              tab === 'build' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Hammer className="w-2.5 h-2.5" /> Xây
          </button>
          <button
            onClick={() => setTab('wood')}
            aria-label="Xếp hạng theo sản lượng gỗ"
            className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-all ${
              tab === 'wood' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trees className="w-2.5 h-2.5" /> Gỗ
          </button>
          <button
            onClick={() => setTab('stone')}
            aria-label="Xếp hạng theo sản lượng đá"
            className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-all ${
              tab === 'stone' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mountain className="w-2.5 h-2.5" /> Đá
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {sortedList.length === 0 ? (
          <div className="text-center text-xs text-slate-500 py-3">Chưa có cư dân đóng góp</div>
        ) : (
          sortedList.map((c, idx) => {
            const score =
              tab === 'wood'
                ? `${c.stats.woodHarvested} Gỗ`
                : tab === 'stone'
                ? `${c.stats.stoneHarvested} Đá`
                : `${c.stats.buildingsContributed} Điểm`;

            const rankBadge =
              idx === 0 ? 'bg-amber-500 text-slate-950 font-black' :
              idx === 1 ? 'bg-slate-300 text-slate-950 font-bold' :
              idx === 2 ? 'bg-amber-700 text-amber-100 font-bold' : 'bg-slate-800 text-slate-400';

            return (
              <div
                key={c.id}
                className="flex items-center justify-between px-2.5 py-1 rounded-xl bg-slate-900/50 border border-slate-800/60 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${rankBadge}`}>
                    {idx + 1}
                  </span>
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="font-medium text-slate-200 truncate max-w-[92px]">
                    {c.userName}
                  </span>
                  <span
                    title={c.title || 'Tân Binh'}
                    className="text-[9px] px-1 py-0.2 rounded bg-slate-800/90 text-cyan-300 font-mono shrink-0"
                  >
                    Lv.{c.level || 1}
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-amber-300/90">{score}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
