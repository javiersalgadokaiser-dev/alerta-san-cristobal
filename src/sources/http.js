export const APP_UA = 'AlertaTempranaCerroSanCristobal/1.0';

// Algunos servidores (p. ej. la DMC) cortan la conexión a clientes que no
// parecen un navegador.
export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

import { sleep } from '../util.js';

/**
 * GET de un JSON. Con `retries`, reintenta si el servidor responde "demasiadas
 * solicitudes" (429) o un error 5xx: en Apps Script cada intento puede salir por
 * otra dirección IP de Google.
 */
export async function fetchJson(url, { headers = {}, timeout = 20000, retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': APP_UA, Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(timeout),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} desde ${url.replace(/^https?:\/\/([^/]+).*$/, '$1')}${attempt ? ` (tras ${attempt + 1} intentos)` : ''}`);
    return res.json();
  }
}
