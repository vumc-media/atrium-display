// Builds a static Atrium display page for GitHub Pages:
// - Right: scrolling calendar (from Planning Center ICS)
// - Left: blank panel (NDI layer goes above this in FreeShow)
// - Bottom: single QR to VUMC Connect
// - Footer: current temp + 7-day forecast (Open-Meteo)
// Write index.html to repo root.

import https from 'https';
import fs from 'fs';

const ICS_URL = process.env.ICS_URL; // set in repo Settings → Secrets and variables → Actions
if (!ICS_URL) {
  console.error('Missing ICS_URL (set a repository secret named ICS_URL with your https://... .ics link).');
  process.exit(1);
}

// ── Tunables ────────────────────────────────────────────────────────
const BRAND      = 'Welcome to Versailles UMC';
const TIMEZONE   = 'America/New_York';
const DAYS_AHEAD = 45;
const MAX_ITEMS  = 30;
const SCROLL_MS  = 90000;  // base (auto-tuned at runtime)
const CONNECT_URL = 'https://vumc.versaillesumc.org';

// Colors to echo your Canva mock
const COLORS = {
  bg:        '#ffffff',
  leftFill:  'transparent',   // transparent so NDI layer shows through in FreeShow
  rightFill: '#f8cf1b',       // yellow calendar panel
  qrFill:    '#ffffff',       // white QR band
  footer:    '#bfe5ef',       // light blue footer
  text:      '#0b0e14',
  rule:      '#e5e7eb',
  red:       '#c62828',
};

// Weather (Versailles, KY)
const WX = { lat: 38.052, lon: -84.729, place: 'Versailles, KY' };
// ───────────────────────────────────────────────────────────────────

fetchText(ICS_URL)
  .then(ics => {
    const events = parseICS(ics);
    const now = new Date();
    const until = new Date(now.getTime() + DAYS_AHEAD * 86400000);

    const filtered = events
      .filter(e => e.start && new Date(e.start) >= now && new Date(e.start) <= until)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, MAX_ITEMS);

    const html = renderHtml(filtered);
    fs.writeFileSync('index.html', html, 'utf8');
    console.log('Wrote index.html');
  })
  .catch(err => { console.error('Build failed:', err); process.exit(1); });

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('ICS fetch failed: ' + res.statusCode));
      let data = ''; res.on('data', d => data += d); res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/* ======================== ICS PARSER (TZID-aware) ======================== */
function getLine(block, name) {
  const re = new RegExp('^' + name + '([^:\\n]*):([^\\n]+)', 'm');
  const m = block.match(re);
  if (!m) return null;
  const paramsStr = m[1] || '';
  const value = m[2].trim();
  const params = {};
  paramsStr.replace(/;([^=;:]+)=([^;:]+)/g, (_, k, v) => { params[k.toUpperCase()] = v; return ''; });
  return { value, params };
}
function getSimple(block, name) {
  const m = block.match(new RegExp('^' + name + '(?:;[^:\\n]+)?:([^\\n]+)', 'm'));
  return m ? m[1].trim() : '';
}
function tzOffsetAt(utcDate, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  });
  const parts = Object.fromEntries(fmt.formatToParts(utcDate).map(p => [p.type, p.value]));
  const asIfUTC = Date.UTC(+parts.year, +parts.month-1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asIfUTC - utcDate.getTime();
}
function wallClockToUTCISO(y, m, d, H, M, S, tz) {
  const t = Date.UTC(y, m, d, H, M, S);
  const offsetMs = tzOffsetAt(new Date(t), tz);
  return new Date(t - offsetMs).toISOString();
}
function toISOWithZone(line, defaultTZ) {
  if (!line) return null;
  const v = line.value; const tz = (line.params && line.params.TZID) ? line.params.TZID : null;
  if (/^\d{8}$/.test(v)) { const y=+v.slice(0,4), m=+v.slice(4,6)-1, d=+v.slice(6,8); return wallClockToUTCISO(y,m,d,0,0,0,tz||defaultTZ); }
  if (/^\d{8}T\d{6}Z$/.test(v)) return new Date(v).toISOString();
  if (/^\d{8}T\d{6}$/.test(v)) { const y=+v.slice(0,4), m=+v.slice(4,6)-1, d=+v.slice(6,8), H=+v.slice(9,11), M=+v.slice(11,13), S=+v.slice(13,15); return wallClockToUTCISO(y,m,d,H,M,S,tz||defaultTZ); }
  return new Date(v).toISOString();
}
function parseICS(ics) {
  ics = ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const blocks = ics.split('BEGIN:VEVENT').slice(1).map(b => 'BEGIN:VEVENT' + b);
  const unesc = s => String(s||'').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\').trim();
  return blocks.map(block => {
    const sLine = getLine(block, 'DTSTART');
    const eLine = getLine(block, 'DTEND');
    const all = (sLine && sLine.params && sLine.params.VALUE === 'DATE') || (sLine && /^\d{8}$/.test(sLine.value));
    return {
      title: unesc(getSimple(block,'SUMMARY')) || 'Untitled',
      location: unesc(getSimple(block,'LOCATION')),
      description: unesc(getSimple(block,'DESCRIPTION')),
      allDay: all,
      start: toISOWithZone(sLine, TIMEZONE),
      end:   toISOWithZone(eLine, TIMEZONE)
    };
  });
}

/* ======================== Formatting ======================== */
function fmtDate(d){
  return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:TIMEZONE}).format(new Date(d));
}
function fmtTime(d){
  return new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:TIMEZONE}).format(new Date(d)).toLowerCase();
}
function sameDay(a,b){ const A=new Date(a), B=new Date(b||a); return A.getFullYear()==B.getFullYear()&&A.getMonth()==B.getMonth()&&A.getDate()==B.getDate(); }
function esc(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* ======================== HTML render ======================== */
function renderHtml(events){
  // Group by day label
  const groups = {};
  events.forEach(e => { const label = fmtDate(e.start); (groups[label]=groups[label]||[]).push(e); });
  const labels = Object.keys(groups).sort((a,b)=>{
    const amin = groups[a].reduce((m,e)=>Math.min(m,+new Date(e.start)), Infinity);
    const bmin = groups[b].reduce((m,e)=>Math.min(m,+new Date(e.start)), Infinity);
    return amin-bmin;
  });

  const rows = labels.map(label => {
    const items = groups[label].map(e => {
      let when;
      if (e.allDay) when = 'All day';
      else if (!e.end || sameDay(e.start,e.end)) when = `${fmtTime(e.start)}${e.end? '–'+fmtTime(e.end):''}`;
      else when = `${fmtDate(e.start)} ${fmtTime(e.start)} → ${fmtDate(e.end)} ${fmtTime(e.end)}`;
      return `<div class="event"><div class="title">${esc(e.title)}</div><div class="meta">${esc(when)}${e.location?` • ${esc(e.location)}`:''}</div></div>`;
    }).join('');
    return `<div class="day"><div class="dayhead">${esc(label)}</div>${items}</div>`;
  }).join('') || '<div class="day"><div class="dayhead">No events</div></div>';

  // HTML
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atrium Display</title>
<style>
  :root{ --scroll-ms:${SCROLL_MS}ms; }
  html,body{height:100%}
  body{margin:0;background:${COLORS.bg};color:${COLORS.text};font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}

  /* GRID: header / main (left: NDI, right: calendar) / QR / weather footer */
  .wrap{display:grid;grid-template-rows:auto 1fr auto auto;grid-template-columns:1fr 1fr;gap:0;height:100vh}
  header{grid-column:1/3;background:#fff;padding:14px 20px;font-weight:800;font-size:clamp(20px,2.6vw,34px)}
  .left{grid-row:2;grid-column:1;background:${COLORS.leftFill}}
  .right{grid-row:2;grid-column:2;background:${COLORS.rightFill};display:flex;flex-direction:column}
  .qr{grid-row:3;grid-column:1/3;background:${COLORS.qrFill};display:flex;align-items:center;justify-content:center;padding:18px 24px;gap:20px;border-top:1px solid ${COLORS.rule}}
  footer{grid-row:4;grid-column:1/3;background:${COLORS.footer};padding:10px 14px;border-top:1px solid ${COLORS.rule}}

  /* Calendar panel inside .right */
  .panel{display:flex;flex-direction:column;height:100%}
  .panel-header{background:${COLORS.red};color:#fff;padding:10px 14px;font-weight:800;font-size:clamp(16px,2vw,22px)}
  .vwrap{position:relative;overflow:hidden;flex:1;background:#fff}
  .vcontent{position:absolute;width:100%;animation:vscroll var(--scroll-ms) linear infinite}
  @keyframes vscroll{0%{transform:translateY(0)}98%{transform:translateY(-50%)}100%{transform:translateY(0)}}
  .day{padding:12px 16px;border-bottom:1px solid ${COLORS.rule}}
  .dayhead{font-weight:800;opacity:.9;margin:0 0 6px;font-size:clamp(15px,1.7vw,18px)}
  .event{padding:6px 0}
  .title{font-size:clamp(15px,1.9vw,20px);line-height:1.35}
  .meta{opacity:.85;font-size:clamp(14px,1.6vw,16px);margin-top:2px}

  /* QR card */
  .qr-card{display:flex;align-items:center;gap:16px}
  .qr-card .text{font-weight:800;font-size:clamp(18px,2.2vw,28px)}
  .qr-card .url{font-weight:800;text-decoration:underline}

  /* Weather footer */
  .wx{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .wx .current{display:flex;align-items:center;gap:8px;font-weight:800}
  .wx .badge{background:rgba(0,0,0,.07);padding:4px 8px;border-radius:999px;font-size:13px}
  .wx .strip{display:flex;gap:12px;align-items:flex-end}
  .wx .day{display:grid;grid-template-rows:auto auto auto;gap:2px;justify-items:center}
  .wx .icon{font-size:20px}
  .wx .lo{opacity:.7;font-size:12px}

  /* Make left area obvious when testing (remove if you like) */
  /* .left::after{content:'NDI layer here in FreeShow';color:#555;display:block;margin:12px;font-weight:700} */

  /* Responsive: when narrow, stack main panels */
  @media (max-aspect-ratio: 4/3){
    .wrap{grid-template-rows:auto auto auto auto 1fr auto auto;grid-template-columns:1fr}
    .left{grid-column:1;grid-row:2;height:40vh}
    .right{grid-column:1;grid-row:3;height:40vh}
    .qr{grid-column:1;grid-row:4}
    footer{grid-column:1;grid-row:5}
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>${BRAND}</header>

    <!-- LEFT: left blank; FreeShow will place NDI video layer on top of this zone -->
    <section class="left" aria-label="NDI zone (overlay from FreeShow)"></section>

    <!-- RIGHT: Calendar -->
    <section class="right">
      <div class="panel">
        <div class="panel-header">Scrolling Calendar</div>
        <div class="vwrap">
          <div class="vcontent">
            ${rows}
            ${rows} <!-- duplicate for seamless loop -->
          </div>
        </div>
      </div>
    </section>

    <!-- QR band -->
    <section class="qr">
      <div class="qr-card">
        <canvas id="qr" width="140" height="140"></canvas>
        <div>
          <div class="text">Scan to open VUMC Connect</div>
          <div class="url">${CONNECT_URL.replace(/^https?:\\/\\//,'')}</div>
        </div>
      </div>
    </section>

    <!-- Weather footer -->
    <footer>
      <div class="wx" id="wx">
        <div class="current"><span id="wxIcon">⛅</span> <span id="wxTemp">--°F</span> <span id="wxCond">Loading…</span> <span class="badge">${WX.place}</span></div>
        <div class="strip" id="wxStrip" aria-label="7-day forecast"></div>
      </div>
    </footer>
  </div>

  <!-- libs -->
  <script src="https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js"></script>

  <script>
  // QR
  new QRious({ element: document.getElementById('qr'), value: '${CONNECT_URL}', size: 140, level: 'H' });

  // Auto-tune scroll speed by content height
  (function autoSpeed(){
    const root=document.documentElement, content=document.querySelector('.vcontent'); if(!content) return;
    const oneListHeight=content.scrollHeight/2, pxPerSec=55; // ← raise for faster, lower for slower
    const durationMs=Math.max(30000,Math.round((oneListHeight/pxPerSec)*1000));
    root.style.setProperty('--scroll-ms', durationMs+'ms');
  })();

  // Weather (Open-Meteo)
  const WXCONF = { lat:${WX.lat}, lon:${WX.lon} };
  const WEMOJI = c => (
    [0].includes(c)?'☀️' :
    [1,2].includes(c)?'⛅' :
    [3].includes(c)?'☁️' :
    [45,48].includes(c)?'🌫️' :
    [51,53,55].includes(c)?'🌦️' :
    [61,63,65].includes(c)?'🌧️' :
    [66,67].includes(c)?'🌧️❄️' :
    [71,73,75,77].includes(c)?'❄️' :
    [80,81,82].includes(c)?'🌧️' :
    [85,86].includes(c)?'🌨️' :
    [95,96,99].includes(c)?'⛈️' : '🌡️'
  );
  const WLABEL = c => ({0:'Clear',1:'Mostly Sunny',2:'Partly Cloudy',3:'Cloudy',45:'Fog',48:'Freezing Fog',51:'Light Drizzle',53:'Drizzle',55:'Heavy Drizzle',61:'Light Rain',63:'Rain',65:'Heavy Rain',66:'Freezing Rain',67:'Freezing Rain',71:'Light Snow',73:'Snow',75:'Heavy Snow',77:'Snow Grains',80:'Rain Showers',81:'Rain Showers',82:'Heavy Showers',85:'Snow Showers',86:'Snow Showers',95:'Thunderstorms',96:'T’storms',99:'T’storms'})[c]||'—';

  async function loadWeather(){
    const base='https://api.open-meteo.com/v1/forecast';
    const p=new URLSearchParams({
      latitude: WXCONF.lat, longitude: WXCONF.lon,
      current_weather:'true',
      daily:'weathercode,temperature_2m_max,temperature_2m_min',
      temperature_unit:'fahrenheit', wind_speed_unit:'mph',
      timezone:'auto', forecast_days:'7'
    });
    const r = await fetch(base+'?'+p.toString(), { cache:'no-store' });
    const j = await r.json();
    // current
    const cur=j.current_weather;
    document.getElementById('wxIcon').textContent = WEMOJI(cur.weathercode);
    document.getElementById('wxTemp').textContent = Math.round(cur.temperature)+'°F';
    document.getElementById('wxCond').textContent = WLABEL(cur.weathercode);

    // 7-day
    const days=j.daily.time, codes=j.daily.weathercode, hi=j.daily.temperature_2m_max, lo=j.daily.temperature_2m_min;
    const strip=document.getElementById('wxStrip'); strip.innerHTML='';
    for(let i=0;i<days.length;i++){
      const dt = new Date(days[i]);
      const lbl = new Intl.DateTimeFormat('en-US',{weekday:'short'}).format(dt);
      const el = document.createElement('div');
      el.className='day';
      el.innerHTML = \`
        <div class="lbl">\${lbl}</div>
        <div class="icon">\${WEMOJI(codes[i])}</div>
        <div class="hi">\${Math.round(hi[i])}°</div>
        <div class="lo">\${Math.round(lo[i])}°</div>
      \`;
      strip.appendChild(el);
    }
  }
  loadWeather();
  setInterval(loadWeather, 15*60*1000);
  </script>
</body></html>`;
}
