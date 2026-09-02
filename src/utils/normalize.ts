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
