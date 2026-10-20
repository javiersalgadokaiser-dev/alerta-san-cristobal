import { BROWSER_UA, fetchJson } from './http.js';
import { HOUR, decodeEntities, fold, haversineKm, htmlToText, localToUtc, tzOffsetMs } from '../util.js';

// Avisos, Alertas y Alarmas oficiales de la Dirección Meteorológica de Chile.
// Es el mismo JSON que alimenta el mapa de https://archivos.meteochile.gob.cl/portaldmc/AAA/aaa_mapa.php

const TYPE_LEVEL = { aviso: 1, alerta: 2, alarma: 3 };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// Franjas del día que usa la DMC en "desde" y "hasta".
const DAY_PARTS = { madrugada: [0, 6], manana: [6, 12], tarde: [12, 20], noche: [20, 24] };
const NEARBY_KM = 15;

export async function fetchDmc(url) {
  return fetchJson(url, {
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://archivos.meteochile.gob.cl/portaldmc/AAA/aaa_mapa.php' },
  });
}

export function hazardFor(phenomenon) {
  const f = fold(phenomenon);
  if (f.includes('tormenta')) return 'tormenta';
  if (f.includes('precipitac') || f.includes('lluvia')) return 'lluvia';
  if (f.includes('viento')) return 'viento';
  if (f.includes('nevada') || f.includes('nieve')) return 'nieve';
  if (f.includes('helada') || (f.includes('baja') && f.includes('temperatura'))) return 'helada';
  if (f.includes('temperatura') || f.includes('calor')) return 'calor';
  return 'otro';
}

/** "la tarde del martes 20 de octubre del 2026" → instante UTC (inicio o fin de la franja). */
export function parseDmcTime(text, tz, edge) {
  const f = fold(text);
  const m = f.match(/(\d{1,2}) de ([a-z]+) del? (\d{4})/);
  if (!m) return null;
  const month = m[2] === 'setiembre' ? 8 : MONTHS.indexOf(m[2]);
  if (month < 0) return null;
  const part = Object.keys(DAY_PARTS).find((p) => f.includes(p));
  const [h0, h1] = DAY_PARTS[part] ?? [0, 24];
  return localToUtc(Number(m[3]), month + 1, Number(m[1]), edge === 'start' ? h0 : h1, tz);
}

function insideRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** ¿Afecta el aviso al cerro? → 'zona' | 'region' | 'area' | 'texto' | 'cercana' | null */
export function matchZone(alert, location, cfg) {
  const data = String(alert.dataZonaAfecta ?? '');
  const kind = String(alert.tipoZonaAfecta ?? '').toLowerCase();
  if (kind === 'zonas') {
    const zones = data.split(',').map((z) => z.trim());
    if (zones.some((z) => cfg.zones.includes(z))) return 'zona';
    if (zones.some((z) => cfg.nearbyZones.includes(z))) return 'cercana';
    return null;
  }
  if (kind === 'regiones') {
    return data.split(',').map((r) => r.trim()).includes(cfg.region) ? 'region' : null;
  }
  if (kind === 'area') {
    // Polígono "lat,lon|lat,lon|..."
    const ring = data
      .split('|')
      .map((p) => p.split(',').map(Number))
      .filter((p) => p.length === 2 && p.every(Number.isFinite));
    if (ring.length < 3) return null;
    if (insideRing(location.lat, location.lon, ring)) return 'area';
    const near = ring.some(([lat, lon]) => haversineKm(location.lat, location.lon, lat, lon) <= NEARBY_KM);
    return near ? 'cercana' : null;
  }
  return fold(alert.textoZonaAfecta).includes(fold(cfg.regionName)) ? 'texto' : null;
}

/**
 * Extrae de la tabla HTML de la DMC la fila que corresponde a la zona del cerro.
 * Devuelve [{ label, value }], p. ej. [{ label: 'lunes 19', value: 'SI' }] o
 * [{ label: 'Monto', value: '20-30' }].
 */
export function tableRow(html, cfg) {
  if (!html) return [];
  const rows = [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
    [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => htmlToText(c[1])),
  );
  const regionName = fold(cfg.regionName);
  const zoneName = fold(cfg.zoneRowName);
  let region = null;
  let header = null;
  for (const cells of rows) {
    const first = fold(cells[0] ?? '');
    if (cells.length === 1 && first.startsWith('region')) {
      region = first;
      header = null;
    } else if (first === 'zona' || first === 'region') {
      header = cells;
    } else if (header) {
      const match = region ? region.includes(regionName) && first.startsWith(zoneName) : first.includes(regionName);
      if (match) return header.slice(1).map((label, i) => ({ label, value: cells[i + 1] ?? '--' }));
    }
  }
  return [];
}

/**
 * Si la tabla trae una columna por día ("martes 20"), acota el periodo a los
 * días marcados para la zona del cerro.
 */
function narrowToDays(row, start, end, tz) {
  const days = row
    .map((c) => ({ day: Number(c.label.match(/^\D+\s(\d{1,2})$/)?.[1]), active: c.value && c.value !== '--' }))
    .filter((d) => d.day);
  const active = days.filter((d) => d.active);
  if (!start || !days.length || !active.length) return { start, end };
  const local = new Date(start + tzOffsetMs(start, tz));
  const [y, m, d0] = [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()];
  const dateOf = (day) => (day >= d0 ? [y, m, day] : m === 12 ? [y + 1, 1, day] : [y, m + 1, day]);
  const first = localToUtc(...dateOf(active[0].day), 0, tz);
  const last = localToUtc(...dateOf(active[active.length - 1].day), 24, tz);
  return { start: Math.max(start, first), end: end ? Math.min(end, last) : last };
}

/** Firma barata para saber si la DMC publicó algo nuevo. */
export function dmcSignature(json) {
  return `${json.fecha_actualizacion}|${(json.AAA ?? []).map((a) => `${a.id}:${a.codigoMeteo}`).join(',')}`;
}

/** Avisos aún vigentes (con 2 h de margen tras el término). */
export function activeAlerts(alerts, now) {
  return alerts.filter((a) => !a.end || a.end >= now - 2 * HOUR);
}

/** Todos los avisos que afectan al cerro (sin filtrar por vigencia). */
export function parseDmc(json, location, cfg) {
  const alerts = [];
  for (const a of json.AAA ?? []) {
    const match = matchZone(a, location, cfg);
    if (!match) continue;
    const row = tableRow(a.tablaHTML, cfg);
    const { start, end } = narrowToDays(
      row,
      parseDmcTime(a.desde, location.timezone, 'start'),
      parseDmcTime(a.hasta, location.timezone, 'end'),
      location.timezone,
    );
    const level = TYPE_LEVEL[fold(a.tipo)] ?? 1;
    const nearby = match === 'cercana';
    const zoneLines = htmlToText(a.textoZonaAfecta).split('\n');
    alerts.push({
      key: `${a.id}:${a.codigoMeteo}`,
      id: a.id,
      code: decodeEntities(a.codigoMeteo),
      type: decodeEntities(a.tipo),
      level,
      // Un aviso de una zona vecina se informa, pero cuenta a lo más como "Aviso".
      effectiveLevel: nearby ? Math.min(level, 1) : level,
      hazard: hazardFor(a.fenomeno),
      phenomenon: decodeEntities(a.fenomeno),
      title: htmlToText(a.titulo),
      issued: decodeEntities(a.emision),
      condition: decodeEntities(a.condicionSinoptica),
      from: decodeEntities(a.desde),
      to: decodeEntities(a.hasta),
      start,
      end,
      observation: htmlToText(a.observacion),
      zone: zoneLines.find((l) => fold(l).includes(fold(cfg.regionName))) ?? zoneLines[0] ?? '',
      match,
      nearby,
      detailTitle: htmlToText(a.tablaTitulo),
      detail: row.map((c) => `${c.label}: ${c.value}`).join(' · '),
    });
  }
  alerts.sort((x, y) => y.effectiveLevel - x.effectiveLevel || (x.start ?? 0) - (y.start ?? 0));
  return {
    updated: json.fecha_actualizacion ?? null,
    totals: { avisos: json.Avisos ?? 0, alertas: json.Alertas ?? 0, alarmas: json.Alarmas ?? 0 },
    alerts,
  };
}
