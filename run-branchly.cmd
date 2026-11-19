@echo off
rem Branchly launcher: double-click this file.
rem First run installs dependencies (takes a few minutes); after that it builds and opens the app.
rem Keep this file ASCII only: cmd misreads UTF-8 Korean text inside .cmd files.
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Node.js is not installed. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
where git >nul 2>nul || (
  echo Git is not installed. Install it from https://git-scm.com and run this again.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [1/3] Installing dependencies...
  call npm install || goto fail
  call npm rebuild electron esbuild || goto fail
)

echo [2/3] Building...
call npm run build:main >nul || goto fail
call npm run build:renderer >nul || goto fail

echo [3/3] Opening Branchly...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0

:fail
echo.
echo Could not start Branchly. Check the error message above.
pause
exit /b 1
