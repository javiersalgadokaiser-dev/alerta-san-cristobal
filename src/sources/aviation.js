import { fetchJson } from './http.js';
import { haversineKm, round } from '../util.js';

// Observaciones (METAR) y pronósticos (TAF) aeronáuticos de los aeródromos de
// Santiago, vía aviationweather.gov (NOAA). Reportan tormentas ("TS") y nubes
// cumulonimbus ("CB") observadas por personal de la DMC en cada aeródromo.
const API = 'https://aviationweather.gov/api/data';
const KT_TO_MS = 0.514444;

const NAMES = { SCTB: 'Tobalaba', SCEL: 'Pudahuel (aeropuerto)', SCBQ: 'El Bosque' };

export async function fetchMetars(ids, location) {
  const list = await fetchJson(`${API}/metar?ids=${ids.join(',')}&format=json&hours=3`);
  return (Array.isArray(list) ? list : []).map((m) => parseMetar(m, location));
}

export async function fetchTafs(ids) {
  const list = await fetchJson(`${API}/taf?ids=${ids.join(',')}&format=json`);
  return (Array.isArray(list) ? list : []).map(parseTaf);
}

export function parseMetar(m, location) {
  const raw = String(m.rawOb ?? '');
  // Se separa lo observado del pronóstico de tendencia (TEMPO/BECMG, próximas
  // 2 h) y se ignoran los comentarios (RMK).
  const tokens = raw.split(/\s+/).slice(2); // sin "METAR" ni el indicador de estación
  const cut = (i) => (i >= 0 ? i : tokens.length);
  const trendAt = cut(tokens.findIndex((t) => ['TEMPO', 'BECMG', 'NOSIG', 'RMK'].includes(t)));
  const wx = tokens.slice(0, trendAt);
  const trend = tokens.slice(trendAt, cut(tokens.indexOf('RMK')));

  const wind = wx.map((t) => t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/)).find(Boolean);
  const has = (re) => wx.some((t) => re.test(t));
  return {
    station: m.icaoId,
    name: NAMES[m.icaoId] ?? m.name ?? m.icaoId,
    distKm: round(haversineKm(location.lat, location.lon, m.lat, m.lon), 0),
    time: m.obsTime * 1000,
    raw,
    temp: m.temp ?? null,
    windMs: wind ? round(Number(wind[2]) * KT_TO_MS, 1) : null,
    gustMs: wind?.[3] ? round(Number(wind[3]) * KT_TO_MS, 1) : null,
    thunder: has(/^[+-]?TS/), // tormenta en la estación
    thunderNear: has(/^VCTS/), // tormenta en las cercanías (8-16 km)
    thunderRecent: has(/^RETS/), // tormenta en la última hora
    thunderTrend: trend.some((t) => /^[+-]?(VC)?TS/.test(t)), // esperada en 2 h
    cb: has(/^(FEW|SCT|BKN|OVC)\d{3}CB$/),
    tcu: has(/^(FEW|SCT|BKN|OVC)\d{3}TCU$/),
    hail: has(/^[+-]?(TS|SH)\w*(GR|GS)/),
    heavyRain: has(/^\+(SH|TS)?RA/),
    rain: has(/^[+-]?(SH|TS)?(RA|DZ)/),
  };
}

/** Solo se conservan los periodos del TAF con tormenta o ráfagas. */
export function parseTaf(t) {
  const periods = (t.fcsts ?? []).map((f) => ({
    from: f.timeFrom * 1000,
    to: f.timeTo * 1000,
    change: f.fcstChange ?? null,
    probability: f.probability ?? null,
    wx: f.wxString ?? '',
    thunder: /(^|\s)[+-]?(VC)?TS/.test(f.wxString ?? ''),
    cb: (f.clouds ?? []).some((c) => c.type === 'CB'),
    gustMs: f.wgst ? round(f.wgst * KT_TO_MS, 1) : null,
  }));
  return {
    station: t.icaoId,
    name: NAMES[t.icaoId] ?? t.name ?? t.icaoId,
    issued: Date.parse(t.issueTime),
    validTo: t.validTimeTo * 1000,
    raw: t.rawTAF,
    periods: periods.filter((p) => p.thunder || p.cb || p.gustMs),
  };
}
