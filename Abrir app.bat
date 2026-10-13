@echo off
title Inventario Borgstena (no cierres esta ventana mientras uses la app)
cd /d "%~dp0"
echo.
echo   Abriendo la app de inventario en tu navegador...
echo   Mientras la uses, NO cierres esta ventana negra.
echo   Para apagarla, cierra esta ventana.
echo.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8765"
python -m http.server 8765 --bind 127.0.0.1
if errorlevel 1 (
  echo.
  echo   No se pudo iniciar. Revisa que Python este instalado.
  pause
)
