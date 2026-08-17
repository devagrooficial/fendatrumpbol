import './styles.css';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { translateAuthError } from './errors';
import { upsertProfile } from './profile';
import { mustFind } from './dom';

const root = mustFind<HTMLDivElement>(document, '#auth');

root.innerHTML = `
  <div class="auth">
    <form class="auth__card" data-form>
      <h1 class="auth__title">Criar conta</h1>
      <p class="auth__subtitle">Jogos do Mateus Almeida</p>
      <div class="auth__field">
        <label for="nome">Nome</label>
        <input id="nome" name="nome" type="text" autocomplete="name" required />
      </div>
      <div class="auth__field">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="email" required />
      </div>
      <div class="auth__field">
        <label for="senha">Senha</label>
        <input id="senha" name="senha" type="password" autocomplete="new-password" minlength="6" required />
      </div>
      <div class="auth__field">
        <label for="confirma">Confirmar senha</label>
        <input id="confirma" name="confirma" type="password" autocomplete="new-password" minlength="6" required />
      </div>
      <p class="auth__message" data-message></p>
      <button type="submit" class="auth__button" data-submit>Criar conta</button>
      <div class="auth__links">
        <a href="/login.html">Já tenho conta</a>
      </div>
    </form>
  </div>
`;

const form = mustFind<HTMLFormElement>(root, '[data-form]');
const messageEl = mustFind<HTMLParagraphElement>(root, '[data-message]');
const submitButton = mustFind<HTMLButtonElement>(root, '[data-submit]');
const nomeInput = mustFind<HTMLInputElement>(root, '#nome');
const emailInput = mustFind<HTMLInputElement>(root, '#email');
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = nomeInput.value.trim();
    const email = emailInput.value.trim();
    const senha = senhaInput.value;
    const confirma = confirmaInput.value;

    if (senha !== confirma) {
      setMessage('As senhas não são iguais.', 'error');
      return;
    }

    submitButton.disabled = true;
    setMessage('Criando conta…');

    const { data, error } = await client.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } }, // guarda o nome também no user_metadata do próprio Auth
    });

    if (error) {
      setMessage(translateAuthError(error.message), 'error');
      submitButton.disabled = false;
      return;
    }

    // Sem confirmação de e-mail (desligada no painel do Supabase), o
    // signUp já devolve uma sessão ativa — com confirmação ligada, viria
    // sem sessão (precisa clicar no link do e-mail antes). Trata os dois
    // casos em vez de assumir qual está configurado.
    if (!data.session || !data.user) {
      setMessage('Conta criada! Confirme seu e-mail antes de entrar.', 'success');
      submitButton.disabled = false;
      return;
    }

    const { error: profileError } = await upsertProfile(data.user.id, email, nome);
    if (profileError) {
      // A conta já existe e a sessão já está ativa nesse ponto — não vale
      // a pena bloquear o acesso por causa só do perfil não ter sido
      // salvo em public.users; loga o erro e segue pro hub mesmo assim.
      console.error('[signup] falha ao gravar perfil em public.users:', profileError);
    }

    window.location.href = '/';
  });
}
