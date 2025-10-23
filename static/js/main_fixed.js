// Основной JavaScript файл для Crypto Playground Web

document.addEventListener('DOMContentLoaded', function() {
    initSidebar();
});

// Инициализация боковой панели
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mainContent = document.getElementById('mainContent');
    
    if (!sidebar || !sidebarToggle || !mainContent) {
        console.error('Required elements not found');
        return;
    }
    
    // Создаем кнопку для показа боковой панели
    const showSidebarBtn = document.createElement('button');
    showSidebarBtn.className = 'sidebar-show-btn';
    showSidebarBtn.title = 'Показать боковую панель';
    showSidebarBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h18M3 6h18M3 18h18"/>
        </svg>
    `;
    
    // Добавляем кнопку в основной контент
    mainContent.appendChild(showSidebarBtn);
    
    // Проверяем сохраненное состояние
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
    }
    
    // Обработчик клика по кнопке скрытия
    sidebarToggle.addEventListener('click', function() {
        sidebar.classList.add('collapsed');
        localStorage.setItem('sidebarCollapsed', 'true');
    });
    
    // Обработчик клика по кнопке показа
    showSidebarBtn.addEventListener('click', function() {
        sidebar.classList.remove('collapsed');
        localStorage.setItem('sidebarCollapsed', 'false');
    });
    
    // Добавляем tooltip для кнопки скрытия
    sidebarToggle.addEventListener('mouseenter', function() {
        showTooltip(sidebarToggle, 'Закрыть боковую панель');
    });
    
    sidebarToggle.addEventListener('mouseleave', function() {
        hideTooltip();
    });
}

// Функции для tooltip
function showTooltip(element, text) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = text;
    tooltip.style.cssText = `
        position: absolute;
        background-color: #1f1f1f;
        color: #ececec;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 1000;
        border: 1px solid #404040;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = element.getBoundingClientRect();
    tooltip.style.left = (rect.right + 8) + 'px';
    tooltip.style.top = (rect.top + (rect.height - tooltip.offsetHeight) / 2) + 'px';
}

function hideTooltip() {
    const tooltip = document.querySelector('.tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}