// "Remind me next month" (ticket #50): a calendar file made in the browser, so owners come back for the next bill.
// Pure: no DOM. RFC 5545: CRLF line endings, lines folded at 75 octets, text escaped, DTSTAMP in UTC, all-day event.
// The file holds only the reminder text and a date: no bill figures, location or system details.

export const REMINDER_UID = 'scnd-monthly-bill@myscnd.app';   // stable, so a second download updates the same event
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

// A month after `iso` (YYYY-MM-DD), on the same day, or on the 28th when the day is later: a monthly repeat on the 29th
// to 31st would skip the months that lack that day. Rolled forward a month at a time until it is after `today`.
export function nextReminderDate(iso, today) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const end = new Date(t), day = Math.min(end.getUTCDate(), 28);
  let y = end.getUTCFullYear(), m = end.getUTCMonth() + 1;
  const after = Date.parse(today);
  let d = new Date(Date.UTC(y, m, day));
  while (Number.isFinite(after) && d.getTime() <= after) { m += 1; d = new Date(Date.UTC(y, m, day)); }
  return d.toISOString().slice(0, 10);
}

// Escape TEXT values (RFC 5545 3.3.11) and fold lines longer than 75 octets.
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '', n = 0, limit = 75;
  for (const ch of line) {
    const w = new TextEncoder().encode(ch).length;
    if (n + w > limit) { out.push(cur); cur = ''; n = 0; limit = 74; }   // continuation lines start with a space
    cur += ch; n += w;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// nextDate: YYYY-MM-DD of the first reminder. now: a Date, for DTSTAMP.
export function reminderIcs({ nextDate, now = new Date() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate || '')) return null;
  const start = new Date(Date.parse(nextDate)), stop = new Date(start.getTime() + 86400000);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const desc = 'Have two numbers ready: the total kWh from this month\'s electricity bill, and the solar kWh from your inverter app for the same dates. Then open https://myscnd.app/ and load your save file, or it opens with your bills if you kept them on this device.';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SCND//Monthly reminder//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${REMINDER_UID}`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(stop)}`, 'RRULE:FREQ=MONTHLY',
    `SUMMARY:${esc("SCND: add this month's bill")}`, `DESCRIPTION:${esc(desc)}`, 'URL:https://myscnd.app/', 'TRANSP:TRANSPARENT',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc("SCND: add this month's bill")}`, 'TRIGGER:PT9H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
