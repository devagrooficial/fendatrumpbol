// Todas as constantes de tuning do jogo, centralizadas para calibração rápida.

export const GAME_NAME = 'Fenda do TrumpBol';

export const TRACK = {
  LANE_WIDTH: 2.2,
  LANE_XS: [-2.2, 0, 2.2] as const,
  LANE_CHANGE_DURATION_MS: 120,
};

export const JUMP = {
  INITIAL_VY: 9,
  GRAVITY: -25,
  DURATION_S: 0.72,
  MAX_HEIGHT: 1.6,
};

export const SLIDE = {
  DURATION_S: 0.6,
  HITBOX_HEIGHT_SCALE: 0.45,
  CANCEL_FALL_VY: -18,
};

export const RUN = {
  INITIAL_SPEED: 9,
  ACCELERATION: 0.15,
  MAX_SPEED: 32,
};

export const COLLISION = {
  PLAYER_HITBOX_SHRINK: 0.15,
  SIDE_SCRAPE_INVULN_S: 0.4,
};

export const CHUNK = {
  LENGTH: 30,
  ACTIVE_COUNT: 6,
  AHEAD_COUNT: 5,
  BEHIND_COUNT: 1,
};

export const DIFFICULTY = {
  STEP_DISTANCE: 500,
  // distância mínima percorrida para cada tier de dificuldade (1..5) entrar no sorteio
  UNLOCK_DISTANCES: [0, 500, 1200, 2200, 3500] as const,
};

export const POWERUP = {
  DURATION_S: 8,
  MAGNET_RADIUS: 4,
  MAGNET_PULL_SPEED: 12,
  BOOST_DURATION_S: 3,
  BOOST_FOV_FROM: 75,
  BOOST_FOV_TO: 88,
};

export const SCORE = {
  COIN_VALUE: 10,
  GEM_VALUE: 50,
};

export const PLAYER_JUICE = {
  LAND_SQUASH_SCALE: 0.72,
  TAKEOFF_STRETCH_SCALE: 1.18,
  IMPACT_DURATION_S: 0.15,
  LANE_LEAN_ANGLE: 0.22,
};

export const BIOME = {
  SWITCH_DISTANCE: 900,
};

// "Frente" do jogo é -Z (orientação padrão do three.js: câmera sem rotação
// olha para -Z). Isso evita o espelhamento esquerda/direita que apareceria
// se a câmera olhasse para +Z (a base +X deixaria de coincidir com a
// direita da tela).
export const CAMERA = {
  FOV: 75,
  OFFSET: { x: 0, y: 4.2, z: 6.5 },
  LOOK_AT_OFFSET: { x: 0, y: 1.2, z: -4 },
  FOLLOW_LERP_X: 0.12,
  NEAR: 0.1,
  FAR: 160,
};

export const FOG = {
  COLOR: 0x1a0e2e,
  DENSITY: 0.035,
};

export const CONTROLS = {
  SWIPE_MIN_PX: 30,
};

export const FIXED_TIMESTEP_S = 1 / 60;

export const STORAGE_KEYS = {
  HIGHSCORE: 'fendaneon.highscore',
  TOTAL_COINS: 'fendaneon.totalCoins',
  TOTAL_GEMS: 'fendaneon.totalGems',
  SOUND_ENABLED: 'fendaneon.soundEnabled',
  CHARACTER: 'fendaneon.character',
};

export const RANKING = {
  TABLE: 'leaderboard',
  TOP_LIMIT: 10,
  NAME_MAX_LENGTH: 20,
};
