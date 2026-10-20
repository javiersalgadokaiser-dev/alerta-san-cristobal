import { fetchJson } from './http.js';

// Datos de Open-Meteo (CC BY 4.0): varios modelos globales en una sola consulta.
const VARIABLES = [
  'temperature_2m',
  'precipitation',
  'weather_code',
  'cape',
  'lifted_index',
  'wind_speed_10m',
  'wind_gusts_10m',
  'snowfall',
];

export async function fetchOpenMeteo(location, models, hours) {
  const params = {
    latitude: location.lat,
    longitude: location.lon,
    hourly: VARIABLES.join(','),
    models: models.map((m) => m.id).join(','),
    forecast_hours: hours,
    past_hours: 0,
    timeformat: 'unixtime',
    timezone: 'GMT',
    wind_speed_unit: 'kmh',
  };
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const json = await fetchJson(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (json.error) throw new Error(`Open-Meteo: ${json.reason}`);
  return parseOpenMeteo(json, models);
}

/** Una serie horaria por modelo, con unidades km/h, mm, cm, °C y J/kg. */
export function parseOpenMeteo(json, models) {
  const times = json.hourly.time.map((t) => t * 1000);
  return models
    .map((m) => {
      const get = (v) => (json.hourly[`${v}_${m.id}`] ?? []).map((x) => x ?? null);
      const code = get('weather_code');
      return {
        id: m.id,
        name: m.name,
        origin: m.origin,
        provider: 'Open-Meteo',
        times,
        temp: get('temperature_2m'),
        precip: get('precipitation'),
        // Códigos WMO 95, 96 y 99: tormenta eléctrica (con o sin granizo).
        thunder: code.map((c) => (c === null ? null : c >= 95)),
        cape: get('cape'),
        li: get('lifted_index'),
        wind: get('wind_speed_10m'),
        gust: get('wind_gusts_10m'),
        snow: get('snowfall'),
      };
    })
    .filter((s) => s.precip.some((v) => v !== null));
}
