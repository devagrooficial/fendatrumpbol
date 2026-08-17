import './styles.css';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { translateAuthError } from './errors';
import { mustFind } from './dom';

const root = mustFind<HTMLDivElement>(document, '#auth');

root.innerHTML = `
  <div class="auth">
    <form class="auth__card" data-form>
      <h1 class="auth__title">Nova senha</h1>
      <div class="auth__field">
        <label for="senha">Nova senha</label>
        <input id="senha" name="senha" type="password" autocomplete="new-password" minlength="6" required />
      </div>
      <div class="auth__field">
        <label for="confirma">Confirmar nova senha</label>
        <input id="confirma" name="confirma" type="password" autocomplete="new-password" minlength="6" required />
      </div>
      <p class="auth__message" data-message></p>
      <button type="submit" class="auth__button" data-submit>Salvar nova senha</button>
      <div class="auth__links">
        <a href="/login.html">Voltar pro login</a>
      </div>
    </form>
  </div>
`;

const form = mustFind<HTMLFormElement>(root, '[data-form]');
const messageEl = mustFind<HTMLParagraphElement>(root, '[data-message]');
const submitButton = mustFind<HTMLButtonElement>(root, '[data-submit]');
const senhaInput = mustFind<HTMLInputElement>(root, '#senha');
const confirmaInput = mustFind<HTMLInputElement>(root, '#confirma');

function setMessage(text: string, kind: 'error' | 'success' | '' = ''): void {
  messageEl.textContent = text;
  messageEl.className = `auth__message${kind ? ` auth__message--${kind}` : ''}`;
}

if (!isSupabaseConfigured() || !supabase) {
  setMessage('Supabase não configurado (faltam variáveis de ambiente).', 'error');
  submitButton.disabled = true;
} else {
  const client = supabase;

  // A página só funciona chegando pelo link do e-mail de redefinição — o
  // SDK lê o token da própria URL (hash/query) sozinho ao carregar
  // (`detectSessionInUrl`, ligado por padrão) e dispara o evento
  // PASSWORD_RECOVERY quando termina. Sem isso (alguém abrindo a URL
  // direto, ou link expirado), não tem sessão pra trocar a senha.
  submitButton.disabled = true;
  setMessage('Verificando o link…');

  let ready = false;

  const markReady = (): void => {
    if (ready) return;
    ready = true;
    setMessage('');
    submitButton.disabled = false;
  };

  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') markReady();
  });

  void client.auth.getSession().then(({ data }) => {
    if (data.session) markReady();
  });

  // Se depois de um tempo nada confirmou sessão, o link provavelmente
  // expirou ou já foi usado — avisa em vez de deixar o botão desabilitado
  // pra sempre sem explicação.
  setTimeout(() => {
    if (!ready) setMessage('Link inválido ou expirado. Peça um novo em "Esqueci minha senha".', 'error');
  }, 4000);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (senhaInput.value !== confirmaInput.value) {
      setMessage('As senhas não são iguais.', 'error');
      return;
    }

    submitButton.disabled = true;
    setMessage('Salvando…');

    const { error } = await client.auth.updateUser({ password: senhaInput.value });

    if (error) {
      setMessage(translateAuthError(error.message), 'error');
      submitButton.disabled = false;
      return;
    }

    setMessage('Senha atualizada! Entrando…', 'success');
    window.location.href = '/';
  });
}
