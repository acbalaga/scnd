// Findings sheet (F3): turns the app's own results into questions to ask the installer.
// Pure: no DOM. Never a verdict, and no installer names anywhere (none are stored).
import { PR_BANDS } from './calc.js';

const f0 = (v) => Math.round(v).toLocaleString('en-PH');
const f2 = (v) => v.toFixed(2);
const peso = (v) => '₱' + Math.round(v).toLocaleString('en-PH');
const span = (b) => `${b.start} to ${b.end}`;

// bills: oldest first, each { start, end, pr, band, redRaised, actualKwh, expectedKwh, weather, flags, savings }
//   weather: null, or { wi, uncertain, inferred, source, split: { weather, system, total } }
// payback: null, or { saved, promised } (pesos to date)
// Returns { items: [{ id, text }], requests: [text], uncertainty: [text], allClear: boolean }.
export function findings({ bills, payback }) {
  const items = [];
  const last = bills[bills.length - 1];
  const raised = [...bills].reverse().find((b) => b.redRaised);

  if (raised) {
    items.push({ id: 'two_low', text: `PR was in the low range in two months in a row (latest: ${span(raised)}, PR ${f2(raised.pr)}). Questions: Has a shading check or panel cleaning been done? What does the inverter fault log show for these dates? Was string-level output compared?` });
  } else if (last && (last.band === 'amber' || last.band === 'red')) {
    items.push({ id: 'one_low', text: `PR for ${span(last)} was ${f2(last.pr)}, below the ${f2(PR_BANDS.green)} usual for a healthy system. One low month is not a fault. Question: Does the design yield estimate for this month match what the system produced (${f0(last.actualKwh)} kWh)?` });
  }

  if (last?.weather && !last.weather.missing && last.weather.split.total > 0 && last.weather.split.system > 0) {
    const w = last.weather.split;
    const explained = w.weather >= 0
      ? `About ${f0(w.weather)} kWh of that is explained by weather and about ${f0(w.system)} kWh is not.`
      : `The weather was sunnier than typical, which should have added about ${f0(-w.weather)} kWh, so about ${f0(w.system)} kWh is not explained by weather.`;
    items.push({ id: 'weather_split', text: `For ${span(last)}, output was ${f0(w.total)} kWh below a typical period at PR ${f2(PR_BANDS.green)}. ${explained} Question: What could account for the remaining ${f0(w.system)} kWh?` });
  }

  if (bills.some((b) => b.flags.includes('clipping'))) {
    items.push({ id: 'clipping', text: 'The panels are more than 1.3 times the inverter size. Question: What clipping loss did the yield estimate assume, and how much energy is the inverter capping on sunny days?' });
  }
  if (bills.some((b) => b.flags.includes('no_export_after_activation'))) {
    items.push({ id: 'no_export', text: 'A bill shows 0 kWh exported although net metering is marked as active. Question: When was the bi-directional meter installed, and from what date does the utility credit exports?' });
  }
  if (payback && payback.promised > 0 && payback.saved < payback.promised) {
    const gap = Math.round((1 - payback.saved / payback.promised) * 100);
    items.push({ id: 'payback', text: `Savings so far are ${peso(payback.saved)} against ${peso(payback.promised)} at the promised payback pace (${gap}% behind). Questions: How was the promised payback worked out? Was the export credit assumed at the utility's generation charge or at the full retail rate? What rate increases were assumed?` });
  }

  const requests = [
    'The design yield estimate (kWh per kWp per year) and its assumptions: tilt, facing, shading and system losses.',
    'The inverter fault and event log for the periods above.',
    'The module and inverter warranty terms, including the annual degradation rate.',
  ];

  const uncertainty = [
    'Sun data are estimates. Satellite sun data can be off by 5 to 10% at a single location for one month, and dry-season figures can read low. One low month proves nothing, so a flag is raised only after two in a row.',
  ];
  if (bills.some((b) => b.weather?.uncertain)) uncertainty.push('For at least one period the two weather sources disagreed by more than 5 points, so the weather call is uncertain.');
  if (bills.some((b) => b.weather?.inferred)) uncertainty.push('For at least one period the weather index came from a single source with no cross-check.');

  return { items, requests, uncertainty, allClear: items.length === 0 };
}
