@echo off
chcp 65001 >nul
title Antigravity Browser Controller Bridge (Port: 18888)
echo ======================================================
echo    Antigravity Browser Controller - Local Bridge Server
echo ======================================================
echo.
echo Starting WebSocket server on ws://127.0.0.1:18888/ws ...
python "%~dp0bridge\antigravity_bridge.py"
if %errorlevel% neq 0 (
    py -3 "%~dp0bridge\antigravity_bridge.py"
)
pause
