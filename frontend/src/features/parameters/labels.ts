import type { RateNameValue } from '@depadmin/shared';

/** Each rate as the building calls it, and what one unit of it is. */
export const RATES: Record<RateNameValue, { readonly title: string; readonly unit: string }> = {
  maintenanceFee: { title: 'Cuota de mantenimiento', unit: 'por depto, cada mes' },
  cleaningPerVisit: { title: 'Limpieza', unit: 'por visita' },
  garbageWeekly: { title: 'Basura', unit: 'por semana' },
  shiftSkipPenalty: { title: 'Multa por no tomar el turno', unit: 'por cada mes que no toma' },
};
