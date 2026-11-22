import type {
  ILiveEventAdapter,
  LiveConnectionState,
  RawLiveComment,
  RawLiveGift,
  RawLiveLike,
} from '../types/adapter';
import { generateId } from '../utils/id';
import { randomChoice } from '../utils/math';

export class MockLiveAdapter implements ILiveEventAdapter {
  private commentCallbacks: Set<(comment: RawLiveComment) => void> = new Set();
  private giftCallbacks: Set<(gift: RawLiveGift) => void> = new Set();
  private likeCallbacks: Set<(like: RawLiveLike) => void> = new Set();
  private stateCallbacks: Set<(state: LiveConnectionState) => void> = new Set();

  private connectionState: LiveConnectionState = {
    status: 'disconnected',
    platform: 'mock',
    channelId: 'mock_simulator_room',
    isExperimental: false,
    eventsReceived: 0,
    reconnectAttempts: 0,
  };

  private botIntervalId: ReturnType<typeof setInterval> | null = null;

  private botNames = [
    'MinhAnh_Gaming',
    'Thợ_Mỏ_Cần_Cù',
    'Bác_Tiều_Phu',
    'Lâm_Kiếm_Khách',
    'Bé_Bắp_Xinh',
    'Hải_Đăng_Live',
    'Công_Tử_Bạc_Liêu',
    'Thỏ_Bảy_Màu',
    'Vua_Chiến_Thuật',
    'Gấu_Bắc_Cực',
    'Mai_Phương_99',
    'StreamWatcher_Pro',
  ];

  private simulatedCommands = [
    'VÀO',
    'GỖ',
    'ĐÁ',
    'LƯƠNG THỰC',
    'XÂY',
    'KHÁM PHÁ',
    'GỖ',
    'ĐÁ',
    'XÂY',
  ];

  public async connect(options?: { channelId?: string }): Promise<void> {
    this.updateState({
      status: 'connected',
      channelId: options?.channelId || 'mock_simulator_room',
      connectedAt: Date.now(),
      errorMessage: undefined,
    });
  }

  public async disconnect(): Promise<void> {
    this.stopBotSimulation();
    this.updateState({
      status: 'disconnected',
      connectedAt: undefined,
    });
  }

  public isConnected(): boolean {
    return this.connectionState.status === 'connected';
  }

  public getConnectionState(): LiveConnectionState {
    return { ...this.connectionState };
  }

  public onStateChange(callback: (state: LiveConnectionState) => void): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  public onComment(callback: (comment: RawLiveComment) => void): () => void {
    this.commentCallbacks.add(callback);
    return () => this.commentCallbacks.delete(callback);
  }

  public onGift(callback: (gift: RawLiveGift) => void): () => void {
    this.giftCallbacks.add(callback);
    return () => this.giftCallbacks.delete(callback);
  }

  public onLike(callback: (like: RawLiveLike) => void): () => void {
    this.likeCallbacks.add(callback);
    return () => this.likeCallbacks.delete(callback);
  }

  private updateState(patch: Partial<LiveConnectionState>): void {
    this.connectionState = {
      ...this.connectionState,
      ...patch,
    };
    const snap = this.getConnectionState();
    for (const cb of this.stateCallbacks) {
      try {
        cb(snap);
      } catch (err) {
        console.error('Error in state callback:', err);
      }
    }
  }

  /**
   * Manually emit a comment event into the adapter.
   */
  public emitComment(
    commentText: string,
    userName = 'Viewer_Test',
    customId?: string
  ): RawLiveComment {
    const cleanName = userName.trim() || 'Viewer_Test';
    const userId = `user_${cleanName.toLowerCase().replace(/\s+/g, '_')}`;
    const comment: RawLiveComment = {
      id: customId || generateId('comment'),
      userId,
      userName: cleanName,
      comment: commentText,
      timestamp: Date.now(),
    };

    this.connectionState.eventsReceived += 1;
    this.connectionState.lastEventAt = comment.timestamp;
    this.dispatchComment(comment);
    return comment;
  }

  public emitGift(
    giftName = 'Hoa Hồng',
    userName = 'Viewer_Test',
    giftCount = 1,
    diamondValue = 1
  ): RawLiveGift {
    const cleanName = userName.trim() || 'Viewer_Test';
    const userId = `user_${cleanName.toLowerCase().replace(/\s+/g, '_')}`;
    const gift: RawLiveGift = {
      id: generateId('gift'),
      userId,
      userName: cleanName,
      giftName,
      giftCount,
      diamondValue,
      timestamp: Date.now(),
    };

    this.connectionState.eventsReceived += 1;
    this.connectionState.lastEventAt = gift.timestamp;
    for (const cb of this.giftCallbacks) {
      try {
        cb(gift);
      } catch (err) {
        console.error('Error in gift subscriber:', err);
      }
    }
    return gift;
  }

  public emitLike(userName = 'Viewer_Test', likeCount = 10): RawLiveLike {
    const cleanName = userName.trim() || 'Viewer_Test';
    const userId = `user_${cleanName.toLowerCase().replace(/\s+/g, '_')}`;
    const like: RawLiveLike = {
      id: generateId('like'),
      userId,
      userName: cleanName,
      likeCount,
      totalLikes: likeCount,
      timestamp: Date.now(),
    };

    this.connectionState.eventsReceived += 1;
    this.connectionState.lastEventAt = like.timestamp;
    for (const cb of this.likeCallbacks) {
      try {
        cb(like);
      } catch (err) {
        console.error('Error in like subscriber:', err);
      }
    }
    return like;
  }

  /**
   * Start auto-generating realistic simulated stream viewer comments.
   */
  public startBotSimulation(intervalMs = 3000): void {
    if (this.botIntervalId !== null) return;

    this.botIntervalId = setInterval(() => {
      if (!this.isConnected()) return;

      const randomUser = randomChoice(this.botNames);
      // If a voting session might be open, occasionally cast a vote
      const randomCmd = randomChoice(this.simulatedCommands);

      this.emitComment(randomCmd, randomUser);
    }, intervalMs);
  }

  public stopBotSimulation(): void {
    if (this.botIntervalId !== null) {
      clearInterval(this.botIntervalId);
      this.botIntervalId = null;
    }
  }

  public isBotSimulationRunning(): boolean {
    return this.botIntervalId !== null;
  }

  private dispatchComment(comment: RawLiveComment): void {
    for (const callback of this.commentCallbacks) {
      try {
        callback(comment);
      } catch (err) {
        console.error('Error in live comment subscriber:', err);
      }
    }
  }
}
