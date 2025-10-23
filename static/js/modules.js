/**
 * JavaScript для страницы модулей
 */

class ModulesManager {
    constructor() {
        this.currentModule = null;
        this.currentSubmodule = null;
        this.isExecuting = false;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Обработчики для основных модулей
        document.querySelectorAll('.module-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const module = e.currentTarget.dataset.module;
                this.selectModule(module);
            });
        });
        
        // Обработчики для подмодулей
        document.querySelectorAll('.submodule-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const submodule = e.currentTarget.dataset.submodule;
                this.selectSubmodule(submodule);
            });
        });
        
        // Кнопки навигации
        document.getElementById('backToMain').addEventListener('click', () => {
            this.showMainModules();
        });
        
        document.getElementById('backTo2gis').addEventListener('click', () => {
            this.show2gisSubmenu();
        });
        
        // Кнопки формы 2gis comment
        document.getElementById('saveCommentData').addEventListener('click', () => {
            this.saveCommentData();
        });
        
        document.getElementById('run2gisComment').addEventListener('click', () => {
            this.run2gisComment();
        });
    }
    
    selectModule(module) {
        this.currentModule = module;
        
        switch (module) {
            case '2gis':
                this.show2gisSubmenu();
                break;
            case 'telegram':
            case 'discord':
            case 'twitter':
            case 'vk':
                this.showNotImplemented(module);
                break;
            default:
                console.log('Unknown module:', module);
        }
    }
    
    selectSubmodule(submodule) {
        this.currentSubmodule = submodule;
        
        switch (submodule) {
            case '2gis-comment':
                this.show2gisCommentForm();
                break;
            case '2gis-parse':
                this.showNotImplemented('2gis parse');
                break;
            default:
                console.log('Unknown submodule:', submodule);
        }
    }
    
    showMainModules() {
        document.getElementById('modulesMain').style.display = 'block';
        document.getElementById('modules2gis').style.display = 'none';
        document.getElementById('form2gisComment').style.display = 'none';
        this.currentModule = null;
        this.currentSubmodule = null;
    }
    
    show2gisSubmenu() {
        document.getElementById('modulesMain').style.display = 'none';
        document.getElementById('modules2gis').style.display = 'block';
        document.getElementById('form2gisComment').style.display = 'none';
        this.currentSubmodule = null;
    }
    
    show2gisCommentForm() {
        document.getElementById('modulesMain').style.display = 'none';
        document.getElementById('modules2gis').style.display = 'none';
        document.getElementById('form2gisComment').style.display = 'block';
        document.getElementById('executionStatus').style.display = 'none';
    }
    
    saveCommentData() {
        const commentData = document.getElementById('commentData').value.trim();
        
        if (!commentData) {
            this.showError('Введите данные для комментариев');
            return;
        }
        
        // Проверяем формат данных
        const lines = commentData.split('\n').filter(line => line.trim());
        let validLines = 0;
        
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 3) {
                validLines++;
            }
        }
        
        if (validLines === 0) {
            this.showError('Неверный формат данных. Используйте табуляцию между полями: ID<TAB>название адрес<TAB>комментарий');
            return;
        }
        
        // Отправляем данные на сервер
        fetch('/api/modules/2gis/comment/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: commentData
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showSuccess(`Сохранено ${validLines} записей в файл ${data.filename}`);
                document.getElementById('run2gisComment').style.display = 'inline-flex';
            } else {
                this.showError(data.error);
            }
        })
        .catch(error => {
            this.showError('Ошибка при сохранении данных: ' + error.message);
        });
    }
    
    run2gisComment() {
        if (this.isExecuting) {
            this.showError('Модуль уже выполняется');
            return;
        }
        
        this.isExecuting = true;
        
        // Показываем статус выполнения
        document.getElementById('executionStatus').style.display = 'block';
        document.getElementById('statusInfo').innerHTML = `
            <div class="status-item">
                <span class="status-label">Статус:</span>
                <span class="status-value running">Запуск...</span>
            </div>
            <div class="status-item">
                <span class="status-label">Модуль:</span>
                <span class="status-value">2gis.comment</span>
            </div>
        `;
        document.getElementById('executionLogs').innerHTML = '';
        
        // Отправляем запрос на запуск
        fetch('/api/modules/2gis/comment/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showSuccess('Модуль 2gis comment запущен');
                this.updateStatusInfo('running', 'Выполняется...');
            } else {
                this.showError(data.error);
                this.isExecuting = false;
            }
        })
        .catch(error => {
            this.showError('Ошибка при запуске модуля: ' + error.message);
            this.isExecuting = false;
        });
    }
    
    updateStatusInfo(status, message) {
        const statusValue = document.querySelector('.status-value.running');
        if (statusValue) {
            statusValue.className = `status-value ${status}`;
            statusValue.textContent = message;
        }
    }
    
    addExecutionLog(log) {
        const logsContainer = document.getElementById('executionLogs');
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `
            <span class="log-timestamp">${new Date(log.timestamp).toLocaleTimeString()}</span>
            <span class="log-message">${log.message}</span>
        `;
        logsContainer.appendChild(logEntry);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }
    
    showExecutionComplete(exitCode) {
        this.isExecuting = false;
        
        if (exitCode === 0) {
            this.updateStatusInfo('success', 'Завершено успешно');
            this.showSuccess('Модуль 2gis comment выполнен успешно');
        } else {
            this.updateStatusInfo('error', `Завершено с ошибкой (код: ${exitCode})`);
            this.showError(`Модуль завершен с ошибкой (код: ${exitCode})`);
        }
    }
    
    showNotImplemented(moduleName) {
        this.showInfo(`Модуль "${moduleName}" находится в разработке`);
    }
    
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    showInfo(message) {
        this.showNotification(message, 'info');
    }
    
    showNotification(message, type) {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;
        
        // Добавляем в DOM
        document.body.appendChild(notification);
        
        // Показываем уведомление
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Обработчик закрытия
        notification.querySelector('.notification-close').addEventListener('click', () => {
            this.hideNotification(notification);
        });
        
        // Автоматическое скрытие через 5 секунд
        setTimeout(() => {
            this.hideNotification(notification);
        }, 5000);
    }
    
    hideNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
}

// Инициализируем менеджер модулей при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new ModulesManager();
});