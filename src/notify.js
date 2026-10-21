import { HOUR, LEVELS, clone, escapeHtml, formatLocal, formatRange, localParts, localToUtc } from './util.js';

const STATUS_HEX = ['#0ca30c', '#fab219', '#ec835a', '#d03b3b'];

/** Cuándo aplica una señal, en texto. */
function evidenceWhen(e, tz) {
  if (e.kind === 'observado' && e.start) return `observado ${formatLocal(e.start, tz)}`;
  if (e.peak) return `máximo ${formatLocal(e.peak, tz)}`;
  return formatRange(e.start, e.end, tz);
}

/**
 * Compara el resultado actual con lo ya registrado y decide qué cambió:
 * - "sube": un peligro pasa a un nivel mayor.
 * - "baja" / "fin": el nivel se mantiene menor durante `downgradeAfterHours`.
 * - "dmc": la DMC publica un aviso nuevo (o actualizado) para la zona.
 * Si faltan los pronósticos (`degraded`), solo se procesan subidas.
 * Los cambios quedan en el historial y se informan en el siguiente boletín.
 */
export function diffAlerts(state, result, dmcAlerts, now, { downgradeAfterHours }, degraded = false) {
  const changes = [];
  const notified = clone(state.notified ?? {});
  for (const h of result.hazards) {
    const prev = notified[h.id] ?? { level: 0 };
    if (h.level > prev.level) {
      changes.push({ type: 'sube', hazardId: h.id, from: prev.level, to: h.level });
      notified[h.id] = { level: h.level, at: now };
    } else if (h.level < prev.level && !degraded) {
      if (!prev.lowerSince) {
        notified[h.id] = { ...prev, lowerSince: now };
      } else if (now - prev.lowerSince >= downgradeAfterHours * HOUR) {
        changes.push({ type: h.level === 0 ? 'fin' : 'baja', hazardId: h.id, from: prev.level, to: h.level });
        notified[h.id] = { level: h.level, at: now };
      }
    } else if (prev.lowerSince) {
      notified[h.id] = { level: prev.level, at: prev.at };
    }
  }

  const seen = new Set(state.dmcSeen ?? []);
  for (const a of dmcAlerts) {
    if (!seen.has(a.key)) changes.push({ type: 'dmc', hazardId: a.hazard, to: a.effectiveLevel, alertKey: a.key });
  }
  const dmcSeen = [...new Set([...(state.dmcSeen ?? []), ...dmcAlerts.map((a) => a.key)])].slice(-300);
  return { changes, notified, dmcSeen };
}

// --- Horarios del boletín -------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * ¿Toca enviar boletín ahora? Devuelve { key, label } si ya pasó una de las horas
 * configuradas (hoy, hora de Santiago), dentro de la ventana de reintento, y ese
 * boletín aún no se envió (`lastKey`).
 */
export function dueBulletin(now, lastKey, { bulletinHours, bulletinWindowMinutes }, tz) {
  const p = localParts(now, tz);
  for (const hour of [...bulletinHours].sort((a, b) => b - a)) {
    const slot = localToUtc(p.y, p.mo, p.d, hour, tz);
    if (slot <= now && now - slot < bulletinWindowMinutes * 60000) {
      const key = `${p.y}-${pad2(p.mo)}-${pad2(p.d)} ${pad2(hour)}:00`;
      return key === lastKey ? null : { key, label: `${pad2(hour)}:00` };
    }
  }
  return null;
}

/** Instante del próximo boletín (hoy o mañana). */
export function nextBulletin(now, { bulletinHours }, tz) {
  const p = localParts(now, tz);
  const hours = [...bulletinHours].sort((a, b) => a - b);
  for (const hour of hours) {
    const slot = localToUtc(p.y, p.mo, p.d, hour, tz);
    if (slot > now) return slot;
  }
  const t = localParts(now + 24 * HOUR, tz);
  return localToUtc(t.y, t.mo, t.d, hours[0], tz);
}

/** Texto de una línea por cambio (para el correo y el historial). */
export function describeChange(c, result, dmcAlerts, tz) {
  const h = result.hazards.find((x) => x.id === c.hazardId) ?? { name: 'Aviso DMC', emoji: '⚠️' };
  const to = LEVELS[c.to ?? 0];
  const from = LEVELS[c.from ?? 0];
  switch (c.type) {
    case 'sube': {
      const when = formatRange(h.start, h.end, tz);
      return `${h.emoji} ${h.name} → ${to.name}${c.from ? ` (antes ${from.name})` : ''}${when ? `, ${when}` : ''}. Motivo: ${h.headline}`;
    }
    case 'baja':
      return `↘️ ${h.name}: baja de ${from.name} a ${to.name}. ${h.headline}`;
    case 'fin':
      return `✅ ${h.name}: finaliza la condición de ${from.name}.`;
    case 'dmc': {
      const a = dmcAlerts.find((x) => x.key === c.alertKey);
      if (!a) return '📢 Nuevo aviso de la DMC';
      const extra = [a.detail, a.observation].filter(Boolean).join('. ');
      return `📢 ${a.type} DMC ${a.code}${a.nearby ? ' (zona vecina)' : ''}: ${a.title}. Desde ${a.from} hasta ${a.to}.${extra ? ` ${extra}.` : ''}`;
    }
    default:
      return '';
  }
}

/**
 * Boletín de las 7:00, 13:00 y 18:00: estado actual, alerta temprana y los
 * cambios registrados desde el boletín anterior (`pending`).
 */
export function buildBulletinEmail(pending, result, { location, dashboardUrl, label }) {
  const tz = location.timezone;
  const o = result.overall;
  const main = result.hazards.find((x) => x.id === o.hazardId);
  const state = o.level ? `${LEVELS[o.level].name.toUpperCase()}: ${main ? main.name : o.headline}` : 'Sin alertas';
  return render({
    subject: `${LEVELS[o.level].emoji} Boletín ${label} · ${state} — ${location.name}`,
    intro: pending.length
      ? `Cambios desde el boletín anterior (${pending.length}):`
      : 'Sin cambios de nivel desde el boletín anterior.',
    lines: pending.map((p) => `${formatLocal(p.at, tz)} · ${p.text}`),
    result,
    location,
    dashboardUrl,
  });
}

export function buildTestEmail(result, { location, dashboardUrl }) {
  return render({
    subject: `🧪 Correo de prueba — Alerta temprana ${location.name}`,
    intro: 'Este es un correo de prueba. Si lo recibes, las notificaciones están bien configuradas.',
    lines: [],
    result,
    location,
    dashboardUrl,
  });
}

function render({ subject, intro, lines, result, location, dashboardUrl }) {
  const tz = location.timezone;
  const overall = result.overall;
  const active = result.hazards.filter((h) => h.level > 0);
  const color = STATUS_HEX[overall.level];

  const hazardHtml = active.length
    ? active
        .map((h) => {
          const when = formatRange(h.start, h.end, tz);
          const ev = h.evidence
            .filter((e) => e.level > 0)
            .slice(0, 4)
            .map((e) => {
              const meta = [evidenceWhen(e, tz), e.source].filter(Boolean).join(' · ');
              return `<li style="margin:2px 0">${escapeHtml(e.text)} <span style="color:#52514e">(${escapeHtml(meta)})</span></li>`;
            })
            .join('');
          return `<div style="border-left:4px solid ${STATUS_HEX[h.level]};padding:8px 12px;margin:10px 0;background:#f9f9f7">
  <div style="font-weight:600">${h.emoji} ${escapeHtml(h.name)} — ${escapeHtml(LEVELS[h.level].name)}</div>
  ${when ? `<div style="color:#52514e;font-size:13px">${escapeHtml(when)}</div>` : ''}
  <ul style="margin:6px 0 0;padding-left:18px;font-size:14px">${ev}</ul>
</div>`;
        })
        .join('')
    : '<p style="margin:8px 0">Sin peligros activos para las próximas 72 horas.</p>';

  const upcoming = result.upcoming || [];
  const emojiOf = (id) => (result.hazards.find((x) => x.id === id) || {}).emoji || '⚠️';
  const upcomingHtml = upcoming.length
    ? `<div style="margin:14px 20px 0;padding:10px 14px;background:#f3f2ee;border-radius:8px">
    <div style="font-weight:700;margin-bottom:4px">Alerta temprana</div>
    ${upcoming.map((u) => `<p style="margin:6px 0;font-size:14px">${emojiOf(u.hazardId)} ${escapeHtml(u.text)} <span style="color:#52514e">(confianza ${escapeHtml(u.confidence)})</span></p>`).join('')}
  </div>`
    : '';

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
    ${lines.length ? `<ul style="padding-left:18px;margin:0">${lines.map((l) => `<li style="margin:6px 0">${escapeHtml(l)}</li>`).join('')}</ul>` : ''}
    <h3 style="font-size:16px;margin:18px 0 4px">Situación actual</h3>
    ${hazardHtml}
    ${dashboardUrl ? `<p style="margin:18px 0"><a href="${escapeHtml(dashboardUrl)}" style="background:#2a78d6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Abrir el panel</a></p>` : ''}
    <p style="font-size:12px;color:#52514e;margin-top:20px">Fuentes: Dirección Meteorológica de Chile, Open-Meteo, MET Norway y NOAA Aviation Weather Center.
    Este sistema es complementario: ante una emergencia, sigue las indicaciones de SENAPRED y de la DMC.</p>
  </div>
</div></body></html>`;

  const text = [
    `${LEVELS[overall.level].name.toUpperCase()} — ${overall.headline}`,
    '',
    ...(upcoming.length ? ['Alerta temprana:', ...upcoming.map((u) => `- ${u.text} (confianza ${u.confidence})`), ''] : []),
    intro,
    ...lines.map((l) => `- ${l}`),
    '',
    'Situación actual:',
    ...(active.length
      ? active.map((h) => `- ${h.name} (${LEVELS[h.level].name}): ${h.headline}`)
      : ['- Sin peligros activos para las próximas 72 horas.']),
    dashboardUrl ? `\nPanel: ${dashboardUrl}` : '',
  ].join('\n');

  return { subject, html, text };
}
