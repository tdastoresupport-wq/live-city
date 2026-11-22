import React, { useEffect, useRef } from 'react';
import { PixiWorldRenderer } from '../../renderer/PixiWorldRenderer';
import { WorldState } from '../../core/state/WorldState';
import { StreamHUD } from './StreamHUD';
import { BuildingProgressBar } from './BuildingProgressBar';
import { LiveActivityFeed } from './LiveActivityFeed';
import { LeaderboardHUD } from './LeaderboardHUD';
import {
  CityResources,
  CityStats,
  Building,
  Citizen,
  GameEvent,
  VotingSession,
  CityActiveEvent,
} from '../../core/types';
import { ServerSyncStatus } from '../services/GameRuntimeClient';
import { WifiOff } from 'lucide-react';

interface StreamStageProps {
  worldState: WorldState;
  rendererRef: React.MutableRefObject<PixiWorldRenderer | null>;
  isVerticalMode: boolean;
  isObsStageOnly?: boolean;
  transparentBackground?: boolean;
  syncStatus?: ServerSyncStatus;
  stats: CityStats;
  resources: CityResources;
  maxStorage?: CityResources;
  activeBuilding?: Building;
  activeVote?: VotingSession | null;
  activeEvent?: CityActiveEvent | null;
  citizens: Citizen[];
  events: GameEvent[];
}

export const StreamStage: React.FC<StreamStageProps> = ({
  worldState,
  rendererRef,
  isVerticalMode,
  isObsStageOnly = false,
  transparentBackground = false,
  syncStatus,
  stats,
  resources,
  maxStorage,
  activeBuilding,
  activeVote,
  activeEvent,
  citizens,
  events,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    let animId = 0;
    const renderer = new PixiWorldRenderer();

    const setupPixi = async () => {
      if (!canvasRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width) || 1080);
      const height = Math.max(480, Math.floor(rect.height) || 1920);

      await renderer.init(canvasRef.current, width, height, {
        transparentBackground,
      });

      if (!active) {
        renderer.destroy();
        return;
      }

      renderer.initWorldState(worldState);
      rendererRef.current = renderer;

      let lastTime = performance.now();
      const renderLoop = (time: number) => {
        if (!active) return;
        const delta = Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;

        renderer.update(delta);
        renderer.sync(worldState);

        animId = requestAnimationFrame(renderLoop);
      };

      animId = requestAnimationFrame(renderLoop);
    };

    setupPixi();

    const resizeObserver = new ResizeObserver((entries) => {
      if (!active) return;
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w > 0 && h > 0) {
          renderer.resize(w, h);
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      active = false;
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.destroy();
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
    };
  }, [worldState, rendererRef, transparentBackground]);

  return (
    <div
      ref={containerRef}
      style={{
        aspectRatio: isVerticalMode || isObsStageOnly ? '9 / 16' : undefined,
      }}
      className={`relative overflow-hidden flex flex-col justify-between transition-all duration-300 ${
        transparentBackground ? 'bg-transparent' : 'bg-slate-950'
      } ${
        isObsStageOnly
          ? 'w-full h-full max-w-[1080px] max-h-[1920px] mx-auto'
          : isVerticalMode
          ? 'h-full max-h-[92vh] w-auto max-w-full rounded-3xl shadow-2xl border-2 border-amber-500/30'
          : 'w-full h-full rounded-2xl border border-slate-800'
      }`}
    >
      {/* Pixi Canvas Background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* TOP OVERLAYS (HUD, Resources, Voting, Events) */}
      <div className="relative z-10 p-3 flex flex-col gap-2 pointer-events-none">
        {isObsStageOnly && syncStatus === 'reconnecting' && (
          <div className="self-center flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-500/50 text-amber-300 text-xs font-semibold animate-pulse shadow-lg backdrop-blur-md">
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Mất kết nối máy chủ • Đang tự động kết nối lại...</span>
          </div>
        )}
        <StreamHUD
          stats={stats}
          resources={resources}
          maxStorage={maxStorage}
          activeVote={activeVote}
          activeEvent={activeEvent}
        />
      </div>

      {/* BOTTOM OVERLAYS (Building progress, Activity feed, Leaderboard) */}
      <div className="relative z-10 p-3 flex flex-col gap-2 pointer-events-none">
        <div className="pointer-events-auto">
          <BuildingProgressBar building={activeBuilding} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pointer-events-auto">
          <LiveActivityFeed events={events} />
          <LeaderboardHUD citizens={citizens} />
        </div>
      </div>
    </div>
  );
};
