export function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function buildUnitKey(quadra: string, numero: string, tipo: string) {
  return `${normalizeText(quadra)}-${normalizeText(numero)}-${normalizeText(tipo)}`;
}

export function normalizeBankName(value: string) {
  return stripControlCharacters(value)
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function stripControlCharacters(value: string) {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
}
