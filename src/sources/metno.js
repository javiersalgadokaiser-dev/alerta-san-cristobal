import { APP_UA } from './http.js';
import { HOUR } from '../util.js';

// MET Norway Locationforecast 2.0 (CC BY 4.0). Sus condiciones de uso exigen
// un User-Agent que identifique la aplicación con un contacto, y respetar los
// encabezados Expires / If-Modified-Since.
export async function fetchMetNo(location, { lastModified, contact } = {}) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${location.lat.toFixed(4)}&lon=${location.lon.toFixed(4)}`;
  const headers = { 'User-Agent': contact ? `${APP_UA} (+${contact})` : APP_UA };
  if (lastModified) headers['If-Modified-Since'] = lastModified;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const expires = Date.parse(res.headers.get('Expires') ?? '') || Date.now() + 30 * 60000;
  if (res.status === 304) return { notModified: true, expires };
  if (!res.ok) throw new Error(`HTTP ${res.status} desde api.met.no`);
  return {
    series: parseMetNo(await res.json()),
    expires,
    lastModified: res.headers.get('Last-Modified'),
  };
}

/**
 * Serie horaria. Las primeras ~60 h vienen hora a hora; después en bloques de
 * 6 h, cuya lluvia se reparte en partes iguales entre sus horas.
 */
export function parseMetNo(json) {
  const hours = new Map();
  for (const entry of json.properties.timeseries) {
    const t = Date.parse(entry.time);
    const inst = entry.data.instant?.details ?? {};
    const base = {
      temp: inst.air_temperature ?? null,
      wind: inst.wind_speed ?? null, // m/s
      gust: inst.wind_speed_of_gust ?? null,
      uv: inst.ultraviolet_index_clear_sky ?? null, // índice UV con cielo despejado
    };
    const n1 = entry.data.next_1_hours;
    const n6 = entry.data.next_6_hours;
    if (n1) {
      if (!hours.has(t)) hours.set(t, { ...base, precip: n1.details?.precipitation_amount ?? null, symbol: n1.summary?.symbol_code ?? '' });
    } else if (n6) {
      const p = n6.details?.precipitation_amount;
      for (let k = 0; k < 6; k++) {
        const tk = t + k * HOUR;
        if (!hours.has(tk)) hours.set(tk, { ...base, precip: p != null ? p / 6 : null, symbol: n6.summary?.symbol_code ?? '' });
      }
    }
  }
  const times = [...hours.keys()].sort((a, b) => a - b);
  const col = (k) => times.map((t) => hours.get(t)[k]);
  const symbols = col('symbol');
  return {
    id: 'metno',
    name: 'MET Norway',
    origin: 'Noruega',
    provider: 'MET Norway',
    times,
    temp: col('temp'),
    precip: col('precip'),
    thunder: symbols.map((s) => (s ? s.includes('thunder') : null)),
    cape: times.map(() => null),
    li: times.map(() => null),
    wind: col('wind'),
    gust: col('gust'),
    snow: times.map(() => null),
    uv: col('uv'),
  };
}
