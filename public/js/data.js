// Save and load. "Save my data" downloads a JSON file; "Load" reads it back. Nothing is stored by us.
// Pure: no DOM, no fetch. parse() copies only the fields we know, so a hand-edited or hostile file cannot
// inject anything else into the app state. No installer names are stored (there is no such field).

export const FORMAT = 'scnd';
export const VERSION = 1;
const MAX_BYTES = 1_000_000;
const MAX_BILLS = 60;

const SETUP_NUM = ['lat', 'lon', 'kWp', 'acKw', 'tilt', 'azimuth', 'cost', 'promisedYears', 'warrantyPct', 'batteryCost'];
const SETUP_BOOL = ['hybrid', 'netMetering'];
const BILL_NUM = ['inverterKwh', 'importKwh', 'exportKwh', 'genRate', 'genAmount', 'varRate', 'varCharges', 'total', 'outageHours', 'chargeKwh', 'dischargeKwh', 'homeLoadKwh'];
const BILL_DATE = ['start', 'end'];

const isBlank = (v) => v === '' || v === null || v === undefined;
const num = (v) => (isBlank(v) ? '' : typeof v === 'number' && Number.isFinite(v) ? v : null);   // null = invalid
const date = (v) => (isBlank(v) ? '' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null);
const month = (v) => (isBlank(v) ? '' : typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);

export function serialize(setup, bills, savedOn = new Date()) {
  const s = {};
  for (const k of SETUP_NUM) s[k] = isBlank(setup[k]) ? '' : Number(setup[k]);
  for (const k of SETUP_BOOL) s[k] = setup[k] === true;
  s.commissioned = setup.commissioned || '';
  s.place = setup.place || '';
  const b = bills.map((x) => {
    const o = {};
    for (const k of BILL_DATE) o[k] = x[k] || '';
    for (const k of BILL_NUM) o[k] = isBlank(x[k]) ? '' : Number(x[k]);
    o.chargeUnit = x.chargeUnit === 'rate' ? 'rate' : 'amount';
    return o;
  });
  return JSON.stringify({ format: FORMAT, version: VERSION, saved: savedOn.toISOString().slice(0, 10), setup: s, bills: b }, null, 2);
}

// Returns { setup, bills } or { error: 'message' }.
export function parse(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) return { error: 'That file is too large to be a SCND file.' };
  let j;
  try { j = JSON.parse(text); } catch { return { error: 'That file is not a SCND save file (it is not valid JSON).' }; }
  if (!j || j.format !== FORMAT) return { error: 'That file is not a SCND save file.' };
  if (j.version !== VERSION) return { error: `This save file is version ${j.version}. This page reads version ${VERSION}.` };
  if (!j.setup || typeof j.setup !== 'object' || !Array.isArray(j.bills)) return { error: 'The save file is missing its setup or bills.' };
  if (j.bills.length > MAX_BILLS) return { error: `A save file holds at most ${MAX_BILLS} bills.` };

  const setup = {};
  for (const k of SETUP_NUM) { setup[k] = num(j.setup[k]); if (setup[k] === null) return { error: `Setup field "${k}" is not a number.` }; }
  for (const k of SETUP_BOOL) setup[k] = j.setup[k] === true;
  setup.commissioned = month(j.setup.commissioned);
  if (setup.commissioned === null) return { error: 'Setup field "commissioned" is not a month.' };
  setup.place = typeof j.setup.place === 'string' ? j.setup.place.slice(0, 60) : '';

  const bills = [];
  for (const [i, x] of j.bills.entries()) {
    if (!x || typeof x !== 'object') return { error: `Bill ${i + 1} is not readable.` };
    const o = {};
    for (const k of BILL_DATE) { o[k] = date(x[k]); if (o[k] === null) return { error: `Bill ${i + 1}: "${k}" is not a date.` }; }
    for (const k of BILL_NUM) { o[k] = num(x[k]); if (o[k] === null) return { error: `Bill ${i + 1}: "${k}" is not a number.` }; }
    if (x.chargeUnit === 'rate' || x.chargeUnit === 'amount') o.chargeUnit = x.chargeUnit;
    else {
      // Saved before the amounts/per-kWh choice (4 Oct 2026): generation charge per kWh, variable charges in pesos.
      // Open it as amounts, with the generation amount worked out to the centavo, so the variable charges stay as typed.
      o.chargeUnit = 'amount';
      if (o.genAmount === '' && o.genRate !== '' && o.importKwh !== '') o.genAmount = Math.round(o.genRate * o.importKwh * 100) / 100;
    }
    bills.push(o);
  }
  return { setup, bills };
}

// "Keep my data on this device" (ticket #43, Fred, 14 Nov 2026). Opt-in. The kept copy is the same text a save file holds,
// stored in this browser's local storage under STORAGE_KEY, and read back through parse(), so a damaged or edited copy
// gets the same checks as a hostile file. Never sent anywhere. The made-up examples are never kept.
export const STORAGE_KEY = 'scnd-data';
// Text to keep, or null when nothing should be written (an example is on screen).
export function keptText({ setup, bills, example, savedOn = new Date() }) {
  return example ? null : serialize(setup, bills, savedOn);
}
// { setup, bills } from a kept copy, or null when there is none or it fails the save-file checks.
export function restoreKept(text) {
  if (typeof text !== 'string' || !text) return null;
  const r = parse(text);
  return r.error ? null : r;
}
