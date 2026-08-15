// Modelo arcade puro (sem THREE.js) — sustentação/arrasto/estol simplificados,
// testável isoladamente. `Aircraft` integra orientação e posição em cima disso.

export type FlightConfig = {
  throttleAccel: number;
  dragCoefficient: number;
  gravity: number;
  minSpeed: number;
  maxSpeed: number;
  stallSpeed: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Integra a velocidade no ar um passo: empuxo do manete menos arrasto quadrático menos componente da gravidade ao longo da trajetória (subir freia, mergulhar acelera). */
export function integrateAirspeed(
  airspeed: number,
  throttle: number,
  pitch: number,
  dt: number,
  cfg: FlightConfig,
): number {
  const thrust = cfg.throttleAccel * clamp(throttle, 0, 1);
  const drag = cfg.dragCoefficient * airspeed * airspeed;
  const gravityAlongPath = cfg.gravity * Math.sin(pitch);
  const next = airspeed + (thrust - drag - gravityAlongPath) * dt;
  return clamp(next, cfg.minSpeed, cfg.maxSpeed);
}

/** 1 = sustentação plena, 0 = estol total. Cai linearmente abaixo da velocidade de estol. */
export function stallFactor(airspeed: number, stallSpeed: number): number {
  if (stallSpeed <= 0) return 1;
  return clamp(airspeed / stallSpeed, 0, 1);
}

/** Nariz-para-baixo forçado quando em estol — o jogador precisa mergulhar pra recuperar velocidade. */
export function stallPitchBias(factor: number, maxBiasRate: number): number {
  return (1 - factor) * maxBiasRate;
}

/** Afundamento extra (além da trajetória normal) quando em estol. */
export function stallSinkRate(factor: number, maxSinkSpeed: number): number {
  return (1 - factor) * maxSinkSpeed;
}

/** Guinada induzida pela inclinação — aproxima uma curva coordenada sem física de força completa. */
export function turnRateFromRoll(roll: number, turnRateFactor: number): number {
  return Math.sin(roll) * turnRateFactor;
}

/** Reduz um ângulo (rad) para (-π, π] — evita crescimento sem limite e faz o auto-nivelamento decair pro lado mais perto em vez de sempre voltar pro zero "absoluto". */
export function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let wrapped = angle % twoPi;
  if (wrapped > Math.PI) wrapped -= twoPi;
  if (wrapped <= -Math.PI) wrapped += twoPi;
  return wrapped;
}
