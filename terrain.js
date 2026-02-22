import { TERRAIN_CONFIG, WORLD_CONFIG } from "./GamePlayConstants.js";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getBaseGroundY(canvasHeight) {
  return canvasHeight - WORLD_CONFIG.baseGroundOffset;
}

export function groundAt(worldX, baseGroundY) {
  const x = clamp(worldX, 0, WORLD_CONFIG.width);
  const hills = Math.sin(x * TERRAIN_CONFIG.hillFrequency) * TERRAIN_CONFIG.hillAmplitude;
  const mountains =
    Math.sin(x * TERRAIN_CONFIG.mountainFrequency + TERRAIN_CONFIG.mountainPhase) *
    TERRAIN_CONFIG.mountainAmplitude;
  const valleys =
    Math.sin(x * TERRAIN_CONFIG.valleyFrequency + TERRAIN_CONFIG.valleyPhase) *
    TERRAIN_CONFIG.valleyAmplitude;
  return baseGroundY + hills + mountains + valleys;
}

export function getCameraX(playerX, canvasWidth) {
  const target = playerX - canvasWidth / 2;
  return clamp(target, 0, WORLD_CONFIG.width - canvasWidth);
}
