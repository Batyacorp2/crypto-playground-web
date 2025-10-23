@echo off
chcp 65001 >nul
title Crypto Playground Server Stopper

:: =============================================================================
:: 🛑 CRYPTO PLAYGROUND WEB SERVER STOPPER (Windows)
:: =============================================================================
:: Batch файл для остановки веб-сервера crypto-playground
:: Автор: OpenHands AI Assistant
:: Дата: 23.10.2025
:: =============================================================================

echo.
echo =====================================
echo 🛑 CRYPTO PLAYGROUND STOPPER
echo =====================================
echo.

:: Переходим в директорию скрипта
cd /d "%~dp0"

echo [INFO] Поиск запущенных серверов...

:: Ищем процессы Python с app.py
tasklist /FI "IMAGENAME eq python.exe" | find "python.exe" >nul
if errorlevel 1 (
    echo [INFO] Процессы Python не найдены
    goto :cleanup
)

:: Показываем найденные процессы
echo [INFO] Найдены процессы Python:
tasklist /FI "IMAGENAME eq python.exe"
echo.

:: Останавливаем процессы
echo [INFO] Останавливаем серверы...
taskkill /F /IM python.exe >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Не удалось остановить некоторые процессы
) else (
    echo [SUCCESS] Процессы остановлены
)

:: Ждем завершения
timeout /t 2 >nul

:: Проверяем порт
netstat -an | find ":54583" >nul
if errorlevel 1 (
    echo [SUCCESS] Порт 54583 освобожден
) else (
    echo [WARNING] Порт 54583 все еще занят
)

:cleanup
echo [INFO] Очистка временных файлов...
if exist "server.pid" del "server.pid" >nul 2>&1
if exist "nohup.out" del "nohup.out" >nul 2>&1

echo [SUCCESS] Готово!
echo.
pause