// Gráficos horarios en SVG, sin librerías: columnas o línea con franja de rango,
// con cursor + tooltip (ratón, toque y teclado).
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

/**
 * opts: {
 *   times, values, kind: 'bars' | 'line', band?: { min, max }, yMax, ticks,
 *   thresholds?: [{ value, label }], tz, ariaLabel, format(v), peakLabel(v),
 *   emptyText?, tooltip(i) → [{ value, label, key? }]
 * }
 */
export function hourlyChart(container, opts) {
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

  let geom = null;
  let bars = [];
  let cross = null;
  let active = null;
  let lastWidth = 0;

  function draw() {
    const W = Math.max(260, Math.round(wrap.clientWidth));
    const H = 196;
    const m = { t: 18, r: 10, b: 26, l: 34 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const slot = pw / n;
    const base = m.t + ph;
    const y = (v) => base - (Math.max(0, Math.min(v, opts.yMax)) / opts.yMax) * ph;
    const cx = (i) => m.l + (i + 0.5) * slot;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.replaceChildren();

    // Rejilla y eje Y
    for (const v of opts.ticks) {
      if (v > 0) svg.append(svgEl('line', { class: 'gridline', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
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
      if (th.value > opts.yMax) continue;
      svg.append(svgEl('line', { class: 'threshold', x1: m.l, x2: W - m.r, y1: y(th.value), y2: y(th.value) }));
      svg.append(text({ class: 'thr-label', x: W - m.r, y: y(th.value) - 4, 'text-anchor': 'end' }, th.label));
    }

    // Marcas
    bars = [];
    if (opts.kind === 'bars') {
      const bw = Math.max(1, Math.min(24, slot - 2)); // 2 px de separación entre columnas
      opts.values.forEach((v, i) => {
        if (!(v > 0)) return bars.push(null);
        const x = m.l + i * slot + (slot - bw) / 2;
        const top = Math.min(y(v), base - 1);
        const r = Math.min(4, bw / 2, base - top);
        const d = `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z`;
        bars.push(svg.appendChild(svgEl('path', { class: 'bar', d })));
      });
    } else {
      if (opts.band) {
        let seg = [];
        const flush = () => {
          if (seg.length > 1) {
            const up = seg.map((i) => `${cx(i)},${y(opts.band.max[i])}`);
            const down = seg.reverse().map((i) => `${cx(i)},${y(opts.band.min[i])}`);
            svg.append(svgEl('polygon', { class: 'band', points: [...up, ...down].join(' ') }));
          }
          seg = [];
        };
        opts.values.forEach((_, i) => (opts.band.max[i] != null && opts.band.min[i] != null ? seg.push(i) : flush()));
        flush();
      }
      let d = '';
      let pen = false;
      opts.values.forEach((v, i) => {
        if (v == null) return (pen = false);
        d += `${pen ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      svg.append(svgEl('path', { class: 'line', d }));
    }
    svg.append(svgEl('line', { class: 'baseline', x1: m.l, x2: W - m.r, y1: base, y2: base }));

    // Etiqueta directa solo en el máximo
    const peak = opts.values.reduce((best, v, i) => (v != null && v > (opts.values[best] ?? -Infinity) ? i : best), 0);
    const pv = opts.values[peak];
    if (pv > 0) {
      const px = cx(peak);
      const anchor = px < m.l + 40 ? 'start' : px > W - m.r - 40 ? 'end' : 'middle';
      if (opts.kind === 'line') svg.append(svgEl('circle', { class: 'dot', cx: px, cy: y(pv), r: 4 }));
      svg.append(text({ class: 'value-label', x: px, y: y(pv) - 8, 'text-anchor': anchor }, opts.peakLabel(pv)));
    } else if (opts.emptyText) {
      svg.append(text({ class: 'empty', x: m.l + pw / 2, y: m.t + ph / 2, 'text-anchor': 'middle' }, opts.emptyText));
    }

    cross = svgEl('line', { class: 'crosshair', x1: 0, x2: 0, y1: m.t, y2: base, visibility: 'hidden' });
    svg.append(cross);
    geom = { m, slot, W, cx };
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
    bars.forEach((b, j) => b?.classList.toggle('active', j === i));

    const time = document.createElement('div');
    time.className = 'tip-time';
    time.textContent = tipFmt.format(new Date(opts.times[i]));
    const rows = opts.tooltip(i).map((r) => {
      const row = document.createElement('div');
      row.className = 'tip-row';
      if (r.key) row.append(Object.assign(document.createElement('i'), { className: 'tip-key' }));
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
    bars.forEach((b) => b?.classList.remove('active'));
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

/** Escala con pasos redondos: { yMax, ticks }. */
export function niceScale(maxValue, steps = 4) {
  const raw = Math.max(maxValue, 1e-9) / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw);
  const yMax = Math.ceil(maxValue / step - 1e-9) * step;
  const ticks = [];
  for (let v = 0; v <= yMax + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { yMax, ticks };
}
