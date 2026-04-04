@echo off
setlocal

cd /d "%~dp0"

node scripts\run-pipeline.js --generate-with-claude %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Pipeline failed. Exit code: %EXIT_CODE%
  endlocal & exit /b %EXIT_CODE%
)

echo.
echo Pipeline completed.
endlocal
