@echo off
rem Doble clic para abrir el panel de alertas como app, en su propia ventana.
rem Para tenerla en el menu Inicio o la barra de tareas, instalala desde Edge (ver README).
set "URL=https://javiersalgadokaiser-dev.github.io/alerta-san-cristobal/"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app="%URL%"
) else (
  start "" "%URL%"
)
