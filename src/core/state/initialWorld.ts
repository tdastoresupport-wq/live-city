import { WorldTile, ResourceNode, Building, CityResources, CityStats, BuildingBlueprint } from '../types';

export const MAP_WIDTH = 22;
export const MAP_HEIGHT = 22;

export const INITIAL_BLUEPRINTS: BuildingBlueprint[] = [
  {
    type: 'watchtower',
    name: 'Tháp Canh Hoàng Hôn',
    description: 'Tăng tầm nhìn khám phá và mở rộng lãnh thổ thành phố.',
    width: 2,
    height: 2,
    requiredProgress: 60,
    cost: { wood: 50, stone: 30 },
    unlockedAtLevel: 1,
  },
  {
    type: 'cozy_house',
    name: 'Nhà Gỗ Ấm Cúng',
    description: 'Thu hút thêm cư dân và tăng tốc độ di chuyển.',
    width: 2,
    height: 2,
    requiredProgress: 80,
    cost: { wood: 60, stone: 20 },
    unlockedAtLevel: 1,
  },
  {
    type: 'storage_barn',
    name: 'Kho Thóc Lớn',
    description: 'Tăng sức chứa tài nguyên của thành phố lên 500.',
    width: 3,
    height: 2,
    requiredProgress: 120,
    cost: { wood: 100, stone: 80 },
    storageBonus: { wood: 500, stone: 500 },
    unlockedAtLevel: 2,
  },
  {
    type: 'lumber_mill',
    name: 'Xưởng Cưa Rừng Rậm',
    description: 'Tăng 25% sản lượng thu hoạch gỗ của tất cả cư dân.',
    width: 2,
    height: 3,
    requiredProgress: 150,
    cost: { wood: 120, stone: 60 },
    unlockedAtLevel: 2,
  },
  {
    type: 'quarry_mason',
    name: 'Khu Đẽo Đá Hoàng Gia',
    description: 'Tăng 25% sản lượng khai thác đá của tất cả cư dân.',
    width: 3,
    height: 3,
    requiredProgress: 200,
    cost: { wood: 150, stone: 150 },
    unlockedAtLevel: 3,
  },
];

export function createInitialTileMap(): Map<string, WorldTile> {
  const map = new Map<string, WorldTile>();

  for (let x = 0; x < MAP_WIDTH; x++) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      let type: WorldTile['type'] = 'grass';
      let walkable = true;
      let elevation = 0;

      // River meandering on the west-south edge
      const riverDist = Math.abs(x - 3 + Math.sin(y * 0.4) * 1.5);
      if (riverDist < 1.2) {
        type = 'water';
        walkable = false;
        elevation = -0.5;
      } else if (riverDist < 1.8) {
        type = 'dirt'; // Riverbank
      }

      // Main Road cutting through center (x: 10, 11) and (y: 10, 11)
      if ((x === 10 || x === 11) && y >= 4 && y <= 18) {
        type = 'road';
      }
      if ((y === 10 || y === 11) && x >= 4 && x <= 18) {
        type = 'road';
      }

      // Central Plaza (around x: 9..12, y: 9..12)
      if (x >= 9 && x <= 12 && y >= 9 && y <= 12) {
        type = 'plaza';
      }

      const key = `${x},${y}`;
      map.set(key, {
        x,
        y,
        type,
        elevation,
        walkable,
        variation: (x * 7 + y * 13) % 4,
      });
    }
  }

  return map;
}

export function createInitialResourceNodes(): ResourceNode[] {
  return [
    // Forest Grove (North & North-East)
    {
      id: 'tree_1',
      type: 'tree',
      name: 'Cây Sồi Cổ Thụ',
      resourceType: 'wood',
      x: 15,
      y: 5,
      currentAmount: 250,
      maxAmount: 250,
      harvestSpeed: 2.5,
      regenerationRate: 5,
      depleted: false,
      depletedTimer: 0,
    },
    {
      id: 'tree_2',
      type: 'tree',
      name: 'Rừng Thông Xanh',
      resourceType: 'wood',
      x: 17,
      y: 6,
      currentAmount: 200,
      maxAmount: 200,
      harvestSpeed: 2.2,
      regenerationRate: 5,
      depleted: false,
      depletedTimer: 0,
    },
    {
      id: 'tree_3',
      type: 'tree',
      name: 'Bụi Cây Rừng Phía Tây',
      resourceType: 'wood',
      x: 6,
      y: 5,
      currentAmount: 180,
      maxAmount: 180,
      harvestSpeed: 2.0,
      regenerationRate: 5,
      depleted: false,
      depletedTimer: 0,
    },
    {
      id: 'tree_4',
      type: 'tree',
      name: 'Rừng Phong Đỏ',
      resourceType: 'wood',
      x: 16,
      y: 15,
      currentAmount: 220,
      maxAmount: 220,
      harvestSpeed: 2.3,
      regenerationRate: 5,
      depleted: false,
      depletedTimer: 0,
    },
    {
      id: 'tree_5',
      type: 'tree',
      name: 'Cây Gỗ Cổ Phía Nam',
      resourceType: 'wood',
      x: 6,
      y: 16,
      currentAmount: 150,
      maxAmount: 150,
      harvestSpeed: 2.0,
      regenerationRate: 5,
      depleted: false,
      depletedTimer: 0,
    },

    // Quarry & Stone Formations (South-East & North-West)
    {
      id: 'rock_1',
      type: 'rock',
      name: 'Mỏ Đá Hoa Cương',
      resourceType: 'stone',
      x: 17,
      y: 11,
      currentAmount: 300,
      maxAmount: 300,
      harvestSpeed: 3.0,
      regenerationRate: 4,
      depleted: false,
      depletedTimer: 0,
    },
    {
      id: 'rock_2',
      type: 'rock',
      name: 'Tảng Đá Pha Lê',
      resourceType: 'stone',
      x: 18,
      y: 13,
      currentAmount: 250,
      maxAmount: 250,
      harvestSpeed: 3.2,
      regenerationRate: 4,
      depleted: false,
      depletedTimer: 0,
    },
    {
      id: 'rock_3',
      type: 'rock',
      name: 'Mỏ Đá Thạch Anh',
      resourceType: 'stone',
      x: 5,
      y: 11,
      currentAmount: 200,
      maxAmount: 200,
      harvestSpeed: 2.8,
      regenerationRate: 4,
      depleted: false,
      depletedTimer: 0,
    },
  ];
}

export function createInitialBuildings(): Building[] {
  return [
    // Town Hall (Central landmark)
    {
      id: 'bld_town_hall',
      type: 'town_hall',
      name: 'Tòa Thị Chính Live City',
      x: 9,
      y: 9,
      width: 3,
      height: 3,
      level: 1,
      status: 'active',
      progress: 500,
      requiredProgress: 500,
      contributions: {},
    },
    // Storage Barn
    {
      id: 'bld_storage_1',
      type: 'storage_barn',
      name: 'Kho Dự Trữ Trung Tâm',
      x: 13,
      y: 8,
      width: 2,
      height: 2,
      level: 1,
      status: 'active',
      progress: 100,
      requiredProgress: 100,
      contributions: {},
    },
    // Initial Under-Construction Project: Tháp Canh Hoàng Hôn
    {
      id: 'bld_project_watchtower',
      type: 'watchtower',
      name: 'Tháp Canh Hoàng Hôn (Dự án)',
      x: 7,
      y: 7,
      width: 2,
      height: 2,
      level: 1,
      status: 'constructing',
      progress: 15,
      requiredProgress: 60,
      contributions: { system: 15 },
    },
  ];
}

export function createInitialResources(): CityResources {
  return {
    wood: 120,
    stone: 80,
    food: 60,
    gold: 25,
  };
}

export function createInitialStats(): CityStats {
  return {
    name: 'Live City Sanctuary',
    level: 1,
    exp: 45,
    expToNextLevel: 100,
    citizensCount: 0,
    dayTime: 0.35, // Late morning / cozy sunny vibe
    exploredPercentage: 42,
  };
}
