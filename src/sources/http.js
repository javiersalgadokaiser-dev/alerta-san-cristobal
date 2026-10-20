export const APP_UA = 'AlertaTempranaCerroSanCristobal/1.0';

// Algunos servidores (p. ej. la DMC) cortan la conexión a clientes que no
// parecen un navegador.
export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

export async function fetchJson(url, { headers = {}, timeout = 20000 } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': APP_UA, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} desde ${url.replace(/^https?:\/\/([^/]+).*$/, '$1')}`);
  return res.json();
}
