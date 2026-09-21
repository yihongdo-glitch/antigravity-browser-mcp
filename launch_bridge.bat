@echo off
chcp 65001 >nul
title Antigravity Browser Bridge Server
echo ======================================================
echo    Antigravity Agent 专用原生浏览器桥接服务 (Port: 18888)
echo ======================================================
echo.
echo 正在启动 WebSocket 服务...
C:\Users\admin\AppData\Local\Programs\Python\Python314\python.exe C:\Users\admin\Desktop\Antigravity\antigravity-browser-extension\bridge\antigravity_bridge.py
pause
