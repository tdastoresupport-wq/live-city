import React from 'react';
import { GameEvent } from '../../core/types';
import { UserCheck, Trees, Hammer, Sparkles, AlertCircle, Info, Trophy } from 'lucide-react';

interface LiveActivityFeedProps {
  events: GameEvent[];
}

export const LiveActivityFeed: React.FC<LiveActivityFeedProps> = ({ events }) => {
  const getEventIcon = (type: GameEvent['type']) => {
    switch (type) {
      case 'citizen_joined':
        return <UserCheck className="w-3.5 h-3.5 text-emerald-400" />;
      case 'resource_harvested':
      case 'resource_deposited':
        return <Trees className="w-3.5 h-3.5 text-lime-400" />;
      case 'building_progress':
        return <Hammer className="w-3.5 h-3.5 text-amber-400" />;
      case 'building_completed':
      case 'city_leveled_up':
        return <Trophy className="w-3.5 h-3.5 text-yellow-300" />;
      case 'exploration_reward':
        return <Sparkles className="w-3.5 h-3.5 text-purple-400" />;
      case 'command_rejected':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Info className="w-3.5 h-3.5 text-sky-400" />;
    }
  };

  return (
    <div className="glass-panel p-3 rounded-2xl flex flex-col h-48 md:h-56">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-slate-200">
            Dòng sự kiện trực tiếp
          </h4>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Live Ticker</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {events.length === 0 ? (
          <div className="text-center text-xs text-slate-500 py-6">Đang chờ sự kiện đầu tiên...</div>
        ) : (
          events.slice(0, 15).map((evt) => (
            <div
              key={evt.id}
              className="flex items-start gap-2 p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs transition-all hover:bg-slate-800/50"
            >
              <div className="mt-0.5 shrink-0">{getEventIcon(evt.type)}</div>
              <div className="flex-1 leading-snug text-slate-300 break-words">
                {evt.message}
              </div>
              <span className="text-[9px] text-slate-500 shrink-0 font-mono mt-0.5">
                {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
