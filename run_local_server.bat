@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Crypto Playground Web - локальный сервер

:: --------------------------------------------------------------
::  Crypto Playground Web - быстрый запуск (Windows 10/11)
:: --------------------------------------------------------------
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" || goto :fatal_error

set "EXIT_CODE=0"
set "VENV_DIR=.venv"
set "REQUIREMENTS=requirements.txt"
set "DEFAULT_HOST=0.0.0.0"
set "DEFAULT_PORT=54583"
set "HOST=%DEFAULT_HOST%"
set "PORT=%DEFAULT_PORT%"
set "USE_VENV=1"
set "RESET_VENV=0"
set "SKIP_INSTALL=0"
set "OPEN_BROWSER=0"
set "BACKGROUND=0"
set "PYTHON_CMD="
set "PYTHON_EXEC="

if "%~1"=="" goto :after_args

:parse_args
if "%~1"=="" goto :after_args
if /I "%~1"=="--help" goto :usage_ok
if /I "%~1"=="-h" goto :usage_ok
if /I "%~1"=="/h" goto :usage_ok
if /I "%~1"=="--reset" (set "RESET_VENV=1" & shift & goto :parse_args)
if /I "%~1"=="--skip-install" (set "SKIP_INSTALL=1" & shift & goto :parse_args)
if /I "%~1"=="--open-browser" (set "OPEN_BROWSER=1" & shift & goto :parse_args)
if /I "%~1"=="--background" (set "BACKGROUND=1" & shift & goto :parse_args)
if /I "%~1"=="--no-venv" (set "USE_VENV=0" & shift & goto :parse_args)
if /I "%~1"=="--host" (
    shift
    if "%~1"=="" (
        echo [Ошибка] Не передано значение для параметра --host.
        set "EXIT_CODE=1"
        goto :usage_error
    )
    set "HOST=%~1"
    shift
    goto :parse_args
)
if /I "%~1"=="--port" (
    shift
    if "%~1"=="" (
        echo [Ошибка] Не передано значение для параметра --port.
        set "EXIT_CODE=1"
        goto :usage_error
    )
    set "PORT=%~1"
    shift
    goto :parse_args
)
echo [Ошибка] Неизвестный параметр: %~1
set "EXIT_CODE=1"
goto :usage_error

:after_args
if "%USE_VENV%"=="0" if "%RESET_VENV%"=="1" (
    echo [Предупреждение] Параметр --reset игнорируется без виртуального окружения.
    set "RESET_VENV=0"
)

call :validate_port "%PORT%"
if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :cleanup
)

call :detect_python
if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :cleanup
)

call :prepare_environment
if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :cleanup
)

call :install_dependencies
if errorlevel 1 (
    set "EXIT_CODE=1"
    goto :cleanup
)

set "FLASK_APP=app.py"
set "FLASK_ENV=production"
set "FLASK_RUN_HOST=%HOST%"
set "FLASK_RUN_PORT=%PORT%"
set "FLASK_DEBUG=0"
if defined PYTHONPATH (
    set "PYTHONPATH=%SCRIPT_DIR%;%PYTHONPATH%"
) else (
    set "PYTHONPATH=%SCRIPT_DIR%"
)

set "DISPLAY_HOST=%HOST%"
if /I "%HOST%"=="0.0.0.0" set "DISPLAY_HOST=127.0.0.1"
if /I "%HOST%"=="localhost" set "DISPLAY_HOST=127.0.0.1"
set "DISPLAY_URL=http://%DISPLAY_HOST%:%PORT%"

echo.
echo [Готово] Окружение подготовлено.
echo     Каталог проекта: %SCRIPT_DIR%
echo     Python: %PYTHON_EXEC%
echo     Хост: %HOST%
echo     Порт: %PORT%
if /I not "%HOST%"=="127.0.0.1" if /I not "%HOST%"=="localhost" if /I not "%HOST%"=="0.0.0.0" (
    echo     Подсказка: убедитесь, что брандмауэр разрешает подключение.
) else if /I "%HOST%"=="0.0.0.0" (
    echo     Подсказка: Windows может запросить разрешение в брандмауэре.
)

if "%OPEN_BROWSER%"=="1" (
    start "" "%DISPLAY_URL%"
)

if "%BACKGROUND%"=="1" (
    call :start_background
    if errorlevel 1 (
        set "EXIT_CODE=1"
        goto :cleanup
    )
    echo.
    echo Сервер запущен в отдельном окне. Адрес: %DISPLAY_URL%
    goto :cleanup
)

%PYTHON_EXEC% -m flask run --host %HOST% --port %PORT% --no-debugger --no-reload
set "EXIT_CODE=%ERRORLEVEL%"
goto :cleanup

:start_background
if "%USE_VENV%"=="1" (
    start "Crypto Playground Web" cmd /k "cd /d "%SCRIPT_DIR%" ^& call "%VENV_DIR%\Scripts\activate.bat" ^& python -m flask run --host %HOST% --port %PORT% --no-debugger --no-reload"
) else (
    start "Crypto Playground Web" cmd /k "cd /d "%SCRIPT_DIR%" ^& %PYTHON_CMD% -m flask run --host %HOST% --port %PORT% --no-debugger --no-reload"
)
exit /b %ERRORLEVEL%

:install_dependencies
if "%SKIP_INSTALL%"=="1" (
    echo [Шаг] Установка зависимостей пропущена (--skip-install).
    if not defined PYTHON_EXEC set "PYTHON_EXEC=%PYTHON_CMD%"
    exit /b 0
)
if not defined PYTHON_EXEC set "PYTHON_EXEC=%PYTHON_CMD%"
echo [Шаг] Обновляем pip...
%PYTHON_EXEC% -m pip install --upgrade pip
if errorlevel 1 exit /b 1
if exist "%REQUIREMENTS%" (
    echo [Шаг] Устанавливаем пакеты из %REQUIREMENTS%...
    %PYTHON_EXEC% -m pip install -r "%REQUIREMENTS%"
    if errorlevel 1 exit /b 1
) else (
    echo [Предупреждение] Файл %REQUIREMENTS% не найден. Шаг пропущен.
)
exit /b 0

:prepare_environment
if "%USE_VENV%"=="0" (
    set "PYTHON_EXEC=%PYTHON_CMD%"
    exit /b 0
)
if "%RESET_VENV%"=="1" if exist "%VENV_DIR%" (
    echo [Шаг] Удаляем старое виртуальное окружение...
    rmdir /s /q "%VENV_DIR%"
    if exist "%VENV_DIR%" (
        echo [Ошибка] Не удалось удалить %VENV_DIR%.
        exit /b 1
    )
)
if not exist "%VENV_DIR%" (
    echo [Шаг] Создаем виртуальное окружение...
    %PYTHON_CMD% -m venv "%VENV_DIR%"
    if errorlevel 1 exit /b 1
)
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo [Ошибка] Не найден файл %VENV_DIR%\Scripts\activate.bat.
    exit /b 1
)
call "%VENV_DIR%\Scripts\activate.bat"
if errorlevel 1 exit /b 1
set "PYTHON_EXEC=python"
exit /b 0

:detect_python
echo [Проверка] Ищем Python...
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
for /f "tokens=1-3 delims=." %%a in ("!_PY_VER!") do (
    set "_PY_MAJOR=%%a"
    set "_PY_MINOR=%%b"
)
if not defined _PY_MAJOR goto :version_fail
if !_PY_MAJOR! LSS 3 goto :version_fail
if !_PY_MAJOR! EQU 3 if !_PY_MINOR! LSS 10 goto :version_fail
echo [OK] Найден Python !_PY_VER!
exit /b 0

:version_fail
echo [Ошибка] Требуется Python 3.10 или новее (обнаружено !_PY_VER!).
exit /b 1

:validate_port
set "_PORT=%~1"
if not defined _PORT goto :port_fail
for /f "delims=0123456789" %%x in ("%_PORT%") do goto :port_fail
if %_PORT% LSS 1 goto :port_fail
if %_PORT% GTR 65535 goto :port_fail
exit /b 0
:port_fail
echo [Ошибка] Некорректный порт: %_PORT%
exit /b 1

:show_usage
echo.
echo Использование: run_local_server.bat [опции]
echo   --host ^<адрес^>        Адрес прослушивания (по умолчанию %DEFAULT_HOST%)
echo   --port ^<порт^>         Порт (по умолчанию %DEFAULT_PORT%)
echo   --reset              Пересоздать виртуальное окружение
echo   --skip-install       Пропустить установку зависимостей
echo   --open-browser       Автоматически открыть браузер
echo   --background         Запустить сервер в отдельном окне
echo   --no-venv            Использовать глобальный Python
echo   --help               Показать эту справку
exit /b 0

:usage_ok
set "EXIT_CODE=0"
call :show_usage
goto :cleanup

:usage_error
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
call :show_usage
goto :cleanup

:fatal_error
echo [Ошибка] Не удалось перейти в каталог сценария.
set "EXIT_CODE=1"
goto :cleanup

:cleanup
set "RESULT=%EXIT_CODE%"
if defined VIRTUAL_ENV call deactivate >nul 2>nul
popd >nul 2>nul
endlocal & exit /b %RESULT%
