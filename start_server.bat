@echo off
chcp 65001 >nul
title Crypto Playground Web Server Launcher

:: =============================================================================
:: 🚀 CRYPTO PLAYGROUND WEB SERVER LAUNCHER (Windows)
:: =============================================================================
:: Расширенный batch файл для запуска веб-сервера crypto-playground
:: Автор: OpenHands AI Assistant
:: Дата: 23.10.2025
:: Версия: 2.0
:: =============================================================================

setlocal enabledelayedexpansion

:: Цвета для консоли (если поддерживается)
set "GREEN=[92m"
set "RED=[91m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "CYAN=[96m"
set "WHITE=[97m"
set "RESET=[0m"

:: Функция для красивого вывода заголовка
call :print_header

:: Переходим в директорию скрипта
cd /d "%~dp0"
call :print_info "Рабочая директория: %CD%"

:: Проверяем системные требования
call :check_requirements
if errorlevel 1 exit /b 1

:: Проверяем запущенные серверы
call :check_running_servers

:: Устанавливаем зависимости
call :install_dependencies

:: Создаем структуру директорий
call :create_directories

:: Создаем конфигурационный файл
call :create_config

:: Запускаем сервер
call :start_server

:: Проверяем успешность запуска
call :verify_server

:: Показываем информацию о сервере
call :show_server_info

:: Предлагаем дополнительные действия
call :additional_actions

goto :end

:: =============================================================================
:: ФУНКЦИИ
:: =============================================================================

:print_header
echo.
echo %CYAN%=====================================
echo 🚀 CRYPTO PLAYGROUND WEB SERVER
echo =====================================%RESET%
echo %WHITE%Версия: 2.0 ^| Дата: 23.10.2025%RESET%
echo.
goto :eof

:print_info
echo %CYAN%[INFO]%RESET% %~1
goto :eof

:print_success
echo %GREEN%[SUCCESS]%RESET% %~1
goto :eof

:print_warning
echo %YELLOW%[WARNING]%RESET% %~1
goto :eof

:print_error
echo %RED%[ERROR]%RESET% %~1
goto :eof

:check_requirements
call :print_info "Проверяем системные требования..."

:: Проверяем наличие app.py
if not exist "app.py" (
    call :print_error "Файл app.py не найден в текущей директории!"
    call :print_info "Убедитесь, что вы запускаете скрипт из правильной папки"
    pause
    exit /b 1
)

:: Проверяем наличие Python
python --version >nul 2>&1
if errorlevel 1 (
    call :print_error "Python не установлен или не добавлен в PATH!"
    echo.
    echo %YELLOW%Решение:%RESET%
    echo 1. Скачайте Python с https://python.org
    echo 2. При установке отметьте "Add Python to PATH"
    echo 3. Перезапустите командную строку
    echo.
    pause
    exit /b 1
)

:: Получаем версию Python
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
call :print_success "Python %PYTHON_VERSION% найден"

:: Проверяем наличие pip
pip --version >nul 2>&1
if errorlevel 1 (
    call :print_error "pip не найден!"
    pause
    exit /b 1
)

call :print_success "Системные требования выполнены"
goto :eof

:check_running_servers
call :print_info "Проверяем запущенные серверы..."

:: Проверяем порт 54583
netstat -an | find ":54583" >nul 2>&1
if not errorlevel 1 (
    call :print_warning "Порт 54583 уже занят!"
    echo.
    set /p kill_process="Остановить существующий сервер? (Y/N): "
    if /i "!kill_process!"=="Y" (
        call :print_info "Останавливаем процессы на порту 54583..."
        for /f "tokens=5" %%a in ('netstat -ano ^| find ":54583"') do (
            taskkill /F /PID %%a >nul 2>&1
        )
        timeout /t 2 >nul
        call :print_success "Процессы остановлены"
    ) else (
        call :print_error "Невозможно запустить сервер - порт занят"
        pause
        exit /b 1
    )
)

:: Проверяем процессы Python с app.py
tasklist /FI "IMAGENAME eq python.exe" | find "python.exe" >nul 2>&1
if not errorlevel 1 (
    call :print_info "Найдены процессы Python, проверяем..."
    wmic process where "name='python.exe'" get commandline,processid /format:csv | find "app.py" >nul 2>&1
    if not errorlevel 1 (
        call :print_warning "Найден запущенный сервер app.py"
        set /p kill_python="Остановить? (Y/N): "
        if /i "!kill_python!"=="Y" (
            for /f "skip=1 tokens=2,3 delims=," %%a in ('wmic process where "name='python.exe'" get commandline^,processid /format:csv ^| find "app.py"') do (
                taskkill /F /PID %%b >nul 2>&1
            )
            call :print_success "Python процессы остановлены"
        )
    )
)
goto :eof

:install_dependencies
call :print_info "Проверяем и устанавливаем зависимости..."

if exist "requirements.txt" (
    call :print_info "Найден файл requirements.txt"
    echo %YELLOW%Устанавливаем зависимости...%RESET%
    
    :: Показываем прогресс установки
    pip install -r requirements.txt
    if errorlevel 1 (
        call :print_warning "Некоторые зависимости не удалось установить"
        echo %YELLOW%Попробуем установить основные пакеты...%RESET%
        pip install flask requests
        if errorlevel 1 (
            call :print_error "Критическая ошибка установки зависимостей!"
            pause
            exit /b 1
        )
    ) else (
        call :print_success "Все зависимости установлены успешно"
    )
) else (
    call :print_warning "Файл requirements.txt не найден"
    call :print_info "Устанавливаем основные пакеты..."
    pip install flask requests
    if errorlevel 1 (
        call :print_error "Не удалось установить основные пакеты!"
        pause
        exit /b 1
    )
)
goto :eof

:create_directories
call :print_info "Создаем структуру директорий..."

:: Создаем основные директории
set DIRS=static static\css static\js static\images templates data data\proxies data\accounts data\logs

for %%d in (%DIRS%) do (
    if not exist "%%d" (
        mkdir "%%d" >nul 2>&1
        if exist "%%d" (
            call :print_success "Создана директория: %%d"
        ) else (
            call :print_warning "Не удалось создать директорию: %%d"
        )
    )
)

call :print_success "Структура директорий готова"
goto :eof

:create_config
call :print_info "Создаем конфигурационный файл..."

:: Создаем простой конфиг
echo # Crypto Playground Configuration > config.ini
echo [SERVER] >> config.ini
echo host=0.0.0.0 >> config.ini
echo port=54583 >> config.ini
echo debug=false >> config.ini
echo [PATHS] >> config.ini
echo data_dir=data >> config.ini
echo logs_dir=data\logs >> config.ini

if exist "config.ini" (
    call :print_success "Конфигурационный файл создан"
) else (
    call :print_warning "Не удалось создать конфигурационный файл"
)
goto :eof

:start_server
call :print_info "Запускаем веб-сервер..."
echo %BLUE%Логи сервера записываются в server.log%RESET%
echo.

:: Сохраняем PID процесса
echo %date% %time% - Server starting > server.log

:: Запускаем сервер в фоне
start /B python app.py >> server.log 2>&1

:: Сохраняем информацию о запуске
echo %date% %time% > server_start.txt
echo Server started by: %USERNAME% >> server_start.txt
echo Working directory: %CD% >> server_start.txt

call :print_success "Сервер запущен в фоновом режиме"
goto :eof

:verify_server
call :print_info "Проверяем запуск сервера..."

:: Ждем запуска (до 15 секунд)
set /a counter=0
:wait_loop
timeout /t 1 >nul
set /a counter+=1

netstat -an | find ":54583" >nul 2>&1
if not errorlevel 1 goto :server_ready

if %counter% lss 15 goto :wait_loop

:: Сервер не запустился
call :print_error "Сервер не запустился в течение 15 секунд!"
echo.
echo %YELLOW%Проверьте логи:%RESET%
if exist "server.log" (
    echo %CYAN%Последние строки server.log:%RESET%
    powershell "Get-Content server.log -Tail 10"
)
echo.
pause
exit /b 1

:server_ready
call :print_success "Сервер успешно запущен и готов к работе!"

:: Получаем PID процесса
for /f "tokens=5" %%a in ('netstat -ano ^| find ":54583" ^| find "LISTENING"') do (
    set SERVER_PID=%%a
    echo !SERVER_PID! > server.pid
)

if defined SERVER_PID (
    call :print_info "PID сервера: %SERVER_PID%"
)
goto :eof

:show_server_info
echo.
echo %GREEN%=====================================
echo 🎉 СЕРВЕР УСПЕШНО ЗАПУЩЕН!
echo =====================================%RESET%
echo.
echo %WHITE%🌐 Основной URL:%RESET%    %CYAN%http://localhost:54583%RESET%
echo %WHITE%📊 PID процесса:%RESET%    %YELLOW%!SERVER_PID!%RESET%
echo %WHITE%📝 Файл логов:%RESET%     %BLUE%%CD%\server.log%RESET%
echo %WHITE%⚙️  Конфигурация:%RESET%   %BLUE%%CD%\config.ini%RESET%
echo.
echo %CYAN%📋 Доступные страницы:%RESET%
echo   %WHITE%•%RESET% Главная:         %CYAN%http://localhost:54583%RESET%
echo   %WHITE%•%RESET% Тестер прокси:   %CYAN%http://localhost:54583/proxies%RESET%
echo   %WHITE%•%RESET% Модули:          %CYAN%http://localhost:54583/modules%RESET%
echo   %WHITE%•%RESET% Аккаунты:        %CYAN%http://localhost:54583/accounts%RESET%
echo   %WHITE%•%RESET% Логи:            %CYAN%http://localhost:54583/logs%RESET%
echo.
echo %YELLOW%🛑 Для остановки сервера:%RESET%
echo   %WHITE%•%RESET% Запустите: %GREEN%stop_server.bat%RESET%
echo   %WHITE%•%RESET% Или нажмите: %GREEN%Ctrl+C%RESET% в окне сервера
echo.
goto :eof

:additional_actions
echo %CYAN%🚀 Дополнительные действия:%RESET%
echo.
echo %WHITE%1.%RESET% Открыть браузер
echo %WHITE%2.%RESET% Показать логи в реальном времени  
echo %WHITE%3.%RESET% Создать ярлык на рабочем столе
echo %WHITE%4.%RESET% Показать статус системы
echo %WHITE%5.%RESET% Выход
echo.
set /p action="Выберите действие (1-5): "

if "!action!"=="1" (
    call :print_info "Открываем браузер..."
    start http://localhost:54583
    echo %GREEN%Браузер открыт!%RESET%
    echo.
    goto :additional_actions
)

if "!action!"=="2" (
    call :print_info "Показываем логи (Ctrl+C для выхода)..."
    echo.
    powershell "Get-Content server.log -Wait -Tail 20"
    goto :additional_actions
)

if "!action!"=="3" (
    call :create_desktop_shortcut
    goto :additional_actions
)

if "!action!"=="4" (
    call :show_system_status
    goto :additional_actions
)

if "!action!"=="5" (
    goto :end
)

call :print_warning "Неверный выбор, попробуйте снова"
goto :additional_actions

:create_desktop_shortcut
call :print_info "Создаем ярлык на рабочем столе..."

set DESKTOP=%USERPROFILE%\Desktop
set SHORTCUT_NAME=Crypto Playground Server.lnk
set TARGET_PATH=%CD%\start_server.bat

:: Создаем VBS скрипт для создания ярлыка
echo Set oWS = WScript.CreateObject("WScript.Shell") > create_shortcut.vbs
echo sLinkFile = "%DESKTOP%\%SHORTCUT_NAME%" >> create_shortcut.vbs
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> create_shortcut.vbs
echo oLink.TargetPath = "%TARGET_PATH%" >> create_shortcut.vbs
echo oLink.WorkingDirectory = "%CD%" >> create_shortcut.vbs
echo oLink.Description = "Crypto Playground Web Server" >> create_shortcut.vbs
echo oLink.IconLocation = "%CD%\static\images\icon_white_128.png" >> create_shortcut.vbs
echo oLink.Save >> create_shortcut.vbs

cscript create_shortcut.vbs >nul 2>&1
del create_shortcut.vbs >nul 2>&1

if exist "%DESKTOP%\%SHORTCUT_NAME%" (
    call :print_success "Ярлык создан на рабочем столе!"
) else (
    call :print_warning "Не удалось создать ярлык"
)
echo.
goto :eof

:show_system_status
echo.
echo %CYAN%📊 СТАТУС СИСТЕМЫ%RESET%
echo %CYAN%==================%RESET%
echo.

:: Статус сервера
netstat -an | find ":54583" >nul 2>&1
if not errorlevel 1 (
    echo %GREEN%✓%RESET% Сервер: %GREEN%Работает%RESET%
) else (
    echo %RED%✗%RESET% Сервер: %RED%Не работает%RESET%
)

:: Проверяем доступность
curl -s http://localhost:54583 >nul 2>&1
if not errorlevel 1 (
    echo %GREEN%✓%RESET% HTTP: %GREEN%Доступен%RESET%
) else (
    echo %RED%✗%RESET% HTTP: %RED%Недоступен%RESET%
)

:: Размер логов
if exist "server.log" (
    for %%A in (server.log) do (
        echo %WHITE%📝%RESET% Размер логов: %YELLOW%%%~zA байт%RESET%
    )
) else (
    echo %YELLOW%📝%RESET% Логи: %YELLOW%Не найдены%RESET%
)

:: Время работы
if exist "server_start.txt" (
    for /f "tokens=1,2" %%a in (server_start.txt) do (
        echo %WHITE%⏰%RESET% Запущен: %CYAN%%%a %%b%RESET%
    )
)

:: Использование памяти (если доступно)
if defined SERVER_PID (
    for /f "tokens=5" %%a in ('tasklist /FI "PID eq !SERVER_PID!" /FO CSV ^| find "!SERVER_PID!"') do (
        echo %WHITE%💾%RESET% Память: %YELLOW%%%a%RESET%
    )
)

echo.
pause
goto :eof

:end
echo.
echo %GREEN%Спасибо за использование Crypto Playground!%RESET%
echo %CYAN%Сервер продолжает работать в фоновом режиме.%RESET%
echo.
echo %YELLOW%Для полной остановки запустите: stop_server.bat%RESET%
echo.
pause