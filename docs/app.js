import { hourlyChart, laneChart, multiLineChart, niceRange, niceScale } from './charts.js';
import { API_URL } from './config.js';

const LEVELS = ['Normal', 'Aviso', 'Alerta', 'Alarma'];
const KIND = { oficial: 'Oficial', observado: 'Observado', 'pronóstico': 'Pronóstico' };
const REFRESH_MS = 5 * 60 * 1000;
const NS = 'http://www.w3.org/2000/svg';
const KEYS = {
  api: 'alerta-sc-api',
  status: 'alerta-sc-estado',
  levels: 'alerta-sc-niveles',
  notify: 'alerta-sc-notificaciones',
  compare: 'alerta-sc-comparar',
  tab: 'alerta-sc-pestana',
};
// Color fijo por fuente (sigue a la fuente, nunca a su posición): --cat-1…7 en styles.css
const SOURCE_ORDER = ['ecmwf_ifs', 'gfs_seamless', 'icon_seamless', 'gem_seamless', 'ukmo_seamless', 'meteofrance_seamless', 'metno', 'xweather'];
const sourceColor = (id) => `var(--cat-${SOURCE_ORDER.indexOf(id) + 1 || 8})`;
// Colores de la paleta de la DMC en sus imágenes de rayos (antigüedad del rayo)
const GLM_LEGEND = [
  ['#00f1ec', '0-15 min'],
  ['#00aaf2', '15-30 min'],
  ['#0000f6', '30-45 min'],
  ['#13099a', '45-60 min'],
];

let tz = 'America/Santiago';
let data = null;
let currentTab = 'resumen';
let charts = [];
let frames = [];
let framesFor = null;

// --- Almacenamiento local (puede fallar en modo privado) ---------------------

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* sin almacenamiento: se sigue funcionando */
    }
  },
};

// Un enlace con #api=… configura este equipo de una vez.
const hashApi = new URLSearchParams(location.hash.slice(1)).get('api');
if (hashApi) {
  store.set(KEYS.api, hashApi);
  history.replaceState(null, '', location.pathname + location.search);
}
const apiUrl = () => store.get(KEYS.api) || API_URL;

// --- Utilidades DOM (todo texto externo entra con textContent) --------------

const $ = (sel) => document.querySelector(sel);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function svgIcon(markup, size) {
  const el = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true' });
  el.innerHTML = markup; // marcado fijo de este archivo, nunca datos externos
  return el;
}

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const HAZARD_ICONS = {
  tormenta: `<g ${STROKE}><path d="M7 16.5a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 17.6 8a4.25 4.25 0 0 1 .4 8.5"/><path d="M13 11l-3 5h4l-3 5"/></g>`,
  lluvia: `<g ${STROKE}><path d="M7 15a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 17.6 6.5a4.25 4.25 0 0 1 .4 8.5"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></g>`,
  viento: `<g ${STROKE}><path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h6"/></g>`,
  nieve: `<g ${STROKE}><path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10"/><path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5"/></g>`,
  calor: `<g ${STROKE}><path d="M14 14.8V4.5a2 2 0 0 0-4 0v10.3a4 4 0 1 0 4 0z"/><path d="M12 9v7"/><path d="M18 4l2-1M18 8h2"/></g>`,
  helada: `<g ${STROKE}><path d="M14 14.8V4.5a2 2 0 0 0-4 0v10.3a4 4 0 1 0 4 0z"/><path d="M12 14v2"/><path d="M17 6h4"/></g>`,
  uv: `<g ${STROKE}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g>`,
  otro: `<g ${STROKE}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></g>`,
};
const icon = (id, size = 22) => svgIcon(HAZARD_ICONS[id] ?? HAZARD_ICONS.otro, size);

// Cada nivel tiene su propia forma, para que nunca dependa solo del color.
const MARK = 'style="stroke: var(--lvl-ink)" stroke-width="2.4" stroke-linecap="round" fill="none"';
const LEVEL_SHAPES = [
  `<circle cx="12" cy="12" r="10.5" style="fill: var(--lvl)"/><path d="M7.5 12.5l3 3 6-6.5" ${MARK} stroke-linejoin="round"/>`,
  `<path d="M12 2.5 22.5 21h-21z" style="fill: var(--lvl); stroke: var(--lvl)" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v5M12 17.8v.1" ${MARK}/>`,
  `<path d="M12 1.2 22.8 12 12 22.8 1.2 12z" style="fill: var(--lvl)"/><path d="M12 7.5v6M12 16.8v.1" ${MARK}/>`,
  `<path d="M7.9 1.5h8.2l6.4 6.4v8.2l-6.4 6.4H7.9l-6.4-6.4V7.9z" style="fill: var(--lvl)"/><path d="M12 7v6.5M12 16.8v.1" ${MARK}/>`,
];
const levelIcon = (level, size = 16) => svgIcon(LEVEL_SHAPES[level] ?? LEVEL_SHAPES[0], size);

const chip = (level, label = LEVELS[level]) => h('span', { class: `chip lvl-${level}` }, levelIcon(level), label);
const levelMark = (level) => h('span', { class: `lvl-${level}`, role: 'img', 'aria-label': LEVELS[level], title: LEVELS[level] }, levelIcon(level, 18));

// --- Formatos ---------------------------------------------------------------

const dateFmt = (opts) => new Intl.DateTimeFormat('es-CL', { timeZone: tz, ...opts });
const fmtShort = (ms) =>
  dateFmt({ weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(ms))
    .replace(/\./g, '');
const fmtTime = (ms) => dateFmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
const fmtRange = (a, b) => (!a ? '' : b && b > a ? `${fmtShort(a)} → ${fmtShort(b)}` : `desde ${fmtShort(a)}`);
const pct = (k, n) => (n ? Math.round((k / n) * 100) : 0);
const fmtNum = (v, digits = 1) => (v == null ? '–' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: digits }));

function ago(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  return hrs < 48 ? `hace ${hrs} h` : `hace ${Math.round(hrs / 24)} días`;
}

function evidenceWhen(e) {
  if (e.kind === 'observado' && e.start) return ago(e.start);
  if (e.peak) return `máximo ${fmtShort(e.peak)}`;
  return fmtRange(e.start, e.end);
}

// --- Secciones ---------------------------------------------------------------

/** "en 2 h 35 min" hasta el inicio previsto. */
function countdown(start, observed) {
  if (observed) return 'ahora';
  const min = Math.round((start - Date.now()) / 60000);
  if (min <= 0) return 'en curso';
  if (min < 60) return `en ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `en ${hrs} h${min % 60 ? ` ${min % 60} min` : ''}`;
  return `en ${Math.floor(hrs / 24)} d ${hrs % 24} h`;
}

/** Alerta temprana: cuándo podría empezar cada fenómeno y según qué fuentes. */
function renderEarly(d) {
  const box = $('#early');
  if (!d.upcoming) {
    box.hidden = true; // el servidor aún no tiene esta versión
    return;
  }
  box.hidden = false;
  const byId = Object.fromEntries(d.hazards.map((x) => [x.id, x]));
  box.replaceChildren(
    h('div', { class: 'early-head' }, h('h2', { id: 'h-early' }, 'Alerta temprana'), h('span', { class: 'muted' }, 'Cuándo podría empezar cada fenómeno, según las fuentes')),
    d.upcoming.length
      ? h(
          'ul',
          { class: 'early-list' },
          d.upcoming.map((u) => {
            const hz = byId[u.hazardId] ?? { name: u.hazardId, level: 0 };
            return h(
              'li',
              { class: `early-item lvl-${hz.level}${u.hazardId === 'tormenta' ? ' main' : ''}` },
              h('span', { class: 'hz-icon' }, icon(u.hazardId, 26)),
              h(
                'div',
                {},
                h(
                  'div',
                  { class: 'early-when' },
                  h('strong', {}, hz.name),
                  h('span', { class: 'early-time', 'data-start': u.start, 'data-observed': u.observed ? '1' : '' }, countdown(u.start, u.observed)),
                  h('span', { class: `conf${u.observed ? ' live' : ''}` }, u.observed ? 'En curso' : `Confianza ${u.confidence}`),
                ),
                h('p', {}, u.text),
              ),
            );
          }),
        )
      : h('p', { class: 'early-none' }, 'No se anticipan tormentas, lluvia, viento fuerte ni temperaturas extremas en las próximas 72 horas.'),
  );
}

/** Resumen: estado de la tormenta eléctrica, la prioridad del sistema. */
function renderStorm(d) {
  const hz = d.hazards.find((x) => x.id === 'tormenta');
  if (!hz) return;
  const box = $('#storm');
  const signals = hz.evidence.filter((e) => e.level > 0);
  box.className = `hero storm lvl-${hz.level}`;
  box.replaceChildren(
    h('div', { class: 'hero-badge' }, levelIcon(hz.level, 44)),
    h(
      'div',
      { class: 'hero-text' },
      h('div', { class: 'hero-level' }, hz.level ? `${LEVELS[hz.level]} de tormenta eléctrica` : 'Sin aviso de tormenta eléctrica'),
      h('div', { class: 'hero-title' }, 'Tormenta eléctrica'),
      h('p', {}, hz.headline),
      hz.level > 0 && hz.start ? h('p', { class: 'hero-when' }, fmtRange(hz.start, hz.end)) : null,
      hz.metric ? h('p', { class: 'hero-metric' }, h('strong', {}, hz.metric.value), ` ${hz.metric.label}`) : null,
      signals.length > 1
        ? h(
            'details',
            { class: 'hero-signals' },
            h('summary', {}, `Ver las ${signals.length} señales`),
            h(
              'ul',
              { class: 'evidence' },
              signals.map((e) =>
                h('li', {}, levelMark(e.level), h('div', {}, e.text, h('span', { class: 'src' }, [KIND[e.kind] ?? e.kind, evidenceWhen(e), e.source].filter(Boolean).join(' · ')))),
              ),
            ),
          )
        : null,
    ),
  );
}

/** Estado general en la barra superior (visible en todas las pestañas). */
function renderOverall(d) {
  const o = d.overall;
  const main = d.hazards.find((x) => x.id === o.hazardId);
  const b = $('#overall');
  b.hidden = false;
  b.className = `overall chip lvl-${o.level}`;
  b.replaceChildren(levelIcon(o.level), h('span', { class: 'overall-text' }, o.level && main ? `${LEVELS[o.level]} · ${main.name}` : 'Sin alertas'));
}

function renderHero(d) {
  const o = d.overall;
  const main = d.hazards.find((x) => x.id === o.hazardId);
  const others = d.hazards.filter((x) => x.level > 0 && x.id !== o.hazardId);
  const hero = $('#hero');
  hero.className = `hero lvl-${o.level}`;
  hero.replaceChildren(
    h('div', { class: 'hero-badge' }, levelIcon(o.level, 44)),
    h(
      'div',
      { class: 'hero-text' },
      h('div', { class: 'hero-level' }, o.level ? LEVELS[o.level] : 'Sin alertas'),
      h('div', { class: 'hero-title' }, main ? main.name : 'Condiciones normales'),
      h('p', {}, main ? main.headline : 'Ninguna fuente anticipa tormentas, lluvia intensa ni viento fuerte en las próximas 72 horas.'),
      main?.start ? h('p', { class: 'hero-when' }, fmtRange(main.start, main.end)) : null,
      others.length
        ? h('div', { class: 'hero-also' }, h('span', { class: 'muted' }, 'También:'), others.map((x) => chip(x.level, `${x.name} · ${LEVELS[x.level]}`)))
        : null,
    ),
  );
}

function renderHazards(d) {
  $('#hazards').replaceChildren(
    ...d.hazards.map((hz) =>
      h(
        'article',
        { class: `hazard lvl-${hz.level}${hz.id === 'tormenta' ? ' featured' : ''}` },
        h('div', { class: 'hz-head' }, h('span', { class: 'hz-icon' }, icon(hz.id)), h('h3', {}, hz.name), chip(hz.level)),
        hz.metric ? h('div', { class: 'hz-metric' }, h('strong', {}, hz.metric.value), h('span', {}, hz.metric.label)) : null,
        h('p', { class: 'hz-headline' }, hz.headline),
        hz.level > 0 && hz.start ? h('p', { class: 'hz-when' }, fmtRange(hz.start, hz.end)) : null,
        hz.evidence.length
          ? h(
              'details',
              {},
              h('summary', {}, `Señales (${hz.evidence.length})`),
              h(
                'ul',
                { class: 'evidence' },
                hz.evidence.map((e) =>
                  h(
                    'li',
                    {},
                    levelMark(e.level),
                    h('div', {}, e.text, h('span', { class: 'src' }, [KIND[e.kind] ?? e.kind, evidenceWhen(e), e.source].filter(Boolean).join(' · '))),
                  ),
                ),
              ),
            )
          : null,
      ),
    ),
  );
}

/** Rayos en tiempo real de Xweather (últimos 5 minutos), si está configurado. */
function realtimeLightning(d) {
  const x = d.xweather;
  if (!x?.configured) return null;
  const l = x.lightning;
  let text;
  if (!l) text = x.risk ? 'Tiempo real (Xweather): sin datos en esta revisión.' : 'Tiempo real (Xweather): en espera, sin señales de tormenta. Se activa solo cuando hay riesgo.';
  else if (!l.strikes.length) text = `Tiempo real (Xweather, ${fmtTime(l.time)}): sin rayos a menos de 100 km en los últimos 5 minutos.`;
  else {
    const c = l.strikes[0];
    text = `Tiempo real (Xweather, ${fmtTime(l.time)}): ${l.total} rayo${l.total === 1 ? '' : 's'} en los últimos 5 minutos; el más cercano a ${fmtNum(c.distKm)} km al ${c.direction}.`;
  }
  return h('p', { class: 'realtime' }, text);
}

// --- Rayos por satélite -----------------------------------------------------

let frameIndex = -1;
let playTimer = null;

function renderRayos(d) {
  stopPlay();
  const box = $('#rayos');
  const g = d.glm;
  const link = h('a', { href: g?.pageUrl ?? 'https://climatologia.meteochile.gob.cl/application/diarioe/imagenesTormenta/', target: '_blank', rel: 'noopener' }, 'Ver todas las imágenes en la DMC');
  if (!g) {
    // Sin imagen satelital igual se muestran los rayos en tiempo real (Xweather)
    box.replaceChildren(
      h('div', { class: 'card-list' }, realtimeLightning(d), h('p', { class: 'empty-state' }, 'No se pudo obtener la imagen satelital de rayos en la última revisión. ', link)),
    );
    return;
  }
  const stale = Date.now() - g.time > g.maxAgeMinutes * 60000;
  const hz = d.hazards.find((x) => x.id === 'tormenta');
  const glmEvidence = hz?.evidence.find((e) => e.source.startsWith('Satélite'));
  const level = glmEvidence ? glmEvidence.level : 0;
  const R = g.radiiKm;

  const stage = h('div', { class: 'rayos-stage' }, h('img', { id: 'rayos-img', alt: 'Imagen satelital de Chile central con los rayos de la última hora' }));
  const overlay = svg('svg', { viewBox: `0 0 ${g.crop.w} ${g.crop.h}`, class: 'rayos-overlay', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  // Un anillo por nivel: R = [Aviso, Alerta, Alarma] en km
  R.forEach((km, i) => {
    const rx = km * g.pxPerKm.x;
    const ry = km * g.pxPerKm.y;
    overlay.append(svg('ellipse', { cx: g.cerro.x, cy: g.cerro.y, rx, ry, class: `ring lvl-${i + 1}` }));
    if (rx < 8) return; // el anillo más chico no tiene espacio para su etiqueta
    // Etiquetas en distintos lados para que no se tapen: el mayor arriba, el resto a la derecha
    const t = i === 0
      ? svg('text', { x: g.cerro.x, y: g.cerro.y - ry - 2, class: 'ring-label', 'text-anchor': 'middle' })
      : svg('text', { x: g.cerro.x + rx + 1.5, y: g.cerro.y + 2.5, class: 'ring-label' });
    t.textContent = `${km} km`;
    overlay.append(t);
  });
  overlay.append(svg('circle', { cx: g.cerro.x, cy: g.cerro.y, r: 1.3, class: 'cerro-dot' }));
  const tag = svg('text', { x: g.cerro.x + 4, y: g.cerro.y + 9, class: 'ring-label cerro-label' });
  tag.textContent = 'Cerro';
  overlay.append(tag);
  stage.append(overlay);

  const time = h('span', { id: 'rayos-time', class: 'rayos-time' });
  const play = h('button', { id: 'rayos-play', class: 'btn btn-ghost', type: 'button' }, 'Animar última hora');
  const slider = h('input', { id: 'rayos-slider', type: 'range', min: '0', max: '0', value: '0', 'aria-label': 'Imagen' });

  // Núcleos a la misma distancia y dirección se muestran en una sola línea
  const groups = [];
  for (const c of g.clusters) {
    const same = groups.find((x) => Math.abs(x.distKm - c.distKm) <= 2 && x.direction === c.direction);
    if (same) {
      same.n++;
      same.ageClass = Math.min(same.ageClass, c.ageClass);
    } else groups.push({ ...c, n: 1 });
  }
  const clusters = groups.length
    ? h(
        'ul',
        { class: 'rayos-list' },
        groups.map((c) =>
          h(
            'li',
            {},
            h('i', { class: 'swatch', style: `background:${GLM_LEGEND[c.ageClass][0]}` }),
            h('strong', {}, `${c.distKm} km`),
            ` al ${c.direction}${c.n > 1 ? ` (${c.n} núcleos)` : ''}`,
            h('span', { class: 'muted' }, ` · ${GLM_LEGEND[c.ageClass][1]} antes de la imagen`),
          ),
        ),
      )
    : h('p', {}, `Sin rayos a menos de ${R[0]} km del cerro.`);

  box.replaceChildren(
    h(
      'div',
      { class: 'rayos-grid' },
      h('figure', { class: 'rayos-figure' }, stage, h('figcaption', { class: 'rayos-controls' }, time, slider, play)),
      h(
        'div',
        { class: 'rayos-info card' },
        h('div', { class: 'card-head' }, h('h3', {}, 'Rayos cerca del cerro'), chip(level)),
        realtimeLightning(d),
        h('p', { class: 'meta' }, `Satélite: imagen de las ${fmtTime(g.time)} (${ago(g.time)})${stale ? ' · imagen antigua: no cuenta para la alerta' : ''}`),
        clusters,
        h(
          'p',
          { class: 'meta' },
          `Niveles: Alarma a menos de ${R[2]} km, Alerta a menos de ${R[1]} km, Aviso a menos de ${R[0]} km.`,
        ),
        h('div', { class: 'legend' }, h('span', { class: 'muted' }, 'Rayo ocurrido antes de la imagen:'), GLM_LEGEND.map(([c, l]) => h('span', {}, h('i', { class: 'swatch', style: `background:${c}` }), l))),
        h('p', { class: 'meta' }, link),
      ),
    ),
  );
  play.addEventListener('click', togglePlay);
  slider.addEventListener('input', () => {
    stopPlay();
    showFrame(Number(slider.value));
  });
  if (frames.length) showFrame(frames.length - 1);
  loadFrames(g.time);
}

async function loadFrames(latestTime) {
  if (framesFor === latestTime && frames.length) return;
  try {
    const res = await fetch(`${apiUrl()}?accion=rayos`, { cache: 'no-store' });
    const body = await res.json();
    frames = (body.frames ?? []).sort((a, b) => a.time - b.time);
    framesFor = latestTime;
    showFrame(frames.length - 1);
  } catch {
    $('#rayos-time') && ($('#rayos-time').textContent = 'No se pudieron cargar las imágenes.');
  }
}

function showFrame(i) {
  const img = $('#rayos-img');
  if (!img || !frames.length) return;
  frameIndex = Math.max(0, Math.min(frames.length - 1, i));
  const f = frames[frameIndex];
  img.src = `data:image/jpeg;base64,${f.jpeg}`;
  const slider = $('#rayos-slider');
  slider.max = String(frames.length - 1);
  slider.value = String(frameIndex);
  slider.disabled = frames.length < 2;
  $('#rayos-play').disabled = frames.length < 2;
  $('#rayos-time').textContent = `${fmtTime(f.time)}${frameIndex === frames.length - 1 ? ' · la más reciente' : ''}`;
}

function togglePlay() {
  if (playTimer) return stopPlay();
  $('#rayos-play').textContent = 'Detener';
  playTimer = setInterval(() => showFrame(frameIndex >= frames.length - 1 ? 0 : frameIndex + 1), 800);
}

function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
  const b = $('#rayos-play');
  if (b) b.textContent = 'Animar última hora';
}

// --- Gráficos ------------------------------------------------------------------

function chartCard(selector, { title, sub, table, ...opts }) {
  const card = $(selector);
  card.replaceChildren(h('h3', {}, title), h('p', { class: 'chart-sub' }, sub));
  charts.push(hourlyChart(card, { ...opts, times: data.timeline.map((x) => x.t), tz, ariaLabel: title }));
  card.append(
    h(
      'details',
      { class: 'table-view' },
      h('summary', {}, 'Ver datos en tabla'),
      h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, table.columns.map((c, i) => h('th', { class: i ? 'num' : null }, c)))),
          h('tbody', {}, data.timeline.map((x) => h('tr', {}, table.row(x).map((v, i) => h('td', { class: i ? 'num' : null }, v))))),
        ),
      ),
    ),
  );
}

function renderCharts(d) {
  charts.forEach((c) => c.destroy());
  charts = [];
  const tl = d.timeline;
  const T = d.thresholds;
  const nSrc = Math.max(0, ...tl.map((x) => x.thunderN));
  $('#charts-sub').textContent =
    `Consenso entre ${d.perSource.length} fuentes de pronóstico. Pasa el dedo o el cursor sobre un gráfico para ver cada hora.`;

  const alertaK = Math.max(3, Math.ceil(nSrc * T.thunderAlertaShare));
  chartCard('#chart-thunder', {
    title: 'Fuentes que pronostican tormenta eléctrica (%)',
    sub: `Porcentaje de las fuentes de pronóstico que indican tormenta en cada hora.`,
    kind: 'bars',
    values: tl.map((x) => pct(x.thunderK, x.thunderN)),
    yMax: 100,
    ticks: [0, 50, 100],
    thresholds: [
      { value: pct(T.thunderAviso, nSrc), label: 'Aviso' },
      { value: pct(alertaK, nSrc), label: 'Alerta' },
    ],
    format: (v) => `${v} %`,
    peakLabel: (v) => `${v} %`,
    emptyText: 'Ninguna fuente pronostica tormenta',
    tooltip: (i) => [
      { key: true, value: `${pct(tl[i].thunderK, tl[i].thunderN)} %`, label: 'de las fuentes con tormenta' },
      { value: tl[i].capeMed != null ? `${tl[i].capeMed} J/kg` : '–', label: 'CAPE (inestabilidad)' },
    ],
    table: {
      columns: ['Hora', 'Fuentes con tormenta (%)', 'CAPE mediana (J/kg)', 'CAPE máx. (J/kg)'],
      row: (x) => [fmtShort(x.t), `${pct(x.thunderK, x.thunderN)} %`, x.capeMed ?? '–', x.capeMax ?? '–'],
    },
  });

  const rainPeak = Math.max(0, ...tl.map((x) => x.precipMed ?? 0));
  const rain = niceScale(Math.max(rainPeak * 1.25, T.rain1h[0] * 1.1));
  chartCard('#chart-rain', {
    title: 'Lluvia por hora',
    sub: 'Mediana de las fuentes, en milímetros.',
    kind: 'bars',
    values: tl.map((x) => x.precipMed),
    ...rain,
    thresholds: T.rain1h.map((v, i) => ({ value: v, label: `${LEVELS[i + 1]} ${v} mm/h` })),
    format: (v) => fmtNum(v),
    peakLabel: (v) => `${fmtNum(v)} mm`,
    emptyText: 'Sin lluvia pronosticada',
    tooltip: (i) => [
      { key: true, value: `${fmtNum(tl[i].precipMed)} mm`, label: 'mediana' },
      { value: `${fmtNum(tl[i].precipMin)}–${fmtNum(tl[i].precipMax)} mm`, label: 'rango entre fuentes' },
    ],
    table: {
      columns: ['Hora', 'Mediana (mm)', 'Mínimo (mm)', 'Máximo (mm)'],
      row: (x) => [fmtShort(x.t), fmtNum(x.precipMed), fmtNum(x.precipMin), fmtNum(x.precipMax)],
    },
  });

  const gustPeak = Math.max(0, ...tl.map((x) => x.gustMax ?? 0));
  const gust = niceScale(Math.max(gustPeak * 1.15, T.gust[0] * 1.1));
  chartCard('#chart-gust', {
    title: 'Ráfagas de viento',
    sub: 'Línea: mediana de las fuentes. Franja: de la fuente más baja a la más alta (m/s).',
    kind: 'line',
    values: tl.map((x) => x.gustMed),
    band: { min: tl.map((x) => x.gustMin), max: tl.map((x) => x.gustMax) },
    ...gust,
    thresholds: T.gust.map((v, i) => ({ value: v, label: `${LEVELS[i + 1]} ${v} m/s` })),
    format: (v) => fmtNum(v, 0),
    peakLabel: (v) => `${fmtNum(v, 1)} m/s`,
    tooltip: (i) => [
      { key: true, value: `${fmtNum(tl[i].gustMed, 1)} m/s`, label: 'mediana' },
      { value: `${fmtNum(tl[i].gustMin, 1)}–${fmtNum(tl[i].gustMax, 1)} m/s`, label: 'rango entre fuentes' },
    ],
    table: {
      columns: ['Hora', 'Mediana (m/s)', 'Mínimo (m/s)', 'Máximo (m/s)'],
      row: (x) => [fmtShort(x.t), fmtNum(x.gustMed, 1), fmtNum(x.gustMin, 1), fmtNum(x.gustMax, 1)],
    },
  });
}

// --- Avisos, observaciones, Meteored y tablas --------------------------------

function renderDmc(d) {
  const box = $('#dmc');
  const link = h('a', { href: d.dmcPage, target: '_blank', rel: 'noopener' }, 'Ver mapa de avisos en meteochile.gob.cl');
  if (!d.dmc) {
    box.replaceChildren(h('p', { class: 'empty-state' }, 'No se pudo consultar a la DMC en la última revisión. ', link));
    return;
  }
  const { alerts, totals, updated } = d.dmc;
  const national = `A nivel nacional hay ${totals.avisos} avisos, ${totals.alertas} alertas y ${totals.alarmas} alarmas${updated ? ` (publicado ${updated})` : ''}.`;
  box.replaceChildren(
    h(
      'div',
      { class: 'card-list' },
      alerts.length
        ? alerts.map((a) =>
            h(
              'article',
              { class: 'card' },
              h(
                'div',
                { class: 'card-head' },
                h('span', { class: 'hz-icon' }, icon(a.hazard, 20)),
                h('h3', {}, a.phenomenon),
                chip(a.level, a.type),
                a.nearby ? h('span', { class: 'flag' }, 'Zona vecina') : null,
              ),
              h('p', {}, a.title),
              h('p', { class: 'meta' }, `Desde ${a.from} hasta ${a.to}`),
              a.zone ? h('p', { class: 'meta' }, `Zona: ${a.zone}`) : null,
              a.detail ? h('p', { class: 'meta' }, `${a.detailTitle ? `${a.detailTitle}: ` : ''}${a.detail}`) : null,
              a.observation ? h('p', {}, a.observation) : null,
              h('p', { class: 'meta' }, `${a.code} · emitido el ${a.issued}`),
            ),
          )
        : h('p', { class: 'empty-state' }, 'La DMC no tiene avisos, alertas ni alarmas vigentes para la zona del cerro.'),
      h('p', { class: 'meta muted' }, national, ' ', link),
    ),
  );
}

function renderObs(d) {
  const cards = d.observations.map((o) => {
    const flags = [
      o.thunder && 'Tormenta en la estación',
      o.thunderNear && 'Tormenta en las cercanías',
      o.thunderRecent && 'Tormenta en la última hora',
      o.thunderTrend && 'Tormenta prevista en 2 h',
      o.cb && 'Cumulonimbus',
      o.tcu && 'Cúmulos de gran desarrollo',
      o.hail && 'Granizo',
      o.heavyRain ? 'Lluvia intensa' : o.rain && 'Lluvia',
    ].filter(Boolean);
    const ms = (v, kmh) => (v ?? (kmh != null ? Math.round((kmh / 3.6) * 10) / 10 : null));
    const windMs = ms(o.windMs, o.windKmh);
    const gustMs = ms(o.gustMs, o.gustKmh);
    const wind = windMs != null ? `Viento ${fmtNum(windMs)} m/s${gustMs ? `, ráfagas ${fmtNum(gustMs)} m/s` : ''}` : null;
    return h(
      'article',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', {}, o.name), h('span', { class: 'meta' }, `${o.distKm} km del cerro · ${ago(o.time)}`)),
      h('p', {}, [o.temp != null ? `${o.temp} °C` : null, wind].filter(Boolean).join(' · ')),
      h('div', { class: 'flags' }, (flags.length ? flags : ['Sin tormenta ni lluvia']).map((f) => h('span', { class: 'flag' }, f))),
      h('p', { class: 'raw' }, o.raw),
    );
  });
  const tafs = (d.tafs ?? []).map((t) =>
    h(
      'article',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', {}, `Pronóstico aeronáutico · ${t.name}`), h('span', { class: 'meta' }, `emitido ${ago(t.issued)}`)),
      h(
        'p',
        {},
        t.periods.some((p) => p.thunder || p.cb)
          ? `Indica tormenta o cumulonimbus: ${t.periods.filter((p) => p.thunder || p.cb).map((p) => fmtRange(p.from, p.to)).join('; ')}`
          : 'No pronostica tormentas en las próximas 24 horas.',
      ),
      h('details', {}, h('summary', {}, 'Ver TAF'), h('p', { class: 'raw' }, t.raw)),
    ),
  );
  $('#obs').replaceChildren(
    h(
      'div',
      { class: 'card-list' },
      cards.length ? cards : h('p', { class: 'empty-state' }, 'No hay observaciones recientes de las estaciones cercanas.'),
      tafs,
    ),
  );
}

// --- Mapas: tormentas de Xweather, Windy y avisos de Meteored -------------------

const MAPS = {
  xweather: { tab: 'Tormentas · Xweather' },
  windy: { tab: 'Windy' },
  meteored: { tab: 'Avisos · Meteored' },
};
const WINDY_LAYERS = { thunder: 'Tormentas eléctricas', gust: 'Ráfagas', rain: 'Lluvia' };
let mapChoice = MAPS[store.get('alerta-sc-mapa')] ? store.get('alerta-sc-mapa') : 'xweather';
let windyLayer = WINDY_LAYERS[store.get('alerta-sc-windy')] ? store.get('alerta-sc-windy') : 'thunder';
let mapShown = null; // evita recargar el mismo mapa en cada actualización
let summaryShown = { xweather: null, windy: null };
let xwMapLoad = null; // { time, promise } de la última imagen pedida

const xwKey = () => `${Boolean(data.xweather?.configured)}:${data.xweather?.map?.time ?? ''}`;

/** Los mapas se cargan solo con su pestaña visible (Windy no se dibuja bien oculto). */
function renderMapViews() {
  renderSummaryMaps();
  renderMaps();
}

function windyLayerButtons(onPick) {
  return h(
    'div',
    { class: 'row map-layers' },
    Object.entries(WINDY_LAYERS).map(([id, label]) => {
      const b = h('button', { type: 'button', class: 'legend-item', 'aria-pressed': String(id === windyLayer) }, label);
      b.addEventListener('click', () => {
        windyLayer = id;
        store.set('alerta-sc-windy', id);
        onPick();
      });
      return b;
    }),
  );
}

function windyFrame() {
  const p = data.location;
  const params = new URLSearchParams({
    type: 'map', location: 'coordinates', metricRain: 'mm', metricTemp: '°C', metricWind: 'm/s', zoom: '8',
    overlay: windyLayer, product: 'ecmwf', level: 'surface', lat: p.lat, lon: p.lon, detailLat: p.lat, detailLon: p.lon, marker: 'true', message: 'true',
  });
  return h('iframe', { src: `${data.windyEmbed || 'https://embed.windy.com/embed.html'}?${params}`, title: 'Mapa de Windy', referrerpolicy: 'strict-origin-when-cross-origin', loading: 'lazy' });
}

/** Resumen: mapa de tormentas de Xweather y Windy, lado a lado. */
function renderSummaryMaps() {
  if (currentTab !== 'resumen' || !data) return;
  if (summaryShown.xweather !== xwKey()) {
    summaryShown.xweather = xwKey();
    renderXweatherMap($('#sum-xweather'));
  }
  if (summaryShown.windy !== windyLayer) {
    summaryShown.windy = windyLayer;
    // capas debajo, como la nota bajo el mapa de Xweather: así ambos mapas quedan alineados
    $('#sum-windy').replaceChildren(windyFrame(), windyLayerButtons(renderSummaryMaps));
  }
}

/** Pestaña Mapas: un mapa a la vez. */
function renderMaps() {
  if (currentTab !== 'mapa' || !data) return;
  const key = `${mapChoice}:${windyLayer}:${mapChoice === 'xweather' ? xwKey() : ''}`;
  $('#map-switch').replaceChildren(
    ...Object.entries(MAPS).map(([id, m]) => {
      const b = h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(id === mapChoice) }, m.tab);
      b.addEventListener('click', () => {
        mapChoice = id;
        store.set('alerta-sc-mapa', id);
        renderMaps();
      });
      return b;
    }),
  );
  if (mapShown === key) return;
  mapShown = key;
  const box = $('#map-box');
  const sub = $('#map-sub');
  if (mapChoice === 'windy') {
    sub.textContent = 'Mapa interactivo de Windy centrado en el cerro. Dentro del mapa se puede cambiar el modelo (ECMWF, GFS, ICON…) y avanzar en el tiempo.';
    box.replaceChildren(windyLayerButtons(renderMaps), windyFrame());
  } else if (mapChoice === 'meteored') {
    sub.textContent = 'Mapa interactivo de Meteored con los avisos meteorológicos de todo Chile (los publica la DMC). Incluye su publicidad.';
    const url = data.meteoredUrl || 'https://www.meteored.cl/avisos-meteorologicos/';
    box.replaceChildren(
      h('iframe', { src: url, title: 'Mapa de avisos meteorológicos de Meteored', referrerpolicy: 'strict-origin-when-cross-origin' }),
      h('p', { class: 'meta' }, h('a', { href: url, target: '_blank', rel: 'noopener' }, 'Abrir Meteored en una ventana aparte')),
    );
  } else {
    sub.textContent = 'Rayos nube-tierra de los últimos 15 minutos (red Vaisala), radar global completado con satélite y relieve. Anillos a 15, 40 y 100 km del cerro.';
    renderXweatherMap(box);
  }
}

/** La imagen se pide una sola vez por mapa, aunque se muestre en dos pestañas. */
function loadXwMap(time) {
  if (xwMapLoad?.time !== time) {
    const promise = fetch(`${apiUrl()}?accion=mapa`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => {
        if (!b.map) throw new Error('sin mapa');
        return b.map;
      });
    xwMapLoad = { time, promise };
  }
  return xwMapLoad.promise;
}

function renderXweatherMap(box) {
  const x = data.xweather;
  if (!x?.configured) {
    box.replaceChildren(
      h(
        'div',
        { class: 'empty-state' },
        h('p', {}, 'El mapa de tormentas de Xweather necesita una cuenta de Xweather.'),
        h('p', { class: 'meta' }, 'Crea la cuenta en xweather.com, copia el ID y el secreto de la aplicación, y agrégalos en Apps Script como propiedades XWEATHER_ID y XWEATHER_SECRET. '),
        h('a', { href: 'https://signup.xweather.com', target: '_blank', rel: 'noopener' }, 'Crear cuenta en Xweather'),
      ),
    );
    return;
  }
  if (!x.map) {
    box.replaceChildren(h('p', { class: 'empty-state' }, 'El primer mapa aparecerá en la próxima revisión del servidor (cada 10 minutos).'));
    return;
  }
  const m = x.map;
  const stage = h('div', { class: 'xw-stage', style: `aspect-ratio:${m.width} / ${m.height}` }, h('img', { alt: 'Mapa de tormentas de Xweather centrado en el cerro' }));
  const overlay = svg('svg', { viewBox: `0 0 ${m.width} ${m.height}`, class: 'rayos-overlay', 'aria-hidden': 'true' });
  (x.radiiKm || data.glm?.radiiKm || [100, 40, 15]).forEach((km, i) => {
    const r = (km * 1000) / m.mPerPx;
    overlay.append(svg('circle', { cx: m.width / 2, cy: m.height / 2, r, class: `ring lvl-${i + 1}` }));
    if (r > 30) {
      const t = svg('text', { x: m.width / 2, y: m.height / 2 - r - 4, class: 'ring-label big', 'text-anchor': 'middle' });
      t.textContent = `${km} km`;
      overlay.append(t);
    }
  });
  overlay.append(svg('circle', { cx: m.width / 2, cy: m.height / 2, r: 4, class: 'cerro-dot' }));
  stage.append(overlay);
  box.replaceChildren(stage, h('p', { class: 'meta' }, `Mapa de las ${fmtTime(m.time)} (${ago(m.time)}). © Xweather / Vaisala.`));
  const img = stage.querySelector('img');
  loadXwMap(m.time)
    .then((map) => {
      img.src = `data:image/jpeg;base64,${map.jpeg}`;
    })
    .catch(() => box.append(h('p', { class: 'meta' }, 'No se pudo cargar la imagen del mapa.')));
}

// --- Comparación de fuentes ---------------------------------------------------

let compareMetric = store.get(KEYS.compare) || 'lluvia';
let compareFocus = null;
let compareChart = null;

const median = (vals) => {
  const a = vals.filter((v) => v != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const k = a.length >> 1;
  return a.length % 2 ? a[k] : (a[k - 1] + a[k]) / 2;
};

function cumulative(values) {
  let sum = 0;
  let any = false;
  return values.map((v) => {
    if (v != null) {
      sum += v;
      any = true;
    }
    return any ? Math.round(sum * 10) / 10 : null;
  });
}

/** Periodos de avisos DMC del peligro indicado, como franjas del gráfico. */
function dmcBands(d, hazards) {
  return (d.dmc?.alerts ?? [])
    .filter((a) => hazards.includes(a.hazard) && a.start)
    .map((a) => ({ from: a.start, to: a.end ?? a.start + 6 * 3600000, label: `${a.type} DMC`, level: a.effectiveLevel }));
}

const COMPARE_METRICS = {
  lluvia: {
    tab: 'Lluvia acumulada',
    sub: 'Milímetros acumulados desde ahora según cada fuente. La franja marca el periodo del aviso de la DMC, si hay uno.',
    values: (s) => cumulative(s.precip),
    unit: 'mm',
    digits: 1,
    hazards: ['lluvia'],
  },
  viento: {
    tab: 'Ráfagas',
    sub: 'Ráfaga máxima de cada hora, en m/s (Alerta desde 15 m/s). MET Norway no entrega ráfagas para Chile.',
    values: (s) => s.gust,
    reference: (d) => d.timeline.map((x) => x.gustMed),
    unit: 'm/s',
    digits: 1,
    hazards: ['viento'],
  },
  temperatura: {
    tab: 'Temperatura',
    sub: 'Temperatura de cada hora, en °C, en el punto vigilado.',
    values: (s) => s.temp,
    reference: (d) => d.timeline.map((x) => x.tempMed),
    unit: '°C',
    digits: 1,
    hazards: ['calor', 'helada'],
    fromZero: false,
  },
  tormenta: {
    tab: 'Tormenta',
    sub: 'Horas en que cada fuente pronostica tormenta eléctrica, junto al pronóstico aeronáutico (TAF) y los avisos oficiales de la DMC.',
  },
};

function renderCompare(d) {
  compareChart?.destroy();
  compareChart = null;
  const box = $('#compare');
  if (!d.series?.length) {
    box.replaceChildren(h('p', { class: 'muted' }, 'La comparación aparecerá después de la próxima revisión del servidor.'));
    return;
  }
  if (!COMPARE_METRICS[compareMetric]) compareMetric = 'lluvia';
  const metric = COMPARE_METRICS[compareMetric];

  const tabs = h(
    'div',
    { class: 'tabs', role: 'tablist', 'aria-label': 'Variable a comparar' },
    Object.entries(COMPARE_METRICS).map(([id, m]) => {
      const b = h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(id === compareMetric) }, m.tab);
      b.addEventListener('click', () => {
        compareMetric = id;
        store.set(KEYS.compare, id);
        renderCompare(data);
      });
      return b;
    }),
  );
  const chartBox = h('div', { class: 'compare-chart' });
  box.replaceChildren(tabs, h('p', { class: 'chart-sub' }, metric.sub), chartBox);

  if (compareMetric === 'tormenta') return renderThunderLanes(d, box, chartBox);

  const series = d.series
    .map((s) => ({ id: s.id, name: s.name, color: sourceColor(s.id), values: metric.values(s) }))
    .filter((s) => s.values.some((v) => v != null));
  const refValues = metric.reference ? metric.reference(d) : d.timeline.map((_, i) => median(series.map((s) => s.values[i])));
  const fmt = (v) => `${fmtNum(v, metric.digits)} ${metric.unit}`;

  // Leyenda: identifica cada línea y permite destacarla
  const legend = h(
    'div',
    { class: 'legend compare-legend' },
    series.map((s) => {
      const b = h('button', { type: 'button', class: 'legend-item', 'aria-pressed': String(compareFocus === s.id) }, h('i', { class: 'line-key', style: `background:${s.color}` }), s.name);
      b.addEventListener('click', () => {
        compareFocus = compareFocus === s.id ? null : s.id;
        renderCompare(data);
      });
      return b;
    }),
    h('span', { class: 'legend-item static' }, h('i', { class: 'line-key reference' }), 'Mediana'),
  );
  chartBox.before(legend);

  const all = [...series.flatMap((s) => s.values), ...refValues].filter((v) => v != null);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const scale = metric.fromZero === false ? niceRange(lo - 1, hi + 1) : niceRange(0, Math.max(hi * 1.1, 1));
  compareChart = multiLineChart(chartBox, {
    times: d.timeline.map((x) => x.t),
    tz,
    ariaLabel: `${metric.tab} según cada fuente`,
    height: 240,
    series,
    reference: { name: 'Mediana', values: refValues },
    focus: compareFocus,
    bands: dmcBands(d, metric.hazards),
    ...scale,
    format: (v) => fmtNum(v, metric.digits),
    tooltip: (i) => [
      { key: true, color: 'var(--ink-2)', value: refValues[i] == null ? '–' : fmt(refValues[i]), label: 'mediana' },
      ...series
        .filter((s) => s.values[i] != null)
        .sort((a, b) => b.values[i] - a.values[i])
        .map((s) => ({ key: true, color: s.color, value: fmt(s.values[i]), label: s.name, dim: compareFocus && compareFocus !== s.id })),
    ],
  });
  box.append(
    tableView(
      ['Hora', ...series.map((s) => s.name), 'Mediana'],
      d.timeline.map((x, i) => [fmtShort(x.t), ...series.map((s) => fmtNum(s.values[i], metric.digits)), fmtNum(refValues[i], metric.digits)]),
    ),
  );
}

function renderThunderLanes(d, box, chartBox) {
  const times = d.timeline.map((x) => x.t);
  const covers = (t, from, to) => t >= from && t < to;
  const lanes = d.series.map((s) => ({ name: s.name, color: sourceColor(s.id), values: s.thunder }));
  for (const taf of d.tafs ?? []) {
    lanes.push({
      name: `TAF ${taf.name.replace(/ \(.*\)/, '')}`,
      color: 'var(--ink-2)',
      values: times.map((t) => (t >= taf.validTo ? null : taf.periods.some((p) => (p.thunder || p.cb) && covers(t, p.from, p.to)) ? 1 : 0)),
    });
  }
  const dmcStorms = (d.dmc?.alerts ?? []).filter((a) => a.hazard === 'tormenta' && a.start);
  const dmcLevel = Math.max(1, ...dmcStorms.map((a) => a.effectiveLevel));
  lanes.push({
    name: 'Aviso DMC',
    level: dmcLevel,
    values: times.map((t) => (dmcStorms.some((a) => covers(t, a.start, a.end ?? a.start + 6 * 3600000)) ? 1 : 0)),
  });

  compareChart = laneChart(chartBox, {
    times,
    tz,
    ariaLabel: 'Horas con tormenta según cada fuente',
    lanes,
    tooltip: (i) => {
      const on = lanes.filter((l) => l.values[i] === 1);
      const models = d.series.filter((s) => s.thunder[i] === 1).length;
      return [
        { value: `${pct(models, d.series.length)} %`, label: 'de los modelos con tormenta' },
        ...(on.length
          ? on.map((l) => ({ key: true, color: l.level != null ? `var(--${['good', 'warning', 'serious', 'critical'][l.level]})` : l.color, value: l.name, label: 'tormenta' }))
          : [{ value: 'Ninguna fuente', label: 'indica tormenta' }]),
      ];
    },
  });
  box.append(
    tableView(
      ['Hora', ...lanes.map((l) => l.name)],
      d.timeline.map((x, i) => [fmtShort(x.t), ...lanes.map((l) => (l.values[i] === 1 ? 'Sí' : l.values[i] === 0 ? '—' : 'sin dato'))]),
    ),
  );
}

function tableView(columns, rows) {
  return h(
    'details',
    { class: 'table-view' },
    h('summary', {}, 'Ver datos en tabla'),
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, columns.map((c, i) => h('th', { class: i ? 'num' : null }, c)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, r.map((v, i) => h('td', { class: i ? 'num' : null }, v))))),
      ),
    ),
  );
}

function renderModels(d) {
  const cols = ['Fuente', 'Lluvia máx. 24 h (mm)', 'Lluvia máx. 1 h (mm)', 'Ráfaga máx. (m/s)', 'Horas con tormenta', 'CAPE máx. (J/kg)', 'UV máx.', 'T máx. (°C)', 'T mín. (°C)'];
  $('#models').replaceChildren(
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: i ? 'num' : null }, c)))),
      h(
        'tbody',
        {},
        d.perSource.map((p) =>
          h(
            'tr',
            {},
            h('td', {}, h('i', { class: 'line-key', style: `background:${sourceColor(p.id)}` }), `${p.name} `, h('span', { class: 'muted' }, `(${p.origin})`)),
            [fmtNum(p.rain24), fmtNum(p.rain1h), fmtNum(p.gust, 1), p.thunderHours, fmtNum(p.cape, 0), fmtNum(p.uv, 0), fmtNum(p.tmax), fmtNum(p.tmin)].map((v) =>
              h('td', { class: 'num' }, v),
            ),
          ),
        ),
      ),
    ),
  );
}

function renderHistory(d) {
  const items = d.history.map((e) =>
    h('li', {}, levelMark(e.to ?? 0), h('div', {}, h('time', {}, `${fmtShort(e.at)}${e.emailed ? ' · incluido en el boletín' : ''}`), e.text)),
  );
  $('#history').replaceChildren(
    items.length ? h('ul', { class: 'timeline-list' }, items) : h('p', { class: 'empty-state' }, 'Aún no hay eventos registrados.'),
  );
}

function renderSources(d) {
  const rows = d.sources.map((s) =>
    h(
      'li',
      { class: s.disabled ? 'disabled' : null },
      s.disabled ? h('span', { class: 'hz-icon', title: 'Sin configurar' }, icon('otro', 18)) : levelMark(s.ok ? 0 : s.stale ? 1 : 3),
      h(
        'div',
        {},
        h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.name),
        h(
          'span',
          { class: 'meta' },
          s.ok
            ? [s.detail, s.fetchedAt ? `datos ${ago(s.fetchedAt)}` : null].filter(Boolean).join(' · ')
            : `${s.error}${s.stale ? ` · usando datos de ${ago(s.fetchedAt)}` : ''}`,
        ),
      ),
    ),
  );
  const xu = d.xweather?.configured ? d.xweather.usage : null;
  if (xu) {
    rows.push(
      h(
        'li',
        {},
        levelMark(xu.used >= xu.limit ? 3 : xu.used > xu.limit * 0.8 ? 1 : 0),
        h('div', {}, 'Accesos de Xweather este mes', h('span', { class: 'meta' }, `${xu.used.toLocaleString('es-CL')} de ${xu.limit.toLocaleString('es-CL')} (cada consulta de rayos usa 10)`)),
      ),
    );
  }
  const e = d.email;
  const schedule = e.schedule ? `Boletín a las ${e.schedule.join(', ').replace(/, ([^,]*)$/, ' y $1')}.` : '';
  const next = e.next ? ` Próximo: ${fmtShort(e.next)}${e.pending ? ` (${e.pending} cambio${e.pending === 1 ? '' : 's'} por informar)` : ''}.` : '';
  const emailText = e.paused
    ? `En pausa: no se envían correos. ${schedule} Para activarlos, ejecuta reanudarCorreos en Apps Script.`
    : !e.configured
      ? 'Correo no configurado.'
      : `${schedule}${next}${e.last ? ` Último: ${ago(e.last.at)}, “${e.last.subject}”${e.last.ok || e.last.skipped ? '' : ` · error: ${e.last.error}`}.` : ''}`;
  rows.push(
    h(
      'li',
      {},
      levelMark(e.paused || !e.configured ? 1 : e.last && !e.last.ok && !e.last.skipped ? 3 : 0),
      h('div', {}, e.paused ? 'Correos desde Gmail · en pausa' : 'Correos desde Gmail', h('span', { class: 'meta' }, emailText)),
    ),
  );
  if (d.ultimoError) {
    rows.unshift(
      h(
        'li',
        {},
        levelMark(3),
        h('div', {}, 'La última revisión del servidor falló', h('span', { class: 'meta' }, `${ago(d.ultimoError.at)}: ${d.ultimoError.message.split('\n')[0]}`)),
      ),
    );
  }
  $('#sources').replaceChildren(h('ul', { class: 'src-list' }, rows));
}

// --- Notificaciones de escritorio e ícono de la app ---------------------------

const notificationsOn = () => 'Notification' in window && Notification.permission === 'granted' && store.get(KEYS.notify) !== 'no';

async function notify(title, body, level) {
  const options = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'alerta-sc', renotify: true, requireInteraction: level >= 2 };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, options);
  } catch {
    /* se usa la API directa */
  }
  new Notification(title, options);
}

/** Avisa si algún peligro subió de nivel desde la última vez que se vio. */
function checkRises(d) {
  const levels = Object.fromEntries(d.hazards.map((x) => [x.id, x.level]));
  let prev = null;
  try {
    prev = JSON.parse(store.get(KEYS.levels));
  } catch {
    /* sin datos previos */
  }
  store.set(KEYS.levels, JSON.stringify({ at: d.generatedAt, levels }));
  if (!prev || prev.at === d.generatedAt || !notificationsOn()) return;
  const rises = d.hazards.filter((x) => x.level > (prev.levels[x.id] ?? 0)).sort((a, b) => b.level - a.level);
  if (rises.length) notify(`${LEVELS[rises[0].level]}: ${rises[0].name}`, rises[0].headline, rises[0].level);
}

function updateBadge(d) {
  const n = d.hazards.filter((x) => x.level > 0).length;
  try {
    if (n) navigator.setAppBadge?.(n);
    else navigator.clearAppBadge?.();
  } catch {
    /* sin soporte */
  }
}

// --- Carga ---------------------------------------------------------------------

function render(d) {
  document.body.classList.remove('sin-datos');
  data = d;
  tz = d.location.timezone;
  renderOverall(d);
  renderStorm(d);
  renderEarly(d);
  renderHero(d);
  renderHazards(d);
  renderRayos(d);
  renderCharts(d);
  renderDmc(d);
  renderObs(d);
  renderMapViews();
  renderCompare(d);
  renderModels(d);
  renderHistory(d);
  renderSources(d);
  updateClock();
  updateBadge(d);
  document.title = d.overall.level ? `${LEVELS[d.overall.level]} · Alerta San Cristóbal` : 'Alerta San Cristóbal';
}

function updateClock() {
  if (data) $('#updated').textContent = `Actualizado ${ago(data.generatedAt)}`;
  for (const el of document.querySelectorAll('.early-time')) el.textContent = countdown(Number(el.dataset.start), el.dataset.observed === '1');
}

function banner(text) {
  const b = $('#banner');
  b.hidden = !text;
  b.textContent = text || '';
}

const GUIDE_URL = 'https://github.com/javiersalgadokaiser-dev/alerta-san-cristobal/blob/main/google-apps-script/INSTRUCCIONES.md';

function showSetup(message) {
  document.body.classList.add('sin-datos');
  activate('resumen', { updateHash: false });
  $('#storm').className = 'hero lvl-1';
  const btn = h('button', { class: 'btn', type: 'button' }, 'Abrir ajustes');
  btn.addEventListener('click', openSettings);
  $('#storm').replaceChildren(
    h(
      'div',
      { class: 'hero-text' },
      h('div', { class: 'hero-level' }, 'Configuración pendiente'),
      h('div', { class: 'hero-title' }, 'Conecta el panel con tu servidor de Google'),
      h('p', {}, message),
      h('p', { class: 'row' }, btn, h('a', { class: 'btn btn-ghost', href: GUIDE_URL, target: '_blank', rel: 'noopener' }, 'Ver instrucciones')),
    ),
  );
}

async function load() {
  const btn = $('#refresh');
  btn.classList.add('spinning');
  $('#app').setAttribute('aria-busy', 'true');
  try {
    if (!apiUrl()) {
      showSetup('Pega en Ajustes la dirección de la aplicación web de Apps Script (termina en /exec).');
      return;
    }
    const res = await fetch(apiUrl(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`el servidor respondió ${res.status}`);
    const d = await res.json();
    if (d.pendiente) {
      showSetup(d.mensaje);
      return;
    }
    store.set(KEYS.status, JSON.stringify(d));
    banner('');
    render(d);
    checkRises(d);
  } catch (err) {
    // Sin conexión: se muestran los últimos datos guardados en este equipo.
    if (!data) {
      try {
        const saved = JSON.parse(store.get(KEYS.status));
        if (saved) render(saved);
      } catch {
        /* nada guardado */
      }
    }
    if (data) banner(`Sin conexión con el servidor (${err.message}). Se muestran los datos de ${fmtShort(data.generatedAt)}.`);
    else showSetup(`No se pudo conectar con el servidor (${err.message}). Revisa la dirección en Ajustes.`);
  } finally {
    btn.classList.remove('spinning');
    $('#app').setAttribute('aria-busy', 'false');
  }
}

// --- Ajustes -----------------------------------------------------------------------

function openSettings() {
  $('#api-url').value = apiUrl();
  $('#api-msg').textContent = API_URL && apiUrl() === API_URL ? 'Usando la dirección publicada con la app.' : '';
  refreshNotifUi();
  $('#settings').showModal();
}

$('#open-settings').addEventListener('click', openSettings);

$('#api-save').addEventListener('click', async () => {
  const url = $('#api-url').value.trim();
  const msg = $('#api-msg');
  if (!/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec$/.test(url)) {
    msg.textContent = 'La dirección debe empezar con https://script.google.com/ y terminar en /exec.';
    return;
  }
  msg.textContent = 'Probando…';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const d = await res.json();
    store.set(KEYS.api, url);
    msg.textContent = d.pendiente ? 'Conectado. El servidor aún no hace su primera revisión: ejecuta instalar() en Apps Script.' : `Conectado. Última revisión ${ago(d.generatedAt)}.`;
    load();
  } catch (e) {
    msg.textContent = `No respondió como se esperaba (${e.message}). Revisa que la implementación tenga acceso "Cualquier usuario".`;
  }
});

$('#api-share').addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}#api=${encodeURIComponent(apiUrl())}`;
  try {
    await navigator.clipboard.writeText(link);
    $('#api-msg').textContent = 'Enlace copiado. Ábrelo en el otro equipo o teléfono y quedará configurado.';
  } catch {
    $('#api-msg').textContent = link;
  }
});

function refreshNotifUi() {
  const toggle = $('#notif-toggle');
  const msg = $('#notif-msg');
  if (!('Notification' in window)) {
    toggle.disabled = true;
    $('#notif-test').disabled = true;
    msg.textContent = 'Este navegador no permite notificaciones.';
    return;
  }
  const on = notificationsOn();
  toggle.textContent = on ? 'Desactivar notificaciones' : 'Activar notificaciones';
  $('#notif-test').disabled = !on;
  msg.textContent =
    Notification.permission === 'denied'
      ? 'Las notificaciones están bloqueadas: permítelas en la configuración del sitio en el navegador.'
      : on
        ? 'Activadas en este equipo.'
        : '';
}

$('#notif-toggle').addEventListener('click', async () => {
  if (notificationsOn()) {
    store.set(KEYS.notify, 'no');
  } else {
    store.set(KEYS.notify, 'si');
    if (Notification.permission !== 'granted') await Notification.requestPermission();
  }
  refreshNotifUi();
});

$('#notif-test').addEventListener('click', () => {
  const o = data?.overall;
  notify('Prueba · Alerta San Cristóbal', o ? `Estado actual: ${LEVELS[o.level]}. ${o.headline}` : 'Las notificaciones funcionan.', 0);
});

// --- App instalable -------------------------------------------------------------

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#install').hidden = false;
});
$('#install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#install').hidden = true;
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// --- Pestañas ------------------------------------------------------------------

const TABS = ['resumen', 'peligros', 'pronostico', 'comparacion', 'mapa', 'historial'];
const tabFromHash = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : null);

function activate(tab, { updateHash = true, focus = false } = {}) {
  currentTab = tab;
  for (const b of document.querySelectorAll('.tabbar [role="tab"]')) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on) {
      if (focus) b.focus();
      b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // en el celular la barra se desplaza
    }
  }
  for (const p of document.querySelectorAll('.tab-panel')) p.hidden = p.dataset.panel !== tab;
  store.set(KEYS.tab, tab);
  if (updateHash && location.hash.slice(1) !== tab) history.replaceState(null, '', `#${tab}`);
  renderMapViews();
}

$('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[role="tab"]');
  if (!b) return;
  activate(b.dataset.tab);
  window.scrollTo({ top: 0 });
});
$('.tabbar').addEventListener('keydown', (e) => {
  const i = TABS.indexOf(currentTab);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
  if (next == null) return;
  e.preventDefault();
  activate(TABS[(next + TABS.length) % TABS.length], { focus: true });
});
window.addEventListener('hashchange', () => tabFromHash() && activate(tabFromHash(), { updateHash: false }));
$('#overall').addEventListener('click', () => {
  activate('peligros');
  window.scrollTo({ top: 0 });
});
activate(tabFromHash() || (TABS.includes(store.get(KEYS.tab)) ? store.get(KEYS.tab) : 'resumen'), { updateHash: false });

$('#refresh').addEventListener('click', load);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!data || Date.now() - data.generatedAt > 60000)) load();
});
setInterval(load, REFRESH_MS);
setInterval(updateClock, 30000);
load();
