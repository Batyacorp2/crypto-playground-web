// Простой JavaScript для боковой панели

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing sidebar...');
    
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarExpand = document.getElementById('sidebarExpand');
    const mainContent = document.getElementById('mainContent');
    
    console.log('Elements found:', {
        sidebar: !!sidebar,
        sidebarToggle: !!sidebarToggle,
        sidebarExpand: !!sidebarExpand,
        mainContent: !!mainContent
    });
    
    if (!sidebar || !sidebarToggle) {
        console.error('Required elements not found');
        return;
    }
    
    // Создаем кнопку для показа боковой панели в основном контенте
    const showSidebarBtn = document.createElement('button');
    showSidebarBtn.className = 'sidebar-show-btn';
    showSidebarBtn.title = 'Показать боковую панель';
    showSidebarBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <path d="M9 9h6m-6 4h6"/>
        </svg>
    `;
    
    // Добавляем кнопку в основной контент если он существует
    if (mainContent) {
        mainContent.appendChild(showSidebarBtn);
        console.log('Show sidebar button added to main content');
    }
    
    // Обработчик клика по кнопке скрытия
    sidebarToggle.addEventListener('click', function() {
        console.log('Toggle button clicked, collapsing sidebar');
        sidebar.classList.add('collapsed');
    });
    
    // Обработчик клика по кнопке расширения в заголовке (если есть)
    if (sidebarExpand) {
        sidebarExpand.addEventListener('click', function() {
            console.log('Expand button clicked, expanding sidebar');
            sidebar.classList.remove('collapsed');
        });
    }
    
    // Обработчик клика по кнопке показа в основном контенте
    if (showSidebarBtn) {
        showSidebarBtn.addEventListener('click', function() {
            console.log('Show sidebar button clicked, expanding sidebar');
            sidebar.classList.remove('collapsed');
        });
    }
    
    console.log('Sidebar initialization complete');
});