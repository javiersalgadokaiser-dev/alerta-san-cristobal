/**
 * Alerta temprana · Cerro San Cristóbal — servidor en Google Apps Script.
 *
 * Archivo GENERADO con "node tools/build-apps-script.mjs" a partir de src/. No lo
 * edites a mano: los cambios se hacen en src/ y se vuelve a generar.
 *
 * Instalación (detalle en google-apps-script/INSTRUCCIONES.md):
 *  1. https://script.google.com → Nuevo proyecto → borra Código.gs y pega este archivo completo.
 *  2. Ejecuta instalar() (menú superior, junto a "Depurar") y autoriza los permisos.
 *  3. Implementar → Nueva implementación → Aplicación web
 *       Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier usuario
 *  4. Copia la URL que termina en /exec y pégala en Ajustes del panel.
 *
 * Funciones que puedes ejecutar: instalar, revisar, probarCorreo, verEstado, desinstalar,
 * pausarCorreos (deja de enviar correos) y reanudarCorreos (los vuelve a activar).
 * Opcional, en Configuración del proyecto → Propiedades de la secuencia de comandos:
 *   CORREOS   = correos separados por coma (si no existe, se usa tu Gmail)
 *   URL_PANEL = dirección del panel (para el botón de los correos)
 *
 * Incluye jpeg-js 0.4.4 (https://github.com/jpeg-js/jpeg-js):
 *   Decodificador: Copyright 2011 notmasteryet, Licencia Apache 2.0.
 *   Codificador: Copyright (c) 2008, Adobe Systems Incorporated, licencia BSD de 3 cláusulas;
 *   adaptado por Andreas Ritter (www.bytestrom.eu). Textos completos en src/lib/LICENSE-jpeg-js.
 */

var AlertaSC = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/gas/main.js
  var main_exports = {};
  __export(main_exports, {
    desinstalar: () => desinstalar,
    doGet: () => doGet,
    instalar: () => instalar,
    pausarCorreos: () => pausarCorreos,
    probarCorreo: () => probarCorreo,
    reanudarCorreos: () => reanudarCorreos,
    revisar: () => revisar,
    verEstado: () => verEstado
  });

  // src/gas/polyfills.js
  var root = typeof globalThis !== "undefined" ? globalThis : Function("return this")();
  if (typeof root.AbortSignal === "undefined") {
    root.AbortSignal = { timeout: () => void 0 };
  }
  if (typeof root.fetch === "undefined") {
    root.fetch = gasFetch;
  }
  if (typeof Utilities !== "undefined" && typeof root.__alertaSleep === "undefined") {
    root.__alertaSleep = (ms) => {
      Utilities.sleep(ms);
      return Promise.resolve();
    };
  }
  function gasFetch(url, opts = {}) {
    const params = {
      method: (opts.method || "get").toLowerCase(),
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { ...opts.headers || {} }
    };
    if (opts.body != null) params.payload = opts.body;
    try {
      let r;
      try {
        r = UrlFetchApp.fetch(url, params);
      } catch (e) {
        if (!params.headers["User-Agent"] || !/header|user-agent|argument/i.test(String(e))) throw e;
        delete params.headers["User-Agent"];
        r = UrlFetchApp.fetch(url, params);
      }
      const status = r.getResponseCode();
      const raw = r.getAllHeaders();
      const headers = {};
      for (const k of Object.keys(raw)) headers[k.toLowerCase()] = Array.isArray(raw[k]) ? raw[k].join(", ") : String(raw[k]);
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name) => name.toLowerCase() in headers ? headers[name.toLowerCase()] : null },
        text: () => Promise.resolve(r.getContentText()),
        json: () => Promise.resolve(JSON.parse(r.getContentText())),
        arrayBuffer: () => {
          const bytes = r.getContent();
          const out = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] & 255;
          return Promise.resolve(out.buffer);
        }
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // src/config.js
  var config_exports = {};
  __export(config_exports, {
    DMC: () => DMC,
    GLM: () => GLM,
    HORIZON_HOURS: () => HORIZON_HOURS,
    LOCATION: () => LOCATION,
    METEORED_URL: () => METEORED_URL,
    MODELS: () => MODELS,
    NOTIFY: () => NOTIFY,
    OPEN_METEO_CACHE_MINUTES: () => OPEN_METEO_CACHE_MINUTES,
    STATIONS: () => STATIONS,
    THRESHOLDS: () => THRESHOLDS
  });
  var LOCATION = {
    name: "Cerro San Cristóbal",
    place: "Santiago, Región Metropolitana",
    lat: -33.414667,
    lon: -70.616194,
    coords: `33°24'52.8"S 70°36'58.3"W`,
    timezone: "America/Santiago"
  };
  var HORIZON_HOURS = 72;
  var MODELS = [
    { id: "ecmwf_ifs", name: "ECMWF IFS", origin: "Europa" },
    { id: "gfs_seamless", name: "GFS", origin: "EE.UU." },
    { id: "icon_seamless", name: "ICON", origin: "Alemania" },
    { id: "gem_seamless", name: "GEM", origin: "Canadá" },
    { id: "ukmo_seamless", name: "UKMO", origin: "Reino Unido" },
    { id: "meteofrance_seamless", name: "ARPEGE", origin: "Francia" }
  ];
  var DMC = {
    url: "https://archivos.meteochile.gob.cl/portaldmc/AAA/datos_AAA.json",
    pageUrl: "https://archivos.meteochile.gob.cl/portaldmc/AAA/aaa_mapa.php",
    region: "05m",
    regionName: "Metropolitana",
    zones: ["05m_Valle_Longitudinal"],
    // Zonas vecinas: se muestran, pero como máximo suben el nivel a "Aviso".
    nearbyZones: ["05m_Precordillera", "05m_Cordillera_Costa"],
    zoneRowName: "Valle"
  };
  var STATIONS = {
    metar: ["SCTB", "SCEL"],
    // Tobalaba (~8 km), Pudahuel (~16 km)
    taf: ["SCEL", "SCTB"],
    // Una tormenta observada a menos de esta distancia del cerro activa "Alarma".
    nearKm: 12,
    // Las observaciones más antiguas que esto no se consideran actuales.
    maxAgeMinutes: 90
  };
  var GLM = {
    pageUrl: "https://climatologia.meteochile.gob.cl/application/diarioe/imagenesTormenta/",
    imageBase: "https://climatologia.meteochile.gob.cl/images/imagenesTormenta/",
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
    frames: 6
  };
  var METEORED_URL = "https://www.meteored.cl/avisos-meteorologicos/";
  var THRESHOLDS = {
    rain24h: [10, 25, 50],
    // mm acumulados en 24 h (mediana entre modelos)
    rain1h: [4, 8, 15],
    // mm en una hora
    gust: [50, 70, 90],
    // km/h, ráfaga máxima
    snow24h: [0.5, 5, 15],
    // cm en 24 h
    heat: [33, 36, 39],
    // °C, temperatura máxima
    frost: [0, -2, -5],
    // °C, temperatura mínima (igual o menor)
    // Tormenta según modelos: "Aviso" si al menos N fuentes la pronostican en una
    // misma hora; "Alerta" si lo hace esta fracción de las fuentes (mínimo 3).
    thunderAviso: 2,
    thunderAlertaShare: 0.5,
    // CAPE (energía convectiva, J/kg) que se considera atmósfera muy inestable.
    cape: 1e3
  };
  var OPEN_METEO_CACHE_MINUTES = 60;
  var NOTIFY = {
    // Horas que un peligro debe mantenerse en un nivel menor antes de avisar que
    // bajó o terminó. Evita correos repetidos cuando un pronóstico oscila.
    downgradeAfterHours: 3,
    historySize: 100
  };

  // src/util.js
  var HOUR = 36e5;
  var sleep = (ms) => typeof globalThis.__alertaSleep === "function" ? globalThis.__alertaSleep(ms) : Promise.resolve();
  var LEVELS = [
    { level: 0, key: "normal", name: "Normal", color: "verde", emoji: "🟢" },
    { level: 1, key: "aviso", name: "Aviso", color: "amarillo", emoji: "🟡" },
    { level: 2, key: "alerta", name: "Alerta", color: "naranja", emoji: "🟠" },
    { level: 3, key: "alarma", name: "Alarma", color: "roja", emoji: "🔴" }
  ];
  var isNum = (v) => typeof v === "number" && Number.isFinite(v);
  function median(values) {
    const a = values.filter(isNum).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function maxOf(values) {
    const a = values.filter(isNum);
    return a.length ? Math.max(...a) : null;
  }
  function minOf(values) {
    const a = values.filter(isNum);
    return a.length ? Math.min(...a) : null;
  }
  function sumOf(values) {
    return values.filter(isNum).reduce((s, v) => s + v, 0);
  }
  function round(v, digits = 0) {
    if (!isNum(v)) return null;
    const f = 10 ** digits;
    return Math.round(v * f) / f;
  }
  function levelAbove(value, thresholds) {
    if (!isNum(value)) return 0;
    return thresholds.reduce((lvl, t, i) => value >= t ? i + 1 : lvl, 0);
  }
  function levelBelow(value, thresholds) {
    if (!isNum(value)) return 0;
    return thresholds.reduce((lvl, t, i) => value <= t ? i + 1 : lvl, 0);
  }
  function maxWindowSum(values, width) {
    let best = null;
    let start = -1;
    let sum = 0;
    let count = 0;
    for (let j = 0; j < Math.min(width, values.length); j++) {
      if (isNum(values[j])) {
        sum += values[j];
        count++;
      }
    }
    for (let i = 0; i < values.length; i++) {
      if (count && (best === null || sum > best)) {
        best = sum;
        start = i;
      }
      if (isNum(values[i])) {
        sum -= values[i];
        count--;
      }
      const k = i + width;
      if (k < values.length && isNum(values[k])) {
        sum += values[k];
        count++;
      }
    }
    return { value: best, start };
  }
  var ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    deg: "°",
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    Aacute: "Á",
    Eacute: "É",
    Iacute: "Í",
    Oacute: "Ó",
    Uacute: "Ú",
    ntilde: "ñ",
    Ntilde: "Ñ",
    uuml: "ü",
    Uuml: "Ü",
    ordm: "º",
    ordf: "ª"
  };
  function decodeEntities(s = "") {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      var _a;
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return (_a = ENTITIES[e]) != null ? _a : m;
    });
  }
  function htmlToText(s = "") {
    return decodeEntities(String(s).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
  }
  function fold(s = "") {
    return decodeEntities(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  function escapeHtml(s = "") {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function base64Encode(bytes) {
    var _a;
    let out = "";
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
      const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
      out += B64[n >> 18] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63];
    }
    if (i < bytes.length) {
      const n = bytes[i] << 16 | ((_a = bytes[i + 1]) != null ? _a : 0) << 8;
      out += B64[n >> 18] + B64[n >> 12 & 63] + (i + 1 < bytes.length ? B64[n >> 6 & 63] : "=") + "=";
    }
    return out;
  }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function haversineKm(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
  }
  var formatters = /* @__PURE__ */ new Map();
  function formatter(tz, opts) {
    const key = tz + JSON.stringify(opts);
    if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat("es-CL", { timeZone: tz, ...opts }));
    return formatters.get(key);
  }
  function partsAt(ms, tz) {
    const f = formatter(tz, {
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
  }
  function tzOffsetMs(ms, tz) {
    const p = partsAt(ms, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1e3) * 1e3;
  }
  function localToUtc(y, mo, d, h, tz) {
    const guess = Date.UTC(y, mo - 1, d, h);
    const off = tzOffsetMs(guess, tz);
    let t = guess - off;
    const off2 = tzOffsetMs(t, tz);
    if (off2 !== off) t = guess - off2;
    return t;
  }
  function formatLocal(ms, tz, { withDay = true } = {}) {
    if (!isNum(ms)) return "";
    const opts = withDay ? { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    return formatter(tz, opts).format(new Date(ms)).replace(/\./g, "");
  }
  function formatWhen(ms, now, tz) {
    if (!isNum(ms)) return "";
    if (ms <= now) return "ahora";
    const day = (t) => formatter(tz, { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(t));
    const time = formatLocal(ms, tz, { withDay: false });
    const at = `${time.startsWith("01:") ? "a la" : "a las"} ${time}`;
    if (day(ms) === day(now)) return `hoy ${at}`;
    if (day(ms) === day(now + 24 * HOUR)) return `mañana ${at}`;
    return `el ${formatter(tz, { weekday: "long", day: "numeric" }).format(new Date(ms))} ${at}`;
  }
  function formatRange(start, end, tz) {
    if (!isNum(start)) return "";
    if (!isNum(end) || end <= start) return `desde ${formatLocal(start, tz)}`;
    return `${formatLocal(start, tz)} → ${formatLocal(end, tz)}`;
  }

  // src/upcoming.js
  var CONFIDENCE = ["baja", "media", "alta"];
  var list = (items) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
  function firstEpisode(fc, grid, flag, minSources = 1, gapHours = 2) {
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
    const supporters = fc.map((s) => {
      for (let h = start; h <= end; h++) if (flag(s, h) === true) return { id: s.id, name: s.name, first: grid[h] };
      return null;
    }).filter(Boolean).sort((a, b) => a.first - b.first);
    const n = Math.max(...avail.slice(start, end + 1));
    const peakCount = count[peak];
    const confidence = peakCount >= Math.max(3, Math.ceil(n / 2)) ? 2 : peakCount >= 2 ? 1 : 0;
    return { startIdx: start, endIdx: end, start: grid[start], end: grid[end] + HOUR, peak: grid[peak], peakCount, n, supporters, confidence };
  }
  function upcomingEvents({ now, grid, fc, observations = [], tafs = [], dmcAlerts = [], glm = null, cfg }) {
    const tz = cfg.LOCATION.timezone;
    const T = cfg.THRESHOLDS;
    const when = (t) => formatWhen(t, now, tz);
    const hhmm = (t) => formatLocal(t, tz, { withDay: false });
    const N = fc.length;
    const events = [];
    const official = (hazard) => dmcAlerts.filter((a) => a.hazard === hazard && a.start && (a.end == null || a.end > now));
    const station = (name) => name.replace(/ \(.*\)/, "");
    const raise = (c, by) => Math.min(2, c + by);
    const push = (e) => {
      if (e.start == null || e.start > grid[grid.length - 1] + HOUR) return;
      events.push({ ...e, confidence: e.observed ? "en curso" : CONFIDENCE[e.confidence] });
    };
    {
      const seen = [];
      for (const m of observations) {
        if (m.thunder) seen.push(`tormenta observada en ${station(m.name)} (${m.distKm} km)`);
        else if (m.thunderNear) seen.push(`tormenta en las cercanías de ${station(m.name)}`);
      }
      if (glm && now - glm.time <= cfg.GLM.maxAgeMinutes * 6e4) {
        const c = glm.clusters.find((x) => x.distKm <= cfg.GLM.radiiKm[1]);
        if (c) seen.push(`rayos a ${c.distKm} km al ${c.direction} (satélite, imagen de las ${hhmm(glm.time)})`);
      }
      const ev = firstEpisode(fc, grid, (s, h) => s.thunder[h] === null ? null : s.thunder[h] === true, 1);
      const taf = tafs.flatMap(
        (t) => t.periods.filter((p) => p.thunder && p.to > now).map((p) => ({ name: `el pronóstico aeronáutico de ${station(t.name)}`, from: Math.max(p.from, now), prob: p.probability }))
      );
      const dmc = official("tormenta");
      if (seen.length || ev || taf.length || dmc.length) {
        let start = ev ? ev.start : null;
        for (const p of taf) start = start == null ? p.from : Math.min(start, p.from);
        if (start == null) start = Math.max(now, Math.min(...dmc.map((a) => a.start)));
        let text;
        const who = [
          ...ev ? ev.supporters.map((s) => `${s.name} (${hhmm(s.first)})`) : [],
          ...taf.map((p) => `${p.name} (${hhmm(p.from)}${p.prob ? `, ${p.prob} %` : ""})`)
        ];
        if (seen.length) {
          start = now;
          text = `Hay actividad eléctrica cerca del cerro: ${list(seen)}.`;
          if (who.length) text += ` Los pronósticos la mantienen según ${list(who)}.`;
        } else if (who.length) {
          text = `Podría iniciar una tormenta eléctrica en el cerro ${when(start)}, según ${list(who)}.`;
          if (ev && ev.peakCount >= 2 && ev.peak !== ev.start) text += ` Mayor coincidencia ${when(ev.peak)} (${ev.peakCount} de ${ev.n} fuentes).`;
        } else {
          text = `La DMC advierte tormentas eléctricas probables ${start <= now ? "desde ahora" : `desde ${when(start)}`}.`;
        }
        if (dmc.length && (seen.length || who.length)) {
          text += ` La DMC mantiene ${list(dmc.map((a) => `un ${a.type.toLowerCase()} de tormentas eléctricas hasta ${when(a.end)}`))}.`;
        }
        let confidence = ev ? ev.confidence : 1;
        if (taf.length) confidence = raise(confidence, 1);
        if (dmc.length && (ev || taf.length)) confidence = raise(confidence, 1);
        push({
          hazardId: "tormenta",
          start,
          end: ev ? ev.end : null,
          peak: ev ? ev.peak : null,
          observed: seen.length > 0,
          confidence,
          sources: [...ev ? ev.supporters.map((s) => s.name) : [], ...taf.length ? ["TAF"] : [], ...dmc.length ? ["DMC"] : []],
          text
        });
      }
    }
    {
      const raining = observations.filter((m) => m.rain || m.heavyRain).map((m) => station(m.name));
      const ev = firstEpisode(fc, grid, (s, h) => s.precip[h] == null ? null : s.precip[h] >= 0.5, 2);
      const dmc = official("lluvia");
      if (raining.length || ev || dmc.length) {
        let text;
        let start = ev ? ev.start : null;
        if (ev) {
          const total = round(median(fc.map((s) => s.precip.slice(ev.startIdx, ev.endIdx + 1).reduce((a, v) => a + (v || 0), 0))));
          text = `Podría empezar a llover ${when(ev.start)}, según ${ev.supporters.length} de ${N} fuentes. Seguiría hasta ${when(ev.end)}, con unos ${total} mm en total.`;
        }
        if (raining.length) {
          start = now;
          text = `Ya llueve en ${list(raining)}.${text ? ` ${text}` : ""}`;
        }
        if (dmc.length) {
          const a = dmc[0];
          const dmcText = `La DMC tiene ${a.type === "Alerta" ? "una" : "un"} ${a.type.toLowerCase()} por precipitaciones${a.detail ? ` (${a.detail})` : ""} desde ${when(a.start)} hasta ${when(a.end)}.`;
          text = text ? `${text} ${dmcText}` : dmcText;
          if (start == null) start = Math.max(now, a.start);
        }
        push({
          hazardId: "lluvia",
          start,
          end: ev ? ev.end : null,
          peak: ev ? ev.peak : null,
          observed: raining.length > 0,
          confidence: raise(ev ? ev.confidence : 1, dmc.length && ev ? 1 : 0),
          sources: [...ev ? ev.supporters.map((s) => s.name) : [], ...dmc.length ? ["DMC"] : []],
          text
        });
      }
    }
    const simple = [
      {
        hazardId: "viento",
        flag: (s, h) => s.gust[h] == null ? null : s.gust[h] >= T.gust[0],
        phrase: (start) => `Podrían registrarse ráfagas sobre ${T.gust[0]} km/h ${when(start)}`,
        extra: (ev) => {
          const max = Math.max(...fc.map((s) => Math.max(0, ...s.gust.slice(ev.startIdx, ev.endIdx + 1).filter((v) => v != null))));
          return ` (hasta ${round(max)} km/h)`;
        }
      },
      {
        hazardId: "nieve",
        flag: (s, h) => s.snow[h] == null ? null : s.snow[h] >= 0.1,
        phrase: (start) => `Podría nevar en el cerro ${when(start)}`
      },
      {
        hazardId: "calor",
        flag: (s, h) => s.temp[h] == null ? null : s.temp[h] >= T.heat[0],
        phrase: (start) => `La temperatura podría superar los ${T.heat[0]} °C ${when(start)}`
      },
      {
        hazardId: "helada",
        flag: (s, h) => s.temp[h] == null ? null : s.temp[h] <= T.frost[0],
        phrase: (start) => `La temperatura podría bajar de ${T.frost[0]} °C ${when(start)}`
      }
    ];
    for (const k of simple) {
      const ev = firstEpisode(fc, grid, k.flag, 1);
      const dmc = official(k.hazardId);
      if (!ev && !dmc.length) continue;
      let text = ev ? `${k.phrase(ev.start)}, según ${list(ev.supporters.map((s) => `${s.name} (${hhmm(s.first)})`))}${k.extra ? k.extra(ev) : ""}.` : "";
      if (dmc.length) {
        const a = dmc[0];
        const dmcText = `La DMC tiene ${a.type === "Alerta" ? "una" : "un"} ${a.type.toLowerCase()} por ${a.phenomenon.toLowerCase()} desde ${when(a.start)} hasta ${when(a.end)}.`;
        text = text ? `${text} ${dmcText}` : dmcText;
      }
      push({
        hazardId: k.hazardId,
        start: ev ? ev.start : Math.max(now, dmc[0].start),
        end: ev ? ev.end : null,
        peak: ev ? ev.peak : null,
        observed: false,
        confidence: raise(ev ? ev.confidence : 1, dmc.length && ev ? 1 : 0),
        sources: [...ev ? ev.supporters.map((s) => s.name) : [], ...dmc.length ? ["DMC"] : []],
        text
      });
    }
    const rank2 = (e) => e.observed ? 0 : e.hazardId === "tormenta" ? 1 : 2;
    return events.sort((a, b) => rank2(a) - rank2(b) || a.start - b.start);
  }

  // src/engine.js
  var GLM_AGES = ["0 y 15", "15 y 30", "30 y 45", "45 y 60"];
  var HAZARDS = [
    { id: "tormenta", name: "Tormenta eléctrica", emoji: "⚡" },
    { id: "lluvia", name: "Lluvia intensa", emoji: "🌧️" },
    { id: "viento", name: "Viento fuerte", emoji: "💨" },
    { id: "nieve", name: "Nieve", emoji: "❄️" },
    { id: "calor", name: "Calor extremo", emoji: "🌡️" },
    { id: "helada", name: "Helada", emoji: "🧊" },
    { id: "otro", name: "Otros avisos DMC", emoji: "⚠️" }
  ];
  var FIELDS = ["temp", "precip", "thunder", "cape", "gust", "wind", "snow"];
  function align(src, grid) {
    const index = new Map(src.times.map((t, i) => [t, i]));
    const out = { id: src.id, name: src.name, origin: src.origin, provider: src.provider };
    for (const f of FIELDS) {
      out[f] = grid.map((t) => {
        var _a, _b;
        const i = index.get(t);
        return i === void 0 ? null : (_b = (_a = src[f]) == null ? void 0 : _a[i]) != null ? _b : null;
      });
    }
    return out;
  }
  var coverage = (arr) => arr.filter((v) => v !== null).length / arr.length;
  function windowOf(timeline, test, score) {
    const hits = timeline.filter(test);
    if (!hits.length) return {};
    const peak = hits.reduce((a, b) => score(b) > score(a) ? b : a);
    return { start: hits[0].t, end: hits[hits.length - 1].t + HOUR, peak: peak.t };
  }
  function evaluate({ now, forecasts = [], metars = [], tafs = [], dmcAlerts = [], glm = null, cfg }) {
    const T = cfg.THRESHOLDS;
    const start = Math.floor(now / HOUR) * HOUR;
    const grid = Array.from({ length: cfg.HORIZON_HOURS }, (_, i) => start + i * HOUR);
    const fc = forecasts.map((s) => align(s, grid)).filter((s) => coverage(s.precip) >= 0.5);
    const evidence = Object.fromEntries(HAZARDS.map((h) => [h.id, []]));
    const metric = {};
    const add = (hazard, e) => evidence[hazard].push(e);
    const timeline = grid.map((t, h) => {
      const vals = (k) => fc.map((s) => s[k][h]).filter(isNum);
      const th = fc.map((s) => s.thunder[h]).filter((v) => v !== null);
      const [pr, gu, ca, te] = [vals("precip"), vals("gust"), vals("cape"), vals("temp")];
      return {
        t,
        thunderK: th.filter(Boolean).length,
        thunderN: th.length,
        capeMed: round(median(ca)),
        capeMax: round(maxOf(ca)),
        precipMed: round(median(pr), 1),
        precipMin: round(minOf(pr), 1),
        precipMax: round(maxOf(pr), 1),
        gustMed: round(median(gu)),
        gustMin: round(minOf(gu)),
        gustMax: round(maxOf(gu)),
        tempMed: round(median(te), 1)
      };
    });
    const perSource = fc.map((s) => ({
      id: s.id,
      name: s.name,
      origin: s.origin,
      provider: s.provider,
      rain24: round(maxWindowSum(s.precip, 24).value, 1),
      rain1h: round(maxOf(s.precip), 1),
      rainTotal: round(sumOf(s.precip), 1),
      gust: round(maxOf(s.gust)),
      thunderHours: s.thunder.filter(Boolean).length,
      cape: round(maxOf(s.cape)),
      tmax: round(maxOf(s.temp), 1),
      tmin: round(minOf(s.temp), 1),
      snow24: round(maxWindowSum(s.snow, 24).value, 1)
    }));
    const consensus = (k) => median(perSource.map((p) => p[k]));
    const range = (k) => [minOf(perSource.map((p) => p[k])), maxOf(perSource.map((p) => p[k]))];
    const nModels = fc.length;
    const maxK = Math.max(0, ...timeline.map((x) => x.thunderK));
    const nThunder = Math.max(0, ...timeline.map((x) => x.thunderN));
    const alertaK = Math.max(3, Math.ceil(nThunder * T.thunderAlertaShare));
    metric.tormenta = { value: `${maxK}/${nThunder}`, label: "fuentes con tormenta" };
    if (maxK > 0) {
      const level = maxK >= alertaK ? 2 : maxK >= T.thunderAviso ? 1 : 0;
      const need = level === 2 ? alertaK : level === 1 ? T.thunderAviso : 1;
      const w = windowOf(timeline, (x) => x.thunderK >= need, (x) => {
        var _a;
        return x.thunderK * 1e4 + ((_a = x.capeMed) != null ? _a : 0);
      });
      add("tormenta", {
        source: "Modelos numéricos",
        kind: "pronóstico",
        level,
        text: level > 0 ? `${maxK} de ${nThunder} fuentes pronostican tormenta` : `Señal débil: solo 1 de ${nThunder} fuentes pronostica tormenta`,
        ...w
      });
    }
    const unstable = timeline.filter((x) => x.capeMed >= T.cape && (x.precipMed >= 0.2 || x.thunderK > 0));
    if (unstable.length) {
      const w = windowOf(unstable, () => true, (x) => x.capeMed);
      const peak = unstable.find((x) => x.t === w.peak);
      add("tormenta", {
        source: "Modelos numéricos",
        kind: "pronóstico",
        level: 1,
        text: `Atmósfera muy inestable: CAPE mediana de hasta ${peak.capeMed} J/kg, con lluvia`,
        ...w
      });
    }
    const r24 = round(consensus("rain24"), 1);
    const r1 = round(consensus("rain1h"), 1);
    metric.lluvia = { value: isNum(r24) ? `${r24} mm` : "–", label: "máx. en 24 h (mediana)" };
    if (r24 >= 1) {
      const [lo, hi] = range("rain24");
      const w = windowOf(timeline, (x) => x.precipMed >= 0.5, (x) => x.precipMed);
      add("lluvia", {
        source: "Modelos numéricos",
        kind: "pronóstico",
        level: Math.max(levelAbove(r24, T.rain24h), levelAbove(r1, T.rain1h)),
        text: `Hasta ${r24} mm en 24 h (entre ${round(lo, 1)} y ${round(hi, 1)} mm según ${nModels} fuentes); máx. ${r1} mm/h`,
        ...w
      });
    }
    const gust = round(consensus("gust"));
    metric.viento = { value: isNum(gust) ? `${gust} km/h` : "–", label: "ráfaga máx. (mediana)" };
    if (isNum(gust)) {
      const [lo, hi] = range("gust");
      const level = levelAbove(gust, T.gust);
      const w = windowOf(timeline, (x) => x.gustMed >= (level ? T.gust[level - 1] : gust * 0.9), (x) => x.gustMed);
      add("viento", {
        source: "Modelos numéricos",
        kind: "pronóstico",
        level,
        text: `Ráfagas de hasta ${gust} km/h (entre ${lo} y ${hi} km/h según las fuentes)`,
        ...w
      });
    }
    const snow = round(consensus("snow24"), 1);
    metric.nieve = { value: isNum(snow) ? `${snow} cm` : "–", label: "máx. en 24 h (mediana)" };
    if (snow > 0) {
      add("nieve", {
        source: "Modelos numéricos",
        kind: "pronóstico",
        level: levelAbove(snow, T.snow24h),
        text: `Nieve acumulada de hasta ${snow} cm en 24 h`
      });
    }
    const tmax = round(consensus("tmax"), 1);
    const tmin = round(consensus("tmin"), 1);
    metric.calor = { value: isNum(tmax) ? `${tmax} °C` : "–", label: "máxima (mediana)" };
    metric.helada = { value: isNum(tmin) ? `${tmin} °C` : "–", label: "mínima (mediana)" };
    if (levelAbove(tmax, T.heat)) {
      const w = windowOf(timeline, (x) => x.tempMed >= T.heat[0], (x) => x.tempMed);
      add("calor", { source: "Modelos numéricos", kind: "pronóstico", level: levelAbove(tmax, T.heat), text: `Máxima de ${tmax} °C`, ...w });
    }
    if (levelBelow(tmin, T.frost)) {
      const w = windowOf(timeline, (x) => x.tempMed <= T.frost[0], (x) => -x.tempMed);
      add("helada", { source: "Modelos numéricos", kind: "pronóstico", level: levelBelow(tmin, T.frost), text: `Mínima de ${tmin} °C`, ...w });
    }
    const latest = /* @__PURE__ */ new Map();
    for (const m of metars) {
      if (now - m.time > cfg.STATIONS.maxAgeMinutes * 6e4) continue;
      if (!latest.has(m.station) || latest.get(m.station).time < m.time) latest.set(m.station, m);
    }
    const observations = [...latest.values()].sort((a, b) => a.distKm - b.distKm);
    for (const m of observations) {
      const src = `METAR ${m.station} · ${m.name} (${m.distKm} km)`;
      const near = m.distKm <= cfg.STATIONS.nearKm;
      const obs = { source: src, kind: "observado", start: m.time };
      if (m.thunder) add("tormenta", { ...obs, level: near ? 3 : 2, text: `Tormenta eléctrica observada en ${m.name}${m.hail ? " con granizo" : ""}` });
      else if (m.thunderNear) add("tormenta", { ...obs, level: 2, text: `Tormenta en las cercanías de ${m.name}` });
      else if (m.thunderRecent) add("tormenta", { ...obs, level: 1, text: `Hubo tormenta en ${m.name} durante la última hora` });
      if (m.thunderTrend) add("tormenta", { ...obs, level: 2, text: `${m.name} prevé tormenta en las próximas 2 horas` });
      if (m.cb && !m.thunder) add("tormenta", { ...obs, level: near ? 2 : 1, text: `Nubes cumulonimbus (de tormenta) sobre ${m.name}` });
      if (m.heavyRain) add("lluvia", { ...obs, level: 1, text: `Lluvia intensa observada en ${m.name}` });
      if (m.gustKmh) add("viento", { ...obs, level: levelAbove(m.gustKmh, T.gust), text: `Ráfaga de ${m.gustKmh} km/h en ${m.name}` });
    }
    if (glm && now - glm.time <= cfg.GLM.maxAgeMinutes * 6e4) {
      const R = cfg.GLM.radiiKm;
      const base = { source: "Satélite GOES-19 (DMC)", kind: "observado", start: glm.time };
      const c = glm.clusters[0];
      if (c) {
        const more = glm.clusters.length > 1 ? `; ${glm.clusters.length} núcleos a menos de ${R[0]} km` : "";
        add("tormenta", {
          ...base,
          level: c.distKm <= R[2] ? 3 : c.distKm <= R[1] ? 2 : 1,
          text: `Rayos a ${c.distKm} km al ${c.direction} del cerro, ocurridos entre ${GLM_AGES[c.ageClass]} min antes de la imagen${more}`
        });
        metric.tormenta = { value: `${c.distKm} km`, label: `rayo más cercano (al ${c.direction})` };
      } else {
        add("tormenta", { ...base, level: 0, text: `Sin rayos a menos de ${R[0]} km del cerro en la última imagen satelital` });
      }
    }
    for (const taf of tafs) {
      for (const p of taf.periods) {
        if (p.to <= now) continue;
        const base = { source: `TAF ${taf.station} · ${taf.name}`, kind: "pronóstico", start: Math.max(p.from, now), end: p.to };
        const prob = p.probability ? ` (probabilidad ${p.probability}%)` : "";
        if (p.thunder) add("tormenta", { ...base, level: p.probability && p.probability <= 30 ? 1 : 2, text: `Pronóstico de tormenta en ${taf.name}${prob}` });
        else if (p.cb) add("tormenta", { ...base, level: 1, text: `Pronóstico de cumulonimbus en ${taf.name}${prob}` });
        if (p.gustKmh) add("viento", { ...base, level: Math.min(2, levelAbove(p.gustKmh, T.gust)), text: `Ráfagas de ${p.gustKmh} km/h en ${taf.name}${prob}` });
      }
    }
    for (const a of dmcAlerts) {
      add(a.hazard, {
        source: `DMC ${a.code}`,
        kind: "oficial",
        level: a.effectiveLevel,
        text: `${a.type} DMC${a.nearby ? " en zona vecina" : ""}: ${a.title}`,
        start: a.start,
        end: a.end
      });
    }
    const hazards = HAZARDS.map((h) => {
      var _a, _b, _c;
      const ev = evidence[h.id].sort((a, b) => b.level - a.level || kindRank(a) - kindRank(b));
      const level = Math.max(0, ...ev.map((e) => e.level));
      const top = ev.filter((e) => e.level === level && level > 0);
      const starts = top.map((e) => e.start).filter(isNum);
      const ends = top.map((e) => e.end).filter(isNum);
      return {
        ...h,
        level,
        levelName: LEVELS[level].name,
        headline: level > 0 ? top[0].text : (_b = (_a = ev[0]) == null ? void 0 : _a.text) != null ? _b : "Sin señales en las próximas 72 horas",
        start: starts.length ? Math.min(...starts) : null,
        end: ends.length ? Math.max(...ends) : null,
        metric: (_c = metric[h.id]) != null ? _c : null,
        evidence: ev
      };
    }).filter((h) => h.id !== "otro" || h.evidence.length);
    const main = hazards.reduce((a, b) => b.level > a.level ? b : a);
    return {
      gridStart: start,
      hazards,
      overall: {
        level: main.level,
        levelName: LEVELS[main.level].name,
        hazardId: main.level > 0 ? main.id : null,
        headline: main.level > 0 ? `${main.name}: ${main.headline}` : "Sin alertas para las próximas 72 horas"
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
        gust: s.gust.map((v) => round(v)),
        temp: s.temp.map((v) => round(v, 1)),
        thunder: s.thunder.map((v) => v === null ? null : v ? 1 : 0)
      })),
      observations
    };
  }
  function kindRank(e) {
    var _a;
    return (_a = { oficial: 0, observado: 1, pronóstico: 2 }[e.kind]) != null ? _a : 3;
  }

  // src/notify.js
  var STATUS_HEX = ["#0ca30c", "#fab219", "#ec835a", "#d03b3b"];
  function evidenceWhen(e, tz) {
    if (e.kind === "observado" && e.start) return `observado ${formatLocal(e.start, tz)}`;
    if (e.peak) return `máximo ${formatLocal(e.peak, tz)}`;
    return formatRange(e.start, e.end, tz);
  }
  function diffAlerts(state, result, dmcAlerts, now, { downgradeAfterHours }, degraded = false) {
    var _a, _b, _c, _d;
    const changes = [];
    const notified = clone((_a = state.notified) != null ? _a : {});
    for (const h of result.hazards) {
      const prev = (_b = notified[h.id]) != null ? _b : { level: 0 };
      if (h.level > prev.level) {
        changes.push({ type: "sube", hazardId: h.id, from: prev.level, to: h.level });
        notified[h.id] = { level: h.level, at: now };
      } else if (h.level < prev.level && !degraded) {
        if (!prev.lowerSince) {
          notified[h.id] = { ...prev, lowerSince: now };
        } else if (now - prev.lowerSince >= downgradeAfterHours * HOUR) {
          changes.push({ type: h.level === 0 ? "fin" : "baja", hazardId: h.id, from: prev.level, to: h.level });
          notified[h.id] = { level: h.level, at: now };
        }
      } else if (prev.lowerSince) {
        notified[h.id] = { level: prev.level, at: prev.at };
      }
    }
    const seen = new Set((_c = state.dmcSeen) != null ? _c : []);
    for (const a of dmcAlerts) {
      if (!seen.has(a.key)) changes.push({ type: "dmc", hazardId: a.hazard, to: a.effectiveLevel, alertKey: a.key });
    }
    const dmcSeen = [.../* @__PURE__ */ new Set([...(_d = state.dmcSeen) != null ? _d : [], ...dmcAlerts.map((a) => a.key)])].slice(-300);
    return { changes, notified, dmcSeen };
  }
  var rank = (c) => {
    var _a;
    return { sube: 10, dmc: 10, baja: 5, fin: 1 }[c.type] + ((_a = c.to) != null ? _a : 0);
  };
  function describeChange(c, result, dmcAlerts, tz) {
    var _a, _b, _c;
    const h = (_a = result.hazards.find((x) => x.id === c.hazardId)) != null ? _a : { name: "Aviso DMC", emoji: "⚠️" };
    const to = LEVELS[(_b = c.to) != null ? _b : 0];
    const from = LEVELS[(_c = c.from) != null ? _c : 0];
    switch (c.type) {
      case "sube": {
        const when = formatRange(h.start, h.end, tz);
        return `${h.emoji} ${h.name} → ${to.name}${c.from ? ` (antes ${from.name})` : ""}${when ? `, ${when}` : ""}. Motivo: ${h.headline}`;
      }
      case "baja":
        return `↘️ ${h.name}: baja de ${from.name} a ${to.name}. ${h.headline}`;
      case "fin":
        return `✅ ${h.name}: finaliza la condición de ${from.name}.`;
      case "dmc": {
        const a = dmcAlerts.find((x) => x.key === c.alertKey);
        if (!a) return "📢 Nuevo aviso de la DMC";
        const extra = [a.detail, a.observation].filter(Boolean).join(". ");
        return `📢 ${a.type} DMC ${a.code}${a.nearby ? " (zona vecina)" : ""}: ${a.title}. Desde ${a.from} hasta ${a.to}.${extra ? ` ${extra}.` : ""}`;
      }
      default:
        return "";
    }
  }
  function buildAlertEmail(changes, result, dmcAlerts, { location, dashboardUrl }) {
    var _a;
    const tz = location.timezone;
    const ranked = [...changes].sort((a, b) => rank(b) - rank(a));
    const top = ranked[0];
    const h = (_a = result.hazards.find((x) => x.id === top.hazardId)) != null ? _a : { name: "Aviso DMC" };
    let subject;
    if (ranked.every((c) => c.type === "fin")) {
      subject = `✅ Fin de alerta: ${ranked.map((c) => {
        var _a2;
        return (_a2 = result.hazards.find((x) => x.id === c.hazardId)) == null ? void 0 : _a2.name;
      }).join(", ")} — ${location.name}`;
    } else if (top.type === "baja" || top.type === "fin") {
      subject = `↘️ ${h.name} baja a ${LEVELS[top.to].name} — ${location.name}`;
    } else {
      subject = `${LEVELS[top.to].emoji} ${LEVELS[top.to].name.toUpperCase()} · ${h.name} — ${location.name}`;
    }
    const lines = ranked.map((c) => describeChange(c, result, dmcAlerts, tz));
    return render({ subject, intro: "Cambios detectados:", lines, result, location, dashboardUrl });
  }
  function buildTestEmail(result, { location, dashboardUrl }) {
    return render({
      subject: `🧪 Correo de prueba — Alerta temprana ${location.name}`,
      intro: "Este es un correo de prueba. Si lo recibes, las notificaciones están bien configuradas.",
      lines: [],
      result,
      location,
      dashboardUrl
    });
  }
  function render({ subject, intro, lines, result, location, dashboardUrl }) {
    const tz = location.timezone;
    const overall = result.overall;
    const active = result.hazards.filter((h) => h.level > 0);
    const color = STATUS_HEX[overall.level];
    const hazardHtml = active.length ? active.map((h) => {
      const when = formatRange(h.start, h.end, tz);
      const ev = h.evidence.filter((e) => e.level > 0).slice(0, 4).map((e) => {
        const meta = [evidenceWhen(e, tz), e.source].filter(Boolean).join(" · ");
        return `<li style="margin:2px 0">${escapeHtml(e.text)} <span style="color:#52514e">(${escapeHtml(meta)})</span></li>`;
      }).join("");
      return `<div style="border-left:4px solid ${STATUS_HEX[h.level]};padding:8px 12px;margin:10px 0;background:#f9f9f7">
  <div style="font-weight:600">${h.emoji} ${escapeHtml(h.name)} — ${escapeHtml(LEVELS[h.level].name)}</div>
  ${when ? `<div style="color:#52514e;font-size:13px">${escapeHtml(when)}</div>` : ""}
  <ul style="margin:6px 0 0;padding-left:18px;font-size:14px">${ev}</ul>
</div>`;
    }).join("") : '<p style="margin:8px 0">Sin peligros activos para las próximas 72 horas.</p>';
    const upcoming = result.upcoming || [];
    const emojiOf = (id) => (result.hazards.find((x) => x.id === id) || {}).emoji || "⚠️";
    const upcomingHtml = upcoming.length ? `<div style="margin:14px 20px 0;padding:10px 14px;background:#f3f2ee;border-radius:8px">
    <div style="font-weight:700;margin-bottom:4px">Alerta temprana</div>
    ${upcoming.map((u) => `<p style="margin:6px 0;font-size:14px">${emojiOf(u.hazardId)} ${escapeHtml(u.text)} <span style="color:#52514e">(confianza ${escapeHtml(u.confidence)})</span></p>`).join("")}
  </div>` : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f3f2ee;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0b0b0b">
<div style="max-width:600px;margin:0 auto;background:#fcfcfb">
  <div style="border-top:8px solid ${color};padding:18px 20px 6px">
    <div style="font-size:13px;color:#52514e">Alerta temprana · ${escapeHtml(location.name)}</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px">${LEVELS[overall.level].emoji} ${escapeHtml(LEVELS[overall.level].name)}</div>
    <div style="font-size:15px;margin-top:4px">${escapeHtml(overall.headline)}</div>
  </div>
  ${upcomingHtml}
  <div style="padding:6px 20px 18px">
    <p style="margin:12px 0 6px">${escapeHtml(intro)}</p>
    ${lines.length ? `<ul style="padding-left:18px;margin:0">${lines.map((l) => `<li style="margin:6px 0">${escapeHtml(l)}</li>`).join("")}</ul>` : ""}
    <h3 style="font-size:16px;margin:18px 0 4px">Situación actual</h3>
    ${hazardHtml}
    ${dashboardUrl ? `<p style="margin:18px 0"><a href="${escapeHtml(dashboardUrl)}" style="background:#2a78d6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Abrir el panel</a></p>` : ""}
    <p style="font-size:12px;color:#52514e;margin-top:20px">Fuentes: Dirección Meteorológica de Chile, Open-Meteo, MET Norway y NOAA Aviation Weather Center.
    Este sistema es complementario: ante una emergencia, sigue las indicaciones de SENAPRED y de la DMC.</p>
  </div>
</div></body></html>`;
    const text = [
      `${LEVELS[overall.level].name.toUpperCase()} — ${overall.headline}`,
      "",
      ...upcoming.length ? ["Alerta temprana:", ...upcoming.map((u) => `- ${u.text} (confianza ${u.confidence})`), ""] : [],
      intro,
      ...lines.map((l) => `- ${l}`),
      "",
      "Situación actual:",
      ...active.length ? active.map((h) => `- ${h.name} (${LEVELS[h.level].name}): ${h.headline}`) : ["- Sin peligros activos para las próximas 72 horas."],
      dashboardUrl ? `
Panel: ${dashboardUrl}` : ""
    ].join("\n");
    return { subject, html, text };
  }

  // src/sources/http.js
  var APP_UA = "AlertaTempranaCerroSanCristobal/1.0";
  var BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
  async function fetchJson(url, { headers = {}, timeout = 2e4, retries = 0 } = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        headers: { "User-Agent": APP_UA, Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(timeout)
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(3e3 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} desde ${url.replace(/^https?:\/\/([^/]+).*$/, "$1")}${attempt ? ` (tras ${attempt + 1} intentos)` : ""}`);
      return res.json();
    }
  }

  // src/sources/aviation.js
  var API = "https://aviationweather.gov/api/data";
  var KT_TO_KMH = 1.852;
  var NAMES = { SCTB: "Tobalaba", SCEL: "Pudahuel (aeropuerto)", SCBQ: "El Bosque" };
  async function fetchMetars(ids, location) {
    const list2 = await fetchJson(`${API}/metar?ids=${ids.join(",")}&format=json&hours=3`);
    return (Array.isArray(list2) ? list2 : []).map((m) => parseMetar(m, location));
  }
  async function fetchTafs(ids) {
    const list2 = await fetchJson(`${API}/taf?ids=${ids.join(",")}&format=json`);
    return (Array.isArray(list2) ? list2 : []).map(parseTaf);
  }
  function parseMetar(m, location) {
    var _a, _b, _c, _d;
    const raw = String((_a = m.rawOb) != null ? _a : "");
    const tokens = raw.split(/\s+/).slice(2);
    const cut = (i) => i >= 0 ? i : tokens.length;
    const trendAt = cut(tokens.findIndex((t) => ["TEMPO", "BECMG", "NOSIG", "RMK"].includes(t)));
    const wx = tokens.slice(0, trendAt);
    const trend = tokens.slice(trendAt, cut(tokens.indexOf("RMK")));
    const wind = wx.map((t) => t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/)).find(Boolean);
    const has = (re) => wx.some((t) => re.test(t));
    return {
      station: m.icaoId,
      name: (_c = (_b = NAMES[m.icaoId]) != null ? _b : m.name) != null ? _c : m.icaoId,
      distKm: round(haversineKm(location.lat, location.lon, m.lat, m.lon), 0),
      time: m.obsTime * 1e3,
      raw,
      temp: (_d = m.temp) != null ? _d : null,
      windKmh: wind ? round(Number(wind[2]) * KT_TO_KMH) : null,
      gustKmh: (wind == null ? void 0 : wind[3]) ? round(Number(wind[3]) * KT_TO_KMH) : null,
      thunder: has(/^[+-]?TS/),
      // tormenta en la estación
      thunderNear: has(/^VCTS/),
      // tormenta en las cercanías (8-16 km)
      thunderRecent: has(/^RETS/),
      // tormenta en la última hora
      thunderTrend: trend.some((t) => /^[+-]?(VC)?TS/.test(t)),
      // esperada en 2 h
      cb: has(/^(FEW|SCT|BKN|OVC)\d{3}CB$/),
      tcu: has(/^(FEW|SCT|BKN|OVC)\d{3}TCU$/),
      hail: has(/^[+-]?(TS|SH)\w*(GR|GS)/),
      heavyRain: has(/^\+(SH|TS)?RA/),
      rain: has(/^[+-]?(SH|TS)?(RA|DZ)/)
    };
  }
  function parseTaf(t) {
    var _a, _b, _c;
    const periods = ((_a = t.fcsts) != null ? _a : []).map((f) => {
      var _a2, _b2, _c2, _d, _e;
      return {
        from: f.timeFrom * 1e3,
        to: f.timeTo * 1e3,
        change: (_a2 = f.fcstChange) != null ? _a2 : null,
        probability: (_b2 = f.probability) != null ? _b2 : null,
        wx: (_c2 = f.wxString) != null ? _c2 : "",
        thunder: /(^|\s)[+-]?(VC)?TS/.test((_d = f.wxString) != null ? _d : ""),
        cb: ((_e = f.clouds) != null ? _e : []).some((c) => c.type === "CB"),
        gustKmh: f.wgst ? round(f.wgst * KT_TO_KMH) : null
      };
    });
    return {
      station: t.icaoId,
      name: (_c = (_b = NAMES[t.icaoId]) != null ? _b : t.name) != null ? _c : t.icaoId,
      issued: Date.parse(t.issueTime),
      validTo: t.validTimeTo * 1e3,
      raw: t.rawTAF,
      periods: periods.filter((p) => p.thunder || p.cb || p.gustKmh)
    };
  }

  // src/sources/dmc.js
  var TYPE_LEVEL = { aviso: 1, alerta: 2, alarma: 3 };
  var MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var DAY_PARTS = { madrugada: [0, 6], manana: [6, 12], tarde: [12, 20], noche: [20, 24] };
  var NEARBY_KM = 15;
  async function fetchDmc(url) {
    return fetchJson(url, {
      headers: { "User-Agent": BROWSER_UA, Referer: "https://archivos.meteochile.gob.cl/portaldmc/AAA/aaa_mapa.php" }
    });
  }
  function hazardFor(phenomenon) {
    const f = fold(phenomenon);
    if (f.includes("tormenta")) return "tormenta";
    if (f.includes("precipitac") || f.includes("lluvia")) return "lluvia";
    if (f.includes("viento")) return "viento";
    if (f.includes("nevada") || f.includes("nieve")) return "nieve";
    if (f.includes("helada") || f.includes("baja") && f.includes("temperatura")) return "helada";
    if (f.includes("temperatura") || f.includes("calor")) return "calor";
    return "otro";
  }
  function parseDmcTime(text, tz, edge) {
    var _a;
    const f = fold(text);
    const m = f.match(/(\d{1,2}) de ([a-z]+) del? (\d{4})/);
    if (!m) return null;
    const month = m[2] === "setiembre" ? 8 : MONTHS.indexOf(m[2]);
    if (month < 0) return null;
    const part = Object.keys(DAY_PARTS).find((p) => f.includes(p));
    const [h0, h1] = (_a = DAY_PARTS[part]) != null ? _a : [0, 24];
    return localToUtc(Number(m[3]), month + 1, Number(m[1]), edge === "start" ? h0 : h1, tz);
  }
  function insideRing(lat, lon, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i];
      const [yj, xj] = ring[j];
      if (yi > lat !== yj > lat && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function matchZone(alert, location, cfg) {
    var _a, _b;
    const data = String((_a = alert.dataZonaAfecta) != null ? _a : "");
    const kind = String((_b = alert.tipoZonaAfecta) != null ? _b : "").toLowerCase();
    if (kind === "zonas") {
      const zones = data.split(",").map((z) => z.trim());
      if (zones.some((z) => cfg.zones.includes(z))) return "zona";
      if (zones.some((z) => cfg.nearbyZones.includes(z))) return "cercana";
      return null;
    }
    if (kind === "regiones") {
      return data.split(",").map((r) => r.trim()).includes(cfg.region) ? "region" : null;
    }
    if (kind === "area") {
      const ring = data.split("|").map((p) => p.split(",").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
      if (ring.length < 3) return null;
      if (insideRing(location.lat, location.lon, ring)) return "area";
      const near = ring.some(([lat, lon]) => haversineKm(location.lat, location.lon, lat, lon) <= NEARBY_KM);
      return near ? "cercana" : null;
    }
    return fold(alert.textoZonaAfecta).includes(fold(cfg.regionName)) ? "texto" : null;
  }
  function tableRow(html, cfg) {
    var _a;
    if (!html) return [];
    const rows = [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(
      (r) => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => htmlToText(c[1]))
    );
    const regionName = fold(cfg.regionName);
    const zoneName = fold(cfg.zoneRowName);
    let region = null;
    let header = null;
    for (const cells of rows) {
      const first = fold((_a = cells[0]) != null ? _a : "");
      if (cells.length === 1 && first.startsWith("region")) {
        region = first;
        header = null;
      } else if (first === "zona" || first === "region") {
        header = cells;
      } else if (header) {
        const match = region ? region.includes(regionName) && first.startsWith(zoneName) : first.includes(regionName);
        if (match) return header.slice(1).map((label, i) => {
          var _a2;
          return { label, value: (_a2 = cells[i + 1]) != null ? _a2 : "--" };
        });
      }
    }
    return [];
  }
  function narrowToDays(row, start, end, tz) {
    const days = row.map((c) => {
      var _a;
      return { day: Number((_a = c.label.match(/^\D+\s(\d{1,2})$/)) == null ? void 0 : _a[1]), active: c.value && c.value !== "--" };
    }).filter((d) => d.day);
    const active = days.filter((d) => d.active);
    if (!start || !days.length || !active.length) return { start, end };
    const local = new Date(start + tzOffsetMs(start, tz));
    const [y, m, d0] = [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()];
    const dateOf = (day) => day >= d0 ? [y, m, day] : m === 12 ? [y + 1, 1, day] : [y, m + 1, day];
    const first = localToUtc(...dateOf(active[0].day), 0, tz);
    const last = localToUtc(...dateOf(active[active.length - 1].day), 24, tz);
    return { start: Math.max(start, first), end: end ? Math.min(end, last) : last };
  }
  function dmcSignature(json) {
    var _a;
    return `${json.fecha_actualizacion}|${((_a = json.AAA) != null ? _a : []).map((a) => `${a.id}:${a.codigoMeteo}`).join(",")}`;
  }
  function activeAlerts(alerts, now) {
    return alerts.filter((a) => !a.end || a.end >= now - 2 * HOUR);
  }
  function parseDmc(json, location, cfg) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const alerts = [];
    for (const a of (_a = json.AAA) != null ? _a : []) {
      const match = matchZone(a, location, cfg);
      if (!match) continue;
      const row = tableRow(a.tablaHTML, cfg);
      const { start, end } = narrowToDays(
        row,
        parseDmcTime(a.desde, location.timezone, "start"),
        parseDmcTime(a.hasta, location.timezone, "end"),
        location.timezone
      );
      const level = (_b = TYPE_LEVEL[fold(a.tipo)]) != null ? _b : 1;
      const nearby = match === "cercana";
      const zoneLines = htmlToText(a.textoZonaAfecta).split("\n");
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
        zone: (_d = (_c = zoneLines.find((l) => fold(l).includes(fold(cfg.regionName)))) != null ? _c : zoneLines[0]) != null ? _d : "",
        match,
        nearby,
        detailTitle: htmlToText(a.tablaTitulo),
        detail: row.map((c) => `${c.label}: ${c.value}`).join(" · ")
      });
    }
    alerts.sort((x, y) => {
      var _a2, _b2;
      return y.effectiveLevel - x.effectiveLevel || ((_a2 = x.start) != null ? _a2 : 0) - ((_b2 = y.start) != null ? _b2 : 0);
    });
    return {
      updated: (_e = json.fecha_actualizacion) != null ? _e : null,
      totals: { avisos: (_f = json.Avisos) != null ? _f : 0, alertas: (_g = json.Alertas) != null ? _g : 0, alarmas: (_h = json.Alarmas) != null ? _h : 0 },
      alerts
    };
  }

  // src/lib/jpeg-decoder.js
  var JpegImage = (function jpegImage() {
    "use strict";
    var dctZigZag = new Int32Array([
      0,
      1,
      8,
      16,
      9,
      2,
      3,
      10,
      17,
      24,
      32,
      25,
      18,
      11,
      4,
      5,
      12,
      19,
      26,
      33,
      40,
      48,
      41,
      34,
      27,
      20,
      13,
      6,
      7,
      14,
      21,
      28,
      35,
      42,
      49,
      56,
      57,
      50,
      43,
      36,
      29,
      22,
      15,
      23,
      30,
      37,
      44,
      51,
      58,
      59,
      52,
      45,
      38,
      31,
      39,
      46,
      53,
      60,
      61,
      54,
      47,
      55,
      62,
      63
    ]);
    var dctCos1 = 4017;
    var dctSin1 = 799;
    var dctCos3 = 3406;
    var dctSin3 = 2276;
    var dctCos6 = 1567;
    var dctSin6 = 3784;
    var dctSqrt2 = 5793;
    var dctSqrt1d2 = 2896;
    function constructor() {
    }
    function buildHuffmanTable(codeLengths, values) {
      var k = 0, code = [], i, j, length = 16;
      while (length > 0 && !codeLengths[length - 1])
        length--;
      code.push({ children: [], index: 0 });
      var p = code[0], q;
      for (i = 0; i < length; i++) {
        for (j = 0; j < codeLengths[i]; j++) {
          p = code.pop();
          p.children[p.index] = values[k];
          while (p.index > 0) {
            if (code.length === 0)
              throw new Error("Could not recreate Huffman Table");
            p = code.pop();
          }
          p.index++;
          code.push(p);
          while (code.length <= i) {
            code.push(q = { children: [], index: 0 });
            p.children[p.index] = q.children;
            p = q;
          }
          k++;
        }
        if (i + 1 < length) {
          code.push(q = { children: [], index: 0 });
          p.children[p.index] = q.children;
          p = q;
        }
      }
      return code[0].children;
    }
    function decodeScan(data, offset, frame, components, resetInterval, spectralStart, spectralEnd, successivePrev, successive, opts) {
      var precision = frame.precision;
      var samplesPerLine = frame.samplesPerLine;
      var scanLines = frame.scanLines;
      var mcusPerLine = frame.mcusPerLine;
      var progressive = frame.progressive;
      var maxH = frame.maxH, maxV = frame.maxV;
      var startOffset = offset, bitsData = 0, bitsCount = 0;
      function readBit() {
        if (bitsCount > 0) {
          bitsCount--;
          return bitsData >> bitsCount & 1;
        }
        bitsData = data[offset++];
        if (bitsData == 255) {
          var nextByte = data[offset++];
          if (nextByte) {
            throw new Error("unexpected marker: " + (bitsData << 8 | nextByte).toString(16));
          }
        }
        bitsCount = 7;
        return bitsData >>> 7;
      }
      function decodeHuffman(tree) {
        var node = tree, bit;
        while ((bit = readBit()) !== null) {
          node = node[bit];
          if (typeof node === "number")
            return node;
          if (typeof node !== "object")
            throw new Error("invalid huffman sequence");
        }
        return null;
      }
      function receive(length) {
        var n2 = 0;
        while (length > 0) {
          var bit = readBit();
          if (bit === null) return;
          n2 = n2 << 1 | bit;
          length--;
        }
        return n2;
      }
      function receiveAndExtend(length) {
        var n2 = receive(length);
        if (n2 >= 1 << length - 1)
          return n2;
        return n2 + (-1 << length) + 1;
      }
      function decodeBaseline(component2, zz) {
        var t = decodeHuffman(component2.huffmanTableDC);
        var diff = t === 0 ? 0 : receiveAndExtend(t);
        zz[0] = component2.pred += diff;
        var k2 = 1;
        while (k2 < 64) {
          var rs = decodeHuffman(component2.huffmanTableAC);
          var s = rs & 15, r = rs >> 4;
          if (s === 0) {
            if (r < 15)
              break;
            k2 += 16;
            continue;
          }
          k2 += r;
          var z = dctZigZag[k2];
          zz[z] = receiveAndExtend(s);
          k2++;
        }
      }
      function decodeDCFirst(component2, zz) {
        var t = decodeHuffman(component2.huffmanTableDC);
        var diff = t === 0 ? 0 : receiveAndExtend(t) << successive;
        zz[0] = component2.pred += diff;
      }
      function decodeDCSuccessive(component2, zz) {
        zz[0] |= readBit() << successive;
      }
      var eobrun = 0;
      function decodeACFirst(component2, zz) {
        if (eobrun > 0) {
          eobrun--;
          return;
        }
        var k2 = spectralStart, e = spectralEnd;
        while (k2 <= e) {
          var rs = decodeHuffman(component2.huffmanTableAC);
          var s = rs & 15, r = rs >> 4;
          if (s === 0) {
            if (r < 15) {
              eobrun = receive(r) + (1 << r) - 1;
              break;
            }
            k2 += 16;
            continue;
          }
          k2 += r;
          var z = dctZigZag[k2];
          zz[z] = receiveAndExtend(s) * (1 << successive);
          k2++;
        }
      }
      var successiveACState = 0, successiveACNextValue;
      function decodeACSuccessive(component2, zz) {
        var k2 = spectralStart, e = spectralEnd, r = 0;
        while (k2 <= e) {
          var z = dctZigZag[k2];
          var direction = zz[z] < 0 ? -1 : 1;
          switch (successiveACState) {
            case 0:
              var rs = decodeHuffman(component2.huffmanTableAC);
              var s = rs & 15, r = rs >> 4;
              if (s === 0) {
                if (r < 15) {
                  eobrun = receive(r) + (1 << r);
                  successiveACState = 4;
                } else {
                  r = 16;
                  successiveACState = 1;
                }
              } else {
                if (s !== 1)
                  throw new Error("invalid ACn encoding");
                successiveACNextValue = receiveAndExtend(s);
                successiveACState = r ? 2 : 3;
              }
              continue;
            case 1:
            // skipping r zero items
            case 2:
              if (zz[z])
                zz[z] += (readBit() << successive) * direction;
              else {
                r--;
                if (r === 0)
                  successiveACState = successiveACState == 2 ? 3 : 0;
              }
              break;
            case 3:
              if (zz[z])
                zz[z] += (readBit() << successive) * direction;
              else {
                zz[z] = successiveACNextValue << successive;
                successiveACState = 0;
              }
              break;
            case 4:
              if (zz[z])
                zz[z] += (readBit() << successive) * direction;
              break;
          }
          k2++;
        }
        if (successiveACState === 4) {
          eobrun--;
          if (eobrun === 0)
            successiveACState = 0;
        }
      }
      function decodeMcu(component2, decode2, mcu2, row, col) {
        var mcuRow = mcu2 / mcusPerLine | 0;
        var mcuCol = mcu2 % mcusPerLine;
        var blockRow = mcuRow * component2.v + row;
        var blockCol = mcuCol * component2.h + col;
        if (component2.blocks[blockRow] === void 0 && opts.tolerantDecoding)
          return;
        decode2(component2, component2.blocks[blockRow][blockCol]);
      }
      function decodeBlock(component2, decode2, mcu2) {
        var blockRow = mcu2 / component2.blocksPerLine | 0;
        var blockCol = mcu2 % component2.blocksPerLine;
        if (component2.blocks[blockRow] === void 0 && opts.tolerantDecoding)
          return;
        decode2(component2, component2.blocks[blockRow][blockCol]);
      }
      var componentsLength = components.length;
      var component, i, j, k, n;
      var decodeFn;
      if (progressive) {
        if (spectralStart === 0)
          decodeFn = successivePrev === 0 ? decodeDCFirst : decodeDCSuccessive;
        else
          decodeFn = successivePrev === 0 ? decodeACFirst : decodeACSuccessive;
      } else {
        decodeFn = decodeBaseline;
      }
      var mcu = 0, marker;
      var mcuExpected;
      if (componentsLength == 1) {
        mcuExpected = components[0].blocksPerLine * components[0].blocksPerColumn;
      } else {
        mcuExpected = mcusPerLine * frame.mcusPerColumn;
      }
      if (!resetInterval) resetInterval = mcuExpected;
      var h, v;
      while (mcu < mcuExpected) {
        for (i = 0; i < componentsLength; i++)
          components[i].pred = 0;
        eobrun = 0;
        if (componentsLength == 1) {
          component = components[0];
          for (n = 0; n < resetInterval; n++) {
            decodeBlock(component, decodeFn, mcu);
            mcu++;
          }
        } else {
          for (n = 0; n < resetInterval; n++) {
            for (i = 0; i < componentsLength; i++) {
              component = components[i];
              h = component.h;
              v = component.v;
              for (j = 0; j < v; j++) {
                for (k = 0; k < h; k++) {
                  decodeMcu(component, decodeFn, mcu, j, k);
                }
              }
            }
            mcu++;
            if (mcu === mcuExpected) break;
          }
        }
        if (mcu === mcuExpected) {
          do {
            if (data[offset] === 255) {
              if (data[offset + 1] !== 0) {
                break;
              }
            }
            offset += 1;
          } while (offset < data.length - 2);
        }
        bitsCount = 0;
        marker = data[offset] << 8 | data[offset + 1];
        if (marker < 65280) {
          throw new Error("marker was not found");
        }
        if (marker >= 65488 && marker <= 65495) {
          offset += 2;
        } else
          break;
      }
      return offset - startOffset;
    }
    function buildComponentData(frame, component) {
      var lines = [];
      var blocksPerLine = component.blocksPerLine;
      var blocksPerColumn = component.blocksPerColumn;
      var samplesPerLine = blocksPerLine << 3;
      var R = new Int32Array(64), r = new Uint8Array(64);
      function quantizeAndInverse(zz, dataOut, dataIn) {
        var qt = component.quantizationTable;
        var v0, v1, v2, v3, v4, v5, v6, v7, t;
        var p = dataIn;
        var i2;
        for (i2 = 0; i2 < 64; i2++)
          p[i2] = zz[i2] * qt[i2];
        for (i2 = 0; i2 < 8; ++i2) {
          var row = 8 * i2;
          if (p[1 + row] == 0 && p[2 + row] == 0 && p[3 + row] == 0 && p[4 + row] == 0 && p[5 + row] == 0 && p[6 + row] == 0 && p[7 + row] == 0) {
            t = dctSqrt2 * p[0 + row] + 512 >> 10;
            p[0 + row] = t;
            p[1 + row] = t;
            p[2 + row] = t;
            p[3 + row] = t;
            p[4 + row] = t;
            p[5 + row] = t;
            p[6 + row] = t;
            p[7 + row] = t;
            continue;
          }
          v0 = dctSqrt2 * p[0 + row] + 128 >> 8;
          v1 = dctSqrt2 * p[4 + row] + 128 >> 8;
          v2 = p[2 + row];
          v3 = p[6 + row];
          v4 = dctSqrt1d2 * (p[1 + row] - p[7 + row]) + 128 >> 8;
          v7 = dctSqrt1d2 * (p[1 + row] + p[7 + row]) + 128 >> 8;
          v5 = p[3 + row] << 4;
          v6 = p[5 + row] << 4;
          t = v0 - v1 + 1 >> 1;
          v0 = v0 + v1 + 1 >> 1;
          v1 = t;
          t = v2 * dctSin6 + v3 * dctCos6 + 128 >> 8;
          v2 = v2 * dctCos6 - v3 * dctSin6 + 128 >> 8;
          v3 = t;
          t = v4 - v6 + 1 >> 1;
          v4 = v4 + v6 + 1 >> 1;
          v6 = t;
          t = v7 + v5 + 1 >> 1;
          v5 = v7 - v5 + 1 >> 1;
          v7 = t;
          t = v0 - v3 + 1 >> 1;
          v0 = v0 + v3 + 1 >> 1;
          v3 = t;
          t = v1 - v2 + 1 >> 1;
          v1 = v1 + v2 + 1 >> 1;
          v2 = t;
          t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
          v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
          v7 = t;
          t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
          v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
          v6 = t;
          p[0 + row] = v0 + v7;
          p[7 + row] = v0 - v7;
          p[1 + row] = v1 + v6;
          p[6 + row] = v1 - v6;
          p[2 + row] = v2 + v5;
          p[5 + row] = v2 - v5;
          p[3 + row] = v3 + v4;
          p[4 + row] = v3 - v4;
        }
        for (i2 = 0; i2 < 8; ++i2) {
          var col = i2;
          if (p[1 * 8 + col] == 0 && p[2 * 8 + col] == 0 && p[3 * 8 + col] == 0 && p[4 * 8 + col] == 0 && p[5 * 8 + col] == 0 && p[6 * 8 + col] == 0 && p[7 * 8 + col] == 0) {
            t = dctSqrt2 * dataIn[i2 + 0] + 8192 >> 14;
            p[0 * 8 + col] = t;
            p[1 * 8 + col] = t;
            p[2 * 8 + col] = t;
            p[3 * 8 + col] = t;
            p[4 * 8 + col] = t;
            p[5 * 8 + col] = t;
            p[6 * 8 + col] = t;
            p[7 * 8 + col] = t;
            continue;
          }
          v0 = dctSqrt2 * p[0 * 8 + col] + 2048 >> 12;
          v1 = dctSqrt2 * p[4 * 8 + col] + 2048 >> 12;
          v2 = p[2 * 8 + col];
          v3 = p[6 * 8 + col];
          v4 = dctSqrt1d2 * (p[1 * 8 + col] - p[7 * 8 + col]) + 2048 >> 12;
          v7 = dctSqrt1d2 * (p[1 * 8 + col] + p[7 * 8 + col]) + 2048 >> 12;
          v5 = p[3 * 8 + col];
          v6 = p[5 * 8 + col];
          t = v0 - v1 + 1 >> 1;
          v0 = v0 + v1 + 1 >> 1;
          v1 = t;
          t = v2 * dctSin6 + v3 * dctCos6 + 2048 >> 12;
          v2 = v2 * dctCos6 - v3 * dctSin6 + 2048 >> 12;
          v3 = t;
          t = v4 - v6 + 1 >> 1;
          v4 = v4 + v6 + 1 >> 1;
          v6 = t;
          t = v7 + v5 + 1 >> 1;
          v5 = v7 - v5 + 1 >> 1;
          v7 = t;
          t = v0 - v3 + 1 >> 1;
          v0 = v0 + v3 + 1 >> 1;
          v3 = t;
          t = v1 - v2 + 1 >> 1;
          v1 = v1 + v2 + 1 >> 1;
          v2 = t;
          t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
          v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
          v7 = t;
          t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
          v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
          v6 = t;
          p[0 * 8 + col] = v0 + v7;
          p[7 * 8 + col] = v0 - v7;
          p[1 * 8 + col] = v1 + v6;
          p[6 * 8 + col] = v1 - v6;
          p[2 * 8 + col] = v2 + v5;
          p[5 * 8 + col] = v2 - v5;
          p[3 * 8 + col] = v3 + v4;
          p[4 * 8 + col] = v3 - v4;
        }
        for (i2 = 0; i2 < 64; ++i2) {
          var sample2 = 128 + (p[i2] + 8 >> 4);
          dataOut[i2] = sample2 < 0 ? 0 : sample2 > 255 ? 255 : sample2;
        }
      }
      requestMemoryAllocation(samplesPerLine * blocksPerColumn * 8);
      var i, j;
      for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
        var scanLine = blockRow << 3;
        for (i = 0; i < 8; i++)
          lines.push(new Uint8Array(samplesPerLine));
        for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
          quantizeAndInverse(component.blocks[blockRow][blockCol], r, R);
          var offset = 0, sample = blockCol << 3;
          for (j = 0; j < 8; j++) {
            var line = lines[scanLine + j];
            for (i = 0; i < 8; i++)
              line[sample + i] = r[offset++];
          }
        }
      }
      return lines;
    }
    function clampTo8bit(a) {
      return a < 0 ? 0 : a > 255 ? 255 : a;
    }
    constructor.prototype = {
      load: function load(path) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", path, true);
        xhr.responseType = "arraybuffer";
        xhr.onload = (function() {
          var data = new Uint8Array(xhr.response || xhr.mozResponseArrayBuffer);
          this.parse(data);
          if (this.onload)
            this.onload();
        }).bind(this);
        xhr.send(null);
      },
      parse: function parse(data) {
        var maxResolutionInPixels = this.opts.maxResolutionInMP * 1e3 * 1e3;
        var offset = 0, length = data.length;
        function readUint16() {
          var value = data[offset] << 8 | data[offset + 1];
          offset += 2;
          return value;
        }
        function readDataBlock() {
          var length2 = readUint16();
          var array = data.subarray(offset, offset + length2 - 2);
          offset += array.length;
          return array;
        }
        function prepareComponents(frame2) {
          var maxH2 = 1, maxV2 = 1;
          var component2, componentId2;
          for (componentId2 in frame2.components) {
            if (frame2.components.hasOwnProperty(componentId2)) {
              component2 = frame2.components[componentId2];
              if (maxH2 < component2.h) maxH2 = component2.h;
              if (maxV2 < component2.v) maxV2 = component2.v;
            }
          }
          var mcusPerLine = Math.ceil(frame2.samplesPerLine / 8 / maxH2);
          var mcusPerColumn = Math.ceil(frame2.scanLines / 8 / maxV2);
          for (componentId2 in frame2.components) {
            if (frame2.components.hasOwnProperty(componentId2)) {
              component2 = frame2.components[componentId2];
              var blocksPerLine = Math.ceil(Math.ceil(frame2.samplesPerLine / 8) * component2.h / maxH2);
              var blocksPerColumn = Math.ceil(Math.ceil(frame2.scanLines / 8) * component2.v / maxV2);
              var blocksPerLineForMcu = mcusPerLine * component2.h;
              var blocksPerColumnForMcu = mcusPerColumn * component2.v;
              var blocksToAllocate = blocksPerColumnForMcu * blocksPerLineForMcu;
              var blocks = [];
              requestMemoryAllocation(blocksToAllocate * 256);
              for (var i2 = 0; i2 < blocksPerColumnForMcu; i2++) {
                var row = [];
                for (var j2 = 0; j2 < blocksPerLineForMcu; j2++)
                  row.push(new Int32Array(64));
                blocks.push(row);
              }
              component2.blocksPerLine = blocksPerLine;
              component2.blocksPerColumn = blocksPerColumn;
              component2.blocks = blocks;
            }
          }
          frame2.maxH = maxH2;
          frame2.maxV = maxV2;
          frame2.mcusPerLine = mcusPerLine;
          frame2.mcusPerColumn = mcusPerColumn;
        }
        var jfif = null;
        var adobe = null;
        var pixels = null;
        var frame, resetInterval;
        var quantizationTables = [], frames = [];
        var huffmanTablesAC = [], huffmanTablesDC = [];
        var fileMarker = readUint16();
        var malformedDataOffset = -1;
        this.comments = [];
        if (fileMarker != 65496) {
          throw new Error("SOI not found");
        }
        fileMarker = readUint16();
        while (fileMarker != 65497) {
          var i, j, l;
          switch (fileMarker) {
            case 65280:
              break;
            case 65504:
            // APP0 (Application Specific)
            case 65505:
            // APP1
            case 65506:
            // APP2
            case 65507:
            // APP3
            case 65508:
            // APP4
            case 65509:
            // APP5
            case 65510:
            // APP6
            case 65511:
            // APP7
            case 65512:
            // APP8
            case 65513:
            // APP9
            case 65514:
            // APP10
            case 65515:
            // APP11
            case 65516:
            // APP12
            case 65517:
            // APP13
            case 65518:
            // APP14
            case 65519:
            // APP15
            case 65534:
              var appData = readDataBlock();
              if (fileMarker === 65534) {
                var comment = String.fromCharCode.apply(null, appData);
                this.comments.push(comment);
              }
              if (fileMarker === 65504) {
                if (appData[0] === 74 && appData[1] === 70 && appData[2] === 73 && appData[3] === 70 && appData[4] === 0) {
                  jfif = {
                    version: { major: appData[5], minor: appData[6] },
                    densityUnits: appData[7],
                    xDensity: appData[8] << 8 | appData[9],
                    yDensity: appData[10] << 8 | appData[11],
                    thumbWidth: appData[12],
                    thumbHeight: appData[13],
                    thumbData: appData.subarray(14, 14 + 3 * appData[12] * appData[13])
                  };
                }
              }
              if (fileMarker === 65505) {
                if (appData[0] === 69 && appData[1] === 120 && appData[2] === 105 && appData[3] === 102 && appData[4] === 0) {
                  this.exifBuffer = appData.subarray(5, appData.length);
                }
              }
              if (fileMarker === 65518) {
                if (appData[0] === 65 && appData[1] === 100 && appData[2] === 111 && appData[3] === 98 && appData[4] === 101 && appData[5] === 0) {
                  adobe = {
                    version: appData[6],
                    flags0: appData[7] << 8 | appData[8],
                    flags1: appData[9] << 8 | appData[10],
                    transformCode: appData[11]
                  };
                }
              }
              break;
            case 65499:
              var quantizationTablesLength = readUint16();
              var quantizationTablesEnd = quantizationTablesLength + offset - 2;
              while (offset < quantizationTablesEnd) {
                var quantizationTableSpec = data[offset++];
                requestMemoryAllocation(64 * 4);
                var tableData = new Int32Array(64);
                if (quantizationTableSpec >> 4 === 0) {
                  for (j = 0; j < 64; j++) {
                    var z = dctZigZag[j];
                    tableData[z] = data[offset++];
                  }
                } else if (quantizationTableSpec >> 4 === 1) {
                  for (j = 0; j < 64; j++) {
                    var z = dctZigZag[j];
                    tableData[z] = readUint16();
                  }
                } else
                  throw new Error("DQT: invalid table spec");
                quantizationTables[quantizationTableSpec & 15] = tableData;
              }
              break;
            case 65472:
            // SOF0 (Start of Frame, Baseline DCT)
            case 65473:
            // SOF1 (Start of Frame, Extended DCT)
            case 65474:
              readUint16();
              frame = {};
              frame.extended = fileMarker === 65473;
              frame.progressive = fileMarker === 65474;
              frame.precision = data[offset++];
              frame.scanLines = readUint16();
              frame.samplesPerLine = readUint16();
              frame.components = {};
              frame.componentsOrder = [];
              var pixelsInFrame = frame.scanLines * frame.samplesPerLine;
              if (pixelsInFrame > maxResolutionInPixels) {
                var exceededAmount = Math.ceil((pixelsInFrame - maxResolutionInPixels) / 1e6);
                throw new Error(`maxResolutionInMP limit exceeded by ${exceededAmount}MP`);
              }
              var componentsCount = data[offset++], componentId;
              var maxH = 0, maxV = 0;
              for (i = 0; i < componentsCount; i++) {
                componentId = data[offset];
                var h = data[offset + 1] >> 4;
                var v = data[offset + 1] & 15;
                var qId = data[offset + 2];
                if (h <= 0 || v <= 0) {
                  throw new Error("Invalid sampling factor, expected values above 0");
                }
                frame.componentsOrder.push(componentId);
                frame.components[componentId] = {
                  h,
                  v,
                  quantizationIdx: qId
                };
                offset += 3;
              }
              prepareComponents(frame);
              frames.push(frame);
              break;
            case 65476:
              var huffmanLength = readUint16();
              for (i = 2; i < huffmanLength; ) {
                var huffmanTableSpec = data[offset++];
                var codeLengths = new Uint8Array(16);
                var codeLengthSum = 0;
                for (j = 0; j < 16; j++, offset++) {
                  codeLengthSum += codeLengths[j] = data[offset];
                }
                requestMemoryAllocation(16 + codeLengthSum);
                var huffmanValues = new Uint8Array(codeLengthSum);
                for (j = 0; j < codeLengthSum; j++, offset++)
                  huffmanValues[j] = data[offset];
                i += 17 + codeLengthSum;
                (huffmanTableSpec >> 4 === 0 ? huffmanTablesDC : huffmanTablesAC)[huffmanTableSpec & 15] = buildHuffmanTable(codeLengths, huffmanValues);
              }
              break;
            case 65501:
              readUint16();
              resetInterval = readUint16();
              break;
            case 65500:
              readUint16();
              readUint16();
              break;
            case 65498:
              var scanLength = readUint16();
              var selectorsCount = data[offset++];
              var components = [], component;
              for (i = 0; i < selectorsCount; i++) {
                component = frame.components[data[offset++]];
                var tableSpec = data[offset++];
                component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
                component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];
                components.push(component);
              }
              var spectralStart = data[offset++];
              var spectralEnd = data[offset++];
              var successiveApproximation = data[offset++];
              var processed = decodeScan(
                data,
                offset,
                frame,
                components,
                resetInterval,
                spectralStart,
                spectralEnd,
                successiveApproximation >> 4,
                successiveApproximation & 15,
                this.opts
              );
              offset += processed;
              break;
            case 65535:
              if (data[offset] !== 255) {
                offset--;
              }
              break;
            default:
              if (data[offset - 3] == 255 && data[offset - 2] >= 192 && data[offset - 2] <= 254) {
                offset -= 3;
                break;
              } else if (fileMarker === 224 || fileMarker == 225) {
                if (malformedDataOffset !== -1) {
                  throw new Error(`first unknown JPEG marker at offset ${malformedDataOffset.toString(16)}, second unknown JPEG marker ${fileMarker.toString(16)} at offset ${(offset - 1).toString(16)}`);
                }
                malformedDataOffset = offset - 1;
                const nextOffset = readUint16();
                if (data[offset + nextOffset - 2] === 255) {
                  offset += nextOffset - 2;
                  break;
                }
              }
              throw new Error("unknown JPEG marker " + fileMarker.toString(16));
          }
          fileMarker = readUint16();
        }
        if (frames.length != 1)
          throw new Error("only single frame JPEGs supported");
        for (var i = 0; i < frames.length; i++) {
          var cp = frames[i].components;
          for (var j in cp) {
            cp[j].quantizationTable = quantizationTables[cp[j].quantizationIdx];
            delete cp[j].quantizationIdx;
          }
        }
        this.width = frame.samplesPerLine;
        this.height = frame.scanLines;
        this.jfif = jfif;
        this.adobe = adobe;
        this.components = [];
        for (var i = 0; i < frame.componentsOrder.length; i++) {
          var component = frame.components[frame.componentsOrder[i]];
          this.components.push({
            lines: buildComponentData(frame, component),
            scaleX: component.h / frame.maxH,
            scaleY: component.v / frame.maxV
          });
        }
      },
      getData: function getData(width, height) {
        var scaleX = this.width / width, scaleY = this.height / height;
        var component1, component2, component3, component4;
        var component1Line, component2Line, component3Line, component4Line;
        var x, y;
        var offset = 0;
        var Y, Cb, Cr, K, C, M, Ye, R, G, B;
        var colorTransform;
        var dataLength = width * height * this.components.length;
        requestMemoryAllocation(dataLength);
        var data = new Uint8Array(dataLength);
        switch (this.components.length) {
          case 1:
            component1 = this.components[0];
            for (y = 0; y < height; y++) {
              component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
              for (x = 0; x < width; x++) {
                Y = component1Line[0 | x * component1.scaleX * scaleX];
                data[offset++] = Y;
              }
            }
            break;
          case 2:
            component1 = this.components[0];
            component2 = this.components[1];
            for (y = 0; y < height; y++) {
              component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
              component2Line = component2.lines[0 | y * component2.scaleY * scaleY];
              for (x = 0; x < width; x++) {
                Y = component1Line[0 | x * component1.scaleX * scaleX];
                data[offset++] = Y;
                Y = component2Line[0 | x * component2.scaleX * scaleX];
                data[offset++] = Y;
              }
            }
            break;
          case 3:
            colorTransform = true;
            if (this.adobe && this.adobe.transformCode)
              colorTransform = true;
            else if (typeof this.opts.colorTransform !== "undefined")
              colorTransform = !!this.opts.colorTransform;
            component1 = this.components[0];
            component2 = this.components[1];
            component3 = this.components[2];
            for (y = 0; y < height; y++) {
              component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
              component2Line = component2.lines[0 | y * component2.scaleY * scaleY];
              component3Line = component3.lines[0 | y * component3.scaleY * scaleY];
              for (x = 0; x < width; x++) {
                if (!colorTransform) {
                  R = component1Line[0 | x * component1.scaleX * scaleX];
                  G = component2Line[0 | x * component2.scaleX * scaleX];
                  B = component3Line[0 | x * component3.scaleX * scaleX];
                } else {
                  Y = component1Line[0 | x * component1.scaleX * scaleX];
                  Cb = component2Line[0 | x * component2.scaleX * scaleX];
                  Cr = component3Line[0 | x * component3.scaleX * scaleX];
                  R = clampTo8bit(Y + 1.402 * (Cr - 128));
                  G = clampTo8bit(Y - 0.3441363 * (Cb - 128) - 0.71413636 * (Cr - 128));
                  B = clampTo8bit(Y + 1.772 * (Cb - 128));
                }
                data[offset++] = R;
                data[offset++] = G;
                data[offset++] = B;
              }
            }
            break;
          case 4:
            if (!this.adobe)
              throw new Error("Unsupported color mode (4 components)");
            colorTransform = false;
            if (this.adobe && this.adobe.transformCode)
              colorTransform = true;
            else if (typeof this.opts.colorTransform !== "undefined")
              colorTransform = !!this.opts.colorTransform;
            component1 = this.components[0];
            component2 = this.components[1];
            component3 = this.components[2];
            component4 = this.components[3];
            for (y = 0; y < height; y++) {
              component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
              component2Line = component2.lines[0 | y * component2.scaleY * scaleY];
              component3Line = component3.lines[0 | y * component3.scaleY * scaleY];
              component4Line = component4.lines[0 | y * component4.scaleY * scaleY];
              for (x = 0; x < width; x++) {
                if (!colorTransform) {
                  C = component1Line[0 | x * component1.scaleX * scaleX];
                  M = component2Line[0 | x * component2.scaleX * scaleX];
                  Ye = component3Line[0 | x * component3.scaleX * scaleX];
                  K = component4Line[0 | x * component4.scaleX * scaleX];
                } else {
                  Y = component1Line[0 | x * component1.scaleX * scaleX];
                  Cb = component2Line[0 | x * component2.scaleX * scaleX];
                  Cr = component3Line[0 | x * component3.scaleX * scaleX];
                  K = component4Line[0 | x * component4.scaleX * scaleX];
                  C = 255 - clampTo8bit(Y + 1.402 * (Cr - 128));
                  M = 255 - clampTo8bit(Y - 0.3441363 * (Cb - 128) - 0.71413636 * (Cr - 128));
                  Ye = 255 - clampTo8bit(Y + 1.772 * (Cb - 128));
                }
                data[offset++] = 255 - C;
                data[offset++] = 255 - M;
                data[offset++] = 255 - Ye;
                data[offset++] = 255 - K;
              }
            }
            break;
          default:
            throw new Error("Unsupported color mode");
        }
        return data;
      },
      copyToImageData: function copyToImageData(imageData, formatAsRGBA) {
        var width = imageData.width, height = imageData.height;
        var imageDataArray = imageData.data;
        var data = this.getData(width, height);
        var i = 0, j = 0, x, y;
        var Y, K, C, M, R, G, B;
        switch (this.components.length) {
          case 1:
            for (y = 0; y < height; y++) {
              for (x = 0; x < width; x++) {
                Y = data[i++];
                imageDataArray[j++] = Y;
                imageDataArray[j++] = Y;
                imageDataArray[j++] = Y;
                if (formatAsRGBA) {
                  imageDataArray[j++] = 255;
                }
              }
            }
            break;
          case 3:
            for (y = 0; y < height; y++) {
              for (x = 0; x < width; x++) {
                R = data[i++];
                G = data[i++];
                B = data[i++];
                imageDataArray[j++] = R;
                imageDataArray[j++] = G;
                imageDataArray[j++] = B;
                if (formatAsRGBA) {
                  imageDataArray[j++] = 255;
                }
              }
            }
            break;
          case 4:
            for (y = 0; y < height; y++) {
              for (x = 0; x < width; x++) {
                C = data[i++];
                M = data[i++];
                Y = data[i++];
                K = data[i++];
                R = 255 - clampTo8bit(C * (1 - K / 255) + K);
                G = 255 - clampTo8bit(M * (1 - K / 255) + K);
                B = 255 - clampTo8bit(Y * (1 - K / 255) + K);
                imageDataArray[j++] = R;
                imageDataArray[j++] = G;
                imageDataArray[j++] = B;
                if (formatAsRGBA) {
                  imageDataArray[j++] = 255;
                }
              }
            }
            break;
          default:
            throw new Error("Unsupported color mode");
        }
      }
    };
    var totalBytesAllocated = 0;
    var maxMemoryUsageBytes = 0;
    function requestMemoryAllocation(increaseAmount = 0) {
      var totalMemoryImpactBytes = totalBytesAllocated + increaseAmount;
      if (totalMemoryImpactBytes > maxMemoryUsageBytes) {
        var exceededAmount = Math.ceil((totalMemoryImpactBytes - maxMemoryUsageBytes) / 1024 / 1024);
        throw new Error(`maxMemoryUsageInMB limit exceeded by at least ${exceededAmount}MB`);
      }
      totalBytesAllocated = totalMemoryImpactBytes;
    }
    constructor.resetMaxMemoryUsage = function(maxMemoryUsageBytes_) {
      totalBytesAllocated = 0;
      maxMemoryUsageBytes = maxMemoryUsageBytes_;
    };
    constructor.getBytesAllocated = function() {
      return totalBytesAllocated;
    };
    constructor.requestMemoryAllocation = requestMemoryAllocation;
    return constructor;
  })();
  function decode(jpegData, userOpts = {}) {
    var defaultOpts = {
      // "undefined" means "Choose whether to transform colors based on the image’s color model."
      colorTransform: void 0,
      useTArray: false,
      formatAsRGBA: true,
      tolerantDecoding: true,
      maxResolutionInMP: 100,
      // Don't decode more than 100 megapixels
      maxMemoryUsageInMB: 512
      // Don't decode if memory footprint is more than 512MB
    };
    var opts = { ...defaultOpts, ...userOpts };
    var arr = new Uint8Array(jpegData);
    var decoder = new JpegImage();
    decoder.opts = opts;
    JpegImage.resetMaxMemoryUsage(opts.maxMemoryUsageInMB * 1024 * 1024);
    decoder.parse(arr);
    var channels = opts.formatAsRGBA ? 4 : 3;
    var bytesNeeded = decoder.width * decoder.height * channels;
    try {
      JpegImage.requestMemoryAllocation(bytesNeeded);
      var image = {
        width: decoder.width,
        height: decoder.height,
        exifBuffer: decoder.exifBuffer,
        data: opts.useTArray ? new Uint8Array(bytesNeeded) : Buffer.alloc(bytesNeeded)
      };
      if (decoder.comments.length > 0) {
        image["comments"] = decoder.comments;
      }
    } catch (err) {
      if (err instanceof RangeError) {
        throw new Error("Could not allocate enough memory for the image. Required: " + bytesNeeded);
      }
      if (err instanceof ReferenceError) {
        if (err.message === "Buffer is not defined") {
          throw new Error("Buffer is not globally defined in this environment. Consider setting useTArray to true");
        }
      }
      throw err;
    }
    decoder.copyToImageData(image, opts.formatAsRGBA);
    return image;
  }
  var jpeg_decoder_default = decode;

  // src/lib/jpeg-encoder.js
  var btoa = btoa || function(buf) {
    return Buffer.from(buf).toString("base64");
  };
  function JPEGEncoder(quality) {
    var self = this;
    var fround = Math.round;
    var ffloor = Math.floor;
    var YTable = new Array(64);
    var UVTable = new Array(64);
    var fdtbl_Y = new Array(64);
    var fdtbl_UV = new Array(64);
    var YDC_HT;
    var UVDC_HT;
    var YAC_HT;
    var UVAC_HT;
    var bitcode = new Array(65535);
    var category = new Array(65535);
    var outputfDCTQuant = new Array(64);
    var DU = new Array(64);
    var byteout = [];
    var bytenew = 0;
    var bytepos = 7;
    var YDU = new Array(64);
    var UDU = new Array(64);
    var VDU = new Array(64);
    var clt = new Array(256);
    var RGB_YUV_TABLE = new Array(2048);
    var currentQuality;
    var ZigZag = [
      0,
      1,
      5,
      6,
      14,
      15,
      27,
      28,
      2,
      4,
      7,
      13,
      16,
      26,
      29,
      42,
      3,
      8,
      12,
      17,
      25,
      30,
      41,
      43,
      9,
      11,
      18,
      24,
      31,
      40,
      44,
      53,
      10,
      19,
      23,
      32,
      39,
      45,
      52,
      54,
      20,
      22,
      33,
      38,
      46,
      51,
      55,
      60,
      21,
      34,
      37,
      47,
      50,
      56,
      59,
      61,
      35,
      36,
      48,
      49,
      57,
      58,
      62,
      63
    ];
    var std_dc_luminance_nrcodes = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
    var std_dc_luminance_values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    var std_ac_luminance_nrcodes = [0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125];
    var std_ac_luminance_values = [
      1,
      2,
      3,
      0,
      4,
      17,
      5,
      18,
      33,
      49,
      65,
      6,
      19,
      81,
      97,
      7,
      34,
      113,
      20,
      50,
      129,
      145,
      161,
      8,
      35,
      66,
      177,
      193,
      21,
      82,
      209,
      240,
      36,
      51,
      98,
      114,
      130,
      9,
      10,
      22,
      23,
      24,
      25,
      26,
      37,
      38,
      39,
      40,
      41,
      42,
      52,
      53,
      54,
      55,
      56,
      57,
      58,
      67,
      68,
      69,
      70,
      71,
      72,
      73,
      74,
      83,
      84,
      85,
      86,
      87,
      88,
      89,
      90,
      99,
      100,
      101,
      102,
      103,
      104,
      105,
      106,
      115,
      116,
      117,
      118,
      119,
      120,
      121,
      122,
      131,
      132,
      133,
      134,
      135,
      136,
      137,
      138,
      146,
      147,
      148,
      149,
      150,
      151,
      152,
      153,
      154,
      162,
      163,
      164,
      165,
      166,
      167,
      168,
      169,
      170,
      178,
      179,
      180,
      181,
      182,
      183,
      184,
      185,
      186,
      194,
      195,
      196,
      197,
      198,
      199,
      200,
      201,
      202,
      210,
      211,
      212,
      213,
      214,
      215,
      216,
      217,
      218,
      225,
      226,
      227,
      228,
      229,
      230,
      231,
      232,
      233,
      234,
      241,
      242,
      243,
      244,
      245,
      246,
      247,
      248,
      249,
      250
    ];
    var std_dc_chrominance_nrcodes = [0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
    var std_dc_chrominance_values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    var std_ac_chrominance_nrcodes = [0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119];
    var std_ac_chrominance_values = [
      0,
      1,
      2,
      3,
      17,
      4,
      5,
      33,
      49,
      6,
      18,
      65,
      81,
      7,
      97,
      113,
      19,
      34,
      50,
      129,
      8,
      20,
      66,
      145,
      161,
      177,
      193,
      9,
      35,
      51,
      82,
      240,
      21,
      98,
      114,
      209,
      10,
      22,
      36,
      52,
      225,
      37,
      241,
      23,
      24,
      25,
      26,
      38,
      39,
      40,
      41,
      42,
      53,
      54,
      55,
      56,
      57,
      58,
      67,
      68,
      69,
      70,
      71,
      72,
      73,
      74,
      83,
      84,
      85,
      86,
      87,
      88,
      89,
      90,
      99,
      100,
      101,
      102,
      103,
      104,
      105,
      106,
      115,
      116,
      117,
      118,
      119,
      120,
      121,
      122,
      130,
      131,
      132,
      133,
      134,
      135,
      136,
      137,
      138,
      146,
      147,
      148,
      149,
      150,
      151,
      152,
      153,
      154,
      162,
      163,
      164,
      165,
      166,
      167,
      168,
      169,
      170,
      178,
      179,
      180,
      181,
      182,
      183,
      184,
      185,
      186,
      194,
      195,
      196,
      197,
      198,
      199,
      200,
      201,
      202,
      210,
      211,
      212,
      213,
      214,
      215,
      216,
      217,
      218,
      226,
      227,
      228,
      229,
      230,
      231,
      232,
      233,
      234,
      242,
      243,
      244,
      245,
      246,
      247,
      248,
      249,
      250
    ];
    function initQuantTables(sf) {
      var YQT = [
        16,
        11,
        10,
        16,
        24,
        40,
        51,
        61,
        12,
        12,
        14,
        19,
        26,
        58,
        60,
        55,
        14,
        13,
        16,
        24,
        40,
        57,
        69,
        56,
        14,
        17,
        22,
        29,
        51,
        87,
        80,
        62,
        18,
        22,
        37,
        56,
        68,
        109,
        103,
        77,
        24,
        35,
        55,
        64,
        81,
        104,
        113,
        92,
        49,
        64,
        78,
        87,
        103,
        121,
        120,
        101,
        72,
        92,
        95,
        98,
        112,
        100,
        103,
        99
      ];
      for (var i = 0; i < 64; i++) {
        var t = ffloor((YQT[i] * sf + 50) / 100);
        if (t < 1) {
          t = 1;
        } else if (t > 255) {
          t = 255;
        }
        YTable[ZigZag[i]] = t;
      }
      var UVQT = [
        17,
        18,
        24,
        47,
        99,
        99,
        99,
        99,
        18,
        21,
        26,
        66,
        99,
        99,
        99,
        99,
        24,
        26,
        56,
        99,
        99,
        99,
        99,
        99,
        47,
        66,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99,
        99
      ];
      for (var j = 0; j < 64; j++) {
        var u = ffloor((UVQT[j] * sf + 50) / 100);
        if (u < 1) {
          u = 1;
        } else if (u > 255) {
          u = 255;
        }
        UVTable[ZigZag[j]] = u;
      }
      var aasf = [
        1,
        1.387039845,
        1.306562965,
        1.175875602,
        1,
        0.785694958,
        0.5411961,
        0.275899379
      ];
      var k = 0;
      for (var row = 0; row < 8; row++) {
        for (var col = 0; col < 8; col++) {
          fdtbl_Y[k] = 1 / (YTable[ZigZag[k]] * aasf[row] * aasf[col] * 8);
          fdtbl_UV[k] = 1 / (UVTable[ZigZag[k]] * aasf[row] * aasf[col] * 8);
          k++;
        }
      }
    }
    function computeHuffmanTbl(nrcodes, std_table) {
      var codevalue = 0;
      var pos_in_table = 0;
      var HT = new Array();
      for (var k = 1; k <= 16; k++) {
        for (var j = 1; j <= nrcodes[k]; j++) {
          HT[std_table[pos_in_table]] = [];
          HT[std_table[pos_in_table]][0] = codevalue;
          HT[std_table[pos_in_table]][1] = k;
          pos_in_table++;
          codevalue++;
        }
        codevalue *= 2;
      }
      return HT;
    }
    function initHuffmanTbl() {
      YDC_HT = computeHuffmanTbl(std_dc_luminance_nrcodes, std_dc_luminance_values);
      UVDC_HT = computeHuffmanTbl(std_dc_chrominance_nrcodes, std_dc_chrominance_values);
      YAC_HT = computeHuffmanTbl(std_ac_luminance_nrcodes, std_ac_luminance_values);
      UVAC_HT = computeHuffmanTbl(std_ac_chrominance_nrcodes, std_ac_chrominance_values);
    }
    function initCategoryNumber() {
      var nrlower = 1;
      var nrupper = 2;
      for (var cat = 1; cat <= 15; cat++) {
        for (var nr = nrlower; nr < nrupper; nr++) {
          category[32767 + nr] = cat;
          bitcode[32767 + nr] = [];
          bitcode[32767 + nr][1] = cat;
          bitcode[32767 + nr][0] = nr;
        }
        for (var nrneg = -(nrupper - 1); nrneg <= -nrlower; nrneg++) {
          category[32767 + nrneg] = cat;
          bitcode[32767 + nrneg] = [];
          bitcode[32767 + nrneg][1] = cat;
          bitcode[32767 + nrneg][0] = nrupper - 1 + nrneg;
        }
        nrlower <<= 1;
        nrupper <<= 1;
      }
    }
    function initRGBYUVTable() {
      for (var i = 0; i < 256; i++) {
        RGB_YUV_TABLE[i] = 19595 * i;
        RGB_YUV_TABLE[i + 256 >> 0] = 38470 * i;
        RGB_YUV_TABLE[i + 512 >> 0] = 7471 * i + 32768;
        RGB_YUV_TABLE[i + 768 >> 0] = -11059 * i;
        RGB_YUV_TABLE[i + 1024 >> 0] = -21709 * i;
        RGB_YUV_TABLE[i + 1280 >> 0] = 32768 * i + 8421375;
        RGB_YUV_TABLE[i + 1536 >> 0] = -27439 * i;
        RGB_YUV_TABLE[i + 1792 >> 0] = -5329 * i;
      }
    }
    function writeBits(bs) {
      var value = bs[0];
      var posval = bs[1] - 1;
      while (posval >= 0) {
        if (value & 1 << posval) {
          bytenew |= 1 << bytepos;
        }
        posval--;
        bytepos--;
        if (bytepos < 0) {
          if (bytenew == 255) {
            writeByte(255);
            writeByte(0);
          } else {
            writeByte(bytenew);
          }
          bytepos = 7;
          bytenew = 0;
        }
      }
    }
    function writeByte(value) {
      byteout.push(value);
    }
    function writeWord(value) {
      writeByte(value >> 8 & 255);
      writeByte(value & 255);
    }
    function fDCTQuant(data, fdtbl) {
      var d0, d1, d2, d3, d4, d5, d6, d7;
      var dataOff = 0;
      var i;
      var I8 = 8;
      var I64 = 64;
      for (i = 0; i < I8; ++i) {
        d0 = data[dataOff];
        d1 = data[dataOff + 1];
        d2 = data[dataOff + 2];
        d3 = data[dataOff + 3];
        d4 = data[dataOff + 4];
        d5 = data[dataOff + 5];
        d6 = data[dataOff + 6];
        d7 = data[dataOff + 7];
        var tmp0 = d0 + d7;
        var tmp7 = d0 - d7;
        var tmp1 = d1 + d6;
        var tmp6 = d1 - d6;
        var tmp2 = d2 + d5;
        var tmp5 = d2 - d5;
        var tmp3 = d3 + d4;
        var tmp4 = d3 - d4;
        var tmp10 = tmp0 + tmp3;
        var tmp13 = tmp0 - tmp3;
        var tmp11 = tmp1 + tmp2;
        var tmp12 = tmp1 - tmp2;
        data[dataOff] = tmp10 + tmp11;
        data[dataOff + 4] = tmp10 - tmp11;
        var z1 = (tmp12 + tmp13) * 0.707106781;
        data[dataOff + 2] = tmp13 + z1;
        data[dataOff + 6] = tmp13 - z1;
        tmp10 = tmp4 + tmp5;
        tmp11 = tmp5 + tmp6;
        tmp12 = tmp6 + tmp7;
        var z5 = (tmp10 - tmp12) * 0.382683433;
        var z2 = 0.5411961 * tmp10 + z5;
        var z4 = 1.306562965 * tmp12 + z5;
        var z3 = tmp11 * 0.707106781;
        var z11 = tmp7 + z3;
        var z13 = tmp7 - z3;
        data[dataOff + 5] = z13 + z2;
        data[dataOff + 3] = z13 - z2;
        data[dataOff + 1] = z11 + z4;
        data[dataOff + 7] = z11 - z4;
        dataOff += 8;
      }
      dataOff = 0;
      for (i = 0; i < I8; ++i) {
        d0 = data[dataOff];
        d1 = data[dataOff + 8];
        d2 = data[dataOff + 16];
        d3 = data[dataOff + 24];
        d4 = data[dataOff + 32];
        d5 = data[dataOff + 40];
        d6 = data[dataOff + 48];
        d7 = data[dataOff + 56];
        var tmp0p2 = d0 + d7;
        var tmp7p2 = d0 - d7;
        var tmp1p2 = d1 + d6;
        var tmp6p2 = d1 - d6;
        var tmp2p2 = d2 + d5;
        var tmp5p2 = d2 - d5;
        var tmp3p2 = d3 + d4;
        var tmp4p2 = d3 - d4;
        var tmp10p2 = tmp0p2 + tmp3p2;
        var tmp13p2 = tmp0p2 - tmp3p2;
        var tmp11p2 = tmp1p2 + tmp2p2;
        var tmp12p2 = tmp1p2 - tmp2p2;
        data[dataOff] = tmp10p2 + tmp11p2;
        data[dataOff + 32] = tmp10p2 - tmp11p2;
        var z1p2 = (tmp12p2 + tmp13p2) * 0.707106781;
        data[dataOff + 16] = tmp13p2 + z1p2;
        data[dataOff + 48] = tmp13p2 - z1p2;
        tmp10p2 = tmp4p2 + tmp5p2;
        tmp11p2 = tmp5p2 + tmp6p2;
        tmp12p2 = tmp6p2 + tmp7p2;
        var z5p2 = (tmp10p2 - tmp12p2) * 0.382683433;
        var z2p2 = 0.5411961 * tmp10p2 + z5p2;
        var z4p2 = 1.306562965 * tmp12p2 + z5p2;
        var z3p2 = tmp11p2 * 0.707106781;
        var z11p2 = tmp7p2 + z3p2;
        var z13p2 = tmp7p2 - z3p2;
        data[dataOff + 40] = z13p2 + z2p2;
        data[dataOff + 24] = z13p2 - z2p2;
        data[dataOff + 8] = z11p2 + z4p2;
        data[dataOff + 56] = z11p2 - z4p2;
        dataOff++;
      }
      var fDCTQuant2;
      for (i = 0; i < I64; ++i) {
        fDCTQuant2 = data[i] * fdtbl[i];
        outputfDCTQuant[i] = fDCTQuant2 > 0 ? fDCTQuant2 + 0.5 | 0 : fDCTQuant2 - 0.5 | 0;
      }
      return outputfDCTQuant;
    }
    function writeAPP0() {
      writeWord(65504);
      writeWord(16);
      writeByte(74);
      writeByte(70);
      writeByte(73);
      writeByte(70);
      writeByte(0);
      writeByte(1);
      writeByte(1);
      writeByte(0);
      writeWord(1);
      writeWord(1);
      writeByte(0);
      writeByte(0);
    }
    function writeAPP1(exifBuffer) {
      if (!exifBuffer) return;
      writeWord(65505);
      if (exifBuffer[0] === 69 && exifBuffer[1] === 120 && exifBuffer[2] === 105 && exifBuffer[3] === 102) {
        writeWord(exifBuffer.length + 2);
      } else {
        writeWord(exifBuffer.length + 5 + 2);
        writeByte(69);
        writeByte(120);
        writeByte(105);
        writeByte(102);
        writeByte(0);
      }
      for (var i = 0; i < exifBuffer.length; i++) {
        writeByte(exifBuffer[i]);
      }
    }
    function writeSOF0(width, height) {
      writeWord(65472);
      writeWord(17);
      writeByte(8);
      writeWord(height);
      writeWord(width);
      writeByte(3);
      writeByte(1);
      writeByte(17);
      writeByte(0);
      writeByte(2);
      writeByte(17);
      writeByte(1);
      writeByte(3);
      writeByte(17);
      writeByte(1);
    }
    function writeDQT() {
      writeWord(65499);
      writeWord(132);
      writeByte(0);
      for (var i = 0; i < 64; i++) {
        writeByte(YTable[i]);
      }
      writeByte(1);
      for (var j = 0; j < 64; j++) {
        writeByte(UVTable[j]);
      }
    }
    function writeDHT() {
      writeWord(65476);
      writeWord(418);
      writeByte(0);
      for (var i = 0; i < 16; i++) {
        writeByte(std_dc_luminance_nrcodes[i + 1]);
      }
      for (var j = 0; j <= 11; j++) {
        writeByte(std_dc_luminance_values[j]);
      }
      writeByte(16);
      for (var k = 0; k < 16; k++) {
        writeByte(std_ac_luminance_nrcodes[k + 1]);
      }
      for (var l = 0; l <= 161; l++) {
        writeByte(std_ac_luminance_values[l]);
      }
      writeByte(1);
      for (var m = 0; m < 16; m++) {
        writeByte(std_dc_chrominance_nrcodes[m + 1]);
      }
      for (var n = 0; n <= 11; n++) {
        writeByte(std_dc_chrominance_values[n]);
      }
      writeByte(17);
      for (var o = 0; o < 16; o++) {
        writeByte(std_ac_chrominance_nrcodes[o + 1]);
      }
      for (var p = 0; p <= 161; p++) {
        writeByte(std_ac_chrominance_values[p]);
      }
    }
    function writeCOM(comments) {
      if (typeof comments === "undefined" || comments.constructor !== Array) return;
      comments.forEach((e) => {
        if (typeof e !== "string") return;
        writeWord(65534);
        var l = e.length;
        writeWord(l + 2);
        var i;
        for (i = 0; i < l; i++)
          writeByte(e.charCodeAt(i));
      });
    }
    function writeSOS() {
      writeWord(65498);
      writeWord(12);
      writeByte(3);
      writeByte(1);
      writeByte(0);
      writeByte(2);
      writeByte(17);
      writeByte(3);
      writeByte(17);
      writeByte(0);
      writeByte(63);
      writeByte(0);
    }
    function processDU(CDU, fdtbl, DC, HTDC, HTAC) {
      var EOB = HTAC[0];
      var M16zeroes = HTAC[240];
      var pos;
      var I16 = 16;
      var I63 = 63;
      var I64 = 64;
      var DU_DCT = fDCTQuant(CDU, fdtbl);
      for (var j = 0; j < I64; ++j) {
        DU[ZigZag[j]] = DU_DCT[j];
      }
      var Diff = DU[0] - DC;
      DC = DU[0];
      if (Diff == 0) {
        writeBits(HTDC[0]);
      } else {
        pos = 32767 + Diff;
        writeBits(HTDC[category[pos]]);
        writeBits(bitcode[pos]);
      }
      var end0pos = 63;
      for (; end0pos > 0 && DU[end0pos] == 0; end0pos--) {
      }
      ;
      if (end0pos == 0) {
        writeBits(EOB);
        return DC;
      }
      var i = 1;
      var lng;
      while (i <= end0pos) {
        var startpos = i;
        for (; DU[i] == 0 && i <= end0pos; ++i) {
        }
        var nrzeroes = i - startpos;
        if (nrzeroes >= I16) {
          lng = nrzeroes >> 4;
          for (var nrmarker = 1; nrmarker <= lng; ++nrmarker)
            writeBits(M16zeroes);
          nrzeroes = nrzeroes & 15;
        }
        pos = 32767 + DU[i];
        writeBits(HTAC[(nrzeroes << 4) + category[pos]]);
        writeBits(bitcode[pos]);
        i++;
      }
      if (end0pos != I63) {
        writeBits(EOB);
      }
      return DC;
    }
    function initCharLookupTable() {
      var sfcc = String.fromCharCode;
      for (var i = 0; i < 256; i++) {
        clt[i] = sfcc(i);
      }
    }
    this.encode = function(image, quality2) {
      var time_start = (/* @__PURE__ */ new Date()).getTime();
      if (quality2) setQuality(quality2);
      byteout = new Array();
      bytenew = 0;
      bytepos = 7;
      writeWord(65496);
      writeAPP0();
      writeCOM(image.comments);
      writeAPP1(image.exifBuffer);
      writeDQT();
      writeSOF0(image.width, image.height);
      writeDHT();
      writeSOS();
      var DCY = 0;
      var DCU = 0;
      var DCV = 0;
      bytenew = 0;
      bytepos = 7;
      this.encode.displayName = "_encode_";
      var imageData = image.data;
      var width = image.width;
      var height = image.height;
      var quadWidth = width * 4;
      var tripleWidth = width * 3;
      var x, y = 0;
      var r, g, b;
      var start, p, col, row, pos;
      while (y < height) {
        x = 0;
        while (x < quadWidth) {
          start = quadWidth * y + x;
          p = start;
          col = -1;
          row = 0;
          for (pos = 0; pos < 64; pos++) {
            row = pos >> 3;
            col = (pos & 7) * 4;
            p = start + row * quadWidth + col;
            if (y + row >= height) {
              p -= quadWidth * (y + 1 + row - height);
            }
            if (x + col >= quadWidth) {
              p -= x + col - quadWidth + 4;
            }
            r = imageData[p++];
            g = imageData[p++];
            b = imageData[p++];
            YDU[pos] = (RGB_YUV_TABLE[r] + RGB_YUV_TABLE[g + 256 >> 0] + RGB_YUV_TABLE[b + 512 >> 0] >> 16) - 128;
            UDU[pos] = (RGB_YUV_TABLE[r + 768 >> 0] + RGB_YUV_TABLE[g + 1024 >> 0] + RGB_YUV_TABLE[b + 1280 >> 0] >> 16) - 128;
            VDU[pos] = (RGB_YUV_TABLE[r + 1280 >> 0] + RGB_YUV_TABLE[g + 1536 >> 0] + RGB_YUV_TABLE[b + 1792 >> 0] >> 16) - 128;
          }
          DCY = processDU(YDU, fdtbl_Y, DCY, YDC_HT, YAC_HT);
          DCU = processDU(UDU, fdtbl_UV, DCU, UVDC_HT, UVAC_HT);
          DCV = processDU(VDU, fdtbl_UV, DCV, UVDC_HT, UVAC_HT);
          x += 32;
        }
        y += 8;
      }
      if (bytepos >= 0) {
        var fillbits = [];
        fillbits[1] = bytepos + 1;
        fillbits[0] = (1 << bytepos + 1) - 1;
        writeBits(fillbits);
      }
      writeWord(65497);
      if (typeof module === "undefined") return new Uint8Array(byteout);
      return Buffer.from(byteout);
      var jpegDataUri = "data:image/jpeg;base64," + btoa(byteout.join(""));
      byteout = [];
      var duration = (/* @__PURE__ */ new Date()).getTime() - time_start;
      return jpegDataUri;
    };
    function setQuality(quality2) {
      if (quality2 <= 0) {
        quality2 = 1;
      }
      if (quality2 > 100) {
        quality2 = 100;
      }
      if (currentQuality == quality2) return;
      var sf = 0;
      if (quality2 < 50) {
        sf = Math.floor(5e3 / quality2);
      } else {
        sf = Math.floor(200 - quality2 * 2);
      }
      initQuantTables(sf);
      currentQuality = quality2;
    }
    function init() {
      var time_start = (/* @__PURE__ */ new Date()).getTime();
      if (!quality) quality = 50;
      initCharLookupTable();
      initHuffmanTbl();
      initCategoryNumber();
      initRGBYUVTable();
      setQuality(quality);
      var duration = (/* @__PURE__ */ new Date()).getTime() - time_start;
    }
    init();
  }
  function encode(imgData, qu) {
    if (typeof qu === "undefined") qu = 50;
    var encoder = new JPEGEncoder(qu);
    var data = encoder.encode(imgData, qu);
    return {
      data,
      width: imgData.width,
      height: imgData.height
    };
  }
  var jpeg_encoder_default = encode;

  // src/lib/jpeg.js
  function decodeJpeg(bytes) {
    return jpeg_decoder_default(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
  }
  function encodeJpeg(rgba, width, height, quality) {
    return jpeg_encoder_default({ data: rgba, width, height }, quality).data;
  }

  // src/sources/glm.js
  var STEP = 10 * 6e4;
  var pad = (n) => String(n).padStart(2, "0");
  function glmFileName(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}GLM_sudamerica.png.jpg`;
  }
  async function fetchLatestGlm(cfg, now, knownFile) {
    const first = Math.floor((now - 30 * 6e4) / STEP) * STEP;
    for (let t = first; t >= now - cfg.lookbackMinutes * 6e4; t -= STEP) {
      const file = glmFileName(t);
      if (file === knownFile) return { unchanged: true, file, time: t };
      const res = await fetch(cfg.imageBase + file, {
        headers: { "User-Agent": BROWSER_UA, Referer: cfg.pageUrl },
        signal: AbortSignal.timeout(2e4)
      });
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`HTTP ${res.status} desde climatologia.meteochile.gob.cl`);
      if (!(res.headers.get("Content-Type") || "").includes("image")) continue;
      return { file, time: t, bytes: new Uint8Array(await res.arrayBuffer()) };
    }
    return null;
  }
  function classifyPixel(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (b < 120 || b - r < 60 || max - min < 60) return -1;
    if (g >= 200) return 0;
    if (g >= 100) return 1;
    if (b >= 215) return 2;
    return 3;
  }
  var COMPASS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];
  function bearing(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
    const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
    const deg = (Math.atan2(y, x) / rad + 360) % 360;
    return COMPASS[Math.round(deg / 45) % 8];
  }
  function analyzeGlm(pixels, width, height, cfg, location) {
    const { ax, bx, ay, by } = cfg.projection;
    const toLatLon = (x, y) => [(y - by) / ay, (x - bx) / ax];
    const cx = ax * location.lon + bx;
    const cy = ay * location.lat + by;
    const maxKm = cfg.radiiKm[0];
    const rx = Math.ceil(maxKm / (111.32 * Math.cos(location.lat * Math.PI / 180)) * Math.abs(ax)) + 6;
    const ry = Math.ceil(maxKm / 110.57 * Math.abs(ay)) + 6;
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
      if (n < 3) continue;
      const [lat, lon] = toLatLon(x0 + sx / n, y0 + sy / n);
      const distKm = round(haversineKm(location.lat, location.lon, lat, lon));
      if (distKm > maxKm) continue;
      clusters.push({ distKm, direction: bearing(location.lat, location.lon, lat, lon), ageClass: newest, pixels: n });
    }
    clusters.sort((a, b) => a.distKm - b.distKm);
    return { clusters, nearestKm: clusters.length ? clusters[0].distKm : null };
  }
  function cropFrame(image, crop, quality = 85) {
    const { x, y, w, h } = crop;
    const out = new Uint8Array(w * h * 4);
    for (let row = 0; row < h; row++) {
      const from = ((y + row) * image.width + x) * 4;
      out.set(image.data.subarray(from, from + w * 4), row * w * 4);
    }
    return base64Encode(encodeJpeg(out, w, h, quality));
  }
  async function loadGlm(cfg, location, now, previous) {
    const latest = await fetchLatestGlm(cfg, now, previous == null ? void 0 : previous.file);
    if (!latest) throw new Error(`No hay imágenes publicadas en las últimas ${cfg.lookbackMinutes / 60} horas`);
    if (latest.unchanged) return { data: previous, frame: null };
    const image = decodeJpeg(latest.bytes);
    const analysis = analyzeGlm(image.data, image.width, image.height, cfg, location);
    return {
      data: { file: latest.file, time: latest.time, ...analysis },
      frame: { time: latest.time, jpeg: cropFrame(image, cfg.crop) }
    };
  }

  // src/sources/metno.js
  async function fetchMetNo(location, { lastModified, contact } = {}) {
    var _a;
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${location.lat.toFixed(4)}&lon=${location.lon.toFixed(4)}`;
    const headers = { "User-Agent": contact ? `${APP_UA} (+${contact})` : APP_UA };
    if (lastModified) headers["If-Modified-Since"] = lastModified;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(2e4) });
    const expires = Date.parse((_a = res.headers.get("Expires")) != null ? _a : "") || Date.now() + 30 * 6e4;
    if (res.status === 304) return { notModified: true, expires };
    if (!res.ok) throw new Error(`HTTP ${res.status} desde api.met.no`);
    return {
      series: parseMetNo(await res.json()),
      expires,
      lastModified: res.headers.get("Last-Modified")
    };
  }
  function parseMetNo(json) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const hours = /* @__PURE__ */ new Map();
    for (const entry of json.properties.timeseries) {
      const t = Date.parse(entry.time);
      const inst = (_b = (_a = entry.data.instant) == null ? void 0 : _a.details) != null ? _b : {};
      const base = {
        temp: (_c = inst.air_temperature) != null ? _c : null,
        wind: inst.wind_speed != null ? inst.wind_speed * 3.6 : null,
        gust: inst.wind_speed_of_gust != null ? inst.wind_speed_of_gust * 3.6 : null
      };
      const n1 = entry.data.next_1_hours;
      const n6 = entry.data.next_6_hours;
      if (n1) {
        if (!hours.has(t)) hours.set(t, { ...base, precip: (_e = (_d = n1.details) == null ? void 0 : _d.precipitation_amount) != null ? _e : null, symbol: (_g = (_f = n1.summary) == null ? void 0 : _f.symbol_code) != null ? _g : "" });
      } else if (n6) {
        const p = (_h = n6.details) == null ? void 0 : _h.precipitation_amount;
        for (let k = 0; k < 6; k++) {
          const tk = t + k * HOUR;
          if (!hours.has(tk)) hours.set(tk, { ...base, precip: p != null ? p / 6 : null, symbol: (_j = (_i = n6.summary) == null ? void 0 : _i.symbol_code) != null ? _j : "" });
        }
      }
    }
    const times = [...hours.keys()].sort((a, b) => a - b);
    const col = (k) => times.map((t) => hours.get(t)[k]);
    const symbols = col("symbol");
    return {
      id: "metno",
      name: "MET Norway",
      origin: "Noruega",
      provider: "MET Norway",
      times,
      temp: col("temp"),
      precip: col("precip"),
      thunder: symbols.map((s) => s ? s.includes("thunder") : null),
      cape: times.map(() => null),
      li: times.map(() => null),
      wind: col("wind"),
      gust: col("gust"),
      snow: times.map(() => null)
    };
  }

  // src/sources/openmeteo.js
  var VARIABLES = [
    "temperature_2m",
    "precipitation",
    "weather_code",
    "cape",
    "lifted_index",
    "wind_speed_10m",
    "wind_gusts_10m",
    "snowfall"
  ];
  async function fetchOpenMeteo(location, models, hours, { apiKey } = {}) {
    const params = {
      latitude: location.lat,
      longitude: location.lon,
      hourly: VARIABLES.join(","),
      models: models.map((m) => m.id).join(","),
      forecast_hours: hours,
      past_hours: 0,
      timeformat: "unixtime",
      timezone: "GMT",
      wind_speed_unit: "kmh"
    };
    if (apiKey) params.apikey = apiKey;
    const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const host = apiKey ? "customer-api.open-meteo.com" : "api.open-meteo.com";
    const json = await fetchJson(`https://${host}/v1/forecast?${query}`, { retries: 2 });
    if (json.error) throw new Error(`Open-Meteo: ${json.reason}`);
    return parseOpenMeteo(json, models);
  }
  function parseOpenMeteo(json, models) {
    const times = json.hourly.time.map((t) => t * 1e3);
    return models.map((m) => {
      const get = (v) => {
        var _a;
        return ((_a = json.hourly[`${v}_${m.id}`]) != null ? _a : []).map((x) => x != null ? x : null);
      };
      const code = get("weather_code");
      return {
        id: m.id,
        name: m.name,
        origin: m.origin,
        provider: "Open-Meteo",
        times,
        temp: get("temperature_2m"),
        precip: get("precipitation"),
        // Códigos WMO 95, 96 y 99: tormenta eléctrica (con o sin granizo).
        thunder: code.map((c) => c === null ? null : c >= 95),
        cape: get("cape"),
        li: get("lifted_index"),
        wind: get("wind_speed_10m"),
        gust: get("wind_gusts_10m"),
        snow: get("snowfall")
      };
    }).filter((s) => s.precip.some((v) => v !== null));
  }

  // src/check.js
  var { LOCATION: LOCATION2, MODELS: MODELS2, DMC: DMC2, GLM: GLM2, STATIONS: STATIONS2, HORIZON_HOURS: HORIZON_HOURS2, OPEN_METEO_CACHE_MINUTES: OPEN_METEO_CACHE_MINUTES2, NOTIFY: NOTIFY2 } = config_exports;
  var STALE_LIMIT = 6 * HOUR;
  var MAX_EMAIL_RETRIES = 6;
  async function runCheck({ kv: kv2, mailer: mailer2, settings: settings2 = {}, now = Date.now() }) {
    const state = await kv2.get("state") || {};
    state.cache = state.cache || {};
    state.history = state.history || [];
    const sources = [];
    let newFrame = null;
    async function track(id, name, url, loader) {
      try {
        const { data, meta } = await loader();
        sources.push({ id, name, url, ok: true, ...meta });
        return data;
      } catch (e) {
        const cached = state.cache[id];
        if (cached && now - cached.fetchedAt < STALE_LIMIT) {
          sources.push({ id, name, url, ok: false, stale: true, fetchedAt: cached.fetchedAt, error: errorText(e) });
          return cached.data;
        }
        sources.push({ id, name, url, ok: false, error: errorText(e) });
        return null;
      }
    }
    const fresh = (id, data, detail) => {
      state.cache[id] = { fetchedAt: now, data };
      return { data, meta: { fetchedAt: now, detail } };
    };
    const reuse = (id, detail) => ({ data: state.cache[id].data, meta: { fetchedAt: state.cache[id].fetchedAt, detail } });
    const models = await track("openmeteo", `Open-Meteo (${MODELS2.length} modelos globales)`, "https://open-meteo.com", async () => {
      const c = state.cache.openmeteo;
      if (c && now - c.fetchedAt < OPEN_METEO_CACHE_MINUTES2 * 6e4) return reuse("openmeteo", `${c.data.length} modelos`);
      const data = await fetchOpenMeteo(LOCATION2, MODELS2, HORIZON_HOURS2 + 2, { apiKey: settings2.openMeteoKey });
      return fresh("openmeteo", data, `${data.length} modelos`);
    });
    const metno = await track("metno", "MET Norway", "https://api.met.no", async () => {
      const c = state.cache.metno;
      if (c && c.expires > now) return reuse("metno", "sin cambios");
      const r = await fetchMetNo(LOCATION2, { lastModified: c && c.lastModified, contact: settings2.contact || settings2.dashboardUrl });
      if (r.notModified && c) {
        c.expires = r.expires;
        return reuse("metno", "sin cambios");
      }
      const out = fresh("metno", trimSeries(r.series, now - HOUR, now + (HORIZON_HOURS2 + 6) * HOUR), "pronóstico horario");
      Object.assign(state.cache.metno, { expires: r.expires, lastModified: r.lastModified });
      return out;
    });
    const metars = await track("metar", "METAR Tobalaba y Pudahuel", "https://aviationweather.gov", async () => {
      const data = await fetchMetars(STATIONS2.metar, LOCATION2);
      return fresh("metar", data, `${data.length} reportes de las últimas 3 h`);
    });
    const tafs = await track("taf", "TAF Pudahuel y Tobalaba", "https://aviationweather.gov", async () => {
      const data = await fetchTafs(STATIONS2.taf);
      return fresh("taf", data, data.length === 1 ? "1 pronóstico" : `${data.length} pronósticos`);
    });
    const dmcParsed = await track("dmc", "DMC · Avisos, Alertas y Alarmas", DMC2.pageUrl, async () => {
      const raw = await fetchDmc(settings2.dmcUrl || DMC2.url);
      const sig = dmcSignature(raw);
      const cached = state.cache.dmc && state.cache.dmc.data;
      const data = cached && cached.sig === sig ? cached : { sig, ...parseDmc(raw, LOCATION2, DMC2) };
      return fresh("dmc", data, raw.fecha_actualizacion ? `publicado ${raw.fecha_actualizacion}` : "");
    });
    const glm = await track("glm", "DMC · Rayos por satélite (GOES-19)", GLM2.pageUrl, async () => {
      const previous = state.cache.glm && state.cache.glm.data;
      const r = await loadGlm(GLM2, LOCATION2, now, previous);
      const n = r.data.clusters.length;
      const detail = n ? `${n} núcleo${n === 1 ? "" : "s"} con rayos a menos de ${GLM2.radiiKm[0]} km` : `sin rayos a menos de ${GLM2.radiiKm[0]} km`;
      if (!r.frame) return reuse("glm", detail);
      newFrame = r.frame;
      return fresh("glm", r.data, detail);
    });
    const dmc = dmcParsed ? { ...dmcParsed, sig: void 0, alerts: activeAlerts(dmcParsed.alerts, now) } : null;
    const forecasts = [...models || [], ...metno ? [metno] : []];
    const result = evaluate({
      now,
      forecasts,
      metars: metars || [],
      tafs: tafs || [],
      dmcAlerts: dmc ? dmc.alerts : [],
      glm,
      cfg: config_exports
    });
    const degraded = !(models && models.length);
    const dmcAlerts = dmc ? dmc.alerts : [];
    const { changes, notified, dmcSeen } = diffAlerts(state, result, dmcAlerts, now, NOTIFY2, degraded);
    state.notified = notified;
    state.dmcSeen = dmcSeen;
    if (changes.length) {
      const email = buildAlertEmail(changes, result, dmcAlerts, { location: LOCATION2, dashboardUrl: settings2.dashboardUrl });
      const sent = await sendSafely(mailer2, email);
      state.lastEmail = { at: now, subject: email.subject, ok: sent.ok, skipped: !!sent.skipped, error: sent.error || null };
      state.retryEmail = sent.ok || sent.skipped ? null : { ...email, attempts: 1 };
      for (const c of changes) {
        state.history.push({
          at: now,
          type: c.type,
          hazardId: c.hazardId,
          from: c.from == null ? null : c.from,
          to: c.to || 0,
          text: describeChange(c, result, dmcAlerts, LOCATION2.timezone),
          emailed: sent.ok
        });
      }
      state.history = state.history.slice(-NOTIFY2.historySize);
    } else if (state.retryEmail && state.retryEmail.attempts < MAX_EMAIL_RETRIES) {
      const { attempts, ...email } = state.retryEmail;
      const sent = await sendSafely(mailer2, email);
      state.lastEmail = { at: now, subject: email.subject, ok: sent.ok, skipped: !!sent.skipped, error: sent.error || null, retry: attempts };
      state.retryEmail = sent.ok || sent.skipped ? null : { ...email, attempts: attempts + 1 };
    }
    if (newFrame) {
      const frames = (await kv2.get("glm-frames") || []).filter((f) => f.time !== newFrame.time);
      frames.push(newFrame);
      frames.sort((a, b) => a.time - b.time);
      await kv2.put("glm-frames", frames.slice(-GLM2.frames));
    }
    const status = {
      version: 2,
      generatedAt: now,
      location: LOCATION2,
      horizonHours: HORIZON_HOURS2,
      thresholds: THRESHOLDS,
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
      dmcPage: DMC2.pageUrl,
      glm: glm ? glmSummary(glm) : null,
      meteoredUrl: METEORED_URL,
      sources,
      degraded,
      changes: changes.length,
      history: [...state.history].reverse().slice(0, 50),
      email: { configured: !!mailer2.configured, paused: !!mailer2.paused, last: state.lastEmail || null }
    };
    await kv2.put("state", state);
    await kv2.put("status", status);
    return status;
  }
  function glmSummary(glm) {
    const { ax, bx, ay, by } = GLM2.projection;
    const kmPerDegLon = 111.32 * Math.cos(LOCATION2.lat * Math.PI / 180);
    return {
      time: glm.time,
      file: glm.file,
      clusters: glm.clusters,
      nearestKm: glm.nearestKm,
      radiiKm: GLM2.radiiKm,
      maxAgeMinutes: GLM2.maxAgeMinutes,
      pageUrl: GLM2.pageUrl,
      crop: { w: GLM2.crop.w, h: GLM2.crop.h },
      cerro: { x: ax * LOCATION2.lon + bx - GLM2.crop.x, y: ay * LOCATION2.lat + by - GLM2.crop.y },
      pxPerKm: { x: Math.abs(ax) / kmPerDegLon, y: Math.abs(ay) / 110.57 }
    };
  }
  async function sendSafely(mailer2, email) {
    if (!mailer2 || !mailer2.configured) return { ok: false, skipped: true, error: "Correo no configurado" };
    if (mailer2.paused) return { ok: false, skipped: true, error: "Correos en pausa" };
    try {
      return await mailer2.send(email);
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
    if (e && e.name === "TimeoutError") return "Tiempo de espera agotado";
    const msg = String(e && e.message || e);
    if (/DNS|Address unavailable|getaddrinfo|ENOTFOUND/i.test(msg)) return "No se pudo conectar con el servidor";
    return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
  }

  // src/gas/main.js
  var PANEL_URL = "https://javiersalgadokaiser-dev.github.io/alerta-san-cristobal/";
  var CHUNK_PROPS = 4e3;
  var CHUNK_CACHE = 5e4;
  var CACHE_SECONDS = 6 * 3600;
  function chunkedStore(read, write, remove, size) {
    return {
      get(key) {
        const n = Number(read(`${key}#n`));
        if (!n) return null;
        let text = "";
        for (let i = 0; i < n; i++) {
          const part = read(`${key}#${i}`);
          if (part == null) return null;
          text += part;
        }
        return JSON.parse(text);
      },
      put(key, value) {
        const text = JSON.stringify(value);
        const parts = {};
        let n = 0;
        for (let i = 0; i < text.length; i += size) parts[`${key}#${n++}`] = text.slice(i, i + size);
        const old = Number(read(`${key}#n`)) || 0;
        parts[`${key}#n`] = String(n);
        write(parts);
        const stale = [];
        for (let i = n; i < old; i++) stale.push(`${key}#${i}`);
        if (stale.length) remove(stale);
      }
    };
  }
  function propsStore() {
    const p = PropertiesService.getScriptProperties();
    return chunkedStore(
      (k) => p.getProperty(k),
      (obj) => p.setProperties(obj, false),
      (keys) => keys.forEach((k) => p.deleteProperty(k)),
      CHUNK_PROPS
    );
  }
  function cacheStore() {
    const c = CacheService.getScriptCache();
    return chunkedStore(
      (k) => c.get(k),
      (obj) => c.putAll(obj, CACHE_SECONDS),
      (keys) => c.removeAll(keys),
      CHUNK_CACHE
    );
  }
  function kv() {
    const props = propsStore();
    const cache = cacheStore();
    const pick = (key) => key === "glm-frames" ? cache : props;
    return { get: (key) => pick(key).get(key), put: (key, value) => pick(key).put(key, value) };
  }
  function setting(name) {
    const v = PropertiesService.getScriptProperties().getProperty(name);
    return v ? String(v).trim() : "";
  }
  function recipients() {
    const list2 = setting("CORREOS").split(/[,;\s]+/).filter((s) => s.includes("@"));
    if (list2.length) return list2;
    const me = Session.getEffectiveUser().getEmail();
    return me ? [me] : [];
  }
  var mailer = {
    get configured() {
      return recipients().length > 0;
    },
    // CORREOS_PAUSADOS = si: se sigue revisando, pero no se envía nada
    get paused() {
      return setting("CORREOS_PAUSADOS").toLowerCase() === "si";
    },
    send({ subject, html, text }) {
      const to = recipients();
      if (MailApp.getRemainingDailyQuota() < to.length) return { ok: false, error: "Se agotó la cuota diaria de correos de Google" };
      MailApp.sendEmail({ to: to.join(","), subject, htmlBody: html, body: text, name: "Alerta San Cristóbal" });
      return { ok: true, to: to.length };
    }
  };
  function settings() {
    return {
      dashboardUrl: setting("URL_PANEL") || PANEL_URL,
      contact: setting("URL_PANEL") || PANEL_URL,
      // Clave del plan pagado de Open-Meteo (opcional; necesaria para uso comercial)
      openMeteoKey: setting("OPENMETEO_APIKEY")
    };
  }
  async function revisar() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(2e4)) {
      console.log("Ya hay una revisión en curso; se omite esta.");
      return null;
    }
    const t0 = Date.now();
    try {
      const status = await runCheck({ kv: kv(), mailer, settings: settings(), now: Date.now() });
      PropertiesService.getScriptProperties().deleteProperty("ULTIMO_ERROR");
      const fallas = status.sources.filter((s) => !s.ok).map((s) => `${s.name}: ${s.error}`);
      console.log(`Revisión lista en ${Date.now() - t0} ms. Estado: ${status.overall.levelName} · ${status.overall.headline}`);
      if (fallas.length) console.log(`Fuentes con problemas:
- ${fallas.join("\n- ")}`);
      if (status.changes) console.log(`Cambios: ${status.changes}. Correo: ${status.email.last ? status.email.last.subject : "—"}`);
      return status;
    } catch (e) {
      const msg = String(e && e.stack || e);
      PropertiesService.getScriptProperties().setProperty("ULTIMO_ERROR", JSON.stringify({ at: Date.now(), message: msg.slice(0, 1500) }));
      console.error(`La revisión falló: ${msg}`);
      return null;
    } finally {
      lock.releaseLock();
    }
  }
  async function instalar() {
    for (const t of ScriptApp.getProjectTriggers()) {
      if (t.getHandlerFunction() === "revisar") ScriptApp.deleteTrigger(t);
    }
    ScriptApp.newTrigger("revisar").timeBased().everyMinutes(10).create();
    console.log("Activador creado: revisar() se ejecutará cada 10 minutos.");
    console.log(`Los correos se enviarán a: ${recipients().join(", ") || "(nadie)"}`);
    await revisar();
  }
  function desinstalar() {
    let n = 0;
    for (const t of ScriptApp.getProjectTriggers()) {
      if (t.getHandlerFunction() === "revisar") {
        ScriptApp.deleteTrigger(t);
        n++;
      }
    }
    console.log(n ? "Revisiones automáticas detenidas." : "No había revisiones automáticas activas.");
  }
  function pausarCorreos() {
    PropertiesService.getScriptProperties().setProperty("CORREOS_PAUSADOS", "si");
    console.log("Correos en pausa. Las revisiones y la app siguen funcionando. Para reactivarlos, ejecuta reanudarCorreos().");
  }
  function reanudarCorreos() {
    PropertiesService.getScriptProperties().deleteProperty("CORREOS_PAUSADOS");
    console.log(`Correos reactivados. Se enviarán a: ${recipients().join(", ")}`);
  }
  async function probarCorreo() {
    const status = kv().get("status") || await revisar();
    if (!status) {
      console.error("No hay estado para incluir: revisa el error de la revisión.");
      return;
    }
    const r = mailer.send(buildTestEmail(status, { location: LOCATION, dashboardUrl: settings().dashboardUrl }));
    console.log(r.ok ? `Correo de prueba enviado a ${recipients().join(", ")}` : `No se pudo enviar: ${r.error}`);
  }
  function verEstado() {
    const s = kv().get("status");
    if (!s) return console.log("Aún no hay ninguna revisión. Ejecuta instalar().");
    console.log(`Última revisión: ${new Date(s.generatedAt).toLocaleString("es-CL", { timeZone: LOCATION.timezone })}`);
    console.log(`Estado: ${s.overall.levelName} · ${s.overall.headline}`);
    console.log(mailer.paused ? "Correos: EN PAUSA (ejecuta reanudarCorreos para activarlos)" : `Correos: activos, a ${recipients().join(", ")}`);
    for (const h of s.hazards) console.log(`  ${h.name}: ${h.levelName}`);
    for (const src of s.sources) console.log(`  [${src.ok ? "OK" : "FALLA"}] ${src.name}${src.ok ? "" : `: ${src.error}`}`);
    const err = setting("ULTIMO_ERROR");
    if (err) console.log(`Último error: ${err}`);
  }
  function doGet(e) {
    const accion = e && e.parameter && e.parameter.accion || "estado";
    let body;
    if (accion === "rayos") {
      body = { frames: kv().get("glm-frames") || [] };
    } else {
      body = kv().get("status") || { pendiente: true, mensaje: "Aún no hay una primera revisión. En Apps Script, ejecuta instalar()." };
      const err = setting("ULTIMO_ERROR");
      if (err) body.ultimoError = JSON.parse(err);
    }
    return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
  }
  return __toCommonJS(main_exports);
})();


// --- Funciones visibles en Apps Script ---------------------------------------
function doGet(e) { return AlertaSC.doGet(e); }
function revisar() { return AlertaSC.revisar(); }
function instalar() { return AlertaSC.instalar(); }
function probarCorreo() { return AlertaSC.probarCorreo(); }
function verEstado() { return AlertaSC.verEstado(); }
function desinstalar() { return AlertaSC.desinstalar(); }
function pausarCorreos() { return AlertaSC.pausarCorreos(); }
function reanudarCorreos() { return AlertaSC.reanudarCorreos(); }
