import { Charge } from '../models/Charge.js';
import { Unit } from '../models/Unit.js';
import { competenceReferenceDate } from '../utils/date.js';
import { getCurrentPricingValue } from './pricing.service.js';

export async function generateMonthlyCharges(competence: string) {
  const referenceDate = competenceReferenceDate(competence);
  const units = await Unit.find({ status: 'ATIVA' });
  const created: string[] = [];

  for (const unit of units) {
    const monthlyValue = await getCurrentPricingValue(unit.tipo, referenceDate);
    const result = await Charge.updateOne(
      { unitId: unit._id, competence },
      {
        $setOnInsert: {
          unitId: unit._id,
          competence,
          valueOriginal: monthlyValue,
          valuePaid: 0,
          openBalance: monthlyValue,
          referenceDate,
          status: 'PENDING'
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      created.push(String(unit._id));
    }
  }

  return { generated: created.length, totalUnits: units.length };
}
