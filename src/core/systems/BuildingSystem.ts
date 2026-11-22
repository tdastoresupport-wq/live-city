import { WorldState } from '../state/WorldState';
import { Building, BuildingBlueprint, BuildingType, VotingOption, VotingSession } from '../types';
import { generateId } from '../utils/id';

export class BuildingSystem {
  private worldState: WorldState;

  constructor(worldState: WorldState) {
    this.worldState = worldState;
  }

  /**
   * Finds a valid, non-overlapping walkable placement coordinate for a blueprint.
   */
  public findValidPlacement(blueprint: BuildingBlueprint, preferredX?: number, preferredY?: number): { x: number; y: number } | null {
    if (preferredX !== undefined && preferredY !== undefined) {
      const check = this.worldState.canPlaceBuilding(
        preferredX,
        preferredY,
        blueprint.width,
        blueprint.height
      );
      return check.valid ? { x: preferredX, y: preferredY } : null;
    }

    if (blueprint.defaultX !== undefined && blueprint.defaultY !== undefined) {
      const check = this.worldState.canPlaceBuilding(
        blueprint.defaultX,
        blueprint.defaultY,
        blueprint.width,
        blueprint.height
      );
      if (check.valid) {
        return { x: blueprint.defaultX, y: blueprint.defaultY };
      }
    }

    // Spiral search outward from town plaza (10, 10)
    const { width, height } = this.worldState.getGridDimensions();
    const candidates: Array<{ x: number; y: number; dist: number }> = [];
    for (let x = 4; x <= width - blueprint.width - 1; x++) {
      for (let y = 2; y <= height - blueprint.height - 1; y++) {
        const check = this.worldState.canPlaceBuilding(x, y, blueprint.width, blueprint.height);
        if (check.valid) {
          const dist = Math.hypot(x - 10, y - 10);
          candidates.push({ x, y, dist });
        }
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.length > 0 ? { x: candidates[0].x, y: candidates[0].y } : null;
  }

  /**
   * Starts a new building construction project with strict validation:
   * - No concurrent active construction
   * - Respects unlockedAtLevel
   * - Checks bounds, water terrain, and collision with buildings/nodes
   * - Atomically checks and consumes resources
   */
  public startNewProject(type: BuildingType, x?: number, y?: number): Building | null {
    const existing = this.worldState.getActiveUnderConstruction();
    if (existing) {
      return null;
    }

    const blueprint = this.worldState.blueprints.find((b) => b.type === type);
    if (!blueprint) return null;

    // 1. Respect unlockedAtLevel
    if (this.worldState.stats.level < blueprint.unlockedAtLevel) {
      this.worldState.pushEvent(
        'command_rejected',
        `🔒 Công trình [${blueprint.name}] yêu cầu Thành phố đạt Cấp ${blueprint.unlockedAtLevel} (Hiện tại: Cấp ${this.worldState.stats.level}).`
      );
      return null;
    }

    // 2. Validate placement & collision
    const coords = this.findValidPlacement(blueprint, x, y);
    if (!coords) {
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ Vị trí đặt công trình [${blueprint.name}] không hợp lệ (chồng lấn hoặc nằm trên mặt nước).`
      );
      return null;
    }

    // 3. Atomic resource check and consumption
    const consumed = this.worldState.consumeResourcesAtomic(blueprint.cost);
    if (!consumed) {
      const needWood = blueprint.cost.wood || 0;
      const needStone = blueprint.cost.stone || 0;
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ Kho thành phố chưa đủ tài nguyên để khởi công [${blueprint.name}] (Cần ${needWood} Gỗ, ${needStone} Đá).`
      );
      return null;
    }

    // 4. Create building inside state
    return this.worldState.batch(() => {
      const building: Building = {
        id: generateId('bld'),
        type: blueprint.type,
        name: blueprint.name,
        x: coords.x,
        y: coords.y,
        width: blueprint.width,
        height: blueprint.height,
        level: 1,
        status: 'constructing',
        progress: 0,
        requiredProgress: blueprint.requiredProgress,
        contributions: {},
      };

      this.worldState.buildings.set(building.id, building);
      this.worldState.pushEvent(
        'building_started',
        `🏗️ Dự án xây dựng [${building.name}] vừa được khởi công tại (${coords.x}, ${coords.y})! Gõ XÂY để góp sức!`
      );
      this.worldState.notify();
      return building;
    });
  }

  // --- Community Voting System (P2.4) ---
  public getUnlockedBlueprints(): BuildingBlueprint[] {
    return this.worldState.blueprints.filter(
      (bp) => bp.unlockedAtLevel <= this.worldState.stats.level
    );
  }

  public openVotingSession(
    durationSeconds = 90,
    customTypes?: BuildingType[]
  ): VotingSession | null {
    if (this.worldState.activeVote && this.worldState.activeVote.status === 'open') {
      return this.worldState.activeVote;
    }

    const builtTypes = new Set(
      Array.from(this.worldState.buildings.values()).map((b) => b.type)
    );
    const unlocked = this.getUnlockedBlueprints();

    let candidates: BuildingBlueprint[] = [];
    if (customTypes && customTypes.length > 0) {
      candidates = unlocked.filter((b) => customTypes.includes(b.type));
    } else {
      // Prioritize unlocked buildings not yet built, then allow additional houses/barns
      const unbuiltUnlocked = unlocked.filter((b) => !builtTypes.has(b.type));
      candidates = unbuiltUnlocked.length >= 2 ? unbuiltUnlocked.slice(0, 3) : unlocked.slice(0, 3);
    }

    if (candidates.length === 0) {
      return null;
    }

    const now = Date.now();
    const options: VotingOption[] = candidates.slice(0, 3).map((bp, idx) => ({
      index: idx + 1,
      type: bp.type,
      name: bp.name,
      description: bp.description,
      cost: { ...bp.cost },
      votes: 0,
    }));

    const session: VotingSession = {
      id: generateId('vote'),
      status: 'open',
      startedAt: now,
      endsAt: now + Math.max(10, durationSeconds) * 1000,
      options,
      voterChoices: {},
    };

    this.worldState.batch(() => {
      this.worldState.activeVote = session;
      const optionLabels = options.map((o) => `[${o.index}] ${o.name}`).join(' | ');
      this.worldState.pushEvent(
        'voting_update',
        `🗳️ Mở bình chọn dự án tiếp theo: ${optionLabels}. Gõ VOTE 1, VOTE 2... để bỏ phiếu!`
      );
      this.worldState.notify();
    });

    return session;
  }

  public castVote(
    userId: string,
    userName: string,
    optionIndex: number
  ): { success: boolean; message: string } {
    const session = this.worldState.activeVote;
    if (!session || session.status !== 'open') {
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ Hiện không có phiên biểu quyết công trình nào đang mở!`,
        userName
      );
      return { success: false, message: 'Hiện không có phiên bình chọn nào đang mở.' };
    }

    if (session.voterChoices[userId] !== undefined) {
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ [${userName}] đã bỏ phiếu trong phiên này rồi (Mỗi cư dân 1 phiếu)!`,
        userName
      );
      return { success: false, message: 'Mỗi người chỉ có một phiếu hợp lệ trong một phiên.' };
    }

    const option = session.options.find((o) => o.index === optionIndex);
    if (!option) {
      this.worldState.pushEvent(
        'command_rejected',
        `⚠️ Lựa chọn số ${optionIndex} không tồn tại. Hãy chọn từ 1 đến ${session.options.length}.`,
        userName
      );
      return { success: false, message: 'Lựa chọn không hợp lệ.' };
    }

    this.worldState.batch(() => {
      session.voterChoices[userId] = optionIndex;
      option.votes += 1;
      this.worldState.pushEvent(
        'voting_update',
        `🗳️ [${userName}] đã bình chọn cho dự án #${option.index}: [${option.name}] (Tổng: ${option.votes} phiếu)`,
        userName
      );
      this.worldState.notify();
    });

    return { success: true, message: `Đã bầu chọn cho ${option.name}` };
  }

  public closeVotingSession(autoStartWinner = true): VotingSession | null {
    const session = this.worldState.activeVote;
    if (!session) return null;

    return this.worldState.batch(() => {
      session.status = 'closed';

      // Determine winning option
      let winner: VotingOption = session.options[0];
      for (const opt of session.options) {
        if (opt.votes > winner.votes) {
          winner = opt;
        }
      }

      session.winnerType = winner.type;
      this.worldState.voteHistory.unshift({
        ...session,
        options: session.options.map((o) => ({ ...o })),
        voterChoices: { ...session.voterChoices },
      });
      if (this.worldState.voteHistory.length > 20) {
        this.worldState.voteHistory.pop();
      }
      this.worldState.activeVote = null;

      this.worldState.pushEvent(
        'voting_update',
        `🏆 Kết thúc bình chọn! Dự án chiến thắng: [${winner.name}] với ${winner.votes} phiếu bầu!`
      );

      if (autoStartWinner && !this.worldState.getActiveUnderConstruction()) {
        this.startNewProject(winner.type);
      }

      this.worldState.notify();
      return session;
    });
  }

  public update(_deltaTime: number): void {
    // Check if active voting session timer has expired
    if (
      this.worldState.activeVote &&
      this.worldState.activeVote.status === 'open' &&
      Date.now() >= this.worldState.activeVote.endsAt
    ) {
      this.closeVotingSession(true);
    }
  }
}
