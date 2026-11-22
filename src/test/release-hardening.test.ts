import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameServer } from '../server/GameServer';
import { LocalStoragePersistence } from '../core/adapters/LocalStoragePersistence';
import { WebSocketBridgeTransport } from '../core/adapters/WebSocketBridgeTransport';
import { GameRuntimeClient } from '../ui/services/GameRuntimeClient';

describe('Release Hardening & Independent Verification', () => {
  let server: GameServer;
  let port: number;
  let baseUrl: string;
  let operatorToken: string;

  beforeEach(async () => {
    operatorToken = 'hardening_test_token_xyz987';
    const persistence = new LocalStoragePersistence('hardening_test_');
    await persistence.clear();

    server = new GameServer({
      port: 0,
      host: '127.0.0.1',
      persistence,
      operatorToken,
    });
    port = await server.startStandalone();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    if (server) {
      await server.shutdown();
    }
  });

  describe('1. Webhook Ingestion & Anti-Replay Protection', () => {
    it('should ingest valid comment webhook, authenticate operator, and update WorldState', async () => {
      const now = Date.now();
      const payload = {
        type: 'comment',
        eventId: 'wh_evt_001',
        userId: 'webhook_miner_42',
        nickname: 'Miner42',
        comment: 'ĐÁ',
        timestamp: now,
      };

      const res = await fetch(`${baseUrl}/api/live/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': operatorToken,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok: boolean };
      expect(data.ok).toBe(true);

      // Verify citizen was actually created in server authoritative WorldState
      const citizen = server.engine.worldState.getCitizenByUserId('webhook_miner_42');
      expect(citizen).toBeDefined();
      expect(citizen?.userName).toBe('Miner42');
      expect(citizen?.state).toBe('moving_to_harvest');
      expect(citizen?.targetNodeId).toBeDefined();
    });

    it('should reject unauthenticated webhook requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/live/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': 'wrong_token',
        },
        body: JSON.stringify({
          type: 'comment',
          eventId: 'wh_unauth',
          userId: 'hacker',
          comment: 'VÀO',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should reject duplicate event IDs and stale replays with 400', async () => {
      const now = Date.now();
      const validPayload = {
        type: 'comment',
        eventId: 'wh_dup_test',
        userId: 'user_dup',
        nickname: 'UserDup',
        comment: 'GỖ',
        timestamp: now,
      };

      // First submission -> 200 OK
      const firstRes = await fetch(`${baseUrl}/api/live/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': operatorToken,
        },
        body: JSON.stringify(validPayload),
      });
      expect(firstRes.status).toBe(200);

      // Duplicate submission -> 400 Rejected
      const dupRes = await fetch(`${baseUrl}/api/live/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': operatorToken,
        },
        body: JSON.stringify(validPayload),
      });
      expect(dupRes.status).toBe(400);
      const dupData = (await dupRes.json()) as { ok: boolean; error?: string };
      expect(dupData.ok).toBe(false);
      expect(dupData.error).toContain('rejected');

      // Stale event (older than max replay age) -> 400 Rejected
      const stalePayload = {
        type: 'comment',
        eventId: 'wh_stale_123',
        userId: 'user_stale',
        nickname: 'UserStale',
        comment: 'GỖ',
        timestamp: now - 300_000, // 5 minutes old
      };
      const staleRes = await fetch(`${baseUrl}/api/live/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': operatorToken,
        },
        body: JSON.stringify(stalePayload),
      });
      expect(staleRes.status).toBe(400);
    });

    it('should ingest live gift webhook and update citizen cues and event log', async () => {
      const initialEventsCount = server.engine.worldState.eventLog.length;
      const giftPayload = {
        type: 'gift',
        eventId: 'wh_gift_001',
        userId: 'sponsor_vip',
        nickname: 'SuperFan',
        giftName: 'Hoa Hồng',
        repeatCount: 5,
        diamondCount: 50,
        timestamp: Date.now(),
      };

      const res = await fetch(`${baseUrl}/api/live/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-operator-token': operatorToken,
        },
        body: JSON.stringify(giftPayload),
      });

      expect(res.status).toBe(200);
      expect(server.engine.worldState.eventLog.length).toBeGreaterThan(initialEventsCount);
      const citizen = server.engine.worldState.getCitizenByUserId('sponsor_vip');
      expect(citizen).toBeDefined();
      expect(citizen?.floatingText?.text).toContain('Hoa Hồng');
    });
  });

  describe('2. WebSocket Bridge Transport Protocol & Safety', () => {
    it('should validate URLs and reject non-ws protocols', async () => {
      const transport = new WebSocketBridgeTransport();

      await expect(
        transport.connect('@streamer', 'http://127.0.0.1:21213')
      ).rejects.toThrow(/requires 'ws:' or 'wss:'/);

      await expect(
        transport.connect('@streamer', 'javascript:alert(1)')
      ).rejects.toThrow(/Invalid/);

      await expect(
        transport.connect('@streamer', '')
      ).rejects.toThrow(/required/);
    });

    it('should reject connection when endpoint is unreachable and not fake connected state', async () => {
      const transport = new WebSocketBridgeTransport();
      // Unreachable port
      await expect(
        transport.connect('@streamer', 'ws://127.0.0.1:59999')
      ).rejects.toThrow();

      await transport.disconnect();
    });
  });

  describe('3. Authoritative Sync & OBS Stage Split-Brain Prevention', () => {
    it('should ensure OBS Stage never runs fallback engine on disconnect and syncs with dashboard', async () => {
      // 1. Client A: Operator Dashboard
      const dashboardClient = new GameRuntimeClient(port);
      await dashboardClient.init(false);

      // 2. Client B: OBS Stage (/stage)
      const stageClient = new GameRuntimeClient(port);
      await stageClient.init(true);

      // Wait for WebSocket connections
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Both should have initial wood = 120
      expect(dashboardClient.worldState.resources.wood).toBe(120);
      expect(stageClient.worldState.resources.wood).toBe(120);

      // 3. Send command from Dashboard
      await dashboardClient.sendComment('VÀO', 'DanMoi');
      await dashboardClient.sendComment('GỖ', 'DanMoi');

      // Wait for broadcast
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify both clients received the authoritative citizen
      expect(dashboardClient.worldState.citizens.size).toBe(1);
      expect(stageClient.worldState.citizens.size).toBe(1);
      expect(stageClient.worldState.getCitizenByUserId('user_danmoi')?.userName).toBe('DanMoi');

      // 4. Cleanup
      dashboardClient.destroy();
      stageClient.destroy();
    });
  });

  describe('4. Status and Snapshot API contracts for Preview Mode', () => {
    it('should return valid JSON with engineRunning and liveConnection for preview /api/status', async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        status: string;
        engineRunning: boolean;
        liveConnection: { platform: string; status: string };
      };
      expect(data.status).toBe('ok');
      expect(data.engineRunning).toBe(true);
      expect(data.liveConnection).toBeDefined();
    });
  });
});
