// Strings de UI centralizadas (spec seção 7: "pt-BR como padrão, strings
// centralizadas... você vai querer en-US depois"). Só existe pt-BR por
// enquanto — `t()` já isola todo o resto do código de onde as strings
// moram, então adicionar um segundo idioma depois é só trocar o JSON
// carregado aqui, sem tocar em telas.

import strings from './pt-BR.json';

type Strings = typeof strings;
type Key = keyof Strings;

export function t(key: Key, params?: Record<string, string | number>): string {
  const template = strings[key] ?? key;
  if (!params) return template;
  return Object.entries(params).reduce<string>(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    template,
  );
}
