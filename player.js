import { COMBAT_CONFIG, PLAYER_CONFIG, WORLD_CONFIG } from "./GamePlayConstants.js";
import { clamp } from "./terrain.js";

export function createPlayer(initialGroundY) {
  return {
    x: PLAYER_CONFIG.startX,
    y: initialGroundY - PLAYER_CONFIG.height,
    w: PLAYER_CONFIG.width,
    h: PLAYER_CONFIG.height,
    vx: 0,
    vy: 0,
    speed: PLAYER_CONFIG.speed,
    jumpForce: PLAYER_CONFIG.jumpForce,
    onGround: false,
    hp: PLAYER_CONFIG.maxHp,
    facing: 1,
    attackTimer: 0,
    hitCooldown: 0,
  };
}

export function updatePlayer(player, keys, groundAtFn, gameOver) {
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

  player.x = clamp(player.x + player.vx, 0, WORLD_CONFIG.width - player.w);
  player.y += player.vy;
  player.vy += WORLD_CONFIG.gravity;

  const centerX = player.x + player.w / 2;
  const groundY = groundAtFn(centerX);
  if (player.y + player.h >= groundY) {
    player.y = groundY - player.h;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  if (player.attackTimer > 0) player.attackTimer -= 1;
  if (player.hitCooldown > 0) player.hitCooldown -= 1;
}

export function jump(player, gameOver) {
  if (gameOver || !player.onGround) return;
  player.vy = -player.jumpForce;
  player.onGround = false;
}

export function startAttack(player, gameOver) {
  if (gameOver || player.attackTimer > 0) return false;
  player.attackTimer = COMBAT_CONFIG.attackDurationFrames;
  return true;
}

export function getAttackBox(player) {
  return {
    x:
      player.facing > 0
        ? player.x + player.w
        : player.x - COMBAT_CONFIG.attackBoxWidth,
    y: player.y + COMBAT_CONFIG.attackBoxYOffset,
    w: COMBAT_CONFIG.attackBoxWidth,
    h: COMBAT_CONFIG.attackBoxHeight,
  };
}
