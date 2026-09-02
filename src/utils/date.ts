export function competenceToDateRange(competence: string) {
  const [year, month] = competence.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

export function competenceReferenceDate(competence: string) {
  const [year, month] = competence.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 10));
}
