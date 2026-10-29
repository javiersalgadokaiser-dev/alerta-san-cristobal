// Ejecuta google-apps-script/Codigo.gs en un Apps Script simulado, con datos
// reales de internet, para probarlo antes de pegarlo en Google:
//   node tools/probar-apps-script.mjs
// Simula UrlFetchApp (con curl, síncrono como en Google), PropertiesService y
// CacheService con sus límites de tamaño, MailApp (no envía: guarda los correos),
// ScriptApp, LockService, Session y ContentService. El código corre sin fetch,
// URL, Buffer ni structuredClone, igual que en Apps Script.
import { execFileSync } from 'node:child_process';
import { Resolver } from 'node:dns/promises';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(root, 'google-apps-script/Codigo.gs'), 'utf8');
const work = mkdtempSync(join(tmpdir(), 'gas-'));
const OUT = process.env.OUT_DIR;

// Algunas redes no resuelven meteochile.gob.cl: se usa el DNS de Google.
const resolver = new Resolver();
resolver.setServers(['8.8.8.8']);
const resolveArgs = [];
for (const host of ['www.meteochile.gob.cl', 'archivos.meteochile.gob.cl', 'climatologia.meteochile.gob.cl']) {
  try {
    const [ip] = await resolver.resolve4(host);
    resolveArgs.push('--resolve', `${host}:443:${ip}`);
  } catch {
    /* se usa el DNS del sistema */
  }
}

const stats = { fetches: 0, bytes: 0 };
// FALLAS_OPENMETEO=n: las primeras n consultas a Open-Meteo responden 429 (como pasa en Google)
let openMeteoFailures = Number(process.env.FALLAS_OPENMETEO) || 0;
const UrlFetchApp = {
  fetch(url, params = {}) {
    stats.fetches++;
    // XWEATHER_MOCK=1: respuestas de ejemplo de Xweather (sin cuenta real)
    if (process.env.XWEATHER_MOCK && url.includes('xweather.com')) {
      stats.xweather = (stats.xweather || 0) + 1;
      return xweatherMock(url);
    }
    if (openMeteoFailures > 0 && url.includes('open-meteo.com')) {
      openMeteoFailures--;
      stats.rejected = (stats.rejected || 0) + 1;
      return { getResponseCode: () => 429, getAllHeaders: () => ({}), getContentText: () => '{"error":true,"reason":"Too many requests"}', getContent: () => [] };
    }
    const head = join(work, 'h.txt');
    const body = join(work, 'b.bin');
    const args = ['-s', '-L', '--max-time', '40', '-D', head, '-o', body, '-w', '%{http_code}', ...resolveArgs];
    args.push('-X', (params.method || 'get').toUpperCase());
    // Apps Script agrega su propia identificación al User-Agent
    const headers = { ...(params.headers || {}) };
    headers['User-Agent'] = `${headers['User-Agent'] || 'Mozilla/5.0'} (compatible; Google-Apps-Script)`;
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    if (params.payload != null) args.push('--data-binary', String(params.payload));
    args.push(url);
    let code;
    try {
      code = Number(execFileSync('curl', args, { encoding: 'utf8' }));
    } catch (e) {
      throw new Error(`Address unavailable: ${url}`); // así reporta Google un fallo de red
    }
    if (!code) throw new Error(`Address unavailable: ${url}`);
    // Cabeceras de la última respuesta (tras redirecciones)
    const blocks = readFileSync(head, 'utf8').trim().split(/\r?\n\r?\n/);
    const hdrs = {};
    for (const line of blocks[blocks.length - 1].split(/\r?\n/).slice(1)) {
      const i = line.indexOf(':');
      if (i > 0) hdrs[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    const buf = readFileSync(body);
    stats.bytes += buf.length;
    if (!params.muteHttpExceptions && code >= 400) throw new Error(`Request failed returned code ${code}`);
    return {
      getResponseCode: () => code,
      getAllHeaders: () => hdrs,
      getContentText: () => buf.toString('utf8'),
      getContent: () => Array.from(buf, (b) => (b > 127 ? b - 256 : b)),
    };
  },
};

function xweatherMock(url) {
  const json = (o) => ({ getResponseCode: () => 200, getAllHeaders: () => ({ 'Content-Type': 'application/json' }), getContentText: () => JSON.stringify(o), getContent: () => [] });
  const now = Date.now();
  if (url.includes('/lightning/')) {
    const strike = (km, bearing) => ({ ob: { timestamp: Math.floor(now / 1000) - 90, pulse: { type: 'cg' } }, relativeTo: { bearing, distanceKM: km } });
    return json({ success: true, error: null, response: [strike(31.5, 80), strike(64, 120)] });
  }
  if (url.includes('/forecasts/')) {
    const t0 = Math.floor(now / 3600000) * 3600;
    const periods = Array.from({ length: 74 }, (_, h) => ({ timestamp: t0 + h * 3600, tempC: 15 + 5 * Math.sin(h / 4), precipMM: h > 20 && h < 30 ? 1 : 0, windSpeedMPS: 4, windGustMPS: 8 + (h % 12), uvi: 6, weatherPrimaryCoded: h === 3 ? 'S:L:T' : '::SC' }));
    return json({ success: true, error: null, response: [{ periods }] });
  }
  // Mapa: cualquier JPEG a mano (XW_MAPA=archivo.jpg) o un recorte gris generado
  let bytes;
  try {
    bytes = readFileSync(process.env.XW_MAPA);
  } catch {
    bytes = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
  }
  return { getResponseCode: () => 200, getAllHeaders: () => ({ 'Content-Type': 'image/jpeg' }), getContentText: () => '', getContent: () => Array.from(bytes, (b) => (b > 127 ? b - 256 : b)) };
}

function limitedMap(name, maxValue, maxTotal) {
  const m = new Map();
  const total = () => [...m].reduce((s, [k, v]) => s + Buffer.byteLength(k) + Buffer.byteLength(v), 0);
  const check = (k, v) => {
    if (Buffer.byteLength(String(v)) > maxValue) throw new Error(`${name}: el valor de ${k} supera ${maxValue} bytes`);
  };
  return { m, total, check };
}

const props = limitedMap('PropertiesService', 9 * 1024, 500 * 1024);
const scriptProperties = {
  getProperty: (k) => (props.m.has(k) ? props.m.get(k) : null),
  setProperty(k, v) {
    props.check(k, v);
    props.m.set(k, String(v));
    if (props.total() > 500 * 1024) throw new Error('PropertiesService: se superó el total de 500 KB');
    return this;
  },
  setProperties(obj) {
    for (const [k, v] of Object.entries(obj)) this.setProperty(k, v);
    return this;
  },
  deleteProperty(k) {
    props.m.delete(k);
    return this;
  },
  getProperties: () => Object.fromEntries(props.m),
};
for (const [k, v] of Object.entries(JSON.parse(process.env.PROPS || '{}'))) props.m.set(k, v);

const cache = limitedMap('CacheService', 100 * 1024, Infinity);
const scriptCache = {
  get: (k) => (cache.m.has(k) ? cache.m.get(k) : null),
  put(k, v) {
    cache.check(k, v);
    cache.m.set(k, String(v));
  },
  putAll(obj) {
    for (const [k, v] of Object.entries(obj)) this.put(k, v);
  },
  getAll: (keys) => Object.fromEntries(keys.filter((k) => cache.m.has(k)).map((k) => [k, cache.m.get(k)])),
  remove: (k) => cache.m.delete(k),
  removeAll: (keys) => keys.forEach((k) => cache.m.delete(k)),
};

const sentEmails = [];
const triggers = [];
const logs = [];
const log = (...a) => {
  const line = a.join(' ');
  logs.push(line);
  if (!process.env.QUIET) console.log(`  │ ${line.replace(/\n/g, '\n  │ ')}`);
};

const context = vm.createContext({
  UrlFetchApp,
  Utilities: {
    sleep: (ms) => {
      stats.slept = (stats.slept || 0) + ms;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(ms, 200)); // acortado en la prueba
    },
  },
  PropertiesService: { getScriptProperties: () => scriptProperties },
  CacheService: { getScriptCache: () => scriptCache },
  MailApp: {
    sendEmail: (o) => sentEmails.push(o),
    getRemainingDailyQuota: () => 100,
  },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'dueno@ejemplo.cl' }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  ScriptApp: {
    getProjectTriggers: () => triggers,
    deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
    newTrigger: (fn) => ({
      timeBased: () => ({
        everyMinutes: (n) => ({
          create: () => triggers.push({ fn, n, getHandlerFunction: () => fn }),
        }),
      }),
    }),
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }),
  },
  Logger: { log },
  console: { log, error: (...a) => log('ERROR', ...a), warn: log },
});
// AHORA=2026-10-21T13:05-03:00 simula esa hora (p. ej. para probar el boletín de las 13:00)
if (process.env.AHORA) {
  const offset = Date.parse(process.env.AHORA) - Date.now();
  vm.runInContext(`{ const realNow = Date.now; Date.now = () => realNow() + ${offset}; }`, context);
}
vm.runInContext(code, context, { filename: 'Codigo.gs' });
const run = (expr) => vm.runInContext(expr, context);

const t0 = Date.now();
console.log('▶ instalar()');
await run('instalar()');
const ms1 = Date.now() - t0;

const status = JSON.parse(run('doGet({ parameter: {} })').getContent());
const rayos = JSON.parse(run("doGet({ parameter: { accion: 'rayos' } })").getContent());

console.log(`\n▶ Resumen`);
console.log(`  Tiempo de la primera revisión: ${ms1} ms · ${stats.fetches} descargas · ${Math.round(stats.bytes / 1024)} KB`);
if (stats.rejected) console.log(`  Open-Meteo rechazó ${stats.rejected} consultas (simulado); pausas entre reintentos: ${stats.slept || 0} ms`);
console.log(`  Activadores: ${triggers.map((t) => `${t.fn} cada ${t.n} min`).join(', ')}`);
if (status.pendiente) {
  console.log(`  doGet: SIN ESTADO → ${status.mensaje}`);
  if (status.ultimoError) console.log(`  Error: ${status.ultimoError.message}`);
  process.exitCode = 1;
} else {
  console.log(`  doGet estado: ${status.overall.levelName} · ${status.hazards.length} peligros · ${Math.round(JSON.stringify(status).length / 1024)} KB`);
  for (const s of status.sources) console.log(`    ${s.ok ? 'OK   ' : s.stale ? 'VIEJO' : 'FALLA'} ${s.name} — ${s.ok ? s.detail : s.error}`);
  if (status.xweather) {
    const x = status.xweather;
    console.log(`  Xweather: ${x.configured ? 'activo' : 'sin configurar'}${x.risk ? ` · riesgo: ${x.risk}` : ''} · accesos del mes ${x.usage.used}/${x.usage.limit}` +
      (x.lightning ? ` · ${x.lightning.total} rayos, el más cercano a ${x.lightning.strikes[0]?.distKm} km` : ''));
  }
  if (status.glm) {
    console.log(`  Rayos: imagen ${status.glm.file}, ${status.glm.clusters.length} núcleos a ≤ ${status.glm.radiiKm[0]} km` +
      (status.glm.clusters.length ? `; el más cercano a ${status.glm.clusters[0].distKm} km al ${status.glm.clusters[0].direction}` : ''));
  }
}
console.log(`  doGet rayos: ${rayos.frames.length} imagen(es), ${Math.round(JSON.stringify(rayos).length / 1024)} KB`);
const mapa = JSON.parse(run("doGet({ parameter: { accion: 'mapa' } })").getContent());
console.log(`  doGet mapa: ${mapa.map ? `${Math.round(mapa.map.jpeg.length / 1024)} KB en base64` : 'sin mapa'} · claves en caché: ${[...cache.m.keys()].join(', ') || 'ninguna'}`);
console.log(`  Correos: ${sentEmails.map((e) => `«${e.subject}» → ${e.to}`).join(' | ') || 'ninguno'}`);
console.log(`  PropertiesService: ${Math.round(props.total() / 1024)} KB de 500 KB · CacheService: ${Math.round(cache.total() / 1024)} KB`);

console.log('\n▶ revisar() otra vez (no debe repetir correos)');
const before = sentEmails.length;
const t1 = Date.now();
await run('revisar()');
console.log(`  ${Date.now() - t1} ms · correos nuevos: ${sentEmails.length - before} (esperado 0)`);
if (sentEmails.length !== before) process.exitCode = 1;

console.log('\n▶ probarCorreo()');
await run('probarCorreo()');
console.log(`  Asunto: «${sentEmails[sentEmails.length - 1].subject}»`);

if (OUT) {
  writeFileSync(join(OUT, 'estado.json'), JSON.stringify(status, null, 1));
  writeFileSync(join(OUT, 'rayos.json'), JSON.stringify(rayos));
  writeFileSync(join(OUT, 'mapa.json'), JSON.stringify(mapa));
  if (sentEmails[0]) writeFileSync(join(OUT, 'correo.html'), sentEmails[0].htmlBody);
  console.log(`\nArchivos en ${OUT}`);
}
rmSync(work, { recursive: true, force: true });
