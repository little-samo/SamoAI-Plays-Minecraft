import { getPosition } from '../library/world.js';

export class CookingTaskInitiator {
  constructor(data, agent) {
    this.agent = agent;
    this.data = data;
  }

  async init() {
    let bot = this.agent.bot;

    //// Setting up the cooking world using minecraft cheats ////

    // Only run the setup if the agent is the first one

    if (this.agent.count_id === 0) {
      // Clear and prepare the base area
      await bot.chat(`/fill ~ ~-1 ~ ~50 ~-3 ~50 grass_block`);
      await bot.chat(`/fill ~ ~-1 ~ ~-50 ~-3 ~50 grass_block`);
      await bot.chat(`/fill ~ ~-1 ~ ~-50 ~-3 ~-50 grass_block`);
      await bot.chat(`/fill ~ ~-1 ~ ~50 ~-3 ~-50 grass_block`);
      await bot.chat(`/fill ~ ~ ~ ~50 ~10 ~50 air`);
      await bot.chat(`/fill ~ ~ ~ ~-50 ~10 ~50 air`);
      await bot.chat(`/fill ~ ~ ~ ~-50 ~10 ~-50 air`);
      await bot.chat(`/fill ~ ~ ~ ~50 ~10 ~-50 air`);

      const position = getPosition(bot);
      const botX = Math.floor(position.x);
      const botZ = Math.floor(position.z);

      // Region management system
      const isOverlapping = (
        newXMin,
        newXMax,
        newZMin,
        newZMax,
        occupiedRegions
      ) => {
        for (const region of occupiedRegions) {
          if (
            newXMin < region.xMax &&
            newXMax > region.xMin &&
            newZMin < region.zMax &&
            newZMax > region.zMin
          ) {
            return true;
          }
        }
        return false;
      };

      const findValidPosition = (width, depth, occupiedRegions) => {
        const maxXStart = position.x + 25 - width; // Constrain to 50x50 area
        const minXStart = position.x - 25;
        const maxZStart = position.z + 25 - depth;
        const minZStart = position.z - 25;

        let attempts = 0;
        while (attempts < 1000) {
          const xStart = Math.floor(
            minXStart + Math.random() * (maxXStart - minXStart + 1)
          );
          const zStart = Math.floor(
            minZStart + Math.random() * (maxZStart - minZStart + 1)
          );
          const xMin = xStart;
          const xMax = xStart + width - 1;
          const zMin = zStart;
          const zMax = zStart + depth - 1;

          if (!isOverlapping(xMin, xMax, zMin, zMax, occupiedRegions)) {
            return { xStart, zStart };
          }
          attempts++;
        }
        throw new Error(
          'Failed to find non-overlapping position after 1000 attempts'
        );
      };

      // Define all regions with their sizes
      const regionsToPlace = [
        { type: 'wheat', width: 6, depth: 6 },
        { type: 'beetroots', width: 4, depth: 5 },
        { type: 'mushrooms', width: 4, depth: 5 },
        { type: 'potatoes', width: 4, depth: 5 },
        { type: 'carrots', width: 4, depth: 5 },
        { type: 'sugar_cane', width: 3, depth: 3 },
        { type: 'sugar_cane', width: 3, depth: 3 },
        { type: 'pumpkins', width: 10, depth: 1 },
        { type: 'house', width: 11, depth: 11 },
      ];

      // Expand the regions of each type to make sure they don't overlap

      for (let i = 0; i < regionsToPlace.length; i++) {
        const region = regionsToPlace[i];
        const { width, depth } = region;
        regionsToPlace[i].width = width + 4;
        regionsToPlace[i].depth = depth + 4;
      }

      const occupiedRegions = [
        {
          xMin: botX - 1,
          xMax: botX + 1,
          zMin: botZ - 1,
          zMax: botZ + 1,
        },
      ];
      const regionPositions = {};

      // Calculate positions for all regions
      for (const region of regionsToPlace) {
        const { xStart, zStart } = findValidPosition(
          region.width,
          region.depth,
          occupiedRegions
        );

        occupiedRegions.push({
          xMin: xStart,
          xMax: xStart + region.width - 1,
          zMin: zStart,
          zMax: zStart + region.depth - 1,
        });

        if (region.type === 'sugar_cane') {
          if (!regionPositions.sugar_cane) regionPositions.sugar_cane = [];
          regionPositions.sugar_cane.push({ xStart, zStart });
        } else {
          regionPositions[region.type] = { xStart, zStart };
        }
      }

      // Planting functions with dynamic positions
      const plantWheat = async (xStart, zStart) => {
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 6; j++) {
            const x = xStart + i;
            const z = zStart + j;
            await bot.chat(`/setblock ${x} ${position.y - 1} ${z} farmland`);
            await bot.chat(`/setblock ${x} ${position.y} ${z} wheat[age=7]`);
          }
        }
      };

      const plantBeetroots = async (xStart, zStart) => {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 5; j++) {
            const x = xStart + i;
            const z = zStart + j;
            await bot.chat(`/setblock ${x} ${position.y - 1} ${z} farmland`);
            await bot.chat(
              `/setblock ${x} ${position.y} ${z} beetroots[age=3]`
            );
          }
        }
      };

      const plantMushrooms = async (xStart, zStart) => {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 5; j++) {
            const x = xStart + i;
            const z = zStart + j;
            await bot.chat(`/setblock ${x} ${position.y - 1} ${z} mycelium`);
            const mushroomType =
              (i + j) % 2 === 0 ? 'red_mushroom' : 'brown_mushroom';
            await bot.chat(`/setblock ${x} ${position.y} ${z} ${mushroomType}`);
          }
        }
      };

      const plantPotatoes = async (xStart, zStart) => {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 5; j++) {
            const x = xStart + i;
            const z = zStart + j;
            await bot.chat(`/setblock ${x} ${position.y - 1} ${z} farmland`);
            await bot.chat(`/setblock ${x} ${position.y} ${z} potatoes[age=7]`);
          }
        }
      };

      const plantCarrots = async (xStart, zStart) => {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 5; j++) {
            const x = xStart + i;
            const z = zStart + j;
            await bot.chat(`/setblock ${x} ${position.y - 1} ${z} farmland`);
            await bot.chat(`/setblock ${x} ${position.y} ${z} carrots[age=7]`);
          }
        }
      };

      const plantSugarCane = async (patches) => {
        for (const patch of patches) {
          const xCenter = patch.xStart + 1;
          const zCenter = patch.zStart + 1;
          await bot.chat(
            `/setblock ${xCenter} ${position.y - 1} ${zCenter} water`
          );
          const offsets = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          for (const [dx, dz] of offsets) {
            await bot.chat(
              `/setblock ${xCenter + dx} ${position.y} ${zCenter + dz} sugar_cane[age=15]`
            );
          }
        }
      };

      const plantPumpkins = async (xStart, zStart) => {
        for (let i = 0; i < 10; i++) {
          const x = xStart + i;
          const z = zStart;
          await bot.chat(`/setblock ${x} ${position.y} ${z} pumpkin`);
        }
      };

      // Execute all planting
      await plantWheat(
        regionPositions.wheat.xStart,
        regionPositions.wheat.zStart
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await plantBeetroots(
        regionPositions.beetroots.xStart,
        regionPositions.beetroots.zStart
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await plantMushrooms(
        regionPositions.mushrooms.xStart,
        regionPositions.mushrooms.zStart
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await plantPotatoes(
        regionPositions.potatoes.xStart,
        regionPositions.potatoes.zStart
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await plantCarrots(
        regionPositions.carrots.xStart,
        regionPositions.carrots.zStart
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await plantSugarCane(regionPositions.sugar_cane);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await plantPumpkins(
        regionPositions.pumpkins.xStart,
        regionPositions.pumpkins.zStart
      );
      await new Promise((resolve) => setTimeout(resolve, 300));

      // House construction
      const buildHouse = async (xStart, zStart) => {
        const startX = xStart;
        const startY = position.y;
        const startZ = zStart;
        const width = 10;
        const depth = 10;
        const height = 5;

        // Foundation and walls
        for (let x = startX; x <= startX + depth; x++) {
          for (let y = startY; y <= startY + height; y++) {
            for (let z = startZ; z <= startZ + width; z++) {
              if (y === startY) {
                if (
                  !(
                    x === startX + depth - 1 &&
                    z === startZ + Math.floor(width / 2)
                  )
                ) {
                  await bot.chat(`/setblock ${x} ${y} ${z} stone_bricks`);
                }
                continue;
              }

              if (
                x === startX ||
                x === startX + depth ||
                z === startZ ||
                z === startZ + width ||
                y === startY + height
              ) {
                const isWindow =
                  ((x === startX || x === startX + depth) &&
                    (z === startZ + 3 || z === startZ + width - 3) &&
                    (y === startY + 2 || y === startY + 3)) ||
                  ((z === startZ || z === startZ + width) &&
                    (x === startX + 3 || x === startX + depth - 3) &&
                    (y === startY + 2 || y === startY + 3));

                const isDoor =
                  x === startX + depth &&
                  z === startZ + Math.floor(width / 2) &&
                  (y === startY + 1 || y === startY + 2);

                if (!isWindow && !isDoor) {
                  await bot.chat(`/setblock ${x} ${y} ${z} stone_bricks`);
                }
              }
            }
          }
        }

        // Entrance features
        const doorZ = startZ + Math.floor(width / 2);
        await bot.chat(
          `/setblock ${startX + depth - 1} ${startY} ${doorZ} stone_brick_stairs[facing=west]`
        );
        await bot.chat(`/setblock ${startX + depth} ${startY} ${doorZ} air`);
        // await bot.chat(`/setblock ${startX + depth - 1} ${startY} ${doorZ - 1} stone_bricks`);
        // await bot.chat(`/setblock ${startX + depth - 1} ${startY} ${doorZ + 1} stone_bricks`);
        // await bot.chat(`/setblock ${startX + depth} ${startY} ${doorZ} oak_door[half=lower,hinge=left,facing=west,powered=false]`);
        // await bot.chat(`/setblock ${startX + depth} ${startY + 1} ${doorZ} oak_door[half=upper,hinge=left,facing=west,powered=false]`);

        // Roof construction
        for (let i = 0; i < 3; i++) {
          for (let x = startX + i; x <= startX + depth - i; x++) {
            for (let z = startZ + i; z <= startZ + width - i; z++) {
              if (
                x === startX + i ||
                x === startX + depth - i ||
                z === startZ + i ||
                z === startZ + width - i
              ) {
                await bot.chat(
                  `/setblock ${x} ${startY + height + i} ${z} cobblestone`
                );
              }
            }
          }
        }

        // Interior items
        await bot.chat(
          `/setblock ${startX + 4} ${startY + 1} ${startZ + 3} crafting_table`
        );
        await bot.chat(
          `/setblock ${startX + 4} ${startY + 1} ${startZ + 5} furnace`
        );
        // Add fuel to the furnace
        await bot.chat(
          `/data merge block ${startX + 4} ${startY + 1} ${startZ + 5} {Items:[{Slot:1b,id:"minecraft:coal",Count:64b}]}`
        );
        await bot.chat(
          `/setblock ${startX + 4} ${startY + 1} ${startZ + 7} smoker`
        );
        // Add fuel to the smoker
        await bot.chat(
          `/data merge block ${startX + 4} ${startY + 1} ${startZ + 7} {Items:[{Slot:1b,id:"minecraft:coal",Count:64b}]}`
        );
        await bot.chat(
          `/setblock ${startX + depth - 3} ${startY + 1} ${startZ + 2} bed`
        );
      };

      await buildHouse(
        regionPositions.house.xStart,
        regionPositions.house.zStart
      );
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Add a chest with cooking items near the bot
      const addChestWithItems = async () => {
        // Find a valid position near the bot (within 10 blocks)
        const findChestPosition = () => {
          const maxAttempts = 100;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const x = botX + Math.floor(Math.random() * 10 - 5); // Within ±5 blocks X
            const z = botZ + Math.floor(Math.random() * 10 - 5); // Within ±5 blocks Z
            const y = position.y;

            // Check if the position is not overlapping with existing structures
            if (!isOverlapping(x, x, z, z, occupiedRegions)) {
              return { x, y, z };
            }
          }
          throw new Error('Failed to find valid chest position');
        };

        const { x, y, z } = findChestPosition();

        // Place the chest
        await bot.chat(`/setblock ${x} ${y} ${z} chest`);

        const cookingItems = [
          ['minecraft:milk_bucket', 1], // Non-stackable
          ['minecraft:egg', 16], // Stacks to 16
          ['minecraft:dandelion', 64], // Stacks to 64
          ['minecraft:sugar', 64],
          ['minecraft:cocoa_beans', 64],
          ['minecraft:apple', 64],
          ['minecraft:milk_bucket', 1],
          ['minecraft:milk_bucket', 1],
          ['minecraft:salmon', 64],
          ['minecraft:cod', 64],
          ['minecraft:kelp', 64],
          ['minecraft:dried_kelp', 64],
          ['minecraft:sweet_berries', 64],
          ['minecraft:honey_bottle', 1], // Non-stackable
          ['minecraft:glow_berries', 64],
          ['minecraft:bowl', 64],
          ['minecraft:milk_bucket', 1],
          ['minecraft:milk_bucket', 1],
          ['minecraft:milk_bucket', 1],
          ['minecraft:milk_bucket', 1],
          ['minecraft:cooked_salmon', 64],
          ['minecraft:cooked_cod', 64],
          ['minecraft:gold_ingot', 64],
          ['minecraft:oak_planks', 64],
          ['minecraft:iron_ingot', 64],
          ['minecraft:milk_bucket', 1],
          ['minecraft:milk_bucket', 1],
        ];

        // Fill the chest with random cooking items
        for (let slot = 0; slot < cookingItems.length; slot++) {
          // Chest has 27 slots
          const randomItem = cookingItems[slot];
          await bot.chat(
            `/item replace block ${x} ${y} ${z} container.${slot} with ${randomItem[0]} ${randomItem[1]}`
          );
        }

        // Mark the chest area as occupied
        occupiedRegions.push({
          xMin: x,
          xMax: x,
          zMin: z,
          zMax: z,
        });
      };

      await addChestWithItems();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Animal management
      await bot.chat('/kill @e[type=item,distance=..200]');
      await bot.chat('/kill @e[type=chicken,distance=..200]');
      await bot.chat('/kill @e[type=cow,distance=..200]');
      await bot.chat('/kill @e[type=llama,distance=..200]');
      await bot.chat('/kill @e[type=mooshroom,distance=..200]');
      await bot.chat('/kill @e[type=pig,distance=..200]');
      await bot.chat('/kill @e[type=rabbit,distance=..200]');
      await bot.chat('/kill @e[type=sheep,distance=..200]');

      await bot.chat(`/kill @e[type=item,distance=..200]`);

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Summon new animals
      const summonAnimals = async () => {
        const animals = [
          'chicken',
          'cow',
          'llama',
          'mooshroom',
          'pig',
          'rabbit',
          'sheep',
        ];
        for (const animal of animals) {
          for (let i = 0; i < 8; i++) {
            const x = position.x - 25 + Math.random() * 50;
            const z = position.z - 25 + Math.random() * 50;
            await bot.chat(
              `/summon ${animal} ${Math.floor(x)} ${position.y} ${Math.floor(z)}`
            );
          }
        }
      };
      await summonAnimals();
    }
  }
}
