// Основной JavaScript файл для Crypto Playground Web

document.addEventListener('DOMContentLoaded', function() {
    initSidebar();
});

// Инициализация боковой панели
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mainContent = document.getElementById('mainContent');
    
    console.log('Sidebar:', sidebar);
    console.log('SidebarToggle:', sidebarToggle);
    console.log('MainContent:', mainContent);
    
    // Создаем кнопку для показа боковой панели
    const showSidebarBtn = document.createElement('button');
    showSidebarBtn.className = 'sidebar-show-btn';
    showSidebarBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h18M3 6h18M3 18h18"/>
        </svg>
    `;
    showSidebarBtn.title = 'Показать боковую панель';
    document.body.appendChild(showSidebarBtn);
    
    // Обработчик для скрытия боковой панели
    sidebarToggle.addEventListener('click', function() {
        sidebar.classList.add('collapsed');
        localStorage.setItem('sidebarCollapsed', 'true');
    });
    
    // Обработчик для показа боковой панели
    showSidebarBtn.addEventListener('click', function() {
        sidebar.classList.remove('collapsed');
        localStorage.setItem('sidebarCollapsed', 'false');
    });
    
    // Восстановление состояния боковой панели из localStorage
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
    } else {
        // Убеждаемся, что боковая панель видна по умолчанию
        sidebar.classList.remove('collapsed');
    }
    
    // Обработка клика вне боковой панели на мобильных устройствах
    document.addEventListener('click', function(event) {
        if (window.innerWidth <= 768) {
            const isClickInsideSidebar = sidebar.contains(event.target);
            const isClickOnShowBtn = showSidebarBtn.contains(event.target);
            
            if (!isClickInsideSidebar && !isClickOnShowBtn && !sidebar.classList.contains('collapsed')) {
                sidebar.classList.add('collapsed');
            }
        }
    });
    
    // Обработка изменения размера окна
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            // На десктопе восстанавливаем состояние из localStorage
            const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
            if (isCollapsed) {
                sidebar.classList.add('collapsed');
            } else {
                sidebar.classList.remove('collapsed');
            }
        }
        // Убираем автоматическое скрытие на мобильных устройствах
    });
}

// Утилитарные функции
function showNotification(message, type = 'info') {
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Добавляем стили для уведомления
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10a37f' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Анимация появления
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Автоматическое скрытие через 3 секунды
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Функция для форматирования времени
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Функция для форматирования размера файла
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Экспорт функций для использования в других скриптах
window.CryptoPlayground = {
    showNotification,
    formatTime,
    formatFileSize
};