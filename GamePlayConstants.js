export const WORLD_CONFIG = {
  width: 5200,
  gravity: 0.62,
  baseGroundOffset: 95,
  dayLengthFrames: 2600,
};

export const TERRAIN_CONFIG = {
  hillFrequency: 0.0048,
  hillAmplitude: 70,
  mountainFrequency: 0.0019,
  mountainAmplitude: 110,
  mountainPhase: 0.6,
  valleyFrequency: 0.009,
  valleyAmplitude: 26,
  valleyPhase: 1.3,
};

export const PLAYER_CONFIG = {
  width: 40,
  height: 50,
  startX: 120,
  speed: 4.2,
  jumpForce: 13.5,
  maxHp: 8,
};

export const COMBAT_CONFIG = {
  attackDurationFrames: 12,
  attackBoxWidth: 28,
  attackBoxHeight: 18,
  attackBoxYOffset: 15,
  hitCooldownFrames: 45,
};

export const ENEMY_TYPE_CONFIGS = {
  zombie: {
    width: 38,
    height: 46,
    speed: 1.25,
    hp: 3,
    damage: 1,
  },
  skeleton: {
    width: 34,
    height: 44,
    speed: 1.95,
    hp: 2,
    damage: 1,
  },
  slime: {
    width: 38,
    height: 28,
    speed: 1.45,
    hp: 3,
    damage: 1,
  },
  brute: {
    width: 48,
    height: 56,
    speed: 0.92,
    hp: 5,
    damage: 2,
  },
};

export const NIGHT_WAVE_CONFIG = {
  count: 12,
  startX: 350,
  spacing: 390,
  types: ["zombie", "skeleton", "slime", "brute"],
};

export const ENEMY_BEHAVIOR_CONFIG = {
  randomTurnIntervalFrames: 320,
};
