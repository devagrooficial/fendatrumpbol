// Todas as constantes de tuning da simulação, centralizadas para calibração
// rápida (spec seção 3.4). Puro dado — nada aqui pode depender de DOM.

export const FIXED_TIMESTEP_S = 1 / 60;

export const FIELD = {
  WIDTH: 1200,
  HEIGHT: 800,
  GOAL_OPENING: 220, // altura da boca do gol, centralizada verticalmente
  GOAL_DEPTH: 50, // profundidade da área do gol (marcação visual + referência de regra)
  CENTER_CIRCLE_RADIUS: 130,
  // Faixa fora do campo (além de cada linha de fundo, do lado de cada gol)
  // reservada pra câmera sempre enquadrar as placas de anúncio de
  // perímetro — não é espaço jogável, só de apresentação (ver camera.ts e
  // ads/slots.ts). Fica na lateral (eixo X) pra não consumir espaço
  // vertical em cima/embaixo do campo.
  APRON_X: 380,
};

export const PHYS = {
  PLAYER_RADIUS: 30,
  PLAYER_MASS: 3,
  PLAYER_ACCEL: 2400, // u/s²
  PLAYER_MAX_SPEED: 430, // u/s
  PLAYER_DRAG: 6.0, // vel *= exp(-DRAG*dt)
  PLAYER_RESTITUTION: 0.55, // jogador x jogador

  BALL_RADIUS: 17,
  BALL_MASS: 1,
  BALL_DRAG: 0.55,
  BALL_MAX_SPEED: 1500,
  BALL_WALL_RESTITUTION: 0.78,
  BALL_PLAYER_RESTITUTION: 0.92,

  KICK_MIN_IMPULSE: 620,
  KICK_MAX_IMPULSE: 1450,
  KICK_CHARGE_TIME: 0.55, // segundos até carga máxima
  KICK_RANGE: 62, // distância centro-a-centro para o chute pegar
  KICK_ARC: Math.PI * 0.75, // cone de alcance à frente do jogador
  KICK_COOLDOWN: 0.35,

  DASH_IMPULSE: 950,
  DASH_DURATION: 0.16,
  DASH_COOLDOWN: 2.5,
  DASH_STUN_ON_HIT: 0.4, // stun aplicado no adversário atingido

  // Turbo (botão separado do dash): enquanto segurado e com combustível,
  // aumenta aceleração/velocidade máxima — diferente do dash (impulso
  // instantâneo com stun em quem é atingido), isso é corrida sustentada.
  // O combustível (Player.boostStamina, 0..1) drena em BOOST_DRAIN_S
  // segundos de uso contínuo e recarrega sozinho, mais devagar
  // (BOOST_REGEN_S), quando não está em uso — pra ser "usar de vez em
  // quando", não um botão de correr sempre mais rápido.
  BOOST_SPEED_MULT: 1.35,
  BOOST_ACCEL_MULT: 1.2,
  BOOST_DRAIN_S: 1.5,
  BOOST_REGEN_S: 3,
};

// Replay de gol (seção 8): últimos REPLAY_CONTENT_S segundos de conteúdo
// gravado, tocados em REPLAY_SPEED da velocidade original.
export const REPLAY = {
  BUFFER_SECONDS: 8, // quanto o buffer circular guarda pra trás (seção 8)
  CONTENT_SECONDS: 3, // quanto do buffer vira o replay de gol
  SPEED: 0.6,
  MAX_SAVED: 5,
};

export const MATCH = {
  DURATION_MS: 4 * 60 * 1000,
  GOALS_TO_WIN: 7,
  GOAL_FREEZE_MS: 1200,
  // A seção 4 da spec diz "replay automático (2,5s)", mas a seção 8 pede
  // 3s de conteúdo a 0.6x — 3s de conteúdo a 0.6x levam 5s de relógio pra
  // tocar (3/0.6), não 2.5s. Como a seção 8 é específica sobre o replay em
  // si (o pilar "feedback exagerado" da seção 0), segui ela e derivei essa
  // constante a partir de REPLAY.CONTENT_SECONDS/REPLAY.SPEED, em vez do
  // número solto da seção 4. Documentado aqui pra não parecer descuido.
  GOAL_REPLAY_MS: (REPLAY.CONTENT_SECONDS / REPLAY.SPEED) * 1000,
  KICKOFF_COUNTDOWN_MS: 1500,
  OVERTIME_MS: 60 * 1000,
  MAX_STEPS_PER_FRAME: 5, // evita espiral da morte com a aba em background
  // Aviso de reta final (pedido depois de jogar: "queria um aviso de que
  // está chegando aos 20 segundos finais") — dispara uma vez quando
  // timeLeftMs cruza esse limiar (ver simulation.ts: evento
  // 'finalCountdown'), vale tanto pro tempo normal quanto pra prorrogação.
  FINAL_COUNTDOWN_MS: 20 * 1000,
};

// Anti-degenerescência (seção 3.6): bola "morta" num canto trava a partida.
export const STALL = {
  SPEED_THRESHOLD: 8, // u/s
  TIME_THRESHOLD_S: 4,
  PROXIMITY_MARGIN: 20, // u além da soma dos raios pra contar como "perto"
  NUDGE_SPEED: 120, // u/s do empurrão em direção ao centro do campo
};
