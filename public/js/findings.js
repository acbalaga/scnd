// Findings sheet (F3): turns the app's own results into questions to ask the installer.
// Pure: no DOM. Never a verdict, and no installer names anywhere (none are stored).
import { PR_BANDS } from './calc.js';

// PROPOSED, not yet confirmed by Fred: the degradation question goes on the sheet only from this many same-month
// pairs. Monthly sun data is noisy (5 to 10%) against a yearly loss under 1%, so one or two pairs would raise false alarms.
export const MIN_DEGRADATION_PAIRS = 6;

// The payback question needs about a year of bills: a rainy-season start always reads behind, however large the gap.
// Decided by Fred, 1 Oct 2026 (docs/NEXT.md task 12), replacing the 30 Sep "or more than 15% behind" exception.
// Before a year it is an awareness note.
export const PAYBACK_MIN_DAYS = 360;

const f0 = (v) => Math.round(v).toLocaleString('en-PH');
const f2 = (v) => v.toFixed(2);
const peso = (v) => 'PHP ' + Math.round(v).toLocaleString('en-PH');   // the sheet's font has no peso sign
// The app passes `period` in the same "1 Sep to 1 Oct 2026" style as the screen; raw dates are the fallback.
const span = (b) => b.period ?? `${b.start} to ${b.end}`;

// bills: oldest first, each { start, end, period?, pr, band, redRaised, actualKwh, expectedKwh, weather, flags, savings }
//   weather: null, or { wi, uncertain, inferred, source, split: { weather, system, total } }
//   hybridFlags: optional array, e.g. ['grid_charging']
// payback: null, or { saved, promised, days } (pesos to date, days since the first reading date)
// efficiency: null, or { baseline, latest, dropPoints, flagged } from calc.efficiencyDrop (fractions of 1)
// degradation: null, or { annualLossPct, pairs, exceedsWarranty, warrantyPct } from calc.degradation
// Returns { items: [{ id, text }], requests: [text], uncertainty: [text], allClear: boolean, allGreen: boolean }.
export function findings({ bills, payback, degradation = null, efficiency = null }) {
  const items = [];
  const last = bills[bills.length - 1];
  const raised = [...bills].reverse().find((b) => b.redRaised);

  if (raised) {
    items.push({ id: 'two_low', text: `PR was in the low range in two months in a row (latest: ${span(raised)}, PR ${f2(raised.pr)}). Has a shading check or panel cleaning been done? What does the inverter fault log show for these dates? Was string-level output compared?` });
  } else if (last && (last.band === 'amber' || last.band === 'red')) {
    items.push({ id: 'one_low', text: `PR for ${span(last)} was ${f2(last.pr)}, below the ${f2(PR_BANDS.green)} usual for a healthy system. One low month is not a fault. Does the design yield estimate for this month match what the system produced (${f0(last.actualKwh)} kWh)?` });
  }

  if (last?.weather && !last.weather.missing && last.weather.split.total > 0 && last.weather.split.system > 0) {
    const w = last.weather.split;
    const explained = w.weather >= 0
      ? `About ${f0(w.weather)} kWh of that is explained by weather and about ${f0(w.system)} kWh is not.`
      : `The weather was sunnier than typical, which should have added about ${f0(-w.weather)} kWh, so about ${f0(w.system)} kWh is not explained by weather.`;
    items.push({ id: 'weather_split', text: `For ${span(last)}, output was ${f0(w.total)} kWh below a typical period at PR ${f2(PR_BANDS.green)}. ${explained} What could account for the remaining ${f0(w.system)} kWh?` });
  }

  if (bills.some((b) => b.flags.includes('clipping'))) {
    items.push({ id: 'clipping', text: 'The panels are more than 1.3 times the inverter size. What clipping loss did the yield estimate assume, and how much energy does the inverter cap on sunny days?' });
  }
  if (bills.some((b) => b.flags.includes('no_export_after_activation'))) {
    items.push({ id: 'no_export', text: 'A bill shows 0 kWh exported although net metering is marked as active. When was the bi-directional meter installed, and from what date does the utility credit exports?' });
  }
  if (bills.some((b) => b.hybridFlags?.includes('grid_charging'))) {
    items.push({ id: 'grid_charging', text: 'In at least one bill the battery took in more energy than the solar left over after export, so some of it came from the grid. Is the battery set to charge from the grid (for example overnight or in backup mode), and what schedule was intended?' });
  }
  if (efficiency?.flagged) {
    items.push({ id: 'rte_drop', text: `Battery round-trip efficiency has been about ${Math.round(efficiency.dropPoints * 100)} points below the owner's first bills for two bills in a row (${Math.round(efficiency.baseline * 100)}% at the start, ${Math.round(efficiency.latest * 100)}% now). Has the battery or BMS firmware changed? Are there battery fault codes or temperature warnings? Is a round-trip efficiency stated in the battery warranty?` });
  }
  if (degradation && degradation.exceedsWarranty && degradation.pairs >= MIN_DEGRADATION_PAIRS) {
    items.push({ id: 'degradation', text: `Weather-adjusted PR is down about ${degradation.annualLossPct.toFixed(1)}% a year over ${degradation.pairs} same-month pair${degradation.pairs === 1 ? '' : 's'}, against a module warranty of ${degradation.warrantyPct}% a year. Monthly weather noise is large next to a yearly loss, so treat this as a reason to keep tracking. How does the installer measure degradation (IV curve, flash test)? What does the warranty require as evidence?` });
  }
  const behind = payback && payback.promised > 0 && payback.saved < payback.promised ? 1 - payback.saved / payback.promised : 0;
  const paybackRaised = behind > 0 && payback.days >= PAYBACK_MIN_DAYS;
  if (paybackRaised) {
    const gap = Math.round(behind * 100);
    items.push({ id: 'payback', text: `Savings so far are ${peso(payback.saved)} against ${peso(payback.promised)} at the promised payback pace (${gap}% behind). How was the promised payback worked out? Was the export credit assumed at the utility's generation charge or at the full retail rate? What rate increases were assumed?` });
  }

  const requests = [
    'Design yield estimate (kWh per kWp per year) and its assumptions: tilt, facing, shading and losses.',
    'Inverter fault and event log for the periods above.',
    'Module and inverter warranty terms, including the annual degradation rate.',
  ];

  const uncertainty = [
    'Sun data are estimates: satellite data can be off by 5 to 10% for one location and month, and dry-season figures can read low. One low month proves nothing, so a flag is raised only after two in a row.',
  ];
  // Early degradation readings are shown for awareness, not action: too few pairs to be a finding.
  if (degradation && degradation.pairs < MIN_DEGRADATION_PAIRS) {
    const dir = degradation.annualLossPct >= 0 ? 'down' : 'up';
    uncertainty.push(`Year-over-year check so far: weather-adjusted PR is about ${Math.abs(degradation.annualLossPct).toFixed(1)}% ${dir} a year over ${degradation.pairs} same-month pair${degradation.pairs === 1 ? '' : 's'}. That is too few months to act on, because monthly sun data is noisy. It is shown so you know it is being tracked.`);
  }
  if (behind > 0 && !paybackRaised) {
    uncertainty.push(`Savings so far are ${Math.round(behind * 100)}% behind the promised payback pace, over ${Math.round(payback.days)} days. Savings swing with the seasons, so this is not raised as a question until there is about a year of bills.`);
  }
  if (bills.some((b) => b.weather?.uncertain)) uncertainty.push('For at least one period the two weather sources disagreed by more than 5 points, so the weather call is uncertain.');
  if (bills.some((b) => b.weather?.inferred)) uncertainty.push('For at least one period the weather index came from a single source with no cross-check.');

  // allGreen backs the sheet's "within the usual range in every bill" line. allClear alone does not: an older
  // amber month raises no question once a later month is back in range.
  return { items, requests, uncertainty, allClear: items.length === 0, allGreen: bills.length > 0 && bills.every((b) => b.band === 'green') };
}
