import React, { useState } from 'react';
import { MockLiveAdapter } from '../../core/adapters/MockLiveAdapter';
import { Send, Play, Square, Zap, ShieldAlert, User, Terminal } from 'lucide-react';

interface CommentSimulatorProps {
  liveAdapter: MockLiveAdapter;
}

export const CommentSimulator: React.FC<CommentSimulatorProps> = ({ liveAdapter }) => {
  const [userName, setUserName] = useState('NguoiXem_01');
  const [customComment, setCustomComment] = useState('');
  const [isBotRunning, setIsBotRunning] = useState(liveAdapter.isBotSimulationRunning());

  const handleSendCommand = (cmd: string) => {
    liveAdapter.emitComment(cmd, userName);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customComment.trim()) return;
    liveAdapter.emitComment(customComment.trim(), userName);
    setCustomComment('');
  };

  const toggleBotSimulation = () => {
    if (isBotRunning) {
      liveAdapter.stopBotSimulation();
      setIsBotRunning(false);
    } else {
      liveAdapter.startBotSimulation(2500);
      setIsBotRunning(true);
    }
  };

  // Burst test: injects 6 simultaneous viewer comments to verify concurrency
  const handleBurstTest = () => {
    const burstUsers = ['Minh_Khang', 'Thu_Thao', 'Bao_Long', 'Kim_Ngan', 'Tuan_Anh'];
    const actions = ['VÀO', 'GỖ', 'ĐÁ', 'XÂY', 'KHÁM PHÁ'];
    burstUsers.forEach((u, idx) => {
      setTimeout(() => {
        liveAdapter.emitComment(actions[idx % actions.length], u);
      }, idx * 100);
    });
  };

  // Spam test: sends 5 rapid comments from same user within 200ms to test rate limiter
  const handleSpamTest = () => {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        liveAdapter.emitComment('GỖ', 'SpamBot_Test');
      }, i * 80);
    }
  };

  return (
    <div className="glass-panel p-3.5 rounded-2xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-slate-200">
            Trình mô phỏng comment livestream
          </h4>
        </div>

        {/* Auto bot toggle */}
        <button
          onClick={toggleBotSimulation}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all shadow-md ${
            isBotRunning
              ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {isBotRunning ? (
            <>
              <Square className="w-3 h-3 fill-current" /> Dừng Bot Tự Động
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
          className="bg-transparent text-xs text-amber-200 font-semibold focus:outline-none flex-1"
          placeholder="Nhập tên người xem..."
        />
      </div>

      {/* Quick Command Buttons */}
      <div>
        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1.5 block">
          Lệnh nhanh (Click để gửi):
        </span>
        <div className="grid grid-cols-5 gap-1.5">
          <button
            onClick={() => handleSendCommand('VÀO')}
            className="px-2 py-2 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-200 font-bold text-xs transition-all hover:scale-105 active:scale-95 text-center shadow"
          >
            VÀO
          </button>
          <button
            onClick={() => handleSendCommand('GỖ')}
            className="px-2 py-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 font-bold text-xs transition-all hover:scale-105 active:scale-95 text-center shadow"
          >
            GỖ
          </button>
          <button
            onClick={() => handleSendCommand('ĐÁ')}
            className="px-2 py-2 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-200 font-bold text-xs transition-all hover:scale-105 active:scale-95 text-center shadow"
          >
            ĐÁ
          </button>
          <button
            onClick={() => handleSendCommand('XÂY')}
            className="px-2 py-2 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 font-bold text-xs transition-all hover:scale-105 active:scale-95 text-center shadow"
          >
            XÂY
          </button>
          <button
            onClick={() => handleSendCommand('KHÁM PHÁ')}
            className="px-1.5 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 font-bold text-[11px] transition-all hover:scale-105 active:scale-95 text-center shadow"
          >
            KHÁM PHÁ
          </button>
        </div>
      </div>

      {/* Custom Comment Field */}
      <form onSubmit={handleCustomSubmit} className="flex gap-2">
        <input
          type="text"
          value={customComment}
          onChange={(e) => setCustomComment(e.target.value)}
          placeholder="Nhập comment tùy ý (ví dụ: !xay, chat go, !vao)..."
          className="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/80"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1 transition-all shadow"
        >
          <Send className="w-3.5 h-3.5" /> Gửi
        </button>
      </form>

      {/* Engineering Stress & Spam Test Buttons */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
        <span className="text-slate-400 font-medium">Kiểm thử kỹ thuật:</span>
        <div className="flex gap-2">
          <button
            onClick={handleBurstTest}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-900/40 hover:bg-indigo-900/70 text-indigo-300 border border-indigo-700/50 transition-all font-semibold"
          >
            <Zap className="w-3 h-3 text-indigo-400" /> Burst 5 Users
          </button>
          <button
            onClick={handleSpamTest}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-950/70 text-rose-300 border border-rose-700/50 transition-all font-semibold"
          >
            <ShieldAlert className="w-3 h-3 text-rose-400" /> Test Spam
          </button>
        </div>
      </div>
    </div>
  );
};
