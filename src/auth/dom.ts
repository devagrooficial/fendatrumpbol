// `querySelector` devolve `T | null`, e o TypeScript não consegue manter o
// estreitamento de "não é null" dentro de funções aninhadas declaradas
// depois (closures) — cada uma delas voltaria a reclamar que o elemento
// "pode ser null". Centralizando a checagem aqui (lançando na hora se não
// achar), o retorno já vem tipado como não-nulo pra sempre, sem precisar
// repetir `if (!x) throw` em cada arquivo de tela.
export function mustFind<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Elemento "${selector}" não encontrado`);
  return el;
}
