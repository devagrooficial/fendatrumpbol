# FutTrool — Especificação Técnica (Jogo de Futebol 1v1 Top-Down)

Codinome original do documento: `arena-1v1`. Nome do jogo no hub: **FutTrool**.

Entrega 1: 1 jogador vs. IA, 3 níveis de dificuldade, offline.
Entrega 2 (futura): multiplayer online 1v1 autoritativo em servidor.
Requisito transversal: espaços de propaganda / logo integrados ao campo e às telas.

> Nota de adaptação ao repositório: este documento foi escrito originalmente
> pensando num monorepo `pnpm` (`packages/core` + `apps/web`). Este projeto
> **não** é um monorepo — é um site Vite multi-página único (ver
> `../../../README.md`). A estrutura de pastas foi adaptada em
> `docs/NOTES.md`, que é quem manda sobre organização de arquivos. Este
> arquivo continua sendo a fonte da verdade sobre regras de jogo, física,
> IA, economia e publicidade.

## 0. Pilares do produto

- Partida curta e viciante — 3 minutos, resultado imediato, botão "Mais uma!" sempre à mão.
- Controle simples, teto alto — dois inputs (mover + chutar), mas com carga de chute, dash e leitura de trajetória que separam o iniciante do experiente.
- Feedback exagerado — screen shake, partículas, replay automático de gol, som.
- Pronto para monetizar — inventário de espaços publicitários definido desde o dia 1, não improvisado depois.
- Núcleo portável para online — a simulação nasce determinística e sem DOM, para a entrega 2 ser adição, não reescrita.

## 1. Stack recomendada (original) vs. stack real deste repo

A tabela abaixo é a recomendação original do documento. A coluna da direita é o que de fato usamos aqui — ver `docs/NOTES.md` para a decisão completa.

| Camada | Recomendação original | Neste repo |
|---|---|---|
| Linguagem | TypeScript (strict) | TypeScript strict (já configurado em `tsconfig.json`) |
| Renderização | Canvas 2D puro | Canvas 2D puro (igual à recomendação — sem engine) |
| Build | Vite | Vite (já é o bundler do repo, multi-página) |
| Estado de UI | React ou componentes leves | DOM/HTML leve, sem framework (padrão dos outros jogos do hub) |
| Áudio | Howler.js ou Web Audio nativo | Web Audio nativo (padrão do repo, ver `flysim/core/Audio.ts`) |
| Persistência (entrega 1) | localStorage atrás de `StorageAdapter` | Igual |
| Testes | Vitest | Vitest (já configurado, `npm run test`) |
| Monorepo | pnpm workspaces (`packages/core` + `apps/web`) | Não aplicável — pasta única `src/futtrool/` dentro do site existente |

Regra de ouro (mantida): `src/futtrool/core` não pode importar `window`, `document`, `canvas`, `Math.random` direto ou `Date.now()`. Só recebe `tick`, `commands[]` e um RNG com seed. É isso que permite rodar a mesma simulação no servidor depois.

## 2. Estrutura de pastas (adaptada — ver docs/NOTES.md para a versão definitiva)

Estrutura original do documento (monorepo pnpm), mantida aqui só como referência de nomenclatura interna — **não é a estrutura real usada neste repo**:

```
arena-1v1/
├─ packages/core/               # simulação pura, testável, sem DOM
│  ├─ src/constants.ts
│  ├─ src/types.ts
│  ├─ src/rng.ts
│  ├─ src/physics.ts
│  ├─ src/rules.ts
│  ├─ src/simulation.ts
│  └─ src/ai/{profiles,perception,brain}.ts
├─ apps/web/
│  ├─ src/main.ts
│  ├─ src/loop.ts
│  ├─ src/render/{renderer,camera,ads,fx}.ts
│  ├─ src/input/{joystick,keyboard}.ts
│  ├─ src/ui/
│  ├─ src/replay/
│  ├─ src/audio/
│  └─ src/progression/
```

## 3. Simulação — núcleo

### 3.1 Loop
- Fixed timestep de 60 Hz (`dt = 1/60`), com accumulator. Render interpola entre o estado anterior e o atual (fator `alpha`).
- `simulation.step(state, commandsByPlayer, dt)` é uma função pura: mesmo estado + mesmos comandos = mesmo resultado. Sem exceção.
- Máximo de 5 steps por frame para evitar espiral da morte em aba em background.

### 3.2 Entidades

```ts
type Vec2 = { x: number; y: number };

type Player = {
  id: 'p1' | 'p2';
  pos: Vec2; vel: Vec2;
  radius: number;
  facing: number;          // radianos, usado para o chute
  kickCharge: number;      // 0..1
  kickCooldown: number;    // segundos
  dashCooldown: number;
  stunTimer: number;       // após levar dash
};

type Ball = { pos: Vec2; vel: Vec2; radius: number; lastTouchedBy: 'p1'|'p2'|null };

type GameState = {
  tick: number;
  phase: 'kickoff' | 'playing' | 'goal' | 'ended';
  timeLeftMs: number;
  score: { p1: number; p2: number };
  players: Record<'p1'|'p2', Player>;
  ball: Ball;
  rngState: number;
};
```

`Command` é o único input aceito pela simulação — é isso que vai virar pacote de rede depois:

```ts
type Command = {
  tick: number;
  move: Vec2;        // vetor normalizado, magnitude 0..1
  kickHeld: boolean; // segurar carrega, soltar chuta
  dash: boolean;
};
```

### 3.3 Campo
- Dimensões em unidades de mundo: 1200 × 800. A câmera escala para a tela; nada de calcular física em pixels.
- Gol: abertura de 220 centralizada na vertical, profundidade 50, um em cada lado (x=0 e x=1200).
- Paredes: bordas superior/inferior e as laterais fora da abertura do gol.
- Círculo central raio 130, usado só como referência visual e para o kickoff.

### 3.4 Constantes de física (ponto de partida — todas em `constants.ts` para tuning)

```ts
export const PHYS = {
  PLAYER_RADIUS: 30,
  PLAYER_MASS: 3,
  PLAYER_ACCEL: 2400,          // u/s²
  PLAYER_MAX_SPEED: 430,       // u/s
  PLAYER_DRAG: 6.0,            // vel *= exp(-DRAG*dt)
  PLAYER_RESTITUTION: 0.55,    // jogador x jogador

  BALL_RADIUS: 17,
  BALL_MASS: 1,
  BALL_DRAG: 0.55,
  BALL_MAX_SPEED: 1500,
  BALL_WALL_RESTITUTION: 0.78,
  BALL_PLAYER_RESTITUTION: 0.92,

  KICK_MIN_IMPULSE: 620,
  KICK_MAX_IMPULSE: 1450,
  KICK_CHARGE_TIME: 0.55,      // segundos até carga máxima
  KICK_RANGE: 62,              // distância centro-a-centro para o chute pegar
  KICK_ARC: Math.PI * 0.75,    // cone de alcance à frente do jogador
  KICK_COOLDOWN: 0.35,

  DASH_IMPULSE: 950,
  DASH_DURATION: 0.16,
  DASH_COOLDOWN: 2.5,
  DASH_STUN_ON_HIT: 0.4,       // stun aplicado no adversário atingido
};
```

### 3.5 Colisões
- Círculo × círculo (jogador-jogador, jogador-bola): separação por sobreposição proporcional à massa + impulso ao longo da normal com o restitution correspondente. Nada de "teleportar" a bola.
- Círculo × parede (AABB): reflexão do componente normal × restitution, com clamp de posição.
- Detecção de gol: quando `ball.pos.x - ball.radius < LINHA_ESQ` (ou `> LINHA_DIR`) e o `y` estiver dentro da abertura → gol. Testar contra o segmento percorrido no tick (swept test), senão a bola rápida atravessa a linha entre frames.
- Chute ≠ colisão: ao soltar o botão, se a bola estiver dentro de `KICK_RANGE` e dentro do cone `KICK_ARC` na direção `facing`, aplica impulso na direção `facing` proporcional à carga. Isso dá controle intencional, diferente de só empurrar a bola.

### 3.6 Anti-degenerescência
- Se a bola ficar com velocidade < 8 u/s por mais de 4 s e nenhum jogador encostar nela, aplicar um leve empurrão para o centro ou reposicionar (evita partida travada no canto).
- Limitar velocidade dos jogadores contra a parede para não "grudar".

## 4. Regras da partida

| Regra | Valor |
|---|---|
| Duração | 3:00 (cronômetro regressivo) |
| Fim antecipado | Primeiro a 4 gols encerra a partida |
| Após gol | Congela 1,2 s → replay automático (2,5 s) → kickoff |
| Kickoff | Jogadores nas posições iniciais, bola no centro, contagem de 1,5 s com input bloqueado |
| Empate no fim | Prorrogação de 60 s em morte súbita; persistindo o empate, a partida termina empatada (pênaltis ficam como opcional futuro) |
| Placar visual | Indicadores de 4 pontos por lado (como na referência), preenchendo a cada gol |

## 5. IA — 3 níveis de dificuldade

A IA não tem acesso privilegiado ao estado: ela consome o mesmo `GameState` e devolve um `Command`. Isso mantém o jogo justo e permite reaproveitar a IA como preenchimento de partida no modo online.

### 5.1 Arquitetura
Percepção → Decisão (FSM) → Comando, com um tempo de reação que atrasa artificialmente a percepção: a IA lê um snapshot do estado de `reactionMs` atrás (buffer circular). É o que faz um nível parecer humano em vez de robótico.

Estados da máquina:

```
KICKOFF → CHASE (perseguir bola)
        → INTERCEPT (ir ao ponto de interceptação previsto)
        → ATTACK (posicionar para chutar ao gol)
        → DEFEND (ficar na linha entre bola e gol próprio)
        → RECOVER (voltar à posição após ser driblado)
        → CELEBRATE (pós-gol, sem input)
```

Transições por avaliação a cada 100 ms: distância à bola vs. distância do adversário à bola, posição da bola no campo (terço defensivo / meio / ofensivo), placar e tempo restante.

### 5.2 Cálculos-chave
- Ponto de interceptação: simular a trajetória da bola por `predictionHorizon` segundos (com drag) e achar o primeiro instante `t` em que `distância(aiPos, ballPos(t)) <= aiMaxSpeed * t`. Vai até esse ponto, não até onde a bola está.
- Mira do chute: direção alvo = ponto do gol adversário mais distante do defensor, com desvio aleatório de `aimErrorDeg`.
- Uso do dash: ao interceptar com sobra, para roubar bola, ou para atingir o adversário se `aggression` alta e ele estiver com a bola.

### 5.3 Perfis (`ai/profiles.ts`)

| Parâmetro | Novato | Profissional | Lenda |
|---|---|---|---|
| reactionMs | 340 | 180 | 85 |
| aimErrorDeg | 18 | 8 | 2.5 |
| speedFactor (do máximo) | 0.78 | 0.92 | 1.00 |
| predictionHorizon (s) | 0.15 | 0.40 | 0.75 |
| chargeAccuracy (acerta a carga ideal) | 0.55 | 0.80 | 0.96 |
| dashUsage (0..1) | 0.10 | 0.45 | 0.85 |
| aggression (disputa corpo a corpo) | 0.25 | 0.60 | 0.90 |
| idleChance (hesita por 0,2–0,5 s) | 0.14 | 0.05 | 0.00 |
| defensivePositioning | fraco (só persegue a bola) | mantém linha de gol | antecipa passe/chute e corta ângulo |
| mistakeChance (chuta na direção errada) | 0.12 | 0.04 | 0.00 |

Nomes na UI: Novato / Profissional / Lenda.

Rubber-banding: deixe implementado mas desligado por padrão (`RUBBER_BAND = false`). Se ligado, ao perder por 3+ gols a IA reduz `speedFactor` em 8%. Nunca no nível Lenda.

Meta de balanceamento (critério de aceite): um jogador que nunca jogou deve ganhar do Novato em ~70% das partidas; um jogador com 1h de prática deve ficar em torno de 50% contra o Profissional; a Lenda deve ganhar de ~85% dos jogadores.

## 6. Controles

**Mobile (landscape, primário):**
- Joystick virtual flutuante no terço inferior esquerdo (aparece onde o dedo tocar; zona morta de 12% do raio).
- Botão PONTAPÉ grande no canto inferior direito. Toque curto = chute fraco; segurar = carrega (anel de progresso ao redor do jogador) e solta ao levantar o dedo.
- Botão de dash menor acima do de chute (ou deslizar o joystick rapidamente duas vezes na mesma direção — implemente o botão primeiro).
- Bloqueio de orientação em landscape + aviso "gire o dispositivo".

**Desktop:**
- WASD / setas = mover, Espaço = chutar (segurar carrega), Shift = dash.

Ambos: o `facing` do jogador segue a direção do movimento; quando parado, mantém o último `facing` (permite alinhar o chute antes de soltar).

## 7. Telas e fluxo de UI

```
BOOT → MENU PRINCIPAL
         ├─ JOGAR → SELEÇÃO DE DIFICULDADE (Novato/Profissional/Lenda)
         │            → "PROCURANDO PARTIDA..." (2–4 s, animado — prepara o ritual do online)
         │            → PARTIDA (HUD)
         │                 ├─ GOL → replay automático → kickoff
         │                 └─ FIM DE JOGO (placar, gols/assistências, XP, moeda)
         │                       ├─ "MAIS UMA!" → volta para PARTIDA
         │                       └─ "SAIR" → MENU
         ├─ INVENTÁRIO (skins de jogador/bola/rastro) — placeholder na entrega 1
         ├─ LOJA (moeda do jogo) — placeholder na entrega 1
         └─ AJUSTES (som, música, tamanho do joystick, idioma)
```

HUD durante a partida: placar central com cronômetro e indicadores de gol; ping/região (placeholder na entrega 1, real na entrega 2); botão Menu; moeda acumulada na partida.

Tela de fim de jogo: placar grande, Vitória/Derrota/Empate, tabela com gols e assistências por jogador, barra de XP com animação de preenchimento, nível atual, e os dois botões (Sair e Mais uma!).

Idioma: pt-BR como padrão, strings centralizadas em `i18n/pt-BR.json` desde o começo.

## 8. Sistema de replay
- Buffer circular dos últimos 8 segundos de `GameState` a 60 Hz (~480 snapshots). Guardar só o essencial: posições, velocidades, tick, placar. ~40 bytes por snapshot = ~20 KB.
- Ao gol: reproduzir os últimos 3 s em 0,6× de velocidade, com câmera fechada na bola, nomes dos jogadores flutuando e barra de progresso.
- Botões: Pular e Salvar replay (salva o buffer serializado em localStorage, máximo de 5, com data e placar).
- Reprodução de replay salvo a partir do menu.
- Como o núcleo é determinístico, uma alternativa mais barata é salvar seed + lista de comandos e re-simular. Faça o buffer de estados primeiro (mais simples), a re-simulação vira otimização depois.

## 9. Progressão e economia (entrega 1, local)

| Evento | Recompensa |
|---|---|
| Concluir partida | +$10 |
| Vitória | +$25 |
| Cada gol marcado | +$5 |
| Sequência de vitórias | +10% por vitória consecutiva, teto de +50% |
| XP | 40 base + 15 por gol + 60 por vitória |

Curva de nível: `xpParaNivel(n) = 300 * n^1.35`.

Tudo em `progression/economy.ts` com valores em um único objeto, para ajustar sem caçar números.

`StorageAdapter` com métodos `get`/`set`/`clear` — implementação `LocalStorageAdapter` agora, `ApiStorageAdapter` na entrega 2.

## 10. Sistema de publicidade / logos ⭐

### 10.1 Inventário de espaços

| Slot ID | Local | Tamanho (unidades de mundo) | Observação |
|---|---|---|---|
| pitch-nw | Campo, canto superior esquerdo | 320 × 180 | Placa deitada no gramado, atrás da área |
| pitch-sw | Campo, canto inferior esquerdo | 320 × 180 | Idem |
| pitch-ne | Campo, canto superior direito | 320 × 180 | Idem |
| pitch-se | Campo, canto inferior direito | 320 × 180 | Idem |
| center-watermark | Círculo central | 260 × 260 | Marca d'água, opacidade 0.12 |
| scoreboard-sponsor | HUD, abaixo do placar | 160 × 32 px (tela) | "Apresentado por" |
| loading-hero | Tela "procurando partida" | 640 × 360 px | O maior e mais nobre |
| endgame-banner | Tela de fim de jogo | 640 × 100 px | Alta atenção, momento de decisão |
| replay-lower-third | Durante replay | 400 × 80 px | Faixa inferior |
| menu-footer | Rodapé do menu principal | 100% × 90 px | Rotativo |
| ball-skin | Textura da bola | — | Patrocínio premium |
| player-badge | Escudo no avatar do jogador | 24 × 24 px | Patrocínio premium |

### 10.2 Formato de configuração (`public/futtrool/ads.config.json`)

```json
{
  "version": 1,
  "defaultCampaign": "house",
  "campaigns": [
    {
      "id": "house",
      "advertiser": "Minha Marca",
      "priority": 100,
      "creatives": [
        {
          "slotId": "pitch-nw",
          "asset": "/futtrool/ads/minha-marca-320x180.png",
          "alt": "Minha Marca — conheça",
          "clickUrl": "https://exemplo.com?utm_source=game&utm_medium=pitch",
          "weight": 1
        },
        {
          "slotId": "loading-hero",
          "asset": "/futtrool/ads/minha-marca-hero.png",
          "clickUrl": "https://exemplo.com",
          "weight": 1
        }
      ]
    }
  ]
}
```

### 10.3 Regras de renderização (não negociáveis)
- Anúncios de campo desenham abaixo de jogadores, bola e efeitos — nunca cobrem a jogada.
- Nunca dentro da área do gol nem sobre a linha de gol.
- Opacidade dos placares de campo entre 0.85 e 1.0; marca d'água central no máximo 0.15.
- Nenhum anúncio pode se sobrepor a botões de controle (joystick, pontapé, menu).
- O criativo deve ser desenhado em `drawImage` com `imageSmoothingEnabled = true` e escala respeitando o aspect ratio — nunca esticar.
- Se o asset não carregar, o slot fica vazio (não desenha placeholder feio em produção; em dev desenha borda tracejada com o `slotId`).
- Máximo de 2 slots de campo visíveis simultaneamente na área da câmera para não poluir.

### 10.4 Telemetria (prepare agora, envie depois)

```ts
type AdEvent =
  | { type: 'impression'; slotId: string; creativeId: string; t: number }
  | { type: 'viewable'; slotId: string; creativeId: string; visibleMs: number }
  | { type: 'click'; slotId: string; creativeId: string };
```

Regra de impressão viewable: ≥ 50% da área do criativo dentro do viewport da câmera por ≥ 1000 ms contínuos (padrão IAB). Clique: slots de tela (loading, endgame, menu) são clicáveis e abrem em nova aba. Slots de campo não são clicáveis durante a partida — só na tela de fim de jogo.

### 10.5 API interna

```ts
adManager.load(config);
adManager.getCreative(slotId): Creative | null;   // respeita priority + weight
adManager.render(ctx, camera);                     // slots de mundo
adManager.trackVisibility(camera, dt);
adManager.onClick(slotId);
```

Trocar campanha = editar o JSON e recarregar. Sem rebuild.

## 11. Direção de arte

| Elemento | Valor |
|---|---|
| Gramado | faixas alternadas #4CAF50 / #66BB6A, faixa a cada 200 unidades |
| Linhas | #FFFFFF a 0.85 de opacidade, espessura 4 |
| Área do gol | #C87055 sólido |
| UI (fundos) | #0B0B0E com raio de borda 24 |
| Acento primário | rosa #E93D82 (botões de ação, moeda) |
| Acento secundário | verde #4ADE80 (barra de XP) |
| Time 1 / Time 2 | vermelho #F0574B / azul #4B9BF0 |
| Tipografia | uma grotesca geométrica pesada (Poppins ExtraBold / Montserrat Black) para números e botões |
| Jogadores | círculo com borda preta de 5px, avatar/bandeira dentro, nome flutuando acima |

Efeitos mínimos para a entrega 1: rastro da bola (últimas 8 posições em alpha decrescente), screen shake no gol (0,3 s, amplitude 12), partículas no chute carregado, flash branco no gol, zoom da câmera de 1.0 → 1.25 quando a bola entra no terço final.

Câmera: segue um ponto entre a bola e o jogador (peso 0.7 bola / 0.3 jogador), com suavização (lerp 0.12) e clamp nas bordas do campo. Zoom dinâmico entre 0.9 e 1.3 conforme a distância entre os jogadores.

## 12. Áudio
Chute (3 variações por intensidade), colisão bola-parede, colisão jogador-jogador, dash, apito de início/fim, gol (multidão), clique de UI. Música: 2 faixas em loop no menu e na partida, com controle de volume separado. Todos os sons carregados com pool para não estourar em cliques rápidos.

## 13. Preparação para a entrega 2 (multiplayer online)

Cinco decisões que precisam ser respeitadas na entrega 1, senão haverá reescrita:

1. `src/futtrool/core` puro e determinístico. Sem DOM, sem `Math.random()` (só o PRNG com seed), sem `Date.now()` dentro da simulação.
2. Input é `Command` serializável, com `tick`. O jogador local nunca move o personagem direto; ele produz um comando que a simulação consome. Idem a IA.
3. `GameState` é serializável (só números e primitivos, sem referências circulares, sem classes com métodos).
4. Camada de transporte abstraída: interface `MatchTransport` com `sendCommand()` e `onStateUpdate()`. Na entrega 1 existe `LocalTransport` (roda a simulação no próprio cliente com a IA); na entrega 2 entra `NetworkTransport`.
5. Renderer lê estado, nunca escreve. O render recebe `GameState` e desenha. Nenhuma lógica de jogo no renderer.

Arquitetura prevista para a entrega 2 (só para orientar as decisões acima, não implementar agora): servidor autoritativo em Node (Colyseus ou ws puro) a 30 Hz rodando o mesmo `core`; cliente envia comandos a 60 Hz com número de tick; client-side prediction + reconciliation; interpolação de adversário/bola com buffer de 100 ms; matchmaking simples; anti-cheat no servidor; contas via backend.

## 14. Critérios de aceite da entrega 1

- [ ] Partida completa de 3 minutos jogável em desktop e mobile (landscape), sem travar.
- [ ] 60 FPS estáveis em um celular intermediário.
- [ ] Os 3 níveis de IA são perceptivelmente diferentes numa cega.
- [ ] Gol detectado corretamente mesmo com a bola em velocidade máxima (teste automatizado de swept collision).
- [ ] Replay de gol automático funcionando + salvar e reproduzir replay.
- [ ] XP, nível, moeda e sequência persistem entre sessões.
- [ ] Todos os 11 slots de anúncio renderizando a partir do `ads.config.json`, com telemetria de impressão viewable funcionando.
- [ ] `src/futtrool/core` com boa cobertura de física e regras em testes Vitest, rodando em Node sem browser.
- [ ] Nenhum import de DOM dentro de `src/futtrool/core` (revisão manual — ver decisão sobre lint em `docs/NOTES.md`).

## 15. Roadmap sugerido da entrega 1

| Marco | Escopo | Saída verificável |
|---|---|---|
| M1 | Setup do módulo, tipos, constantes, loop fixo, render do campo | Campo desenhado, loop rodando a 60 Hz |
| M2 | Física: jogador, bola, colisões, chute com carga, dash | Dois jogadores controlados por teclado, bola respondendo |
| M3 | Regras: gol, placar, cronômetro, kickoff, fim de jogo | Partida completa jogável 2 jogadores no mesmo teclado |
| M4 | IA: percepção, FSM, 3 perfis | 1v1 contra IA nos 3 níveis |
| M5 | Controles touch + câmera + FX + áudio | Jogável e gostoso no celular |
| M6 | UI completa: menu, dificuldade, HUD, fim de jogo, progressão | Fluxo fechado, dados persistindo |
| M7 | Replay | Replay automático de gol + salvar |
| M8 | Sistema de anúncios + telemetria | Todos os slots ativos via JSON |
| M9 | Balanceamento, polimento, testes em dispositivo | Critérios de aceite atendidos |

## 16. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Física "escorregadia" ou sem peso | Reserve tempo real de tuning no M2; os valores da seção 3.4 são ponto de partida, não verdade |
| IA Lenda impossível de vencer | Limite `speedFactor` em 1.0 e mantenha `reactionMs` ≥ 80; a IA não pode ser mais rápida que o jogador |
| Gol atravessando a linha entre frames | Swept collision obrigatório, com teste automatizado |
| Anúncios atrapalhando a leitura da jogada | Regras da seção 10.3 aplicadas como regra de código, não como recomendação |
| Retrabalho na entrega 2 | As cinco decisões da seção 13 são bloqueantes na revisão de código |
