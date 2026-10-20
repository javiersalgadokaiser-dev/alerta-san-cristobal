import { BROWSER_UA } from './http.js';
import { decodeJpeg, encodeJpeg } from '../lib/jpeg.js';
import { base64Encode, haversineKm, round } from '../util.js';

// Rayos detectados por el sensor GLM del satélite GOES-19, en las imágenes que la
// DMC publica cada 10 minutos en:
// https://climatologia.meteochile.gob.cl/application/diarioe/imagenesTormenta/
// Cada rayo de la última hora aparece como un punto de color sobre la imagen
// infrarroja (en grises). El color indica cuánto antes de la hora de la imagen
// ocurrió: cian 0-15 min, celeste 15-30, azul 30-45 y azul oscuro 45-60.

const STEP = 10 * 60000;
const pad = (n) => String(n).padStart(2, '0');

/** Nombre del archivo de la imagen de las HH:MM UTC, p. ej. 202610192350GLM_sudamerica.png.jpg */
export function glmFileName(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}GLM_sudamerica.png.jpg`;
}

/**
 * Busca la imagen más reciente: prueba los horarios desde hace 30 minutos hacia
 * atrás (la DMC las publica con 35 a 45 minutos de retraso, y a veces falta
 * alguna). Si la más reciente es `knownFile`, no la vuelve a descargar.
 */
export async function fetchLatestGlm(cfg, now, knownFile) {
  const first = Math.floor((now - 30 * 60000) / STEP) * STEP;
  for (let t = first; t >= now - cfg.lookbackMinutes * 60000; t -= STEP) {
    const file = glmFileName(t);
    if (file === knownFile) return { unchanged: true, file, time: t };
    const res = await fetch(cfg.imageBase + file, {
      headers: { 'User-Agent': BROWSER_UA, Referer: cfg.pageUrl },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`HTTP ${res.status} desde climatologia.meteochile.gob.cl`);
    if (!(res.headers.get('Content-Type') || '').includes('image')) continue;
    return { file, time: t, bytes: new Uint8Array(await res.arrayBuffer()) };
  }
  return null;
}

/** Clase de antigüedad (0-3) de un píxel de rayo, o -1 si no es un rayo. */
export function classifyPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Nubes y fondo en grises, ciudades en rojo, textos en negro o blanco
  if (b < 120 || b - r < 60 || max - min < 60) return -1;
  if (g >= 200) return 0; // cian
  if (g >= 100) return 1; // celeste
  if (b >= 215) return 2; // azul
  return 3; // azul oscuro
}

const COMPASS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];

function bearing(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
  const deg = (Math.atan2(y, x) / rad + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/**
 * Agrupa los píxeles de rayo cercanos al punto en núcleos y calcula, para cada
 * uno, la distancia y dirección desde el cerro y la clase de su rayo más reciente.
 */
export function analyzeGlm(pixels, width, height, cfg, location) {
  const { ax, bx, ay, by } = cfg.projection;
  const toLatLon = (x, y) => [(y - by) / ay, (x - bx) / ax];
  const cx = ax * location.lon + bx;
  const cy = ay * location.lat + by;
  const maxKm = cfg.radiiKm[0];
  const rx = Math.ceil((maxKm / (111.32 * Math.cos((location.lat * Math.PI) / 180))) * Math.abs(ax)) + 6;
  const ry = Math.ceil((maxKm / 110.57) * Math.abs(ay)) + 6;
  const x0 = Math.max(0, Math.round(cx - rx));
  const y0 = Math.max(0, Math.round(cy - ry));
  const x1 = Math.min(width - 1, Math.round(cx + rx));
  const y1 = Math.min(height - 1, Math.round(cy + ry));
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;

  const cls = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * width + (x0 + x)) * 4;
      cls[y * w + x] = classifyPixel(pixels[i], pixels[i + 1], pixels[i + 2]);
    }
  }

  // Núcleos: píxeles de rayo conectados (8 vecinos)
  const seen = new Uint8Array(w * h);
  const clusters = [];
  for (let start = 0; start < w * h; start++) {
    if (cls[start] < 0 || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let newest = 3;
    while (stack.length) {
      const p = stack.pop();
      const px = p % w;
      const py = (p - px) / w;
      n++;
      sx += px;
      sy += py;
      newest = Math.min(newest, cls[p]);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const qx = px + dx;
          const qy = py + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const q = qy * w + qx;
          if (cls[q] >= 0 && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (n < 3) continue; // ruido de compresión
    const [lat, lon] = toLatLon(x0 + sx / n, y0 + sy / n);
    const distKm = round(haversineKm(location.lat, location.lon, lat, lon));
    if (distKm > maxKm) continue;
    clusters.push({ distKm, direction: bearing(location.lat, location.lon, lat, lon), ageClass: newest, pixels: n });
  }
  clusters.sort((a, b) => a.distKm - b.distKm);
  return { clusters, nearestKm: clusters.length ? clusters[0].distKm : null };
}

/** Recorte de Chile central para mostrar en el panel, como JPEG en base64. */
export function cropFrame(image, crop, quality = 85) {
  const { x, y, w, h } = crop;
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * image.width + x) * 4;
    out.set(image.data.subarray(from, from + w * 4), row * w * 4);
  }
  return base64Encode(encodeJpeg(out, w, h, quality));
}

/** Descarga (si hay una nueva), analiza y recorta la imagen más reciente. */
export async function loadGlm(cfg, location, now, previous) {
  const latest = await fetchLatestGlm(cfg, now, previous?.file);
  if (!latest) throw new Error(`No hay imágenes publicadas en las últimas ${cfg.lookbackMinutes / 60} horas`);
  if (latest.unchanged) return { data: previous, frame: null };
  const image = decodeJpeg(latest.bytes);
  const analysis = analyzeGlm(image.data, image.width, image.height, cfg, location);
  return {
    data: { file: latest.file, time: latest.time, ...analysis },
    frame: { time: latest.time, jpeg: cropFrame(image, cfg.crop) },
  };
}
