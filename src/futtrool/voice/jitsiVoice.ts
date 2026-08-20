// Canal de voz de uma partida online (1v1/2v2/3v3 e campeonato) — Jitsi
// Meet self-hosted (ver jitsi/stack.yml), carregado via IFrame API. Não
// usa @jitsi/react-sdk de propósito: esse projeto não é React, é TS/DOM
// puro (mesmo padrão das telas em ui/screens/).
//
// O servidor já restringe a sala pra só-áudio e sem botão de câmera
// nenhum (ver jitsi/stack.yml: START_AUDIO_ONLY/TOOLBAR_BUTTONS) — aqui
// no cliente o iframe de verdade fica fora da tela (só o áudio importa,
// não tem nada útil pra olhar) e toda interação passa pelo pill
// flutuante que esse módulo monta, nunca por dentro do iframe em si.
//
// Entra sempre MUDO por padrão (startWithAudioMuted) — decisão de UX, não
// de segurança: ninguém deveria ficar com o microfone ligado sem querer
// só por ter caído numa partida online.

import { t } from '../i18n';

const JITSI_DOMAIN = import.meta.env.VITE_JITSI_DOMAIN || 'voz.sysalmeida.com.br';

const MIC_ICON_MUTED = '🔇';
const MIC_ICON_LIVE = '🎙️';

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

type VoiceSession = {
  roomId: string;
  api: JitsiMeetExternalAPIInstance | null;
  iframeHost: HTMLDivElement;
  widget: HTMLDivElement;
  toggleButton: HTMLButtonElement;
  statusEl: HTMLSpanElement;
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
// à toa (corte de áudio + reconexão visível no pill a cada mudança no
// resto da chave).
export function startVoice(roomId: string, displayName: string): void {
  if (active?.roomId === roomId) return;
  stopVoice();

  // Fica fora da tela — o áudio funciona sem precisar de espaço visível
  // (offscreen em vez de display:none, que em alguns navegadores pausa
  // conteúdo de iframe escondido).
  const iframeHost = document.createElement('div');
  iframeHost.className = 'voice-widget__iframe-host';
  document.body.appendChild(iframeHost);

  const widget = document.createElement('div');
  widget.className = 'voice-widget';
  widget.innerHTML = `
    <button type="button" class="voice-widget__toggle" data-toggle disabled>${MIC_ICON_MUTED}</button>
    <span class="voice-widget__status" data-status>${t('voice.connecting')}</span>
  `;
  document.body.appendChild(widget);

  const toggleButton = widget.querySelector<HTMLButtonElement>('[data-toggle]');
  const statusEl = widget.querySelector<HTMLSpanElement>('[data-status]');
  if (!toggleButton || !statusEl) throw new Error('Markup do voice-widget incompleto');
  toggleButton.setAttribute('aria-label', t('voice.unmute'));

  const session: VoiceSession = { roomId, api: null, iframeHost, widget, toggleButton, statusEl };
  active = session;

  toggleButton.addEventListener('click', () => session.api?.executeCommand('toggleAudio'));

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
        toggleButton.disabled = false;
        statusEl.textContent = t('voice.connected');
      });
      api.addEventListener('audioMuteStatusChanged', (payload) => {
        if (active !== session) return;
        const muted = payload.muted ?? true;
        toggleButton.textContent = muted ? MIC_ICON_MUTED : MIC_ICON_LIVE;
        toggleButton.classList.toggle('voice-widget__toggle--live', !muted);
        toggleButton.setAttribute('aria-label', t(muted ? 'voice.unmute' : 'voice.mute'));
      });
      api.addEventListener('videoConferenceLeft', () => {
        if (active !== session) return;
        statusEl.textContent = t('voice.disconnected');
      });
    })
    .catch(() => {
      if (active !== session) return;
      statusEl.textContent = t('voice.error');
    });
}

export function stopVoice(): void {
  if (!active) return;
  active.api?.dispose();
  active.widget.remove();
  active.iframeHost.remove();
  active = null;
}
