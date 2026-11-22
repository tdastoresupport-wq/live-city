import { WorldState, WorldSnapshot } from '../../core/state/WorldState';
import { GameEngine } from '../../core/engine/GameEngine';
import { AudioSystem } from '../../core/systems/AudioSystem';
import {
  BuildingType,
  CityEventType,
  LiveConnectionState,
} from '../../core/types';

export type ServerSyncStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline_fallback';

export interface RuntimeClientState {
  syncStatus: ServerSyncStatus;
  engineRunning: boolean;
  isBotRunning: boolean;
  liveConnection: LiveConnectionState;
}

export class GameRuntimeClient {
  public worldState: WorldState;
  public audioSystem: AudioSystem;

  private fallbackEngine: GameEngine | null = null;
  private ws: WebSocket | null = null;
  private operatorToken = '';
  private apiBaseUrl: string;
  private wsUrl: string;
  private destroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastEventId = '';

  private clientState: RuntimeClientState = {
    syncStatus: 'connecting',
    engineRunning: true,
    isBotRunning: false,
    liveConnection: {
      status: 'connected',
      platform: 'mock',
      channelId: 'mock_simulator_room',
      eventsReceived: 0,
      reconnectAttempts: 0,
    },
  };

  private listeners: Set<() => void> = new Set();

  constructor(customPort?: number) {
    this.worldState = new WorldState();
    this.audioSystem = new AudioSystem();

    const loc = typeof window !== 'undefined' ? window.location : null;
    const host = loc ? loc.hostname || '127.0.0.1' : '127.0.0.1';
    const port = customPort || (loc && loc.port ? Number(loc.port) : 4000);
    const protocol = loc && loc.protocol === 'https:' ? 'https:' : 'http:';
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

    this.apiBaseUrl = `${protocol}//${host}:${port}`;
    this.wsUrl = `${wsProtocol}//${host}:${port}/ws`;
  }

  public getClientState(): RuntimeClientState {
    return {
      ...this.clientState,
      liveConnection: { ...this.clientState.liveConnection },
    };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    const unsubWorld = this.worldState.subscribe(listener);
    return () => {
      this.listeners.delete(listener);
      unsubWorld();
    };
  }

  private notifyClientState(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // ignore
      }
    }
  }

  public async init(isStageOnly = false): Promise<void> {
    if (this.destroyed) return;

    // 1. If operator dashboard, bootstrap local operator session token
    if (!isStageOnly) {
      try {
        const res = await fetch(`${this.apiBaseUrl}/api/auth/session`);
        if (res.ok) {
          const data = (await res.json()) as { operatorToken?: string };
          if (data.operatorToken) {
            this.operatorToken = data.operatorToken;
          }
        }
      } catch {
        // Server might not be reachable yet
      }
    }

    // 2. Connect WebSocket to authoritative local server
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    if (this.destroyed || typeof WebSocket === 'undefined') return;

    this.clearTimers();
    this.clientState.syncStatus =
      this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
    this.notifyClientState();

    try {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      const connectTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
        }
      }, 3500);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        this.reconnectAttempts = 0;
        this.stopFallbackEngine();
        this.clientState.syncStatus = 'connected';
        this.notifyClientState();

        this.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 10_000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data)) as {
            type?: string;
            payload?: WorldSnapshot;
            liveState?: LiveConnectionState;
            engineRunning?: boolean;
            isBotRunning?: boolean;
          };

          if (
            (msg.type === 'snapshot' || msg.type === 'state_sync') &&
            msg.payload
          ) {
            this.applyServerSnapshot(msg.payload);
            if (msg.liveState) {
              this.clientState.liveConnection = msg.liveState;
            }
            if (typeof msg.engineRunning === 'boolean') {
              this.clientState.engineRunning = msg.engineRunning;
            }
            if (typeof msg.isBotRunning === 'boolean') {
              this.clientState.isBotRunning = msg.isBotRunning;
            }
            this.notifyClientState();
          }
        } catch {
          // ignore malformed packet
        }
      };

      ws.onclose = () => {
        clearTimeout(connectTimeout);
        this.handleDisconnect();
      };

      ws.onerror = () => {
        clearTimeout(connectTimeout);
      };
    } catch {
      this.handleDisconnect();
    }
  }

  private applyServerSnapshot(snapshot: WorldSnapshot): void {
    this.worldState.batch(() => {
      this.worldState.resources = { ...snapshot.resources };
      if (snapshot.maxStorage) {
        this.worldState.maxStorage = { ...snapshot.maxStorage };
      }
      this.worldState.stats = { ...snapshot.stats };

      if (Array.isArray(snapshot.discoveredTiles)) {
        const set = new Set(snapshot.discoveredTiles);
        for (const [key, tile] of this.worldState.tileMap.entries()) {
          tile.discovered = set.has(key);
        }
      }

      this.worldState.citizens.clear();
      this.worldState.userCitizenMap.clear();
      for (const c of snapshot.citizens) {
        this.worldState.citizens.set(c.id, c);
        this.worldState.userCitizenMap.set(c.userId, c.id);
      }

      this.worldState.buildings.clear();
      for (const b of snapshot.buildings) {
        this.worldState.buildings.set(b.id, b);
      }

      this.worldState.resourceNodes.clear();
      for (const n of snapshot.resourceNodes) {
        this.worldState.resourceNodes.set(n.id, n);
      }

      this.worldState.activeVote = snapshot.activeVote ?? null;
      this.worldState.voteHistory = snapshot.voteHistory ?? [];
      this.worldState.activeEvent = snapshot.activeEvent ?? null;

      if (Array.isArray(snapshot.eventLog)) {
        const topEvt = snapshot.eventLog[0];
        if (topEvt && topEvt.id !== this.lastEventId) {
          this.lastEventId = topEvt.id;
          this.playCuesForNewEvent(topEvt.type);
        }
        this.worldState.eventLog = [...snapshot.eventLog];
      }

      this.worldState.notify();
    });
  }

  private playCuesForNewEvent(type: string): void {
    switch (type) {
      case 'citizen_joined':
        this.audioSystem.playJoinSound();
        break;
      case 'resource_deposited':
        this.audioSystem.playHarvestSound('wood');
        break;
      case 'building_progress':
        this.audioSystem.playBuildSound();
        break;
      case 'building_completed':
        this.audioSystem.playCompleteSound();
        break;
      case 'city_leveled_up':
        this.audioSystem.playLevelUpSound();
        break;
      case 'exploration_reward':
        this.audioSystem.playExploreSound();
        break;
    }
  }

  private handleDisconnect(): void {
    if (this.destroyed) return;
    this.clearTimers();
    this.reconnectAttempts++;

    if (this.reconnectAttempts >= 2 && !this.fallbackEngine) {
      // Activate local fallback engine if server is completely unreachable
      this.startFallbackEngine();
    } else {
      this.clientState.syncStatus = 'reconnecting';
      this.notifyClientState();
    }

    const delay = Math.min(5000, 1000 * Math.pow(1.5, this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  private startFallbackEngine(): void {
    if (this.fallbackEngine) return;
    this.clientState.syncStatus = 'offline_fallback';
    const engine = new GameEngine({ audioSystem: this.audioSystem });
    engine.worldState = this.worldState;
    this.fallbackEngine = engine;
    engine.init().then(() => engine.start());
    this.notifyClientState();
  }

  private stopFallbackEngine(): void {
    if (this.fallbackEngine) {
      this.fallbackEngine.destroy();
      this.fallbackEngine = null;
    }
  }

  private async ensureToken(): Promise<void> {
    if (this.operatorToken) return;
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/auth/session`);
      if (res.ok) {
        const data = (await res.json()) as { operatorToken?: string };
        if (data.operatorToken) {
          this.operatorToken = data.operatorToken;
        }
      }
    } catch {
      // ignore
    }
  }

  private async postApi(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    await this.ensureToken();
    const res = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-operator-token': this.operatorToken,
      },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Record<string, unknown>;
  }

  // --- Operator & Simulator Commands ---
  public async sendComment(comment: string, userName: string): Promise<void> {
    if (this.fallbackEngine) {
      this.fallbackEngine.mockAdapter.emitComment(comment, userName);
      return;
    }
    await this.postApi('/api/command', { type: 'comment', comment, userName });
  }

  public async sendGift(giftName: string, userName: string, giftCount = 1): Promise<void> {
    if (this.fallbackEngine) {
      this.fallbackEngine.mockAdapter.emitGift(giftName, userName, giftCount);
      return;
    }
    await this.postApi('/api/command', { type: 'gift', giftName, userName, giftCount });
  }

  public async sendLike(userName: string, likeCount = 10): Promise<void> {
    if (this.fallbackEngine) {
      this.fallbackEngine.mockAdapter.emitLike(userName, likeCount);
      return;
    }
    await this.postApi('/api/command', { type: 'like', userName, likeCount });
  }

  public async toggleBot(intervalMs = 2500): Promise<boolean> {
    if (this.fallbackEngine) {
      if (this.fallbackEngine.mockAdapter.isBotSimulationRunning()) {
        this.fallbackEngine.mockAdapter.stopBotSimulation();
      } else {
        this.fallbackEngine.mockAdapter.startBotSimulation(intervalMs);
      }
      this.clientState.isBotRunning = this.fallbackEngine.mockAdapter.isBotSimulationRunning();
      this.notifyClientState();
      return this.clientState.isBotRunning;
    }
    const data = await this.postApi('/api/command', { type: 'bot_toggle', intervalMs });
    this.clientState.isBotRunning = Boolean(data.isBotRunning);
    this.notifyClientState();
    return this.clientState.isBotRunning;
  }

  public async runBurstTest(): Promise<void> {
    if (this.fallbackEngine) {
      const users = ['Minh_Khang', 'Thu_Thao', 'Bao_Long', 'Kim_Ngan', 'Tuan_Anh'];
      const cmds = ['VÀO', 'GỖ', 'ĐÁ', 'XÂY', 'KHÁM PHÁ'];
      users.forEach((u, i) => this.fallbackEngine!.mockAdapter.emitComment(cmds[i], u));
      return;
    }
    await this.postApi('/api/command', { type: 'burst_test' });
  }

  public async runSpamTest(): Promise<void> {
    if (this.fallbackEngine) {
      for (let i = 0; i < 4; i++) {
        this.fallbackEngine.mockAdapter.emitComment('GỖ', 'SpamBot_Test');
      }
      return;
    }
    await this.postApi('/api/command', { type: 'spam_test' });
  }

  public async togglePauseEngine(): Promise<void> {
    if (this.fallbackEngine) {
      if (this.fallbackEngine.isEngineRunning()) {
        this.fallbackEngine.stop();
      } else {
        this.fallbackEngine.start();
      }
      this.clientState.engineRunning = this.fallbackEngine.isEngineRunning();
      this.notifyClientState();
      return;
    }
    const endpoint = this.clientState.engineRunning
      ? '/api/control/pause'
      : '/api/control/resume';
    await this.postApi(endpoint, {});
  }

  public async saveWorld(): Promise<void> {
    if (this.fallbackEngine) {
      await this.fallbackEngine.saveState();
      return;
    }
    await this.postApi('/api/control/save', {});
  }

  public async resetWorld(): Promise<void> {
    if (this.fallbackEngine) {
      await this.fallbackEngine.resetWorld();
      return;
    }
    await this.postApi('/api/control/reset', { confirm: 'RESET_LIVE_CITY' });
  }

  public async startProject(type: BuildingType): Promise<void> {
    if (this.fallbackEngine) {
      this.fallbackEngine.buildingSystem.startNewProject(type);
      return;
    }
    await this.postApi('/api/control/project', { type });
  }

  public async openVote(durationSeconds = 90): Promise<void> {
    if (this.fallbackEngine) {
      this.fallbackEngine.buildingSystem.openVotingSession(durationSeconds);
      return;
    }
    await this.postApi('/api/control/vote', { action: 'open', durationSeconds });
  }

  public async closeVote(): Promise<void> {
    if (this.fallbackEngine) {
      this.fallbackEngine.buildingSystem.closeVotingSession(true);
      return;
    }
    await this.postApi('/api/control/vote', { action: 'close' });
  }

  public async triggerCityEvent(
    type: CityEventType,
    durationSeconds = 60,
    costGold = 0
  ): Promise<void> {
    if (this.fallbackEngine) {
      this.fallbackEngine.resourceSystem.startCityEvent(type, durationSeconds, costGold);
      return;
    }
    await this.postApi('/api/control/event', { type, durationSeconds, costGold });
  }

  public async connectLiveAdapter(
    platform: 'mock' | 'tiktok_experimental',
    channelId?: string,
    bridgeUrl?: string
  ): Promise<void> {
    if (this.fallbackEngine) return;
    await this.postApi('/api/live/connect', { platform, channelId, bridgeUrl });
  }

  public async disconnectLiveAdapter(): Promise<void> {
    if (this.fallbackEngine) return;
    await this.postApi('/api/live/disconnect', {});
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  public destroy(): void {
    this.destroyed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopFallbackEngine();
  }
}
