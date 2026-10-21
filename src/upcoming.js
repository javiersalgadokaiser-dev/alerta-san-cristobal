import { HOUR, formatLocal, formatWhen, median, round } from './util.js';

// Alerta temprana: cuándo podría empezar cada fenómeno y según qué fuentes.
// Produce frases como "Podría iniciar una tormenta eléctrica en el cerro hoy a
// las 13:00, según ICON (13:00) y GFS (15:00)".

const CONFIDENCE = ['baja', 'media', 'alta'];

/** "A", "A y B", "A, B y C" */
const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

/**
 * Primer episodio en que las fuentes indican el fenómeno (flag true).
 * Empieza en la primera hora con al menos `minSources` fuentes y sigue mientras
 * alguna lo indique (se toleran huecos de `gapHours`).
 */
export function firstEpisode(fc, grid, flag, minSources = 1, gapHours = 2) {
  const count = grid.map((_, h) => fc.filter((s) => flag(s, h) === true).length);
  const avail = grid.map((_, h) => fc.filter((s) => flag(s, h) != null).length);
  const start = count.findIndex((c) => c >= minSources);
  if (start < 0) return null;
  let end = start;
  let gap = 0;
  for (let h = start + 1; h < grid.length; h++) {
    if (count[h] > 0) {
      end = h;
      gap = 0;
    } else if (++gap > gapHours) break;
  }
  let peak = start;
  for (let h = start; h <= end; h++) if (count[h] > count[peak]) peak = h;
  const supporters = fc
    .map((s) => {
      for (let h = start; h <= end; h++) if (flag(s, h) === true) return { id: s.id, name: s.name, first: grid[h] };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.first - b.first);
  const n = Math.max(...avail.slice(start, end + 1));
  const peakCount = count[peak];
  const confidence = peakCount >= Math.max(3, Math.ceil(n / 2)) ? 2 : peakCount >= 2 ? 1 : 0;
  return { startIdx: start, endIdx: end, start: grid[start], end: grid[end] + HOUR, peak: grid[peak], peakCount, n, supporters, confidence };
}

export function upcomingEvents({ now, grid, fc, observations = [], tafs = [], dmcAlerts = [], glm = null, cfg }) {
  const tz = cfg.LOCATION.timezone;
  const T = cfg.THRESHOLDS;
  const when = (t) => formatWhen(t, now, tz);
  const hhmm = (t) => formatLocal(t, tz, { withDay: false });
  const N = fc.length;
  const events = [];
  const official = (hazard) => dmcAlerts.filter((a) => a.hazard === hazard && a.start && (a.end == null || a.end > now));
  const station = (name) => name.replace(/ \(.*\)/, '');
  const raise = (c, by) => Math.min(2, c + by);

  const push = (e) => {
    if (e.start == null || e.start > grid[grid.length - 1] + HOUR) return;
    events.push({ ...e, confidence: e.observed ? 'en curso' : CONFIDENCE[e.confidence] });
  };

  // --- Tormenta eléctrica --------------------------------------------------------
  {
    const seen = [];
    for (const m of observations) {
      if (m.thunder) seen.push(`tormenta observada en ${station(m.name)} (${m.distKm} km)`);
      else if (m.thunderNear) seen.push(`tormenta en las cercanías de ${station(m.name)}`);
    }
    if (glm && now - glm.time <= cfg.GLM.maxAgeMinutes * 60000) {
      const c = glm.clusters.find((x) => x.distKm <= cfg.GLM.radiiKm[1]);
      if (c) seen.push(`rayos a ${c.distKm} km al ${c.direction} (satélite, imagen de las ${hhmm(glm.time)})`);
    }
    const ev = firstEpisode(fc, grid, (s, h) => (s.thunder[h] === null ? null : s.thunder[h] === true), 1);
    const taf = tafs.flatMap((t) =>
      t.periods
        .filter((p) => p.thunder && p.to > now)
        .map((p) => ({ name: `el pronóstico aeronáutico de ${station(t.name)}`, from: Math.max(p.from, now), prob: p.probability })),
    );
    const dmc = official('tormenta');
    if (seen.length || ev || taf.length || dmc.length) {
      let start = ev ? ev.start : null;
      for (const p of taf) start = start == null ? p.from : Math.min(start, p.from);
      if (start == null) start = Math.max(now, Math.min(...dmc.map((a) => a.start)));
      let text;
      const who = [
        ...(ev ? ev.supporters.map((s) => `${s.name} (${hhmm(s.first)})`) : []),
        ...taf.map((p) => `${p.name} (${hhmm(p.from)}${p.prob ? `, ${p.prob} %` : ''})`),
      ];
      if (seen.length) {
        start = now;
        text = `Hay actividad eléctrica cerca del cerro: ${list(seen)}.`;
        if (who.length) text += ` Los pronósticos la mantienen según ${list(who)}.`;
      } else if (who.length) {
        text = `Podría iniciar una tormenta eléctrica en el cerro ${when(start)}, según ${list(who)}.`;
        if (ev && ev.peakCount >= 2 && ev.peak !== ev.start) text += ` Mayor coincidencia ${when(ev.peak)} (${ev.peakCount} de ${ev.n} fuentes).`;
      } else {
        text = `La DMC advierte tormentas eléctricas probables ${start <= now ? 'desde ahora' : `desde ${when(start)}`}.`;
      }
      if (dmc.length && (seen.length || who.length)) {
        text += ` La DMC mantiene ${list(dmc.map((a) => `un ${a.type.toLowerCase()} de tormentas eléctricas hasta ${when(a.end)}`))}.`;
      }
      let confidence = ev ? ev.confidence : 1;
      if (taf.length) confidence = raise(confidence, 1);
      if (dmc.length && (ev || taf.length)) confidence = raise(confidence, 1);
      push({
        hazardId: 'tormenta',
        start,
        end: ev ? ev.end : null,
        peak: ev ? ev.peak : null,
        observed: seen.length > 0,
        confidence,
        sources: [...(ev ? ev.supporters.map((s) => s.name) : []), ...(taf.length ? ['TAF'] : []), ...(dmc.length ? ['DMC'] : [])],
        text,
      });
    }
  }

  // --- Lluvia ----------------------------------------------------------------------
  {
    const raining = observations.filter((m) => m.rain || m.heavyRain).map((m) => station(m.name));
    const ev = firstEpisode(fc, grid, (s, h) => (s.precip[h] == null ? null : s.precip[h] >= 0.5), 2);
    const dmc = official('lluvia');
    if (raining.length || ev || dmc.length) {
      let text;
      let start = ev ? ev.start : null;
      if (ev) {
        const total = round(median(fc.map((s) => s.precip.slice(ev.startIdx, ev.endIdx + 1).reduce((a, v) => a + (v || 0), 0))));
        text = `Podría empezar a llover ${when(ev.start)}, según ${ev.supporters.length} de ${N} fuentes. Seguiría hasta ${when(ev.end)}, con unos ${total} mm en total.`;
      }
      if (raining.length) {
        start = now;
        text = `Ya llueve en ${list(raining)}.${text ? ` ${text}` : ''}`;
      }
      if (dmc.length) {
        const a = dmc[0];
        const dmcText = `La DMC tiene ${a.type === 'Alerta' ? 'una' : 'un'} ${a.type.toLowerCase()} por precipitaciones${a.detail ? ` (${a.detail})` : ''} desde ${when(a.start)} hasta ${when(a.end)}.`;
        text = text ? `${text} ${dmcText}` : dmcText;
        if (start == null) start = Math.max(now, a.start);
      }
      push({
        hazardId: 'lluvia',
        start,
        end: ev ? ev.end : null,
        peak: ev ? ev.peak : null,
        observed: raining.length > 0,
        confidence: raise(ev ? ev.confidence : 1, dmc.length && ev ? 1 : 0),
        sources: [...(ev ? ev.supporters.map((s) => s.name) : []), ...(dmc.length ? ['DMC'] : [])],
        text,
      });
    }
  }

  // --- Viento, nieve y temperaturas extremas (solo pronóstico) ---------------------
  // Si alguna fuente llega al nivel de alerta (15 m/s), se avisa desde ese umbral.
  const windLimit = fc.some((s) => s.gust.some((v) => v != null && v >= T.gust[1])) ? T.gust[1] : T.gust[0];
  const simple = [
    {
      hazardId: 'viento',
      flag: (s, h) => (s.gust[h] == null ? null : s.gust[h] >= windLimit),
      phrase: (start) => `Podrían registrarse ráfagas sobre ${windLimit} m/s${windLimit === T.gust[1] ? ' (nivel de alerta)' : ''} ${when(start)}`,
      extra: (ev) => {
        const max = Math.max(...fc.map((s) => Math.max(0, ...s.gust.slice(ev.startIdx, ev.endIdx + 1).filter((v) => v != null))));
        return ` (hasta ${round(max, 1)} m/s)`;
      },
    },
    {
      hazardId: 'nieve',
      flag: (s, h) => (s.snow[h] == null ? null : s.snow[h] >= 0.1),
      phrase: (start) => `Podría nevar en el cerro ${when(start)}`,
    },
    {
      hazardId: 'calor',
      flag: (s, h) => (s.temp[h] == null ? null : s.temp[h] >= T.heat[0]),
      phrase: (start) => `La temperatura podría superar los ${T.heat[0]} °C ${when(start)}`,
    },
    {
      hazardId: 'helada',
      flag: (s, h) => (s.temp[h] == null ? null : s.temp[h] <= T.frost[0]),
      phrase: (start) => `La temperatura podría bajar de ${T.frost[0]} °C ${when(start)}`,
    },
  ];
  for (const k of simple) {
    const ev = firstEpisode(fc, grid, k.flag, 1);
    const dmc = official(k.hazardId);
    if (!ev && !dmc.length) continue;
    let text = ev ? `${k.phrase(ev.start)}, según ${list(ev.supporters.map((s) => `${s.name} (${hhmm(s.first)})`))}${k.extra ? k.extra(ev) : ''}.` : '';
    if (dmc.length) {
      const a = dmc[0];
      const dmcText = `La DMC tiene ${a.type === 'Alerta' ? 'una' : 'un'} ${a.type.toLowerCase()} por ${a.phenomenon.toLowerCase()} desde ${when(a.start)} hasta ${when(a.end)}.`;
      text = text ? `${text} ${dmcText}` : dmcText;
    }
    push({
      hazardId: k.hazardId,
      start: ev ? ev.start : Math.max(now, dmc[0].start),
      end: ev ? ev.end : null,
      peak: ev ? ev.peak : null,
      observed: false,
      confidence: raise(ev ? ev.confidence : 1, dmc.length && ev ? 1 : 0),
      sources: [...(ev ? ev.supporters.map((s) => s.name) : []), ...(dmc.length ? ['DMC'] : [])],
      text,
    });
  }

  // Primero lo que ya ocurre; luego la tormenta (la prioridad) y el resto por hora de inicio
  const rank = (e) => (e.observed ? 0 : e.hazardId === 'tormenta' ? 1 : 2);
  return events.sort((a, b) => rank(a) - rank(b) || a.start - b.start);
}
