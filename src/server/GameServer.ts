import * as http from 'node:http';
import * as crypto from 'node:crypto';
import type { Duplex } from 'node:stream';
import { GameEngine } from '../core/engine/GameEngine';
import { FilePersistenceAdapter } from '../core/adapters/FilePersistenceAdapter';
import {
  TikTokLiveAdapter,
  ExternalStreamPayload,
  ILiveBridgeTransport,
} from '../core/adapters/TikTokLiveAdapter';
import {
  BuildingType,
  CityEventType,
  IPersistenceAdapter,
  LiveConnectionState,
} from '../core/types';
import { upgradeToWebSocket, WsClient } from './wsProtocol';

export interface GameServerOptions {
  port?: number;
  host?: string;
  persistence?: IPersistenceAdapter;
  operatorToken?: string;
  tiktokTransport?: ILiveBridgeTransport;
}

export class GameServer {
  public engine: GameEngine;
  public tiktokAdapter: TikTokLiveAdapter;
  private httpServer: http.Server | null = null;
  private clients: Set<WsClient> = new Set();
  private host: string;
  private port: number;
  private operatorToken: string;
  private startedAt: number = Date.now();
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private unsubscribeState: (() => void) | null = null;
  private pendingBroadcast = false;
  private lastBroadcastTime = 0;

  constructor(options: GameServerOptions = {}) {
    this.host = options.host || process.env.LIVE_CITY_HOST || '127.0.0.1';
    this.port = options.port ?? Number(process.env.LIVE_CITY_PORT || 4000);
    this.operatorToken =
      options.operatorToken ||
      process.env.LIVE_CITY_OPERATOR_TOKEN ||
      crypto.randomBytes(24).toString('hex');

    const persistence = options.persistence || new FilePersistenceAdapter();
    this.engine = new GameEngine({
      persistence,
      headless: true,
      tickRateHz: 25,
    });

    this.tiktokAdapter = new TikTokLiveAdapter({
      transport: options.tiktokTransport,
      bridgeUrl: process.env.TIKTOK_BRIDGE_URL || '',
    });

    // Listen to live adapter state changes and broadcast
    this.engine.mockAdapter.onStateChange(() => this.scheduleBroadcast(true));
    this.tiktokAdapter.onStateChange(() => this.scheduleBroadcast(true));
  }

  public getOperatorToken(): string {
    return this.operatorToken;
  }

  public getPort(): number {
    return this.port;
  }

  public getHost(): string {
    return this.host;
  }

  public getActiveLiveState(): LiveConnectionState {
    if (this.engine.liveAdapter.getConnectionState) {
      return this.engine.liveAdapter.getConnectionState();
    }
    return this.engine.mockAdapter.getConnectionState();
  }

  public async initAndStartEngine(): Promise<void> {
    await this.engine.init();
    this.engine.start();

    if (!this.unsubscribeState) {
      this.unsubscribeState = this.engine.worldState.subscribe(() => {
        this.scheduleBroadcast(false);
      });
    }

    // 10 Hz movement sync timer: only broadcasts when citizens are actively moving or working
    if (!this.syncInterval) {
      this.syncInterval = setInterval(() => {
        let hasActiveMotion = false;
        for (const c of this.engine.worldState.citizens.values()) {
          if (!c.isResting && (c.path.length > 0 || c.state !== 'idle' || c.floatingText)) {
            hasActiveMotion = true;
            break;
          }
        }
        if (hasActiveMotion || this.pendingBroadcast) {
          this.broadcastState();
        }
      }, 100);
    }

    // 15s WebSocket heartbeat
    if (!this.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => {
        for (const client of this.clients) {
          if (!client.isAlive) {
            client.close();
            this.clients.delete(client);
            continue;
          }
          client.isAlive = false;
          client.ping();
        }
      }, 15_000);
    }
  }

  /**
   * Starts a standalone HTTP + WebSocket server bound to 127.0.0.1.
   */
  public async startStandalone(): Promise<number> {
    await this.initAndStartEngine();

    return new Promise<number>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res).catch((err) => {
          console.error('HTTP handler error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
          }
        });
      });

      server.on('upgrade', (req, socket, head) => {
        this.handleWsUpgrade(req, socket, head);
      });

      server.on('error', reject);

      server.listen(this.port, this.host, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        this.httpServer = server;
        resolve(this.port);
      });
    });
  }

  /**
   * Attaches API routes (/api/*) and WebSocket (/ws) to an existing HTTP server (e.g. Vite Dev/Preview).
   */
  public attachToHttpServer(
    server: http.Server,
    middlewares?: {
      use: (fn: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void) => void;
    }
  ): void {
    if (middlewares) {
      middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) {
          this.handleHttpRequest(req, res).catch((err) => {
            console.error('API middleware error:', err);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal Server Error' }));
            }
          });
          return;
        }
        next();
      });
    }

    server.on('upgrade', (req, socket, head) => {
      if (req.url && req.url.startsWith('/ws')) {
        this.handleWsUpgrade(req, socket, head);
      }
    });
  }

  private isAllowedOrigin(origin?: string): boolean {
    if (!origin) return true; // Local same-origin or Node client without Origin header
    try {
      const parsed = new URL(origin);
      const h = parsed.hostname.toLowerCase();
      return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
    } catch {
      return false;
    }
  }

  private isLoopbackAddress(remoteAddress?: string): boolean {
    if (!remoteAddress) return true;
    return (
      remoteAddress === '127.0.0.1' ||
      remoteAddress === '::1' ||
      remoteAddress === '::ffff:127.0.0.1'
    );
  }

  public handleWsUpgrade(req: http.IncomingMessage, socket: Duplex, _head?: Buffer): void {
    const origin = req.headers.origin;
    if (!this.isAllowedOrigin(origin) || !this.isLoopbackAddress(req.socket?.remoteAddress)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const client = upgradeToWebSocket(
      req,
      socket,
      (wsClient, text) => this.handleWsMessage(wsClient, text),
      (wsClient) => {
        this.clients.delete(wsClient);
      }
    );

    if (client) {
      this.clients.add(client);
      // Immediately send full initial snapshot
      client.send({
        type: 'snapshot',
        payload: this.engine.worldState.toSnapshot(),
        liveState: this.getActiveLiveState(),
        engineRunning: this.engine.isEngineRunning(),
        isBotRunning: this.engine.mockAdapter.isBotSimulationRunning(),
      });
    }
  }

  private handleWsMessage(client: WsClient, text: string): void {
    try {
      const msg = JSON.parse(text) as { type?: string };
      if (msg.type === 'ping') {
        client.send({ type: 'pong', timestamp: Date.now() });
      } else if (msg.type === 'request_snapshot') {
        client.send({
          type: 'snapshot',
          payload: this.engine.worldState.toSnapshot(),
          liveState: this.getActiveLiveState(),
          engineRunning: this.engine.isEngineRunning(),
          isBotRunning: this.engine.mockAdapter.isBotSimulationRunning(),
        });
      }
    } catch {
      // Ignore malformed client WS messages
    }
  }

  private scheduleBroadcast(immediate: boolean): void {
    const now = Date.now();
    if (immediate || now - this.lastBroadcastTime >= 80) {
      this.broadcastState();
    } else {
      this.pendingBroadcast = true;
    }
  }

  public broadcastState(): void {
    this.pendingBroadcast = false;
    this.lastBroadcastTime = Date.now();
    if (this.clients.size === 0) return;

    const payload = {
      type: 'state_sync',
      payload: this.engine.worldState.toSnapshot(),
      liveState: this.getActiveLiveState(),
      engineRunning: this.engine.isEngineRunning(),
      isBotRunning: this.engine.mockAdapter.isBotSimulationRunning(),
    };

    const serialized = JSON.stringify(payload);
    for (const client of this.clients) {
      client.send(serialized);
    }
  }

  public async handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const origin = req.headers.origin;
    if (!this.isAllowedOrigin(origin) || !this.isLoopbackAddress(req.socket?.remoteAddress)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Local loopback access only' }));
      return;
    }

    const corsHeaders: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    };
    if (origin) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
      corsHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, x-operator-token';
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = urlObj.pathname;

    // 1. Public/Observer GET endpoints (used by both Dashboard and OBS Stage)
    if (req.method === 'GET' && pathname === '/api/status') {
      res.writeHead(200, corsHeaders);
      res.end(
        JSON.stringify({
          status: 'ok',
          engineRunning: this.engine.isEngineRunning(),
          uptimeMs: Date.now() - this.startedAt,
          citizensCount: this.engine.worldState.citizens.size,
          activeCitizensCount: this.engine.citizenSystem.getActiveCitizensCount(),
          liveConnection: this.getActiveLiveState(),
          isBotRunning: this.engine.mockAdapter.isBotSimulationRunning(),
          clientsConnected: this.clients.size,
        })
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/api/snapshot') {
      res.writeHead(200, corsHeaders);
      res.end(
        JSON.stringify({
          snapshot: this.engine.worldState.toSnapshot(),
          liveConnection: this.getActiveLiveState(),
          engineRunning: this.engine.isEngineRunning(),
          isBotRunning: this.engine.mockAdapter.isBotSimulationRunning(),
        })
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/api/live') {
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ liveConnection: this.getActiveLiveState() }));
      return;
    }

    // Local session bootstrap for Operator Dashboard (strictly loopback-verified)
    if (req.method === 'GET' && pathname === '/api/auth/session') {
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ operatorToken: this.operatorToken }));
      return;
    }

    // 2. Protected Control & Command POST endpoints
    if (req.method === 'POST') {
      const providedToken = req.headers['x-operator-token'];
      if (providedToken !== this.operatorToken) {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing x-operator-token' }));
        return;
      }

      const body = await this.readJsonBody(req);

      if (pathname === '/api/command') {
        const cmdType = String(body.type || 'comment');
        const userName = String(body.userName || 'Viewer_Test');

        if (cmdType === 'comment') {
          const text = String(body.comment || '');
          const customId = typeof body.id === 'string' ? body.id : undefined;
          const emitted = this.engine.mockAdapter.emitComment(text, userName, customId);
          this.broadcastState();
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: true, emitted }));
          return;
        }

        if (cmdType === 'gift') {
          const giftName = String(body.giftName || 'Hoa Hồng');
          const count = Number(body.giftCount) || 1;
          const emitted = this.engine.mockAdapter.emitGift(giftName, userName, count);
          this.broadcastState();
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: true, emitted }));
          return;
        }

        if (cmdType === 'like') {
          const count = Number(body.likeCount) || 10;
          const emitted = this.engine.mockAdapter.emitLike(userName, count);
          this.broadcastState();
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: true, emitted }));
          return;
        }

        if (cmdType === 'bot_toggle') {
          if (this.engine.mockAdapter.isBotSimulationRunning()) {
            this.engine.mockAdapter.stopBotSimulation();
          } else {
            const intervalMs = Math.max(500, Number(body.intervalMs) || 2500);
            this.engine.mockAdapter.startBotSimulation(intervalMs);
          }
          this.broadcastState();
          res.writeHead(200, corsHeaders);
          res.end(
            JSON.stringify({
              ok: true,
              isBotRunning: this.engine.mockAdapter.isBotSimulationRunning(),
            })
          );
          return;
        }

        if (cmdType === 'burst_test') {
          const burstUsers = ['Minh_Khang', 'Thu_Thao', 'Bao_Long', 'Kim_Ngan', 'Tuan_Anh'];
          const actions = ['VÀO', 'GỖ', 'ĐÁ', 'XÂY', 'KHÁM PHÁ'];
          burstUsers.forEach((u, idx) => {
            this.engine.mockAdapter.emitComment(actions[idx % actions.length], u);
          });
          this.broadcastState();
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (cmdType === 'spam_test') {
          for (let i = 0; i < 4; i++) {
            this.engine.mockAdapter.emitComment('GỖ', 'SpamBot_Test');
          }
          this.broadcastState();
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: true }));
          return;
        }
      }

      if (pathname === '/api/control/pause') {
        this.engine.stop();
        this.broadcastState();
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok: true, engineRunning: this.engine.isEngineRunning() }));
        return;
      }

      if (pathname === '/api/control/resume') {
        this.engine.start();
        this.broadcastState();
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok: true, engineRunning: this.engine.isEngineRunning() }));
        return;
      }

      if (pathname === '/api/control/save') {
        await this.engine.saveState();
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (pathname === '/api/control/reset') {
        if (body.confirm !== 'RESET_LIVE_CITY') {
          res.writeHead(400, corsHeaders);
          res.end(
            JSON.stringify({
              error: 'Missing confirmation token. Pass { "confirm": "RESET_LIVE_CITY" }.',
            })
          );
          return;
        }
        await this.engine.resetWorld();
        this.broadcastState();
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok: true, snapshot: this.engine.worldState.toSnapshot() }));
        return;
      }

      if (pathname === '/api/control/project') {
        const type = body.type as BuildingType;
        const x = typeof body.x === 'number' ? body.x : undefined;
        const y = typeof body.y === 'number' ? body.y : undefined;
        const started = this.engine.buildingSystem.startNewProject(type, x, y);
        this.broadcastState();
        res.writeHead(started ? 200 : 400, corsHeaders);
        res.end(
          JSON.stringify({
            ok: Boolean(started),
            building: started,
            error: started ? undefined : 'Không thể khởi công dự án (kiểm tra tài nguyên/cấp độ/vị trí).',
          })
        );
        return;
      }

      if (pathname === '/api/control/vote') {
        const action = String(body.action || 'open');
        if (action === 'open') {
          const duration = Number(body.durationSeconds) || 90;
          const session = this.engine.buildingSystem.openVotingSession(duration);
          this.broadcastState();
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: Boolean(session), activeVote: session }));
          return;
        } else {
          const closed = this.engine.buildingSystem.closeVotingSession(true);
          this.broadcastState();
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: Boolean(closed), closedVote: closed }));
          return;
        }
      }

      if (pathname === '/api/control/event') {
        const type = body.type as CityEventType;
        const duration = Number(body.durationSeconds) || 60;
        const costGold = Number(body.costGold) || 0;
        const evt = this.engine.resourceSystem.startCityEvent(type, duration, costGold);
        this.broadcastState();
        res.writeHead(evt ? 200 : 400, corsHeaders);
        res.end(JSON.stringify({ ok: Boolean(evt), activeEvent: evt }));
        return;
      }

      if (pathname === '/api/live/connect') {
        const platform = String(body.platform || 'mock');
        const channelId = String(body.channelId || '').trim();
        const bridgeUrl = typeof body.bridgeUrl === 'string' ? body.bridgeUrl.trim() : undefined;

        if (platform === 'mock') {
          await this.tiktokAdapter.disconnect();
          this.engine.setLiveAdapter(this.engine.mockAdapter);
          await this.engine.mockAdapter.connect({ channelId: channelId || 'mock_simulator_room' });
          this.broadcastState();
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: true, liveConnection: this.getActiveLiveState() }));
          return;
        }

        if (platform === 'tiktok_experimental') {
          this.engine.setLiveAdapter(this.tiktokAdapter);
          try {
            await this.tiktokAdapter.connect({ channelId, bridgeUrl });
            this.broadcastState();
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, liveConnection: this.getActiveLiveState() }));
          } catch (err) {
            this.broadcastState();
            res.writeHead(200, corsHeaders);
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : 'Kết nối thất bại',
                liveConnection: this.getActiveLiveState(),
              })
            );
          }
          return;
        }
      }

      if (pathname === '/api/live/disconnect') {
        await this.engine.liveAdapter.disconnect();
        this.broadcastState();
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok: true, liveConnection: this.getActiveLiveState() }));
        return;
      }

      if (pathname === '/api/live/webhook') {
        const payload = body as unknown as ExternalStreamPayload;
        const accepted = this.tiktokAdapter.handleIncomingPayload(payload);
        this.broadcastState();
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok: accepted }));
        return;
      }
    }

    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  private readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString('utf-8');
        if (raw.length > 64 * 1024) {
          req.destroy();
          resolve({});
        }
      });
      req.on('end', () => {
        if (!raw.trim()) {
          resolve({});
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed && typeof parsed === 'object' ? parsed : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', () => resolve({}));
    });
  }

  public async shutdown(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.unsubscribeState) {
      this.unsubscribeState();
      this.unsubscribeState = null;
    }

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    await this.engine.saveState().catch(() => {});
    this.engine.destroy();

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }
  }
}
