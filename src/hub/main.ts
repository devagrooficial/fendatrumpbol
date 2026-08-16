import './styles.css';

const ICON_RUNNER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="14" cy="4.5" r="1.8" fill="currentColor" stroke="none"/>' +
  '<path d="M9 20l2-5 3 1 3 4M11 15l1-4 4-2M8 11l3-2 2 3"/>' +
  '</svg>';

const ICON_PLANE =
  '<svg viewBox="0 0 24 24" fill="currentColor">' +
  '<path d="M21 16v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V18l-2.5 2v1.5l3.5-1 3.5 1V20l-2.5-2v-4.5z"/>' +
  '</svg>';

const ICON_BALL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="9.2" fill="currentColor" fill-opacity="0.08"/>' +
  '<path d="M12 7.2l3.9 2.8-1.5 4.6H9.6l-1.5-4.6L12 7.2z" fill="currentColor"/>' +
  '<path d="M12 7.2V3.6M15.9 10l3.3-2.4M14.4 14.6l1.6 4.2M9.6 14.6l-1.6 4.2M8.1 10 4.8 7.6"/>' +
  '</svg>';

const root = document.querySelector<HTMLDivElement>('#hub');
if (!root) throw new Error('#hub não encontrado');

root.innerHTML = `
  <h1 class="hub__title">Escolha seu Jogo</h1>
  <div class="hub__grid">
    <a class="game-card game-card--trumpbol" href="/trumpbol.html">
      <span class="game-card__icon">${ICON_RUNNER}</span>
      <h2 class="game-card__title">Fenda do TrumpBol</h2>
      <p class="game-card__desc">Corrida infinita de 3 pistas por biomas neon</p>
      <span class="game-card__play">Jogar</span>
    </a>
    <a class="game-card game-card--flysim" href="/flysim.html">
      <span class="game-card__icon">${ICON_PLANE}</span>
      <h2 class="game-card__title">Fly Simulator</h2>
      <p class="game-card__desc">Voo livre por cenários abertos, cheque os checkpoints</p>
      <span class="game-card__play">Jogar</span>
    </a>
    <a class="game-card game-card--futtrool" href="/futtrool.html">
      <span class="game-card__icon">${ICON_BALL}</span>
      <h2 class="game-card__title">FutTrool</h2>
      <p class="game-card__desc">Futebol 1v1 top-down contra a IA, partidas de 3 minutos</p>
      <span class="game-card__play">Jogar</span>
    </a>
  </div>
  <p class="hub__credits">Feito por: Mateus Almeida</p>
`;
