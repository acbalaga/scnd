// Calendar reminder (ticket #50).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminderIcs, nextReminderDate, REMINDER_UID } from '../public/js/reminder.js';

const ics = reminderIcs({ nextDate: '2026-12-01', now: new Date('2026-11-14T03:04:05.678Z') });

test('reminder golden: a valid monthly all-day event with an alarm', () => {
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR'); assert.equal(lines.at(-2), 'END:VCALENDAR'); assert.equal(lines.at(-1), '');
  for (const l of ['VERSION:2.0', `UID:${REMINDER_UID}`, 'DTSTAMP:20261114T030405Z', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261202',
    'RRULE:FREQ=MONTHLY', 'BEGIN:VALARM', 'TRIGGER:PT9H', 'END:VALARM']) assert.ok(lines.includes(l), l);
  assert.ok(lines.includes("SUMMARY:SCND: add this month's bill"));
});

test('reminder edge: CRLF only, every line at most 75 octets, text escaped', () => {
  assert.ok(!/[^\r]\n/.test(ics), 'bare LF');
  for (const l of ics.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75, l);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /DESCRIPTION:Have two numbers ready: the total kWh from this month's electricity bill\\, and the solar kWh/);
});

test('reminder edge: no bill figures, location or system details in the file', () => {
  for (const bad of [/\d+(\.\d+)? ?kWp/, /₱/, /lat|lon/i, /\b\d{2,}\.\d+\b/]) assert.doesNotMatch(ics.replace(/\r\n /g, ''), bad);
});

test('reminder golden: next date is a month after the last bill, capped at the 28th, and in the future', () => {
  assert.equal(nextReminderDate('2026-11-01', '2026-11-14'), '2026-12-01');
  assert.equal(nextReminderDate('2026-01-31', '2026-02-01'), '2026-02-28');
  assert.equal(nextReminderDate('2026-12-15', '2026-12-20'), '2027-01-15');
  assert.equal(nextReminderDate('2026-03-05', '2026-11-14'), '2026-12-05');   // old bills: the next one still to come
  assert.equal(nextReminderDate('', '2026-11-14'), null);
  assert.equal(reminderIcs({ nextDate: 'soon' }), null);
});
