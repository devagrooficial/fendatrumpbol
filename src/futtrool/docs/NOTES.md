# FutTrool — Notas de arquitetura e referência visual

Este arquivo manda sobre **onde as coisas ficam** e sobre **como a UI deve
se parecer**. Regras de jogo (física, IA, regras de partida, economia,
anúncios) continuam em `docs/SPEC.md` — não duplicar aqui.

## 1. Adaptação da estrutura de pastas

O `docs/SPEC.md` foi escrito para um monorepo `pnpm` (`packages/core` +
`apps/web`). Este repositório é um site Vite multi-página único (ver
`README.md` da raiz: hub + `trumpbol.html` + `flysim.html`, cada jogo com
sua própria árvore em `src/<jogo>/`). FutTrool segue o mesmo padrão do
`flysim`:

```
futtrool.html                      # entrada HTML na raiz (como trumpbol.html/flysim.html)
src/futtrool/
  main.ts                          # bootstrap
  config.ts                        # feature flags (ex.: RUBBER_BAND)
  core/                             # simulação PURA — equivale a packages/core da spec
    constants.ts                   # PHYS (seção 3.4 da spec) + regras de partida (seção 4)
    types.ts                       # Vec2, Player, Ball, GameState, Command
    rng.ts                         # PRNG com seed (mulberry32) — nunca Math.random()
    physics.ts                     # integração, colisões, resolução de impulso
    rules.ts                       # kickoff, gol, tempo, fim de jogo, prorrogação
    simulation.ts                  # step(state, commands, dt) -> state (função pura)
    ai/
      profiles.ts                  # tabela 5.3 (Novato/Profissional/Lenda)
      perception.ts                # buffer de reação atrasada + previsão de interceptação
      brain.ts                     # FSM -> Command
  render/
    renderer.ts                    # desenha o GameState (nunca escreve estado)
    camera.ts                      # segue bola+jogador, zoom dinâmico, clamp
    ads.ts                         # adManager (seção 10.5)
    fx.ts                          # shake, partículas, trails
  input/
    joystick.ts                    # touch
    keyboard.ts                    # WASD/setas + espaço/enter + shift/ctrl
  ui/
    screens/                       # menu, dificuldade, matchmaking, HUD, fim de jogo
    styles.css
  replay/
    buffer.ts                      # buffer circular de 8s
    player.ts                      # reprodução 0.6x
  audio/
  progression/
    economy.ts                     # tabela da seção 9, xpParaNivel
    storage.ts                     # StorageAdapter -> LocalStorageAdapter
  transport/
    MatchTransport.ts               # interface (seção 13, decisão 4)
    LocalTransport.ts               # roda a simulação local + IA (entrega 1)
  tests/ (ou src/test/futtrool-*.test.ts, ver decisão de testes abaixo)

public/futtrool/
  ads.config.json                  # ver seção 10.2 da spec (caminho adaptado)
  ads/                              # criativos placeholder
```

## 2. Decisões de adaptação (o que diverge da spec original)

| Item da spec original | Decisão neste repo | Por quê |
|---|---|---|
| pnpm workspaces, `packages/core` + `apps/web` | Pasta única `src/futtrool/`, com `core/` como sub-pasta pura | Repo já é um site Vite único, não monorepo. Reescrever isso não muda nenhuma regra de jogo. |
| React para telas de menu/HUD | HTML/DOM leve sem framework, igual `flysim/ui/Screens.ts` | Padrão já usado nos outros 2 jogos do hub; não vamos introduzir uma dependência nova para isso. |
| Howler.js | Web Audio nativo (`flysim/core/Audio.ts` como referência de padrão) | Já é o padrão do repo, zero dependência nova. |
| Regra de lint bloqueando DOM em `packages/core` | **Sem lint automatizado por enquanto** — repo não tem ESLint configurado. A regra "sem DOM em `core/`" vale por convenção e revisão manual/code review. | Adicionar ESLint só para isso é escopo extra não pedido. Se quiser lint automatizado depois, é um passo isolado e barato de adicionar. |
| `packages/core/tests` | `src/futtrool/tests/` — pasta própria, separada de `src/test/` (decisão de Mateus em 2026-08-16) | FutTrool tem escopo grande o suficiente (física + regras + IA) pra justificar seus próprios testes agrupados, ao invés de misturar com os do runner/flysim. |
| `ads.config.json` na raiz de `public/` | `public/futtrool/ads.config.json` + `public/futtrool/ads/` | Evita colidir com outros jogos que também podem querer um inventário de anúncios no futuro. |

As **5 decisões bloqueantes da seção 13 da spec** (core puro/determinístico,
`Command` serializável, `GameState` serializável, `MatchTransport`
abstraído, renderer só lê) continuam valendo exatamente como escrito —
essas não têm nada a ver com monorepo vs. site único.

## 3. Referência visual (prints enviados por Mateus em 2026-08-16)

O jogo de referência mostrado nos prints confirma e detalha a seção 11 da
spec. É host tipo Roblox (barra superior com menu/chat/inventário/Loja) —
isso é só o chrome da plataforma de referência, **não** replicamos essa
barra; usamos como inspiração de composição de HUD e telas. Pontos
específicos a implementar:

- **HUD de placar**: número do placar por time (cor do time) + **fileira
  de 4 pips/bolinhas por time** que preenche a cada gol (bate com "Placar
  visual" da seção 4), cronômetro logo abaixo, tudo centralizado no topo.
- **Indicador de ping/região**: canto superior direito, formato
  `REGIÃO · NNms` (ex. "LATAM · 65 ms") — placeholder estático na entrega 1
  (sem rede de verdade), mas já reservar o espaço na HUD.
- **Tela de matchmaking ("Buscando casual 1v1...")**: círculo central com
  avatares dos "candidatos", contador duplo `tempo decorrido` /
  `~tempo médio`, botão primário rosa (`Treinar` — deixa o jogador
  aquecendo/chutando contra a parede enquanto espera), texto de sequência
  de vitórias com 🔥 e "pote" da sequência em $ (liga com a economia da
  seção 9: bônus de sequência), botão `Cancelar`.
- **Transição "Partida achada! Conectando..."**: barra fina no topo com
  contagem regressiva curta + botão `Cancelar`, mantém o ping visível.
- **Kickoff**: avatar do jogador (círculo com bandeira/skin) com nome
  flutuando acima (`Você` / nome do oponente), botão grande translúcido
  `PONTAPÉ` no canto inferior direito, pílula `Menu` centralizada embaixo.
- **Anúncios de campo**: pelo menos 2 placas grandes deitadas em cantos
  opostos do campo (equivalente a `pitch-nw`/`pitch-sw` etc.), sempre
  **atrás** dos jogadores/bola, nunca dentro da área do gol nem sob os
  controles — bate 100% com a seção 10.3. Nos prints: um anúncio de outro
  jogo ("BEATBALL — Jogue agora no Roblox") e uma marca ("LUCENTUM GAMES")
  — ou seja, o inventário de slots deve aceitar tanto anúncio de
  terceiro quanto branding próprio.
- **Notificação de gol**: banner full-width com fundo escurecido,
  "<Nome> marcou", nome+badge de dificuldade do autor do gol logo abaixo
  numa barra colorida pelo time (ex. "Bot La Pulga" / "Lenda").
- **Tela de replay**: rótulo `REPLAY` com bolinha vermelha piscando no
  topo; rastro pontilhado da bola com alpha decrescente (seção 11); botão
  flutuante `Reagir +$1` (reação social com pequena recompensa — não estava
  na spec original; **confirmado por Mateus em 2026-08-16: entra na entrega
  1**, junto com o resto do replay no M7); barra inferior com nome da faixa
  tocando (`Tocando <n>`),
  CTA de loja de música (`Comprar som $10.000` — sistema de "jukebox"
  citado na seção 12, aqui com preço), `Salvar replay` e `Pular (x/y)`
  com contador de pulos usados.
- **Fim de jogo**: título `Fim de jogo`, placar grande colorido por time,
  resultado (`Vitória`/`Derrota`/`Empate`), tabela por jogador com barra
  de fundo na cor do time (avatar + nome + tag de dificuldade + gols +
  assistências), **duas barras de XP empilhadas**: uma rosa mostrando o
  ganho da partida (`+70 XP`) e uma verde mostrando o progresso atual no
  nível (`1.710 / 2.100 XP`) — bate com "barra de XP com animação de
  preenchimento" da seção 7, só que com o detalhe de mostrar as duas
  barras. Botões finais `Sair +$10` (secundário) e `Mais uma! +$14`
  (primário, rosa, com borda destacada) — o valor no botão é a moeda
  acumulada na partida (seção 9).

Essas referências não mudam nenhuma regra de física/IA/economia da spec —
são detalhamento de camada visual (seção 11) e de UI (seção 7). Vou tratar
isso como o alvo visual do M5/M6/M7/M8 (feel, telas, replay, anúncios).

## 4. Convenção de nomes

- Nome do jogo no hub e em toda UI: **FutTrool** (pt-BR). O nome
  `arena-1v1` do documento original é só codinome interno, não aparece
  para o jogador.

## 5. Progresso

- **M1 — concluído (2026-08-16).** Card no hub (`/`), `futtrool.html`,
  `src/futtrool/main.ts` com loop de passo fixo (`src/shared/Loop.ts`,
  reaproveitado dos outros jogos), `core/types.ts`, `core/constants.ts`
  (`PHYS`, `FIELD`, `MATCH`, `STALL`), `core/rng.ts` (mulberry32 com seed),
  `render/camera.ts` (mundo→tela, "fit" com letterbox) e
  `render/renderer.ts` desenhando o campo (faixas de grama, linhas,
  círculo central, área do gol). Testes em `src/futtrool/tests/`
  (`rng.test.ts`, `camera.test.ts`, 8 testes). `tsc --noEmit` limpo,
  verificado no browser em desktop e em landscape mobile (812×375).
  - Decisão tomada durante o M1: "profundidade do gol" (seção 3.3) foi
    interpretada como a marcação visual `área do gol` desenhada **para
    dentro** do campo (0 a `GOAL_DEPTH` a partir da linha de fundo) — e
    não como uma extensão da parede pra fora do campo. **Corrigido no
    M7** (2026-08-16): o Mateus reparou, comparando com os prints de
    referência, que a marcação fica **atrás** da linha de fundo (onde
    fica a rede de verdade), não pra dentro do campo. `renderer.ts`
    ajustado pra desenhar de `-GOAL_DEPTH` a `0` (e de `WIDTH` a
    `WIDTH+GOAL_DEPTH` do outro lado) — o que também deixou o render
    consistente com a física, que desde o M2 já tratava essa faixa como
    *fora* do campo (`resolveWallCollision`: `leftBound = insideGoalMouth
    ? -FIELD.GOAL_DEPTH : 0`). Antes disso render e física discordavam
    sobre onde ficava essa área; agora concordam.
  - `src/shared/Loop.ts` (compartilhado com trumpbol/flysim) limita o
    frame time a 0.25s em vez do "máximo de 5 steps" literal da seção
    3.4 — mesmo objetivo (evitar espiral da morte com a aba em
    background), implementação levemente diferente por já ser infra
    reaproveitada. Não é uma das 5 decisões bloqueantes da seção 13,
    então não há necessidade de reescrever.
- **M2 — concluído (2026-08-16).** `core/physics.ts` (movimento com
  aceleração/arrasto/clamp, colisão círculo-círculo com impulso e
  conservação de momento, colisão com parede incluindo o "fundo da rede"
  na boca do gol, chute com carga por tempo segurado + alcance/cone, dash
  com cooldown e stun) e `core/simulation.ts` (`step(state, commands, dt)`
  puro, orquestrando tudo por tick). `input/keyboard.ts` com os dois
  jogadores no mesmo teclado (P1: WASD/Espaço/Shift esquerdo — P2:
  setas/Enter/Ctrl direito). `render/renderer.ts` ganhou `renderPlayer`
  (com indicador de facing/mira e anel de carga do chute) e `renderBall`.
  27 testes em `src/futtrool/tests/` (rng, camera, physics — conservação
  de momento, clamp de velocidade máxima, escala do impulso do chute com a
  carga, cooldown, dash, parede). `tsc --noEmit` limpo. Verificado
  interativamente no browser (via eventos de teclado sintéticos, já que a
  automação de tap simples é rápida demais pro loop de física registrar
  "segurando"): movimento, chute acertando a bola e batendo no p2, e dash
  em burst — tudo funcionando, sem erros no console.
  - Dois campos foram adicionados ao `Player` além do esboço da seção 3.2
    da spec (`dashTimer`, `kickHeldPrev`) — necessários pra `step()`
    continuar puro sem estado externo escondido (detectar a borda de
    soltar o chute, e deixar o arrasto dissipar o burst do dash em vez de
    cortá-lo na hora pelo clamp de PLAYER_MAX_SPEED). Documentado como
    comentário no próprio `types.ts`.
  - Simplificação conhecida: o stun de dash é reaplicado a cada tick
    enquanto os corpos estão sobrepostos (não só uma vez no impacto) —
    efeito colateral aceitável por ora, registrado como polimento
    pendente pro M9.
  - Ainda não existe regra de gol/placar/cronômetro — a bola atravessa a
    boca do gol e para no "fundo da rede" (`GOAL_DEPTH`) sem nada
    acontecer. Isso é exatamente o escopo do M3.
- **M3 — concluído (2026-08-16).** `core/rules.ts` (`checkGoal` com swept
  collision, `createKickoffFormation`/`createMatchState`, `stepAntiStall`
  da seção 3.6) e `core/simulation.ts` reescrito como máquina de fases
  (`kickoff` → `playing` → `goal` → `kickoff` de novo, ou `ended`).
  `step()` agora devolve `{ state, events }` — `events` é a lista de
  acontecimentos do tick (gol, início/fim de kickoff, início de
  prorrogação, fim de partida), efêmera, não faz parte do `GameState`
  persistido; existe pra M5+ (áudio, replay) reagir sem comparar dois
  estados. Extraí a matemática de vetor de `physics.ts` pra
  `core/vec2.ts` compartilhado (rules.ts também precisava). 38 testes
  (15 novos em `rules.test.ts`: gol em velocidade máxima, gol fora da
  abertura, kickoff bloqueando input, fluxo completo de gol → congela →
  kickoff, fim por `GOALS_TO_WIN`, fim por tempo, prorrogação, empate na
  prorrogação, morte súbita, anti-degenerescência com/sem jogador perto).
  `tsc --noEmit` limpo. Testado ao vivo no browser via um hook de depuração
  novo (`window.__futtroolDebug`, só em `import.meta.env.DEV` — mesmo
  padrão que a spec já prevê pra `window.__adStats` na seção 10.4):
  forcei a bola em direção ao gol e confirmei o placar mudando, o relógio
  seguindo contando (não reseta pós-gol), e o reset de posições pro
  kickoff; depois forcei `score: {p2: 3}` e confirmei fim de partida com
  "Fim — vence p2" e tudo congelando.
  - Mais dois campos além do esboço da spec, pelo mesmo motivo dos do M2
    (step() precisa ser pura sem estado escondido): `GameState.phaseTimer`
    (contagem do kickoff / congelamento+replay) e `Ball.stallTimer`
    (acumulador do anti-degenerescência).
  - Decisão de design não explicitada na spec: o cronômetro (`timeLeftMs`)
    só conta durante `phase === 'playing'` — pausa durante o congelamento
    pós-gol e durante a contagem de kickoff. Pareceu mais justo (o time
    que sofreu o gol não perde tempo de jogo pra celebração) e mais simples
    de raciocinar. Se o Mateus preferir o cronômetro correndo sempre, é só
    mudar onde `timeLeftMs` é decrementado em `simulation.ts`.
  - Prorrogação não reseta posições pro kickoff (o jogo simplesmente
    continua de onde parou quando os 3:00 acabam empatados) — só a
    detecção de gol muda (qualquer gol encerra a partida na hora). Se
    quiser um kickoff formal também na prorrogação, dá pra ajustar depois
    sem quebrar nada.
  - Duração do congelamento+replay (`MATCH.GOAL_FREEZE_MS +
    GOAL_REPLAY_MS`) já está reservada na fase `goal`, mas ainda não existe
    replay de verdade — a tela só fica "pausada" nesse intervalo. O
    replay visual é o M7.
- **M4 — concluído (2026-08-16).** `core/ai/profiles.ts` (tabela 5.3 exata:
  Novato/Profissional/Lenda, mais `RUBBER_BAND` desligado por padrão),
  `core/ai/perception.ts` (buffer circular com atraso de `reactionMs`,
  previsão analítica de trajetória da bola sob arrasto pra achar o ponto
  de interceptação) e `core/ai/brain.ts` (FSM com os 7 estados —
  kickoff/chase/intercept/attack/defend/recover/celebrate — reavaliada a
  cada 100ms, mais hesitação por `idleChance`, chute com carga/mira/erro/
  chance de erro, e dash por `dashUsage`). A IA só lê o mesmo `GameState`
  que qualquer jogador e só devolve um `Command` — mesma interface do
  teclado, sem acesso privilegiado. Ligada em `main.ts`: P1 é humano
  (teclado), P2 é IA (dificuldade fixa em `AI_DIFFICULTY`, já que a tela
  de seleção é M6). 43 testes (5 novos em `ai.test.ts`, incluindo 40
  partidas headless Novato x Lenda e 20 Novato x Profissional, sem
  render). `tsc --noEmit` limpo. Testado ao vivo no browser: a IA saiu do
  kickoff, perseguiu a bola (`intercept`), se posicionou atrás dela e
  chutou — marcou um gol sozinha contra um P1 parado, e o teclado do P1
  continuou respondendo normalmente com a IA ativa.
  - **Bug real encontrado e corrigido durante o M4**: a mira original do
    chute apontava direto pro gol a partir da posição do próprio jogador,
    mas o mecanismo de chute em `physics.ts` só conecta se a bola estiver
    dentro do cone (`KICK_ARC`) do `facing` no momento de soltar — ou seja,
    "mirar" de verdade exige estar posicionado do lado oposto ao gol em
    relação à bola, não só virar o corpo pro gol. Sem isso, boa parte dos
    chutes da IA falhava em silêncio (carregava, soltava, nada acontecia).
    Corrigido calculando um ponto de "standoff" atrás da bola (na direção
    oposta ao alvo do chute) como destino de movimento no estado ATTACK,
    e mirando a partir da posição da BOLA (não do jogador) em
    `planKick`. Antes da correção, Lenda batia Novato só 45% das vezes em
    40 partidas headless; depois, ~77% (23 vitórias, 7 derrotas, 10
    empates) — condizente com a meta qualitativa da seção 14
    ("perceptivelmente diferentes").
  - O teste de balanceamento (`ai.test.ts`) usa um limiar mais frouxo
    (65% de vitórias entre partidas decisivas, ignorando empates) do que
    o "90%" sugerido no prompt de exemplo da seção "Como executar isso no
    Claude Code" da spec — bot-vs-bot é um proxy imperfeito pra "vence a
    maioria dos humanos" (a meta real, seção 5.3), e o critério de aceite
    formal da seção 14 é qualitativo, não um número fixo. Ver comentário
    no teste.
  - Simplificação registrada no topo de `brain.ts`: o atraso de
    `reactionMs` vale pra decisão estratégica (qual estado da FSM, pra
    onde correr) — reavaliada a cada 100ms como a spec pede — mas o
    gatilho fino de "a bola está no alcance do meu chute agora" usa a
    posição atual de verdade, não a percebida com atraso. Do contrário a
    IA erraria contatos triviais por um atraso que deveria afetar leitura
    estratégica, não coordenação motora do próprio corpo.
  - `window.__futtroolDebug` ganhou `getAiState()` além de `getState()`/
    `setState()`.
- **M5 — concluído (2026-08-16).** `input/joystick.ts` (`TouchInput`):
  joystick flutuante com zona morta de 12% (Pointer Events, aparece onde o
  dedo tocar), botão PONTAPÉ (com anel de carga) e botão de dash, cada um
  rastreado por `pointerId` separado — dá pra mover e chutar com dois
  dedos ao mesmo tempo. `render/camera.ts` ganhou `follow()`: segue
  0.7 bola / 0.3 jogador com lerp 0.12, zoom dinâmico 0.9-1.3 (mistura
  distância entre os jogadores + bola no terço final), clamp nas bordas
  do campo — chamado no passo fixo (`update`), não no `render`, pra não
  depender da taxa de atualização do monitor. `render/fx.ts`: rastro da
  bola (8 posições, alpha decrescente), screen shake (0.3s/12px) e flash
  branco no gol, partículas no chute. `audio/Audio.ts`: síntese via Web
  Audio (mesmo padrão do `flysim/core/Audio.ts`), sem arquivo de áudio —
  chute (intensidade pela carga), colisão bola-parede, colisão
  jogador-jogador, dash, apito de início/fim, gol. Aviso de "gire o
  dispositivo" via CSS (`@media (orientation: portrait) and
  (pointer: coarse)`) em vez da Orientation Lock API (que exige tela
  cheia). `main.ts` religado: P1 = teclado + touch combinados (o que
  tiver mais magnitude de movimento manda; chute/dash é "ou"), eventos de
  `step()` disparando áudio/FX. 118 testes (contagem do repo inteiro,
  nada novo em `core/` neste marco — M5 é só camada de app/renderer,
  fora do que `core/` cobre). `tsc --noEmit` limpo.
  - Testado ao vivo, incluindo dois problemas reais encontrados e
    corrigidos:
    1. `canvas.setPointerCapture()` pode lançar `NotFoundError` sem o
       ponteiro estar mais "ativo" — descoberto testando com eventos
       sintéticos, mas é uma falha de borda legítima também com toque
       real (dedo solto rápido demais). Envolvido em try/catch
       (`trySetPointerCapture`) — a captura é só uma garantia extra, não
       essencial.
    2. Nenhum bug de verdade no toque em si, mas uma cilada de teste que
       vale registrar: `window.location.reload()` via JS derruba a
       emulação de toque do browser de teste (`navigator.maxTouchPoints`
       volta a 0), e uma aba nova que abre sozinha ao editar HTML rouba o
       foco da aba de teste — com a aba em segundo plano,
       `requestAnimationFrame` praticamente para (o acumulador de passo
       fixo do `Loop` fica represado). Nenhum dos dois é um problema do
       jogo; documentado aqui só pra não perder tempo com isso nas
       próximas rodadas de teste manual: sempre `navigate` (não
       `location.reload()`) pra re-testar toque, e sempre `tabs_select`
       pra garantir foco antes de medir qualquer coisa sensível a tempo.
  - Confirmado via log de eventos (não só leitura de estado, que se
    mostrou sujeita a corrida com a IA re-tocando a bola): chute do P1
    disparando com carga cheia pelo botão touch, dash do P1 disparando
    pelo botão touch, joystick renderizando âncora+manípulo durante o
    arrasto.
  - Ainda não existe seleção de tamanho do joystick nem tela de ajustes
    (isso é M6). Música de fundo (jukebox, seção 12) ficou de fora do
    escopo do M5 — só os SFX de evento — porque telas de menu/partida são
    M6, e é lá que a trilha em loop faz mais sentido de entrar junto.
- **M6 — concluído (2026-08-16).** `i18n/pt-BR.json` + `i18n/index.ts`
  (`t(key, params)`) centralizando toda string de UI. `progression/economy.ts`
  (tabela da seção 9, `xpForLevel`, `calculateMatchReward`, `applyXp` — só
  vitória mantém/aumenta a sequência, decisão não explicitada na spec) e
  `progression/storage.ts` (`StorageAdapter`/`LocalStorageAdapter`/
  `ProgressionStore`, chave `futtrool.progression`). Quatro telas DOM
  (`ui/screens/`, mesmo padrão do `flysim/ui/Screens.ts`): `MenuScreen`
  (nível/moedas, Jogar, Inventário/Loja como placeholder "Em breve", toggle
  de som), `DifficultyScreen` (3 cards coloridos por nível), `MatchmakingScreen`
  (spinner, contador 2-4s aleatório, Cancelar) e `EndGameScreen` (placar,
  resultado, linha por jogador, duas barras de XP animadas, sequência de
  vitórias, botões com o valor da recompensa). `ui/hud.ts`: HUD de verdade
  durante a partida — placar colorido + pips de 4 bolinhas por time,
  cronômetro, indicador de ping/região placeholder (seção 7: "real só na
  entrega 2"), avisos de kickoff/gol/prorrogação. `main.ts` ganhou a
  máquina de estados do app inteira (`menu → difficulty → matchmaking →
  match → endgame`), com o `Loop` sempre rodando a 60Hz mas só simulando/
  renderizando a partida de verdade quando `appScreen === 'match'`. 126
  testes (8 novos em `economy.test.ts`). `tsc --noEmit` limpo.
  - Testado ao vivo o fluxo inteiro: Menu → Dificuldade (Lenda) →
    Matchmaking (spinner + contador) → Partida (HUD com pips reais) →
    Fim de jogo (vitória, duas barras de XP, sequência) → Mais uma!
    (nova partida direto) → Fim de jogo de novo (subiu de nível, mostrou
    sequência de 2) → Sair → Menu (nível e moeda atualizados). Progressão
    confirmada persistindo em `localStorage['futtrool.progression']`
    entre chamadas. Toggle de som persiste em
    `localStorage['futtrool.soundEnabled']`.
  - Durante o teste apareceu um gol contra da IA (Lenda chutou, `scorer:
    p1` no log) depois de um chute forte + vários `ballWallBounce`. Não é
    bug de placar — `checkGoal` tem teste unitário cobrindo os dois lados
    (`rules.test.ts`) e a leitura mais provável é a física de verdade: um
    chute quase no `KICK_MAX_IMPULSE` com `BALL_WALL_RESTITUTION=0.78`
    pode ricochetear e atravessar o campo inteiro antes do arrasto
    dissipar. Registrado aqui como comportamento emergente observado, não
    investigado a fundo — se voltar a incomodar, é candidato a ajuste de
    balanceamento no M9, não a correção de bug.
  - Simplificações conscientes de escopo: sem tela de Ajustes dedicada
    (o toggle de som mora direto no menu; tamanho do joystick e idioma
    ficam de fora — só existe pt-BR mesmo, e o `t()` já isola isso pra
    quando precisar); sem trilha de música em loop (só os SFX de evento
    do M5); tabela de fim de jogo não tem coluna de assistência de
    verdade (mostraria sempre 0 — não há rastreamento de posse/passe
    ainda, então omiti a coluna em vez de inventar um número falso).
- **M7 — concluído (2026-08-16).** `replay/buffer.ts` (`ReplayBuffer`:
  buffer circular de `REPLAY.BUFFER_SECONDS`=8s a 60Hz, ~480 snapshots
  enxutos — posição/velocidade/facing/stun, não o `GameState` inteiro),
  `replay/player.ts` (`ReplayPlayer`: toca os snapshots a `REPLAY.SPEED`
  da velocidade real, sem resimular nada) e `replay/storage.ts`
  (`ReplayStore`, reaproveitando o `StorageAdapter` da progressão, chave
  `futtrool.replays`, máximo `REPLAY.MAX_SAVED`=5). `ui/ReplayOverlay.ts`
  (overlay transparente por cima do jogo — não é um `.screen` opaco —
  com label "REPLAY" piscando, `Reagir +$1`, `Salvar replay`, `Pular`/
  `Voltar` e barra de progresso) e `ui/screens/SavedReplaysScreen.ts`
  (lista os replays salvos a partir do menu, com Assistir/Apagar).
  `main.ts` ganhou dois estados de app novos (`replays`,
  `watchingReplay`) e a orquestração da fase `goal`: os primeiros
  `GOAL_FREEZE_MS` só mostram o estado ao vivo congelado, depois disso
  entra a janela de replay de verdade (captura o clipe do buffer, toca a
  0.6x, mostra nomes flutuando — `renderPlayerLabel`, nova em
  `renderer.ts`). 135 testes (9 novos em `replay.test.ts`). `tsc --noEmit`
  limpo.
  - **Decisão de reconciliação de spec**: a seção 4 diz "replay automático
    (2,5s)", mas a seção 8 pede 3s de conteúdo a 0.6x — o que
    matematicamente leva 5s de relógio pra tocar, não 2,5s. Segui a
    seção 8 (é o pilar "feedback exagerado" da seção 0, e é mais
    específica sobre o replay em si) e derivei `MATCH.GOAL_REPLAY_MS`
    a partir de `REPLAY.CONTENT_SECONDS/REPLAY.SPEED` em vez do número
    solto da seção 4 — documentado com comentário em `constants.ts` pra
    não parecer descuido. Pausa total por gol agora é 1,2s + 5s = 6,2s.
  - **Bug real encontrado e corrigido durante o teste** (fora do escopo
    do replay em si, achado pelo Mateus comparando com um print de
    referência): a "área do gol" estava desenhada **para dentro** do
    campo desde o M1, mas o certo é atrás da linha de fundo (onde fica a
    rede de verdade) — bate com a física, que desde o M2 já tratava essa
    faixa como fora do campo. `renderer.ts` corrigido; ver a entrada do
    M1 atualizada acima.
  - Testado ao vivo o fluxo inteiro, incluindo os dois locais onde é fácil
    testar errado (documentado aqui pra não repetir): (1) o replay ao
    vivo dura só ~6s reais por gol, curto demais pra pegar por polling
    entre chamadas de ferramenta — resolvido rodando um `while` com
    `await` dentro do MESMO `javascript_exec`, em vez de várias chamadas
    separadas; (2) `Salvar replay`/`Reagir`/o clipe salvo (480 snapshots,
    placar certo) e a tela "Replays salvos" (assistir com nomes
    flutuando, apagar, estado vazio) — tudo confirmado funcionando.
  - Simplificação consciente: "Reagir +$1" só existe no replay AO VIVO
    pós-gol, não ao assistir um replay salvo depois (senão dava pra
    farmar moeda reagindo ao mesmo clipe repetidamente). `ReplayOverlay`
    tem um modo `'watch'` que esconde Reagir/Salvar e reaproveita o botão
    de Pular como "Voltar".
  - Ficou de fora (não pedido pela spec, só apareceu nos prints de
    referência): "Comprar som $10.000" (loja de música/jukebox — precisa
    de um sistema de trilha sonora que não existe ainda) e o contador
    "Pular (x/2)" como limite artificial de pulos (isso seria uma
    mecânica de monetização por gate, não algo que a seção 8 pediu).
- **M8 — concluído (2026-08-16).** `ads/types.ts` (`AdSlotId`, `AdCreative`,
  `AdCampaign`, `AdsConfig`, `AdEvent`), `ads/slots.ts` (geometria: 4
  placas de campo fora das linhas de fundo — "atrás da área", nunca perto
  da boca do gol, que fica nas laterais — mais `center-watermark`, mais os
  tamanhos de referência dos slots de tela) e `ads/adManager.ts`
  (`load`/`getCreative` com priority+weight/`renderFieldSlots`/
  `renderScreenRect`/`trackFieldVisibility`/`trackDomSlotShown`+`Hidden`/
  `onClick`/`renderBallSkin`/`renderPlayerBadge`). `camera.ts` ganhou
  `worldRectVisibleFraction()` pra telemetria de viewable (seção 10.4).
  `public/futtrool/ads.config.json` com uma campanha "house" cobrindo os
  12 slots, criativos placeholder em SVG (texto, sem imagem externa).
  Ligado em `main.ts` (fetch do config no boot, `trackFieldVisibility` a
  cada tick, slots de campo desenhados antes de jogador/bola/FX) e nas 4
  telas DOM que têm slot (`MenuScreen`/`MatchmakingScreen`/
  `EndGameScreen`/`ReplayOverlay`, via um helper compartilhado
  `ui/adSlot.ts`). 144 testes (13 novos: seleção por priority+weight com
  `Math.random` mockado, `worldRectVisibleFraction`). `tsc --noEmit`
  limpo.
  - **Inconsistência real da spec, encontrada e documentada**: a seção 10
    fala em "11 slots" (título da seção, critério de aceite da seção 14),
    mas a tabela da seção 10.1 lista 12 linhas (pitch-nw/sw/ne/se,
    center-watermark, scoreboard-sponsor, loading-hero, endgame-banner,
    replay-lower-third, menu-footer, ball-skin, player-badge). Implementei
    os 12 da tabela — ela é mais específica e é o que dá pra testar de
    verdade, então prevalece sobre a contagem solta no texto. Se o
    Mateus quis dizer 11 de propósito (um dos 12 sendo opcional/fora de
    escopo), é só remover de `ads/slots.ts` e do config.
  - Testado ao vivo: os 4 slots de campo e o watermark aparecem
    corretamente atrás dos jogadores (com placeholder tracejado em dev
    enquanto a imagem ainda carrega — confirmei que é só um instante,
    não ficou preso nisso), o scoreboard aparece no HUD, o loading-hero
    na tela de matchmaking, o endgame-banner na tela de fim de jogo (com
    os slots de campo visíveis e meio apagados atrás do painel, herdado
    de graça do `.screen` já ser semi-transparente), o replay-lower-third
    durante o replay de gol, a skin da bola trocou a textura padrão pela
    do criativo, e o emblema apareceu no canto de cada jogador. Telemetria
    confirmada via `window.__adStats`: impression + viewable disparando
    certo tanto pros slots de tela (timer de 1s) quanto pros de campo
    (acumulando tempo visível de verdade via câmera, resetando quando a
    fração cai abaixo de 50%).
  - **Bug real encontrado e corrigido**: o `fetch` do `ads.config.json`
    ainda estava em voo quando o menu (primeira tela do app) já tinha
    aparecido, então o `menu-footer` ficava vazio até a próxima troca de
    tela. Corrigido guardando a Promise do fetch e, quando ela resolve,
    chamando um `refreshAd()` novo (só atualiza a imagem do slot, sem
    reiniciar timer/animação da tela) na tela que estiver visível
    naquele momento.
  - Simplificações conscientes: cliques em slot de campo (`pitch-*`) não
    estão ligados a nada ainda — a spec diz que eles só deveriam ser
    clicáveis na tela de fim de jogo (não durante a partida), mas como o
    fim de jogo aqui é um painel DOM por cima do canvas (não uma cena de
    campo interativa de verdade), implementar esse clique específico
    ficou de fora por ora; os slots de TELA (menu/loading/endgame/replay)
    são clicáveis normalmente. `ball-skin` faz *clip* circular da imagem
    (sem aplicar ao rastro/trail, que continua branco) — suficiente pra
    provar o conceito, não é um sistema de skins de verdade (isso seria
    a "Loja" placeholder do M6).
- **M1-M8 concluídos.** Falta só o **M9** (seção 15 do roadmap):
  balanceamento, polimento, testes em dispositivo de verdade, e rodar a
  checklist de critérios de aceite da seção 14 item por item. Depois
  disso é que faz sentido auditar as 5 decisões bloqueantes da seção 13
  antes de considerar multiplayer (passo sugerido pela própria spec, "Passo
  5" — ainda não feito).

- **M9 — checklist da seção 14 (2026-08-16).**
  - [x] Partida completa de 3 minutos jogável sem travar — testado com uma
    partida **de verdade, sem forçar nada via debug hook**: ~115s
    contínuos monitorados em desktop (checagem de tick a cada 20s,
    sempre avançando ~60 ticks/tick de relógio, zero erros), até o
    relógio zerar sozinho, `phase` virar `ended` e a tela de fim de jogo
    aparecer com o resultado certo (0-2, Derrota, XP calculado certo). No
    viewport mobile landscape (812×375), mais 20s contínuos monitorados,
    mesma taxa de tick, zero erros, renderização correta (campo, HUD,
    anúncios, controles touch todos no lugar).
  - [ ] **60 FPS estáveis em celular intermediário — não verificável
    nesta sessão.** Não há um Android físico disponível aqui; o teste
    acima confirma que a simulação e o render não travam nem cortam tick
    em viewport mobile *dentro do navegador de desenvolvimento*, mas isso
    não prova FPS em hardware de verdade. Fica como pendência explícita
    pro Mateus testar num aparelho físico antes de considerar a entrega 1
    fechada.
  - [x] Os 3 níveis de IA são perceptivelmente diferentes — confirmado
    quantitativamente no M4 (Lenda venceu Novato em ~77% das partidas
    decisivas, 40 partidas headless) e qualitativamente ao vivo (Lenda
    reage e persegue visivelmente mais rápido que Novato). A meta da
    seção 5.3 é sobre taxa de vitória contra **humanos** (~70% iniciante
    perde pro Novato, Lenda vence ~85% dos jogadores) — isso não dá pra
    validar sem playtesters de verdade; só o proxy bot-vs-bot foi medido.
  - [x] Gol detectado com a bola em velocidade máxima — teste automatizado
    (`rules.test.ts`, swept collision) desde o M3.
  - [x] Replay automático de gol + salvar/reproduzir — testado ao vivo no
    M7.
  - [x] XP, nível, moeda e sequência persistem entre sessões — testado ao
    vivo no M6 (`localStorage`).
  - [x] Todos os slots de anúncio renderizando com telemetria viewable —
    testado ao vivo no M8 (nota: a tabela da seção 10.1 tem 12 slots, não
    11 como o texto diz — ver entrada do M8).
  - [x] `core/` com cobertura de teste — **99.54% statements / 100%
    functions / 97.31% branches** (`vitest --coverage`, escopo
    `src/futtrool/core/**`). Instalei `@vitest/coverage-v8` como
    dependência de dev pra medir isso (não existia no projeto). Os poucos
    branches sem cobertura são casos extremamente defensivos (ex.:
    normalizar um vetor de comprimento zero) — não achei nenhum caminho
    de regra/física real sem teste.
  - [x] Nenhum import de DOM dentro de `core/` — confirmado por grep
    (`window`, `document`, `localStorage`, `navigator`, `Math.random`,
    `Date.now`, `setTimeout`, `requestAnimationFrame`: zero ocorrências
    fora de comentários) e por grep de imports saindo de `core/` pra
    qualquer outra camada (zero ocorrências). `npm run build` também
    passa limpo (bundle do FutTrool: 57.6 kB / 18 kB gzip).
  - 152 testes automatizados no total (9 novos neste marco:
    `perception.test.ts` + casos extras em `physics.test.ts`/
    `rules.test.ts` pra fechar os gaps que a cobertura apontou).
  - Não fiz nenhuma mudança de balanceamento de física/IA neste marco —
    nada nos testes ou no playtesting ao vivo apontou desequilíbrio óbvio
    além do que já estava registrado (o gol contra "de sorte" do M8,
    física normal, não bug).

## 12. Correção pós-deploy: placas de anúncio na lateral errada

Depois do deploy do M9, o Mateus reparou (comparando com o print de
referência) que as 4 placas de campo (`pitch-nw/ne/sw/se`) estavam
posicionadas na lateral de cima/baixo do campo inteiro, fora dos limites
do campo — não atrás/ao lado de cada gol como nas capturas de referência
(seção 3). Isso também cortava as placas no enquadramento padrão da
câmera, já que a área ficava fora do que o "fit" da câmera mostra por
padrão (o corte era sintoma, não bug separado de câmera).

Corrigido em `ads/slots.ts`: troquei a margem única (`PITCH_BOARD_MARGIN`,
10px, medida a partir da lateral de cima/baixo) por duas margens
(`PITCH_BOARD_MARGIN_X` = 15px, `PITCH_BOARD_MARGIN_Y` = 30px) e recalculei
`FIELD_AD_RECTS` pra colocar as 4 placas **dentro** do campo, em pares nos
cantos de cada gol — `pitch-nw`/`pitch-sw` perto do gol esquerdo (uma acima,
uma abaixo da boca do gol), `pitch-ne`/`pitch-se` perto do gol direito.
Confirmado ao vivo: com o `adManager` limitando a 2 placas simultâneas
visíveis, as duas placas do lado esquerdo do campo ficam completamente
visíveis e sem corte pela câmera, no canto certo. Nenhuma mudança de lógica
em `adManager.ts` foi necessária — ele só consome os retângulos de
`slots.ts`.

## 13. Segunda correção: as placas têm que ficar FORA do campo, não dentro

O Mateus corrigiu de novo, comparando com o print de referência: a entrada
12 acima colocou as placas *dentro* do campo (nos cantos, junto às
linhas), mas o print mostra as placas *fora* — na faixa fora da linha
branca, atrás/ao lado de cada gol, como as placas de perímetro de um
estádio de verdade.

Duas mudanças, porque uma sem a outra não resolve:

- `ads/slots.ts`: `FIELD_AD_RECTS` agora posiciona as 4 placas com `y`
  negativo (acima da linha de fundo, fora do campo) pra `pitch-nw`/
  `pitch-ne`, e `y` além de `FIELD.HEIGHT` (abaixo da linha de fundo, fora
  do campo) pra `pitch-sw`/`pitch-se`, com `x` colado na lateral esquerda
  ou direita — perto do gol correspondente, exatamente como as tentativas
  originais antes da entrada 12 (o erro da entrada 12 foi "consertar" isso
  pro lado errado).
- `core/constants.ts` + `render/camera.ts`: só mudar a posição não
  bastava — nada garantia que essa faixa fora do campo aparecesse no
  enquadramento padrão da câmera (dependia de sorte da proporção da tela
  sobrar espaço, o que causou o corte original que o Mateus reportou logo
  no primeiro deploy). Criei `FIELD.APRON_Y` (220 unidades de mundo) como
  faixa de apresentação reservada acima/abaixo do campo, e fiz o cálculo
  de "fit" da câmera (`updateScale`) e o clamp (`clampCenter`) usarem
  `FIELD.HEIGHT + FIELD.APRON_Y * 2` em vez de só `FIELD.HEIGHT` — assim a
  câmera sempre deixa essa faixa (e as placas nela) visível, em vez de só
  quando a tela por acaso é larga o bastante pra sobrar margem. Isso
  encolhe um pouco o campo em tela (pra caber a faixa), efeito parecido
  com o enquadramento de transmissão de futebol de verdade, que sempre
  mostra um pedaço da lateral/placas.

Ajustei o teste de `camera.test.ts` que fixava a escala esperada em
`viewportH / FIELD.HEIGHT` — agora é `viewportH / (FIELD.HEIGHT +
FIELD.APRON_Y * 2)`. Não criei um "apron" gramado visualmente (a faixa
fora do campo continua com o fundo escuro padrão da UI, não grama) — as
placas ficam sobre o fundo escuro, fora da linha branca, o que já resolve
o pedido (posição certa + sem corte); dava pra desenhar uma faixa de
grama mais clara ali também, mas isso não foi pedido e fica como possível
polimento futuro.

## 14. Terceira correção: lateral (eixo X), não em cima/embaixo (eixo Y)

O Mateus mandou um mockup mostrando as 4 placas na lateral esquerda/
direita da tela (2 empilhadas de cada lado, fora do retângulo do jogo) e
explicou o motivo: a entrada 13 tinha resolvido "fora do campo", mas
usando a faixa de cima/baixo (`FIELD.APRON_Y`), o que encolhia a altura
visível do campo em tela — e ele não quer perder espaço vertical.

Troquei o eixo da faixa de apresentação de Y pra X:

- `core/constants.ts`: `FIELD.APRON_Y` virou `FIELD.APRON_X` (380
  unidades, além de cada linha de fundo).
- `render/camera.ts`: o "fit" (`updateScale`) agora reserva essa faixa na
  **largura** (`FIELD.WIDTH + FIELD.APRON_X * 2`) e usa `FIELD.HEIGHT`
  puro na altura — antes era o contrário. `clampCenter` espelhou a
  mudança: o clamp expandido agora é no eixo X, o eixo Y voltou a ficar
  restrito a `[0, FIELD.HEIGHT]` como era antes de toda essa história de
  placa.
- `ads/slots.ts`: `FIELD_AD_RECTS` agora posiciona os 4 retângulos fora
  das linhas de fundo esquerda/direita (`x` negativo ou além de
  `FIELD.WIDTH`), empilhados em Y — um par acima da boca do gol (y ~40 a
  220) e um par abaixo (y ~580 a 760) — sem sobrepor a abertura do gol
  (`FIELD.GOAL_OPENING`, y 290–510), pra não cobrir a rede.

Testado ao vivo: com o `adManager` limitando a 2 placas simultâneas, dá
pra ver as duas placas do lado esquerdo (perto do gol esquerdo) e,
movendo a ação pro outro lado, as duas do lado direito — ambas totalmente
visíveis, sem corte pela câmera, e a altura do campo em tela não encolheu
mais (volta a usar a tela inteira na vertical). Ajustei
`camera.test.ts` de novo pra refletir o eixo trocado.

## 15. Remove os slots de anúncio de tela do menu e do fim de jogo

O Mateus pediu pra tirar o "Espaço publicitário — menu-footer" (no menu)
e o "Gostou da partida? Anuncie aqui." (no modal de fim de jogo) — esses
textos são os criativos "house" (fallback) configurados em
`public/futtrool/ads.config.json` pros slots `menu-footer` e
`endgame-banner`, servidos como SVG (`public/futtrool/ads/
house-menu-footer.svg` e `house-endgame-banner.svg`). Ele não quer esse
espaço/convite visível publicamente nessas duas telas.

Removido só a renderização desses dois slots nas duas telas — não mexi no
resto do sistema de anúncios (as placas de campo, o `center-watermark`,
`scoreboard-sponsor`, `loading-hero` da matchmaking e `replay-lower-third`
continuam normais):

- `ui/screens/MenuScreen.ts`: tirei o `<div data-footer-ad-slot>`, o
  `footerAd` (`createAdSlotImg('menu-footer', ...)`), as chamadas de
  `showAdSlot`/`hideAdSlot` em `show()`/`hide()`, e o método `refreshAd()`.
- `ui/screens/EndGameScreen.ts`: mesma coisa pro `bannerAd`
  (`endgame-banner`).
- `main.ts`: tirei as chamadas a `menuScreen.refreshAd()` e
  `endGameScreen.refreshAd()` no `.then()` do `adsConfigPromise` (só
  sobrou `matchmakingScreen.refreshAd()`, que ainda usa `loading-hero`).

Não toquei em `ads/types.ts`, `ads/slots.ts` (`AD_SLOT_IDS` continua com
os 12 ids) nem em `ads.config.json` — os slot ids `menu-footer` e
`endgame-banner` continuam existindo no sistema (então `adManager.onClick`
etc. continuam funcionando, os testes de `ads.test.ts` não quebraram),
só não são mais renderizados em tela nenhuma. Ficam órfãos por enquanto;
dava pra removê-los de vez do modelo de dados, mas isso exigiria mudar o
tipo `AdSlotId`, o `ads.config.json` e o teste que conta 12 slots — mais
mudança do que o pedido, que era só tirar isso dessas duas telas.

Testado ao vivo: menu sem o rodapé de anúncio, modal de fim de jogo sem o
banner. `npx tsc --noEmit` limpo, 152/152 testes passando (nenhum teste
dependia da renderização desses dois slots nessas telas especificamente).

## 16. Tremedeira infinita na tela de fim de jogo + som de gol

O Mateus reportou o campo "tremendo" atrás do modal de fim de jogo — bug
de verdade, achado a causa: o screen shake do gol (`render/fx.ts`,
`shakeTimer`, decai em `SHAKE_DURATION_S` = 0.3s) só decai dentro de
`fx.update(dt)`, chamado só quando `appScreen === 'match'` (`update()` em
`main.ts`). Quando o gol que dá fim à partida acontece (bate
`GOALS_TO_WIN`), `fx.triggerGoal()` arma o `shakeTimer`, mas a fase pula
direto pra `'ended'` (sem congelamento/replay — ver `rules.ts`), o que
troca `appScreen` pra `'endgame'` quase no mesmo instante — e a partir
daí `fx.update()` para de rodar, então `shakeTimer` fica travado num
valor > 0 pra sempre. O `render()`, porém, continua chamando
`fx.getShakeOffsetPx()` a cada quadro (roda pra qualquer `appScreen`), e
essa função gera um deslocamento aleatório novo toda vez que
`shakeTimer > 0` — resultado: tremedeira infinita, já que o timer nunca
chega a zero pra fazer o offset parar.

Corrigido chamando `fx.reset()` no início de `endMatchFlow()` (`main.ts`)
— zera shake/flash/trail/partículas assim que a partida termina de vez,
antes do modal aparecer. Confirmado ao vivo: forcei o gol que bate o
placar máximo (indo direto pra `'ended'`, o mesmo caminho do bug) e
comparei dois screenshots da tela de fim de jogo tirados com ~0.8s de
intervalo — pixel a pixel idênticos, sem tremedeira.

Também pedido: som de gol/torcida. O `goal()` de `audio/Audio.ts` era só
um tom + ruído curto; troquei por uma fanfarra (arpejo ascendente
C5-E5-G5-C6, 4 notas curtas em sequência) + um "grito de torcida"
sintetizado (`crowdCheer`: ruído filtrado passa-faixa ~1100Hz com
crescendo de 250ms e decaimento ao longo de 1.4s, simulando a
arquibancada reagindo). Continua tudo sintetizado via Web Audio API, sem
nenhum arquivo de áudio — mesmo padrão do resto do jogo. Pra agendar as 4
notas em sequência sem `setTimeout`, dei ao `tone()` um parâmetro
`startDelay` opcional que usa `ctx.currentTime + startDelay` (agendamento
nativo do Web Audio, preciso por sample). Não tem teste automatizado pra
áudio (assim como o resto do `Audio.ts`); validei rodando o evento de gol
de verdade no navegador e conferindo que não lança exceção no console.

## 17. Seta de direção, turbo (boost) e partida maior (7 gols / 4min)

Três pedidos do Mateus juntos:

**Seta em vez de linha.** `renderFacingArrow` (novo, em `render/
renderer.ts`) desenha uma haste + ponta triangular em vez da linha reta
original — mesma ideia (mostra facing/mira do chute), acabamento mais
"profissional". Confirmado ao vivo: a seta aparece nitidamente nos dois
jogadores durante uma partida de verdade (inclusive na tela de replay de
gol).

**Turbo (correr mais rápido segurando um botão).** Botão novo, separado
do dash — o dash já existente é um impulso instantâneo com stun em quem é
atingido (arma de combate corpo a corpo); o turbo é corrida sustentada
enquanto segura, sem interagir com o adversário. Design:

- `Player.boostStamina` (0..1, novo campo, igual ao `kickCharge`): começa
  em 1 (cheio) a cada kickoff (também depois de gol, já que
  `createKickoffFormation` roda de novo). Drena em `PHYS.BOOST_DRAIN_S`
  (1.5s) de uso contínuo, recarrega sozinho em `PHYS.BOOST_REGEN_S` (3s,
  o dobro — de propósito, pra ser "usar de vez em quando" e não botão de
  correr sempre mais rápido, como o Mateus pediu) quando não está em uso.
  Só drena se o jogador estiver de fato se movendo (segurar parado não
  gasta) e com `canAct`/sem estar em dash.
- `Command.boost: boolean` (segurado, não borda como o dash) — novo campo
  em todo lugar que constrói `Command` (input, IA, testes).
- `physics.ts`: `stepPlayerMovement` ganhou um parâmetro `boostHeld`;
  enquanto ativo, usa `PHYS.BOOST_ACCEL_MULT`/`BOOST_SPEED_MULT` (1.2x/
  1.35x) em vez dos valores normais de aceleração/velocidade máxima.
- Input: tecla nova (`ControlLeft` pro p1, `ShiftRight` pro p2 —
  `keyboard.ts`) e botão touch novo "TURBO" à esquerda do PONTAPÉ
  (`joystick.ts` + `renderer.ts`), com anel de combustível ao redor
  (cheio = sem anel, pra não poluir a tela; drenando/recarregando mostra
  a fração restante, mesmo padrão visual do anel de carga do chute).
  Também desenhei o mesmo anel ao redor do próprio jogador em campo
  (`renderPlayer`), não só no botão.
- IA: novo campo por perfil `AiProfile.boostUsage` (0..1, tabela em
  `ai/profiles.ts`: Novato 0.15, Profissional 0.5, Lenda 0.85) — decidido
  junto do `dashUsage` em `brain.ts`, rolagem independente (pode usar os
  dois, nenhum, ou só um).
- Testado: 5 testes novos em `physics.test.ts` (ultrapassa
  PLAYER_MAX_SPEED com combustível, respeita o teto do turbo, drena/
  recarrega, não gasta parado, não funciona atordoado) + confirmado ao
  vivo (anel de combustível no jogador e no botão touch, refletindo a
  stamina correta).

**Partida maior.** `MATCH.GOALS_TO_WIN` 4→7, `MATCH.DURATION_MS` 3→4
minutos (`core/constants.ts`) — a lógica de "acaba no que vier primeiro,
gols ou tempo" já existia (`simulation.ts`), só mudei os números. HUD já
lê `GOALS_TO_WIN` dinamicamente pros pingos de placar (`ui/hud.ts`), não
precisou mudar nada lá — confirmado ao vivo mostrando 7 pingos por lado.
Ajustei o teto de segurança (`MAX_TICKS`) do teste headless de
balanceamento de IA em `ai.test.ts`, que simula partidas completas, pra
não cortar partidas de verdade que agora podem durar até 4min +
prorrogação.

Cobertura de `core/` seguiu ~99.5% depois dessas mudanças (`vitest
--coverage`), sem nenhum caminho de física/regra novo sem teste. 157
testes no total (5 novos deste marco).

## 18. Revisão de jogabilidade mobile: DASH colidindo com a placa de anúncio

O Mateus pediu pra testar os controles no mobile e ajustar o que
precisasse. Testado em 3 tamanhos de tela deitada (568×320, 667×375,
736×414 — celular pequeno, médio e grande) via toque sintético de
verdade (`PointerEvent` com `pointerType: 'touch'`, multi-toque incluído)
direto no canvas, já que o clique da ferramenta de automação trava nesse
modo de emulação touch do navegador de teste (bug do ambiente de
automação, não do jogo — confirmado disparando `.click()` via JS, que
funciona instantâneo).

**Bug real encontrado e corrigido:** nas telas mais baixas (ex.:
568×320), o botão DASH — que ficava empilhado *acima* do PONTAPÉ — subia
alto o suficiente pra colidir visualmente com a placa de anúncio de campo
do canto superior direito (`pitch-ne`, ver seção 13/14 acima sobre a
faixa lateral de anúncios). Como o deslocamento vertical do DASH era
fixo em pixels de tela mas a altura da viewport varia, em telas baixas
esse deslocamento passava a ocupar uma fração grande demais da tela,
empurrando o botão pra cima demais.

Corrigido em `input/joystick.ts` (`computeTouchLayout`): os 3 botões
(turbo, dash, chute) agora ficam numa única fileira horizontal colada na
borda inferior direita, todos na mesma altura, em vez de dash empilhado
acima do chute. Isso prende o conjunto sempre perto do fundo da tela,
não importa o formato da viewport — testado nos 3 tamanhos acima, sem
sobreposição com a placa em nenhum deles.

**Verificado, sem problema:** a lógica de seleção de anúncios
(`adManager.ts`, `getActiveFieldSlots`) sempre prioriza `pitch-nw`/
`pitch-ne` (a ordem em `FIELD_SLOT_ORDER` + o limite de 2 visíveis
simultâneos faz as placas de baixo, `pitch-sw`/`pitch-se`, nunca serem
escolhidas enquanto as de cima estiverem visíveis) — confirma por que
isso nunca apareceu em nenhuma captura de tela desta sessão inteira.
Então o risco de as placas de baixo colidirem com a nova fileira de
botões (que ficou mais perto do fundo do campo) é baixo na prática,
mas não é garantido por código — fica registrado aqui como algo a
observar se algum dia a lógica de seleção de anúncio mudar.

**Confirmado funcionando (sem mudança de código, só validação):**
- Multi-toque de verdade: segurar TURBO com um dedo enquanto arrasta o
  joystick com outro drena o combustível corretamente (testado: 1.0 →
  0.71-0.78 em ~300-400ms de boost, batendo com `BOOST_DRAIN_S`).
- Toque em DASH dispara o cooldown (`dashCooldown` pulou pra ~2.4,
  perto do `DASH_COOLDOWN` de 2.5).
- Segurar PONTAPÉ carrega o chute (`kickCharge` > 0 enquanto segurado) e
  soltar dispara o chute (`kickCharge` volta a 0).
- Hit-test dos 3 botões bate com a posição calculada pela nova
  `computeTouchLayout` em todos os 3 tamanhos de tela testados.

`npx tsc --noEmit` limpo, 157/157 testes passando (nenhum teste
automatizado cobre `joystick.ts` diretamente — é código de DOM/Pointer
Events, testado manualmente como o resto do input).

## 19. Bola girando + borrão de movimento; jogador com seta pra fora e borda cinza

Três pedidos de polimento visual do Mateus:

**Bola "rolando" de verdade.** Antes era um círculo branco liso, sem
nenhuma pista visual de movimento além da posição mudando. Adicionei:

- `Fx.updateBallSpin(speed, radius, dt)` (novo, em `render/fx.ts`):
  acumula um ângulo de giro (`ballSpin`) proporcional à velocidade —
  `ω = velocidade/raio` (rolamento sem deslizar), com `% 2π` pra não
  crescer sem limite numa partida longa. É estilização pura (o jogo é
  top-down, esse eixo de giro não existiria numa câmera de cima de
  verdade), não física real — documentado assim no código pra não
  parecer um erro de física depois. Fica em `Fx` (fora de `core/`) pelo
  mesmo motivo do resto dos efeitos cosméticos: não precisa ser
  determinístico, não faz parte da simulação.
- `renderBall` (`render/renderer.ts`) ganhou um parâmetro `spin` opcional
  e desenha 3 "gomos" escuros (`rgba(11,11,14,0.55)`, recortados dentro
  do círculo da bola via `ctx.clip()`) espalhados a 120° um do outro,
  girando junto com `spin` — dá a leitura de bola girando, tipo os
  gomos escuros de uma bola de futebol de verdade.
- Verificado lendo pixels do canvas diretamente (`getImageData` na
  região da bola, contagem de pixels escuros mudando entre dois
  instantes com a bola em movimento) — mais confiável que inspecionar a
  bola visualmente numa captura de tela, já que ela é bem pequena em
  relação ao campo.

**Borrão de movimento.** `renderBallTrail` desenhava bolinhas de cor
sólida com alpha decrescente; troquei por gradiente radial (opaco no
centro, transparente na borda) por ponto do rastro — fica parecendo um
borrão suave de verdade, não bolinhas com contorno duro. Também passei a
escalar a intensidade pela velocidade atual da bola (`speedFactor =
min(1, speed/220)`) e não desenhar nada se a bola estiver parada/quase
parada (`speedFactor <= 0.03`) — sem isso, uma bola parada acumularia um
halo branco permanente ao redor dela (os pontos do rastro, todos na
mesma posição, se sobrepondo). `renderBallTrail` e `renderBall` (via
`renderBallWithSkin`) ganharam os parâmetros novos nos call sites de
`main.ts`.

**Jogador: seta só pra fora, borda cinza clara.** Dois ajustes em
`renderer.ts`/`theme.ts`:
- `renderFacingArrow` agora começa exatamente na borda do círculo (não
  mais no centro) — antes a haste da seta cruzava por cima do
  preenchimento colorido do jogador; agora só existe a parte que fica
  fora do círculo (haste curta + ponta), como o Mateus pediu.
- `THEME.PLAYER_OUTLINE`: preto (`#000000`) → cinza bem claro
  (`#D9D9DD`), único uso desse token no código (`renderPlayer`).

Nenhum teste automatizado cobre esse arquivo (é desenho puro em canvas,
mesma categoria de `renderer.ts` inteiro — sempre foi verificado
visualmente, não por `vitest`). `npx tsc --noEmit` limpo, 157/157 testes
passando (nada aqui mexeu em `core/`).
