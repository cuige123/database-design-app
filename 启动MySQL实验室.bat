@echo off
title MySQL实验室 · 本地服务器
chcp 936 >nul 2>nul
cd /d "%~dp0"

echo.
echo   ==========================================
echo     MySQL实验室 - 本地服务器启动器
echo   ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :no_node

echo   检查服务器是否已在运行...
powershell -NoProfile -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173/index.html' -TimeoutSec 3; if($r.Content -match 'sqlEditor'){exit 0}else{exit 1}}catch{exit 1}" >nul 2>nul
if not errorlevel 1 goto :already_running

echo   正在启动服务器，稍后会自动打开浏览器...
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "1..60|ForEach-Object{try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',4173);$c.Close();Start-Process 'http://localhost:4173/index.html';exit}catch{Start-Sleep -Milliseconds 500}}"

echo.
echo   访问地址: http://localhost:4173/index.html
echo   保持本窗口开启，关闭窗口即停止服务器。
echo.
node server.js

echo.
echo   服务器已停止。
echo   如果上方出现 EADDRINUSE，说明 4173 端口被其他程序占用。
echo.
pause
exit /b 0

:already_running
echo   服务器已在运行，正在打开浏览器...
start "" "http://localhost:4173/index.html"
echo.
echo   提示: 原有服务器窗口仍在运行，本窗口 3 秒后自动关闭。
ping -n 4 127.0.0.1 >nul
exit /b 0

:no_node
echo   [错误] 没有检测到 Node.js。
echo.
echo   请先安装 Node.js 再运行本脚本: https://nodejs.org/
echo.
pause
exit /b 1