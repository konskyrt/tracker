const path = require('path');
const config = require('./task-config.json');

const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.MS_REFRESH_TOKEN;
const TENANT = 'consumers';

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Missing environment variables: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REFRESH_TOKEN');
  process.exit(1);
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token',
    scope: 'offline_access Calendars.ReadWrite'
  });

  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Token error: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

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
  const tasks = [...config.generalTasks];
  const extras = config.daySpecificTasks[dayName] || [];
  return [...tasks, ...extras];
}

function toISOWithTZ(date, hours, minutes) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

async function getExistingEvents(token, startDate, endDate) {
  const start = startDate.toISOString();
  const end = endDate.toISOString();
  const url = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${start}&endDateTime=${end}&$select=subject,start,end&$top=200`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch events: ${res.status} ${err}`);
  }

  const data = await res.json();
  return (data.value || []).map(e => e.subject);
}

async function createEvent(token, subject, startDateTime, endDateTime) {
  const event = {
    subject,
    start: { dateTime: startDateTime, timeZone: config.timezone },
    end: { dateTime: endDateTime, timeZone: config.timezone },
    isReminderOn: true,
    reminderMinutesBeforeStart: 15
  };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/calendar/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create event "${subject}": ${res.status} ${err}`);
  }

  return await res.json();
}

async function main() {
  console.log('Authenticating with Microsoft Graph...');
  const token = await getAccessToken();
  console.log('Authenticated successfully.\n');

  const monday = getNextMonday();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);

  console.log(`Creating events for week: ${monday.toDateString()} — ${new Date(sunday.getTime() - 86400000).toDateString()}\n`);

  const existingSubjects = await getExistingEvents(token, monday, sunday);
  console.log(`Found ${existingSubjects.length} existing events in this period.\n`);

  const [startHour, startMin] = config.dayStartTime.split(':').map(Number);
  let created = 0;
  let skipped = 0;

  for (let dayIndex = 0; dayIndex < config.days.length; dayIndex++) {
    const dayName = config.days[dayIndex];
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + dayIndex);
    const tasks = buildTasksForDay(dayName);

    console.log(`--- ${dayName} (${dayDate.toDateString()}) ---`);

    let currentHour = startHour;
    let currentMin = startMin;

    for (const task of tasks) {
      const eventSubject = `[ST] ${task.name}`;

      if (existingSubjects.includes(eventSubject)) {
        console.log(`  SKIP: "${task.name}" (already exists)`);
        skipped++;
        currentMin += task.duration;
        currentHour += Math.floor(currentMin / 60);
        currentMin = currentMin % 60;
        continue;
      }

      const startDT = toISOWithTZ(dayDate, currentHour, currentMin);
      currentMin += task.duration;
      currentHour += Math.floor(currentMin / 60);
      currentMin = currentMin % 60;
      const endDT = toISOWithTZ(dayDate, currentHour, currentMin);

      await createEvent(token, eventSubject, startDT, endDT);
      console.log(`  CREATED: "${task.name}" ${startDT.slice(11, 16)}–${endDT.slice(11, 16)} (${task.duration}min)`);
      created++;
    }
    console.log('');
  }

  console.log(`Done! Created ${created} events, skipped ${skipped} duplicates.`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
