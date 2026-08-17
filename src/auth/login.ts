import './styles.css';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { translateAuthError } from './errors';
import { mustFind } from './dom';

const root = mustFind<HTMLDivElement>(document, '#auth');

root.innerHTML = `
  <div class="auth">
    <form class="auth__card" data-form>
      <h1 class="auth__title">Entrar</h1>
      <p class="auth__subtitle">Jogos do Mateus Almeida</p>
      <div class="auth__field">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="email" required />
      </div>
      <div class="auth__field">
        <label for="senha">Senha</label>
        <input id="senha" name="senha" type="password" autocomplete="current-password" required />
      </div>
      <p class="auth__message" data-message></p>
      <button type="submit" class="auth__button" data-submit>Entrar</button>
      <div class="auth__links">
        <a href="/forgot-password.html">Esqueci minha senha</a>
        <a href="/signup.html">Criar conta</a>
      </div>
    </form>
  </div>
`;

const form = mustFind<HTMLFormElement>(root, '[data-form]');
const messageEl = mustFind<HTMLParagraphElement>(root, '[data-message]');
const submitButton = mustFind<HTMLButtonElement>(root, '[data-submit]');
const emailInput = mustFind<HTMLInputElement>(root, '#email');
const senhaInput = mustFind<HTMLInputElement>(root, '#senha');

function setMessage(text: string, kind: 'error' | 'success' | '' = ''): void {
  messageEl.textContent = text;
  messageEl.className = `auth__message${kind ? ` auth__message--${kind}` : ''}`;
}

if (!isSupabaseConfigured() || !supabase) {
  setMessage('Supabase não configurado (faltam variáveis de ambiente).', 'error');
  submitButton.disabled = true;
} else {
  const client = supabase;

  // Sessão já ativa (ex.: aba antiga aberta) — não faz sentido mostrar o
  // login de novo, manda direto pro hub.
  void client.auth.getSession().then(({ data }) => {
    if (data.session) window.location.href = '/';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitButton.disabled = true;
    setMessage('Entrando…');

    const { error } = await client.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: senhaInput.value,
    });

    if (error) {
      setMessage(translateAuthError(error.message), 'error');
      submitButton.disabled = false;
      return;
    }

    window.location.href = '/';
  });
}
