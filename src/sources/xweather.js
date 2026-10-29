import { fetchJson } from './http.js';
import { base64Encode, round } from '../util.js';

// Xweather (Vaisala): rayos en tiempo real de su red global de detección, un
// pronóstico horario propio y la imagen del mapa de tormentas.
// Requiere cuenta: XWEATHER_ID y XWEATHER_SECRET en las propiedades del proyecto.
// Su plan gratuito es solo para uso no comercial (15 000 accesos al mes); cada
// consulta de rayos cuesta 10 accesos.

const DATA = 'https://data.api.xweather.com';
const MAPS = 'https://maps.api.xweather.com';
const COMPASS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const auth = (c) => `client_id=${encodeURIComponent(c.id)}&client_secret=${encodeURIComponent(c.secret)}`;

/** Xweather responde success:false o un aviso "warn_no_data" cuando no hay resultados. */
function unwrap(json) {
  if (json && json.error && json.error.code !== 'warn_no_data') {
    throw new Error(`Xweather: ${json.error.description || json.error.code}`);
  }
  return (json && json.response) || [];
}

/** Rayos de los últimos 5 minutos a menos de `radiusKm` (máximo 100 km en el plan estándar). */
export async function fetchXweatherLightning(location, creds, radiusKm = 100) {
  const url = `${DATA}/lightning/closest?p=${location.lat},${location.lon}&radius=${radiusKm}km&limit=100&${auth(creds)}`;
  return parseXweatherLightning(await fetchJson(url));
}

export function parseXweatherLightning(json) {
  return unwrap(json)
    .map((r) => ({
      time: (r.ob && r.ob.timestamp ? r.ob.timestamp : 0) * 1000,
      type: String((r.ob && r.ob.pulse && r.ob.pulse.type) || '').toUpperCase(), // CG: nube-tierra, IC: entre nubes
      distKm: round(r.relativeTo.distanceKM, 1),
      direction: compass(r.relativeTo.bearing),
    }))
    .sort((a, b) => a.distKm - b.distKm);
}

/** Pronóstico horario de Xweather como una fuente más (mismas unidades que el resto: m/s, mm, °C). */
export async function fetchXweatherForecast(location, creds, hours) {
  const url = `${DATA}/forecasts/${location.lat},${location.lon}?filter=1hr&limit=${hours}&${auth(creds)}`;
  return parseXweatherForecast(await fetchJson(url));
}

// Clima codificado "cobertura:intensidad:fenómeno"; T = tormenta eléctrica.
const hasThunder = (codes) =>
  codes.some((c) =>
    String(c || '')
      .split(',')
      .some((part) => part.split(':')[2] === 'T'),
  );

export function parseXweatherForecast(json) {
  const [place] = unwrap(json);
  const periods = (place && place.periods) || [];
  const col = (f) => periods.map((p) => (p[f] == null ? null : p[f]));
  return {
    id: 'xweather',
    name: 'Xweather',
    origin: 'Vaisala',
    provider: 'Xweather',
    times: periods.map((p) => p.timestamp * 1000),
    temp: col('tempC'),
    precip: col('precipMM'),
    thunder: periods.map((p) => hasThunder([p.weatherPrimaryCoded, ...(p.weatherCoded || []).map((w) => w.wx)])),
    cape: periods.map(() => null),
    li: periods.map(() => null),
    wind: col('windSpeedMPS'),
    gust: col('windGustMPS'),
    snow: col('snowCM'),
    uv: col('uvi'),
  };
}

/**
 * Mapa de tormentas: relieve, radar global (completado con satélite donde no hay
 * radar), rayos nube-tierra de los últimos 15 minutos y ciudades. Centrado en el punto.
 */
export async function fetchXweatherMap(location, creds, map) {
  const url = `${MAPS}/${encodeURIComponent(creds.id)}_${encodeURIComponent(creds.secret)}/${map.layers}/${map.width}x${map.height}/${location.lat},${location.lon},${map.zoom}/current.jpg`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Xweather Maps respondió ${res.status}`);
  if (!(res.headers.get('Content-Type') || '').includes('image')) throw new Error('Xweather Maps no entregó una imagen');
  return base64Encode(new Uint8Array(await res.arrayBuffer()));
}

/** Contador de accesos del mes, para no pasar del límite del plan. */
export function xweatherBudget(state, now, limit) {
  const month = new Date(now).toISOString().slice(0, 7);
  if (!state.month || state.month !== month) Object.assign(state, { month, used: 0 });
  return {
    can: (cost) => state.used + cost <= limit,
    spend: (cost) => {
      state.used += cost;
    },
  };
}
