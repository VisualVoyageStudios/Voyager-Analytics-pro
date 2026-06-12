@echo off
echo ========================================
echo   Voyager Analytics Sync Agent
echo ========================================
echo.
echo Starting sync agent...
echo Keep this window open while using our Voyager Analytics website.
echo You can minimise it.
echo.
cd /d "%~dp0"
py sync_agent.py
pause