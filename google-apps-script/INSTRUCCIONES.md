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

## Funciones disponibles

| Función | Qué hace |
|---|---|
| `instalar` | Crea la revisión automática cada 10 minutos y hace la primera. |
| `revisar` | Hace una revisión ahora (la misma que corre cada 10 minutos). |
| `probarCorreo` | Envía un correo de prueba con el estado actual. |
| `verEstado` | Muestra en el registro el último estado y si alguna fuente falla. |
| `desinstalar` | Detiene las revisiones automáticas. |
| `pausarCorreos` | Deja de enviar correos. Las revisiones y la app siguen funcionando. |
| `reanudarCorreos` | Vuelve a enviar correos (solo de los cambios que ocurran desde ese momento). |

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
