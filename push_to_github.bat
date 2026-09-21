@echo off
chcp 65001 >nul
title 正在推送 Antigravity Browser Controller 到 GitHub...
echo ======================================================
echo    正在将代码推送到 GitHub:
echo    https://github.com/yihongdo-glitch/antigravity-browser-mcp
echo ======================================================
echo.
cd /d "%~dp0"
echo 正在执行: git push -u origin main
echo (如果弹出 GitHub 授权窗口，请直接点击 'Sign in with your browser' 即可一键完成授权)
echo.
git push -u origin main
if %errorlevel% equ 0 (
    echo.
    echo ======================================================
    echo [OK] 发布成功！
    echo 仓库地址: https://github.com/yihongdo-glitch/antigravity-browser-mcp
    echo ======================================================
) else (
    echo.
    echo 推送遇到问题，请检查网络或授权。
)
echo.
pause
