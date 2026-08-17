// O Supabase Auth devolve mensagens de erro em inglês por padrão; o resto
// do site é todo pt-BR, então traduz os casos mais comuns aqui. Qualquer
// mensagem não mapeada passa direto (melhor mostrar o erro em inglês do
// que engolir a informação).

const KNOWN_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'User already registered': 'Já existe uma conta com esse e-mail.',
  'Password should be at least 6 characters': 'A senha precisa ter pelo menos 6 caracteres.',
  'Unable to validate email address: invalid format': 'E-mail inválido.',
  'Email not confirmed': 'E-mail ainda não confirmado.',
};

export function translateAuthError(message: string): string {
  if (KNOWN_MESSAGES[message]) return KNOWN_MESSAGES[message];
  if (message.startsWith('For security purposes')) {
    return 'Muitas tentativas seguidas — espera um pouco e tenta de novo.';
  }
  if (message.startsWith('Email address') && message.endsWith('is invalid')) {
    return 'E-mail inválido.';
  }
  return message;
}
