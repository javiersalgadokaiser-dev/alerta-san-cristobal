import * as cfg from './config.js';
import { HAZARDS, evaluate } from './engine.js';
import { buildBulletinEmail, describeChange, diffAlerts, dueBulletin, nextBulletin } from './notify.js';
import { fetchMetars, fetchTafs } from './sources/aviation.js';
import { activeAlerts, dmcSignature, fetchDmc, parseDmc } from './sources/dmc.js';
import { loadGlm } from './sources/glm.js';
import { fetchMetNo } from './sources/metno.js';
import { fetchOpenMeteo } from './sources/openmeteo.js';
import { fetchXweatherForecast, fetchXweatherLightning, fetchXweatherMap, xweatherBudget } from './sources/xweather.js';
import { HOUR, formatLocal } from './util.js';

const { LOCATION, MODELS, DMC, GLM, XWEATHER, STATIONS, HORIZON_HOURS, OPEN_METEO_CACHE_MINUTES, NOTIFY, CACHE_VERSION } = cfg;
const STALE_LIMIT = 6 * HOUR; // datos guardados que se aceptan si una fuente falla

/**
 * Una revisión completa: consulta las fuentes, evalúa los peligros, registra los
 * cambios, envía el boletín si es la hora (7:00, 13:00 y 18:00) y guarda el estado
 * para el panel.
 *
 * No depende de la plataforma; recibe:
 *   kv:       { get(clave) → objeto | null, put(clave, objeto) }
 *   mailer:   { configured, send({ subject, html, text }) → { ok, skipped?, error? } }
 *   settings: { dashboardUrl, contact, dmcUrl, openMeteoKey, xweather: { id, secret, limit } }
 */
export async function runCheck({ kv, mailer, settings = {}, now = Date.now() }) {
  const state = (await kv.get('state')) || {};
  // Datos guardados con otro formato o unidades (p. ej. viento en km/h): se descartan
  if (state.cacheVersion !== CACHE_VERSION) {
    state.cache = {};
    state.cacheVersion = CACHE_VERSION;
  }
  state.cache = state.cache || {};
  state.history = state.history || [];
  state.pending = state.pending || [];
  const sources = [];
  let newFrame = null;

  // Ejecuta un cargador y registra su estado para el panel.
  // Si una fuente falla, se espera 10, 20, 40 y hasta 60 minutos antes de volver a
  // consultarla: así una fuente caída no alarga cada revisión (Apps Script limita
  // el tiempo diario) ni insiste sobre un servidor que rechaza las consultas.
  state.backoff = state.backoff || {};
  const fallback = (id, name, url, error, staleLimit) => {
    const cached = state.cache[id];
    if (cached && now - cached.fetchedAt < staleLimit) {
      sources.push({ id, name, url, ok: false, stale: true, fetchedAt: cached.fetchedAt, error });
      return cached.data;
    }
    sources.push({ id, name, url, ok: false, error });
    return null;
  };

  async function track(id, name, url, loader, { staleLimit = STALE_LIMIT } = {}) {
    const wait = state.backoff[id];
    if (wait && now < wait.until) {
      return fallback(id, name, url, `${wait.error} · se reintentará a las ${formatLocal(wait.until, LOCATION.timezone, { withDay: false })}`, staleLimit);
    }
    try {
      const { data, meta } = await loader();
      delete state.backoff[id];
      sources.push({ id, name, url, ok: true, ...meta });
      return data;
    } catch (e) {
      const failures = (wait ? wait.failures : 0) + 1;
      state.backoff[id] = { failures, until: now + Math.min(60, 10 * 2 ** (failures - 1)) * 60000 - 60000, error: errorText(e) };
      return fallback(id, name, url, errorText(e), staleLimit);
    }
  }
  // Un pronóstico de hasta 12 h sigue siendo útil (los modelos se actualizan cada 6 h)
  const FORECAST_STALE = 12 * HOUR;

  const fresh = (id, data, detail) => {
    state.cache[id] = { fetchedAt: now, data };
    return { data, meta: { fetchedAt: now, detail } };
  };
  const reuse = (id, detail) => ({ data: state.cache[id].data, meta: { fetchedAt: state.cache[id].fetchedAt, detail } });

  const models = await track('openmeteo', `Open-Meteo (${MODELS.length} modelos globales)`, 'https://open-meteo.com', async () => {
    const c = state.cache.openmeteo;
    if (c && now - c.fetchedAt < OPEN_METEO_CACHE_MINUTES * 60000) return reuse('openmeteo', `${c.data.length} modelos`);
    const data = await fetchOpenMeteo(LOCATION, MODELS, HORIZON_HOURS + 2, { apiKey: settings.openMeteoKey });
    return fresh('openmeteo', data, `${data.length} modelos`);
  }, { staleLimit: FORECAST_STALE });

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
  }, { staleLimit: FORECAST_STALE });

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

  // --- Xweather (solo si hay clave) ---------------------------------------------
  const xw = settings.xweather;
  const xwOn = !!(xw && xw.id && xw.secret);
  state.xweather = state.xweather || {};
  const budget = xweatherBudget(state.xweather, now, (xw && xw.limit) || XWEATHER.monthlyLimit);
  const spend = (cost) => {
    if (!budget.can(cost)) throw new Error('Se alcanzó el límite mensual de accesos de Xweather');
    budget.spend(cost);
  };
  let xwForecast = null;
  let xlightning = null;
  let newMap = null;
  let risk = null;
  if (xwOn) {
    xwForecast = await track('xweather-pronostico', 'Xweather · pronóstico horario', XWEATHER.pageUrl, async () => {
      const c = state.cache['xweather-pronostico'];
      if (c && now - c.fetchedAt < XWEATHER.forecastMinutes * 60000) return reuse('xweather-pronostico', 'pronóstico horario');
      spend(1);
      return fresh('xweather-pronostico', await fetchXweatherForecast(LOCATION, xw, HORIZON_HOURS + 2), 'pronóstico horario');
    }, { staleLimit: FORECAST_STALE });

    // Los rayos cuestan 10 accesos: se consultan solo cuando hay riesgo de tormenta.
    risk = stormRisk({
      now,
      forecasts: [...(models || []), metno, xwForecast],
      glm,
      metars: metars || [],
      dmcAlerts: dmc ? dmc.alerts : [],
      lastStrikeAt: state.xweather.lastStrikeAt,
      hours: XWEATHER.stormLookaheadHours,
    });
    xlightning = await track('xweather-rayos', 'Xweather · rayos en tiempo real', XWEATHER.pageUrl, async () => {
      if (!risk) return { data: null, meta: { fetchedAt: now, detail: 'sin riesgo de tormenta: en espera (se activa con cualquier señal)' } };
      spend(XWEATHER.lightningCost);
      const strikes = await fetchXweatherLightning(LOCATION, xw, XWEATHER.radiusKm);
      if (strikes.length) state.xweather.lastStrikeAt = now;
      const detail = strikes.length ? `${strikes.length} rayos en 5 min a menos de ${XWEATHER.radiusKm} km` : 'sin rayos en los últimos 5 minutos';
      return fresh('xweather-rayos', { time: now, total: strikes.length, strikes: strikes.slice(0, 30) }, `${detail} · activo por ${risk}`);
    });

    await track('xweather-mapa', 'Xweather · mapa de tormentas', XWEATHER.pageUrl, async () => {
      const c = state.cache['xweather-mapa'];
      const every = (risk ? XWEATHER.mapMinutes.storm : XWEATHER.mapMinutes.calm) * 60000;
      if (c && now - c.fetchedAt < every) return reuse('xweather-mapa', 'mapa');
      spend(1);
      newMap = { time: now, jpeg: await fetchXweatherMap(LOCATION, xw, XWEATHER.map) };
      return fresh('xweather-mapa', { time: now }, 'mapa actualizado');
    });
  } else {
    sources.push({
      id: 'xweather',
      name: 'Xweather · rayos, pronóstico y mapa',
      url: XWEATHER.pageUrl,
      ok: false,
      disabled: true,
      error: 'Sin configurar: agrega XWEATHER_ID y XWEATHER_SECRET en las propiedades del proyecto de Apps Script',
    });
  }

  const forecasts = [...(models || []), ...(metno ? [metno] : []), ...(xwForecast ? [xwForecast] : [])];
  const result = evaluate({
    now,
    forecasts,
    metars: metars || [],
    tafs: tafs || [],
    dmcAlerts: dmc ? dmc.alerts : [],
    glm,
    xlightning,
    cfg,
  });

  // --- Notificaciones -------------------------------------------------------
  const degraded = !(models && models.length);
  const dmcAlerts = dmc ? dmc.alerts : [];
  const { changes, notified, dmcSeen } = diffAlerts(state, result, dmcAlerts, now, NOTIFY, degraded);
  state.notified = notified;
  state.dmcSeen = dmcSeen;

  // Los cambios quedan en el historial y esperan el próximo boletín.
  for (const c of changes) {
    const entry = {
      at: now,
      type: c.type,
      hazardId: c.hazardId,
      from: c.from == null ? null : c.from,
      to: c.to || 0,
      text: describeChange(c, result, dmcAlerts, LOCATION.timezone),
      emailed: false,
    };
    state.history.push(entry);
    state.pending.push({ at: entry.at, text: entry.text, to: entry.to });
  }
  state.history = state.history.slice(-NOTIFY.historySize);
  state.pending = state.pending.slice(-50);
  delete state.retryEmail; // de la versión con correos inmediatos

  // Boletín a las 7:00, 13:00 y 18:00. Si el envío falla, se reintenta en las
  // revisiones siguientes mientras dure la ventana (60 min).
  const slot = dueBulletin(now, state.lastBulletin, NOTIFY, LOCATION.timezone);
  if (slot) {
    const email = buildBulletinEmail(state.pending, result, { location: LOCATION, dashboardUrl: settings.dashboardUrl, label: slot.label });
    const sent = await sendSafely(mailer, email);
    state.lastEmail = { at: now, subject: email.subject, ok: sent.ok, skipped: !!sent.skipped, error: sent.error || null };
    if (sent.ok || sent.skipped) {
      // En pausa también se da por cerrado: al reanudar solo se informa lo nuevo.
      const sentAt = new Set(state.pending.map((p) => p.at));
      if (sent.ok) for (const h of state.history) if (sentAt.has(h.at)) h.emailed = true;
      state.pending = [];
      state.lastBulletin = slot.key;
    }
  }

  if (newMap) await kv.put('xw-map', newMap);

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
    upcoming: result.upcoming,
    hazards: result.hazards,
    hazardOrder: HAZARDS.map((h) => h.id),
    timeline: result.timeline,
    perSource: result.perSource,
    series: result.series,
    observations: result.observations,
    tafs: tafs || [],
    dmc,
    dmcPage: DMC.pageUrl,
    glm: glm ? glmSummary(glm) : null,
    xweather: {
      configured: xwOn,
      risk,
      radiiKm: GLM.radiiKm,
      usage: { month: state.xweather.month, used: state.xweather.used || 0, limit: (xw && xw.limit) || XWEATHER.monthlyLimit },
      lightning: xlightning,
      map: state.cache['xweather-mapa']
        ? {
            time: state.cache['xweather-mapa'].fetchedAt,
            ...XWEATHER.map,
            // metros por píxel en la proyección del mapa (Web Mercator)
            mPerPx: (156543.03 * Math.cos((LOCATION.lat * Math.PI) / 180)) / 2 ** XWEATHER.map.zoom,
          }
        : null,
    },
    windyEmbed: cfg.WINDY_EMBED,
    meteoredUrl: cfg.METEORED_URL,
    sources,
    degraded,
    changes: changes.length,
    history: [...state.history].reverse().slice(0, 50),
    email: {
      configured: !!mailer.configured,
      paused: !!mailer.paused,
      last: state.lastEmail || null,
      schedule: NOTIFY.bulletinHours.map((h) => `${String(h).padStart(2, '0')}:00`),
      next: nextBulletin(now, NOTIFY, LOCATION.timezone),
      pending: state.pending.length,
    },
  };

  await kv.put('state', state);
  await kv.put('status', status);
  return status;
}

/**
 * ¿Hay alguna señal de tormenta? Devuelve el motivo (para mostrarlo) o null.
 * Con señal se consultan los rayos de Xweather; sin ella, no se gastan accesos.
 */
export function stormRisk({ now, forecasts, glm, metars, dmcAlerts, lastStrikeAt, hours }) {
  const until = now + hours * HOUR;
  for (const s of forecasts) {
    if (!s) continue;
    for (let i = 0; i < s.times.length; i++) {
      if (s.times[i] >= now - HOUR && s.times[i] <= until && s.thunder[i] === true) return `pronóstico de ${s.name}`;
    }
  }
  if (glm && glm.clusters && glm.clusters.length) return 'rayos por satélite';
  if (metars.some((m) => m.thunder || m.thunderNear || m.thunderRecent || m.cb)) return 'observación en aeródromos';
  if (dmcAlerts.some((a) => a.hazard === 'tormenta' && (!a.start || a.start <= until) && (!a.end || a.end >= now))) return 'aviso de la DMC';
  if (lastStrikeAt && now - lastStrikeAt < HOUR) return 'rayos en la última hora';
  return null;
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
  // En pausa: el cambio queda en el historial, pero no se envía ni se reintenta después
  if (mailer.paused) return { ok: false, skipped: true, error: 'Correos en pausa' };
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
