# Instalar el servidor en Google (unos 10 minutos, una sola vez)

El servidor revisa las fuentes cada 10 minutos, te envía los correos desde tu Gmail y entrega
los datos al panel. Funciona en los servidores de Google: no necesitas tener el computador
encendido.

> Hazlo en el **computador**, con tu **Gmail personal** (algunas cuentas de trabajo bloquean
> Apps Script).

## 1. Crear el proyecto

1. Entra a [script.google.com](https://script.google.com) y pulsa **+ Nuevo proyecto**.
2. Arriba a la izquierda, cambia "Proyecto sin título" por **Alerta San Cristóbal**.
3. Borra todo lo que aparece en `Código.gs` y pega el contenido completo de
   [`Codigo.gs`](Codigo.gs). Es largo (unas 3.700 líneas): usa Ctrl+A y Ctrl+C en el archivo.
4. Guarda con el ícono 💾 o con Ctrl+S.

## 2. Activar las revisiones automáticas

1. En la barra de arriba, al lado de **Depurar**, elige la función **`instalar`** y pulsa
   **▶ Ejecutar**.
2. Google pide permisos: **Revisar permisos** → elige tu cuenta.
   - Si aparece "Google no ha verificado esta aplicación", pulsa **Configuración avanzada →
     Ir a Alerta San Cristóbal (no seguro)**. Es normal: el script es tuyo.
   - Los permisos son para: conectarse a las fuentes del clima, enviarte correos, guardar el
     estado y programar la revisión cada 10 minutos.
3. Espera a que termine (unos 10 segundos). En el **Registro de ejecución** debe aparecer
   "Revisión lista…" y el estado actual.

Desde ahora el script revisa todo cada 10 minutos, aunque cierres la página.

## 3. Publicarlo para el panel

1. Arriba a la derecha, pulsa **Implementar → Nueva implementación**.
2. En el engranaje ⚙ junto a "Seleccionar tipo", elige **Aplicación web**.
3. Configura:
   - **Ejecutar como:** Yo (tu correo)
   - **Quién tiene acceso:** Cualquier usuario
4. Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

> "Cualquier usuario" permite que el panel lea el estado sin iniciar sesión en Google. Esa
> dirección solo entrega el estado del clima y las imágenes de rayos: no muestra tus correos
> ni permite cambiar nada.

## 4. Conectar el panel

Abre el panel (doble clic en **`Abrir app.cmd`**), pulsa el engranaje ⚙ (**Ajustes**), pega la
URL y pulsa **Probar y guardar**. Con **Copiar enlace para otro equipo** puedes configurar
otros computadores o teléfonos de una vez.

También puedes enviarme la URL para dejarla fija en la app publicada; así cualquier equipo
que abra el panel queda conectado sin configurar nada.

## Probar el correo

Elige la función **`probarCorreo`** y pulsa **▶ Ejecutar**. Llega un correo de prueba con el
estado actual a tu Gmail.

## Avisar a más personas (opcional)

Por defecto los correos llegan solo a tu Gmail. Para agregar a otras personas:

1. En el menú izquierdo, entra a **⚙ Configuración del proyecto**.
2. Al final, en **Propiedades de la secuencia de comandos**, pulsa **Agregar propiedad**:
   - Propiedad: `CORREOS`
   - Valor: los correos separados por coma, por ejemplo `tu@gmail.com, jefe@empresa.cl`
3. Pulsa **Guardar propiedades de la secuencia de comandos**.

Google permite enviar hasta 100 correos al día desde una cuenta Gmail. Cada alerta cuenta un
correo por destinatario.

## Xweather: rayos en tiempo real y mapa de tormentas (opcional)

Xweather (Vaisala) agrega tres cosas: **rayos de los últimos 5 minutos** a menos de 100 km del
cerro (red global de detección Vaisala, mucho más rápida que la imagen satelital de la DMC), un
**pronóstico horario** como fuente adicional y el **mapa de tormentas** de la pestaña *Mapas*.

1. Crea una cuenta en [signup.xweather.com](https://signup.xweather.com).
2. En tu cuenta, entra a **Apps → New Application**. Nombre: *Alerta San Cristóbal*. Si pide
   un dominio o *namespace*, escribe `script.google.com`.
3. Copia el **Client ID** y el **Client Secret** de la aplicación.
4. En Apps Script, en **Propiedades de la secuencia de comandos**, agrega:
   - `XWEATHER_ID` = el Client ID
   - `XWEATHER_SECRET` = el Client Secret
   - `XWEATHER_LIMITE_MENSUAL` (opcional) = accesos máximos al mes. Por defecto, 14000.
5. Ejecuta `revisar`. En el panel, *Historial y fuentes* debe mostrar las tres fuentes de
   Xweather en verde y los accesos usados del mes.

> **Costo y uso:** el plan gratuito de Xweather da 15 000 accesos al mes y es solo para **uso no
> comercial**; para la empresa corresponde un plan pagado (fuera de EE.UU. y Canadá se contrata
> con su área de ventas). Cada consulta de rayos usa 10 accesos, así que el sistema solo los
> consulta cuando hay alguna señal de tormenta (pronóstico en las próximas 12 h, rayos por
> satélite, tormenta en los aeródromos o aviso de la DMC) y se detiene al llegar al límite del mes.

## Clave de Open-Meteo (recomendada para uso en la empresa)

La API gratuita de Open-Meteo es solo para **uso no comercial** y limita las consultas por
dirección IP. En Google muchas cuentas comparten IP, así que a veces responde "demasiadas
solicitudes" (el sistema reintenta y, si sigue fallando, usa los datos de la última hora). Con
un plan de [Open-Meteo](https://open-meteo.com/en/pricing) se evita el límite: agrega la propiedad
`OPENMETEO_APIKEY` con la clave, igual que `CORREOS`.

## Funciones disponibles

| Función | Qué hace |
|---|---|
| `instalar` | Crea la revisión automática cada 10 minutos y hace la primera. |
| `revisar` | Hace una revisión ahora (la misma que corre cada 10 minutos). |
| `probarCorreo` | Envía un correo de prueba con el estado actual. |
| `verEstado` | Muestra en el registro el último estado y si alguna fuente falla. |
| `desinstalar` | Detiene las revisiones automáticas. |
| `pausarCorreos` | Deja de enviar los boletines. Las revisiones y la app siguen funcionando. |
| `reanudarCorreos` | Vuelve a enviar los boletines de las 7:00, 13:00 y 18:00. |

## Si cambia el código

Cuando haya una versión nueva de [`Codigo.gs`](Codigo.gs):

1. Reemplaza todo el contenido de `Código.gs` por el nuevo y guarda.
2. **Implementar → Gestionar implementaciones → ✏ Editar → Versión: Nueva versión →
   Implementar**. Así la URL del panel no cambia.

Las revisiones automáticas usan el código nuevo apenas lo guardas. La aplicación web (la que
lee el panel) se actualiza solo con el paso 2.

## Si algo falla

| Qué ves | Qué hacer |
|---|---|
| El panel dice "Configuración pendiente" | Falta pegar la URL en Ajustes, o aún no ejecutas `instalar`. |
| "No respondió como se esperaba" al guardar la URL | La implementación debe tener acceso **Cualquier usuario** y la URL debe terminar en `/exec`. |
| El panel muestra "La última revisión del servidor falló" | Ejecuta `verEstado` para ver el detalle. En el menú izquierdo, **Ejecuciones** muestra cada revisión. |
| Una fuente aparece con error en *Estado de las fuentes* | El sistema sigue funcionando con las demás. Si la DMC rechaza las conexiones de Google, avísame. |
| "No se puede abrir el archivo" en script.google.com | Tienes varias cuentas de Google abiertas: usa una ventana de incógnito (Ctrl+Shift+N) solo con tu cuenta. |
| No llegan los correos | Revisa la carpeta de spam la primera vez y marca el correo como "No es spam". |
