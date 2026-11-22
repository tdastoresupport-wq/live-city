import { RawLiveComment, ParsedCommand } from '../types';
import { CommandParser } from './CommandParser';
import { RateLimiter } from './RateLimiter';
import { Deduplicator } from './Deduplicator';
import { CitizenSystem } from '../systems/CitizenSystem';
import { WorldState } from '../state/WorldState';

export interface DispatchResult {
  status: 'success' | 'ignored_duplicate' | 'rate_limited' | 'invalid_command' | 'rejected_state';
  message?: string;
  command?: ParsedCommand;
}

export class CommandDispatcher {
  private deduplicator: Deduplicator;
  private rateLimiter: RateLimiter;
  private citizenSystem: CitizenSystem;
  private worldState: WorldState;

  constructor(
    worldState: WorldState,
    citizenSystem: CitizenSystem,
    rateLimiter = new RateLimiter(1500),
    deduplicator = new Deduplicator(60000)
  ) {
    this.worldState = worldState;
    this.citizenSystem = citizenSystem;
    this.rateLimiter = rateLimiter;
    this.deduplicator = deduplicator;
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
    // 1. Anti-duplicate event check
    if (!this.deduplicator.isUnique(raw.id, raw.timestamp)) {
      return {
        status: 'ignored_duplicate',
        message: `Bỏ qua sự kiện trùng lặp (ID: ${raw.id})`,
      };
    }

    // 2. Command Parsing
    const parsed = CommandParser.parse(raw);
    if (!parsed) {
      // Not a registered game command; let ordinary chat pass or report
      return {
        status: 'invalid_command',
        message: `Lệnh "${raw.comment}" không hợp lệ. Gõ VÀO, GỖ, ĐÁ, XÂY hoặc KHÁM PHÁ.`,
      };
    }

    // 3. Rate Limiting
    const rateCheck = this.rateLimiter.checkAndRecord(raw.userId, raw.timestamp || Date.now());
    if (!rateCheck.allowed) {
      const waitSec = (rateCheck.remainingMs / 1000).toFixed(1);
      this.worldState.pushEvent(
        'command_rejected',
        `⏳ [${raw.userName}] vui lòng chờ ${waitSec}s trước khi gửi lệnh tiếp theo!`,
        raw.userName
      );
      return {
        status: 'rate_limited',
        message: `Đang bị giới hạn tốc độ (chờ ${waitSec}s)`,
        command: parsed,
      };
    }

    // 4. Command Execution via Systems
    return this.executeCommand(parsed);
  }

  private executeCommand(cmd: ParsedCommand): DispatchResult {
    const { userId, userName, action } = cmd;

    switch (action) {
      case 'JOIN': {
        const { isNew } = this.citizenSystem.getOrCreateCitizen(userId, userName);
        if (!isNew) {
          const citizen = this.worldState.getCitizenByUserId(userId);
          if (citizen) {
            citizen.floatingText = {
              text: 'Sẵn sàng nhận lệnh! ⚔️',
              color: '#38bdf8',
              timer: 2.0,
            };
          }
        }
        return { status: 'success', command: cmd };
      }

      case 'WOOD': {
        // Auto-join citizen if not present
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

      case 'HELP': {
        this.worldState.pushEvent(
          'system_info',
          `📜 Lệnh hợp lệ: VÀO (Gia nhập) | GỖ (Đốn củi) | ĐÁ (Khai thác) | XÂY (Góp sức xây) | KHÁM PHÁ (Mở đất)`,
          userName
        );
        return { status: 'success', command: cmd };
      }

      case 'STATUS': {
        const citizen = this.worldState.getCitizenByUserId(userId);
        if (citizen) {
          this.worldState.pushEvent(
            'system_info',
            `📊 Cư dân [${userName}]: Thu hoạch ${citizen.stats.woodHarvested} gỗ, ${citizen.stats.stoneHarvested} đá, góp ${citizen.stats.buildingsContributed} điểm xây.`,
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
