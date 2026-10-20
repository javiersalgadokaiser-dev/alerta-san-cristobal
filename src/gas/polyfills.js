// Lo mínimo que el código compartido usa y que Apps Script no trae.
const root = typeof globalThis !== 'undefined' ? globalThis : Function('return this')();

if (typeof root.AbortSignal === 'undefined') {
  // UrlFetchApp ya corta las solicitudes largas por su cuenta.
  root.AbortSignal = { timeout: () => undefined };
}

if (typeof root.fetch === 'undefined') {
  root.fetch = gasFetch;
}

/** fetch() mínimo sobre UrlFetchApp (síncrono por dentro). */
function gasFetch(url, opts = {}) {
  const params = {
    method: (opts.method || 'get').toLowerCase(),
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { ...(opts.headers || {}) },
  };
  if (opts.body != null) params.payload = opts.body;
  try {
    let r;
    try {
      r = UrlFetchApp.fetch(url, params);
    } catch (e) {
      // Si Google rechazara el User-Agent propio, se reintenta con el suyo.
      if (!params.headers['User-Agent'] || !/header|user-agent|argument/i.test(String(e))) throw e;
      delete params.headers['User-Agent'];
      r = UrlFetchApp.fetch(url, params);
    }
    const status = r.getResponseCode();
    const raw = r.getAllHeaders();
    const headers = {};
    for (const k of Object.keys(raw)) headers[k.toLowerCase()] = Array.isArray(raw[k]) ? raw[k].join(', ') : String(raw[k]);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => (name.toLowerCase() in headers ? headers[name.toLowerCase()] : null) },
      text: () => Promise.resolve(r.getContentText()),
      json: () => Promise.resolve(JSON.parse(r.getContentText())),
      arrayBuffer: () => {
        const bytes = r.getContent(); // bytes con signo (-128..127)
        const out = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] & 255;
        return Promise.resolve(out.buffer);
      },
    });
  } catch (e) {
    return Promise.reject(e);
  }
}
