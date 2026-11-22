export * from './adapter';

export type TileType = 'grass' | 'dirt' | 'water' | 'road' | 'plaza';

export interface WorldTile {
  x: number;
  y: number;
  type: TileType;
  elevation: number;
  walkable: boolean;
  variation: number; // for decorative tile variations
}

export type ResourceType = 'wood' | 'stone' | 'food' | 'gold';

export interface ResourceNode {
  id: string;
  type: 'tree' | 'rock' | 'water_spring';
  resourceType: ResourceType;
  x: number;
  y: number;
  currentAmount: number;
  maxAmount: number;
  harvestSpeed: number; // seconds per harvest cycle
  regenerationRate: number; // amount regenerated per minute
  depleted: boolean;
  depletedTimer: number; // countdown until regeneration
  name: string;
}

export type BuildingType =
  | 'town_hall'
  | 'storage_barn'
  | 'lumber_mill'
  | 'quarry_mason'
  | 'cozy_house'
  | 'watchtower';

export interface BuildingBlueprint {
  type: BuildingType;
  name: string;
  description: string;
  width: number;
  height: number;
  requiredProgress: number;
  cost: Partial<Record<ResourceType, number>>;
  storageBonus?: Partial<Record<ResourceType, number>>;
  unlockedAtLevel: number;
}

export interface Building {
  id: string;
  type: BuildingType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  status: 'planning' | 'constructing' | 'active';
  progress: number;
  requiredProgress: number;
  contributions: Record<string, number>; // userId -> contributed points
  completedAt?: number;
}

export type CitizenState =
  | 'idle'
  | 'moving_to_harvest'
  | 'harvesting'
  | 'carrying_resource'
  | 'moving_to_build'
  | 'building'
  | 'exploring';

export interface CitizenStats {
  woodHarvested: number;
  stoneHarvested: number;
  buildingsContributed: number;
  explorationPoints: number;
  totalCommands: number;
}

export interface Citizen {
  id: string;
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  path: Array<{ x: number; y: number }>;
  state: CitizenState;
  targetNodeId?: string;
  targetBuildingId?: string;
  carriedResource?: {
    type: ResourceType;
    amount: number;
  };
  carryCapacity: number;
  speed: number; // tiles per second
  actionTimer: number; // timer in seconds
  stats: CitizenStats;
  lastActiveTime: number;
  floatingText?: {
    text: string;
    color: string;
    timer: number;
  };
}

export interface CityResources {
  wood: number;
  stone: number;
  food: number;
  gold: number;
}

export interface CityStats {
  name: string;
  level: number;
  exp: number;
  expToNextLevel: number;
  citizensCount: number;
  dayTime: number; // 0.0 - 1.0 (sun cycle)
  exploredPercentage: number;
}

export type GameEventType =
  | 'citizen_joined'
  | 'harvest_started'
  | 'resource_harvested'
  | 'resource_deposited'
  | 'building_started'
  | 'building_progress'
  | 'building_completed'
  | 'city_leveled_up'
  | 'exploration_reward'
  | 'command_rejected'
  | 'system_info';

export interface GameEvent {
  id: string;
  timestamp: number;
  type: GameEventType;
  message: string;
  author?: string;
  data?: Record<string, unknown>;
}

export type CommandAction =
  | 'JOIN'
  | 'WOOD'
  | 'STONE'
  | 'BUILD'
  | 'EXPLORE'
  | 'HELP'
  | 'STATUS';

export interface ParsedCommand {
  raw: string;
  action: CommandAction;
  params: string[];
  userId: string;
  userName: string;
  timestamp: number;
  eventId: string;
}

export interface CommandValidationResult {
  valid: boolean;
  error?: string;
  sanitizedCommand?: ParsedCommand;
}
