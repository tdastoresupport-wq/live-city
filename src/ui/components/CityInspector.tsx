import React, { useState } from 'react';
import { Citizen, Building, ResourceNode } from '../../core/types';
import { Users, Building2, Trees } from 'lucide-react';

interface CityInspectorProps {
  citizens: Citizen[];
  buildings: Building[];
  resourceNodes: ResourceNode[];
}

export const CityInspector: React.FC<CityInspectorProps> = ({
  citizens,
  buildings,
  resourceNodes,
}) => {
  const [activeTab, setActiveTab] = useState<'citizens' | 'buildings' | 'resources'>('citizens');
  const [selectedCitizenId, setSelectedCitizenId] = useState<string | null>(null);

  const selectedCitizen = citizens.find((c) => c.id === selectedCitizenId);

  const getCitizenStateLabel = (c: Citizen) => {
    switch (c.state) {
      case 'moving_to_harvest': return 'Đang đi tới mỏ';
      case 'harvesting': return 'Đang khai thác';
      case 'carrying_resource': return `Vác ${c.carriedResource?.type === 'wood' ? 'gỗ' : 'đá'} về kho`;
      case 'moving_to_build': return 'Đang đến công trường';
      case 'building': return 'Đang thi công';
      case 'exploring': return 'Đang thám hiểm';
      default: return 'Nghỉ ngơi';
    }
  };

  return (
    <div className="glass-panel p-3 rounded-2xl flex flex-col h-64 md:h-72">
      {/* Tabs */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('citizens')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'citizens' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Cư dân ({citizens.length})
          </button>
          <button
            onClick={() => setActiveTab('buildings')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'buildings' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Công trình ({buildings.length})
          </button>
          <button
            onClick={() => setActiveTab('resources')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'resources' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trees className="w-3.5 h-3.5" /> Mỏ ({resourceNodes.length})
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto pr-1">
        {activeTab === 'citizens' && (
          <div className="space-y-1.5">
            {citizens.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-6">
                Chưa có cư dân nào. Hãy nhập <b>VÀO</b> trong Comment Simulator!
              </div>
            ) : (
              citizens.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCitizenId(c.id === selectedCitizenId ? null : c.id)}
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
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700/60 font-medium">
                      {getCitizenStateLabel(c)}
                    </span>
                  </div>

                  {/* Expanded citizen stats */}
                  {selectedCitizenId === c.id && selectedCitizen && (
                    <div className="mt-2 pt-2 border-t border-slate-700/60 grid grid-cols-3 gap-2 text-[10px] text-slate-300">
                      <div>🪵 Gỗ: <b className="text-emerald-300">{c.stats.woodHarvested}</b></div>
                      <div>🪨 Đá: <b className="text-sky-300">{c.stats.stoneHarvested}</b></div>
                      <div>🔨 Xây: <b className="text-amber-300">{c.stats.buildingsContributed}</b></div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'buildings' && (
          <div className="space-y-1.5">
            {buildings.map((b) => (
              <div
                key={b.id}
                className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-slate-200">{b.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Tọa độ ({b.x}, {b.y}) • Cấp {b.level}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    b.status === 'active'
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-950/80 text-amber-300 border border-amber-500/30 animate-pulse'
                  }`}
                >
                  {b.status === 'active' ? 'Hoạt động' : 'Đang xây'}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="space-y-1.5">
            {resourceNodes.map((n) => (
              <div
                key={n.id}
                className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-slate-200">{n.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Loại: {n.resourceType === 'wood' ? 'Gỗ rừng' : 'Mỏ đá'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-slate-200">
                    {n.currentAmount}/{n.maxAmount}
                  </div>
                  {n.depleted && (
                    <span className="text-[10px] text-amber-400 font-medium">Đang hồi phục</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
