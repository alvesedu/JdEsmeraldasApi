import { MonthlyClosing } from '../models/MonthlyClosing.js';
import { AppError } from '../utils/AppError.js';

export async function assertCompetenceOpen(competence: string) {
  const closing = await MonthlyClosing.findOne({ competence, status: 'CLOSED' }).select('competence status').lean();
  if (closing) assertPeriodOpenStatus(closing.status, competence);
}

export async function assertCompetencesOpen(competences: string[]) {
  const unique = [...new Set(competences.filter(Boolean))];
  if (unique.length === 0) return;
  const closed = await MonthlyClosing.find({ competence: { $in: unique }, status: 'CLOSED' })
    .select('competence status')
    .lean();
  if (closed.length > 0) assertPeriodOpenStatus('CLOSED', closed[0].competence);
}

export async function assertDatesOpen(dates: Date[]) {
  await assertCompetencesOpen(dates.map((date) => date.toISOString().slice(0, 7)));
}

export function assertPeriodOpenStatus(status: string, competence: string) {
  if (status === 'CLOSED') {
    throw new AppError(`Competence ${competence} is closed and does not accept financial changes`, 409);
  }
}
