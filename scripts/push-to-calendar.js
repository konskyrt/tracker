const fs = require('fs');
const path = require('path');
const config = require('./task-config.json');

const WEEKS_AHEAD = 5;

function getCurrentMonday() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = date.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  date.setDate(date.getDate() - diff);
  return date;
}

function buildTasksForDay(dayName) {
  return [...config.generalTasks, ...(config.daySpecificTasks[dayName] || [])];
}

function pad(n) { return String(n).padStart(2, '0'); }

function icsDateTime(date, hours, minutes) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(hours)}${pad(minutes)}00`;
}

function generateICS() {
  const startMonday = getCurrentMonday();
  const [startHour, startMin] = config.dayStartTime.split(':').map(Number);
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  let events = '';
  let totalEvents = 0;

  for (let week = 0; week < WEEKS_AHEAD; week++) {
    const weekMonday = new Date(startMonday);
    weekMonday.setDate(startMonday.getDate() + week * 7);
    const weekId = weekMonday.toISOString().slice(0, 10);

    for (let dayIndex = 0; dayIndex < config.days.length; dayIndex++) {
      const dayName = config.days[dayIndex];
      const dayDate = new Date(weekMonday);
      dayDate.setDate(weekMonday.getDate() + dayIndex);
      const tasks = buildTasksForDay(dayName);

      let curH = startHour;
      let curM = startMin;

      tasks.forEach((task, taskIndex) => {
        const dtStart = icsDateTime(dayDate, curH, curM);
        curM += task.duration;
        curH += Math.floor(curM / 60);
        curM = curM % 60;
        const dtEnd = icsDateTime(dayDate, curH, curM);

        events += [
          'BEGIN:VEVENT',
          `UID:st-${weekId}-d${dayIndex}-t${taskIndex}@konskyrt`,
          `DTSTAMP:${stamp}`,
          `DTSTART;TZID=${config.timezone}:${dtStart}`,
          `DTEND;TZID=${config.timezone}:${dtEnd}`,
          `SUMMARY:[ST] ${task.name}`,
          `DESCRIPTION:Schedule Tracker - ${dayName}`,
          'STATUS:CONFIRMED',
          'BEGIN:VALARM',
          'TRIGGER:-PT15M',
          'ACTION:DISPLAY',
          `DESCRIPTION:Starting soon: ${task.name}`,
          'END:VALARM',
          'END:VEVENT',
          ''
        ].join('\r\n');
        totalEvents++;
      });
    }
  }

  const lastSunday = new Date(startMonday);
  lastSunday.setDate(startMonday.getDate() + (WEEKS_AHEAD * 7) - 1);

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schedule Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Schedule Tracker',
    `X-WR-TIMEZONE:${config.timezone}`,
    '',
    events,
    'END:VCALENDAR',
    ''
  ].join('\r\n');

  return { ics, startMonday, lastSunday, totalEvents };
}

const { ics, startMonday, lastSunday, totalEvents } = generateICS();
const outPath = path.join(__dirname, '..', 'schedule.ics');
fs.writeFileSync(outPath, ics);

console.log(`Generated schedule.ics with ${totalEvents} events`);
console.log(`Period: ${startMonday.toDateString()} — ${lastSunday.toDateString()} (${WEEKS_AHEAD} weeks)`);
