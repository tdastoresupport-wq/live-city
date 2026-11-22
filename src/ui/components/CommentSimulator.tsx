import React, { useState } from 'react';
import { GameRuntimeClient } from '../services/GameRuntimeClient';
import {
  Send,
  Play,
  Square,
  Zap,
  ShieldAlert,
  User,
  Terminal,
  Gift,
  Heart,
} from 'lucide-react';

interface CommentSimulatorProps {
  client: GameRuntimeClient;
  isBotRunning: boolean;
}

export const CommentSimulator: React.FC<CommentSimulatorProps> = ({
  client,
  isBotRunning,
}) => {
  const [userName, setUserName] = useState('NguoiXem_01');
  const [customComment, setCustomComment] = useState('');

  const handleSendCommand = (cmd: string) => {
    client.sendComment(cmd, userName);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customComment.trim()) return;
    client.sendComment(customComment.trim(), userName);
    setCustomComment('');
  };

  const toggleBotSimulation = () => {
    client.toggleBot(2500);
  };

  const handleBurstTest = () => {
    client.runBurstTest();
  };

  const handleSpamTest = () => {
    client.runSpamTest();
  };

  return (
    <div className="glass-panel p-3.5 rounded-2xl flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-slate-200">
            Mô phỏng tương tác livestream
          </h4>
        </div>

        <button
          onClick={toggleBotSimulation}
          aria-label={isBotRunning ? 'Dừng bot giả lập khán giả' : 'Chạy bot giả lập khán giả'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all shadow-md ${
            isBotRunning
              ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {isBotRunning ? (
            <>
              <Square className="w-3 h-3 fill-current" /> Dừng Bot
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" /> Chạy Bot Khán Giả
            </>
          )}
        </button>
      </div>

      {/* Viewer Name Input */}
      <div className="flex items-center gap-2 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-800">
        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-[11px] text-slate-400 font-medium">Tên viewer:</span>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          aria-label="Tên người xem giả lập"
          className="bg-transparent text-xs text-amber-200 font-semibold focus:outline-none flex-1"
          placeholder="Nhập tên người xem..."
        />
      </div>

      {/* Primary Gameplay Commands */}
      <div>
        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1 block">
          Lệnh hành động & kinh tế:
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => handleSendCommand('VÀO')}
            className="px-2 py-1.5 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-200 font-bold text-xs transition-all active:scale-95 text-center"
          >
            VÀO
          </button>
          <button
            onClick={() => handleSendCommand('GỖ')}
            className="px-2 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 font-bold text-xs transition-all active:scale-95 text-center"
          >
            GỖ 🪵
          </button>
          <button
            onClick={() => handleSendCommand('ĐÁ')}
            className="px-2 py-1.5 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-200 font-bold text-xs transition-all active:scale-95 text-center"
          >
            ĐÁ 🪨
          </button>
          <button
            onClick={() => handleSendCommand('LƯƠNG THỰC')}
            className="px-2 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/40 text-rose-200 font-bold text-xs transition-all active:scale-95 text-center"
          >
            LƯƠNG THỰC 🌾
          </button>
          <button
            onClick={() => handleSendCommand('XÂY')}
            className="px-2 py-1.5 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 font-bold text-xs transition-all active:scale-95 text-center"
          >
            XÂY 🔨
          </button>
          <button
            onClick={() => handleSendCommand('KHÁM PHÁ')}
            className="px-2 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 font-bold text-xs transition-all active:scale-95 text-center"
          >
            KHÁM PHÁ 🧭
          </button>
        </div>

        {/* Community Vote, Trade & Social Actions */}
        <div className="grid grid-cols-5 gap-1 mt-1.5">
          <button
            onClick={() => handleSendCommand('VOTE 1')}
            className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-bold text-[10px] text-center"
          >
            VOTE 1
          </button>
          <button
            onClick={() => handleSendCommand('VOTE 2')}
            className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-bold text-[10px] text-center"
          >
            VOTE 2
          </button>
          <button
            onClick={() => handleSendCommand('ĐỔI VÀNG')}
            className="px-1.5 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 border border-amber-600/40 text-amber-300 font-bold text-[10px] text-center"
          >
            ĐỔI VÀNG
          </button>
          <button
            onClick={() => client.sendGift('Pháo Hoa', userName, 1)}
            className="px-1.5 py-1 rounded-lg bg-pink-950/60 hover:bg-pink-900/60 border border-pink-600/40 text-pink-300 font-bold text-[10px] flex items-center justify-center gap-0.5"
          >
            <Gift className="w-2.5 h-2.5" /> Quà
          </button>
          <button
            onClick={() => client.sendLike(userName, 15)}
            className="px-1.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-600/40 text-rose-300 font-bold text-[10px] flex items-center justify-center gap-0.5"
          >
            <Heart className="w-2.5 h-2.5" /> Tim
          </button>
        </div>
      </div>

      {/* Custom Comment Field */}
      <form onSubmit={handleCustomSubmit} className="flex gap-2">
        <input
          type="text"
          value={customComment}
          onChange={(e) => setCustomComment(e.target.value)}
          aria-label="Nhập comment livestream giả lập"
          placeholder="Nhập comment (vd: !xay, vote 1, chat go)..."
          className="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/80"
        />
        <button
          type="submit"
          aria-label="Gửi comment giả lập"
          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1 transition-all shadow"
        >
          <Send className="w-3.5 h-3.5" /> Gửi
        </button>
      </form>

      {/* Stress & Spam Test Buttons */}
      <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
        <span className="text-slate-400 font-medium">Kiểm thử hệ thống:</span>
        <div className="flex gap-2">
          <button
            onClick={handleBurstTest}
            aria-label="Kiểm thử Burst 5 người dùng đồng thời"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-900/40 hover:bg-indigo-900/70 text-indigo-300 border border-indigo-700/50 transition-all font-semibold"
          >
            <Zap className="w-3 h-3 text-indigo-400" /> Burst 5 Users
          </button>
          <button
            onClick={handleSpamTest}
            aria-label="Kiểm thử chống spam Rate Limiter"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-950/70 text-rose-300 border border-rose-700/50 transition-all font-semibold"
          >
            <ShieldAlert className="w-3 h-3 text-rose-400" /> Test Spam
          </button>
        </div>
      </div>
    </div>
  );
};
