import React, { useEffect, useState, useRef } from 'react';
import { GameEngine } from '../core/engine/GameEngine';
import { PixiWorldRenderer } from '../renderer/PixiWorldRenderer';
import { StreamStage } from './components/StreamStage';
import { CommentSimulator } from './components/CommentSimulator';
import { CityInspector } from './components/CityInspector';
import { ControlsToolbar } from './components/ControlsToolbar';
import { CityResources, CityStats, Building, Citizen, GameEvent } from '../core/types';
import { Radio, HelpCircle } from 'lucide-react';

export const App: React.FC = () => {
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<PixiWorldRenderer | null>(null);

  // Initialize engine once
  if (!engineRef.current) {
    engineRef.current = new GameEngine();
  }
  const engine = engineRef.current;

  // React state reflecting WorldState for UI rendering
  const [resources, setResources] = useState<CityResources>(() => ({ ...engine.worldState.resources }));
  const [stats, setStats] = useState<CityStats>(() => ({ ...engine.worldState.stats }));
  const [citizens, setCitizens] = useState<Citizen[]>(() => Array.from(engine.worldState.citizens.values()));
  const [buildings, setBuildings] = useState<Building[]>(() => Array.from(engine.worldState.buildings.values()));
  const [events, setEvents] = useState<GameEvent[]>(() => [...engine.worldState.eventLog]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVerticalMode, setIsVerticalMode] = useState(true);

  useEffect(() => {
    // Start engine and subscribe to state updates
    engine.init().then(() => {
      engine.start();
    });

    const unsubscribe = engine.worldState.subscribe(() => {
      setResources({ ...engine.worldState.resources });
      setStats({ ...engine.worldState.stats });
      setCitizens(Array.from(engine.worldState.citizens.values()));
      setBuildings(Array.from(engine.worldState.buildings.values()));
      setEvents([...engine.worldState.eventLog]);
    });

    return () => {
      unsubscribe();
      engine.destroy();
    };
  }, [engine]);

  const handleToggleMute = () => {
    const next = !isMuted;
    engine.audioSystem.setMuted(next);
    setIsMuted(next);
  };

  const handleRecenterCamera = () => {
    if (rendererRef.current) {
      const screen = rendererRef.current.app.screen;
      rendererRef.current.camera.focusCenter(screen.width, screen.height);
    }
  };

  const handleToggleViewMode = () => {
    setIsVerticalMode((prev) => !prev);
  };

  const activeBuilding = engine.worldState.getActiveUnderConstruction();
  const resourceNodesList = Array.from(engine.worldState.resourceNodes.values());

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center font-heading font-black text-slate-950 shadow-md">
              LC
            </div>
            <div>
              <h1 className="font-heading font-black text-sm md:text-base tracking-wider text-slate-100 leading-none">
                LIVE CITY
              </h1>
              <span className="text-[10px] text-amber-400/90 font-semibold tracking-widest uppercase">
                Phase 00: Foundation & Project Engineering
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-[11px] text-emerald-300">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>Interactive Stream Engine Active</span>
          </div>
        </div>

        {/* Global Toolbar */}
        <ControlsToolbar
          engine={engine}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onRecenterCamera={handleRecenterCamera}
          isVerticalMode={isVerticalMode}
          onToggleViewMode={handleToggleViewMode}
        />
      </header>

      {/* Main Workspace: Game Stage + Operator / Simulator Panel */}
      <div className="flex-1 flex overflow-hidden p-2 md:p-3 gap-3">
        {/* Game Stage (World is Central) */}
        <main className={`flex-1 flex items-center justify-center min-w-0 overflow-hidden ${
          isVerticalMode ? 'bg-slate-900/30 rounded-3xl p-2' : ''
        }`}>
          <StreamStage
            engine={engine}
            rendererRef={rendererRef}
            isVerticalMode={isVerticalMode}
            stats={stats}
            resources={resources}
            activeBuilding={activeBuilding}
            citizens={citizens}
            events={events}
          />
        </main>

        {/* Right Sidebar: Comment Simulator & City Inspector */}
        <aside className="w-80 md:w-96 flex flex-col gap-3 shrink-0 overflow-y-auto pr-1">
          {/* Comment Simulator */}
          <CommentSimulator liveAdapter={engine.mockAdapter} />

          {/* City Inspector */}
          <CityInspector
            citizens={citizens}
            buildings={buildings}
            resourceNodes={resourceNodesList}
          />

          {/* Quick Help Guide */}
          <div className="glass-panel p-3 rounded-2xl text-xs text-slate-400 border border-slate-800">
            <div className="flex items-center gap-1.5 text-slate-200 font-bold mb-1">
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Hướng dẫn tương tác cho khán giả:</span>
            </div>
            <ul className="space-y-1 text-[11px] leading-relaxed list-disc list-inside">
              <li><b className="text-cyan-300">VÀO</b>: Xuất hiện cư dân của bạn tại quảng trường.</li>
              <li><b className="text-emerald-300">GỖ</b>: Tự động di chuyển tới rừng đốn củi và nộp về kho.</li>
              <li><b className="text-sky-300">ĐÁ</b>: Di chuyển tới mỏ đá hoa cương để khai thác.</li>
              <li><b className="text-amber-300">XÂY</b>: Tham gia thi công dự án công trình đang mở.</li>
              <li><b className="text-purple-300">KHÁM PHÁ</b>: Đi tuần tra mở mang bờ cõi thành phố.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
};
