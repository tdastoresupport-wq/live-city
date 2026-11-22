import { ILiveEventAdapter, RawLiveComment } from '../types/adapter';
import { generateId } from '../utils/id';
import { randomChoice } from '../utils/math';

export class MockLiveAdapter implements ILiveEventAdapter {
  private commentCallbacks: Set<(comment: RawLiveComment) => void> = new Set();
  private connected = false;
  private botIntervalId: number | null = null;

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
    'XÂY',
    'KHÁM PHÁ',
    'GỖ',
    'ĐÁ',
    'XÂY',
  ];

  public async connect(): Promise<void> {
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.stopBotSimulation();
    this.connected = false;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public onComment(callback: (comment: RawLiveComment) => void): () => void {
    this.commentCallbacks.add(callback);
    return () => this.commentCallbacks.delete(callback);
  }

  /**
   * Manually emit a comment event into the adapter (e.g. from the Comment Simulator UI).
   */
  public emitComment(commentText: string, userName = 'Viewer_Test', customId?: string): RawLiveComment {
    const userId = `user_${userName.toLowerCase().replace(/\s+/g, '_')}`;
    const comment: RawLiveComment = {
      id: customId || generateId('comment'),
      userId,
      userName,
      comment: commentText,
      timestamp: Date.now(),
    };

    this.dispatchComment(comment);
    return comment;
  }

  /**
   * Start auto-generating realistic simulated stream viewer comments.
   */
  public startBotSimulation(intervalMs = 3000): void {
    if (this.botIntervalId !== null) return;

    this.botIntervalId = window.setInterval(() => {
      if (!this.connected) return;

      const randomUser = randomChoice(this.botNames);
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
