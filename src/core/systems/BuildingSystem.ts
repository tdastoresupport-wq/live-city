import { WorldState } from '../state/WorldState';
import { Building, BuildingType } from '../types';
import { generateId } from '../utils/id';

export class BuildingSystem {
  private worldState: WorldState;

  constructor(worldState: WorldState) {
    this.worldState = worldState;
  }

  /**
   * Start a new building construction project.
   */
  public startNewProject(type: BuildingType, x: number, y: number): Building | null {
    const existing = this.worldState.getActiveUnderConstruction();
    if (existing) {
      return null; // Only one construction at a time for focus
    }

    const blueprint = this.worldState.blueprints.find((b) => b.type === type);
    if (!blueprint) return null;

    // Verify costs
    if (blueprint.cost.wood && this.worldState.resources.wood < blueprint.cost.wood) {
      return null;
    }
    if (blueprint.cost.stone && this.worldState.resources.stone < blueprint.cost.stone) {
      return null;
    }

    // Consume resources
    if (blueprint.cost.wood) this.worldState.consumeResource('wood', blueprint.cost.wood);
    if (blueprint.cost.stone) this.worldState.consumeResource('stone', blueprint.cost.stone);

    const building: Building = {
      id: generateId('bld'),
      type: blueprint.type,
      name: blueprint.name,
      x,
      y,
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
      `🏗️ Dự án xây dựng [${building.name}] vừa được khởi công! Gõ XÂY để góp sức!`
    );
    this.worldState.notify();

    return building;
  }

  public update(_deltaTime: number): void {
    // If no active construction project, check if we can propose or auto-activate next blueprint
    const active = this.worldState.getActiveUnderConstruction();
    if (!active) {
      // Find blueprints not yet built or built at low tier
      const builtTypes = new Set(Array.from(this.worldState.buildings.values()).map((b) => b.type));
      const nextBlueprint = this.worldState.blueprints.find((b) => !builtTypes.has(b.type));

      if (nextBlueprint) {
        // Find placement coords
        const placementCoords: Record<string, { x: number; y: number }> = {
          cozy_house: { x: 13, y: 12 },
          storage_barn: { x: 14, y: 8 },
          lumber_mill: { x: 14, y: 4 },
          quarry_mason: { x: 15, y: 11 },
          watchtower: { x: 6, y: 14 },
        };
        const coords = placementCoords[nextBlueprint.type] || { x: 8, y: 14 };

        // Check if city can afford starting blueprint
        const canAfford =
          (!nextBlueprint.cost.wood || this.worldState.resources.wood >= nextBlueprint.cost.wood) &&
          (!nextBlueprint.cost.stone || this.worldState.resources.stone >= nextBlueprint.cost.stone);

        if (canAfford) {
          this.startNewProject(nextBlueprint.type, coords.x, coords.y);
        }
      }
    }
  }
}
