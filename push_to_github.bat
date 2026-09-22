@echo off
cd /d "C:\Users\admin\Desktop\Antigravity\antigravity-browser-extension"
echo ======================================================
echo   Pushing Antigravity Browser Controller to GitHub
echo   https://github.com/yihongdo-glitch/antigravity-browser-mcp
echo ======================================================
echo.
echo Current directory: %CD%
echo Running: git push -u origin main
echo.
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ======================================================
    echo [SUCCESS] Repository successfully pushed to GitHub!
    echo URL: https://github.com/yihongdo-glitch/antigravity-browser-mcp
    echo ======================================================
) else (
    echo ======================================================
    echo [NOTICE] If prompted, sign in with your browser.
    echo ======================================================
)
echo.
pause
