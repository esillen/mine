import { clamp, intersects } from "./utils.js";
import { saveBuildState, loadBuildState } from "./save-system.js";
import { createUIController } from "./ui-system.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const timeToggleButton = document.getElementById("time-toggle");
const heartsContainer = document.getElementById("hearts");
const phaseChip = document.getElementById("phase-chip");
const materialsBar = document.getElementById("materials-bar");
const infoToggleButton = document.getElementById("info-toggle");
const infoBox = document.getElementById("info-box");

const world = {
  gravity: 0.62,
  width: 5200,
  baseGround: 0,
  dayLengthFrames: 4200,
};

const MAX_PLAYER_HP = 8;
const PERF = {
  terrainStep: 8,
  grassStep: 36,
  starCount: 22,
  maxTerrainPits: 120,
  maxGroundParticles: 120,
  maxGroundCuts: 50,
  birdCount: 10,
};
const PIT_CELL_SIZE = 140;

const player = {
  x: 120,
  y: 0,
  w: 40,
  h: 50,
  vx: 0,
  vy: 0,
  speed: 4.2,
  jumpForce: 13.5,
  onGround: false,
  hp: MAX_PLAYER_HP,
  facing: 1,
  attackTimer: 0,
  attackDirection: "forward",
  hitCooldown: 0,
};

const dog = {
  x: 80,
  y: 0,
  w: 30,
  h: 22,
  vx: 0,
  speed: 2.6,
  facing: 1,
  bouncePhase: 0,
  targetSide: 1,
};

const keys = {
  left: false,
  right: false,
  up: false,
  down: false,
};

const gamepadState = {
  jumpPressed: false,
  attackPressed: false,
  buildPressed: false,
  swapNextPressed: false,
  swapPrevPressed: false,
  timePressed: false,
  dayNightPressed: false,
};

const enemies = [];
const birds = [];
const trees = [];
const droppedApples = [];
const droppedCoins = [];
const buriedSites = [];
const buriedTreasures = [];
const groundCuts = [];
const terrainPits = [];
const groundParticles = [];
const pitCellIndex = new Map();
const removedGroundBlocks = new Set();
const placedBlocks = [];
const placedBlockCells = new Set();
const terrainSurfaceRows = [];
const BLOCK_SIZE = 40;
let defeated = 0;
let wood = 50;
let dirt = 0;
let emerald = 999;
let nyx = 999;
let amethyst = 999;
let gold = 0;
let selectedMaterial = "wood";
let gameOver = false;
let frameCount = 0;
let spawnedThisNight = false;
let hardReloadInProgress = false;
let autoDayNightEnabled = false;
const MATERIAL_SLOT_CONFIG = [
  { key: "wood", label: "Trä", future: false },
  { key: "dirt", label: "Jord", future: false },
  { key: "emerald", label: "Smaragd", future: false },
  { key: "nyx", label: "Nyx", future: false },
  { key: "amethyst", label: "Ametist", future: false },
  { key: "gold", label: "Guld", future: true },
];
const BUILD_MATERIALS = MATERIAL_SLOT_CONFIG.filter((slot) => !slot.future).map((slot) => slot.key);
const ui = createUIController({
  heartsContainer,
  phaseChip,
  materialsBar,
  timeToggleButton,
  infoToggleButton,
  infoBox,
  maxPlayerHp: MAX_PLAYER_HP,
  materialSlotConfig: MATERIAL_SLOT_CONFIG,
});

function rebuildPitCellIndex() {
  pitCellIndex.clear();
}

function worldToTerrainCol(worldX) {
  return Math.floor(clamp(worldX, 0, world.width) / BLOCK_SIZE);
}

function worldToTerrainRow(worldY) {
  return Math.floor(worldY / BLOCK_SIZE);
}

function terrainKey(col, row) {
  return `${col},${row}`;
}

function getTerrainDigDepth(_worldX) {
  return 0;
}

function groundAt(worldX) {
  const x = clamp(worldX, 0, world.width);
  const hills = Math.sin(x * 0.0048) * 70;
  const mountains = Math.sin(x * 0.0019 + 0.6) * 110;
  const valleys = Math.sin(x * 0.009 + 1.3) * 26;
  const dugDepth = getTerrainDigDepth(x);
  const height = world.baseGround + hills + mountains + valleys + dugDepth;
  return Math.floor(height / BLOCK_SIZE) * BLOCK_SIZE;
}

function initializeTerrainSurfaceRows() {
  terrainSurfaceRows.length = 0;
  const maxCol = Math.floor(world.width / BLOCK_SIZE) + 2;
  for (let col = 0; col <= maxCol; col += 1) {
    const centerX = col * BLOCK_SIZE + BLOCK_SIZE * 0.5;
    terrainSurfaceRows[col] = worldToTerrainRow(groundAt(centerX));
  }
}

function surfaceRowForCol(col) {
  if (col < 0) return -99999;
  if (col >= terrainSurfaceRows.length) {
    const clamped = terrainSurfaceRows.length - 1;
    return terrainSurfaceRows[Math.max(0, clamped)] ?? 0;
  }
  return terrainSurfaceRows[col];
}

function isTerrainSolidCell(col, row) {
  if (col < 0 || col > Math.floor(world.width / BLOCK_SIZE)) return false;
  if (row < 0) return false;
  if (row < surfaceRowForCol(col)) return false;
  return !removedGroundBlocks.has(terrainKey(col, row));
}

function isPlacedSolidCell(col, row) {
  return placedBlockCells.has(terrainKey(col, row));
}

function isSolidCell(col, row) {
  return isTerrainSolidCell(col, row) || isPlacedSolidCell(col, row);
}

function rebuildPlacedBlockCells() {
  placedBlockCells.clear();
  placedBlocks.forEach((block) => {
    const col = worldToTerrainCol(block.x);
    const row = worldToTerrainRow(block.y);
    placedBlockCells.add(terrainKey(col, row));
  });
}

function getDayPhase() {
  return (frameCount % world.dayLengthFrames) / world.dayLengthFrames;
}

function isNight() {
  const phase = getDayPhase();
  return phase >= 0.72;
}

function updateTimeToggleButton() {
  ui.updateTimeToggle(isNight());
}

function getSkyColor() {
  if (isNight()) return "#0f172a";
  return "#87c9ff";
}

function drawCelestialBodies() {
  const phase = getDayPhase();
  const horizonY = 190;

  if (!isNight()) {
    const dayEnd = 0.72;
    const dayProgress = clamp(phase / dayEnd, 0, 1);
    const sunX = 40 + dayProgress * (canvas.width - 80);
    const sunY = horizonY - Math.sin(dayProgress * Math.PI) * 130;
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 32, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const nightStart = 0.72;
  const nightProgress = clamp((phase - nightStart) / (1 - nightStart), 0, 1);
  const moonX = 40 + nightProgress * (canvas.width - 80);
  const moonY = horizonY - Math.sin(nightProgress * Math.PI) * 120;
  ctx.fillStyle = "#e5e7eb";
  ctx.beginPath();
  ctx.arc(moonX, moonY, 24, 0, Math.PI * 2);
  ctx.fill();
}

const camera = {
  x: 0,
  y: 0,
  smoothX: 0.08,
  smoothY: 0.1,
  minY: -180,
  maxY: 300,
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  world.baseGround = canvas.height - 95;
  camera.minY = -canvas.height * 0.35;
  camera.maxY = canvas.height * 0.65;
  initializeTerrainSurfaceRows();

  player.y = groundAt(player.x + player.w / 2) - player.h;
  dog.y = groundAt(dog.x + dog.w / 2) - dog.h;
  enemies.forEach((enemy) => {
    enemy.y = groundAt(enemy.x + enemy.w / 2) - enemy.h;
  });
  trees.forEach((tree) => {
    tree.y = groundAt(tree.x);
  });
  buriedTreasures.forEach((treasure) => {
    if (typeof treasure.depthOffset === "number") {
      treasure.y = groundAt(treasure.x) + treasure.depthOffset;
    }
  });
}

function updateCamera() {
  const targetX = player.x + player.w / 2 - canvas.width / 2;
  const targetY = player.y + player.h / 2 - canvas.height * 0.58;
  const clampedX = clamp(targetX, 0, world.width - canvas.width);
  const clampedY = clamp(targetY, camera.minY, camera.maxY);

  camera.x += (clampedX - camera.x) * camera.smoothX;
  camera.y += (clampedY - camera.y) * camera.smoothY;
}

function createEnemy(type, x, direction = 1) {
  if (type === "enderman") {
    return {
      type,
      x,
      w: 26,
      h: 66,
      vx: 1.7 * direction,
      hp: 4,
      maxHp: 4,
      damage: 2,
      alive: true,
    };
  }
  if (type === "skeleton") {
    return {
      type,
      x,
      w: 34,
      h: 44,
      vx: 1.95 * direction,
      hp: 2,
      maxHp: 2,
      damage: 1,
      alive: true,
    };
  }
  if (type === "slime") {
    return {
      type,
      x,
      w: 38,
      h: 28,
      vx: 1.45 * direction,
      hp: 3,
      maxHp: 3,
      damage: 1,
      alive: true,
    };
  }
  if (type === "brute") {
    return {
      type,
      x,
      w: 48,
      h: 56,
      vx: 0.92 * direction,
      hp: 5,
      maxHp: 5,
      damage: 2,
      alive: true,
    };
  }
  return {
    type: "zombie",
    x,
    w: 38,
    h: 46,
    vx: 1.25 * direction,
    hp: 3,
    maxHp: 3,
    damage: 1,
    alive: true,
  };
}

function initializeTrees() {
  trees.length = 0;

  for (let i = 0; i < 16; i += 1) {
    const x = 260 + i * 300 + ((i % 3) - 1) * 26;
    const trunkH = 70 + (i % 4) * 10;
    const trunkW = 18;
    const crownW = 54 + (i % 3) * 8;
    const crownH = 36 + (i % 2) * 6;
    const groundY = groundAt(x);
    trees.push({
      x,
      y: groundY,
      trunkW,
      trunkH,
      crownW,
      crownH,
      hp: 3,
      apples: 2 + (i % 3),
      alive: true,
    });
  }
}

function initializeBuriedSites() {
  buriedSites.length = 0;
  const siteXs = [640, 1320, 1880, 2470, 3060, 3780, 4460];
  siteXs.forEach((x, index) => {
    buriedSites.push({
      x,
      progress: 0,
      threshold: 3 + (index % 3),
      revealed: false,
      tunnelSize: 6 + (index % 4),
    });
  });
}

function initializeBirds() {
  birds.length = 0;
  for (let i = 0; i < PERF.birdCount; i += 1) {
    const x = (world.width / PERF.birdCount) * i + Math.random() * 180;
    birds.push({
      x,
      y: 70 + Math.random() * 180,
      vx: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 0.9),
      flapOffset: Math.random() * Math.PI * 2,
      targetY: 70 + Math.random() * 180,
    });
  }
}

function spawnNightWave() {
  enemies.length = 0;

  const enemyCount = 14;
  const types = ["zombie", "skeleton", "slime", "brute", "enderman"];

  for (let i = 0; i < enemyCount; i += 1) {
    const type = types[i % types.length];
    const x = 350 + i * 390;
    const direction = i % 2 === 0 ? 1 : -1;
    const enemy = createEnemy(type, x, direction);
    enemy.y = groundAt(enemy.x) - enemy.h;
    enemies.push(enemy);
  }
}

function clearEnemies() {
  enemies.length = 0;
}

function drawBackground(cameraX, cameraY) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = getSkyColor();
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawCelestialBodies();

  if (isNight()) {
    ctx.fillStyle = "#cbd5e1";
    for (let i = 0; i < PERF.starCount; i += 1) {
      const sx = (i * 173 + frameCount * 0.07) % canvas.width;
      const sy = 25 + ((i * 61) % 120);
      ctx.fillRect(Math.floor(sx), sy, 2, 2);
    }
  }

  drawBirds(cameraX);
  drawTerrain(cameraX, cameraY);
  drawUndergroundVision(cameraX, cameraY);
}

function drawBirds(cameraX) {
  ctx.strokeStyle = isNight() ? "#cbd5e1" : "#1f2937";
  ctx.lineWidth = 2;

  birds.forEach((bird, index) => {
    const bx = bird.x - cameraX;
    if (bx < -30 || bx > canvas.width + 30) return;

    const flap = Math.sin(frameCount * 0.18 + bird.flapOffset + index * 0.3) * 3.5;
    const by = bird.y;
    ctx.beginPath();
    ctx.moveTo(bx - 8, by + flap);
    ctx.lineTo(bx, by - flap * 0.4);
    ctx.lineTo(bx + 8, by + flap);
    ctx.stroke();
  });
}

function drawTerrain(cameraX, cameraY) {
  const topColor = isNight() ? "#2d5c34" : "#5ca45f";
  const bodyA = isNight() ? "#1f3d24" : "#3f8746";
  const bodyB = isNight() ? "#25452a" : "#4a9250";

  const startCol = worldToTerrainCol(cameraX) - 1;
  const endCol = worldToTerrainCol(cameraX + canvas.width) + 1;
  const topRow = worldToTerrainRow(cameraY) - 1;
  const bottomRow = worldToTerrainRow(cameraY + canvas.height) + 1;

  for (let col = startCol; col <= endCol; col += 1) {
    const surfaceRow = surfaceRowForCol(col);
    for (let row = Math.max(surfaceRow, topRow); row <= bottomRow; row += 1) {
      if (!isTerrainSolidCell(col, row)) continue;

      const sx = col * BLOCK_SIZE - cameraX;
      const sy = row * BLOCK_SIZE - cameraY;
      const checker = ((col + row) & 1) === 0;
      ctx.fillStyle = row === surfaceRow ? topColor : checker ? bodyA : bodyB;
      ctx.fillRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);

      ctx.strokeStyle = isNight() ? "rgba(15, 23, 42, 0.35)" : "rgba(30, 64, 45, 0.28)";
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
    }
  }

  drawGroundCuts(cameraX, cameraY);
  drawBuriedSiteHints(cameraX, cameraY);
}

function drawBuriedSiteHints(cameraX, cameraY) {
  ctx.fillStyle = "rgba(30, 41, 59, 0.35)";
  buriedSites.forEach((site) => {
    if (site.revealed) return;
    const sx = site.x - cameraX;
    if (sx < -30 || sx > canvas.width + 30) return;
    const sy = groundAt(site.x) - cameraY - 4;
    ctx.fillRect(sx - 10, sy, 20, 2);
    ctx.fillRect(sx - 2, sy - 4, 4, 8);
  });
}

function drawGroundCuts(cameraX, cameraY) {
  ctx.fillStyle = isNight() ? "#16301b" : "#2f4f2f";
  groundCuts.forEach((cut) => {
    const sx = cut.x - cameraX - cut.size / 2;
    if (sx + cut.size < -20 || sx > canvas.width + 20) return;
    const sy = groundAt(cut.x) - cameraY - 2;
    ctx.fillRect(sx, sy, cut.size, 6);
  });
}

function drawUndergroundVision(cameraX, cameraY) {
  // X-ray overlay: show hidden dig sites and treasures under the ground.
  buriedSites.forEach((site) => {
    if (site.revealed) return;
    const sx = site.x - cameraX;
    if (sx < -30 || sx > canvas.width + 30) return;

    const surfaceY = groundAt(site.x) - cameraY;
    const depthY = surfaceY + BLOCK_SIZE * 2.8;

    ctx.strokeStyle = "rgba(125, 211, 252, 0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, surfaceY);
    ctx.lineTo(sx, depthY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
    ctx.fillRect(sx - 9, depthY - 9, 18, 18);
    ctx.strokeStyle = "rgba(125, 211, 252, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - 9, depthY - 9, 18, 18);
  });

  buriedTreasures.forEach((treasure) => {
    if (treasure.collected) return;
    const tx = treasure.x - cameraX;
    if (tx < -30 || tx > canvas.width + 30) return;

    const ty = treasure.y - cameraY;
    const surfaceY = groundAt(treasure.x) - cameraY;
    if (ty <= surfaceY) return;

    ctx.strokeStyle = "rgba(244, 244, 245, 0.34)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, surfaceY);
    ctx.lineTo(tx, ty - 6);
    ctx.stroke();

    ctx.fillStyle = "rgba(250, 204, 21, 0.24)";
    ctx.fillRect(tx - 7, ty - 7, 14, 14);
    ctx.strokeStyle = "rgba(250, 204, 21, 0.8)";
    ctx.strokeRect(tx - 7, ty - 7, 14, 14);
  });
}

function drawGroundParticles(cameraX, cameraY) {
  groundParticles.forEach((piece) => {
    const px = piece.x - cameraX;
    const py = piece.y - cameraY;
    if (px < -20 || px > canvas.width + 20) return;
    ctx.fillStyle = piece.color;
    ctx.fillRect(px, py, piece.size, piece.size);
  });
}

function drawPlacedBlocks(cameraX, cameraY) {
  placedBlocks.forEach((block) => {
    const bx = block.x - cameraX;
    const by = block.y - cameraY;
    if (bx + block.size < -50 || bx > canvas.width + 50) return;

    if (block.material === "wood") {
      ctx.fillStyle = "#8b5a2b";
      ctx.fillRect(bx, by, block.size, block.size);
      ctx.fillStyle = "#a7703a";
      ctx.fillRect(bx + 5, by + 5, block.size - 10, block.size - 10);
    } else if (block.material === "dirt") {
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(bx, by, block.size, block.size);
      ctx.fillStyle = "#8f6a44";
      ctx.fillRect(bx + 6, by + 6, block.size - 12, block.size - 12);
    } else if (block.material === "emerald") {
      ctx.fillStyle = "#059669";
      ctx.fillRect(bx, by, block.size, block.size);
      ctx.fillStyle = "#34d399";
      ctx.fillRect(bx + 6, by + 6, block.size - 12, block.size - 12);
    } else if (block.material === "nyx") {
      ctx.fillStyle = "#0b1120";
      ctx.fillRect(bx, by, block.size, block.size);
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(bx + 6, by + 6, block.size - 12, block.size - 12);
    } else {
      // amethyst
      ctx.fillStyle = "#6d28d9";
      ctx.fillRect(bx, by, block.size, block.size);
      ctx.fillStyle = "#a78bfa";
      ctx.fillRect(bx + 6, by + 6, block.size - 12, block.size - 12);
    }

    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, block.size, block.size);
  });
}

function drawTrees(cameraX, cameraY) {
  trees.forEach((tree) => {
    if (!tree.alive) return;

    const trunkX = tree.x - tree.trunkW / 2 - cameraX;
    const trunkTopY = tree.y - tree.trunkH - cameraY;
    if (trunkX + tree.crownW < -80 || trunkX > canvas.width + 80) return;

    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(trunkX, trunkTopY, tree.trunkW, tree.trunkH);

    const crownX = tree.x - tree.crownW / 2 - cameraX;
    const crownY = trunkTopY - tree.crownH + 10;
    ctx.fillStyle = "#3d8b3d";
    ctx.fillRect(crownX, crownY, tree.crownW, tree.crownH);
    ctx.fillStyle = "#5fa95f";
    ctx.fillRect(crownX + 6, crownY + 6, tree.crownW - 12, tree.crownH - 12);

    const appleSlots = [
      { dx: -12, dy: 10 },
      { dx: 0, dy: 16 },
      { dx: 14, dy: 11 },
      { dx: -4, dy: 23 },
    ];
    for (let i = 0; i < tree.apples; i += 1) {
      const slot = appleSlots[i % appleSlots.length];
      const ax = tree.x + slot.dx - cameraX;
      const ay = crownY + slot.dy;
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(ax, ay, 7, 7);
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(ax + 2, ay - 2, 3, 2);
    }
  });
}

function drawDroppedApples(cameraX, cameraY) {
  droppedApples.forEach((apple) => {
    const ax = apple.x - cameraX;
    const ay = apple.y - cameraY;
    if (ax < -20 || ax > canvas.width + 20) return;

    ctx.fillStyle = "#dc2626";
    ctx.fillRect(ax - 4, ay - 4, 8, 8);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(ax - 1, ay - 6, 3, 2);
  });
}

function drawDroppedCoins(cameraX, cameraY) {
  droppedCoins.forEach((coin) => {
    const cx = coin.x - cameraX;
    const cy = coin.y - cameraY;
    if (cx < -20 || cx > canvas.width + 20) return;

    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(cx - 4, cy - 4, 8, 8);
    ctx.fillStyle = "#fef3c7";
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
  });
}

function drawDog(cameraX, cameraY) {
  const dx = dog.x - cameraX;
  const dy = dog.y - cameraY + Math.sin(dog.bouncePhase) * 1.8;
  const tailWag = Math.sin(frameCount * 0.45) * 2;

  ctx.fillStyle = "#b45309";
  ctx.fillRect(dx, dy + 6, dog.w, dog.h - 6); // body
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(dx + dog.w - 8, dy + 2, 12, 12); // head

  const eyeX = dog.facing > 0 ? dx + dog.w + 1 : dx + dog.w - 2;
  ctx.fillStyle = "#111827";
  ctx.fillRect(eyeX, dy + 6, 2, 2);

  ctx.fillStyle = "#92400e";
  const tailX = dog.facing > 0 ? dx - 4 : dx + dog.w + 2;
  ctx.fillRect(tailX, dy + 8 + tailWag, 4, 8);

  // legs
  ctx.fillStyle = "#7c2d12";
  ctx.fillRect(dx + 4, dy + dog.h - 4, 4, 6);
  ctx.fillRect(dx + 12, dy + dog.h - 4, 4, 6);
  ctx.fillRect(dx + 20, dy + dog.h - 4, 4, 6);
  ctx.fillRect(dx + 27, dy + dog.h - 4, 4, 6);

  // smile
  ctx.fillStyle = "#78350f";
  ctx.fillRect(dx + dog.w - 2, dy + 10, 4, 2);
}

function drawBuriedTreasures(cameraX, cameraY) {
  buriedTreasures.forEach((treasure) => {
    if (treasure.collected) return;
    const tx = treasure.x - cameraX;
    const ty = treasure.y - cameraY;
    if (tx < -20 || tx > canvas.width + 20) return;

    if (treasure.type === "cache") {
      ctx.fillStyle = "#92400e";
      ctx.fillRect(tx - 9, ty - 7, 18, 14);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(tx - 9, ty - 3, 18, 3);
      ctx.fillStyle = "#78350f";
      ctx.fillRect(tx - 2, ty - 2, 4, 4);
      if (typeof treasure.hp === "number") {
        const crack = Math.max(0, 3 - treasure.hp);
        if (crack > 0) {
          ctx.fillStyle = "#1f2937";
          for (let i = 0; i < crack; i += 1) {
            ctx.fillRect(tx - 6 + i * 4, ty - 5 + i, 2, 8);
          }
        }
      }
      return;
    }

    const gemColors = {
      emerald: ["#047857", "#34d399"],
      nyx: ["#0f172a", "#334155"],
      amethyst: ["#6d28d9", "#c4b5fd"],
    };
    const colors = gemColors[treasure.type] || ["#155e75", "#67e8f9"];
    ctx.fillStyle = colors[0];
    ctx.fillRect(tx - 6, ty - 6, 12, 12);
    ctx.fillStyle = colors[1];
    ctx.fillRect(tx - 3, ty - 3, 6, 6);
  });
}

function drawPlayer(cameraX, cameraY) {
  const px = player.x - cameraX;
  const py = player.y - cameraY;
  const w = player.w;
  const h = player.h;
  const headH = Math.floor(h * 0.32);
  const torsoH = Math.floor(h * 0.36);
  const legH = h - headH - torsoH;
  const armW = Math.max(4, Math.floor(w * 0.16));
  const hitTint = player.hitCooldown > 0;

  const skin = hitTint ? "#fca5a5" : "#eab308";
  const shirt = hitTint ? "#fca5a5" : "#3b82f6";
  const pants = hitTint ? "#fca5a5" : "#1e3a8a";

  // Minecraft-lik gubbe: blockigt huvud, torso, armar och ben.
  ctx.fillStyle = skin;
  ctx.fillRect(px, py, w, headH);

  const eyeY = py + Math.floor(headH * 0.38);
  const eyeSize = 3;
  const leftEyeX = player.facing > 0 ? px + Math.floor(w * 0.28) : px + Math.floor(w * 0.5);
  const rightEyeX = player.facing > 0 ? px + Math.floor(w * 0.58) : px + Math.floor(w * 0.2);
  ctx.fillStyle = "#111827";
  ctx.fillRect(leftEyeX, eyeY, eyeSize, eyeSize);
  ctx.fillRect(rightEyeX, eyeY, eyeSize, eyeSize);

  const torsoY = py + headH;
  ctx.fillStyle = shirt;
  ctx.fillRect(px, torsoY, w, torsoH);

  ctx.fillStyle = skin;
  ctx.fillRect(px - armW, torsoY + 2, armW, torsoH - 2);
  ctx.fillRect(px + w, torsoY + 2, armW, torsoH - 2);

  const legY = torsoY + torsoH;
  const legW = Math.floor(w * 0.43);
  ctx.fillStyle = pants;
  ctx.fillRect(px, legY, legW, legH);
  ctx.fillRect(px + w - legW, legY, legW, legH);

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, w, h);

  // Svärd: roteras runt handen för en tydlig sving.
  const swordW = 6;
  const swordH = 30;
  const handX = player.facing > 0 ? px + w + armW - 1 : px - armW + 1;
  const isDownAttack = player.attackDirection === "down" && player.attackTimer > 0;
  const isUpAttack = player.attackDirection === "up" && player.attackTimer > 0;
  const handY = isDownAttack
    ? py + h + 2
    : isUpAttack
      ? py + 2
      : torsoY + Math.floor(torsoH * 0.45);
  const isAttacking = player.attackTimer > 0;
  const swingT = isAttacking ? 1 - player.attackTimer / 12 : 0;
  const baseAngle = player.facing > 0 ? -0.28 : Math.PI + 0.28;
  let swingAngle = player.facing > 0 ? -1.55 + swingT * 2.2 : Math.PI + 1.55 - swingT * 2.2;
  if (isDownAttack) {
    swingAngle = player.facing > 0 ? 0.3 + swingT * 1.2 : Math.PI - 0.3 - swingT * 1.2;
  } else if (isUpAttack) {
    swingAngle = player.facing > 0 ? -2.1 + swingT * 1.3 : Math.PI + 2.1 - swingT * 1.3;
  }
  const swordAngle = isAttacking ? swingAngle : baseAngle;

  if (isAttacking) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 7;
    ctx.beginPath();
    if (player.facing > 0) {
      ctx.arc(handX, handY, 28, -1.55, 0.65);
    } else {
      ctx.arc(handX, handY, 28, Math.PI + 1.55, Math.PI - 0.65, true);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(swordAngle);
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(-Math.floor(swordW / 2), -swordH + 2, swordW, swordH);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(-2, -swordH + 2, 4, Math.floor(swordH * 0.7));
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(-5, -8, 10, 2);
  ctx.fillStyle = "#78350f";
  ctx.fillRect(-2, -6, 4, 9);
  ctx.restore();

  if (player.attackTimer > 0) {
    const attackW = 28;
    const attackH = 18;
    const attackX = player.facing > 0 ? px + player.w : px - attackW;
    const attackY = py + 15;
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(attackX, attackY, attackW, attackH);
  }
}

function drawEnemyHealth(enemy, ex, ey) {
  const barW = enemy.w;
  const barH = 4;
  const ratio = enemy.hp / enemy.maxHp;
  ctx.fillStyle = "#111827";
  ctx.fillRect(ex, ey - 8, barW, barH);
  ctx.fillStyle = ratio > 0.5 ? "#22c55e" : ratio > 0.25 ? "#f59e0b" : "#ef4444";
  ctx.fillRect(ex, ey - 8, Math.floor(barW * ratio), barH);
}

function drawZombie(enemy, ex, ey) {
  const x = ex;
  const y = ey;
  const w = enemy.w;
  const h = enemy.h;
  const headH = Math.floor(h * 0.33);
  const torsoH = Math.floor(h * 0.34);
  const legH = h - headH - torsoH;
  const armW = Math.max(4, Math.floor(w * 0.18));
  const eye = Math.max(2, Math.floor(w * 0.1));

  ctx.fillStyle = "#6fbf73";
  ctx.fillRect(x, y, w, headH);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + Math.floor(w * 0.25), y + Math.floor(headH * 0.35), eye, eye);
  ctx.fillRect(x + Math.floor(w * 0.65), y + Math.floor(headH * 0.35), eye, eye);
  ctx.fillStyle = "#166534";
  ctx.fillRect(x + Math.floor(w * 0.35), y + Math.floor(headH * 0.72), Math.floor(w * 0.3), 2);

  const torsoY = y + headH;
  ctx.fillStyle = "#2f855a";
  ctx.fillRect(x, torsoY, w, torsoH);
  ctx.fillStyle = "#6fbf73";
  ctx.fillRect(x - armW, torsoY + 2, armW, torsoH - 2);
  ctx.fillRect(x + w, torsoY + 2, armW, torsoH - 2);

  const legY = torsoY + torsoH;
  const legW = Math.floor(w * 0.42);
  ctx.fillStyle = "#374151";
  ctx.fillRect(x, legY, legW, legH);
  ctx.fillRect(x + w - legW, legY, legW, legH);

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawSkeleton(enemy, ex, ey) {
  const x = ex;
  const y = ey;
  const w = enemy.w;
  const h = enemy.h;
  const head = Math.floor(w * 0.7);
  const headX = x + Math.floor((w - head) / 2);

  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(headX, y, head, head);
  ctx.fillStyle = "#111827";
  ctx.fillRect(headX + 6, y + 7, 3, 3);
  ctx.fillRect(headX + head - 9, y + 7, 3, 3);

  const torsoY = y + head;
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(x + Math.floor(w * 0.36), torsoY, Math.floor(w * 0.28), Math.floor(h * 0.42));

  ctx.fillRect(x + 3, torsoY + 8, 5, Math.floor(h * 0.26));
  ctx.fillRect(x + w - 8, torsoY + 8, 5, Math.floor(h * 0.26));
  ctx.fillRect(x + Math.floor(w * 0.3), y + h - 14, 5, 14);
  ctx.fillRect(x + Math.floor(w * 0.58), y + h - 14, 5, 14);
}

function drawSlime(enemy, ex, ey) {
  const x = ex;
  const y = ey;
  const w = enemy.w;
  const h = enemy.h;

  ctx.fillStyle = "#84cc16";
  ctx.fillRect(x, y + 4, w, h - 4);
  ctx.fillStyle = "#65a30d";
  ctx.fillRect(x + 4, y, w - 8, h - 10);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + Math.floor(w * 0.28), y + Math.floor(h * 0.34), 3, 3);
  ctx.fillRect(x + Math.floor(w * 0.63), y + Math.floor(h * 0.34), 3, 3);
}

function drawBrute(enemy, ex, ey) {
  const x = ex;
  const y = ey;
  const w = enemy.w;
  const h = enemy.h;
  const headH = Math.floor(h * 0.31);
  const torsoH = Math.floor(h * 0.4);
  const legH = h - headH - torsoH;

  ctx.fillStyle = "#4e9a52";
  ctx.fillRect(x + 4, y, w - 8, headH);
  ctx.fillStyle = "#14532d";
  ctx.fillRect(x, y + headH, w, torsoH);
  ctx.fillStyle = "#3f3f46";
  ctx.fillRect(x, y + headH + torsoH, Math.floor(w * 0.44), legH);
  ctx.fillRect(x + w - Math.floor(w * 0.44), y + headH + torsoH, Math.floor(w * 0.44), legH);
  ctx.fillStyle = "#4e9a52";
  ctx.fillRect(x - 6, y + headH + 4, 6, Math.floor(h * 0.28));
  ctx.fillRect(x + w, y + headH + 4, 6, Math.floor(h * 0.28));
}

function drawEnderman(enemy, ex, ey) {
  const x = ex;
  const y = ey;
  const w = enemy.w;
  const h = enemy.h;
  const headH = Math.floor(h * 0.25);
  const torsoH = Math.floor(h * 0.4);
  const legH = h - headH - torsoH;
  const armW = 5;

  ctx.fillStyle = "#111111";
  ctx.fillRect(x + 2, y, w - 4, headH);
  ctx.fillStyle = "#a855f7";
  ctx.fillRect(x + 6, y + Math.floor(headH * 0.45), 4, 3);
  ctx.fillRect(x + w - 10, y + Math.floor(headH * 0.45), 4, 3);

  ctx.fillStyle = "#171717";
  ctx.fillRect(x + 4, y + headH, w - 8, torsoH);

  const legY = y + headH + torsoH;
  const legW = Math.floor((w - 8) / 2);
  ctx.fillRect(x + 4, legY, legW, legH);
  ctx.fillRect(x + w - 4 - legW, legY, legW, legH);

  const armH = Math.floor(h * 0.48);
  ctx.fillRect(x - armW, y + headH + 4, armW, armH);
  ctx.fillRect(x + w, y + headH + 4, armW, armH);

  ctx.strokeStyle = "#27272a";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y, w - 2, h);
}

function drawEnemies(cameraX, cameraY) {
  enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    const ex = enemy.x - cameraX;
    const ey = enemy.y - cameraY;
    if (ex + enemy.w < -40 || ex > canvas.width + 40) return;

    if (enemy.type === "skeleton") drawSkeleton(enemy, ex, ey);
    else if (enemy.type === "slime") drawSlime(enemy, ex, ey);
    else if (enemy.type === "brute") drawBrute(enemy, ex, ey);
    else if (enemy.type === "enderman") drawEnderman(enemy, ex, ey);
    else drawZombie(enemy, ex, ey);

    drawEnemyHealth(enemy, ex, ey);
  });
}

function drawHud() {
  if (gameOver) {
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 44px Trebuchet MS, sans-serif";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.strokeText("Game Over", canvas.width / 2 - 120, canvas.height / 2);
    ctx.fillText("Game Over", canvas.width / 2 - 120, canvas.height / 2);
  }
}

function updatePlayer() {
  if (gameOver) return;

  player.vx = 0;
  if (keys.left) {
    player.vx = -player.speed;
    player.facing = -1;
  }
  if (keys.right) {
    player.vx = player.speed;
    player.facing = 1;
  }

  // Horizontal move: only check the leading edge cells.
  let nextX = clamp(player.x + player.vx, 0, world.width - player.w);
  if (player.vx > 0) {
    const rightCol = worldToTerrainCol(nextX + player.w - 1);
    const topRow = worldToTerrainRow(player.y + 1);
    const bottomRow = worldToTerrainRow(player.y + player.h - 1);
    for (let row = topRow; row <= bottomRow; row += 1) {
      if (!isSolidCell(rightCol, row)) continue;
      nextX = rightCol * BLOCK_SIZE - player.w;
      player.vx = 0;
      break;
    }
  } else if (player.vx < 0) {
    const leftCol = worldToTerrainCol(nextX);
    const topRow = worldToTerrainRow(player.y + 1);
    const bottomRow = worldToTerrainRow(player.y + player.h - 1);
    for (let row = topRow; row <= bottomRow; row += 1) {
      if (!isSolidCell(leftCol, row)) continue;
      nextX = (leftCol + 1) * BLOCK_SIZE;
      player.vx = 0;
      break;
    }
  }
  player.x = nextX;

  // Vertical move: only check the leading edge cells.
  player.vy += world.gravity;
  let nextY = player.y + player.vy;
  player.onGround = false;

  if (player.vy > 0) {
    const bottomRow = worldToTerrainRow(nextY + player.h - 1);
    const leftCol = worldToTerrainCol(player.x + 2);
    const rightCol = worldToTerrainCol(player.x + player.w - 3);
    for (let col = leftCol; col <= rightCol; col += 1) {
      if (!isSolidCell(col, bottomRow)) continue;
      nextY = bottomRow * BLOCK_SIZE - player.h;
      player.vy = 0;
      player.onGround = true;
      break;
    }
  } else if (player.vy < 0) {
    const topRow = worldToTerrainRow(nextY);
    const leftCol = worldToTerrainCol(player.x + 2);
    const rightCol = worldToTerrainCol(player.x + player.w - 3);
    for (let col = leftCol; col <= rightCol; col += 1) {
      if (!isSolidCell(col, topRow)) continue;
      nextY = (topRow + 1) * BLOCK_SIZE;
      player.vy = 0;
      break;
    }
  }
  player.y = nextY;

  player.x = clamp(player.x, 0, world.width - player.w);

  if (player.attackTimer > 0) player.attackTimer -= 1;
  if (player.hitCooldown > 0) player.hitCooldown -= 1;
}

function updateDog() {
  const desiredOffset = dog.targetSide * 58;
  const targetX = clamp(player.x + desiredOffset, 0, world.width - dog.w);
  const dist = targetX - dog.x;

  if (Math.abs(dist) < 6) {
    dog.targetSide = player.facing > 0 ? -1 : 1;
  }

  dog.vx = clamp(dist * 0.12, -dog.speed, dog.speed);
  dog.x = clamp(dog.x + dog.vx, 0, world.width - dog.w);
  dog.facing = dog.vx >= 0 ? 1 : -1;
  dog.y = groundAt(dog.x + dog.w / 2) - dog.h;
  dog.bouncePhase += Math.abs(dog.vx) * 0.18 + 0.08;
}

function updateEnemies() {
  if (gameOver) return;

  enemies.forEach((enemy) => {
    if (!enemy.alive) return;

    enemy.x += enemy.vx;
    enemy.x = clamp(enemy.x, 0, world.width - enemy.w);

    const groundY = groundAt(enemy.x + enemy.w / 2);
    enemy.y = groundY - enemy.h;

    if (enemy.x <= 0 || enemy.x + enemy.w >= world.width) {
      enemy.vx *= -1;
    }

    // Turn around sometimes for livelier behavior.
    if ((frameCount + Math.floor(enemy.x)) % 320 === 0) {
      enemy.vx *= -1;
    }

    // Enderman-like behavior: short teleports, often toward the player.
    if (enemy.type === "enderman" && frameCount % 180 === 0) {
      const towardPlayer = player.x > enemy.x ? 1 : -1;
      const jumpDistance = 120 + Math.random() * 90;
      enemy.x = clamp(enemy.x + towardPlayer * jumpDistance, 0, world.width - enemy.w);
      enemy.vx = Math.abs(enemy.vx) * towardPlayer;
      enemy.y = groundAt(enemy.x + enemy.w / 2) - enemy.h;
    }

    if (intersects(player, enemy) && player.hitCooldown <= 0) {
      player.hp -= enemy.damage;
      player.hitCooldown = 45;
      if (player.hp <= 0) {
        gameOver = true;
      }
    }
  });
}

function updateGroundCuts() {
  for (let i = groundCuts.length - 1; i >= 0; i -= 1) {
    groundCuts[i].ttl -= 1;
    if (groundCuts[i].ttl <= 0) {
      groundCuts.splice(i, 1);
    }
  }
}

function updateGroundParticles() {
  if (groundParticles.length === 0) return;

  for (let i = groundParticles.length - 1; i >= 0; i -= 1) {
    const piece = groundParticles[i];
    piece.x = clamp(piece.x + piece.vx, 0, world.width);
    piece.y += piece.vy;
    piece.vy += world.gravity * 0.55;
    piece.vx *= 0.99;
    piece.ttl -= 1;

    const floorY = groundAt(piece.x) - piece.size;
    if (piece.y >= floorY) {
      piece.y = floorY;
      piece.vy *= -0.2;
      piece.vx *= 0.7;
    }

    if (piece.ttl <= 0) {
      groundParticles.splice(i, 1);
    }
  }
}

function digTerrainAt(worldX) {
  const col = worldToTerrainCol(worldX);
  const startRow = surfaceRowForCol(col);
  for (let row = startRow; row < startRow + 18; row += 1) {
    if (!isTerrainSolidCell(col, row)) continue;
    removedGroundBlocks.add(terrainKey(col, row));
    return { col, row };
  }
  return null;
}

function spawnGroundParticles(worldX, worldY) {
  const count = 5;
  for (let i = 0; i < count; i += 1) {
    const dark = i % 2 === 0;
    groundParticles.push({
      x: worldX + (Math.random() - 0.5) * 18,
      y: worldY - 2 + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 3.6,
      vy: -2.8 - Math.random() * 3.1,
      size: 3 + Math.floor(Math.random() * 3),
      ttl: 30 + Math.floor(Math.random() * 20),
      color: dark ? "#5b3b1f" : "#8b5a2b",
    });
  }

  if (groundParticles.length > PERF.maxGroundParticles) {
    groundParticles.splice(0, groundParticles.length - PERF.maxGroundParticles);
  }
}

function updateDroppedApples() {
  const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };

  for (let i = droppedApples.length - 1; i >= 0; i -= 1) {
    const apple = droppedApples[i];

    if (!apple.onGround) {
      apple.x = clamp(apple.x + apple.vx, 0, world.width);
      apple.y += apple.vy;
      apple.vy += world.gravity * 0.6;
      apple.vx *= 0.985;

      const groundY = groundAt(apple.x) - 5;
      if (apple.y >= groundY) {
        apple.y = groundY;
        apple.vy = 0;
        apple.vx *= 0.6;
        if (Math.abs(apple.vx) < 0.1) {
          apple.vx = 0;
          apple.onGround = true;
        }
      }
    }

    const appleBox = { x: apple.x - 5, y: apple.y - 5, w: 10, h: 10 };
    if (intersects(playerBox, appleBox) && player.hp < MAX_PLAYER_HP) {
      player.hp = Math.min(MAX_PLAYER_HP, player.hp + 1);
      droppedApples.splice(i, 1);
    }
  }
}

function updateDroppedCoins() {
  const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
  for (let i = droppedCoins.length - 1; i >= 0; i -= 1) {
    const coin = droppedCoins[i];

    if (!coin.onGround) {
      coin.x = clamp(coin.x + coin.vx, 0, world.width);
      coin.y += coin.vy;
      coin.vy += world.gravity * 0.58;
      coin.vx *= 0.987;

      const groundY = groundAt(coin.x) - 4;
      if (coin.y >= groundY) {
        coin.y = groundY;
        coin.vy = 0;
        coin.vx *= 0.6;
        if (Math.abs(coin.vx) < 0.12) {
          coin.vx = 0;
          coin.onGround = true;
        }
      }
    }

    const coinBox = { x: coin.x - 4, y: coin.y - 4, w: 8, h: 8 };
    if (intersects(playerBox, coinBox)) {
      gold += coin.value;
      droppedCoins.splice(i, 1);
    }
  }
}

function spawnCoinsFromChest(x, y, count) {
  for (let i = 0; i < count; i += 1) {
    droppedCoins.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y - 4,
      vx: (Math.random() - 0.5) * 4.2,
      vy: -3.8 - Math.random() * 2.4,
      value: 1 + Math.floor(Math.random() * 2),
      onGround: false,
    });
  }
}

function spawnBuriedTreasure(type, x, depthOffset) {
  buriedTreasures.push({
    type,
    x,
    depthOffset,
    y: groundAt(x) + depthOffset,
    hp: type === "cache" ? 3 : 1,
    collected: false,
  });
}

function revealBuriedSite(site) {
  site.revealed = true;
  const step = 54;
  const count = site.tunnelSize;
  const start = site.x - step;

  for (let i = 0; i < count; i += 1) {
    const px = start + i * step;
    const col = worldToTerrainCol(px);
    const startRow = surfaceRowForCol(col);
    const tunnelTop = startRow + 2 + Math.floor(Math.abs(Math.sin(i * 0.85)) * 2);
    const tunnelHeight = 3 + (i % 2);

    for (let dc = -1; dc <= 1; dc += 1) {
      const carveCol = col + dc;
      for (let dr = 0; dr < tunnelHeight; dr += 1) {
        removedGroundBlocks.add(terrainKey(carveCol, tunnelTop + dr));
      }
    }
  }

  const treasureTypes = ["emerald", "nyx", "amethyst", "cache"];
  const treasureCount = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < treasureCount; i += 1) {
    const tx = site.x + (Math.random() - 0.5) * (count * step * 0.65);
    const type = treasureTypes[Math.floor(Math.random() * treasureTypes.length)];
    const depthOffset = 36 + Math.random() * 38;
    spawnBuriedTreasure(type, clamp(tx, 0, world.width), depthOffset);
  }

  rebuildPitCellIndex();
}

function tryRevealBuriedSite(digX) {
  for (const site of buriedSites) {
    if (site.revealed) continue;
    if (Math.abs(site.x - digX) > 90) continue;

    site.progress += 1;
    if (site.progress >= site.threshold) {
      revealBuriedSite(site);
      return true;
    }
  }
  return false;
}

function updateBuriedTreasures() {
  const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
  for (let i = buriedTreasures.length - 1; i >= 0; i -= 1) {
    const t = buriedTreasures[i];
    if (t.collected) continue;
    if (t.type === "cache") continue;
    const box = { x: t.x - 8, y: t.y - 8, w: 16, h: 16 };
    if (!intersects(playerBox, box)) continue;

    if (t.type === "emerald") emerald += 8;
    else if (t.type === "nyx") nyx += 8;
    else if (t.type === "amethyst") amethyst += 8;
    else {
      wood += 14;
      dirt += 10;
      emerald += 3;
      nyx += 3;
      amethyst += 3;
    }

    t.collected = true;
    buriedTreasures.splice(i, 1);
  }
}

function tryHitTreasureChest(attackBox) {
  for (let i = buriedTreasures.length - 1; i >= 0; i -= 1) {
    const t = buriedTreasures[i];
    if (t.collected || t.type !== "cache") continue;
    const chestBox = { x: t.x - 10, y: t.y - 8, w: 20, h: 16 };
    if (!intersects(attackBox, chestBox)) continue;

    t.hp -= 1;
    if (t.hp <= 0) {
      t.collected = true;
      const coinCount = 8 + Math.floor(Math.random() * 8);
      spawnCoinsFromChest(t.x, t.y, coinCount);
      buriedTreasures.splice(i, 1);
    }
    return true;
  }
  return false;
}

function updateBirds() {
  for (const bird of birds) {
    bird.x += bird.vx;
    bird.y += (bird.targetY - bird.y) * 0.02;

    if (Math.abs(bird.targetY - bird.y) < 6) {
      bird.targetY = 70 + Math.random() * 180;
    }

    if (bird.x < -120) {
      bird.x = world.width + 120;
      bird.y = 70 + Math.random() * 180;
      bird.targetY = bird.y;
    } else if (bird.x > world.width + 120) {
      bird.x = -120;
      bird.y = 70 + Math.random() * 180;
      bird.targetY = bird.y;
    }
  }
}

function dropTreeApples(tree) {
  const count = tree.apples || 0;
  for (let i = 0; i < count; i += 1) {
    droppedApples.push({
      x: tree.x + (Math.random() - 0.5) * (tree.crownW * 0.7),
      y: tree.y - tree.trunkH - tree.crownH * 0.4,
      vx: (Math.random() - 0.5) * 3.4,
      vy: -5.8 - Math.random() * 2.2,
      onGround: false,
    });
  }
  tree.apples = 0;
}

function tryChopTree(attackBox) {
  let chopped = false;

  trees.forEach((tree) => {
    if (!tree.alive) return;

    const treeBox = {
      x: tree.x - tree.crownW / 2,
      y: tree.y - tree.trunkH - tree.crownH + 10,
      w: tree.crownW,
      h: tree.trunkH + tree.crownH,
    };

    if (!intersects(attackBox, treeBox)) return;
    tree.hp -= 1;
    chopped = true;

    if (tree.hp <= 0) {
      tree.alive = false;
      wood += 3;
      dropTreeApples(tree);
    }
  });

  return chopped;
}

function tryDigGround(attackBox) {
  const leftCol = worldToTerrainCol(attackBox.x);
  const rightCol = worldToTerrainCol(attackBox.x + attackBox.w - 1);
  const topRow = worldToTerrainRow(attackBox.y);
  const bottomRow = worldToTerrainRow(attackBox.y + attackBox.h - 1);

  let dug = null;
  for (let row = topRow; row <= bottomRow && !dug; row += 1) {
    for (let col = leftCol; col <= rightCol && !dug; col += 1) {
      if (!isTerrainSolidCell(col, row)) continue;
      removedGroundBlocks.add(terrainKey(col, row));
      dug = { col, row };
    }
  }

  if (!dug) {
    const fallback = digTerrainAt(attackBox.x + attackBox.w / 2);
    if (!fallback) return false;
    dug = fallback;
  }

  const dugX = dug.col * BLOCK_SIZE + BLOCK_SIZE * 0.5;
  const dugY = dug.row * BLOCK_SIZE;
  dirt += 1;
  tryRevealBuriedSite(dugX);
  spawnGroundParticles(dugX, dugY);
  groundCuts.push({
    x: clamp(dugX, 0, world.width),
    size: 22,
    ttl: 900,
  });

  if (groundCuts.length > PERF.maxGroundCuts) {
    groundCuts.shift();
  }

  return true;
}

function tryBreakPlacedBlock(attackBox) {
  for (let i = placedBlocks.length - 1; i >= 0; i -= 1) {
    const block = placedBlocks[i];
    const blockBox = { x: block.x, y: block.y, w: block.size, h: block.size };
    if (!intersects(attackBox, blockBox)) continue;

    placedBlocks.splice(i, 1);
    placedBlockCells.delete(terrainKey(worldToTerrainCol(block.x), worldToTerrainRow(block.y)));
    if (block.material === "wood") wood += 1;
    else if (block.material === "dirt") dirt += 1;
    else if (block.material === "emerald") emerald += 1;
    else if (block.material === "nyx") nyx += 1;
    else if (block.material === "amethyst") amethyst += 1;
    saveBuildState(placedBlocks);
    return true;
  }

  return false;
}

function attack() {
  if (gameOver || player.attackTimer > 0) return;

  player.attackTimer = 12;
  const centerX = player.x + player.w / 2;
  const attackDirection = keys.down ? "down" : keys.up ? "up" : "forward";
  player.attackDirection = attackDirection;
  let attackBox;

  if (attackDirection === "up") {
    attackBox = {
      x: centerX - 14,
      y: player.y - 26,
      w: 28,
      h: 24,
    };
  } else if (attackDirection === "down") {
    attackBox = {
      x: centerX - 14,
      y: player.y + player.h,
      w: 28,
      h: 24,
    };
  } else {
    attackBox = {
      x: player.facing > 0 ? player.x + player.w : player.x - 28,
      y: player.y + 15,
      w: 28,
      h: 18,
    };
  }

  enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    if (intersects(attackBox, enemy)) {
      enemy.hp -= 1;
      enemy.vx *= -1;
      if (enemy.hp <= 0) {
        enemy.alive = false;
        defeated += 1;
      }
    }
  });

  const brokeBlock = tryBreakPlacedBlock(attackBox);
  if (brokeBlock) return;

  const hitChest = tryHitTreasureChest(attackBox);
  if (hitChest) return;

  const choppedTree = tryChopTree(attackBox);
  if (!choppedTree) {
    tryDigGround(attackBox);
  }
}

function toggleBuildMaterial() {
  cycleBuildMaterial(1);
}

function cycleBuildMaterial(direction) {
  const idx = BUILD_MATERIALS.indexOf(selectedMaterial);
  const normalizedDirection = direction >= 0 ? 1 : -1;
  const nextIdx =
    idx < 0
      ? 0
      : (idx + normalizedDirection + BUILD_MATERIALS.length) % BUILD_MATERIALS.length;
  selectedMaterial = BUILD_MATERIALS[nextIdx];
}

function placeBlock() {
  if (gameOver) return;

  const baseX =
    player.facing > 0
      ? player.x + player.w + BLOCK_SIZE * 0.35
      : player.x - BLOCK_SIZE * 0.35;
  const baseY = player.y + player.h * 0.5;
  const snappedX = clamp(
    Math.floor(baseX / BLOCK_SIZE) * BLOCK_SIZE,
    0,
    world.width - BLOCK_SIZE
  );
  const snappedY = Math.floor(baseY / BLOCK_SIZE) * BLOCK_SIZE;

  const candidates = [
    { x: snappedX, y: snappedY },
    { x: snappedX, y: snappedY - BLOCK_SIZE },
    { x: snappedX, y: snappedY + BLOCK_SIZE },
    { x: snappedX, y: snappedY - BLOCK_SIZE * 2 },
    { x: snappedX, y: snappedY + BLOCK_SIZE * 2 },
  ];

  for (const pos of candidates) {
    const col = worldToTerrainCol(pos.x);
    const row = worldToTerrainRow(pos.y);
    if (placedBlockCells.has(terrainKey(col, row))) continue;

    placedBlocks.push({
      x: pos.x,
      y: pos.y,
      size: BLOCK_SIZE,
      material: selectedMaterial,
    });
    placedBlockCells.add(terrainKey(col, row));
    saveBuildState(placedBlocks);
    return;
  }
}

function jump() {
  if (gameOver) return;
  if (!player.onGround) return;
  player.vy = -player.jumpForce;
  player.onGround = false;
}

function updateDayNightAndSpawns() {
  const night = isNight();
  if (night && !spawnedThisNight) {
    spawnNightWave();
    spawnedThisNight = true;
  }

  if (!night && spawnedThisNight) {
    clearEnemies();
    spawnedThisNight = false;
  }
}

function toggleDayNight() {
  if (isNight()) {
    frameCount = 0;
  } else {
    frameCount = Math.floor(world.dayLengthFrames * 0.72) + 1;
  }
  updateDayNightAndSpawns();
  updateTimeToggleButton();
}

async function hardReloadPage() {
  if (hardReloadInProgress) return;
  hardReloadInProgress = true;

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch (_error) {
    // Ignore cache cleanup errors and still reload.
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
}

function handleGamepadInput() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = gamepads && gamepads[0];
  if (!pad) return;

  const horizontal = pad.axes[0] || 0;
  const vertical = pad.axes[1] || 0;
  keys.left = horizontal < -0.25;
  keys.right = horizontal > 0.25;
  keys.up = vertical < -0.35;
  keys.down = vertical > 0.35;

  const jumpNow = !!pad.buttons[0]?.pressed; // A / Cross
  const buildNow = !!pad.buttons[1]?.pressed; // B / Circle
  const attackNow = !!pad.buttons[2]?.pressed; // X / Square
  const swapPrevNow = !!pad.buttons[4]?.pressed; // LB / L1
  const swapNextNow = !!pad.buttons[5]?.pressed; // RB / R1
  const dayNightNow = !!pad.buttons[8]?.pressed; // Select / Share
  const timeNow = !!pad.buttons[9]?.pressed; // Start / Options

  if (jumpNow && !gamepadState.jumpPressed) jump();
  if (attackNow && !gamepadState.attackPressed) attack();
  if (buildNow && !gamepadState.buildPressed) placeBlock();
  if (swapPrevNow && !gamepadState.swapPrevPressed) cycleBuildMaterial(-1);
  if (swapNextNow && !gamepadState.swapNextPressed) cycleBuildMaterial(1);
  if (dayNightNow && !gamepadState.dayNightPressed) toggleDayNight();
  if (timeNow && !gamepadState.timePressed) hardReloadPage();

  gamepadState.jumpPressed = jumpNow;
  gamepadState.attackPressed = attackNow;
  gamepadState.buildPressed = buildNow;
  gamepadState.swapPrevPressed = swapPrevNow;
  gamepadState.swapNextPressed = swapNextNow;
  gamepadState.dayNightPressed = dayNightNow;
  gamepadState.timePressed = timeNow;
}

function gameLoop() {
  if (autoDayNightEnabled) {
    frameCount += 1;
  }
  handleGamepadInput();
  updateDayNightAndSpawns();
  updateTimeToggleButton();
  updatePlayer();
  updateDog();
  updateEnemies();
  updateGroundCuts();
  updateGroundParticles();
  updateDroppedApples();
  updateDroppedCoins();
  updateBirds();
  updateBuriedTreasures();
  updateCamera();

  const renderCameraX = Math.floor(camera.x);
  const renderCameraY = Math.floor(camera.y);

  drawBackground(renderCameraX, renderCameraY);
  drawGroundParticles(renderCameraX, renderCameraY);
  drawPlacedBlocks(renderCameraX, renderCameraY);
  drawTrees(renderCameraX, renderCameraY);
  drawDroppedApples(renderCameraX, renderCameraY);
  drawDroppedCoins(renderCameraX, renderCameraY);
  drawBuriedTreasures(renderCameraX, renderCameraY);
  drawDog(renderCameraX, renderCameraY);
  drawPlayer(renderCameraX, renderCameraY);
  drawEnemies(renderCameraX, renderCameraY);
  drawHud();
  ui.render({
    hp: player.hp,
    isNight: isNight(),
    selectedMaterial,
    materials: { wood, dirt, emerald, nyx, amethyst, gold },
  });

  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "ArrowLeft") keys.left = true;
  if (event.code === "ArrowRight") keys.right = true;
  if (event.code === "ArrowUp") keys.up = true;
  if (event.code === "ArrowDown") keys.down = true;

  if (event.code === "Space") {
    event.preventDefault();
    jump();
  }

  if (event.code === "KeyX") attack();
  if (event.code === "KeyC") toggleBuildMaterial();
  if (event.code === "KeyB") placeBlock();
});

window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft") keys.left = false;
  if (event.code === "ArrowRight") keys.right = false;
  if (event.code === "ArrowUp") keys.up = false;
  if (event.code === "ArrowDown") keys.down = false;
});

if (timeToggleButton) {
  timeToggleButton.addEventListener("click", toggleDayNight);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
initializeTrees();
initializeBuriedSites();
initializeBirds();
placedBlocks.push(
  ...loadBuildState({
    worldWidth: world.width,
    blockSize: BLOCK_SIZE,
    buildMaterials: BUILD_MATERIALS,
  })
);
rebuildPlacedBlockCells();
ui.setup();
ui.bindInfoToggle();
gameLoop();
