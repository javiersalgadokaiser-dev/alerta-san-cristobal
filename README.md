# Alerta temprana · Cerro San Cristóbal

Sistema de alerta temprana de **tormentas eléctricas y rayos**, lluvia intensa, viento fuerte,
nieve, calor y heladas para el Cerro San Cristóbal (Santiago), en el punto
**33°24'52.8"S 70°36'58.3"W** (-33.414667, -70.616194; ladera del cerro, ~630 m).

- **Servidor en Google Apps Script** (gratis, con tu Gmail): revisa las fuentes **cada 10
  minutos** y envía **correos** cuando algo cambia, sin necesidad de tener el computador
  encendido.
- **Panel instalable como app** en el computador y en el teléfono, publicado en GitHub Pages:
  https://javiersalgadokaiser-dev.github.io/alerta-san-cristobal/

```
Google Apps Script (cada 10 min)                       GitHub Pages
  fuentes ─► motor de alertas ─► ¿cambió algo? ─► correo (Gmail)
                    │
                    └─► estado guardado ─► doGet (JSON) ─────► panel / app
```

## Pestañas del panel

| Pestaña | Qué muestra |
|---|---|
| **Resumen** | Estado de la tormenta eléctrica, alerta temprana, rayos por satélite y lo observado ahora |
| **Peligros** | Estado general y cada peligro (tormenta, lluvia, viento, nieve, calor, helada y radiación UV) |
| **Próximas 72 horas** | Gráficos de tormenta, lluvia y ráfagas |
| **Comparación y DMC** | Qué pronostica cada fuente y los avisos oficiales de la DMC |
| **Mapas** | Mapa de tormentas de Xweather (rayos de 15 min y radar), Windy y avisos de Meteored |
| **Historial y fuentes** | Cambios registrados y estado de cada fuente y del correo |

El estado general se ve siempre en la barra superior; al tocarlo se abre *Peligros*. Cada
pestaña tiene su propia dirección (por ejemplo, `#comparacion`) para guardarla como favorito.

## Usarlo en el computador

- **Doble clic en `Abrir app.cmd`**: abre el panel en su propia ventana, sin la barra del
  navegador.
- **Instalarlo como app** (menú Inicio y barra de tareas): abre el panel en **Edge** →
  menú **⋯ → Aplicaciones → Instalar este sitio como una aplicación**. En `edge://apps` puedes
  marcar **Iniciar automáticamente al iniciar sesión** para que se abra al prender el
  computador.
- **Notificaciones**: en **⚙ Ajustes → Activar notificaciones**, Windows muestra un aviso
  cuando un peligro sube de nivel, mientras la app esté abierta (aunque esté minimizada). El
  ícono de la app muestra cuántos peligros están activos.

En el teléfono: abre la dirección del panel y elige **Instalar app** (Android) o
**Compartir → Agregar a inicio** (iPhone).

## Fuentes

| Fuente | Qué aporta | Tipo |
|---|---|---|
| [DMC · Imágenes de rayos GOES-19](https://climatologia.meteochile.gob.cl/application/diarioe/imagenesTormenta/) | **Rayos reales de la última hora**: distancia y dirección desde el cerro | Observado |
| [DMC · Avisos, Alertas y Alarmas](https://archivos.meteochile.gob.cl/portaldmc/AAA/aaa_mapa.php) | Avisos oficiales para la zona del cerro (*05m_Valle_Longitudinal*) | Oficial |
| METAR de Tobalaba (8 km) y Pudahuel (16 km) | Tormentas, cumulonimbus, ráfagas y lluvia observadas | Observado |
| TAF de Pudahuel | Pronóstico aeronáutico de tormentas y ráfagas (24 h) | Pronóstico |
| [Open-Meteo](https://open-meteo.com): ECMWF, GFS, ICON, GEM, UKMO, ARPEGE | 6 modelos: tormenta, CAPE, lluvia, ráfagas, nieve, temperatura | Pronóstico |
| [MET Norway](https://api.met.no) | Un séptimo pronóstico | Pronóstico |
| [Xweather](https://www.xweather.com) (Vaisala), con clave | **Rayos de los últimos 5 minutos** a menos de 100 km, un pronóstico horario y el mapa de tormentas | Observado y pronóstico |
| [Windy](https://www.windy.com) | Mapa interactivo (tormentas, ráfagas y lluvia) en la pestaña *Mapas* | Visual |
| [Meteored · Mapa de avisos](https://www.meteored.cl/avisos-meteorologicos/) | Mapa interactivo de avisos de todo Chile, integrado en el panel | Visual |

### Alerta temprana

Al inicio del panel (y de cada correo) se indica **cuándo podría empezar** cada fenómeno y
**según qué fuentes**, con una cuenta regresiva y un nivel de confianza. Por ejemplo: *"Podría iniciar
una tormenta eléctrica en el cerro mañana a las 15:00, según ICON (15:00). La DMC mantiene un aviso
de tormentas eléctricas hasta el miércoles 21 a las 00:00."* Si ya se observan rayos o tormenta en
las estaciones, aparece primero como **en curso**. La confianza es *alta* cuando coincide la mitad o
más de las fuentes (o hay respaldo oficial), *media* con 2 fuentes y *baja* con una sola.

### Fuentes que no se pueden usar directamente

- **The Weather Channel** (The Weather Company, IBM): su API requiere una licencia comercial y su
  sitio no permite mostrarse dentro de otra página. Si la empresa obtiene una clave, se puede
  agregar como fuente.
- **Windy como fuente de datos**: su API de pronóstico no incluye ECMWF y para Chile solo entrega
  GFS, que el sistema ya usa; además cuesta 990 € al año (la clave de prueba entrega datos
  alterados). Por eso Windy se integra como mapa, que muestra ECMWF, GFS e ICON.

La coincidencia entre fuentes se expresa en **porcentaje** (por ejemplo, "según el 63 % de las
fuentes").

### Comparación de fuentes

El panel muestra qué pronostica **cada fuente** para las próximas 72 horas, con cuatro
pestañas: **lluvia acumulada**, **ráfagas** y **temperatura** (una línea por modelo, más la
mediana y la franja del aviso de la DMC si hay uno) y **tormenta** (un carril por fuente con las
horas en que pronostica tormenta, junto al TAF y los avisos oficiales de la DMC). Al tocar una
fuente en la leyenda se destaca su línea. Cada fuente conserva siempre el mismo color.

### Cómo se detectan los rayos

La DMC publica cada 10 minutos una imagen infrarroja del satélite GOES-19 con los rayos de la
última hora (sensor GLM), con unos 35 a 45 minutos de retraso. El servidor descarga la más
reciente y busca los puntos de rayo por su color: cian, celeste, azul o azul oscuro según
ocurrieron entre 0 y 60 minutos antes de la imagen. Luego calcula su distancia y dirección
desde el punto vigilado. La posición de cada píxel se calibró con las 13 ciudades marcadas en la
imagen, con un error típico de 2 píxeles (unos 10 km). El panel muestra un recorte de Chile
central con el cerro, los anillos de distancia y una animación de la última hora.

Los avisos de Meteored para Chile son los mismos de la DMC, que el sistema ya lee
directamente. Por eso Meteored se muestra tal cual en el panel y sus datos no se copian.

## Niveles

Se usan los nombres de la DMC: **Normal**, **Aviso**, **Alerta** y **Alarma**. Cada peligro
toma el nivel más alto entre sus señales, y el panel muestra el porqué (*Señales*).

**Tormenta eléctrica** (la prioridad):

| Señal | Nivel |
|---|---|
| Rayos a menos de 15 km del cerro (Xweather en tiempo real o satélite) | Alarma |
| Tormenta observada en Tobalaba (METAR "TS", a menos de 12 km del punto) | Alarma |
| Rayos a menos de 40 km (Xweather o satélite) | Alerta |
| Tormenta en Pudahuel, en las cercanías ("VCTS") o prevista en 2 h | Alerta |
| Cumulonimbus sobre Tobalaba | Alerta |
| La mitad o más de las fuentes pronostican tormenta en una misma hora (mínimo 3) | Alerta |
| TAF con tormenta | Alerta (Aviso si es solo "PROB30") |
| Rayos a menos de 100 km (Xweather o satélite) | Aviso |
| Hubo tormenta en una estación en la última hora, o cumulonimbus sobre Pudahuel | Aviso |
| 2 fuentes pronostican tormenta en una misma hora | Aviso |
| Atmósfera muy inestable (CAPE ≥ 1000 J/kg) con lluvia | Aviso |
| Aviso, Alerta o Alarma de la DMC para la zona | El mismo de la DMC |
| Aviso de la DMC en una zona vecina (precordillera, cordillera de la costa) | Aviso como máximo |

**Lluvia, viento y otros** (con la mediana entre fuentes, para que un modelo exagerado no
dispare solo una alerta):

| Peligro | Aviso | Alerta | Alarma |
|---|---|---|---|
| Lluvia en 24 h | 10 mm | 25 mm | 50 mm |
| Lluvia en 1 h | 4 mm | 8 mm | 15 mm |
| Ráfagas de viento | 12 m/s | **15 m/s** | 20 m/s |
| Nieve en 24 h | 0,5 cm | 5 cm | 15 cm |
| Temperatura máxima | 33 °C | 36 °C | 39 °C |
| Temperatura mínima | 0 °C | −2 °C | −5 °C |
| Índice UV (la fuente más alta) | 8 (muy alto) | 11 (extremo) | — |

El viento se expresa en **m/s** y la alerta se basa en las ráfagas (lo que mide un anemómetro en
un instante). El índice UV llega como máximo a Alerta: es predecible y se maneja con protección,
no detiene la operación.

Todos los umbrales, distancias y la ubicación se ajustan en [src/config.js](src/config.js).

### Cuándo llega un correo

El sistema revisa todo cada 10 minutos, pero envía correo **solo a las 7:00, 13:00 y 18:00**
(hora de Santiago): un **boletín** con el estado actual, la alerta temprana y los cambios
registrados desde el boletín anterior.

- Un cambio es que un peligro **suba de nivel**, que la **DMC publique un aviso nuevo** para la zona,
  o que un nivel **baje o termine** (esto último solo si se mantiene durante 3 horas, para no
  registrar cada oscilación de un pronóstico).
- Si caen las fuentes de pronóstico, nunca se declara el fin de una alerta.
- Si a la hora del boletín el envío falla, se reintenta en las revisiones siguientes durante 1 hora.
- Los horarios se cambian en `NOTIFY.bulletinHours` de [src/config.js](src/config.js).

Para **pausar los correos** sin detener las revisiones, ejecuta `pausarCorreos` en Apps Script; para
reactivarlos, `reanudarCorreos`. Mientras están en pausa, los cambios quedan en el historial del panel.

## Puesta en marcha

1. **Servidor**: sigue [google-apps-script/INSTRUCCIONES.md](google-apps-script/INSTRUCCIONES.md)
   (unos 10 minutos: pegar el código, ejecutar `instalar` y publicarlo como aplicación web).
2. **Panel**: abre `Abrir app.cmd`, entra a **⚙ Ajustes** y pega la URL del paso 1.

## Desarrollo

El código del servidor está en `src/` (módulos de JavaScript que funcionan igual en Node y en
Apps Script). `google-apps-script/Codigo.gs` **se genera** a partir de ellos: no lo edites a
mano.

```bash
npm test          # pruebas de los casos críticos (rayos, tormentas, avisos DMC, correos)
npm run build     # genera google-apps-script/Codigo.gs (usa esbuild con npx)
npm run probar    # ejecuta Codigo.gs en un Apps Script simulado, con datos reales
npm start         # panel local en http://localhost:5174
```

> En Windows, PowerShell puede bloquear `npm`: usa estos comandos desde **cmd** o Git Bash.

`npm run probar` simula UrlFetchApp, PropertiesService y CacheService (con sus límites de
tamaño), MailApp y los activadores, y corre `Codigo.gs` sin las APIs que Apps Script no tiene.
Con `OUT_DIR=carpeta` guarda el estado, las imágenes y el correo generados, y
`DATOS=carpeta npm start` sirve el panel con esos datos en
`http://localhost:5174/#api=http://localhost:5174/api-prueba`.

Para publicar el panel, haz commit y push a `main`: GitHub Pages sirve la carpeta `docs/`. Si
cambian archivos del panel, sube `VERSION` en [docs/sw.js](docs/sw.js) para que las apps
instaladas descarguen la versión nueva.

### Estructura

```
src/
  check.js          una revisión completa: fuentes → evaluación → correo → guardado
  engine.js         combina las fuentes y decide el nivel de cada peligro
  notify.js         qué cambios se avisan y el contenido del correo
  config.js         ubicación, fuentes, umbrales y calibración de la imagen de rayos
  sources/          DMC (avisos y rayos), Open-Meteo, MET Norway y METAR/TAF
  lib/              decodificador y codificador JPEG (jpeg-js, BSD/Apache)
  gas/              adaptadores de Apps Script: fetch, almacenamiento, Gmail, doGet y activadores
google-apps-script/ Codigo.gs (generado) e instrucciones de instalación
docs/               panel web instalable (GitHub Pages)
tools/              generador de Codigo.gs, simulador de Apps Script y servidor local
test/               pruebas automáticas
Abrir app.cmd       abre el panel como app en el computador
```

## Límites

Todo funciona con cuentas gratuitas:

- **Apps Script**: en el simulador, cada revisión dura de 1 a 6 segundos; en Google puede ser
  algo más lenta. El activador puede sumar hasta 90 minutos al día, y estimamos que el sistema
  usa entre 5 y 15. El uso real se ve en **Ejecuciones**.
- **Gmail**: hasta 100 correos al día.
- **Almacenamiento**: unos 60 KB de los 500 KB disponibles.
- **Open-Meteo**: la API gratuita es solo para uso no comercial y limita las consultas por IP
  (en Google a veces responde 429; el sistema reintenta y usa datos de hasta 6 h). Para uso en
  la empresa corresponde un plan pagado: su clave va en la propiedad `OPENMETEO_APIKEY`.

## Importante

Este sistema es **complementario**. Ante una emergencia, sigue las indicaciones oficiales de
[SENAPRED](https://senapred.cl) y de la [Dirección Meteorológica de Chile](https://www.meteochile.gob.cl).
Los datos de Open-Meteo y MET Norway se usan bajo licencia CC BY 4.0, y las imágenes y avisos
de la DMC citando su fuente, como pide su portal.
