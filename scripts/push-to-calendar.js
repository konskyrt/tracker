const fs = require('fs');
const path = require('path');
const config = require('./task-config.json');

function getNextMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function buildTasksForDay(dayName) {
  return [...config.generalTasks, ...(config.daySpecificTasks[dayName] || [])];
}

function pad(n) { return String(n).padStart(2, '0'); }

function icsDateTime(date, hours, minutes) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(hours)}${pad(minutes)}00`;
}

function uid(dayIndex, taskIndex) {
  const monday = getNextMonday();
  return `st-${monday.toISOString().slice(0, 10)}-d${dayIndex}-t${taskIndex}@konskyrt`;
}

function generateICS() {
  const monday = getNextMonday();
  const [startHour, startMin] = config.dayStartTime.split(':').map(Number);
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}Z`;

  let events = '';

  for (let dayIndex = 0; dayIndex < config.days.length; dayIndex++) {
    const dayName = config.days[dayIndex];
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + dayIndex);
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
        `UID:${uid(dayIndex, taskIndex)}`,
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
    });
  }

  const weekEnd = new Date(monday);
  weekEnd.setDate(monday.getDate() + 6);

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schedule Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Schedule Tracker`,
    `X-WR-TIMEZONE:${config.timezone}`,
    '',
    events,
    'END:VCALENDAR',
    ''
  ].join('\r\n');

  return { ics, monday, weekEnd };
}

const { ics, monday, weekEnd } = generateICS();
const outPath = path.join(__dirname, '..', 'schedule.ics');
fs.writeFileSync(outPath, ics);

console.log(`Generated schedule.ics for week: ${monday.toDateString()} — ${weekEnd.toDateString()}`);
console.log(`File: ${outPath}`);
