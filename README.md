# Fenda do TrumpBol

Endless runner 3D de 3 pistas, jogável no navegador. Corrida por 3 biomas
neon que alternam com a distância — Cânion, Cidade Cyber e Caverna de Gelo —
chão escuro com faixas luminosas, névoa exponencial escondendo o horizonte.

100% original: geometria primitiva do Three.js, sem assets externos, sem
trilha licenciada (SFX sintetizados via Web Audio API).

## Como rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

Outros comandos:

```bash
npm run build   # build de produção (tsc --noEmit + vite build)
npm run test    # roda a suíte Vitest
npm run preview # serve o build de produção localmente
```

## Ranking online (Supabase)

O jogo tem um ranking online opcional: no fim de uma partida dá pra digitar
seu nome e enviar o score; o menu tem um botão "Ranking" com o top 10.
Sem configuração, essas telas ficam com uma mensagem de "não configurado"
em vez de quebrar.

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

## Controles

| Ação | Desktop | Mobile |
|---|---|---|
| Esquerda / Direita | `←` `→` ou `A` `D` | swipe horizontal |
| Pular | `↑` `W` ou `Espaço` | swipe para cima |
| Deslizar | `↓` ou `S` | swipe para baixo |
| Pausar | `Esc` ou `P` | botão "Pausar" no HUD |

## Mecânicas

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

## Arquitetura

```
src/
  main.ts                 bootstrap, loop principal
  config.ts                todas as constantes de tuning, centralizadas
  core/
    Game.ts                máquina de estados (MENU/PLAYING/PAUSED/GAME_OVER)
    Loop.ts                acumulador de delta time fixo
    Input.ts               teclado + swipe → ações abstratas
    Audio.ts               síntese de SFX via Web Audio API
    Storage.ts             highscore / moedas totais / som (localStorage)
    Ranking.ts             ranking online via REST do Supabase (fetch puro)
  world/
    Track.ts               coordenadas das 3 pistas
    ChunkManager.ts         pooling de chunks, obstáculos, moedas, gemas, power-up
    chunks.ts               catálogo de padrões + validador isSolvable
    Environment.ts          névoa, luz (+ hemisfério), cena
    biomes.ts               3 presets de bioma, cíclicos pela distância
  entities/
    Player.ts               malha, movimento, animação, hitbox
    characters.ts            presets de personagem (skin, cabelo, estilo)
    Obstacle.ts / Coin.ts / Gem.ts / PowerUp.ts / ImpactParticles.ts
  systems/
    Collision.ts            AABB
    Difficulty.ts           curva de velocidade e peso de dificuldade
    Score.ts                cálculo de score
  ui/
    HUD.ts / Screens.ts     score, moedas, gemas, power-up, menu, pause, game over, ranking
    icons.ts                 ícones SVG inline autorais (moeda, gema, troféu, pausa)
  test/                     suíte Vitest
supabase/
  schema.sql                SQL da tabela leaderboard + políticas de RLS
  migrations/                migrações incrementais (ex.: coluna de gemas)
```

Todo o tuning de gameplay (velocidade, gravidade, densidade, timers de
power-up etc.) vive em `src/config.ts`.
