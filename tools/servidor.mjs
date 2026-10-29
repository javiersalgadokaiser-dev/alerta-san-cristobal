// Servidor local del panel:  npm start  → http://localhost:5174
// Sin dependencias. Sirve la carpeta docs/ (la misma que publica GitHub Pages).
// Con DATOS=carpeta (salida de "OUT_DIR=… node tools/probar-apps-script.mjs")
// también responde /api-prueba como si fuera el servidor de Google; para usarlo,
// abre http://localhost:5174/#api=http://localhost:5174/api-prueba
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const PORT = Number(process.env.PORT) || 5174;
const DATOS = process.env.DATOS;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api-prueba' && DATOS) {
        const accion = url.searchParams.get('accion');
        const file = accion === 'rayos' ? 'rayos.json' : accion === 'mapa' ? 'mapa.json' : 'estado.json';
        res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
        return res.end(await readFile(join(DATOS, file)));
      }
      const path = normalize(join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
      if (!path.startsWith(ROOT)) throw new Error('fuera de docs/');
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
    }
  })
  .on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `El puerto ${PORT} ya está en uso (¿la app ya está abierta?).` : e);
    process.exit(1);
  })
  .listen(PORT, () => console.log(`Panel en http://localhost:${PORT}${DATOS ? `  ·  datos de prueba: http://localhost:${PORT}/#api=http://localhost:${PORT}/api-prueba` : ''}`));
