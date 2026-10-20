// Genera google-apps-script/Codigo.gs: un solo archivo con todo el servidor,
// listo para pegar en script.google.com.
//   node tools/build-apps-script.mjs
// Usa esbuild (se descarga con npx la primera vez) para unir los módulos de src/
// y convertirlos a ECMAScript 2019, que el motor de Apps Script ejecuta sin problemas.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ESBUILD = 'esbuild@0.28.2';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(tmpdir(), `alerta-sc-build-${process.pid}`);
mkdirSync(tmp, { recursive: true });
const bundle = join(tmp, 'bundle.js');

execSync(
  `npx --yes ${ESBUILD} "${join(root, 'src/gas/main.js')}" --bundle --format=iife --global-name=AlertaSC ` +
    `--target=es2019 --charset=utf8 --legal-comments=none --log-level=warning --outfile="${bundle}"`,
  { stdio: 'inherit' },
);
const code = readFileSync(bundle, 'utf8');
rmSync(tmp, { recursive: true, force: true });

// Rasgos que Apps Script no tiene y que no deben colarse en el paquete.
const forbidden = [/\bstructuredClone\(/, /\bnew URL\(/, /\bURLSearchParams\b/, /\bBuffer\.from\(/, /\.at\(-1\)/, /\bsetTimeout\(/];
for (const re of forbidden) {
  const m = code.match(re);
  if (m && !(re.source.includes('Buffer') && code.includes('return Buffer.from(buf)'))) {
    throw new Error(`El paquete usa algo que Apps Script no tiene: ${m[0]}`);
  }
}

const header = `/**
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
 * Funciones que puedes ejecutar: instalar, revisar, probarCorreo, verEstado, desinstalar.
 * Opcional, en Configuración del proyecto → Propiedades de la secuencia de comandos:
 *   CORREOS   = correos separados por coma (si no existe, se usa tu Gmail)
 *   URL_PANEL = dirección del panel (para el botón de los correos)
 *
 * Incluye jpeg-js 0.4.4 (https://github.com/jpeg-js/jpeg-js):
 *   Decodificador: Copyright 2011 notmasteryet, Licencia Apache 2.0.
 *   Codificador: Copyright (c) 2008, Adobe Systems Incorporated, licencia BSD de 3 cláusulas;
 *   adaptado por Andreas Ritter (www.bytestrom.eu). Textos completos en src/lib/LICENSE-jpeg-js.
 */

`;

// Apps Script solo ve las funciones declaradas en el nivel superior.
const entryPoints = `

// --- Funciones visibles en Apps Script ---------------------------------------
function doGet(e) { return AlertaSC.doGet(e); }
function revisar() { return AlertaSC.revisar(); }
function instalar() { return AlertaSC.instalar(); }
function probarCorreo() { return AlertaSC.probarCorreo(); }
function verEstado() { return AlertaSC.verEstado(); }
function desinstalar() { return AlertaSC.desinstalar(); }
`;

const out = join(root, 'google-apps-script/Codigo.gs');
writeFileSync(out, header + code + entryPoints);
console.log(`Generado ${out} (${Math.round((header + code).length / 1024)} KB)`);
