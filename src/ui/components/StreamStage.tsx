import React, { useEffect, useRef } from 'react';
import { PixiWorldRenderer } from '../../renderer/PixiWorldRenderer';
import { GameEngine } from '../../core/engine/GameEngine';
import { StreamHUD } from './StreamHUD';
import { BuildingProgressBar } from './BuildingProgressBar';
import { LiveActivityFeed } from './LiveActivityFeed';
import { LeaderboardHUD } from './LeaderboardHUD';
import { CityResources, CityStats, Building, Citizen, GameEvent } from '../../core/types';

interface StreamStageProps {
  engine: GameEngine;
  rendererRef: React.MutableRefObject<PixiWorldRenderer | null>;
  isVerticalMode: boolean;
  stats: CityStats;
  resources: CityResources;
  activeBuilding?: Building;
  citizens: Citizen[];
  events: GameEvent[];
}

export const StreamStage: React.FC<StreamStageProps> = ({
  engine,
  rendererRef,
  isVerticalMode,
  stats,
  resources,
  activeBuilding,
  citizens,
  events,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let renderer: PixiWorldRenderer | null = null;
    let animId: number;

    const setupPixi = async () => {
      if (!canvasRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(480, Math.floor(rect.height));

      renderer = new PixiWorldRenderer();
      await renderer.init(canvasRef.current, width, height);
      renderer.initWorldState(engine.worldState);
      rendererRef.current = renderer;

      let lastTime = performance.now();
      const renderLoop = (time: number) => {
        const delta = Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;

        if (renderer) {
          renderer.update(delta);
          renderer.sync(engine.worldState);
        }

        animId = requestAnimationFrame(renderLoop);
      };

      animId = requestAnimationFrame(renderLoop);
    };

    setupPixi();

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (rendererRef.current) {
          const w = Math.floor(entry.contentRect.width);
          const h = Math.floor(entry.contentRect.height);
          if (w > 0 && h > 0) {
            rendererRef.current.resize(w, h);
          }
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      if (renderer) {
        renderer.destroy();
        rendererRef.current = null;
      }
    };
  }, [engine, rendererRef]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-slate-950 flex flex-col justify-between transition-all duration-300 ${
        isVerticalMode
          ? 'w-full max-w-[480px] h-[850px] max-h-[92vh] rounded-3xl shadow-2xl border-2 border-amber-500/30'
          : 'w-full h-full rounded-2xl border border-slate-800'
      }`}
    >
      {/* Pixi Canvas Background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* TOP OVERLAYS (HUD) */}
      <div className="relative z-10 p-3 flex flex-col gap-2 pointer-events-none">
        <StreamHUD stats={stats} resources={resources} />
      </div>

      {/* BOTTOM OVERLAYS (Building progress, Activity feed, Leaderboard) */}
      <div className="relative z-10 p-3 flex flex-col gap-2 pointer-events-none">
        {/* Active Building Banner */}
        <div className="pointer-events-auto">
          <BuildingProgressBar building={activeBuilding} />
        </div>

        {/* Dynamic Activity Feed & Leaderboard side-by-side or stacked in vertical mode */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pointer-events-auto">
          <LiveActivityFeed events={events} />
          <LeaderboardHUD citizens={citizens} />
        </div>
      </div>
    </div>
  );
};
