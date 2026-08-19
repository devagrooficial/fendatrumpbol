import { describe, expect, it } from 'vitest';
import {
  resolveCircleCollision,
  resolveWallCollision,
  stepDash,
  stepKick,
  stepPlayerMovement,
  type CircleBody,
} from '../core/physics';
import { PHYS, FIELD } from '../core/constants';
import type { Ball, Player } from '../core/types';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'teamA-0',
    teamId: 'teamA',
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    radius: PHYS.PLAYER_RADIUS,
    facing: 0,
    kickCharge: 0,
    kickCooldown: 0,
    dashCooldown: 0,
    dashTimer: 0,
    stunTimer: 0,
    kickHeldPrev: false,
    boostStamina: 1,
    ...overrides,
  };
}

function makeBall(overrides: Partial<Ball> = {}): Ball {
  return {
    pos: { x: PHYS.KICK_RANGE - 5, y: 0 },
    vel: { x: 0, y: 0 },
    radius: PHYS.BALL_RADIUS,
    lastTouchedBy: null,
    stallTimer: 0,
    ...overrides,
  };
}

const DT = 1 / 60;

describe('colisão círculo-círculo', () => {
  it('conserva o momento total (massas iguais, corpos sobrepostos)', () => {
    const a: CircleBody = { pos: { x: 0, y: 0 }, vel: { x: 100, y: 0 }, radius: 30, mass: 3 };
    const b: CircleBody = { pos: { x: 55, y: 0 }, vel: { x: -50, y: 0 }, radius: 30, mass: 3 };

    const momentumBefore = a.mass * a.vel.x + b.mass * b.vel.x;
    const result = resolveCircleCollision(a, b, 0.55);
    const momentumAfter = a.mass * result.a.vel.x + b.mass * result.b.vel.x;

    expect(result.collided).toBe(true);
    expect(momentumAfter).toBeCloseTo(momentumBefore, 6);
  });

  it('conserva o momento total (massas diferentes, ex.: jogador x bola)', () => {
    const a: CircleBody = { pos: { x: 0, y: 0 }, vel: { x: 200, y: 0 }, radius: 30, mass: PHYS.PLAYER_MASS };
    const b: CircleBody = { pos: { x: 44, y: 0 }, vel: { x: 0, y: 0 }, radius: 17, mass: PHYS.BALL_MASS };

    const momentumBefore = a.mass * a.vel.x + b.mass * b.vel.x;
    const result = resolveCircleCollision(a, b, PHYS.BALL_PLAYER_RESTITUTION);
    const momentumAfter = a.mass * result.a.vel.x + b.mass * result.b.vel.x;

    expect(result.collided).toBe(true);
    expect(momentumAfter).toBeCloseTo(momentumBefore, 6);
  });

  it('não colide quando os corpos não se sobrepõem', () => {
    const a: CircleBody = { pos: { x: 0, y: 0 }, vel: { x: 1, y: 0 }, radius: 10, mass: 1 };
    const b: CircleBody = { pos: { x: 100, y: 0 }, vel: { x: -1, y: 0 }, radius: 10, mass: 1 };
    const result = resolveCircleCollision(a, b, 0.5);
    expect(result.collided).toBe(false);
  });
});

describe('colisão com parede', () => {
  it('reflete a velocidade normal ao bater no teto, escalada pelo restitution', () => {
    const body = resolveWallCollision(
      { pos: { x: 600, y: 5 }, vel: { x: 0, y: -100 }, radius: 17 },
      PHYS.BALL_WALL_RESTITUTION,
    );
    expect(body.pos.y).toBeCloseTo(17, 5);
    expect(body.vel.y).toBeCloseTo(100 * PHYS.BALL_WALL_RESTITUTION, 5);
  });

  it('deixa passar pela boca do gol até o fundo da rede', () => {
    const body = resolveWallCollision(
      { pos: { x: -5, y: FIELD.HEIGHT / 2 }, vel: { x: -50, y: 0 }, radius: 17 },
      PHYS.BALL_WALL_RESTITUTION,
    );
    // Dentro da boca do gol (y no meio do campo) não deveria ter sido
    // rebatido ainda, pois -5 > -GOAL_DEPTH.
    expect(body.pos.x).toBeCloseTo(-5, 5);
    expect(body.vel.x).toBeCloseTo(-50, 5);
  });
});

describe('movimento do jogador', () => {
  it('nunca ultrapassa PLAYER_MAX_SPEED sob input constante', () => {
    let player = makePlayer();
    for (let i = 0; i < 600; i++) {
      player = stepPlayerMovement(player, { x: 1, y: 0 }, false, DT);
    }
    const speed = Math.hypot(player.vel.x, player.vel.y);
    expect(speed).toBeLessThanOrEqual(PHYS.PLAYER_MAX_SPEED + 1e-6);
  });

  it('facing acompanha a direção do movimento e se mantém quando parado', () => {
    let player = makePlayer({ facing: 0 });
    player = stepPlayerMovement(player, { x: 0, y: 1 }, false, DT);
    expect(player.facing).toBeCloseTo(Math.PI / 2, 5);

    const facingAfterMove = player.facing;
    player = stepPlayerMovement(player, { x: 0, y: 0 }, false, DT);
    expect(player.facing).toBe(facingAfterMove);
  });

  it('jogador atordoado (stunTimer > 0) não acelera com o input', () => {
    const player = makePlayer({ stunTimer: 1, vel: { x: 0, y: 0 } });
    const next = stepPlayerMovement(player, { x: 1, y: 0 }, false, DT);
    expect(next.vel.x).toBe(0);
  });
});

describe('turbo (boost)', () => {
  it('segurando o boost com combustível, ultrapassa PLAYER_MAX_SPEED até o limite do turbo', () => {
    // Só ticks o bastante pra atingir o teto de velocidade (o clamp já
    // segura isso em poucos ticks) sem esgotar BOOST_DRAIN_S de combustível
    // — senão o turbo desliga sozinho no meio do teste e o resultado deixa
    // de refletir "boostando o tempo todo".
    let player = makePlayer();
    const ticks = Math.floor(PHYS.BOOST_DRAIN_S / DT) - 10;
    for (let i = 0; i < ticks; i++) {
      player = stepPlayerMovement(player, { x: 1, y: 0 }, true, DT);
    }
    const speed = Math.hypot(player.vel.x, player.vel.y);
    expect(speed).toBeGreaterThan(PHYS.PLAYER_MAX_SPEED);
    expect(speed).toBeLessThanOrEqual(PHYS.PLAYER_MAX_SPEED * PHYS.BOOST_SPEED_MULT + 1e-6);
  });

  it('drena o combustível enquanto boosta em movimento e recarrega quando solta', () => {
    let player = makePlayer({ boostStamina: 1 });
    player = stepPlayerMovement(player, { x: 1, y: 0 }, true, DT);
    expect(player.boostStamina).toBeCloseTo(1 - DT / PHYS.BOOST_DRAIN_S, 5);

    const drained = player.boostStamina;
    player = stepPlayerMovement(player, { x: 1, y: 0 }, false, DT);
    expect(player.boostStamina).toBeGreaterThan(drained);
  });

  it('sem combustível, segurar o boost não ultrapassa PLAYER_MAX_SPEED', () => {
    let player = makePlayer({ boostStamina: 0 });
    for (let i = 0; i < 600; i++) {
      player = stepPlayerMovement(player, { x: 1, y: 0 }, true, DT);
    }
    const speed = Math.hypot(player.vel.x, player.vel.y);
    expect(speed).toBeLessThanOrEqual(PHYS.PLAYER_MAX_SPEED + 1e-6);
  });

  it('segurar o boost parado (sem input de movimento) não gasta combustível', () => {
    const player = makePlayer({ boostStamina: 1 });
    const next = stepPlayerMovement(player, { x: 0, y: 0 }, true, DT);
    expect(next.boostStamina).toBe(1);
  });

  it('jogador atordoado não boosta mesmo segurando o botão', () => {
    const player = makePlayer({ stunTimer: 1, boostStamina: 1 });
    const next = stepPlayerMovement(player, { x: 1, y: 0 }, true, DT);
    expect(next.vel.x).toBe(0);
  });
});

describe('chute', () => {
  it('carga máxima aplica o impulso máximo (dentro da tolerância de 1 tick)', () => {
    let player = makePlayer();
    let ball = makeBall();
    const steps = Math.ceil(PHYS.KICK_CHARGE_TIME / DT) + 5;

    for (let i = 0; i < steps; i++) {
      ({ player, ball } = stepKick(player, ball, true, DT));
    }
    ({ player, ball } = stepKick(player, ball, false, DT));

    const speed = Math.hypot(ball.vel.x, ball.vel.y);
    expect(speed).toBeCloseTo(PHYS.KICK_MAX_IMPULSE, 1);
    expect(ball.lastTouchedBy).toBe('teamA-0');
  });

  it('toque curto aplica bem menos impulso que a carga máxima', () => {
    let shortPlayer = makePlayer();
    let shortBall = makeBall();
    ({ player: shortPlayer, ball: shortBall } = stepKick(shortPlayer, shortBall, true, DT));
    ({ player: shortPlayer, ball: shortBall } = stepKick(shortPlayer, shortBall, false, DT));
    const shortSpeed = Math.hypot(shortBall.vel.x, shortBall.vel.y);

    let longPlayer = makePlayer();
    let longBall = makeBall();
    const steps = Math.ceil(PHYS.KICK_CHARGE_TIME / DT) + 5;
    for (let i = 0; i < steps; i++) {
      ({ player: longPlayer, ball: longBall } = stepKick(longPlayer, longBall, true, DT));
    }
    ({ player: longPlayer, ball: longBall } = stepKick(longPlayer, longBall, false, DT));
    const longSpeed = Math.hypot(longBall.vel.x, longBall.vel.y);

    expect(shortSpeed).toBeGreaterThanOrEqual(PHYS.KICK_MIN_IMPULSE - 1);
    expect(shortSpeed).toBeLessThan(longSpeed);
  });

  it('bola exatamente no centro do jogador (distância zero) ainda conecta', () => {
    let player = makePlayer({ facing: 0 });
    let ball = makeBall({ pos: { x: 0, y: 0 } }); // mesma posição do jogador
    ({ player, ball } = stepKick(player, ball, true, DT));
    ({ player, ball } = stepKick(player, ball, false, DT));
    expect(Math.hypot(ball.vel.x, ball.vel.y)).toBeGreaterThan(0);
  });

  it('bola fora do alcance/cone não recebe impulso', () => {
    let player = makePlayer();
    let ball = makeBall({ pos: { x: PHYS.KICK_RANGE + 100, y: 0 } });
    ({ player, ball } = stepKick(player, ball, true, DT));
    ({ player, ball } = stepKick(player, ball, false, DT));
    expect(ball.vel.x).toBe(0);
    expect(ball.vel.y).toBe(0);
  });

  it('respeita o cooldown: não chuta de novo antes de KICK_COOLDOWN passar', () => {
    let player = makePlayer();
    let ball = makeBall();
    ({ player, ball } = stepKick(player, ball, true, DT));
    ({ player, ball } = stepKick(player, ball, false, DT)); // dispara, entra em cooldown
    const speedAfterFirstKick = Math.hypot(ball.vel.x, ball.vel.y);

    ({ player, ball } = stepKick(player, ball, true, DT));
    ({ player, ball } = stepKick(player, ball, false, DT)); // ainda em cooldown, não dispara de novo

    const speedAfterSecondAttempt = Math.hypot(ball.vel.x, ball.vel.y);
    expect(speedAfterSecondAttempt).toBeCloseTo(speedAfterFirstKick, 5);
  });
});

describe('dash', () => {
  it('aplica um impulso na direção do facing e entra em cooldown', () => {
    const player = makePlayer({ facing: 0 });
    const next = stepDash(player, true);
    expect(next.vel.x).toBeCloseTo(PHYS.DASH_IMPULSE, 5);
    expect(next.dashCooldown).toBe(PHYS.DASH_COOLDOWN);
    expect(next.dashTimer).toBe(PHYS.DASH_DURATION);
  });

  it('não dispara de novo enquanto em cooldown', () => {
    const player = makePlayer({ dashCooldown: 1 });
    const next = stepDash(player, true);
    expect(next.vel.x).toBe(0);
    expect(next.vel.y).toBe(0);
  });

  it('jogador atordoado não consegue dashar', () => {
    const player = makePlayer({ stunTimer: 0.2 });
    const next = stepDash(player, true);
    expect(next.vel.x).toBe(0);
  });
});
