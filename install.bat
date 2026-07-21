@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Clinic Rooms Installer
cd /d "%~dp0"

echo.
echo  =============================================
echo   Clinic Rooms - Setup
echo  =============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

echo  Node.js found - starting the wizard.
echo  A Hebrew guide will open in your browser.
echo.

node --no-deprecation setup\wizard.mjs

echo.
pause
exit /b 0

:nonode
echo  [!] Node.js is not installed - it is required (free, 1 minute):
echo.
echo   1. Go to: https://nodejs.org  (opening in your browser now)
echo   2. Download the LTS version and install it - defaults are fine.
echo   3. Close this window and run install.bat again.
echo.
start https://nodejs.org
start "" "%~dp0setup\guide.html"
pause
exit /b 1
