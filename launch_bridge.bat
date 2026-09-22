@echo off
chcp 65001 >nul
title Antigravity Browser Controller Bridge v2.0.0 (Port: 18888/18889)
echo ======================================================
echo    Antigravity Browser Controller - Local Bridge Daemon
echo ======================================================
echo.
echo Starting WebSocket server on ws://127.0.0.1:18888/ws ...
echo Starting HTTP Control Gateway on http://127.0.0.1:18889/action ...
echo.
python "%~dp0bridge\antigravity_bridge.py" serve --port 18888
if %errorlevel% neq 0 (
    py -3 "%~dp0bridge\antigravity_bridge.py" serve --port 18888
)
pause
