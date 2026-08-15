// Todas as constantes de tuning do Fly Simulator, centralizadas para calibração rápida.

export const GAME_NAME = 'Fly Simulator';

export const FIXED_TIMESTEP_S = 1 / 60;

export const FLIGHT = {
  THROTTLE_ACCEL: 14, // m/s^2 no manete máximo
  THROTTLE_RATE: 0.6, // fração de manete por segundo ao segurar +/-
  DRAG_COEFFICIENT: 0.012, // arrasto quadrático
  GRAVITY: 9.8,
  MIN_SPEED: 0,
  MAX_SPEED: 62,
  STALL_SPEED: 16, // abaixo disso a sustentação começa a cair
  STALL_MAX_PITCH_BIAS: 1.4, // rad/s de nariz-para-baixo forçado em estol total
  STALL_MAX_SINK_SPEED: 9, // m/s extra de queda em estol total
  PITCH_RATE: 1.1, // rad/s no manche todo pra frente/trás
  ROLL_RATE: 2.0, // rad/s no manche todo pra os lados
  YAW_RATE: 0.6, // rad/s no leme
  TURN_RATE_FROM_ROLL: 0.9, // guinada induzida pela inclinação (curva coordenada)
  PITCH_LIMIT: 1.15, // ~66°, evita looping instável
  ROLL_DAMPING: 2.2, // retorno automático do rolamento quando solto
  MAX_CLIMB_ANGLE_FOR_SPEED: 0.05, // afeta o quanto o ângulo de subida contribui na vel. vertical
};

export const AIRCRAFT = {
  START_ALTITUDE: 60,
  START_THROTTLE: 0.55,
  GROUND_CLEARANCE: 1.4, // altura do trem de pouso até o centro da fuselagem
  CRASH_MAX_SAFE_SPEED: 26, // acima disso, tocar o chão sempre é fatal
  LANDING_MAX_SPEED: 24,
  LANDING_MAX_SINK_SPEED: 6,
  PROPELLER_SPIN_SPEED: 28, // rad/s por unidade de manete
};

export const CAMERA = {
  FOV: 70,
  NEAR: 0.5,
  FAR: 3200,
  OFFSET: { x: 0, y: 3.2, z: 11 },
  LOOK_AHEAD: 8,
  FOLLOW_LERP: 0.08,
  ROTATE_LERP: 0.06,
};

export const TERRAIN = {
  SIZE: 4000,
  SEGMENTS: 200,
  BASE_FREQUENCY: 0.0022,
  BASE_AMPLITUDE: 130,
  DETAIL_FREQUENCY: 0.012,
  DETAIL_AMPLITUDE: 16,
  WATER_LEVEL: -8,
  ZONE_WARP_FREQUENCY: 0.0009,
  ZONE_WARP_STRENGTH: 0.8,
};

export const AIRSTRIP = {
  CENTER_X: 0,
  CENTER_Z: 40,
  LENGTH: 220,
  WIDTH: 22,
  ELEVATION: 4,
  BLEND_MARGIN: 60,
};

export const SCENERY = {
  TREE_COUNT: 900,
  ROCK_COUNT: 260,
  SCATTER_RADIUS: 1900,
  MIN_DISTANCE_FROM_ORIGIN: 90,
};

export const CHECKPOINT = {
  COUNT: 8,
  RADIUS: 14,
  TOUR_RADIUS_MIN: 260,
  TOUR_RADIUS_MAX: 900,
  ALTITUDE_MIN: 40,
  ALTITUDE_MAX: 320,
  VALUE: 250,
  FUEL_BONUS_S: 14,
};

export const FUEL = {
  START_S: 90,
  LANDING_BONUS_S: 20,
};

export const SCORE = {
  DISTANCE_PER_POINT: 4,
  LANDING_BONUS: 400,
};

export const CONTROLS = {
  JOYSTICK_RADIUS_PX: 55,
  JOYSTICK_DEADZONE: 0.08,
};

export const FOG = {
  COLOR: 0x8fc7ff,
  NEAR: 400,
  FAR: 2600,
};

export const STORAGE_KEYS = {
  HIGHSCORE: 'flysim.highscore',
  SOUND_ENABLED: 'flysim.soundEnabled',
};
