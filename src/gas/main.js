// Servidor del sistema en Google Apps Script. tools/build-apps-script.mjs lo
// empaqueta junto con el código compartido en google-apps-script/Codigo.gs.
import './polyfills.js';
import { runCheck } from '../check.js';
import { LOCATION } from '../config.js';
import { buildTestEmail } from '../notify.js';

const PANEL_URL = 'https://javiersalgadokaiser-dev.github.io/alerta-san-cristobal/';
const CHUNK_PROPS = 4000; // las propiedades admiten 9 KB por valor
const CHUNK_CACHE = 50000; // la caché admite 100 KB por valor
const CACHE_SECONDS = 6 * 3600; // máximo que permite CacheService

// --- Almacenamiento por trozos ---------------------------------------------

function chunkedStore(read, write, remove, size) {
  return {
    get(key) {
      const n = Number(read(`${key}#n`));
      if (!n) return null;
      let text = '';
      for (let i = 0; i < n; i++) {
        const part = read(`${key}#${i}`);
        if (part == null) return null; // se perdió un trozo (p. ej. caché vencida)
        text += part;
      }
      return JSON.parse(text);
    },
    put(key, value) {
      const text = JSON.stringify(value);
      const parts = {};
      let n = 0;
      for (let i = 0; i < text.length; i += size) parts[`${key}#${n++}`] = text.slice(i, i + size);
      const old = Number(read(`${key}#n`)) || 0;
      parts[`${key}#n`] = String(n);
      write(parts);
      const stale = [];
      for (let i = n; i < old; i++) stale.push(`${key}#${i}`);
      if (stale.length) remove(stale);
    },
  };
}

function propsStore() {
  const p = PropertiesService.getScriptProperties();
  return chunkedStore(
    (k) => p.getProperty(k),
    (obj) => p.setProperties(obj, false),
    (keys) => keys.forEach((k) => p.deleteProperty(k)),
    CHUNK_PROPS,
  );
}

function cacheStore() {
  const c = CacheService.getScriptCache();
  return chunkedStore(
    (k) => c.get(k),
    (obj) => c.putAll(obj, CACHE_SECONDS),
    (keys) => c.removeAll(keys),
    CHUNK_CACHE,
  );
}

/** El estado va en propiedades (duradero); las imágenes, en la caché. */
function kv() {
  const props = propsStore();
  const cache = cacheStore();
  const pick = (key) => (key === 'glm-frames' ? cache : props);
  return { get: (key) => pick(key).get(key), put: (key, value) => pick(key).put(key, value) };
}

// --- Configuración (Proyecto → Configuración → Propiedades de la secuencia de comandos) --

function setting(name) {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  return v ? String(v).trim() : '';
}

/** CORREOS: direcciones separadas por coma. Si está vacío, se usa tu Gmail. */
function recipients() {
  const list = setting('CORREOS')
    .split(/[,;\s]+/)
    .filter((s) => s.includes('@'));
  if (list.length) return list;
  const me = Session.getEffectiveUser().getEmail();
  return me ? [me] : [];
}

const mailer = {
  get configured() {
    return recipients().length > 0;
  },
  // CORREOS_PAUSADOS = si: se sigue revisando, pero no se envía nada
  get paused() {
    return setting('CORREOS_PAUSADOS').toLowerCase() === 'si';
  },
  send({ subject, html, text }) {
    const to = recipients();
    if (MailApp.getRemainingDailyQuota() < to.length) return { ok: false, error: 'Se agotó la cuota diaria de correos de Google' };
    MailApp.sendEmail({ to: to.join(','), subject, htmlBody: html, body: text, name: 'Alerta San Cristóbal' });
    return { ok: true, to: to.length };
  },
};

function settings() {
  return {
    dashboardUrl: setting('URL_PANEL') || PANEL_URL,
    contact: setting('URL_PANEL') || PANEL_URL,
    // Clave del plan pagado de Open-Meteo (opcional; necesaria para uso comercial)
    openMeteoKey: setting('OPENMETEO_APIKEY'),
  };
}

// --- Funciones que se ejecutan desde Apps Script ------------------------------

/** Una revisión completa. La ejecuta el activador cada 10 minutos. */
export async function revisar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    console.log('Ya hay una revisión en curso; se omite esta.');
    return null;
  }
  const t0 = Date.now();
  try {
    const status = await runCheck({ kv: kv(), mailer, settings: settings(), now: Date.now() });
    PropertiesService.getScriptProperties().deleteProperty('ULTIMO_ERROR');
    const fallas = status.sources.filter((s) => !s.ok).map((s) => `${s.name}: ${s.error}`);
    console.log(`Revisión lista en ${Date.now() - t0} ms. Estado: ${status.overall.levelName} · ${status.overall.headline}`);
    if (fallas.length) console.log(`Fuentes con problemas:\n- ${fallas.join('\n- ')}`);
    if (status.changes) console.log(`Cambios: ${status.changes}. Correo: ${status.email.last ? status.email.last.subject : '—'}`);
    return status;
  } catch (e) {
    // Apps Script no informa los errores dentro de promesas: se guardan aquí
    // para que el panel los muestre.
    const msg = String((e && e.stack) || e);
    PropertiesService.getScriptProperties().setProperty('ULTIMO_ERROR', JSON.stringify({ at: Date.now(), message: msg.slice(0, 1500) }));
    console.error(`La revisión falló: ${msg}`);
    return null;
  } finally {
    lock.releaseLock();
  }
}

/** Primera vez: crea el activador de cada 10 minutos y hace una revisión. */
export async function instalar() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'revisar') ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger('revisar').timeBased().everyMinutes(10).create();
  console.log('Activador creado: revisar() se ejecutará cada 10 minutos.');
  console.log(`Los correos se enviarán a: ${recipients().join(', ') || '(nadie)'}`);
  await revisar();
}

/** Detiene las revisiones automáticas. */
export function desinstalar() {
  let n = 0;
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'revisar') {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  }
  console.log(n ? 'Revisiones automáticas detenidas.' : 'No había revisiones automáticas activas.');
}

/** Deja de enviar correos (las revisiones y la app siguen funcionando). */
export function pausarCorreos() {
  PropertiesService.getScriptProperties().setProperty('CORREOS_PAUSADOS', 'si');
  console.log('Correos en pausa. Las revisiones y la app siguen funcionando. Para reactivarlos, ejecuta reanudarCorreos().');
}

/** Vuelve a enviar correos. Solo avisa los cambios que ocurran desde ahora. */
export function reanudarCorreos() {
  PropertiesService.getScriptProperties().deleteProperty('CORREOS_PAUSADOS');
  console.log(`Correos reactivados. Se enviarán a: ${recipients().join(', ')}`);
}

/** Envía un correo de prueba con el estado actual (aunque los correos estén en pausa). */
export async function probarCorreo() {
  const status = kv().get('status') || (await revisar());
  if (!status) {
    console.error('No hay estado para incluir: revisa el error de la revisión.');
    return;
  }
  const r = mailer.send(buildTestEmail(status, { location: LOCATION, dashboardUrl: settings().dashboardUrl }));
  console.log(r.ok ? `Correo de prueba enviado a ${recipients().join(', ')}` : `No se pudo enviar: ${r.error}`);
}

/** Muestra en el registro el estado guardado. */
export function verEstado() {
  const s = kv().get('status');
  if (!s) return console.log('Aún no hay ninguna revisión. Ejecuta instalar().');
  console.log(`Última revisión: ${new Date(s.generatedAt).toLocaleString('es-CL', { timeZone: LOCATION.timezone })}`);
  console.log(`Estado: ${s.overall.levelName} · ${s.overall.headline}`);
  console.log(mailer.paused ? 'Correos: EN PAUSA (ejecuta reanudarCorreos para activarlos)' : `Correos: activos, a ${recipients().join(', ')}`);
  for (const h of s.hazards) console.log(`  ${h.name}: ${h.levelName}`);
  for (const src of s.sources) console.log(`  [${src.ok ? 'OK' : 'FALLA'}] ${src.name}${src.ok ? '' : `: ${src.error}`}`);
  const err = setting('ULTIMO_ERROR');
  if (err) console.log(`Último error: ${err}`);
}

// --- Aplicación web: la consulta el panel -------------------------------------

/** GET ?accion=estado (por defecto) o ?accion=rayos */
export function doGet(e) {
  const accion = (e && e.parameter && e.parameter.accion) || 'estado';
  let body;
  if (accion === 'rayos') {
    body = { frames: kv().get('glm-frames') || [] };
  } else {
    body = kv().get('status') || { pendiente: true, mensaje: 'Aún no hay una primera revisión. En Apps Script, ejecuta instalar().' };
    const err = setting('ULTIMO_ERROR');
    if (err) body.ultimoError = JSON.parse(err);
  }
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
