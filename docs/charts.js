// Gráficos horarios en SVG, sin librerías: columnas, línea con franja de rango,
// varias líneas (una por fuente) y carriles. Todos comparten el eje de tiempo y
// el cursor con tooltip (ratón, toque y teclado).
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function text(attrs, content) {
  const t = svgEl('text', attrs);
  t.textContent = content;
  return t;
}

/** Rectángulo con las esquinas superiores redondeadas (columnas). */
function topRounded(x, top, w, base, radius) {
  const r = Math.min(radius, w / 2, base - top);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

/** Trazo de una serie con huecos donde no hay dato. */
function linePath(values, x, y) {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) return (pen = false);
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/**
 * Base común: SVG adaptable al ancho, eje X por horas con separadores de día,
 * franjas (bands), umbrales, cursor y tooltip.
 *   opts: { times, tz, ariaLabel, height, left, yMin, yMax, ticks, format,
 *           thresholds, bands: [{ from, to, label, level }], tooltip(i) }
 *   drawMarks(svg, g) dibuja las marcas y puede devolver { highlight(i) }.
 */
function timeChart(container, opts, drawMarks) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const svg = svgEl('svg', { role: 'img', 'aria-label': opts.ariaLabel, tabindex: '0', style: 'touch-action: pan-y' });
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  wrap.append(svg, tip);
  container.append(wrap);

  const n = opts.times.length;
  const fmt = (o) => new Intl.DateTimeFormat('es-CL', { timeZone: opts.tz, ...o });
  const dayFmt = fmt({ weekday: 'short', day: 'numeric' });
  const hourFmt = fmt({ hour: 'numeric', hourCycle: 'h23' });
  const tipFmt = fmt({ weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const localHour = opts.times.map((t) => Number(hourFmt.format(new Date(t))));
  const t0 = opts.times[0];
  const step = n > 1 ? opts.times[1] - t0 : 3600000;

  let geom = null;
  let marks = null;
  let cross = null;
  let active = null;
  let lastWidth = 0;

  function draw() {
    const W = Math.max(260, Math.round(wrap.clientWidth));
    const H = opts.height ?? 196;
    const m = { t: 18, r: 10, b: 26, l: opts.left ?? 34 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const slot = pw / n;
    const base = m.t + ph;
    const yMin = opts.yMin ?? 0;
    const yMax = opts.yMax ?? 1;
    const y = (v) => base - ((Math.max(yMin, Math.min(v, yMax)) - yMin) / (yMax - yMin)) * ph;
    const cx = (i) => m.l + (i + 0.5) * slot;
    const xAt = (t) => m.l + Math.max(0, Math.min(n, (t - t0) / step)) * slot;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.replaceChildren();
    geom = { m, W, H, pw, ph, slot, base, y, cx, xAt, yMin, yMax };

    // Franjas de tiempo (p. ej. periodo de un aviso DMC), bajo todo lo demás
    for (const b of opts.bands ?? []) {
      const x1 = xAt(b.from);
      const x2 = xAt(b.to);
      if (x2 - x1 < 1) continue;
      svg.append(svgEl('rect', { class: `band-period lvl-${b.level}`, x: x1, y: m.t, width: x2 - x1, height: ph }));
      if (x2 - x1 > 60) svg.append(text({ class: 'band-label', x: x1 + 4, y: m.t + 11 }, b.label));
    }

    // Rejilla y eje Y
    for (const v of opts.ticks ?? []) {
      if (v > yMin) svg.append(svgEl('line', { class: 'gridline', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      svg.append(text({ class: 'tick', x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, opts.format(v)));
    }

    // Separadores de día y etiquetas del eje X (los días tienen prioridad)
    const labels = [];
    for (let i = 1; i < n; i++) {
      if (localHour[i] !== 0) continue;
      const x = m.l + i * slot;
      svg.append(svgEl('line', { class: 'gridline', x1: x, x2: x, y1: m.t, y2: base }));
      labels.push({ x: x + 3, text: dayFmt.format(new Date(opts.times[i])).replace(/\./g, ''), cls: 'day' });
    }
    const extra = [{ x: m.l, text: 'Ahora', cls: 'day' }];
    if (slot * 12 > 70) {
      for (let i = 0; i < n; i++) if (localHour[i] === 12) extra.push({ x: m.l + i * slot + 3, text: '12:00', cls: 'tick' });
    }
    for (const l of extra) if (labels.every((p) => Math.abs(p.x - l.x) > 50)) labels.push(l);
    for (const l of labels) svg.append(text({ class: l.cls, x: l.x, y: H - 8 }, l.text));

    // Umbrales
    for (const th of opts.thresholds ?? []) {
      if (th.value > yMax) continue;
      svg.append(svgEl('line', { class: 'threshold', x1: m.l, x2: W - m.r, y1: y(th.value), y2: y(th.value) }));
      svg.append(text({ class: 'thr-label', x: W - m.r, y: y(th.value) - 4, 'text-anchor': 'end' }, th.label));
    }

    marks = drawMarks(svg, geom) || null;
    if (opts.baseline !== false) svg.append(svgEl('line', { class: 'baseline', x1: m.l, x2: W - m.r, y1: base, y2: base }));

    cross = svgEl('line', { class: 'crosshair', x1: 0, x2: 0, y1: m.t, y2: base, visibility: 'hidden' });
    svg.append(cross);
    if (active != null) show(active);
  }

  function show(i) {
    if (!geom) return;
    active = i;
    const x = geom.cx(i);
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    cross.setAttribute('visibility', 'visible');
    wrap.classList.add('hovering');
    marks?.highlight?.(i);

    const time = document.createElement('div');
    time.className = 'tip-time';
    time.textContent = tipFmt.format(new Date(opts.times[i]));
    const rows = opts.tooltip(i).map((r) => {
      const row = document.createElement('div');
      row.className = `tip-row${r.dim ? ' dim' : ''}`;
      if (r.key) {
        const key = document.createElement('i');
        key.className = 'tip-key';
        if (r.color) key.style.background = r.color;
        row.append(key);
      }
      row.append(Object.assign(document.createElement('strong'), { textContent: r.value }));
      row.append(Object.assign(document.createElement('span'), { textContent: r.label }));
      return row;
    });
    tip.replaceChildren(time, ...rows);
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = x + 12;
    if (left + tw > geom.W) left = x - 12 - tw;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${geom.m.t}px`;
  }

  function hide() {
    active = null;
    tip.hidden = true;
    cross?.setAttribute('visibility', 'hidden');
    wrap.classList.remove('hovering');
    marks?.highlight?.(null);
  }

  function indexAt(e) {
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * geom.W) / rect.width;
    const i = Math.floor((x - geom.m.l) / geom.slot);
    return i >= 0 && i < n ? i : null;
  }

  const onPointer = (e) => {
    const i = indexAt(e);
    i == null ? hide() : show(i);
  };
  svg.addEventListener('pointermove', onPointer);
  svg.addEventListener('pointerdown', onPointer);
  svg.addEventListener('pointerleave', () => document.activeElement !== svg && hide());
  svg.addEventListener('focus', () => show(active ?? 0));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step) show(Math.min(n - 1, Math.max(0, (active ?? 0) + step)));
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(n - 1);
    else if (e.key === 'Escape') hide();
    else return;
    e.preventDefault();
  });

  const ro = new ResizeObserver(() => {
    const w = Math.round(wrap.clientWidth);
    if (w !== lastWidth) {
      lastWidth = w;
      draw();
    }
  });
  ro.observe(wrap);
  draw();

  return { destroy: () => ro.disconnect() };
}

/**
 * Una serie: columnas ('bars') o línea con franja de rango ('line').
 *   opts: además de los de timeChart: values, kind, band: { min, max }, peakLabel(v), emptyText
 */
export function hourlyChart(container, opts) {
  return timeChart(container, opts, (svg, g) => {
    const { m, slot, base, y, cx, pw, ph } = g;
    const bars = [];
    if (opts.kind === 'bars') {
      const bw = Math.max(1, Math.min(24, slot - 2)); // 2 px de separación entre columnas
      opts.values.forEach((v, i) => {
        if (!(v > 0)) return bars.push(null);
        const x = m.l + i * slot + (slot - bw) / 2;
        bars.push(svg.appendChild(svgEl('path', { class: 'bar', d: topRounded(x, Math.min(y(v), base - 1), bw, base, 4) })));
      });
    } else {
      if (opts.band) {
        let seg = [];
        const flush = () => {
          if (seg.length > 1) {
            const up = seg.map((i) => `${cx(i)},${y(opts.band.max[i])}`);
            const down = [...seg].reverse().map((i) => `${cx(i)},${y(opts.band.min[i])}`);
            svg.append(svgEl('polygon', { class: 'band', points: [...up, ...down].join(' ') }));
          }
          seg = [];
        };
        opts.values.forEach((_, i) => (opts.band.max[i] != null && opts.band.min[i] != null ? seg.push(i) : flush()));
        flush();
      }
      svg.append(svgEl('path', { class: 'line', d: linePath(opts.values, cx, y) }));
    }

    // Etiqueta directa solo en el máximo
    const peak = opts.values.reduce((best, v, i) => (v != null && v > (opts.values[best] ?? -Infinity) ? i : best), 0);
    const pv = opts.values[peak];
    if (pv > 0) {
      const px = cx(peak);
      const anchor = px < m.l + 40 ? 'start' : px > m.l + pw - 40 ? 'end' : 'middle';
      if (opts.kind === 'line') svg.append(svgEl('circle', { class: 'dot', cx: px, cy: y(pv), r: 4 }));
      svg.append(text({ class: 'value-label', x: px, y: y(pv) - 8, 'text-anchor': anchor }, opts.peakLabel(pv)));
    } else if (opts.emptyText) {
      svg.append(text({ class: 'empty', x: m.l + pw / 2, y: m.t + ph / 2, 'text-anchor': 'middle' }, opts.emptyText));
    }
    return { highlight: (i) => bars.forEach((b, j) => b?.classList.toggle('active', j === i)) };
  });
}

/**
 * Varias líneas, una por fuente, con una línea de referencia (mediana).
 *   opts: además de los de timeChart: series: [{ id, name, color, values }],
 *         reference: { name, values }, focus: id destacado o null
 */
export function multiLineChart(container, opts) {
  return timeChart(container, opts, (svg, g) => {
    const { y, cx, m, pw } = g;
    const ordered = [...opts.series].sort((a, b) => (a.id === opts.focus) - (b.id === opts.focus)); // destacada encima
    for (const s of ordered) {
      const cls = opts.focus ? (s.id === opts.focus ? ' focus' : ' dim') : '';
      svg.append(svgEl('path', { class: `line series-line${cls}`, d: linePath(s.values, cx, y), style: `stroke:${s.color}` }));
    }
    if (opts.reference) {
      svg.append(svgEl('path', { class: 'line reference-line', d: linePath(opts.reference.values, cx, y) }));
      const last = opts.reference.values.reduce((k, v, i) => (v != null ? i : k), -1);
      if (last >= 0) {
        const v = opts.reference.values[last];
        svg.append(svgEl('circle', { class: 'dot reference-dot', cx: cx(last), cy: y(v), r: 4 }));
        svg.append(text({ class: 'value-label', x: m.l + pw, y: y(v) - 8, 'text-anchor': 'end' }, `${opts.reference.name}: ${opts.format(v)}`));
      }
    }
    // Punto en cada línea a la hora del cursor
    const dots = svgEl('g', { class: 'hover-dots' });
    svg.append(dots);
    return {
      highlight(i) {
        dots.replaceChildren();
        if (i == null) return;
        for (const s of ordered) {
          const v = s.values[i];
          if (v == null || (opts.focus && s.id !== opts.focus)) continue;
          dots.append(svgEl('circle', { class: 'dot', cx: cx(i), cy: y(v), r: 4, style: `fill:${s.color}` }));
        }
      },
    };
  });
}

/**
 * Carriles: una fila por fuente con los tramos en que indica algo (p. ej. tormenta).
 *   opts: además de los de timeChart: lanes: [{ name, values: [0|1|null], color?, level? }]
 *   (level = nivel de aviso: la fila usa el color de estado en vez de color)
 */
export function laneChart(container, opts) {
  const rowH = 22;
  const height = opts.lanes.length * rowH + 18 + 26 + 4;
  return timeChart(container, { ...opts, height, left: opts.left ?? 118, ticks: [], baseline: false }, (svg, g) => {
    const { m, slot } = g;
    opts.lanes.forEach((lane, r) => {
      const top = m.t + r * rowH;
      svg.append(svgEl('rect', { class: 'lane-bg', x: m.l, y: top + 3, width: g.pw, height: rowH - 6, rx: 4 }));
      svg.append(text({ class: 'lane-label', x: m.l - 8, y: top + rowH / 2 + 4, 'text-anchor': 'end' }, lane.name));
      // Tramos continuos como una sola barra redondeada
      let start = -1;
      const flush = (end) => {
        if (start < 0) return;
        const x = m.l + start * slot + 1;
        const w = Math.max(2, (end - start) * slot - 2);
        const attrs = { class: `lane-run${lane.level != null ? ` lvl-${lane.level} status` : ''}`, x, y: top + 4, width: w, height: rowH - 8, rx: 4 };
        if (lane.level == null && lane.color) attrs.style = `fill:${lane.color}`;
        svg.append(svgEl('rect', attrs));
        start = -1;
      };
      lane.values.forEach((v, i) => {
        if (v === 1 && start < 0) start = i;
        if (v !== 1) flush(i);
      });
      flush(lane.values.length);
    });
  });
}

/** Escala con pasos redondos desde 0: { yMax, ticks }. */
export function niceScale(maxValue, steps = 4) {
  const { yMax, ticks } = niceRange(0, maxValue, steps);
  return { yMax, ticks };
}

/** Escala con pasos redondos entre min y max: { yMin, yMax, ticks }. */
export function niceRange(minValue, maxValue, steps = 4) {
  const span = Math.max(maxValue - minValue, 1e-9);
  const raw = span / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw);
  const yMin = Math.floor(minValue / step + 1e-9) * step;
  const yMax = Math.ceil(maxValue / step - 1e-9) * step;
  const ticks = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { yMin, yMax: yMax > yMin ? yMax : yMin + step, ticks };
}
