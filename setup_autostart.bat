@echo off
chcp 65001 >nul
title Antigravity Bridge - Windows 开机自启配置
echo ========================================================
echo   Antigravity Browser Controller - 开机自启配置脚本
echo ========================================================
echo.

set PYW=C:\Users\admin\AppData\Local\Programs\Python\Python314\pythonw.exe
set SCRIPT=%~dp0bridge\antigravity_bridge.py
set REG_KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run
set REG_NAME=AntigravityBrowserBridge

if not exist "%PYW%" (
    echo [错误] 未找到 Pythonw 解释器：%PYW%
    pause
    exit /b 1
)

echo [1] 注册开机自启 (通过 Windows HKCU Run 注册表，后台无黑框运行)
echo [2] 取消开机自启
echo.
set /p choice="请选择操作 (1 或 2): "

if "%choice%"=="1" (
    reg add "%REG_KEY%" /v "%REG_NAME%" /t REG_SZ /d "\"%PYW%\" \"%SCRIPT%\" serve" /f
    if %errorlevel% equ 0 (
        echo.
        echo [成功] 已成功写入 Windows 启动项！开机后将静默自动拉起 Antigravity 桥服务。
    ) else (
        echo.
        echo [失败] 写入注册表失败，请检查权限。
    )
) else if "%choice%"=="2" (
    reg delete "%REG_KEY%" /v "%REG_NAME%" /f
    if %errorlevel% equ 0 (
        echo.
        echo [成功] 已成功移除 Windows 启动项。
    ) else (
        echo.
        echo [提示] 启动项不存在或已移除。
    )
) else (
    echo 无效选项。
)

echo.
pause
