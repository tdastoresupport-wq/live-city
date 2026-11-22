import React, { useState } from 'react';
import {
  Citizen,
  Building,
  ResourceNode,
  BuildingBlueprint,
  VotingSession,
  CityActiveEvent,
  CityMilestone,
  LiveConnectionState,
  CityEventType,
} from '../../core/types';
import { GameRuntimeClient } from '../services/GameRuntimeClient';
import {
  Users,
  Building2,
  Sparkles,
  Radio,
  Vote,
  Hammer,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  PowerOff,
} from 'lucide-react';

interface CityInspectorProps {
  client: GameRuntimeClient;
  cityLevel: number;
  citizens: Citizen[];
  buildings: Building[];
  blueprints: BuildingBlueprint[];
  resourceNodes: ResourceNode[];
  activeVote: VotingSession | null;
  activeEvent: CityActiveEvent | null;
  milestones?: CityMilestone[];
  liveConnection: LiveConnectionState;
}

export const CityInspector: React.FC<CityInspectorProps> = ({
  client,
  cityLevel,
  citizens,
  buildings,
  blueprints,
  resourceNodes,
  activeVote,
  activeEvent,
  milestones = [],
  liveConnection,
}) => {
  const [activeTab, setActiveTab] = useState<
    'citizens' | 'projects' | 'events' | 'live'
  >('projects');
  const [selectedCitizenId, setSelectedCitizenId] = useState<string | null>(null);
  const [tiktokChannel, setTiktokChannel] = useState('');
  const [tiktokBridgeUrl, setTiktokBridgeUrl] = useState('');
  const [requireAck, setRequireAck] = useState(true);

  const selectedCitizen = citizens.find((c) => c.id === selectedCitizenId);
  const hasActiveConstruction = buildings.some((b) => b.status === 'constructing');

  const getCitizenStateLabel = (c: Citizen) => {
    if (c.isResting) return 'Đang nghỉ ngơi 💤';
    switch (c.state) {
      case 'moving_to_harvest':
        return 'Đi tới mỏ';
      case 'harvesting':
        return 'Đang khai thác';
      case 'carrying_resource':
        return `Vác ${c.carriedResource?.amount || ''} ${c.carriedResource?.type || ''} về kho`;
      case 'moving_to_build':
        return 'Đến công trường';
      case 'building':
        return 'Đang thi công';
      case 'exploring':
        return 'Đang thám hiểm';
      default:
        return 'Rảnh rỗi';
    }
  };

  const cityEventsList: Array<{
    type: CityEventType;
    name: string;
    desc: string;
  }> = [
    {
      type: 'harvest_festival',
      name: 'Lễ Hội Mùa Gặt',
      desc: '+50% sản lượng khai thác, +20% tốc độ (60s)',
    },
    {
      type: 'builders_day',
      name: 'Ngày Hội Kiến Thiết',
      desc: 'Tốc độ xây dựng công trình x2 (60s)',
    },
    {
      type: 'rain_storm',
      name: 'Cơn Mưa Rào Mùa Hạ',
      desc: '+30% sản lượng gỗ, đi chậm 15% (45s)',
    },
    {
      type: 'treasure_hunt',
      name: 'Khám Phá Kho Báu Cổ',
      desc: 'Thưởng ngay +30 Vàng, +40 EXP & tăng tốc',
    },
    {
      type: 'resource_boom',
      name: 'Mạch Khoáng Sản Trù Phú',
      desc: 'Hồi phục 100% trữ lượng mọi mỏ tài nguyên',
    },
  ];

  const stageUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/stage`
      : 'http://127.0.0.1:3000/stage';

  return (
    <div className="glass-panel p-3 rounded-2xl flex flex-col h-80">
      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 pb-2 mb-2 border-b border-slate-800" role="tablist" aria-label="Bảng điều tra thành phố">
        <button
          onClick={() => setActiveTab('projects')}
          aria-label="Tab Dự án và Biểu quyết"
          className={`px-2 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
            activeTab === 'projects'
              ? 'bg-amber-600 text-white'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/50'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" /> Dự án
        </button>
        <button
          onClick={() => setActiveTab('citizens')}
          aria-label="Tab Danh sách Cư dân"
          className={`px-2 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
            activeTab === 'citizens'
              ? 'bg-cyan-600 text-white'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/50'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Cư dân ({citizens.length})
        </button>
        <button
          onClick={() => setActiveTab('events')}
          aria-label="Tab Sự kiện và Tài nguyên"
          className={`px-2 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
            activeTab === 'events'
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> Sự kiện
        </button>
        <button
          onClick={() => setActiveTab('live')}
          aria-label="Tab Live Stream và OBS"
          className={`px-2 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
            activeTab === 'live'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/50'
          }`}
        >
          <Radio className="w-3.5 h-3.5" /> Live & OBS
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2">
        {/* TAB 1: PROJECTS & COMMUNITY VOTING */}
        {activeTab === 'projects' && (
          <div className="space-y-2">
            {/* Voting Controls */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-cyan-200 flex items-center gap-1">
                  <Vote className="w-3.5 h-3.5 text-cyan-400" />
                  Biểu quyết cộng đồng
                </div>
                <div className="text-[10px] text-slate-400">
                  {activeVote && activeVote.status === 'open'
                    ? 'Phiên bầu chọn đang mở trên màn hình stream'
                    : 'Cho phép khán giả gõ VOTE 1, 2, 3 chọn dự án'}
                </div>
              </div>
              {activeVote && activeVote.status === 'open' ? (
                <button
                  onClick={() => client.closeVote()}
                  aria-label="Chốt phiếu bầu chọn hiện tại"
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold shrink-0"
                >
                  Chốt Phiếu
                </button>
              ) : (
                <button
                  onClick={() => client.openVote(90)}
                  aria-label="Mở phiên bình chọn dự án 90 giây"
                  className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold shrink-0"
                >
                  Mở Vote 90s
                </button>
              )}
            </div>

            {milestones.length > 0 && (
              <div className="p-2 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1">
                <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">
                  Thành tựu thành phố ({milestones.length}):
                </div>
                <div className="flex flex-wrap gap-1">
                  {milestones.map((m) => (
                    <span
                      key={m.id}
                      title={m.description}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-200 border border-amber-600/30 font-semibold"
                    >
                      🏅 {m.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Blueprint Catalog */}
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Danh mục quy hoạch công trình:
            </div>
            {blueprints.map((bp) => {
              const isLocked = bp.unlockedAtLevel > cityLevel;
              return (
                <div
                  key={bp.type}
                  className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-200 flex items-center gap-1.5">
                      <span>{bp.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-mono">
                        Cấp {bp.unlockedAtLevel}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {bp.description}
                    </div>
                    <div className="text-[10px] text-emerald-300/90 font-mono mt-0.5">
                      Chi phí: {bp.cost.wood || 0} Gỗ • {bp.cost.stone || 0} Đá
                    </div>
                  </div>
                  <button
                    disabled={isLocked || hasActiveConstruction}
                    onClick={() => client.startProject(bp.type)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 flex items-center gap-1 ${
                      isLocked || hasActiveConstruction
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-amber-600 hover:bg-amber-500 text-white'
                    }`}
                  >
                    <Hammer className="w-3 h-3" />
                    {isLocked ? `Mở ở Cấp ${bp.unlockedAtLevel}` : 'Khởi công'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 2: CITIZENS */}
        {activeTab === 'citizens' && (
          <div className="space-y-1.5">
            {citizens.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-6">
                Chưa có cư dân nào. Hãy nhấn <b>VÀO</b> trong bảng mô phỏng!
              </div>
            ) : (
              citizens.map((c) => (
                <div
                  key={c.id}
                  onClick={() =>
                    setSelectedCitizenId(c.id === selectedCitizenId ? null : c.id)
                  }
                  className={`p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                    c.id === selectedCitizenId
                      ? 'bg-slate-800 border-cyan-500/60 shadow-md'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="font-bold text-slate-200">{c.userName}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-mono">
                        Lv.{c.level || 1} • {c.title || 'Tân Binh'}
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700/60 font-medium">
                      {getCitizenStateLabel(c)}
                    </span>
                  </div>

                  {selectedCitizenId === c.id && selectedCitizen && (
                    <div className="mt-2 pt-2 border-t border-slate-700/60 space-y-1 text-[10px] text-slate-300">
                      <div className="flex items-center justify-between text-amber-200 font-mono">
                        <span>Kinh nghiệm: {c.xp || 0} XP</span>
                        <span>Danh hiệu: {c.title || 'Tân Binh'}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        <div>
                          🪵 Gỗ: <b className="text-emerald-300">{c.stats.woodHarvested}</b>
                        </div>
                        <div>
                          🪨 Đá: <b className="text-sky-300">{c.stats.stoneHarvested}</b>
                        </div>
                        <div>
                          🌾 Thực: <b className="text-rose-300">{c.stats.foodHarvested || 0}</b>
                        </div>
                        <div>
                          🔨 Xây: <b className="text-amber-300">{c.stats.buildingsContributed}</b>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>
                          Tọa độ: ({Math.round(c.x)}, {Math.round(c.y)}) • Lệnh:{' '}
                          {c.stats.totalCommands}
                        </span>
                        {c.queuedTask && (
                          <span className="text-amber-300 font-semibold">
                            Hàng đợi: {c.queuedTask.type}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: CITY EVENTS & RESOURCE NODES */}
        {activeTab === 'events' && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Kích hoạt sự kiện cộng đồng:
            </div>
            {cityEventsList.map((ev) => (
              <div
                key={ev.type}
                className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-amber-200">{ev.name}</div>
                  <div className="text-[10px] text-slate-400">{ev.desc}</div>
                </div>
                <button
                  onClick={() => client.triggerCityEvent(ev.type, 60, 0)}
                  className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold shrink-0"
                >
                  Phát động
                </button>
              </div>
            ))}

            {activeEvent && (
              <div className="p-2 rounded-xl bg-amber-950/40 border border-amber-500/40 text-[11px] text-amber-200">
                Đang diễn ra: <b>{activeEvent.name}</b>
              </div>
            )}

            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pt-2">
              Trạng thái mỏ tài nguyên ({resourceNodes.length}):
            </div>
            {resourceNodes.map((n) => (
              <div
                key={n.id}
                className="p-1.5 rounded-lg bg-slate-900/40 border border-slate-800/80 text-[11px] flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-slate-200">{n.name}</span>
                  {n.discovered === false && (
                    <span className="ml-1.5 text-[9px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-700/50">
                      Ẩn trong sương mù
                    </span>
                  )}
                </div>
                <span className="font-mono text-slate-300">
                  {Math.round(n.currentAmount)}/{n.maxAmount}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: LIVE ADAPTER & OBS STAGE CONFIG */}
        {activeTab === 'live' && (
          <div className="space-y-2.5 text-xs">
            {/* OBS Stage Box */}
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-amber-500/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-300">
                  🎥 OBS Browser Source Stage (1080 × 1920)
                </span>
                <a
                  href="/stage"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] text-cyan-300 hover:underline font-bold"
                >
                  Mở /stage <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="p-1.5 rounded bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-200 select-all">
                {stageUrl}
              </div>
              <div className="text-[10px] text-slate-400 leading-snug">
                • Nền trong suốt cho OBS: <code className="text-amber-200 select-all">{stageUrl}?bg=transparent</code>
                <br />• Kích thước chuẩn: Width <b>1080</b> × Height <b>1920</b>
              </div>
            </div>

            {/* Live Adapter Status */}
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">Nguồn sự kiện Livestream:</span>
                {liveConnection.status === 'connected' && liveConnection.subscriptionVerified ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                    <CheckCircle2 className="w-3 h-3" />
                    {liveConnection.platform.toUpperCase()} • ĐÃ XÁC MINH
                  </span>
                ) : liveConnection.status === 'connected' && !liveConnection.subscriptionVerified ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-yellow-950 text-yellow-300 border border-yellow-500/40">
                    <AlertCircle className="w-3 h-3" />
                    {liveConnection.platform.toUpperCase()} • CHỜ XÁC MINH
                  </span>
                ) : liveConnection.status === 'reconnecting' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    {liveConnection.platform.toUpperCase()} • ĐANG RECONNECT
                  </span>
                ) : liveConnection.status === 'error' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-rose-950 text-rose-300 border border-rose-500/40">
                    <AlertTriangle className="w-3 h-3" />
                    {liveConnection.platform.toUpperCase()} • LỖI
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-slate-800 text-slate-400 border border-slate-700">
                    <PowerOff className="w-3 h-3" />
                    {liveConnection.platform.toUpperCase()} • CHƯA KẾT NỐI
                  </span>
                )}
              </div>

              <div className="text-[11px] text-slate-400">
                Kênh: <b className="text-slate-200">{liveConnection.channelId || 'N/A'}</b> • Sự
                kiện đã nhận: <b className="text-cyan-300">{liveConnection.eventsReceived}</b>
              </div>

              {liveConnection.errorMessage && (
                <div className="p-2 rounded-lg bg-rose-950/70 border border-rose-500/40 text-[11px] text-rose-200">
                  ⚠️ {liveConnection.errorMessage}
                </div>
              )}

              {/* Switch Adapter Controls */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <input
                  type="text"
                  value={tiktokChannel}
                  onChange={(e) => setTiktokChannel(e.target.value)}
                  aria-label="Tên kênh TikTok Live"
                  placeholder="TikTok @username (vd: @livecity_official)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200"
                />
                <input
                  type="text"
                  value={tiktokBridgeUrl}
                  onChange={(e) => setTiktokBridgeUrl(e.target.value)}
                  aria-label="Địa chỉ WebSocket Bridge cục bộ"
                  placeholder="Local Bridge URL (tùy chọn, vd: ws://127.0.0.1:21213)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200"
                />
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none pt-0.5">
                  <input
                    type="checkbox"
                    checked={requireAck}
                    onChange={(e) => setRequireAck(e.target.checked)}
                    aria-label="Bắt buộc xác thực handshake Strict ACK"
                    className="rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-900"
                  />
                  <span>Bắt buộc xác thực handshake (Strict ACK)</span>
                </label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() =>
                      client.connectLiveAdapter(
                        'tiktok_experimental',
                        tiktokChannel,
                        tiktokBridgeUrl,
                        requireAck
                      )
                    }
                    aria-label="Kết nối TikTok Bridge"
                    className="flex-1 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-[11px]"
                  >
                    Kết nối TikTok Bridge
                  </button>
                  <button
                    onClick={() => client.connectLiveAdapter('mock', 'mock_simulator_room')}
                    aria-label="Chuyển sang nguồn giả lập Mock"
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px]"
                  >
                    Dùng Mock
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
