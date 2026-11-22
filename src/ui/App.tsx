import React, { useEffect, useState, useRef } from 'react';
import { GameRuntimeClient, RuntimeClientState } from './services/GameRuntimeClient';
import { PixiWorldRenderer } from '../renderer/PixiWorldRenderer';
import { StreamStage } from './components/StreamStage';
import { CommentSimulator } from './components/CommentSimulator';
import { CityInspector } from './components/CityInspector';
import { ControlsToolbar } from './components/ControlsToolbar';
import {
  CityResources,
  CityStats,
  Building,
  Citizen,
  GameEvent,
  VotingSession,
  CityActiveEvent,
} from '../core/types';
import { Radio, HelpCircle, Wifi, WifiOff } from 'lucide-react';

export const App: React.FC = () => {
  const clientRef = useRef<GameRuntimeClient | null>(null);
  const rendererRef = useRef<PixiWorldRenderer | null>(null);

  if (!clientRef.current) {
    clientRef.current = new GameRuntimeClient();
  }
  const client = clientRef.current;
  const worldState = client.worldState;

  // Detect route: /stage for OBS Browser Source vs / for Operator Dashboard
  const isObsStageRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/stage' ||
      window.location.pathname.startsWith('/stage/') ||
      window.location.hash === '#/stage');

  const isTransparentBg =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('bg') === 'transparent';

  const [resources, setResources] = useState<CityResources>(() => ({
    ...worldState.resources,
  }));
  const [maxStorage, setMaxStorage] = useState<CityResources>(() => ({
    ...worldState.maxStorage,
  }));
  const [stats, setStats] = useState<CityStats>(() => ({
    ...worldState.stats,
  }));
  const [citizens, setCitizens] = useState<Citizen[]>(() =>
    Array.from(worldState.citizens.values())
  );
  const [buildings, setBuildings] = useState<Building[]>(() =>
    Array.from(worldState.buildings.values())
  );
  const [events, setEvents] = useState<GameEvent[]>(() => [
    ...worldState.eventLog,
  ]);
  const [activeVote, setActiveVote] = useState<VotingSession | null>(
    () => worldState.activeVote
  );
  const [activeEvent, setActiveEvent] = useState<CityActiveEvent | null>(
    () => worldState.activeEvent
  );
  const [runtimeState, setRuntimeState] = useState<RuntimeClientState>(() =>
    client.getClientState()
  );

  const [isMuted, setIsMuted] = useState(false);
  const [isVerticalMode, setIsVerticalMode] = useState(true);

  useEffect(() => {
    client.init(isObsStageRoute);

    const unsubscribe = client.subscribe(() => {
      setResources({ ...worldState.resources });
      setMaxStorage({ ...worldState.maxStorage });
      setStats({ ...worldState.stats });
      setCitizens(Array.from(worldState.citizens.values()));
      setBuildings(Array.from(worldState.buildings.values()));
      setEvents([...worldState.eventLog]);
      setActiveVote(worldState.activeVote ? { ...worldState.activeVote } : null);
      setActiveEvent(worldState.activeEvent ? { ...worldState.activeEvent } : null);
      setRuntimeState(client.getClientState());
    });

    return () => {
      unsubscribe();
      client.destroy();
    };
  }, [client, worldState, isObsStageRoute]);

  const handleToggleMute = () => {
    const next = !isMuted;
    client.audioSystem.setMuted(next);
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

  const activeBuilding = worldState.getActiveUnderConstruction();
  const resourceNodesList = Array.from(worldState.resourceNodes.values());

  // --- DEDICATED OBS BROWSER SOURCE STAGE (/stage) ---
  if (isObsStageRoute) {
    return (
      <div
        className={`w-screen h-screen overflow-hidden flex items-center justify-center ${
          isTransparentBg ? 'bg-transparent' : 'bg-slate-950'
        }`}
      >
        <StreamStage
          worldState={worldState}
          rendererRef={rendererRef}
          isVerticalMode={true}
          isObsStageOnly={true}
          transparentBackground={isTransparentBg}
          syncStatus={runtimeState.syncStatus}
          stats={stats}
          resources={resources}
          maxStorage={maxStorage}
          activeBuilding={activeBuilding}
          activeVote={activeVote}
          activeEvent={activeEvent}
          citizens={citizens}
          events={events}
        />
      </div>
    );
  }

  // --- OPERATOR DASHBOARD (/ or /control) ---
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
                Stream-Ready Interactive City Runtime
              </span>
            </div>
          </div>

          {/* Server Sync Pill */}
          <div
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
              runtimeState.syncStatus === 'connected'
                ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                : runtimeState.syncStatus === 'reconnecting' ||
                  runtimeState.syncStatus === 'connecting'
                ? 'bg-amber-950/60 border-amber-500/30 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            {runtimeState.syncStatus === 'connected' ? (
              <Wifi className="w-3 h-3 text-emerald-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-amber-400" />
            )}
            <span>
              {runtimeState.syncStatus === 'connected'
                ? 'Local Server Synced (127.0.0.1)'
                : runtimeState.syncStatus === 'offline_fallback'
                ? 'Local Standalone Mode'
                : 'Syncing Runtime...'}
            </span>
          </div>

          {/* Live Adapter Status Pill */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-700/70 text-[11px] text-slate-300">
            <Radio
              className={`w-3 h-3 ${
                runtimeState.liveConnection.status === 'connected'
                  ? 'text-cyan-400 animate-pulse'
                  : 'text-rose-400'
              }`}
            />
            <span>
              Adapter: <b>{runtimeState.liveConnection.platform.toUpperCase()}</b> (
              {runtimeState.liveConnection.status})
            </span>
          </div>
        </div>

        {/* Global Toolbar */}
        <ControlsToolbar
          client={client}
          engineRunning={runtimeState.engineRunning}
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
        <main
          className={`flex-1 flex items-center justify-center min-w-0 overflow-hidden ${
            isVerticalMode ? 'bg-slate-900/30 rounded-3xl p-2' : ''
          }`}
        >
          <StreamStage
            worldState={worldState}
            rendererRef={rendererRef}
            isVerticalMode={isVerticalMode}
            stats={stats}
            resources={resources}
            maxStorage={maxStorage}
            activeBuilding={activeBuilding}
            activeVote={activeVote}
            activeEvent={activeEvent}
            citizens={citizens}
            events={events}
          />
        </main>

        {/* Right Sidebar: Comment Simulator & City Inspector */}
        <aside className="w-80 md:w-96 flex flex-col gap-2.5 shrink-0 overflow-y-auto pr-1">
          <CommentSimulator
            client={client}
            isBotRunning={runtimeState.isBotRunning}
          />

          <CityInspector
            client={client}
            cityLevel={stats.level}
            citizens={citizens}
            buildings={buildings}
            blueprints={worldState.blueprints}
            resourceNodes={resourceNodesList}
            activeVote={activeVote}
            activeEvent={activeEvent}
            liveConnection={runtimeState.liveConnection}
          />

          {/* Quick Help Guide */}
          <div className="glass-panel p-2.5 rounded-2xl text-xs text-slate-400 border border-slate-800">
            <div className="flex items-center gap-1.5 text-slate-200 font-bold mb-1">
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Tập lệnh tương tác cho khán giả:</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] leading-snug">
              <div>
                • <b className="text-cyan-300">VÀO</b>: Tạo cư dân
              </div>
              <div>
                • <b className="text-emerald-300">GỖ</b>: Đốn củi rừng
              </div>
              <div>
                • <b className="text-sky-300">ĐÁ</b>: Đào đá tảng
              </div>
              <div>
                • <b className="text-rose-300">LƯƠNG THỰC</b>: Hái quả
              </div>
              <div>
                • <b className="text-amber-300">XÂY</b>: Góp sức xây
              </div>
              <div>
                • <b className="text-purple-300">KHÁM PHÁ</b>: Mở sương mù
              </div>
              <div>
                • <b className="text-cyan-200">VOTE 1..3</b>: Bầu dự án
              </div>
              <div>
                • <b className="text-yellow-300">ĐỔI VÀNG</b>: Giao thương
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
