// Configuración del sistema de alerta temprana.
// Aquí se ajustan la ubicación, las fuentes y los umbrales de cada nivel.

// Punto vigilado: 33°24'52.8"S 70°36'58.3"W (ladera del cerro, ~630 m de altura).
export const LOCATION = {
  name: 'Cerro San Cristóbal',
  place: 'Santiago, Región Metropolitana',
  lat: -33.414667,
  lon: -70.616194,
  coords: '33°24\'52.8"S 70°36\'58.3"W',
  timezone: 'America/Santiago',
};

// Horas de pronóstico que se analizan desde la hora actual.
export const HORIZON_HOURS = 72;

// Modelos globales consultados a través de Open-Meteo (https://open-meteo.com).
export const MODELS = [
  { id: 'ecmwf_ifs', name: 'ECMWF IFS', origin: 'Europa' },
  { id: 'gfs_seamless', name: 'GFS', origin: 'EE.UU.' },
  { id: 'icon_seamless', name: 'ICON', origin: 'Alemania' },
  { id: 'gem_seamless', name: 'GEM', origin: 'Canadá' },
  { id: 'ukmo_seamless', name: 'UKMO', origin: 'Reino Unido' },
  { id: 'meteofrance_seamless', name: 'ARPEGE', origin: 'Francia' },
];

// Dirección Meteorológica de Chile: Sistema de Avisos, Alertas y Alarmas.
// El punto vigilado está en la zona "05m_Valle_Longitudinal" de la Región Metropolitana.
export const DMC = {
  url: 'https://archivos.meteochile.gob.cl/portaldmc/AAA/datos_AAA.json',
  pageUrl: 'https://archivos.meteochile.gob.cl/portaldmc/AAA/aaa_mapa.php',
  region: '05m',
  regionName: 'Metropolitana',
  zones: ['05m_Valle_Longitudinal'],
  // Zonas vecinas: se muestran, pero como máximo suben el nivel a "Aviso".
  nearbyZones: ['05m_Precordillera', '05m_Cordillera_Costa'],
  zoneRowName: 'Valle',
};

// Estaciones aeronáuticas cercanas (METAR y TAF de aviationweather.gov).
export const STATIONS = {
  metar: ['SCTB', 'SCEL'], // Tobalaba (~8 km), Pudahuel (~16 km)
  taf: ['SCEL', 'SCTB'],
  // Una tormenta observada a menos de esta distancia del cerro activa "Alarma".
  nearKm: 12,
  // Las observaciones más antiguas que esto no se consideran actuales.
  maxAgeMinutes: 90,
};

// Rayos detectados por el satélite GOES-19 (sensor GLM): imágenes que la DMC
// publica cada 10 minutos, con unos 35 a 45 minutos de retraso.
export const GLM = {
  pageUrl: 'https://climatologia.meteochile.gob.cl/application/diarioe/imagenesTormenta/',
  imageBase: 'https://climatologia.meteochile.gob.cl/images/imagenesTormenta/',
  // La imagen usa latitud/longitud directas: x = ax·lon + bx, y = ay·lat + by.
  // Calibrado con 13 ciudades marcadas en la imagen (error típico < 2 px, ~10 km).
  projection: { ax: 20.5827, bx: 2384.62, ay: -20.4644, by: -204.23 },
  // Distancia del rayo más cercano al cerro para cada nivel [Aviso, Alerta, Alarma], en km.
  radiiKm: [100, 40, 15],
  // Hasta cuántos minutos atrás se busca una imagen publicada.
  lookbackMinutes: 120,
  // Una imagen más antigua que esto ya no cuenta como observación actual.
  maxAgeMinutes: 100,
  // Recorte de Chile central que se muestra en el panel (píxeles de la imagen original).
  crop: { x: 800, y: 360, w: 260, h: 240 },
  // Imágenes que guarda el panel para la animación (6 = la última hora).
  frames: 6,
};

// Xweather (Vaisala): rayos en tiempo real, pronóstico horario y mapa de tormentas.
// Se activa con XWEATHER_ID y XWEATHER_SECRET en las propiedades del proyecto.
export const XWEATHER = {
  pageUrl: 'https://www.xweather.com',
  radiusKm: 100, // máximo del plan estándar
  lightningCost: 10, // accesos que cuesta cada consulta de rayos
  lightningMaxAgeMinutes: 20, // una consulta más antigua ya no cuenta como "ahora"
  // Los rayos se consultan solo con riesgo de tormenta en estas próximas horas
  stormLookaheadHours: 12,
  forecastMinutes: 120,
  mapMinutes: { storm: 20, calm: 180 },
  monthlyLimit: 14000, // del plan gratuito (15 000), con margen; se cambia con XWEATHER_LIMITE_MENSUAL
  map: { layers: 'terrain,radar-global:60,lightning-strikes-15m-icons,admin-cities', width: 800, height: 600, zoom: 8 },
};

// Mapa de Windy (se muestra en el panel; no usa clave).
export const WINDY_EMBED = 'https://embed.windy.com/embed.html';

// Mapa de avisos de Meteored. Sus avisos para Chile son los de la DMC; el panel
// muestra la página tal cual, sin copiar sus datos.
export const METEORED_URL = 'https://www.meteored.cl/avisos-meteorologicos/';

// Umbrales en orden [Aviso, Alerta, Alarma].
export const THRESHOLDS = {
  rain24h: [10, 25, 50], // mm acumulados en 24 h (mediana entre modelos)
  rain1h: [4, 8, 15], // mm en una hora
  // m/s, ráfaga máxima (lo que mide un anemómetro en un instante). Alerta a 15 m/s.
  gust: [12, 15, 20],
  // Índice UV (escala OMS: 6-7 alto, 8-10 muy alto, 11+ extremo). Llega a Alerta como
  // máximo: es predecible y se maneja con protección, no detiene la operación.
  uv: [8, 11, 99],
  snow24h: [0.5, 5, 15], // cm en 24 h
  heat: [33, 36, 39], // °C, temperatura máxima
  frost: [0, -2, -5], // °C, temperatura mínima (igual o menor)
  // Tormenta según modelos: "Aviso" si al menos N fuentes la pronostican en una
  // misma hora; "Alerta" si lo hace esta fracción de las fuentes (mínimo 3).
  thunderAviso: 2,
  thunderAlertaShare: 0.5,
  // CAPE (energía convectiva, J/kg) que se considera atmósfera muy inestable.
  cape: 1000,
};

// Cada cuánto se vuelve a consultar Open-Meteo. Los modelos se actualizan cada
// 1 a 6 horas, y la API gratuita limita las consultas por dirección IP (en Google
// muchas cuentas comparten IP), así que no conviene consultar más seguido.
export const OPEN_METEO_CACHE_MINUTES = 60;

export const NOTIFY = {
  // Horas que un peligro debe mantenerse en un nivel menor antes de registrar que
  // bajó o terminó. Evita avisos repetidos cuando un pronóstico oscila.
  downgradeAfterHours: 3,
  historySize: 100,
  // Los correos se envían solo a estas horas (hora de Santiago), como un boletín con
  // el estado actual, la alerta temprana y los cambios desde el boletín anterior.
  bulletinHours: [7, 13, 18],
  // Si a la hora exacta no se pudo enviar, se reintenta durante estos minutos.
  bulletinWindowMinutes: 60,
};

// Sube este número si cambia el formato o las unidades de los datos guardados:
// la próxima revisión descarta lo guardado y consulta todo de nuevo.
export const CACHE_VERSION = 2;
