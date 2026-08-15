# Hub de Jogos

Site com um hub de seleção (`/`) e dois jogos 3D 100% no navegador, sem
backend de jogo (só localStorage, exceto o ranking opcional do runner):

- **[Fenda do TrumpBol](#fenda-do-trumpbol)** — endless runner de 3 pistas.
- **[Fly Simulator](#fly-simulator)** — voo livre com física arcade sobre
  terreno procedural.

100% original: geometria primitiva do Three.js, sem assets externos, sem
trilha licenciada (SFX sintetizados via Web Audio API).

## Como rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173` — cai no hub, de onde dá pra entrar em
qualquer um dos dois jogos.

Outros comandos:

```bash
npm run build   # build de produção (tsc --noEmit + vite build) — gera as 3 páginas
npm run test    # roda a suíte Vitest (runner + fly simulator)
npm run preview # serve o build de produção localmente
```

## Arquitetura

Site multi-página via Vite (`vite.config.ts` define 3 entradas de build:
`index.html`, `trumpbol.html`, `flysim.html`). Cada jogo é uma árvore de
código independente — o único código compartilhado é o acumulador de delta
fixo do loop (`src/shared/Loop.ts`), que não conhece o config de nenhum dos
dois.

```
index.html                  hub — "Escolha seu Jogo"
trumpbol.html                entrada do runner
flysim.html                  entrada do fly simulator
src/
  shared/
    Loop.ts                  acumulador de delta fixo (genérico, sem estado de jogo)
  hub/
    main.ts / styles.css     tela de seleção — dois cards, sem estado compartilhado
  main.ts                    bootstrap do runner (Fenda do TrumpBol)
  config.ts / core/ / world/ / entities/ / systems/ / ui/
                              todo o código do runner (ver seção abaixo)
  flysim/
    main.ts                  bootstrap do fly simulator
    config.ts                 todas as constantes de tuning, centralizadas
    core/
      Game.ts                 máquina de estados (MENU/PLAYING/PAUSED/GAME_OVER)
      Input.ts                 teclado + joystick virtual de toque → eixos contínuos
      Audio.ts                 síntese de SFX via Web Audio API (motor contínuo + eventos)
      Storage.ts               highscore / som (localStorage)
    systems/
      FlightPhysics.ts         funções puras de voo (sustentação/arrasto/estol) — sem THREE.js
    entities/
      Aircraft.ts               malha 100% primitiva + integração de física
    world/
      noise.ts                  ruído determinístico (hash trigonométrico, sem dependência nova)
      Terrain.ts                 funções puras de altura/zona/pista — sem THREE.js
      TerrainMesh.ts             malha do terreno + água + cenário via InstancedMesh
      Checkpoints.ts             geração pura do percurso de anéis
      CheckpointCourse.ts        anéis (pooled) + detecção de passagem
      Environment.ts             céu, névoa linear, sol/hemisfério/ambiente
    ui/
      HUD.ts / Screens.ts       velocidade, altitude, manete, combustível, checkpoints, menu, pause, game over
      icons.ts                   ícones SVG inline autorais
  test/                         suíte Vitest (runner + fly simulator)
supabase/
  schema.sql                    SQL da tabela leaderboard + políticas de RLS (ranking do runner)
  migrations/                    migrações incrementais (ex.: coluna de gemas)
```

---

## Fenda do TrumpBol

Endless runner 3D de 3 pistas. Corrida por 3 biomas neon que alternam com a
distância — Cânion, Cidade Cyber e Caverna de Gelo — chão escuro com faixas
luminosas, névoa exponencial escondendo o horizonte.

### Controles

| Ação | Desktop | Mobile |
|---|---|---|
| Esquerda / Direita | `←` `→` ou `A` `D` | swipe horizontal |
| Pular | `↑` `W` ou `Espaço` | swipe para cima |
| Deslizar | `↓` ou `S` | swipe para baixo |
| Pausar | `Esc` ou `P` | botão "Pausar" no HUD |

### Mecânicas

- **Seleção de personagem** no menu inicial: Aurora (mulher loira), Onix
  (homem negro) e Cristal (homem branco) — skin tone e cabelo (cor + estilo
  longo/curto) trocam sem recriar geometria, com preview ao vivo atrás do
  menu. Escolha persistida em `localStorage`.
- **Personagem detalhado**: mãos e tênis, squash/stretch ao pular/aterrissar
  e leve inclinação lateral durante a troca de pista.
- **3 pistas** com troca interpolada (120ms). Pulo é um arco parabólico;
  deslize reduz a hitbox e cancela um pulo em andamento com queda rápida.
- **Mundo procedural**: chunks de 30u reciclados via object pooling (nunca
  cria geometria em runtime). Catálogo de 20 padrões em 5 níveis de
  dificuldade, cada um validado por `isSolvable` — sempre existe um caminho
  de sobrevivência; padrões impossíveis são corrigidos automaticamente. A
  dificuldade 5 (desbloqueada a partir de 3500u) é o topo: combos densos de
  wall/movingBlock/barrier, sempre em transições de pista adjacentes.
- **3 biomas** alternando a cada 900u (cíclico): Cânion Neon, Cidade Cyber e
  Caverna de Gelo — só mudam a cor de materiais/luzes já existentes, sem
  recriar geometria.
- **Colisão AABB manual**: hit frontal mata; raspão ao trocar de pista
  empurra de volta e dá invulnerabilidade breve.
- **Economia**: moedas, gemas (colecionável raro, vale 50 pontos fora do
  multiplicador), score (`distância × multiplicador + moedas × 10 + gemas × 50`),
  highscore, moedas e gemas totais persistidos em `localStorage`.
- **4 power-ups** (8s de duração, exceto impulso: 3s), um ativo por vez:
  ímã (também puxa gemas), multiplicador ×2, escudo (absorve um hit fatal) e
  impulso (velocidade máxima + invulnerabilidade + câmera com FOV puxado +
  rastro de partículas).
- **Partículas reativas**: sparkle na coleta de moeda/gema, rastro no
  impulso e burst no impacto — tudo do mesmo pool de 18 partículas
  (`ImpactParticles`), nunca aloca geometria em runtime.

### Ranking online (Supabase)

O runner tem um ranking online opcional: no fim de uma partida dá pra
digitar seu nome e enviar o score; o menu tem um botão "Ranking" com o top
10. Sem configuração, essas telas ficam com uma mensagem de "não
configurado" em vez de quebrar.

Pra ativar:

1. Crie um projeto grátis em [supabase.com](https://supabase.com).
2. No **SQL Editor** do projeto, rode o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) — cria a tabela `leaderboard`
   e as políticas de RLS (leitura pública, inserção pública sem update/delete).
3. Copie `.env.example` para `.env.local` e preencha com a **Project URL** e
   a **anon public key** (Project Settings → API).
4. Reinicie `npm run dev`.

Se você já rodou o `schema.sql` antes da gema entrar no jogo, rode também
[`supabase/migrations/002_add_gems.sql`](supabase/migrations/002_add_gems.sql)
— senão o envio de score com gemas falha por falta da coluna.

Não usa o SDK do Supabase — é só `fetch` direto na REST API
(`src/core/Ranking.ts`), pra não precisar adicionar dependência.

---

## Fly Simulator

Voo livre com física arcade (sustentação/arrasto/estol simplificados) sobre
um terreno procedural único de 4 km², cruzando 4 zonas visuais — vale
verde, litoral, canyon e montanhas nevadas — com uma pista de pouso e um
percurso de anéis (checkpoints) espalhado em altitudes variadas.

Avião silhueta genérica de monomotor asa-alta ("estilo Cessna" só como
descrição de formato) — geometria 100% primitiva, pintura própria (branco +
azul + laranja), sem referência a nenhuma marca ou modelo real.

### Controles

| Ação | Desktop | Mobile |
|---|---|---|
| Manche (arfagem) | `W` `S` ou `↑` `↓` | arrasta o joystick virtual (vertical) |
| Rolagem | `A` `D` ou `←` `→` | arrasta o joystick virtual (horizontal) |
| Leme (guinada) | `Q` `E` | — (guinada vem da curva coordenada pela rolagem) |
| Manete (acelerar/desacelerar) | `Shift` / `Ctrl` | botões `+` / `−` |
| Pausar | `Esc` ou `P` | botão "Pausar" no HUD |

### Mecânicas

- **Física de voo arcade** (`systems/FlightPhysics.ts`, funções puras e
  testadas sem THREE.js): o manete acelera, o arrasto cresce com o
  quadrado da velocidade, subir freia e mergulhar acelera. Abaixo da
  velocidade de estol a sustentação cai progressivamente — o nariz é
  forçado pra baixo e o avião afunda, obrigando o jogador a mergulhar pra
  recuperar velocidade. A rolagem induz uma curva coordenada (guinada
  proporcional ao ângulo de inclinação), como em qualquer simulador arcade.
- **Terreno procedural único** (`world/Terrain.ts` + `world/noise.ts`): uma
  malha de ~40 mil vértices deslocados por *value noise* + fbm
  determinístico (hash trigonométrico, sem dependência nova) — mesma
  função de altura usada pra gerar a malha e pra colisão em runtime. 4
  zonas (vale, litoral, canyon, montanhas) definidas por setores angulares
  com fronteira distorcida por ruído, cada uma com amplitude e cor de
  vértice próprias; neve acima de uma linha de altitude nas montanhas,
  areia perto do nível da água.
- **Cenário instanciado**: árvores e rochas espalhadas via `THREE.InstancedMesh`
  (posições determinísticas por hash, sem `Math.random`) — poucas chamadas
  de draw mesmo com mais de mil peças.
- **Pista de pouso**: retângulo achatado e mesclado suavemente ao relevo ao
  redor (sem degrau nem pista flutuante). Tocar o chão fora da pista, ou
  dentro dela acima da velocidade/afundamento seguros, é colisão fatal;
  tocar dentro dos limites seguros é um pouso (bônus de score + combustível,
  sem terminar a partida).
- **Percurso de checkpoints**: 8 anéis (`TorusGeometry`) em espiral
  determinística ao redor do mapa, cruzando as 4 zonas em altitudes bem
  variadas — força o jogador a subir e mergulhar, não só virar. O HUD
  mostra uma seta (rumo relativo) e a distância até o próximo; o anel alvo
  fica em destaque laranja.
- **Combustível como cronômetro regressivo**: some com o tempo; checkpoints
  e pousos devolvem uma fração. Chegar a zero termina a partida — condição
  central de game over, junto da colisão fatal.
- **Score** = distância voada + checkpoints × valor + pousos × bônus;
  highscore em `localStorage` (`flysim.*`, chaves próprias, sem cruzar com
  o runner).
- **Áudio sintetizado**: motor com osciloscópio contínuo (frequência/ganho
  seguem o manete), chime de checkpoint, chime de pouso, som de colisão e
  de combustível zerado.
