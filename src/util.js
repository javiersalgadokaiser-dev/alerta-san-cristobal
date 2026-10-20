// Este código corre en Google Apps Script (motor V8 con ECMAScript 2019 tras
// la conversión con esbuild) y en Node para las pruebas: no usar APIs que solo
// existen en navegadores o en Node (URL, structuredClone, Buffer, Array.at…).

export const HOUR = 3600000;

export const LEVELS = [
  { level: 0, key: 'normal', name: 'Normal', color: 'verde', emoji: '🟢' },
  { level: 1, key: 'aviso', name: 'Aviso', color: 'amarillo', emoji: '🟡' },
  { level: 2, key: 'alerta', name: 'Alerta', color: 'naranja', emoji: '🟠' },
  { level: 3, key: 'alarma', name: 'Alarma', color: 'roja', emoji: '🔴' },
];

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function median(values) {
  const a = values.filter(isNum).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function maxOf(values) {
  const a = values.filter(isNum);
  return a.length ? Math.max(...a) : null;
}

export function minOf(values) {
  const a = values.filter(isNum);
  return a.length ? Math.min(...a) : null;
}

export function sumOf(values) {
  return values.filter(isNum).reduce((s, v) => s + v, 0);
}

export function round(v, digits = 0) {
  if (!isNum(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Nivel 0-3 según umbrales [aviso, alerta, alarma] (valor igual o mayor). */
export function levelAbove(value, thresholds) {
  if (!isNum(value)) return 0;
  return thresholds.reduce((lvl, t, i) => (value >= t ? i + 1 : lvl), 0);
}

/** Nivel 0-3 según umbrales [aviso, alerta, alarma] (valor igual o menor). */
export function levelBelow(value, thresholds) {
  if (!isNum(value)) return 0;
  return thresholds.reduce((lvl, t, i) => (value <= t ? i + 1 : lvl), 0);
}

/** Suma máxima en una ventana móvil de `width` horas (ventanas [i, i + width)). */
export function maxWindowSum(values, width) {
  let best = null;
  let start = -1;
  let sum = 0;
  let count = 0;
  for (let j = 0; j < Math.min(width, values.length); j++) {
    if (isNum(values[j])) {
      sum += values[j];
      count++;
    }
  }
  for (let i = 0; i < values.length; i++) {
    if (count && (best === null || sum > best)) {
      best = sum;
      start = i;
    }
    if (isNum(values[i])) {
      sum -= values[i];
      count--;
    }
    const k = i + width;
    if (k < values.length && isNum(values[k])) {
      sum += values[k];
      count++;
    }
  }
  return { value: best, start };
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ordm: 'º', ordf: 'ª',
};

export function decodeEntities(s = '') {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/** HTML de la DMC a texto plano (los <br> pasan a saltos de línea). */
export function htmlToText(s = '') {
  return decodeEntities(String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** Minúsculas y sin tildes, para comparar textos. */
export function fold(s = '') {
  return decodeEntities(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes → base64 (sin depender de btoa ni de Buffer). */
export function base64Encode(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + '=';
  }
  return out;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// --- Zona horaria -----------------------------------------------------------

const formatters = new Map();
function formatter(tz, opts) {
  const key = tz + JSON.stringify(opts);
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat('es-CL', { timeZone: tz, ...opts }));
  return formatters.get(key);
}

function partsAt(ms, tz) {
  const f = formatter(tz, {
    hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Diferencia (ms) entre la hora local de `tz` y UTC en el instante `ms`. */
export function tzOffsetMs(ms, tz) {
  const p = partsAt(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Fecha/hora local de `tz` (mes 1-12) a instante UTC en ms. */
export function localToUtc(y, mo, d, h, tz) {
  const guess = Date.UTC(y, mo - 1, d, h);
  const off = tzOffsetMs(guess, tz);
  let t = guess - off;
  const off2 = tzOffsetMs(t, tz);
  if (off2 !== off) t = guess - off2;
  return t;
}

/** "lun 19, 15:00" en la zona horaria indicada. */
export function formatLocal(ms, tz, { withDay = true } = {}) {
  if (!isNum(ms)) return '';
  const opts = withDay
    ? { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  return formatter(tz, opts).format(new Date(ms)).replace(/\./g, '');
}

export function formatRange(start, end, tz) {
  if (!isNum(start)) return '';
  if (!isNum(end) || end <= start) return `desde ${formatLocal(start, tz)}`;
  return `${formatLocal(start, tz)} → ${formatLocal(end, tz)}`;
}
