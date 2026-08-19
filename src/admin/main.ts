import './styles.css';
import { requireAdmin } from './adminGate';
import { signOut } from '../auth/session';
import { mountPeopleScreen } from './screens/people';
import { mountStatsScreen } from './screens/stats';
import { mountAdsScreen } from './screens/ads';
import { mountStoreScreen } from './screens/store';
import { mountLiveScreen } from './screens/live';
import { mountSpectateScreen } from './screens/spectate';

type TabId = 'people' | 'stats' | 'ads' | 'store' | 'live';

const TABS: { id: TabId; label: string }[] = [
  { id: 'people', label: 'Pessoas' },
  { id: 'stats', label: 'Estatísticas' },
  { id: 'ads', label: 'Publicidade' },
  { id: 'store', label: 'Loja' },
  { id: 'live', label: 'Ao vivo' },
];

// Cada tela devolve uma função de limpeza (fecha WS, para intervalo etc.)
// — chamada sempre que trocamos de aba, pra não deixar coisa rodando em
// segundo plano numa tela que não está mais visível.
const SCREENS: Record<TabId, (el: HTMLElement) => () => void> = {
  people: mountPeopleScreen,
  stats: mountStatsScreen,
  ads: mountAdsScreen,
  store: mountStoreScreen,
  live: mountLiveScreen,
};

async function boot(): Promise<void> {
  const admin = await requireAdmin();
  if (!admin) return; // requireAdmin já cuidou do redirect/mensagem

  const root = document.querySelector<HTMLDivElement>('#admin');
  if (!root) throw new Error('#admin não encontrado');

  // Aba nova aberta a partir de um card em "Ao vivo" (ver
  // screens/live.ts) — tela cheia, sem a navegação normal do painel, só o
  // espectador. `roomId` some da URL de qualquer forma se essa aba for
  // recarregada, então não precisa limpar (?spectate=X só faz sentido na
  // primeira carga mesmo).
  const spectateRoomId = new URLSearchParams(window.location.search).get('spectate');
  if (spectateRoomId) {
    mountSpectateScreen(root, spectateRoomId);
    return;
  }

  root.innerHTML = `
    <header class="admin__header">
      <h1>Painel de administração</h1>
      <div class="admin__header-right">
        <span class="admin__email">${admin.email}</span>
        <button type="button" class="admin__button admin__button--secondary" data-logout>Sair</button>
      </div>
    </header>
    <nav class="admin__nav">
      ${TABS.map((tab, i) => `<button type="button" class="admin__tab${i === 0 ? ' admin__tab--active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
    </nav>
    <main class="admin__content" data-content></main>
  `;

  const content = root.querySelector<HTMLElement>('[data-content]');
  const tabButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tab]'));
  const logoutButton = root.querySelector<HTMLButtonElement>('[data-logout]');
  if (!content || !logoutButton) throw new Error('Markup do admin incompleto');

  let cleanup: (() => void) | null = null;

  function showTab(tab: TabId): void {
    tabButtons.forEach((button) => button.classList.toggle('admin__tab--active', button.dataset.tab === tab));
    cleanup?.();
    content!.innerHTML = '';
    cleanup = SCREENS[tab](content!);
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab as TabId));
  });

  logoutButton.addEventListener('click', () => void signOut('/login.html'));

  showTab('people');
}

void boot();
