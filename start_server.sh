#!/bin/bash

# =============================================================================
# 🚀 CRYPTO PLAYGROUND WEB SERVER LAUNCHER
# =============================================================================
# Скрипт для запуска веб-сервера crypto-playground в один клик
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
    echo -e "${WHITE}🚀 CRYPTO PLAYGROUND WEB SERVER${NC}"
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
    
    print_status "Рабочая директория: $SCRIPT_DIR"
    
    # Проверяем, запущен ли уже сервер
    if pgrep -f "python.*app.py" > /dev/null; then
        print_warning "Сервер уже запущен!"
        echo -e "${CYAN}Процессы:${NC}"
        ps aux | grep "python.*app.py" | grep -v grep
        echo ""
        read -p "Перезапустить сервер? (y/N): " restart
        if [[ $restart =~ ^[Yy]$ ]]; then
            print_status "Останавливаем старый сервер..."
            pkill -f "python.*app.py"
            sleep 2
        else
            print_status "Сервер уже работает на http://localhost:54583"
            exit 0
        fi
    fi
    
    # Проверяем наличие app.py
    if [ ! -f "app.py" ]; then
        print_error "Файл app.py не найден в текущей директории!"
        exit 1
    fi
    
    # Проверяем наличие Python
    if ! command -v python &> /dev/null; then
        print_error "Python не установлен!"
        exit 1
    fi
    
    # Проверяем зависимости
    print_status "Проверяем зависимости..."
    if [ -f "requirements.txt" ]; then
        print_status "Устанавливаем зависимости из requirements.txt..."
        pip install -r requirements.txt > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            print_success "Зависимости установлены"
        else
            print_warning "Ошибка при установке зависимостей, но продолжаем..."
        fi
    fi
    
    # Создаем директории если не существуют
    print_status "Создаем необходимые директории..."
    mkdir -p static/css static/js static/images templates
    
    # Запускаем сервер
    print_status "Запускаем веб-сервер..."
    echo -e "${BLUE}Логи сервера будут записываться в server.log${NC}"
    echo ""
    
    # Запускаем в фоне
    nohup python app.py > server.log 2>&1 &
    SERVER_PID=$!
    
    # Ждем запуска
    sleep 3
    
    # Проверяем, запустился ли сервер
    if ps -p $SERVER_PID > /dev/null; then
        print_success "Сервер успешно запущен!"
        echo -e "${GREEN}🌐 URL: ${WHITE}http://localhost:54583${NC}"
        echo -e "${GREEN}📊 PID: ${WHITE}$SERVER_PID${NC}"
        echo -e "${GREEN}📝 Логи: ${WHITE}$SCRIPT_DIR/server.log${NC}"
        echo ""
        echo -e "${CYAN}Доступные страницы:${NC}"
        echo -e "  • Главная:    ${WHITE}http://localhost:54583${NC}"
        echo -e "  • Прокси:     ${WHITE}http://localhost:54583/proxies${NC}"
        echo -e "  • Модули:     ${WHITE}http://localhost:54583/modules${NC}"
        echo -e "  • Аккаунты:   ${WHITE}http://localhost:54583/accounts${NC}"
        echo -e "  • Логи:       ${WHITE}http://localhost:54583/logs${NC}"
        echo ""
        echo -e "${YELLOW}Для остановки сервера используйте:${NC} kill $SERVER_PID"
        echo -e "${YELLOW}Или запустите:${NC} ./stop_server.sh"
        
        # Сохраняем PID для остановки
        echo $SERVER_PID > server.pid
        
    else
        print_error "Не удалось запустить сервер!"
        echo -e "${RED}Проверьте логи:${NC} tail -f server.log"
        exit 1
    fi
}

# Обработка сигналов
trap 'print_warning "Получен сигнал прерывания. Завершение работы..."; exit 0' INT TERM

# Запуск основной функции
main "$@"