import { upcomingEvents } from './upcoming.js';
import { HOUR, LEVELS, isNum, levelAbove, levelBelow, maxOf, maxWindowSum, median, minOf, round, sumOf } from './util.js';

// Los textos no incluyen fechas formateadas: las horas van como números (start,
// end, peak) y se formatean en el panel (hora del navegador) o al armar el correo.

const GLM_AGES = ['0 y 15', '15 y 30', '30 y 45', '45 y 60'];

// Peligros en orden de prioridad: ante el mismo nivel, manda el primero.
export const HAZARDS = [
  { id: 'tormenta', name: 'Tormenta eléctrica', emoji: '⚡' },
  { id: 'lluvia', name: 'Lluvia intensa', emoji: '🌧️' },
  { id: 'viento', name: 'Viento fuerte', emoji: '💨' },
  { id: 'nieve', name: 'Nieve', emoji: '❄️' },
  { id: 'calor', name: 'Calor extremo', emoji: '🌡️' },
  { id: 'helada', name: 'Helada', emoji: '🧊' },
  { id: 'uv', name: 'Radiación UV', emoji: '☀️' },
  { id: 'otro', name: 'Otros avisos DMC', emoji: '⚠️' },
];

const FIELDS = ['temp', 'precip', 'thunder', 'cape', 'gust', 'wind', 'snow', 'uv'];

/** Categoría del índice UV según la OMS. */
export const uvCategory = (v) => (v >= 11 ? 'extremo' : v >= 8 ? 'muy alto' : v >= 6 ? 'alto' : v >= 3 ? 'moderado' : 'bajo');

function align(src, grid) {
  const index = new Map(src.times.map((t, i) => [t, i]));
  const out = { id: src.id, name: src.name, origin: src.origin, provider: src.provider };
  for (const f of FIELDS) {
    out[f] = grid.map((t) => {
      const i = index.get(t);
      return i === undefined ? null : (src[f]?.[i] ?? null);
    });
  }
  return out;
}

const coverage = (arr) => arr.filter((v) => v !== null).length / arr.length;

/** Primera y última hora en que se cumple `test`, más la hora de mayor `score`. */
function windowOf(timeline, test, score) {
  const hits = timeline.filter(test);
  if (!hits.length) return {};
  const peak = hits.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { start: hits[0].t, end: hits[hits.length - 1].t + HOUR, peak: peak.t };
}

/**
 * Combina pronósticos, observaciones y avisos oficiales en un nivel 0-3 por
 * peligro. Cada nivel viene con la lista de evidencias que lo justifican.
 */
export function evaluate({ now, forecasts = [], metars = [], tafs = [], dmcAlerts = [], glm = null, cfg }) {
  const T = cfg.THRESHOLDS;
  const start = Math.floor(now / HOUR) * HOUR;
  const grid = Array.from({ length: cfg.HORIZON_HOURS }, (_, i) => start + i * HOUR);
  const fc = forecasts.map((s) => align(s, grid)).filter((s) => coverage(s.precip) >= 0.5);

  const evidence = Object.fromEntries(HAZARDS.map((h) => [h.id, []]));
  const metric = {};
  const add = (hazard, e) => evidence[hazard].push(e);

  // --- Línea de tiempo horaria (consenso entre fuentes) -----------------------
  const timeline = grid.map((t, h) => {
    const vals = (k) => fc.map((s) => s[k][h]).filter(isNum);
    const th = fc.map((s) => s.thunder[h]).filter((v) => v !== null);
    const [pr, gu, ca, te, uv] = [vals('precip'), vals('gust'), vals('cape'), vals('temp'), vals('uv')];
    return {
      t,
      thunderK: th.filter(Boolean).length,
      thunderN: th.length,
      capeMed: round(median(ca)),
      capeMax: round(maxOf(ca)),
      precipMed: round(median(pr), 1),
      precipMin: round(minOf(pr), 1),
      precipMax: round(maxOf(pr), 1),
      gustMed: round(median(gu), 1),
      gustMin: round(minOf(gu), 1),
      gustMax: round(maxOf(gu), 1),
      uvMax: round(maxOf(uv), 1),
      tempMed: round(median(te), 1),
    };
  });

  // --- Resumen por fuente -------------------------------------------------------
  const perSource = fc.map((s) => ({
    id: s.id,
    name: s.name,
    origin: s.origin,
    provider: s.provider,
    rain24: round(maxWindowSum(s.precip, 24).value, 1),
    rain1h: round(maxOf(s.precip), 1),
    rainTotal: round(sumOf(s.precip), 1),
    gust: round(maxOf(s.gust), 1),
    uv: round(maxOf(s.uv), 1),
    thunderHours: s.thunder.filter(Boolean).length,
    cape: round(maxOf(s.cape)),
    tmax: round(maxOf(s.temp), 1),
    tmin: round(minOf(s.temp), 1),
    snow24: round(maxWindowSum(s.snow, 24).value, 1),
  }));
  const consensus = (k) => median(perSource.map((p) => p[k]));
  const range = (k) => [minOf(perSource.map((p) => p[k])), maxOf(perSource.map((p) => p[k]))];
  const nModels = fc.length;

  // --- Tormenta eléctrica: modelos ---------------------------------------------
  const maxK = Math.max(0, ...timeline.map((x) => x.thunderK));
  const nThunder = Math.max(0, ...timeline.map((x) => x.thunderN));
  const alertaK = Math.max(3, Math.ceil(nThunder * T.thunderAlertaShare));
  metric.tormenta = { value: `${maxK}/${nThunder}`, label: 'fuentes con tormenta' };
  if (maxK > 0) {
    const level = maxK >= alertaK ? 2 : maxK >= T.thunderAviso ? 1 : 0;
    const need = level === 2 ? alertaK : level === 1 ? T.thunderAviso : 1;
    const w = windowOf(timeline, (x) => x.thunderK >= need, (x) => x.thunderK * 1e4 + (x.capeMed ?? 0));
    add('tormenta', {
      source: 'Modelos numéricos',
      kind: 'pronóstico',
      level,
      text:
        level > 0
          ? `${maxK} de ${nThunder} fuentes pronostican tormenta`
          : `Señal débil: solo 1 de ${nThunder} fuentes pronostica tormenta`,
      ...w,
    });
  }
  // Inestabilidad alta con lluvia pronosticada: indicio de convección.
  const unstable = timeline.filter((x) => x.capeMed >= T.cape && (x.precipMed >= 0.2 || x.thunderK > 0));
  if (unstable.length) {
    const w = windowOf(unstable, () => true, (x) => x.capeMed);
    const peak = unstable.find((x) => x.t === w.peak);
    add('tormenta', {
      source: 'Modelos numéricos',
      kind: 'pronóstico',
      level: 1,
      text: `Atmósfera muy inestable: CAPE mediana de hasta ${peak.capeMed} J/kg, con lluvia`,
      ...w,
    });
  }

  // --- Lluvia ------------------------------------------------------------------
  const r24 = round(consensus('rain24'), 1);
  const r1 = round(consensus('rain1h'), 1);
  metric.lluvia = { value: isNum(r24) ? `${r24} mm` : '–', label: 'máx. en 24 h (mediana)' };
  if (r24 >= 1) {
    const [lo, hi] = range('rain24');
    const w = windowOf(timeline, (x) => x.precipMed >= 0.5, (x) => x.precipMed);
    add('lluvia', {
      source: 'Modelos numéricos',
      kind: 'pronóstico',
      level: Math.max(levelAbove(r24, T.rain24h), levelAbove(r1, T.rain1h)),
      text: `Hasta ${r24} mm en 24 h (entre ${round(lo, 1)} y ${round(hi, 1)} mm según ${nModels} fuentes); máx. ${r1} mm/h`,
      ...w,
    });
  }

  // --- Viento ------------------------------------------------------------------
  const gust = round(consensus('gust'), 1);
  metric.viento = { value: isNum(gust) ? `${gust} m/s` : '–', label: 'ráfaga máx. (mediana)' };
  if (isNum(gust)) {
    const [lo, hi] = range('gust');
    const level = levelAbove(gust, T.gust);
    const w = windowOf(timeline, (x) => x.gustMed >= (level ? T.gust[level - 1] : gust * 0.9), (x) => x.gustMed);
    add('viento', {
      source: 'Modelos numéricos',
      kind: 'pronóstico',
      level,
      text: `Ráfagas de hasta ${gust} m/s (entre ${lo} y ${hi} m/s según las fuentes)`,
      ...w,
    });
  }

  // --- Nieve -------------------------------------------------------------------
  const snow = round(consensus('snow24'), 1);
  metric.nieve = { value: isNum(snow) ? `${snow} cm` : '–', label: 'máx. en 24 h (mediana)' };
  if (snow > 0) {
    add('nieve', {
      source: 'Modelos numéricos',
      kind: 'pronóstico',
      level: levelAbove(snow, T.snow24h),
      text: `Nieve acumulada de hasta ${snow} cm en 24 h`,
    });
  }

  // --- Temperaturas extremas --------------------------------------------------
  const tmax = round(consensus('tmax'), 1);
  const tmin = round(consensus('tmin'), 1);
  metric.calor = { value: isNum(tmax) ? `${tmax} °C` : '–', label: 'máxima (mediana)' };
  metric.helada = { value: isNum(tmin) ? `${tmin} °C` : '–', label: 'mínima (mediana)' };
  if (levelAbove(tmax, T.heat)) {
    const w = windowOf(timeline, (x) => x.tempMed >= T.heat[0], (x) => x.tempMed);
    add('calor', { source: 'Modelos numéricos', kind: 'pronóstico', level: levelAbove(tmax, T.heat), text: `Máxima de ${tmax} °C`, ...w });
  }
  if (levelBelow(tmin, T.frost)) {
    const w = windowOf(timeline, (x) => x.tempMed <= T.frost[0], (x) => -x.tempMed);
    add('helada', { source: 'Modelos numéricos', kind: 'pronóstico', level: levelBelow(tmin, T.frost), text: `Mínima de ${tmin} °C`, ...w });
  }

  // --- Radiación UV: se usa la fuente más alta (MET Norway la da con cielo despejado) --
  const uvMax = maxOf(perSource.map((p) => p.uv));
  metric.uv = {
    value: isNum(uvMax) ? `${round(uvMax)}` : '–',
    label: isNum(uvMax) ? `índice máximo (${uvCategory(uvMax)})` : 'sin datos',
  };
  if (isNum(uvMax)) {
    const who = perSource.filter((p) => isNum(p.uv)).map((p) => `${p.name} ${round(p.uv)}`);
    const w = windowOf(timeline, (x) => x.uvMax >= Math.min(6, uvMax), (x) => x.uvMax);
    add('uv', {
      source: 'Modelos numéricos',
      kind: 'pronóstico',
      level: levelAbove(uvMax, T.uv),
      text: `Índice UV de hasta ${round(uvMax)} (${uvCategory(uvMax)}) según ${who.join(' y ')}`,
      ...w,
    });
  }

  // --- Observaciones METAR (lo que está pasando ahora) -------------------------
  const latest = new Map();
  for (const m of metars) {
    if (now - m.time > cfg.STATIONS.maxAgeMinutes * 60000) continue;
    if (!latest.has(m.station) || latest.get(m.station).time < m.time) latest.set(m.station, m);
  }
  const observations = [...latest.values()].sort((a, b) => a.distKm - b.distKm);
  for (const m of observations) {
    const src = `METAR ${m.station} · ${m.name} (${m.distKm} km)`;
    const near = m.distKm <= cfg.STATIONS.nearKm;
    const obs = { source: src, kind: 'observado', start: m.time };
    if (m.thunder) add('tormenta', { ...obs, level: near ? 3 : 2, text: `Tormenta eléctrica observada en ${m.name}${m.hail ? ' con granizo' : ''}` });
    else if (m.thunderNear) add('tormenta', { ...obs, level: 2, text: `Tormenta en las cercanías de ${m.name}` });
    else if (m.thunderRecent) add('tormenta', { ...obs, level: 1, text: `Hubo tormenta en ${m.name} durante la última hora` });
    if (m.thunderTrend) add('tormenta', { ...obs, level: 2, text: `${m.name} prevé tormenta en las próximas 2 horas` });
    if (m.cb && !m.thunder) add('tormenta', { ...obs, level: near ? 2 : 1, text: `Nubes cumulonimbus (de tormenta) sobre ${m.name}` });
    if (m.heavyRain) add('lluvia', { ...obs, level: 1, text: `Lluvia intensa observada en ${m.name}` });
    if (m.gustMs) add('viento', { ...obs, level: levelAbove(m.gustMs, T.gust), text: `Ráfaga de ${m.gustMs} m/s en ${m.name}` });
  }

  // --- Rayos detectados por satélite (GOES-19 GLM, imágenes de la DMC) ---------
  if (glm && now - glm.time <= cfg.GLM.maxAgeMinutes * 60000) {
    const R = cfg.GLM.radiiKm;
    const base = { source: 'Satélite GOES-19 (DMC)', kind: 'observado', start: glm.time };
    const c = glm.clusters[0];
    if (c) {
      const more = glm.clusters.length > 1 ? `; ${glm.clusters.length} núcleos a menos de ${R[0]} km` : '';
      add('tormenta', {
        ...base,
        level: c.distKm <= R[2] ? 3 : c.distKm <= R[1] ? 2 : 1,
        text: `Rayos a ${c.distKm} km al ${c.direction} del cerro, ocurridos entre ${GLM_AGES[c.ageClass]} min antes de la imagen${more}`,
      });
      metric.tormenta = { value: `${c.distKm} km`, label: `rayo más cercano (al ${c.direction})` };
    } else {
      add('tormenta', { ...base, level: 0, text: `Sin rayos a menos de ${R[0]} km del cerro en la última imagen satelital` });
    }
  }

  // --- Pronósticos aeronáuticos TAF -------------------------------------------
  for (const taf of tafs) {
    for (const p of taf.periods) {
      if (p.to <= now) continue;
      const base = { source: `TAF ${taf.station} · ${taf.name}`, kind: 'pronóstico', start: Math.max(p.from, now), end: p.to };
      const prob = p.probability ? ` (probabilidad ${p.probability}%)` : '';
      if (p.thunder) add('tormenta', { ...base, level: p.probability && p.probability <= 30 ? 1 : 2, text: `Pronóstico de tormenta en ${taf.name}${prob}` });
      else if (p.cb) add('tormenta', { ...base, level: 1, text: `Pronóstico de cumulonimbus en ${taf.name}${prob}` });
      if (p.gustMs) add('viento', { ...base, level: Math.min(2, levelAbove(p.gustMs, T.gust)), text: `Ráfagas de ${p.gustMs} m/s en ${taf.name}${prob}` });
    }
  }

  // --- Avisos oficiales DMC -----------------------------------------------------
  for (const a of dmcAlerts) {
    add(a.hazard, {
      source: `DMC ${a.code}`,
      kind: 'oficial',
      level: a.effectiveLevel,
      text: `${a.type} DMC${a.nearby ? ' en zona vecina' : ''}: ${a.title}`,
      start: a.start,
      end: a.end,
    });
  }

  // --- Nivel final por peligro: el máximo entre sus evidencias -----------------
  const hazards = HAZARDS.map((h) => {
    const ev = evidence[h.id].sort((a, b) => b.level - a.level || kindRank(a) - kindRank(b));
    const level = Math.max(0, ...ev.map((e) => e.level));
    const top = ev.filter((e) => e.level === level && level > 0);
    const starts = top.map((e) => e.start).filter(isNum);
    const ends = top.map((e) => e.end).filter(isNum);
    return {
      ...h,
      level,
      levelName: LEVELS[level].name,
      headline: level > 0 ? top[0].text : (ev[0]?.text ?? 'Sin señales en las próximas 72 horas'),
      start: starts.length ? Math.min(...starts) : null,
      end: ends.length ? Math.max(...ends) : null,
      metric: metric[h.id] ?? null,
      evidence: ev,
    };
  }).filter((h) => h.id !== 'otro' || h.evidence.length);

  const main = hazards.reduce((a, b) => (b.level > a.level ? b : a));
  return {
    gridStart: start,
    hazards,
    overall: {
      level: main.level,
      levelName: LEVELS[main.level].name,
      hazardId: main.level > 0 ? main.id : null,
      headline: main.level > 0 ? `${main.name}: ${main.headline}` : 'Sin alertas para las próximas 72 horas',
    },
    // Alerta temprana: cuándo podría empezar cada fenómeno y según qué fuentes
    upcoming: upcomingEvents({ now, grid, fc, observations, tafs, dmcAlerts, glm, cfg }),
    timeline,
    perSource,
    // Lo que pronostica cada fuente hora a hora, para comparar en el panel
    series: fc.map((s) => ({
      id: s.id,
      name: s.name,
      origin: s.origin,
      precip: s.precip.map((v) => round(v, 1)),
      gust: s.gust.map((v) => round(v, 1)),
      uv: s.uv.map((v) => round(v, 1)),
      temp: s.temp.map((v) => round(v, 1)),
      thunder: s.thunder.map((v) => (v === null ? null : v ? 1 : 0)),
    })),
    observations,
  };
}

// Ante igual nivel, se muestra primero lo oficial y lo observado.
function kindRank(e) {
  return { oficial: 0, observado: 1, pronóstico: 2 }[e.kind] ?? 3;
}
