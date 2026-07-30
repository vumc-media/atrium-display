// Builds a 1920x1080 Atrium overlay for vMix.
// - Transparent live-video opening for PP7/NDI placed underneath in vMix
// - Embedded Welcome Center feed
// - Planning Center ICS events
// - Local time/date and Versailles weather
// - Service countdown
// - VUMC Connect QR and ticker
//
// Required GitHub Actions secret:
//   ICS_URL = public Planning Center calendar .ics URL

import https from 'https';
import fs from 'fs';

const ICS_URL = process.env.ICS_URL;

if (!ICS_URL) {
  console.error(
    'Missing ICS_URL. Add a repository secret named ICS_URL containing the Planning Center .ics URL.'
  );
  process.exit(1);
}

const CONFIG = {
  brand: 'Versailles United Methodist Church',
  timezone: 'America/New_York',
  daysAhead: 21,
  maxItems: 28,
  welcomeCenterUrl: 'https://welcome-center.netlify.app/',
  connectUrl: 'https://vumc.versaillesumc.org',
  latitude: 38.052,
  longitude: -84.729,
  ticker:
    'Rooted Youth — Sunday at 4:00 PM • Cornerstones Potluck — Thursday at Noon • Prayer Meeting — Wednesday at 6:30 PM',
  services: [
    { day: 0, start: '09:30', end: '10:15', label: 'Traditional Worship' },
    { day: 0, start: '10:30', end: '11:45', label: 'Contemporary Worship' }
  ]
};

fetchText(ICS_URL)
  .then((ics) => {
    const now = new Date();
    const until = new Date(now.getTime() + CONFIG.daysAhead * 86400000);

    const events = parseICS(ics)
      .filter((event) => {
        if (!event.start) return false;
        const start = new Date(event.start);
        return start >= now && start <= until;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, CONFIG.maxItems);

    fs.writeFileSync('index.html', renderHtml(events), 'utf8');
    console.log('Wrote index.html');
  })
  .catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
  });

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          fetchText(response.headers.location).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`ICS fetch failed: ${response.statusCode}`));
          return;
        }

        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

/* ======================== ICS parsing ======================== */

function getLine(block, name) {
  const match = block.match(new RegExp(`^${name}([^:\\n]*):([^\\n]+)`, 'm'));
  if (!match) return null;

  const params = {};
  (match[1] || '').replace(
    /;([^=;:]+)=([^;:]+)/g,
    (_, key, value) => {
      params[key.toUpperCase()] = value;
      return '';
    }
  );

  return { value: match[2].trim(), params };
}

function getSimple(block, name) {
  const match = block.match(
    new RegExp(`^${name}(?:;[^:\\n]+)?:([^\\n]+)`, 'm')
  );
  return match ? match[1].trim() : '';
}

function timeZoneOffsetAt(utcDate, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(utcDate).map((part) => [part.type, part.value])
  );

  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return wallClockAsUtc - utcDate.getTime();
}

function wallClockToUtcIso(year, month, day, hour, minute, second, timeZone) {
  const provisional = Date.UTC(year, month, day, hour, minute, second);
  const offset = timeZoneOffsetAt(new Date(provisional), timeZone);
  return new Date(provisional - offset).toISOString();
}

function toIsoWithZone(line, defaultTimeZone) {
  if (!line) return null;

  const value = line.value;
  const timeZone = line.params?.TZID || defaultTimeZone;

  if (/^\d{8}$/.test(value)) {
    return wallClockToUtcIso(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
      0,
      0,
      0,
      timeZone
    );
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return new Date(value).toISOString();
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    return wallClockToUtcIso(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
      Number(value.slice(9, 11)),
      Number(value.slice(11, 13)),
      Number(value.slice(13, 15)),
      timeZone
    );
  }

  return new Date(value).toISOString();
}

function parseICS(ics) {
  const unfolded = ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const blocks = unfolded
    .split('BEGIN:VEVENT')
    .slice(1)
    .map((block) => `BEGIN:VEVENT${block}`);

  const unescapeText = (value) =>
    String(value || '')
      .replace(/\\n/g, ' ')
      .replace(/\\,/g, ',')
      .replace(/\\\\/g, '\\')
      .trim();

  return blocks.map((block) => {
    const startLine = getLine(block, 'DTSTART');
    const endLine = getLine(block, 'DTEND');
    const allDay =
      startLine?.params?.VALUE === 'DATE' ||
      Boolean(startLine && /^\d{8}$/.test(startLine.value));

    return {
      title: unescapeText(getSimple(block, 'SUMMARY')) || 'Untitled',
      location: unescapeText(getSimple(block, 'LOCATION')),
      allDay,
      start: toIsoWithZone(startLine, CONFIG.timezone),
      end: toIsoWithZone(endLine, CONFIG.timezone)
    };
  });
}

/* ======================== Formatting ======================== */

function escapeHtml(value) {
  return String(value || '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  );
}

function dateKey(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function formatDayHeading(value) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.timezone,
    hour: 'numeric',
    minute: '2-digit'
  })
    .format(new Date(value))
    .replace(' AM', 'a')
    .replace(' PM', 'p');
}

function renderSchedule(events) {
  const groups = new Map();

  for (const event of events) {
    const key = dateKey(event.start);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  if (!groups.size) {
    return `
      <article class="day-card day-blue">
        <h3>No upcoming events</h3>
        <p>Check VUMC Connect for the latest schedule.</p>
      </article>`;
  }

  const colorClasses = [
    'day-orange',
    'day-blue',
    'day-green',
    'day-purple',
    'day-copper'
  ];

  return [...groups.entries()]
    .slice(0, 5)
    .map(([_, dayEvents], index) => {
      const items = dayEvents
        .slice(0, 6)
        .map((event) => {
          const when = event.allDay ? 'All day' : formatTime(event.start);
          return `
            <div class="event-row">
              <span class="event-name">${escapeHtml(event.title)}</span>
              <span class="event-time">${escapeHtml(when)}</span>
            </div>`;
        })
        .join('');

      return `
        <article class="day-card ${colorClasses[index % colorClasses.length]}">
          <h3>${escapeHtml(formatDayHeading(dayEvents[0].start))}</h3>
          <div class="event-list">${items}</div>
        </article>`;
    })
    .join('');
}

function renderHtml(events) {
  const scheduleHtml = renderSchedule(events);
  const configJson = JSON.stringify(CONFIG).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atrium Display</title>
<style>
:root{
  --navy-950:#07111f;
  --navy-900:#0b1728;
  --navy-800:#12243c;
  --navy-700:#1b3659;
  --blue:#2787df;
  --gold:#e0b84f;
  --text:#fff;
  --muted:rgba(255,255,255,.76);
  --border:rgba(255,255,255,.14);
  --radius:18px;
}
*{box-sizing:border-box}
html,body{
  width:100%;
  height:100%;
  margin:0;
  overflow:hidden;
  background:transparent;
  color:var(--text);
  font-family:Arial,Helvetica,sans-serif;
}
#viewport{
  position:fixed;
  inset:0;
  overflow:hidden;
  background:transparent;
}
#stage{
  position:absolute;
  left:50%;
  top:50%;
  width:1920px;
  height:1080px;
  transform-origin:center center;
}
.layout{
  width:100%;
  height:100%;
  padding:18px;
  display:grid;
  grid-template-columns:390px 1fr;
  grid-template-rows:1fr 116px;
  gap:14px;
}
.left{
  min-height:0;
  display:grid;
  grid-template-rows:278px 1fr 126px;
  gap:14px;
}
.right{
  min-height:0;
  display:grid;
  grid-template-rows:126px 1fr 292px;
  gap:14px;
}
.card{
  position:relative;
  overflow:hidden;
  border:1px solid var(--border);
  border-radius:var(--radius);
  background:linear-gradient(145deg,rgba(27,54,89,.98),rgba(9,24,42,.98));
  box-shadow:0 14px 34px rgba(0,0,0,.35);
}
.welcome-card{padding:20px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:15px}
.brand img{
  width:48px;height:48px;border-radius:12px;object-fit:cover;background:#fff
}
.brand-name{font-size:17px;font-weight:900;letter-spacing:.06em}
.eyebrow{
  color:var(--gold);text-transform:uppercase;letter-spacing:.16em;
  font-size:12px;font-weight:900;margin-bottom:7px
}
.welcome-title{margin:0;font-size:32px;line-height:1.02;font-weight:900}
.count-label{margin-top:13px;color:var(--muted);font-weight:800;font-size:14px}
.countdown{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
.countbox{
  padding:10px 5px;text-align:center;background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.11);border-radius:12px
}
.countbox strong{display:block;font-size:22px;line-height:1;margin-bottom:5px}
.countbox span{
  display:block;font-size:9px;text-transform:uppercase;letter-spacing:.1em;
  color:var(--muted);font-weight:800
}
.feed-card{
  min-height:0;display:grid;grid-template-rows:66px 1fr;padding:14px
}
.section-label{
  color:var(--gold);text-transform:uppercase;letter-spacing:.14em;
  font-size:11px;font-weight:900
}
.section-title{margin-top:5px;font-size:19px;font-weight:900}
.frame-wrap{
  min-height:0;overflow:hidden;border-radius:13px;background:#0a1525;
  border:1px solid rgba(255,255,255,.1)
}
iframe{display:block;width:100%;height:100%;border:0;background:transparent}
.info-card{
  display:grid;grid-template-columns:1fr auto;align-items:center;padding:17px 19px
}
.clock-time{font-size:34px;font-weight:900;line-height:1}
.clock-date{margin-top:7px;color:var(--muted);font-size:14px;font-weight:700}
.weather{text-align:right}
.weather-temp{font-size:30px;font-weight:900;line-height:1}
.weather-label{margin-top:7px;color:var(--muted);font-size:13px;max-width:150px}
.topbar{
  display:grid;grid-template-columns:1fr auto;align-items:center;padding:20px 24px
}
.topbar-title{font-size:31px;font-weight:900;line-height:1}
.topbar-subtitle{margin-top:8px;color:var(--muted);font-size:15px;font-weight:700}
.live-pill{
  padding:10px 14px;border-radius:999px;background:#c92835;color:#fff;
  font-weight:900;letter-spacing:.05em
}
.video-window{
  position:relative;min-height:0;background:transparent;
  border:2px solid rgba(255,255,255,.30);border-radius:var(--radius);
  box-shadow:0 0 0 1px rgba(39,135,223,.22),0 14px 34px rgba(0,0,0,.35);
  overflow:hidden
}
.video-window::after{
  content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  box-shadow:inset 0 0 38px rgba(0,0,0,.18)
}
.video-label{
  position:absolute;left:18px;bottom:16px;z-index:2;padding:9px 13px;
  border-radius:10px;background:rgba(5,14,25,.78);font-weight:900;font-size:16px
}
.schedule{
  min-height:0;display:grid;grid-template-columns:repeat(2,1fr);
  gap:10px;overflow:hidden
}
.day-card{
  min-height:0;padding:14px 18px;border-radius:16px;
  border:1px solid rgba(255,255,255,.12);overflow:hidden
}
.day-card h3{margin:0 0 8px;font-size:22px}
.event-list{display:grid;gap:7px}
.event-row{
  display:grid;grid-template-columns:1fr auto;gap:16px;
  font-size:15px;font-weight:800;line-height:1.1
}
.event-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.event-time{white-space:nowrap}
.day-orange{background:linear-gradient(135deg,#b94f0d,#d97b23)}
.day-blue{background:linear-gradient(135deg,#1a4d7f,#2e76b7)}
.day-green{background:linear-gradient(135deg,#226b38,#398f4e)}
.day-purple{background:linear-gradient(135deg,#4d246f,#743a91)}
.day-copper{background:linear-gradient(135deg,#9f4b16,#ca6d1f)}
.bottom-bar{
  grid-column:1/-1;display:grid;grid-template-columns:470px 1fr;gap:0;
  align-items:stretch
}
.connect-block{
  display:flex;align-items:center;gap:16px;padding:12px 18px;
  background:#f7f9fc;color:#0d1a2d
}
.qr{width:82px;height:82px;background:#fff}
.connect-kicker{
  color:#1763aa;text-transform:uppercase;letter-spacing:.08em;
  font-size:12px;font-weight:900
}
.connect-title{margin-top:4px;font-size:22px;font-weight:900}
.connect-copy{margin-top:3px;color:#4c5b70;font-size:13px;font-weight:700}
.ticker{
  display:flex;align-items:center;overflow:hidden;
  background:linear-gradient(145deg,rgba(20,35,58,.99),rgba(8,19,33,.99));
  border-left:1px solid rgba(255,255,255,.1)
}
.ticker-label{
  align-self:stretch;display:flex;align-items:center;padding:0 22px;
  background:#145fa8;font-weight:900;letter-spacing:.05em;white-space:nowrap
}
.ticker-track{position:relative;width:100%;overflow:hidden;white-space:nowrap}
.ticker-text{
  display:inline-block;padding-left:100%;animation:ticker 32s linear infinite;
  font-size:17px;font-weight:700
}
@keyframes ticker{
  from{transform:translateX(0)}
  to{transform:translateX(-100%)}
}
</style>
</head>
<body>
<div id="viewport">
  <div id="stage">
    <main class="layout">
      <aside class="left">
        <section class="card welcome-card">
          <div class="brand">
            <img
              src="https://yt3.googleusercontent.com/0VzY1FMygvH9BmYV_gu_hNyZsW1kY5VPDdeRtHxyzfcXtqM5Rc6Kongrr_dw3v5I_hwJv63vIQ=s900-c-k-c0x00ffffff-no-rj"
              alt="Versailles UMC logo"
            >
            <div class="brand-name">VERSAILLES UMC</div>
          </div>
          <div class="eyebrow">Atrium Display</div>
          <h1 class="welcome-title">Welcome to Versailles UMC</h1>
          <div class="count-label" id="countLabel">Next service starts in</div>
          <div class="countdown" id="countdown"></div>
        </section>

        <section class="card feed-card">
          <div>
            <div class="section-label">Welcome Center</div>
            <div class="section-title">Information &amp; Sign-Ups</div>
          </div>
          <div class="frame-wrap">
            <iframe
              title="Welcome Center"
              src="${escapeHtml(CONFIG.welcomeCenterUrl)}"
            ></iframe>
          </div>
        </section>

        <section class="card info-card">
          <div>
            <div class="clock-time" id="clockTime">--:--</div>
            <div class="clock-date" id="clockDate">Loading date…</div>
          </div>
          <div class="weather">
            <div class="weather-temp" id="weatherTemp">--°</div>
            <div class="weather-label" id="weatherLabel">Loading local weather…</div>
          </div>
        </section>
      </aside>

      <section class="right">
        <header class="card topbar">
          <div>
            <div class="topbar-title">${escapeHtml(CONFIG.brand)}</div>
            <div class="topbar-subtitle" id="serviceStatus">
              Worship, connection, and community
            </div>
          </div>
          <div class="live-pill">● LIVE FEED</div>
        </header>

        <section class="video-window" aria-label="Transparent live-video opening">
          <div class="video-label" id="videoLabel">Sanctuary Live</div>
        </section>

        <section class="schedule">
          ${scheduleHtml}
        </section>
      </section>

      <footer class="card bottom-bar">
        <div class="connect-block">
          <canvas id="qr" class="qr" width="82" height="82"></canvas>
          <div>
            <div class="connect-kicker">Stay connected</div>
            <div class="connect-title">VUMC Connect</div>
            <div class="connect-copy">
              Events • Giving • Check-In • Prayer Requests
            </div>
          </div>
        </div>

        <div class="ticker">
          <div class="ticker-label">UPCOMING</div>
          <div class="ticker-track">
            <div class="ticker-text">${escapeHtml(CONFIG.ticker)}</div>
          </div>
        </div>
      </footer>
    </main>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js"></script>
<script>
const CONFIG = ${configJson};
const byId = (id) => document.getElementById(id);

function scaleStage() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const stage = byId('stage');
  stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
}
window.addEventListener('resize', scaleStage);
scaleStage();

new QRious({
  element: byId('qr'),
  value: CONFIG.connectUrl,
  size: 82,
  level: 'H'
});

function formatTimeZone(date, options) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.timezone,
    ...options
  }).format(date);
}

function partsInTimeZone(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const output = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') output[part.type] = part.value;
  }
  return output;
}

function weekdayIndex(shortName) {
  return {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3,
    Thu: 4, Fri: 5, Sat: 6
  }[shortName];
}

function minutesFromTime(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function scheduleStatus(now = new Date()) {
  const parts = partsInTimeZone(now);
  const day = weekdayIndex(parts.weekday);
  const currentMinute = Number(parts.hour) * 60 + Number(parts.minute);

  for (const service of CONFIG.services) {
    if (
      service.day === day &&
      currentMinute >= minutesFromTime(service.start) &&
      currentMinute < minutesFromTime(service.end)
    ) {
      return { active: service, next: null };
    }
  }

  for (let offset = 0; offset < 8; offset++) {
    const checkDay = (day + offset) % 7;
    const candidates = CONFIG.services
      .filter((service) => service.day === checkDay)
      .sort(
        (a, b) =>
          minutesFromTime(a.start) - minutesFromTime(b.start)
      );

    for (const service of candidates) {
      if (offset > 0 || minutesFromTime(service.start) > currentMinute) {
        return {
          active: null,
          next: { ...service, daysAway: offset }
        };
      }
    }
  }

  return { active: null, next: null };
}

function nextServiceDate(nextService) {
  if (!nextService) return null;

  const dateText = formatTimeZone(new Date(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const [month, day, year] = dateText.split('/').map(Number);
  const target = new Date(year, month - 1, day);
  target.setDate(target.getDate() + (nextService.daysAway || 0));

  const [hours, minutes] = nextService.start.split(':').map(Number);
  target.setHours(hours, minutes, 0, 0);
  return target;
}

function updateClockAndCountdown() {
  const now = new Date();

  byId('clockTime').textContent = formatTimeZone(now, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  byId('clockDate').textContent = formatTimeZone(now, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const { active, next } = scheduleStatus(now);
  byId('countdown').innerHTML = '';

  if (active) {
    byId('countLabel').textContent = 'Service in progress';
    byId('serviceStatus').textContent =
      active.label + ' is now in progress';
    byId('videoLabel').textContent = active.label;
    return;
  }

  byId('countLabel').textContent = 'Next service starts in';
  byId('serviceStatus').textContent = next
    ? 'Next: ' + next.label
    : 'Worship, connection, and community';
  byId('videoLabel').textContent = 'Sanctuary Live';

  const target = nextServiceDate(next);
  if (!target) return;

  const difference = Math.max(0, target.getTime() - Date.now());
  const values = [
    ['Days', Math.floor(difference / 86400000)],
    ['Hours', Math.floor(difference / 3600000) % 24],
    ['Minutes', Math.floor(difference / 60000) % 60],
    ['Seconds', Math.floor(difference / 1000) % 60]
  ];

  for (const [label, value] of values) {
    const box = document.createElement('div');
    box.className = 'countbox';
    box.innerHTML =
      '<strong>' +
      String(value).padStart(2, '0') +
      '</strong><span>' +
      label +
      '</span>';
    byId('countdown').appendChild(box);
  }
}

const WEATHER_LABELS = {
  0: 'Clear',
  1: 'Mostly sunny',
  2: 'Partly cloudy',
  3: 'Cloudy',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  95: 'Thunderstorms'
};

async function updateWeather() {
  const params = new URLSearchParams({
    latitude: CONFIG.latitude,
    longitude: CONFIG.longitude,
    current: 'temperature_2m,weather_code',
    temperature_unit: 'fahrenheit',
    timezone: CONFIG.timezone
  });

  try {
    const response = await fetch(
      'https://api.open-meteo.com/v1/forecast?' + params.toString(),
      { cache: 'no-store' }
    );

    if (!response.ok) throw new Error('Weather request failed');

    const data = await response.json();
    byId('weatherTemp').textContent =
      Math.round(data.current.temperature_2m) + '°F';
    byId('weatherLabel').textContent =
      WEATHER_LABELS[data.current.weather_code] || 'Versailles weather';
  } catch {
    byId('weatherTemp').textContent = '--°';
    byId('weatherLabel').textContent = 'Weather unavailable';
  }
}

updateClockAndCountdown();
updateWeather();
setInterval(updateClockAndCountdown, 1000);
setInterval(updateWeather, 15 * 60 * 1000);
</script>
</body>
</html>`;
}
