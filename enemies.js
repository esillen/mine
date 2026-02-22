import {
  COMBAT_CONFIG,
  ENEMY_BEHAVIOR_CONFIG,
  ENEMY_TYPE_CONFIGS,
  NIGHT_WAVE_CONFIG,
  WORLD_CONFIG,
} from "./GamePlayConstants.js";
import { clamp } from "./terrain.js";

function intersects(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function createEnemy(type, x, direction, groundAtFn) {
  const config = ENEMY_TYPE_CONFIGS[type];
  const enemy = {
    type,
    x,
    w: config.width,
    h: config.height,
    vx: config.speed * direction,
    hp: config.hp,
    maxHp: config.hp,
    damage: config.damage,
    alive: true,
    y: 0,
  };
  enemy.y = groundAtFn(enemy.x + enemy.w / 2) - enemy.h;
  return enemy;
}

export function spawnNightWave(groundAtFn) {
  const spawned = [];
  for (let i = 0; i < NIGHT_WAVE_CONFIG.count; i += 1) {
    const type = NIGHT_WAVE_CONFIG.types[i % NIGHT_WAVE_CONFIG.types.length];
    const x = NIGHT_WAVE_CONFIG.startX + i * NIGHT_WAVE_CONFIG.spacing;
    const direction = i % 2 === 0 ? 1 : -1;
    spawned.push(createEnemy(type, x, direction, groundAtFn));
  }
  return spawned;
}

export function updateEnemies(enemies, player, groundAtFn, gameOver, frameCount) {
  if (gameOver) return;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    enemy.x += enemy.vx;
    enemy.x = clamp(enemy.x, 0, WORLD_CONFIG.width - enemy.w);
    enemy.y = groundAtFn(enemy.x + enemy.w / 2) - enemy.h;

    if (enemy.x <= 0 || enemy.x + enemy.w >= WORLD_CONFIG.width) {
      enemy.vx *= -1;
    }

    if ((frameCount + Math.floor(enemy.x)) % ENEMY_BEHAVIOR_CONFIG.randomTurnIntervalFrames === 0) {
      enemy.vx *= -1;
    }

    if (intersects(player, enemy) && player.hitCooldown <= 0) {
      player.hp -= enemy.damage;
      player.hitCooldown = COMBAT_CONFIG.hitCooldownFrames;
    }
  }
}

export function applyPlayerAttack(enemies, attackBox) {
  let defeatedDelta = 0;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (!intersects(attackBox, enemy)) continue;

    enemy.hp -= 1;
    enemy.vx *= -1;
    if (enemy.hp <= 0) {
      enemy.alive = false;
      defeatedDelta += 1;
    }
  }

  return defeatedDelta;
}
