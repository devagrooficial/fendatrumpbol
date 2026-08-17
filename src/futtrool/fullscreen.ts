// Alterna tela cheia de verdade (esconde a barra de endereço do
// navegador) — pedido depois de testar no celular, onde a barra do Safari/
// Chrome fica sempre visível comendo espaço de tela.
//
// Limitação real de plataforma, não bug daqui: a Fullscreen API cobre
// Android Chrome e desktop de verdade, mas o Safari do iPhone não expõe
// `requestFullscreen` pra elementos genéricos (só pra <video>) — não tem
// jeito de contornar isso via JS. `isFullscreenSupported()` existe
// justamente pra quem chama poder detectar esse caso e mostrar uma
// alternativa (ver MenuScreen: sugere "Adicionar à Tela de Início", que aí
// sim abre em tela cheia de verdade no iOS).

export function isFullscreenSupported(): boolean {
  return typeof document.documentElement.requestFullscreen === 'function';
}

export function isFullscreenActive(): boolean {
  return document.fullscreenElement != null;
}

export async function toggleFullscreen(): Promise<void> {
  if (!isFullscreenSupported()) return;
  try {
    if (isFullscreenActive()) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Alguns navegadores recusam (ex.: não foi chamado direto de um gesto
    // do usuário) — falha silenciosa, o resto do jogo continua normal.
  }
}
