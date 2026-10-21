// Pruebas de los casos críticos: node --test test/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as cfg from '../src/config.js';
import { evaluate } from '../src/engine.js';
import { diffAlerts } from '../src/notify.js';
import { parseMetar, parseTaf } from '../src/sources/aviation.js';
import { activeAlerts, matchZone, parseDmc, parseDmcTime } from '../src/sources/dmc.js';
import { analyzeGlm, classifyPixel, glmFileName } from '../src/sources/glm.js';
import { HOUR, base64Encode } from '../src/util.js';

const NOW = Date.UTC(2026, 9, 20, 18, 0); // 20-oct-2026 15:00 en Santiago
const tz = cfg.LOCATION.timezone;

function metar(raw, icao = 'SCTB', minutesAgo = 10) {
  const coords = { SCTB: [-33.4561, -70.5468], SCEL: [-33.393, -70.7858] }[icao];
  return parseMetar({ icaoId: icao, rawOb: raw, obsTime: (NOW - minutesAgo * 60000) / 1000, lat: coords[0], lon: coords[1], temp: 15 }, cfg.LOCATION);
}

/** Modelo sintético: `fn(h)` devuelve los valores de la hora h. */
function model(id, fn) {
  const times = Array.from({ length: 74 }, (_, i) => Math.floor(NOW / HOUR) * HOUR + i * HOUR);
  const rows = times.map((_, h) => ({ temp: 15, precip: 0, thunder: false, cape: 0, gust: 5, wind: 3, snow: 0, uv: null, ...fn(h) }));
  const col = (k) => rows.map((r) => r[k]);
  return { id, name: id, times, temp: col('temp'), precip: col('precip'), thunder: col('thunder'), cape: col('cape'), gust: col('gust'), wind: col('wind'), snow: col('snow'), uv: col('uv') };
}
const calm = (n) => Array.from({ length: n }, (_, i) => model(`m${i}`, () => ({})));
const level = (result, id) => result.hazards.find((h) => h.id === id).level;

test('METAR: tormenta, cumulonimbus, ráfagas y lluvia intensa', () => {
  const m = metar('METAR SCTB 201750Z 27015G30KT 5000 +TSRA FEW030CB 15/12 Q1005');
  assert.equal(m.thunder, true);
  assert.equal(m.cb, true);
  assert.equal(m.heavyRain, true);
  assert.equal(m.gustMs, 15.4); // 30 nudos
  assert.equal(m.distKm, 8);
});

test('METAR: la tendencia TEMPO TSRA no se confunde con tormenta observada', () => {
  const m = metar('METAR SCEL 201800Z 18010KT 9999 SCT040 18/09 Q1010 TEMPO TSRA');
  assert.equal(m.thunder, false);
  assert.equal(m.thunderTrend, true);
  assert.equal(metar('METAR SCEL 201800Z 18010KT 9999 FEW040 18/09 Q1010 NOSIG').thunderTrend, false);
});

test('Tormenta observada a 8 km del cerro activa Alarma', () => {
  const r = evaluate({ now: NOW, forecasts: calm(6), metars: [metar('METAR SCTB 201750Z 27010KT 9999 TS FEW040CB 18/09 Q1010')], cfg });
  assert.equal(level(r, 'tormenta'), 3);
  assert.equal(r.overall.hazardId, 'tormenta');
});

test('Una observación de hace más de 90 minutos ya no cuenta', () => {
  const r = evaluate({ now: NOW, forecasts: calm(6), metars: [metar('METAR SCTB 201600Z 27010KT 9999 TS 18/09 Q1010', 'SCTB', 120)], cfg });
  assert.equal(level(r, 'tormenta'), 0);
});

test('Tormenta según modelos: 1 fuente no alcanza, 2 es Aviso, la mitad es Alerta', () => {
  const storm = (k) => [...calm(6 - k), ...Array.from({ length: k }, (_, i) => model(`s${i}`, (h) => ({ thunder: h === 20 })))];
  assert.equal(level(evaluate({ now: NOW, forecasts: storm(1), cfg }), 'tormenta'), 0);
  assert.equal(level(evaluate({ now: NOW, forecasts: storm(2), cfg }), 'tormenta'), 1);
  assert.equal(level(evaluate({ now: NOW, forecasts: storm(3), cfg }), 'tormenta'), 2);
});

test('Lluvia: niveles según la mediana de 24 h', () => {
  const rain = (mmPerHour) => Array.from({ length: 5 }, (_, i) => model(`r${i}`, (h) => ({ precip: h >= 10 && h < 34 ? mmPerHour : 0 })));
  assert.equal(level(evaluate({ now: NOW, forecasts: rain(0.2), cfg }), 'lluvia'), 0); // 4.8 mm
  assert.equal(level(evaluate({ now: NOW, forecasts: rain(0.5), cfg }), 'lluvia'), 1); // 12 mm
  assert.equal(level(evaluate({ now: NOW, forecasts: rain(1.5), cfg }), 'lluvia'), 2); // 36 mm
  assert.equal(level(evaluate({ now: NOW, forecasts: rain(2.5), cfg }), 'lluvia'), 3); // 60 mm
});

test('Viento (m/s): un modelo extremo no basta, cuenta la mediana; Alerta desde 15 m/s', () => {
  const f = [...calm(4), model('x', () => ({ gust: 26 }))];
  assert.equal(level(evaluate({ now: NOW, forecasts: f, cfg }), 'viento'), 0);
  const g = (v) => Array.from({ length: 5 }, (_, i) => model(`g${i}`, () => ({ gust: v })));
  assert.equal(level(evaluate({ now: NOW, forecasts: g(11), cfg }), 'viento'), 0);
  assert.equal(level(evaluate({ now: NOW, forecasts: g(12.5), cfg }), 'viento'), 1);
  assert.equal(level(evaluate({ now: NOW, forecasts: g(15), cfg }), 'viento'), 2);
  assert.equal(level(evaluate({ now: NOW, forecasts: g(21), cfg }), 'viento'), 3);
});

test('TAF con tormenta probable (PROB30) es Aviso', () => {
  const taf = parseTaf({
    icaoId: 'SCEL', issueTime: new Date(NOW).toISOString(), validTimeTo: (NOW + 24 * HOUR) / 1000, rawTAF: 'TAF SCEL ...',
    fcsts: [{ timeFrom: (NOW + 2 * HOUR) / 1000, timeTo: (NOW + 6 * HOUR) / 1000, fcstChange: 'PROB', probability: 30, wxString: 'TSRA', clouds: [] }],
  });
  assert.equal(level(evaluate({ now: NOW, forecasts: calm(6), tafs: [taf], cfg }), 'tormenta'), 1);
});

test('Notificaciones: sube de inmediato, baja solo tras 3 horas sin oscilar', () => {
  const at = (lvl) => ({ hazards: [{ id: 'tormenta', level: lvl }] });
  let state = {};
  const step = (lvl, t) => {
    const d = diffAlerts(state, at(lvl), [], t, cfg.NOTIFY);
    state = { notified: d.notified, dmcSeen: d.dmcSeen };
    return d.changes.map((c) => `${c.type}:${c.to}`);
  };
  assert.deepEqual(step(2, NOW), ['sube:2']);
  assert.deepEqual(step(2, NOW + 10 * 60000), []); // sin repetir
  assert.deepEqual(step(0, NOW + 1 * HOUR), []); // baja, pero espera
  assert.deepEqual(step(2, NOW + 2 * HOUR), []); // vuelve: no hay correo nuevo
  assert.deepEqual(step(0, NOW + 3 * HOUR), []);
  assert.deepEqual(step(0, NOW + 5 * HOUR), []);
  assert.deepEqual(step(0, NOW + 6 * HOUR), ['fin:0']); // 3 h seguidas en 0
  assert.deepEqual(step(3, NOW + 7 * HOUR), ['sube:3']);
});

test('Notificaciones: sin pronósticos (fuente caída) no se declara fin de alerta', () => {
  const state = { notified: { tormenta: { level: 2, at: NOW, lowerSince: NOW - 4 * HOUR } } };
  const d = diffAlerts(state, { hazards: [{ id: 'tormenta', level: 0 }] }, [], NOW, cfg.NOTIFY, true);
  assert.deepEqual(d.changes, []);
});

test('Notificaciones: un aviso DMC nuevo se informa una sola vez', () => {
  const alert = { key: '5881:A561-3/2026', hazard: 'tormenta', effectiveLevel: 1 };
  const first = diffAlerts({}, { hazards: [] }, [alert], NOW, cfg.NOTIFY);
  assert.deepEqual(first.changes.map((c) => c.type), ['dmc']);
  const second = diffAlerts({ dmcSeen: first.dmcSeen }, { hazards: [] }, [alert], NOW, cfg.NOTIFY);
  assert.deepEqual(second.changes, []);
});

test('DMC: fechas, zonas y días de la tabla', () => {
  assert.equal(parseDmcTime('la tarde del martes 20 de octubre del 2026', tz, 'start'), Date.UTC(2026, 9, 20, 15));
  assert.equal(parseDmcTime('la noche del martes 20 de octubre del 2026', tz, 'end'), Date.UTC(2026, 9, 21, 3));

  const zone = (data) => matchZone({ tipoZonaAfecta: 'zonas', dataZonaAfecta: data }, cfg.LOCATION, cfg.DMC);
  assert.equal(zone('05m_Cordillera_Costa,05m_Valle_Longitudinal'), 'zona');
  assert.equal(zone('05m_Precordillera'), 'cercana');
  assert.equal(zone('05m_Cordillera'), null);
  assert.equal(matchZone({ tipoZonaAfecta: 'regiones', dataZonaAfecta: '05,05m' }, cfg.LOCATION, cfg.DMC), 'region');
  const square = '-33.3,-70.7|-33.3,-70.5|-33.5,-70.5|-33.5,-70.7';
  assert.equal(matchZone({ tipoZonaAfecta: 'area', dataZonaAfecta: square }, cfg.LOCATION, cfg.DMC), 'area');

  const json = {
    fecha_actualizacion: '2026-10-19 17:00', Avisos: 1, Alertas: 0, Alarmas: 0,
    AAA: [{
      id: '1', tipo: 'Aviso', codigoMeteo: 'A1/2026', emision: '', fenomeno: 'Tormentas El&eacute;ctricas',
      desde: 'la tarde del lunes 19 de octubre del 2026', hasta: 'la noche del jueves 22 de octubre del 2026',
      tipoZonaAfecta: 'zonas', dataZonaAfecta: '05m_Valle_Longitudinal', textoZonaAfecta: 'Metropolitana (Valle)',
      tablaHTML: "<table><tr><th colspan='5'>Regi&oacute;n: Metropolitana</th></tr><tr><th>Zona</th><th>lunes 19</th><th>martes 20</th><th>mi&eacute;rcoles 21</th><th>jueves 22</th></tr><tr><td>Valle</td><td>SI</td><td>SI</td><td>--</td><td>--</td></tr></table>",
      titulo: 'Probables Tormentas El&eacute;ctricas', observacion: '', tablaTitulo: '', condicionSinoptica: '',
    }],
  };
  const [a] = parseDmc(json, cfg.LOCATION, cfg.DMC).alerts;
  assert.equal(a.hazard, 'tormenta');
  assert.equal(a.end, Date.UTC(2026, 9, 21, 3)); // acotado al martes 20 (Valle)
  assert.equal(activeAlerts([a], Date.UTC(2026, 9, 21, 4)).length, 1);
  assert.equal(activeAlerts([a], Date.UTC(2026, 9, 21, 6)).length, 0);
});

// --- Rayos por satélite (imágenes GLM de la DMC) ------------------------------

/** Imagen sintética gris con puntos de rayo en (lat, lon) y el color de su antigüedad. */
function glmImage(dots, width = 1250, height = 1046) {
  const data = new Uint8Array(width * height * 4).fill(150);
  const colors = [[0, 241, 236], [0, 170, 242], [0, 0, 246], [19, 9, 180]];
  const { ax, bx, ay, by } = cfg.GLM.projection;
  for (const { lat, lon, age = 0 } of dots) {
    const cx = Math.round(ax * lon + bx);
    const cy = Math.round(ay * lat + by);
    for (let y = cy - 3; y <= cy + 3; y++) {
      for (let x = cx - 3; x <= cx + 3; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > 9) continue;
        data.set([...colors[age], 255], (y * width + x) * 4);
      }
    }
  }
  return { data, width, height };
}
const glmLevel = (dots, imageAgeMin = 40) => {
  const img = glmImage(dots);
  const a = analyzeGlm(img.data, img.width, img.height, cfg.GLM, cfg.LOCATION);
  const glm = { time: NOW - imageAgeMin * 60000, file: 'x', ...a };
  return { analysis: a, level: level(evaluate({ now: NOW, forecasts: calm(6), glm, cfg }), 'tormenta') };
};

test('Rayos: colores de la DMC y fondo gris', () => {
  assert.equal(classifyPixel(0, 241, 236), 0);
  assert.equal(classifyPixel(0, 170, 242), 1);
  assert.equal(classifyPixel(0, 0, 246), 2);
  assert.equal(classifyPixel(19, 9, 180), 3);
  assert.equal(classifyPixel(200, 200, 205), -1); // nube
  assert.equal(classifyPixel(220, 20, 20), -1); // ciudad
  assert.equal(glmFileName(Date.UTC(2026, 9, 19, 23, 50)), '202610192350GLM_sudamerica.png.jpg');
});

test('Rayos: distancia, dirección y nivel según cercanía', () => {
  // ~0,27° al noreste ≈ 40 km; ~0,08° ≈ 11 km; ~0,6° ≈ 85 km
  const near = glmLevel([{ lat: -33.35, lon: -70.56 }]);
  assert.equal(near.analysis.clusters.length, 1);
  assert.equal(near.analysis.clusters[0].direction, 'noreste');
  assert.ok(near.analysis.clusters[0].distKm <= 15, `distancia ${near.analysis.clusters[0].distKm}`);
  assert.equal(near.level, 3);
  assert.equal(glmLevel([{ lat: -33.2, lon: -70.4 }]).level, 2);
  assert.equal(glmLevel([{ lat: -33.4, lon: -69.7 }]).level, 1);
  assert.equal(glmLevel([{ lat: -35.0, lon: -71.2 }]).level, 0); // Curicó, ~180 km
});

test('Rayos: el núcleo toma la clase de su rayo más reciente y una imagen vieja no cuenta', () => {
  const r = glmLevel([{ lat: -33.2, lon: -70.4, age: 3 }, { lat: -33.2, lon: -70.39, age: 1 }]);
  assert.equal(r.analysis.clusters.length, 1);
  assert.equal(r.analysis.clusters[0].ageClass, 1);
  assert.equal(glmLevel([{ lat: -33.35, lon: -70.56 }], 120).level, 0);
});

test('base64 sin Buffer ni btoa', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'Rayos ⚡ cerca']) {
    const bytes = new TextEncoder().encode(s);
    assert.equal(base64Encode(bytes), Buffer.from(bytes).toString('base64'));
  }
});

// --- Alerta temprana: cuándo podría empezar cada fenómeno ------------------------

const upcoming = (args) => evaluate({ now: NOW, cfg, ...args }).upcoming;

test('Alerta temprana: tormenta con hora de inicio y fuentes que coinciden', () => {
  const f = [...calm(4), model('ICON', (h) => ({ thunder: h >= 5 && h <= 7 })), model('GFS', (h) => ({ thunder: h >= 6 && h <= 8 }))];
  const [e] = upcoming({ forecasts: f });
  assert.equal(e.hazardId, 'tormenta');
  assert.equal(e.start, Math.floor(NOW / HOUR) * HOUR + 5 * HOUR);
  assert.match(e.text, /^Podría iniciar una tormenta eléctrica en el cerro hoy a las 20:00, según ICON \(20:00\) y GFS \(21:00\)\./);
  assert.match(e.text, /Mayor coincidencia hoy a las 21:00 \(2 de 6 fuentes\)/);
  assert.equal(e.confidence, 'media');
});

test('Alerta temprana: una tormenta observada va primero y se marca en curso', () => {
  const list = upcoming({ forecasts: calm(6), metars: [metar('METAR SCTB 201750Z 27010KT 9999 TS FEW040CB 18/09 Q1010')] });
  assert.equal(list[0].hazardId, 'tormenta');
  assert.equal(list[0].confidence, 'en curso');
  assert.match(list[0].text, /^Hay actividad eléctrica cerca del cerro: tormenta observada en Tobalaba/);
});

test('Alerta temprana: inicio de la lluvia y total esperado', () => {
  const f = Array.from({ length: 5 }, (_, i) => model(`r${i}`, (h) => ({ precip: h >= 10 && h < 20 ? 1.5 : 0 })));
  const [e] = upcoming({ forecasts: f });
  assert.equal(e.hazardId, 'lluvia');
  assert.match(e.text, /^Podría empezar a llover mañana a la 01:00, según 5 de 5 fuentes/);
  assert.match(e.text, /con unos 15 mm en total/);
  assert.equal(e.confidence, 'alta');
});

test('Alerta temprana: sin señales no hay avisos', () => {
  assert.deepEqual(upcoming({ forecasts: calm(6) }), []);
});

// --- Boletín de correo a las 7:00, 13:00 y 18:00 (hora de Santiago) ---------------

test('Boletín: solo a las 7:00, 13:00 y 18:00, una vez por horario', async () => {
  const { dueBulletin, nextBulletin } = await import('../src/notify.js');
  const at = (h, m) => Date.UTC(2026, 9, 21, h + 3, m); // octubre: Santiago = UTC-3
  assert.equal(dueBulletin(at(6, 55), null, cfg.NOTIFY, tz), null);
  assert.deepEqual(dueBulletin(at(7, 4), null, cfg.NOTIFY, tz), { key: '2026-10-21 07:00', label: '07:00' });
  assert.equal(dueBulletin(at(7, 14), '2026-10-21 07:00', cfg.NOTIFY, tz), null); // ya enviado
  assert.equal(dueBulletin(at(8, 30), null, cfg.NOTIFY, tz), null); // fuera de la ventana de 60 min
  assert.equal(dueBulletin(at(13, 9), '2026-10-21 07:00', cfg.NOTIFY, tz).label, '13:00');
  assert.equal(dueBulletin(at(18, 0), '2026-10-21 13:00', cfg.NOTIFY, tz).label, '18:00');
  assert.equal(dueBulletin(at(19, 10), null, cfg.NOTIFY, tz), null);
  assert.equal(nextBulletin(at(13, 30), cfg.NOTIFY, tz), at(18, 0));
  assert.equal(nextBulletin(at(19, 0), cfg.NOTIFY, tz), Date.UTC(2026, 9, 22, 10, 0)); // mañana 7:00
});

// --- Radiación UV -----------------------------------------------------------------

test('UV: Aviso desde 8 (muy alto), Alerta desde 11 (extremo), nunca Alarma', () => {
  const uv = (v) => [...calm(5), model('GFS', (h) => ({ uv: h === 20 ? v : 0 }))];
  assert.equal(level(evaluate({ now: NOW, forecasts: uv(7), cfg }), 'uv'), 0);
  assert.equal(level(evaluate({ now: NOW, forecasts: uv(9), cfg }), 'uv'), 1);
  assert.equal(level(evaluate({ now: NOW, forecasts: uv(12), cfg }), 'uv'), 2);
  assert.equal(level(evaluate({ now: NOW, forecasts: uv(15), cfg }), 'uv'), 2);
  const hz = evaluate({ now: NOW, forecasts: uv(12), cfg }).hazards.find((h) => h.id === 'uv');
  assert.match(hz.headline, /Índice UV de hasta 12 \(extremo\) según GFS 12/);
});
