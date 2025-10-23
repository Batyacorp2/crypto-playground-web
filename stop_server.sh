#!/bin/bash

# =============================================================================
# 🛑 CRYPTO PLAYGROUND WEB SERVER STOPPER
# =============================================================================
# Скрипт для остановки веб-сервера crypto-playground
# Автор: OpenHands AI Assistant
# Дата: 23.10.2025
# =============================================================================

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Функция для красивого вывода
print_header() {
    echo -e "${PURPLE}=================================${NC}"
    echo -e "${WHITE}🛑 CRYPTO PLAYGROUND STOPPER${NC}"
    echo -e "${PURPLE}=================================${NC}"
}

print_status() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Основная функция
main() {
    print_header
    
    # Получаем директорию скрипта
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$SCRIPT_DIR"
    
    # Проверяем файл с PID
    if [ -f "server.pid" ]; then
        SERVER_PID=$(cat server.pid)
        print_status "Найден PID сервера: $SERVER_PID"
        
        if ps -p $SERVER_PID > /dev/null; then
            print_status "Останавливаем сервер (PID: $SERVER_PID)..."
            kill $SERVER_PID
            sleep 2
            
            if ps -p $SERVER_PID > /dev/null; then
                print_warning "Сервер не остановился, принудительная остановка..."
                kill -9 $SERVER_PID
                sleep 1
            fi
            
            if ! ps -p $SERVER_PID > /dev/null; then
                print_success "Сервер остановлен!"
                rm -f server.pid
            else
                print_error "Не удалось остановить сервер!"
                exit 1
            fi
        else
            print_warning "Процесс с PID $SERVER_PID не найден"
            rm -f server.pid
        fi
    fi
    
    # Ищем все процессы python app.py
    PIDS=$(pgrep -f "python.*app.py")
    if [ ! -z "$PIDS" ]; then
        print_status "Найдены дополнительные процессы сервера:"
        ps aux | grep "python.*app.py" | grep -v grep
        echo ""
        
        for pid in $PIDS; do
            print_status "Останавливаем процесс $pid..."
            kill $pid
        done
        
        sleep 2
        
        # Проверяем, остались ли процессы
        REMAINING=$(pgrep -f "python.*app.py")
        if [ ! -z "$REMAINING" ]; then
            print_warning "Принудительная остановка оставшихся процессов..."
            pkill -9 -f "python.*app.py"
        fi
        
        sleep 1
        
        if ! pgrep -f "python.*app.py" > /dev/null; then
            print_success "Все процессы сервера остановлены!"
        else
            print_error "Некоторые процессы все еще работают!"
            ps aux | grep "python.*app.py" | grep -v grep
        fi
    else
        print_status "Сервер не запущен"
    fi
    
    # Очистка временных файлов
    print_status "Очистка временных файлов..."
    rm -f server.pid nohup.out
    
    print_success "Готово!"
}

# Запуск основной функции
main "$@"