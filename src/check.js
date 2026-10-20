import * as cfg from './config.js';
import { HAZARDS, evaluate } from './engine.js';
import { buildAlertEmail, describeChange, diffAlerts } from './notify.js';
import { fetchMetars, fetchTafs } from './sources/aviation.js';
import { activeAlerts, dmcSignature, fetchDmc, parseDmc } from './sources/dmc.js';
import { loadGlm } from './sources/glm.js';
import { fetchMetNo } from './sources/metno.js';
import { fetchOpenMeteo } from './sources/openmeteo.js';
import { HOUR } from './util.js';

const { LOCATION, MODELS, DMC, GLM, STATIONS, HORIZON_HOURS, OPEN_METEO_CACHE_MINUTES, NOTIFY } = cfg;
const STALE_LIMIT = 6 * HOUR; // datos guardados que se aceptan si una fuente falla
const MAX_EMAIL_RETRIES = 6;

/**
 * Una revisión completa: consulta las fuentes, evalúa los peligros, envía el
 * correo si algo cambió y guarda el estado para el panel.
 *
 * No depende de la plataforma; recibe:
 *   kv:       { get(clave) → objeto | null, put(clave, objeto) }
 *   mailer:   { configured, send({ subject, html, text }) → { ok, skipped?, error? } }
 *   settings: { dashboardUrl, contact, dmcUrl }
 */
export async function runCheck({ kv, mailer, settings = {}, now = Date.now() }) {
  const state = (await kv.get('state')) || {};
  state.cache = state.cache || {};
  state.history = state.history || [];
  const sources = [];
  let newFrame = null;

  // Ejecuta un cargador y registra su estado para el panel.
  async function track(id, name, url, loader) {
    try {
      const { data, meta } = await loader();
      sources.push({ id, name, url, ok: true, ...meta });
      return data;
    } catch (e) {
      const cached = state.cache[id];
      if (cached && now - cached.fetchedAt < STALE_LIMIT) {
        sources.push({ id, name, url, ok: false, stale: true, fetchedAt: cached.fetchedAt, error: errorText(e) });
        return cached.data;
      }
      sources.push({ id, name, url, ok: false, error: errorText(e) });
      return null;
    }
  }

  const fresh = (id, data, detail) => {
    state.cache[id] = { fetchedAt: now, data };
    return { data, meta: { fetchedAt: now, detail } };
  };
  const reuse = (id, detail) => ({ data: state.cache[id].data, meta: { fetchedAt: state.cache[id].fetchedAt, detail } });

  const models = await track('openmeteo', `Open-Meteo (${MODELS.length} modelos globales)`, 'https://open-meteo.com', async () => {
    const c = state.cache.openmeteo;
    if (c && now - c.fetchedAt < OPEN_METEO_CACHE_MINUTES * 60000) return reuse('openmeteo', `${c.data.length} modelos`);
    const data = await fetchOpenMeteo(LOCATION, MODELS, HORIZON_HOURS + 2);
    return fresh('openmeteo', data, `${data.length} modelos`);
  });

  const metno = await track('metno', 'MET Norway', 'https://api.met.no', async () => {
    const c = state.cache.metno;
    if (c && c.expires > now) return reuse('metno', 'sin cambios');
    const r = await fetchMetNo(LOCATION, { lastModified: c && c.lastModified, contact: settings.contact || settings.dashboardUrl });
    if (r.notModified && c) {
      c.expires = r.expires;
      return reuse('metno', 'sin cambios');
    }
    const out = fresh('metno', trimSeries(r.series, now - HOUR, now + (HORIZON_HOURS + 6) * HOUR), 'pronóstico horario');
    Object.assign(state.cache.metno, { expires: r.expires, lastModified: r.lastModified });
    return out;
  });

  const metars = await track('metar', 'METAR Tobalaba y Pudahuel', 'https://aviationweather.gov', async () => {
    const data = await fetchMetars(STATIONS.metar, LOCATION);
    return fresh('metar', data, `${data.length} reportes de las últimas 3 h`);
  });

  const tafs = await track('taf', 'TAF Pudahuel y Tobalaba', 'https://aviationweather.gov', async () => {
    const data = await fetchTafs(STATIONS.taf);
    return fresh('taf', data, data.length === 1 ? '1 pronóstico' : `${data.length} pronósticos`);
  });

  const dmcParsed = await track('dmc', 'DMC · Avisos, Alertas y Alarmas', DMC.pageUrl, async () => {
    const raw = await fetchDmc(settings.dmcUrl || DMC.url);
    // Solo se vuelven a interpretar los avisos cuando la DMC publica algo nuevo.
    const sig = dmcSignature(raw);
    const cached = state.cache.dmc && state.cache.dmc.data;
    const data = cached && cached.sig === sig ? cached : { sig, ...parseDmc(raw, LOCATION, DMC) };
    return fresh('dmc', data, raw.fecha_actualizacion ? `publicado ${raw.fecha_actualizacion}` : '');
  });

  const glm = await track('glm', 'DMC · Rayos por satélite (GOES-19)', GLM.pageUrl, async () => {
    const previous = state.cache.glm && state.cache.glm.data;
    const r = await loadGlm(GLM, LOCATION, now, previous);
    const n = r.data.clusters.length;
    const detail = n ? `${n} núcleo${n === 1 ? '' : 's'} con rayos a menos de ${GLM.radiiKm[0]} km` : `sin rayos a menos de ${GLM.radiiKm[0]} km`;
    if (!r.frame) return reuse('glm', detail);
    newFrame = r.frame;
    return fresh('glm', r.data, detail);
  });

  const dmc = dmcParsed ? { ...dmcParsed, sig: undefined, alerts: activeAlerts(dmcParsed.alerts, now) } : null;
  const forecasts = [...(models || []), ...(metno ? [metno] : [])];
  const result = evaluate({
    now,
    forecasts,
    metars: metars || [],
    tafs: tafs || [],
    dmcAlerts: dmc ? dmc.alerts : [],
    glm,
    cfg,
  });

  // --- Notificaciones -------------------------------------------------------
  const degraded = !(models && models.length);
  const dmcAlerts = dmc ? dmc.alerts : [];
  const { changes, notified, dmcSeen } = diffAlerts(state, result, dmcAlerts, now, NOTIFY, degraded);
  state.notified = notified;
  state.dmcSeen = dmcSeen;

  if (changes.length) {
    const email = buildAlertEmail(changes, result, dmcAlerts, { location: LOCATION, dashboardUrl: settings.dashboardUrl });
    const sent = await sendSafely(mailer, email);
    state.lastEmail = { at: now, subject: email.subject, ok: sent.ok, skipped: !!sent.skipped, error: sent.error || null };
    // Si el envío falla, el correo se reintenta en las próximas revisiones.
    state.retryEmail = sent.ok || sent.skipped ? null : { ...email, attempts: 1 };
    for (const c of changes) {
      state.history.push({
        at: now,
        type: c.type,
        hazardId: c.hazardId,
        from: c.from == null ? null : c.from,
        to: c.to || 0,
        text: describeChange(c, result, dmcAlerts, LOCATION.timezone),
        emailed: sent.ok,
      });
    }
    state.history = state.history.slice(-NOTIFY.historySize);
  } else if (state.retryEmail && state.retryEmail.attempts < MAX_EMAIL_RETRIES) {
    const { attempts, ...email } = state.retryEmail;
    const sent = await sendSafely(mailer, email);
    state.lastEmail = { at: now, subject: email.subject, ok: sent.ok, skipped: !!sent.skipped, error: sent.error || null, retry: attempts };
    state.retryEmail = sent.ok || sent.skipped ? null : { ...email, attempts: attempts + 1 };
  }

  if (newFrame) {
    const frames = ((await kv.get('glm-frames')) || []).filter((f) => f.time !== newFrame.time);
    frames.push(newFrame);
    frames.sort((a, b) => a.time - b.time);
    await kv.put('glm-frames', frames.slice(-GLM.frames));
  }

  const status = {
    version: 2,
    generatedAt: now,
    location: LOCATION,
    horizonHours: HORIZON_HOURS,
    thresholds: cfg.THRESHOLDS,
    overall: result.overall,
    hazards: result.hazards,
    hazardOrder: HAZARDS.map((h) => h.id),
    timeline: result.timeline,
    perSource: result.perSource,
    observations: result.observations,
    tafs: tafs || [],
    dmc,
    dmcPage: DMC.pageUrl,
    glm: glm ? glmSummary(glm) : null,
    meteoredUrl: cfg.METEORED_URL,
    sources,
    degraded,
    changes: changes.length,
    history: [...state.history].reverse().slice(0, 50),
    email: { configured: !!mailer.configured, last: state.lastEmail || null },
  };

  await kv.put('state', state);
  await kv.put('status', status);
  return status;
}

/** Lo que el panel necesita para dibujar el cerro y los anillos sobre el recorte. */
function glmSummary(glm) {
  const { ax, bx, ay, by } = GLM.projection;
  const kmPerDegLon = 111.32 * Math.cos((LOCATION.lat * Math.PI) / 180);
  return {
    time: glm.time,
    file: glm.file,
    clusters: glm.clusters,
    nearestKm: glm.nearestKm,
    radiiKm: GLM.radiiKm,
    maxAgeMinutes: GLM.maxAgeMinutes,
    pageUrl: GLM.pageUrl,
    crop: { w: GLM.crop.w, h: GLM.crop.h },
    cerro: { x: ax * LOCATION.lon + bx - GLM.crop.x, y: ay * LOCATION.lat + by - GLM.crop.y },
    pxPerKm: { x: Math.abs(ax) / kmPerDegLon, y: Math.abs(ay) / 110.57 },
  };
}

async function sendSafely(mailer, email) {
  if (!mailer || !mailer.configured) return { ok: false, skipped: true, error: 'Correo no configurado' };
  try {
    return await mailer.send(email);
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

function trimSeries(s, from, to) {
  const keep = s.times.map((t) => t >= from && t <= to);
  const out = { ...s };
  for (const [k, v] of Object.entries(s)) if (Array.isArray(v)) out[k] = v.filter((_, i) => keep[i]);
  return out;
}

function errorText(e) {
  if (e && e.name === 'TimeoutError') return 'Tiempo de espera agotado';
  const msg = String((e && e.message) || e);
  if (/DNS|Address unavailable|getaddrinfo|ENOTFOUND/i.test(msg)) return 'No se pudo conectar con el servidor';
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}
