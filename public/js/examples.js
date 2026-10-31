// Made-up example systems for "Try an example" and "Try a hybrid example". Pure: no DOM, no fetch.
// Figures are invented to show how SCND reads a system; they are not anyone's real data. The 9.70 generation charge
// and 12 per kWh buying rate are example figures in the range of Meralco's September 2026 schedule (docs/SPEC.md
// sources, Blueshift, 29 Sep 2026). Real rates are always read from the owner's own bill (CLAUDE.md rule 5).
import { poaPeriod } from './calc.js';

const GEN = 9.70, BUY = 12, FIXED = 620;

// Bill periods run from the 1st of a month to the 1st of the next, ending at the 1st of the current month.
function periods(n, now) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const iso = (mm) => new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 10);
  return Array.from({ length: n }, (_, k) => [iso(m - n + k), iso(m - n + k + 1)]);
}

export const EXAMPLES = {
  // Quick look: an on-grid Manila system, two bills, the second a little low.
  ongrid: {
    place: 'Manila',
    setup: { lat: 14.6, lon: 121, kWp: 5.5, acKw: 5, tilt: 10, azimuth: 0, commissioned: '', hybrid: false, netMetering: true, cost: '', promisedYears: '', warrantyPct: '', batteryCost: '' },
  },
  // Everything at once: a Cebu hybrid over 14 months, with costs, payback promise and warranty filled in. The battery
  // gives back about 92% at first and about 84% in the last two bills, which raises the efficiency-drop question
  // (calc.efficiencyDrop: 5 points below the first three bills, two bills running).
  hybrid: {
    place: 'Cebu',
    setup: { lat: 10.3, lon: 123.9, kWp: 6, acKw: 5, tilt: 10, azimuth: 0, commissioned: '', hybrid: true, netMetering: true, cost: 620000, promisedYears: 6, warrantyPct: 0.55, batteryCost: 210000 },
  },
};

const ONGRID_PR = [0.79, 0.70];
const HYBRID_PR = [0.80, 0.79, 0.78, 0.80, 0.77, 0.76, 0.74, 0.78, 0.79, 0.80, 0.78, 0.71, 0.77, 0.78];
const HYBRID_RTE = [0.92, 0.93, 0.91, 0.92, 0.92, 0.91, 0.92, 0.93, 0.92, 0.91, 0.92, 0.91, 0.85, 0.84];

// Returns bill objects with the fields the app keeps (numbers, chargeUnit 'amount'). climate: { ghi, dif } from grid.js.
export function exampleBills(kind, { climate, now = new Date() }) {
  const ex = EXAMPLES[kind], s = ex.setup;
  const sun = ([start, end]) => poaPeriod({ ghi: climate.ghi, dif: climate.dif, tilt: s.tilt, azimuth: s.azimuth, lat: s.lat, start, end }).hPoa;
  const money = (bought, sent) => {
    const variable = Math.round(bought * BUY);
    return { chargeUnit: 'amount', genAmount: Math.round(bought * GEN * 100) / 100, varCharges: variable, total: Math.round(Math.max(variable - sent * GEN, 0) + FIXED) };
  };
  if (kind === 'ongrid') {
    return periods(ONGRID_PR.length, now).map((p, k) => {
      const solar = Math.round(ONGRID_PR[k] * s.kWp * sun(p)), used = Math.round(solar * 0.4), sent = solar - used, bought = 450 - used;
      return { start: p[0], end: p[1], inverterKwh: solar, importKwh: bought, exportKwh: sent, ...money(bought, sent) };
    });
  }
  return periods(HYBRID_PR.length, now).map((p, k) => {
    const solar = Math.round(HYBRID_PR[k] * s.kWp * sun(p));
    const charged = 165 + (k % 4) * 5, discharged = Math.round(charged * HYBRID_RTE[k]);
    const sent = Math.round(solar * 0.12), used = solar - sent - charged + discharged, bought = Math.max(720 - used, 40);
    return { start: p[0], end: p[1], inverterKwh: solar, importKwh: bought, exportKwh: sent, chargeKwh: charged, dischargeKwh: discharged, ...money(bought, sent) };
  });
}
