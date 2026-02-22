const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const timeToggleButton = document.getElementById("time-toggle");

const world = {
  gravity: 0.62,
  width: 5200,
  baseGround: 0,
  dayLengthFrames: 4200,
};

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
  hp: 8,
  facing: 1,
  attackTimer: 0,
  hitCooldown: 0,
};

const keys = {
  left: false,
  right: false,
};

const gamepadState = {
  jumpPressed: false,
  attackPressed: false,
  buildPressed: false,
  swapPressed: false,
  timePressed: false,
};

const enemies = [];
const trees = [];
const groundCuts = [];
const placedBlocks = [];
const BLOCK_SIZE = 40;
let defeated = 0;
let wood = 0;
let dirt = 0;
let selectedMaterial = "wood";
let gameOver = false;
let frameCount = 0;
let spawnedThisNight = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function groundAt(worldX) {
  const x = clamp(worldX, 0, world.width);
  const hills = Math.sin(x * 0.0048) * 70;
  const mountains = Math.sin(x * 0.0019 + 0.6) * 110;
  const valleys = Math.sin(x * 0.009 + 1.3) * 26;
  return world.baseGround + hills + mountains + valleys;
}

function getDayPhase() {
  return (frameCount % world.dayLengthFrames) / world.dayLengthFrames;
}

function isNight() {
  const phase = getDayPhase();
  return phase >= 0.72;
}

function updateTimeToggleButton() {
  if (!timeToggleButton) return;
  timeToggleButton.textContent = isNight() ? "Byt till dag" : "Byt till natt";
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

  player.y = groundAt(player.x + player.w / 2) - player.h;
  enemies.forEach((enemy) => {
    enemy.y = groundAt(enemy.x + enemy.w / 2) - enemy.h;
  });
  trees.forEach((tree) => {
    tree.y = groundAt(tree.x);
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

function intersects(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
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
      alive: true,
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
    for (let i = 0; i < 40; i += 1) {
      const sx = (i * 173 + frameCount * 0.07) % canvas.width;
      const sy = 25 + ((i * 61) % 120);
      ctx.fillRect(Math.floor(sx), sy, 2, 2);
    }
  }

  drawTerrain(cameraX, cameraY);
}

function drawTerrain(cameraX, cameraY) {
  ctx.fillStyle = isNight() ? "#1f3d24" : "#3f8746";
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);

  for (let sx = 0; sx <= canvas.width; sx += 4) {
    const wx = cameraX + sx;
    const gy = groundAt(wx) - cameraY;
    ctx.lineTo(sx, gy);
  }

  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = isNight() ? "#2d5c34" : "#5ca45f";
  for (let sx = 0; sx <= canvas.width; sx += 20) {
    const wx = cameraX + sx;
    const gy = groundAt(wx) - cameraY;
    ctx.fillRect(sx, gy - 4, 16, 4);
  }

  drawGroundCuts(cameraX, cameraY);
}

function drawGroundCuts(cameraX, cameraY) {
  ctx.fillStyle = isNight() ? "#16301b" : "#2f4f2f";
  groundCuts.forEach((cut) => {
    const sx = cut.x - cameraX - cut.size / 2;
    const sy = groundAt(cut.x) - cameraY - 2;
    ctx.fillRect(sx, sy, cut.size, 6);
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
    } else {
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(bx, by, block.size, block.size);
      ctx.fillStyle = "#8f6a44";
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
  const handY = torsoY + Math.floor(torsoH * 0.45);
  const isAttacking = player.attackTimer > 0;
  const swingT = isAttacking ? 1 - player.attackTimer / 12 : 0;
  const baseAngle = player.facing > 0 ? -0.28 : Math.PI + 0.28;
  const swingAngle = player.facing > 0 ? -1.55 + swingT * 2.2 : Math.PI + 1.55 - swingT * 2.2;
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
  const remaining = enemies.filter((enemy) => enemy.alive).length;
  const phaseText = isNight() ? "Natt" : "Dag";

  ctx.fillStyle = "#111827";
  ctx.font = "20px Trebuchet MS, sans-serif";
  ctx.fillText(`Liv: ${Math.max(0, player.hp)}`, 16, 30);
  ctx.fillText(`Nedkämpade fiender: ${defeated}`, 16, 56);
  ctx.fillText(`Kvar: ${remaining}`, 16, 82);
  ctx.fillText(`Fas: ${phaseText}`, 16, 108);
  ctx.fillText(`Trä: ${wood}`, 16, 134);
  ctx.fillText(`Jord: ${dirt}`, 16, 160);
  ctx.fillText(`Byggmaterial: ${selectedMaterial === "wood" ? "trä" : "jord"}`, 16, 186);
  ctx.fillText(`Bygg: B | Byt material: C`, 16, 212);
  ctx.fillText(`Kontroll: LS rörelse | A hoppa | X hugga | B bygg | Y byt`, 16, 238);

  if (gameOver) {
    ctx.fillStyle = "#111827";
    ctx.font = "bold 44px Trebuchet MS, sans-serif";
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

  player.x = clamp(player.x + player.vx, 0, world.width - player.w);
  player.y += player.vy;
  player.vy += world.gravity;

  const centerX = player.x + player.w / 2;
  const bottomY = player.y + player.h;
  let surfaceY = groundAt(centerX);

  if (player.vy >= 0) {
    placedBlocks.forEach((block) => {
      const withinX = centerX >= block.x && centerX <= block.x + block.size;
      const comingFromAbove = bottomY - player.vy <= block.y + 8;
      if (withinX && comingFromAbove) {
        surfaceY = Math.min(surfaceY, block.y);
      }
    });
  }

  if (player.y + player.h >= surfaceY) {
    player.y = surfaceY - player.h;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  if (player.attackTimer > 0) player.attackTimer -= 1;
  if (player.hitCooldown > 0) player.hitCooldown -= 1;
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
    }
  });

  return chopped;
}

function tryDigGround(attackBox) {
  const attackX = player.facing > 0 ? attackBox.x + attackBox.w : attackBox.x;
  const groundY = groundAt(attackX);
  const isCloseToGround = attackBox.y + attackBox.h >= groundY - 10;
  if (!isCloseToGround) return false;

  dirt += 1;
  groundCuts.push({
    x: clamp(attackX, 0, world.width),
    size: 22,
    ttl: 900,
  });

  if (groundCuts.length > 80) {
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
    if (block.material === "wood") wood += 1;
    else dirt += 1;
    return true;
  }

  return false;
}

function attack() {
  if (gameOver || player.attackTimer > 0) return;

  player.attackTimer = 12;
  const attackBox = {
    x: player.facing > 0 ? player.x + player.w : player.x - 28,
    y: player.y + 15,
    w: 28,
    h: 18,
  };

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

  const choppedTree = tryChopTree(attackBox);
  if (!choppedTree) {
    tryDigGround(attackBox);
  }
}

function toggleBuildMaterial() {
  selectedMaterial = selectedMaterial === "wood" ? "dirt" : "wood";
}

function placeBlock() {
  if (gameOver) return;

  const costResource = selectedMaterial === "wood" ? "wood" : "dirt";
  if (costResource === "wood" && wood <= 0) return;
  if (costResource === "dirt" && dirt <= 0) return;

  const forwardCenterX =
    player.facing > 0
      ? player.x + player.w + BLOCK_SIZE / 2
      : player.x - BLOCK_SIZE / 2;
  const nearFeetY = player.y + player.h - BLOCK_SIZE / 2;
  const blockX = clamp(
    Math.floor(forwardCenterX / BLOCK_SIZE) * BLOCK_SIZE,
    0,
    world.width - BLOCK_SIZE
  );
  const blockY = Math.floor(nearFeetY / BLOCK_SIZE) * BLOCK_SIZE;

  const candidate = {
    x: blockX,
    y: blockY,
    size: BLOCK_SIZE,
    material: selectedMaterial,
  };

  const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
  const blockBox = { x: candidate.x, y: candidate.y, w: candidate.size, h: candidate.size };
  if (intersects(playerBox, blockBox)) return;

  const overlapsExisting = placedBlocks.some(
    (block) => block.x === candidate.x && block.y === candidate.y
  );
  if (overlapsExisting) return;

  placedBlocks.push(candidate);
  if (costResource === "wood") wood -= 1;
  else dirt -= 1;
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

function handleGamepadInput() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = gamepads && gamepads[0];
  if (!pad) return;

  const horizontal = pad.axes[0] || 0;
  keys.left = horizontal < -0.25;
  keys.right = horizontal > 0.25;

  const jumpNow = !!pad.buttons[0]?.pressed; // A / Cross
  const buildNow = !!pad.buttons[1]?.pressed; // B / Circle
  const attackNow = !!pad.buttons[2]?.pressed; // X / Square
  const swapNow = !!pad.buttons[3]?.pressed; // Y / Triangle
  const timeNow = !!pad.buttons[9]?.pressed; // Start / Options

  if (jumpNow && !gamepadState.jumpPressed) jump();
  if (attackNow && !gamepadState.attackPressed) attack();
  if (buildNow && !gamepadState.buildPressed) placeBlock();
  if (swapNow && !gamepadState.swapPressed) toggleBuildMaterial();
  if (timeNow && !gamepadState.timePressed) toggleDayNight();

  gamepadState.jumpPressed = jumpNow;
  gamepadState.attackPressed = attackNow;
  gamepadState.buildPressed = buildNow;
  gamepadState.swapPressed = swapNow;
  gamepadState.timePressed = timeNow;
}

function gameLoop() {
  frameCount += 1;
  handleGamepadInput();
  updateDayNightAndSpawns();
  updateTimeToggleButton();
  updatePlayer();
  updateEnemies();
  updateGroundCuts();
  updateCamera();

  drawBackground(camera.x, camera.y);
  drawPlacedBlocks(camera.x, camera.y);
  drawTrees(camera.x, camera.y);
  drawPlayer(camera.x, camera.y);
  drawEnemies(camera.x, camera.y);
  drawHud();

  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "ArrowLeft") keys.left = true;
  if (event.code === "ArrowRight") keys.right = true;

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
});

if (timeToggleButton) {
  timeToggleButton.addEventListener("click", toggleDayNight);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
initializeTrees();
gameLoop();
