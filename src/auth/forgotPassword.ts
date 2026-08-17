import './styles.css';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { translateAuthError } from './errors';
import { mustFind } from './dom';

const root = mustFind<HTMLDivElement>(document, '#auth');

root.innerHTML = `
  <div class="auth">
    <form class="auth__card" data-form>
      <h1 class="auth__title">Esqueci minha senha</h1>
      <p class="auth__subtitle">Manda um link de redefinição pro seu e-mail</p>
      <div class="auth__field">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="email" required />
      </div>
      <p class="auth__message" data-message></p>
      <button type="submit" class="auth__button" data-submit>Enviar link</button>
      <div class="auth__links">
        <a href="/login.html">Voltar pro login</a>
      </div>
    </form>
  </div>
`;

const form = mustFind<HTMLFormElement>(root, '[data-form]');
const messageEl = mustFind<HTMLParagraphElement>(root, '[data-message]');
const submitButton = mustFind<HTMLButtonElement>(root, '[data-submit]');
const emailInput = mustFind<HTMLInputElement>(root, '#email');

function setMessage(text: string, kind: 'error' | 'success' | '' = ''): void {
  messageEl.textContent = text;
  messageEl.className = `auth__message${kind ? ` auth__message--${kind}` : ''}`;
}

if (!isSupabaseConfigured() || !supabase) {
  setMessage('Supabase não configurado (faltam variáveis de ambiente).', 'error');
  submitButton.disabled = true;
} else {
  const client = supabase;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitButton.disabled = true;
    setMessage('Enviando…');

    const { error } = await client.auth.resetPasswordForEmail(emailInput.value.trim(), {
      redirectTo: `${window.location.origin}/reset-password.html`,
    });

    if (error) {
      setMessage(translateAuthError(error.message), 'error');
      submitButton.disabled = false;
      return;
    }

    // Mensagem genérica de propósito, mesma com e-mail existente ou não —
    // não dá pra confirmar "esse e-mail existe" sem virar uma forma de
    // descobrir contas cadastradas (enumeração de usuários).
    setMessage('Se esse e-mail tiver conta, enviamos um link de redefinição.', 'success');
    form.reset();
    submitButton.disabled = false;
  });
}
