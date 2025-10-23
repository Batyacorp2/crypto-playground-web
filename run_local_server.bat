@echo off
setlocal enableextensions enabledelayedexpansion
chcp 65001 >nul

:: ==============================================================
::  Crypto Playground Web — быстрый запуск (Windows 10/11)
:: ==============================================================
title Crypto Playground Web — локальный сервер

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%"
set "EXIT_CODE=0"

set "VENV_DIR=.venv"
set "REQUIREMENTS=requirements.txt"
set "DEFAULT_HOST=0.0.0.0"
set "DEFAULT_PORT=54583"
set "ARG_RESET=0"
set "ARG_SKIP_INSTALL=0"
set "ARG_OPEN_BROWSER=0"
set "ARG_BACKGROUND=0"
set "ARG_NO_VENV=0"
set "ARG_HOST="
set "ARG_PORT="
set "PYTHON_EXEC="

if "%~1"=="" goto :parse_args_end

:parse_args
if "%~1"=="" goto :parse_args_end
if /I "%~1"=="--help" (
    call :show_usage
    set "EXIT_CODE=0"
    goto :cleanup
)
if /I "%~1"=="/h" (
    call :show_usage
    set "EXIT_CODE=0"
    goto :cleanup
)
if /I "%~1"=="-h" (
    call :show_usage
    set "EXIT_CODE=0"
    goto :cleanup
)
if /I "%~1"=="--reset" (set "ARG_RESET=1" & shift & goto :parse_args)
if /I "%~1"=="--skip-install" (set "ARG_SKIP_INSTALL=1" & shift & goto :parse_args)
if /I "%~1"=="--open-browser" (set "ARG_OPEN_BROWSER=1" & shift & goto :parse_args)
if /I "%~1"=="--background" (set "ARG_BACKGROUND=1" & shift & goto :parse_args)
if /I "%~1"=="--no-venv" (set "ARG_NO_VENV=1" & shift & goto :parse_args)
if /I "%~1"=="--host" (
    shift
    if "%~1"=="" goto :usage_error
    set "ARG_HOST=%~1"
    shift
    goto :parse_args
)
if /I "%~1"=="--port" (
    shift
    if "%~1"=="" goto :usage_error
    set "ARG_PORT=%~1"
    shift
    goto :parse_args
)
echo [Ошибка] Неизвестный параметр: %~1
call :show_usage
set "EXIT_CODE=1"
goto :error

:usage_error
echo [Ошибка] Не передано значение для параметра.
call :show_usage
set "EXIT_CODE=1"
goto :error

:parse_args_end
if defined ARG_HOST set "DEFAULT_HOST=%ARG_HOST%"
if defined ARG_PORT set "DEFAULT_PORT=%ARG_PORT%"

if "%ARG_NO_VENV%"=="1" (
    if "%ARG_RESET%"=="1" (
        echo [Предупреждение] Параметр --reset игнорируется при запуске без виртуального окружения.
        set "ARG_RESET=0"
    )
)

call :validate_port "%DEFAULT_PORT%"
if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :error
)

call :check_windows_version

set "DISPLAY_HOST=%DEFAULT_HOST%"
set "FIREWALL_HINT=0"
for %%A in ("%DEFAULT_HOST%") do (
    if /I "%%~A"=="127.0.0.1" set "DISPLAY_HOST=127.0.0.1"
    if /I "%%~A"=="localhost" set "DISPLAY_HOST=127.0.0.1"
    if /I "%%~A"=="0.0.0.0" (
        set "DISPLAY_HOST=127.0.0.1"
        set "FIREWALL_HINT=1"
    ) else (
        if /I not "%%~A"=="127.0.0.1" if /I not "%%~A"=="localhost" set "FIREWALL_HINT=1"
    )
)
set "DISPLAY_URL=http://%DISPLAY_HOST%:%DEFAULT_PORT%"

call :detect_python
if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :error
)

if not defined PYTHON_EXEC set "PYTHON_EXEC=%PYTHON_CMD%"

set /a TOTAL_STEPS=3
if "%ARG_NO_VENV%"=="0" set /a TOTAL_STEPS+=2
set "STEP_INDEX=0"

if "%ARG_NO_VENV%"=="0" (
    call :print_step "Готовим виртуальное окружение (%VENV_DIR%)"
    if "%ARG_RESET%"=="1" if exist "%VENV_DIR%" (
        echo    - Удаляем старое виртуальное окружение...
        rmdir /s /q "%VENV_DIR%" || (
            set "EXIT_CODE=1"
            goto :error
        )
    )
    if not exist "%VENV_DIR%" (
        echo    - Создаем новое виртуальное окружение...
        %PYTHON_CMD% -m venv "%VENV_DIR%" || (
            set "EXIT_CODE=%ERRORLEVEL%"
            goto :error
        )
    ) else (
        echo    - Используем существующее окружение.
    )

    call :print_step "Активируем окружение"
    if exist "%VENV_DIR%\Scripts\activate.bat" (
        call "%VENV_DIR%\Scripts\activate.bat" || (
            set "EXIT_CODE=%ERRORLEVEL%"
            goto :error
        )
        set "PYTHON_EXEC=python"
    ) else (
        echo [Ошибка] Не найден файл активации окружения.
        set "EXIT_CODE=1"
        goto :error
    )
) else (
    echo [Инфо] Используем глобальную установку Python без виртуального окружения.
)

if "%ARG_SKIP_INSTALL%"=="0" (
    call :print_step "Устанавливаем зависимости из %REQUIREMENTS%"
    echo    - Обновляем pip...
    %PYTHON_EXEC% -m pip install --upgrade pip || (
        set "EXIT_CODE=%ERRORLEVEL%"
        goto :error
    )
    if exist "%REQUIREMENTS%" (
        echo    - Устанавливаем пакеты из %REQUIREMENTS%...
        %PYTHON_EXEC% -m pip install -r "%REQUIREMENTS%" || (
            set "EXIT_CODE=%ERRORLEVEL%"
            goto :error
        )
    ) else (
        echo [Предупреждение] Файл %REQUIREMENTS% не найден, установка зависимостей пропущена.
    )
) else (
    call :print_step "Пропускаем установку зависимостей по запросу"
)

call :print_step "Готовим конфигурацию запуска"
if not defined CRYPTO_PLAYGROUND_PATH (
    for %%I in ("%SCRIPT_DIR%..") do set "CRYPTO_PLAYGROUND_PATH=%%~fI"
) else (
    for %%I in ("%CRYPTO_PLAYGROUND_PATH%") do set "CRYPTO_PLAYGROUND_PATH=%%~fI"
)
set "FLASK_APP=app.py"
set "FLASK_ENV=production"
set "FLASK_RUN_HOST=%DEFAULT_HOST%"
set "FLASK_RUN_PORT=%DEFAULT_PORT%"
set "FLASK_DEBUG=0"
if defined PYTHONPATH (
    set "PYTHONPATH=%SCRIPT_DIR%;%PYTHONPATH%"
) else (
    set "PYTHONPATH=%SCRIPT_DIR%"
)
echo     Каталог проекта: %CRYPTO_PLAYGROUND_PATH%
echo     URL сервера: %DISPLAY_URL%
if "%FIREWALL_HINT%"=="1" (
    echo     Подсказка: разрешите доступ через брандмауэр Windows при первом запуске.
)
if "%ARG_BACKGROUND%"=="1" (
    echo     Режим запуска: отдельное окно командной строки.
) else (
    echo     Режим запуска: текущее окно консоли.
)
if "%ARG_OPEN_BROWSER%"=="1" (
    start "" "%DISPLAY_URL%"
)

call :print_step "Запускаем Flask-сервер (%DEFAULT_HOST%:%DEFAULT_PORT%)"
if "%ARG_BACKGROUND%"=="1" (
    call :start_background || (
        set "EXIT_CODE=1"
        goto :error
    )
    set "EXIT_CODE=0"
    goto :background_info
)

%PYTHON_EXEC% -m flask run --host %DEFAULT_HOST% --port %DEFAULT_PORT% --no-debugger --no-reload
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" goto :error

goto :cleanup

:background_info
echo.
echo Сервер запущен в отдельном окне. Чтобы остановить его, закройте окно или нажмите CTRL+C в нем.
echo Адрес интерфейса: %DISPLAY_URL%
goto :cleanup

:start_background
if "%ARG_NO_VENV%"=="0" (
    start "Crypto Playground Web" cmd /k "cd /d \"%SCRIPT_DIR%\" && call \"%VENV_DIR%\Scripts\activate.bat\" && python -m flask run --host %DEFAULT_HOST% --port %DEFAULT_PORT% --no-debugger --no-reload"
) else (
    start "Crypto Playground Web" cmd /k "cd /d \"%SCRIPT_DIR%\" && %PYTHON_CMD% -m flask run --host %DEFAULT_HOST% --port %DEFAULT_PORT% --no-debugger --no-reload"
)
if errorlevel 1 (
    echo [Ошибка] Не удалось открыть новое окно с сервером.
    exit /b 1
)
exit /b 0

:print_step
set /a STEP_INDEX+=1
echo [Шаг !STEP_INDEX!/!TOTAL_STEPS!] %~1
exit /b 0

:check_windows_version
set "WINDOWS_VERSION="
set "WINDOWS_VERSION_RAW="
set "WINDOWS_VERSION_MAJOR="
set "WINDOWS_VERSION_MINOR="
for /f "tokens=2 delims=[]" %%v in ('ver') do set "WINDOWS_VERSION_RAW=%%v"
if not defined WINDOWS_VERSION_RAW exit /b 0
for /f "tokens=2 delims= " %%a in ("!WINDOWS_VERSION_RAW!") do set "WINDOWS_VERSION=%%a"
if not defined WINDOWS_VERSION goto :check_windows_version_done
for /f "tokens=1-3 delims=." %%a in ("%WINDOWS_VERSION%") do (
    set "WINDOWS_VERSION_MAJOR=%%a"
    set "WINDOWS_VERSION_MINOR=%%b"
)
if not defined WINDOWS_VERSION_MAJOR goto :check_windows_version_done
if !WINDOWS_VERSION_MAJOR! LSS 10 (
    echo [Предупреждение] Обнаружена версия Windows !WINDOWS_VERSION!. Скрипт тестировался на Windows 10 и новее.
) else (
    echo [Инфо] Обнаружена Windows !WINDOWS_VERSION!.
)
:check_windows_version_done
exit /b 0

:detect_python
echo [Проверка] Проверяем Python...
where python >nul 2>nul
if not errorlevel 1 (
    set "PYTHON_CMD=python"
    goto :check_version
)
where py >nul 2>nul
if not errorlevel 1 (
    set "PYTHON_CMD=py -3"
    goto :check_version
)
echo [Ошибка] Python не найден в PATH.
exit /b 1

:check_version
for /f "tokens=2 delims= " %%i in ('%PYTHON_CMD% --version 2^>^&1') do set "_PY_VER=%%i"
for /f "tokens=1-3 delims=." %%a in ("%!_PY_VER!") do (
    set "_PY_MAJOR=%%a"
    set "_PY_MINOR=%%b"
)
if not defined _PY_MAJOR goto :version_fail
if !_PY_MAJOR! LSS 3 goto :version_fail
if !_PY_MAJOR! EQU 3 if !_PY_MINOR! LSS 10 goto :version_fail
echo [OK] Используется Python !_PY_VER!
exit /b 0

:version_fail
echo [Ошибка] Требуется Python 3.10 или новее (обнаружено !_PY_VER!).
exit /b 1

:validate_port
set "_PORT=%~1"
for /f "delims=0123456789" %%x in ("%_PORT%") do goto :port_fail
if %_PORT% LSS 1 goto :port_fail
if %_PORT% GTR 65535 goto :port_fail
exit /b 0
:port_fail
echo [Ошибка] Некорректное значение порта: %_PORT%
exit /b 1

:show_usage
echo.
echo Использование: run_local_server.bat [опции]
echo   --host ^<адрес^>        Задать адрес прослушивания (по умолчанию 0.0.0.0)
echo   --port ^<порт^>         Задать порт (по умолчанию 54583)
echo   --reset              Полностью пересоздать виртуальное окружение
echo   --skip-install       Пропустить установку зависимостей
echo   --open-browser       Автоматически открыть страницу в браузере
echo   --background         Запустить сервер в новом окне командной строки
echo   --no-venv            Использовать глобальный Python без виртуального окружения
echo   --help               Показать эту справку
echo.
exit /b 0

:error
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
echo.
echo Произошла ошибка при запуске. Код: %EXIT_CODE%
pause

:cleanup
if defined VIRTUAL_ENV call deactivate >nul 2>nul
popd
endlocal
exit /b %EXIT_CODE%
