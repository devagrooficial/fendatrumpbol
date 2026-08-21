// Canal de voz de uma partida online (1v1/2v2/3v3 e campeonato) — Jitsi
// Meet self-hosted (ver jitsi/stack.yml), carregado via IFrame API. Não
// usa @jitsi/react-sdk de propósito: esse projeto não é React, é TS/DOM
// puro (mesmo padrão das telas em ui/screens/).
//
// O servidor já restringe a sala pra só-áudio e sem botão de câmera
// nenhum (ver jitsi/stack.yml: START_AUDIO_ONLY/TOOLBAR_BUTTONS) — aqui
// no cliente o iframe de verdade fica fora da tela (só o áudio importa,
// não tem nada útil pra olhar). Esse módulo só cuida da CONEXÃO — quem
// desenha o botão de mic é cada tela, dentro do card da própria pessoa
// (ver bindMicButton abaixo, usado em TournamentWaitingScreen e
// ui/MatchVoiceHud.ts), lendo o estado via subscribeVoiceState().
//
// Entra sempre MUDO por padrão (startWithAudioMuted) — decisão de UX, não
// de segurança: ninguém deveria ficar com o microfone ligado sem querer
// só por ter caído numa partida online.

import { t } from '../i18n';

const JITSI_DOMAIN = import.meta.env.VITE_JITSI_DOMAIN || 'voz.sysalmeida.com.br';

export const MIC_ICON_MUTED = '🔇';
export const MIC_ICON_LIVE = '🎙️';

type JitsiMuteEvent = { muted?: boolean };

interface JitsiMeetExternalAPIInstance {
  addEventListener(event: 'videoConferenceJoined' | 'videoConferenceLeft', listener: () => void): void;
  addEventListener(event: 'audioMuteStatusChanged', listener: (payload: JitsiMuteEvent) => void): void;
  executeCommand(command: string): void;
  dispose(): void;
}

interface JitsiMeetExternalAPIOptions {
  roomName: string;
  parentNode: HTMLElement;
  width: number;
  height: number;
  userInfo: { displayName: string };
  configOverwrite: Record<string, unknown>;
  interfaceConfigOverwrite: Record<string, unknown>;
}

interface JitsiMeetExternalAPIConstructor {
  new (domain: string, options: JitsiMeetExternalAPIOptions): JitsiMeetExternalAPIInstance;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiMeetExternalAPIConstructor;
  }
}

// Injeta o <script> do external_api.js uma vez só — chamadas concorrentes
// esperam a mesma Promise em vez de duplicar a tag.
let apiScriptPromise: Promise<JitsiMeetExternalAPIConstructor> | null = null;
function loadJitsiApi(): Promise<JitsiMeetExternalAPIConstructor> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve(window.JitsiMeetExternalAPI);
  if (!apiScriptPromise) {
    apiScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://${JITSI_DOMAIN}/external_api.js`;
      script.async = true;
      script.onload = () => {
        if (window.JitsiMeetExternalAPI) resolve(window.JitsiMeetExternalAPI);
        else reject(new Error('external_api.js carregou mas não expôs window.JitsiMeetExternalAPI'));
      };
      script.onerror = () => reject(new Error('Falha ao carregar external_api.js do Jitsi'));
      document.head.appendChild(script);
    });
  }
  return apiScriptPromise;
}

export type VoiceState = { status: 'idle' | 'connecting' | 'connected' | 'error'; muted: boolean };

const IDLE_STATE: VoiceState = { status: 'idle', muted: true };

let state: VoiceState = IDLE_STATE;
const listeners = new Set<(state: VoiceState) => void>();

function setState(next: VoiceState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

// Chamado por quem desenha o botão de mic (card da própria pessoa) — já
// dispara uma vez com o estado atual na hora de assinar, pra não esperar
// a primeira mudança só pra desenhar o ícone certo.
export function subscribeVoiceState(listener: (state: VoiceState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getVoiceState(): VoiceState {
  return state;
}

export function toggleMic(): void {
  active?.api?.executeCommand('toggleAudio');
}

type VoiceSession = {
  roomId: string;
  api: JitsiMeetExternalAPIInstance | null;
  iframeHost: HTMLDivElement;
};

// Uma sessão de voz por vez (uma partida OU o time de campeonato esperando,
// nunca os dois ao mesmo tempo — ver syncTournamentTeamVoice em main.ts).
// `active` também serve de "token" pra descartar o resultado de
// loadJitsiApi() se stopVoice() já rodou antes do script terminar de
// carregar (comparação por referência: se `active` mudou, essa chamada de
// startVoice() é velha).
let active: VoiceSession | null = null;

// Chamado toda vez que o bracket/fila do campeonato atualiza (não só
// quando MINHA sala de voz muda de verdade) — sem esse early-return, cada
// atualização não relacionada ao meu time derrubava e reconectava a voz
// à toa (corte de áudio + reconexão visível a cada mudança no resto da
// chave).
export function startVoice(roomId: string, displayName: string): void {
  if (active?.roomId === roomId) return;
  stopVoice();

  // Fica fora da tela — o áudio funciona sem precisar de espaço visível
  // (offscreen em vez de display:none, que em alguns navegadores pausa
  // conteúdo de iframe escondido).
  const iframeHost = document.createElement('div');
  iframeHost.className = 'voice-widget__iframe-host';
  document.body.appendChild(iframeHost);

  const session: VoiceSession = { roomId, api: null, iframeHost };
  active = session;
  setState({ status: 'connecting', muted: true });

  void loadJitsiApi()
    .then((JitsiMeetExternalAPI) => {
      if (active !== session) return; // stopVoice() já rodou antes do script carregar

      const api = new JitsiMeetExternalAPI(JITSI_DOMAIN, {
        roomName: roomId,
        parentNode: iframeHost,
        width: 1,
        height: 1,
        userInfo: { displayName },
        configOverwrite: {
          prejoinConfig: { enabled: false }, // entra direto, sem tela de "digite seu nome"
          startAudioOnly: true,
          startWithVideoMuted: true,
          startWithAudioMuted: true,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {},
      });
      session.api = api;

      api.addEventListener('videoConferenceJoined', () => {
        if (active !== session) return;
        setState({ status: 'connected', muted: true });
      });
      api.addEventListener('audioMuteStatusChanged', (payload) => {
        if (active !== session) return;
        setState({ status: 'connected', muted: payload.muted ?? true });
      });
      api.addEventListener('videoConferenceLeft', () => {
        if (active !== session) return;
        setState(IDLE_STATE);
      });
    })
    .catch(() => {
      if (active !== session) return;
      setState({ status: 'error', muted: true });
    });
}

export function stopVoice(): void {
  if (!active) return;
  active.api?.dispose();
  active.iframeHost.remove();
  active = null;
  setState(IDLE_STATE);
}

// Botão de mic pronto pra usar dentro do card da PRÓPRIA pessoa — reflete
// o estado ao vivo (ícone/aria-label) e liga o clique em toggleMic().
// Devolve uma função de limpeza: quem chama precisa guardar e invocar
// antes de recriar o botão (as telas que usam isso re-renderizam o card
// inteiro via innerHTML a cada atualização — sem desinscrever, sobra
// listener acumulado apontando pra um <button> que já nem existe mais no
// DOM).
export function bindMicButton(button: HTMLButtonElement): () => void {
  const render = (s: VoiceState): void => {
    button.disabled = s.status !== 'connected';
    button.textContent = s.muted ? MIC_ICON_MUTED : MIC_ICON_LIVE;
    button.classList.toggle('voice-mic-button--live', s.status === 'connected' && !s.muted);
    const labelKey = s.status === 'connecting' ? 'voice.connecting' : s.status === 'error' ? 'voice.error' : s.muted ? 'voice.unmute' : 'voice.mute';
    button.setAttribute('aria-label', t(labelKey));
  };
  const unsubscribe = subscribeVoiceState(render);
  const onClick = (): void => toggleMic();
  button.addEventListener('click', onClick);
  return () => {
    unsubscribe();
    button.removeEventListener('click', onClick);
  };
}
