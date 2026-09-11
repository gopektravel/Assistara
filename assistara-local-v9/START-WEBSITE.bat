@echo off
title Assistara Local Website
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo Node.js is not installed or not available in PATH.
  echo Install Node.js from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)
start "" http://localhost:3000
node server.js
pause
