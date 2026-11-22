export * from './adapter';

export type TileType = 'grass' | 'dirt' | 'water' | 'road' | 'plaza';

export interface WorldTile {
  x: number;
  y: number;
  type: TileType;
  elevation: number;
  walkable: boolean;
  variation: number; // for decorative tile variations
  discovered?: boolean; // Fog of war state
}

export type ResourceType = 'wood' | 'stone' | 'food' | 'gold';

export interface ResourceNode {
  id: string;
  type: 'tree' | 'rock' | 'water_spring' | 'berry_bush' | 'gold_vein';
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
  discovered?: boolean;
}

export type BuildingType =
  | 'town_hall'
  | 'storage_barn'
  | 'lumber_mill'
  | 'quarry_mason'
  | 'cozy_house'
  | 'watchtower'
  | 'bakery_farm'
  | 'market_hall';

export interface BuildingBlueprint {
  type: BuildingType;
  name: string;
  description: string;
  width: number;
  height: number;
  requiredProgress: number;
  cost: Partial<Record<ResourceType, number>>;
  storageBonus?: Partial<Record<ResourceType, number>>;
  gatherBonus?: Partial<Record<ResourceType, number>>;
  citizenCapBonus?: number;
  passiveFoodPerMin?: number;
  passiveGoldPerMin?: number;
  unlockedAtLevel: number;
  defaultX?: number;
  defaultY?: number;
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
  foodHarvested?: number;
  goldEarned?: number;
  buildingsContributed: number;
  explorationPoints: number;
  totalCommands: number;
}

export interface CitizenQueuedTask {
  type: 'harvest' | 'build' | 'explore';
  resourceType?: ResourceType;
  targetBuildingId?: string;
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
  queuedTask?: CitizenQueuedTask;
  carryCapacity: number;
  speed: number; // tiles per second
  actionTimer: number; // timer in seconds
  stats: CitizenStats;
  joinedAt?: number;
  lastActiveTime: number;
  isResting?: boolean;
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
  activeCitizensCap?: number;
  dayTime: number; // 0.0 - 1.0 (sun cycle)
  exploredPercentage: number;
}

export interface VotingOption {
  index: number;
  type: BuildingType;
  name: string;
  description: string;
  cost: Partial<Record<ResourceType, number>>;
  votes: number;
}

export interface VotingSession {
  id: string;
  status: 'open' | 'closed';
  startedAt: number;
  endsAt: number;
  options: VotingOption[];
  voterChoices: Record<string, number>; // userId -> option index (1-based)
  winnerType?: BuildingType;
}

export type CityEventType =
  | 'harvest_festival'
  | 'rain_storm'
  | 'builders_day'
  | 'treasure_hunt'
  | 'resource_boom';

export interface CityActiveEvent {
  id: string;
  type: CityEventType;
  name: string;
  description: string;
  startedAt: number;
  endsAt: number;
  modifiers: {
    speedMultiplier: number;
    harvestMultiplier: number;
    buildMultiplier: number;
  };
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
  | 'voting_update'
  | 'city_event'
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
  | 'FOOD'
  | 'BUILD'
  | 'EXPLORE'
  | 'VOTE'
  | 'TRADE'
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
