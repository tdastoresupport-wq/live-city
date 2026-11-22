import type { RawLiveComment, RawLiveGift, RawLiveLike, ParsedCommand } from '../types';
import { CommandParser } from './CommandParser';
import { RateLimiter } from './RateLimiter';
import { Deduplicator } from './Deduplicator';
import { CitizenSystem } from '../systems/CitizenSystem';
import { BuildingSystem } from '../systems/BuildingSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { WorldState } from '../state/WorldState';

export interface DispatchResult {
  status:
    | 'success'
    | 'ignored_duplicate'
    | 'rate_limited'
    | 'invalid_command'
    | 'rejected_state'
    | 'queue_overflow';
  message?: string;
  command?: ParsedCommand;
}

export class CommandDispatcher {
  private deduplicator: Deduplicator;
  private rateLimiter: RateLimiter;
  private citizenSystem: CitizenSystem;
  private buildingSystem?: BuildingSystem;
  private resourceSystem?: ResourceSystem;
  private worldState: WorldState;
  private maxBurstQueueSize = 150;
  private currentPendingCount = 0;

  constructor(
    worldState: WorldState,
    citizenSystem: CitizenSystem,
    rateLimiter = new RateLimiter(1500, 40),
    deduplicator = new Deduplicator(60000),
    buildingSystem?: BuildingSystem,
    resourceSystem?: ResourceSystem
  ) {
    this.worldState = worldState;
    this.citizenSystem = citizenSystem;
    this.rateLimiter = rateLimiter;
    this.deduplicator = deduplicator;
    this.buildingSystem = buildingSystem;
    this.resourceSystem = resourceSystem;
  }

  public setSystems(buildingSystem: BuildingSystem, resourceSystem: ResourceSystem): void {
    this.buildingSystem = buildingSystem;
    this.resourceSystem = resourceSystem;
  }

  public getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  public getDeduplicator(): Deduplicator {
    return this.deduplicator;
  }

  /**
   * Process a live comment through the pipeline.
   */
  public processComment(raw: RawLiveComment): DispatchResult {
    // 0. Basic sanity check on payload
    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof raw.id !== 'string' ||
      !raw.id.trim() ||
      typeof raw.userId !== 'string' ||
      !raw.userId.trim()
    ) {
      return {
        status: 'invalid_command',
        message: 'Dữ liệu sự kiện không hợp lệ (thiếu ID hoặc userId).',
      };
    }

    if (this.currentPendingCount >= this.maxBurstQueueSize) {
      return {
        status: 'queue_overflow',
        message: 'Hàng đợi xử lý lệnh đang quá tải.',
      };
    }

    this.currentPendingCount++;
    try {
      const eventTimestamp =
        typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp) && raw.timestamp > 0
          ? raw.timestamp
          : Date.now();

      // 1. Anti-duplicate event check
      if (!this.deduplicator.isUnique(raw.id.trim(), eventTimestamp)) {
        return {
          status: 'ignored_duplicate',
          message: `Bỏ qua sự kiện trùng lặp (ID: ${raw.id})`,
        };
      }

      // 2. Command Parsing
      const parsed = CommandParser.parse({ ...raw, timestamp: eventTimestamp });
      if (!parsed) {
        return {
          status: 'invalid_command',
          message: `Bình luận "${raw.comment}" không phải lệnh trò chơi.`,
        };
      }

      // 3. Rate Limiting (per-user & global)
      const rateCheck = this.rateLimiter.checkAndRecord(parsed.userId, eventTimestamp);
      if (!rateCheck.allowed) {
        const waitSec = (rateCheck.remainingMs / 1000).toFixed(1);
        if (rateCheck.reason === 'user_cooldown') {
          this.worldState.pushEvent(
            'command_rejected',
            `⏳ [${parsed.userName}] vui lòng chờ ${waitSec}s trước khi gửi lệnh tiếp theo!`,
            parsed.userName
          );
        }
        return {
          status: 'rate_limited',
          message: `Đang bị giới hạn tốc độ (chờ ${waitSec}s)`,
          command: parsed,
        };
      }

      // 4. Command Execution via Domain Systems
      return this.executeCommand(parsed);
    } finally {
      this.currentPendingCount = Math.max(0, this.currentPendingCount - 1);
    }
  }

  /**
   * Process a normalized gift event (community aesthetic/festival boost, never P2W imbalance).
   */
  public processGift(gift: RawLiveGift): boolean {
    if (!gift || !gift.id || !this.deduplicator.isUnique(`gift_${gift.id}`, gift.timestamp || Date.now())) {
      return false;
    }

    const userName = CommandParser.sanitizeText(gift.userName || 'Khán giả', 36);
    const giftName = CommandParser.sanitizeText(gift.giftName || 'Quà tặng', 36);
    const count = Math.max(1, Math.min(999, Number(gift.giftCount) || 1));

    this.worldState.batch(() => {
      const { citizen } = this.citizenSystem.getOrCreateCitizen(gift.userId, userName);
      citizen.floatingText = {
        text: `🎁 Tặng ${count}x ${giftName}!`,
        color: '#f472b6',
        timer: 3.0,
      };
      this.worldState.pushEvent(
        'city_event',
        `🎁 [${userName}] vừa gửi tặng thành phố ${count}x ${giftName}! Cư dân toàn thành phố được khích lệ tinh thần!`,
        userName
      );
    });
    return true;
  }

  /**
   * Process a normalized like event.
   */
  public processLike(like: RawLiveLike): boolean {
    if (!like || !like.id || !this.deduplicator.isUnique(`like_${like.id}`, like.timestamp || Date.now())) {
      return false;
    }

    const userName = CommandParser.sanitizeText(like.userName || 'Khán giả', 36);
    const citizen = this.worldState.getCitizenByUserId(like.userId);
    if (citizen) {
      citizen.floatingText = {
        text: `❤️ Thả tim!`,
        color: '#fb7185',
        timer: 1.5,
      };
      this.worldState.notify();
    } else {
      this.worldState.pushEvent(
        'system_info',
        `❤️ [${userName}] đã thả tim cổ vũ thành phố Live City!`,
        userName
      );
    }
    return true;
  }

  private executeCommand(cmd: ParsedCommand): DispatchResult {
    const { userId, userName, action, params } = cmd;

    switch (action) {
      case 'JOIN': {
        const { isNew, citizen } = this.citizenSystem.getOrCreateCitizen(userId, userName);
        if (!isNew) {
          citizen.floatingText = {
            text: 'Sẵn sàng nhận lệnh! ⚔️',
            color: '#38bdf8',
            timer: 2.0,
          };
          this.worldState.notify();
        }
        return { status: 'success', command: cmd };
      }

      case 'WOOD': {
        const { citizen } = this.citizenSystem.getOrCreateCitizen(userId, userName);
        const assigned = this.citizenSystem.assignHarvest(citizen, 'wood');
        return {
          status: assigned ? 'success' : 'rejected_state',
          command: cmd,
        };
      }

      case 'STONE': {
        const { citizen } = this.citizenSystem.getOrCreateCitizen(userId, userName);
        const assigned = this.citizenSystem.assignHarvest(citizen, 'stone');
        return {
          status: assigned ? 'success' : 'rejected_state',
          command: cmd,
        };
      }

      case 'FOOD': {
        const { citizen } = this.citizenSystem.getOrCreateCitizen(userId, userName);
        const assigned = this.citizenSystem.assignHarvest(citizen, 'food');
        return {
          status: assigned ? 'success' : 'rejected_state',
          command: cmd,
        };
      }

      case 'BUILD': {
        const { citizen } = this.citizenSystem.getOrCreateCitizen(userId, userName);
        const assigned = this.citizenSystem.assignBuild(citizen);
        return {
          status: assigned ? 'success' : 'rejected_state',
          command: cmd,
        };
      }

      case 'EXPLORE': {
        const { citizen } = this.citizenSystem.getOrCreateCitizen(userId, userName);
        const assigned = this.citizenSystem.assignExplore(citizen);
        return {
          status: assigned ? 'success' : 'rejected_state',
          command: cmd,
        };
      }

      case 'VOTE': {
        this.citizenSystem.getOrCreateCitizen(userId, userName);
        if (!this.buildingSystem) {
          return { status: 'rejected_state', command: cmd };
        }
        const optIdx = parseInt(params[0] || '1', 10);
        const res = this.buildingSystem.castVote(userId, userName, optIdx);
        return {
          status: res.success ? 'success' : 'rejected_state',
          message: res.message,
          command: cmd,
        };
      }

      case 'TRADE': {
        this.citizenSystem.getOrCreateCitizen(userId, userName);
        if (!this.resourceSystem) {
          return { status: 'rejected_state', command: cmd };
        }
        const arg = params[0] || 'wood';
        const resType: 'wood' | 'stone' | 'food' =
          arg === 'da' || arg === 'stone'
            ? 'stone'
            : arg === 'food' || arg === 'thucpham'
            ? 'food'
            : 'wood';
        const traded = this.resourceSystem.tradeForGold(resType, 20, userName);
        return {
          status: traded.success ? 'success' : 'rejected_state',
          command: cmd,
        };
      }

      case 'HELP': {
        this.worldState.pushEvent(
          'system_info',
          `📜 Lệnh hợp lệ: VÀO | GỖ | ĐÁ | LƯƠNG THỰC | XÂY | KHÁM PHÁ | VOTE <số> | ĐỔI VÀNG`,
          userName
        );
        return { status: 'success', command: cmd };
      }

      case 'STATUS': {
        const citizen = this.worldState.getCitizenByUserId(userId);
        if (citizen) {
          this.worldState.pushEvent(
            'system_info',
            `📊 Cư dân [${userName}]: ${citizen.stats.woodHarvested} gỗ, ${citizen.stats.stoneHarvested} đá, ${citizen.stats.buildingsContributed} điểm xây, ${citizen.stats.explorationPoints} điểm thám hiểm.`,
            userName
          );
        } else {
          this.worldState.pushEvent(
            'system_info',
            `Bạn chưa gia nhập thành phố! Hãy gõ VÀO để tham gia.`,
            userName
          );
        }
        return { status: 'success', command: cmd };
      }

      default:
        return {
          status: 'invalid_command',
          message: `Lệnh chưa được hỗ trợ.`,
          command: cmd,
        };
    }
  }
}
