import type { GameEvent, ParsedCommand } from './index';

export type LiveConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type LivePlatformType = 'mock' | 'tiktok_experimental' | 'webhook';

export interface LiveConnectionState {
  status: LiveConnectionStatus;
  platform: LivePlatformType;
  channelId?: string;
  connectedAt?: number;
  lastEventAt?: number;
  errorMessage?: string;
  isExperimental?: boolean;
  subscriptionVerified?: boolean;
  eventsReceived: number;
  reconnectAttempts: number;
}

export interface ExternalStreamPayload {
  type: 'comment' | 'gift' | 'like' | 'connected' | 'disconnected' | 'error';
  eventId?: string;
  userId?: string;
  uniqueId?: string;
  nickname?: string;
  comment?: string;
  giftName?: string;
  repeatCount?: number;
  diamondCount?: number;
  likeCount?: number;
  totalLikeCount?: number;
  timestamp?: number;
  error?: string;
}

export interface BridgeTransportConnectOptions {
  requireAck?: boolean;
  ackTimeoutMs?: number;
  connectTimeoutMs?: number;
  allowLoopback?: boolean;
  allowedHosts?: string[];
  dnsTimeoutMs?: number;
}

export interface ILiveBridgeTransport {
  connect(
    channelId: string,
    bridgeUrl: string,
    options?: BridgeTransportConnectOptions
  ): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(cb: (payload: ExternalStreamPayload) => void): () => void;
  onClose(cb: (reason?: string) => void): () => void;
  isSubscriptionVerified?(): boolean;
}

export interface RawLiveComment {
  id: string;
  userId: string;
  userName: string;
  comment: string;
  timestamp: number;
  avatarUrl?: string;
  badges?: string[];
}

export interface RawLiveGift {
  id: string;
  userId: string;
  userName: string;
  giftName: string;
  giftCount: number;
  diamondValue: number;
  timestamp: number;
}

export interface RawLiveLike {
  id: string;
  userId: string;
  userName: string;
  likeCount: number;
  totalLikes: number;
  timestamp: number;
}

export interface ILiveEventAdapter {
  connect(options?: { channelId?: string }): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getConnectionState?(): LiveConnectionState;
  onStateChange?(callback: (state: LiveConnectionState) => void): () => void;
  onComment(callback: (comment: RawLiveComment) => void): () => void;
  onGift?(callback: (gift: RawLiveGift) => void): () => void;
  onLike?(callback: (like: RawLiveLike) => void): () => void;
}

export interface IPersistenceAdapter {
  save(key: string, data: unknown): Promise<void>;
  load<T>(key: string, fallback: T): Promise<T>;
  loadBackup?<T>(key: string, fallback: T): Promise<T>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface IAudioSystem {
  playJoinSound(): void;
  playHarvestSound(type: 'wood' | 'stone'): void;
  playBuildSound(): void;
  playCompleteSound(): void;
  playLevelUpSound(): void;
  playExploreSound(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

export interface ICommandBus {
  dispatch(command: ParsedCommand): void;
  onEvent(callback: (event: GameEvent) => void): () => void;
}
