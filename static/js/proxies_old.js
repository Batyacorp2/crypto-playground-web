/**
 * JavaScript для страницы тестирования прокси
 */

class ProxyTester {
    constructor() {
        this.socket = io();
        this.isTestingActive = false;
        this.currentResults = null;
        this.exportedFilename = null;
        
        console.log('ProxyTester initialized');
        
        this.setupEventListeners();
        this.setupSocketListeners();
    }
    
    setupEventListeners() {
        // Кнопка тестирования
        document.getElementById('testProxies').addEventListener('click', () => {
            this.startTesting();
        });
        
        // Кнопка очистки
        document.getElementById('clearInput').addEventListener('click', () => {
            document.getElementById('proxyInput').value = '';
            this.hideResults();
        });
        
        // Кнопка копирования
        document.getElementById('copyResults').addEventListener('click', () => {
            this.copyToClipboard();
        });
        
        // Кнопка экспорта
        document.getElementById('exportTsv').addEventListener('click', () => {
            this.exportToTsv();
        });
        
        // Кнопка синхронизации с БД
        document.getElementById('syncDb').addEventListener('click', () => {
            this.syncToDatabase();
        });
    }
    
    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('WebSocket connected');
        });
        
        this.socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
        });
        
        this.socket.on('proxy_test_progress', (data) => {
            console.log('Received proxy_test_progress:', data);
            this.updateProgress(data);
        });
        
        this.socket.on('proxy_test_complete', (data) => {
            console.log('Received proxy_test_complete:', data);
            this.showResults(data);
        });
        
        this.socket.on('log_update', (data) => {
            if (data.command_id && data.command_id.startsWith('proxy_sync_')) {
                this.showSyncLog(data.log);
            }
        });
        
        this.socket.on('process_finished', (data) => {
            if (data.command_id && data.command_id.startsWith('proxy_sync_')) {
                this.showSyncComplete(data.exit_code);
            }
        });
    }
    
    startTesting() {
        const proxyInput = document.getElementById('proxyInput');
        const proxies = proxyInput.value.trim();
        
        if (!proxies) {
            this.showError('Введите список прокси серверов');
            return;
        }
        
        if (this.isTestingActive) {
            this.showError('Тестирование уже выполняется');
            return;
        }
        
        // Показываем прогресс
        this.showProgress();
        this.hideResults();
        
        // Отправляем запрос на тестирование
        fetch('/api/proxies/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                proxies: proxies
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.isTestingActive = true;
                this.showSuccess(data.message);
            } else {
                this.showError(data.error);
                this.hideProgress();
            }
        })
        .catch(error => {
            this.showError('Ошибка при запуске тестирования: ' + error.message);
            this.hideProgress();
        });
    }
    
    updateProgress(data) {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const totalCount = document.getElementById('totalCount');
        const testedCount = document.getElementById('testedCount');
        const workingCount = document.getElementById('workingCount');
        const uniqueCount = document.getElementById('uniqueCount');
        
        // Обновляем прогресс-бар
        progressFill.style.width = data.progress + '%';
        progressText.textContent = `Тестирование прокси... ${data.tested}/${data.total}`;
        
        // Обновляем статистику
        totalCount.textContent = data.total;
        testedCount.textContent = data.tested;
        workingCount.textContent = data.working;
        uniqueCount.textContent = data.unique;
    }
    
    showResults(data) {
        this.isTestingActive = false;
        this.hideProgress();
        
        if (!data.success) {
            this.showError(data.error);
            return;
        }
        
        this.currentResults = data;
        
        if (data.unique_proxies.length === 0) {
            this.showNoResults();
            return;
        }
        
        // Показываем результаты
        const resultsContainer = document.getElementById('resultsContainer');
        const proxyList = document.getElementById('proxyList');
        
        // Создаем список прокси
        let html = '<div class="proxy-items">';
        data.preview_results.forEach((proxy, index) => {
            html += `
                <div class="proxy-item">
                    <span class="proxy-number">${index + 1}</span>
                    <span class="proxy-address">${proxy}</span>
                    <span class="proxy-status">✓ Работает</span>
                </div>
            `;
        });
        
        if (data.unique_proxies.length > 10) {
            html += `
                <div class="proxy-item more-results">
                    <span class="more-text">... и еще ${data.unique_proxies.length - 10} прокси</span>
                </div>
            `;
        }
        
        html += '</div>';
        proxyList.innerHTML = html;
        
        resultsContainer.style.display = 'block';
        
        this.showSuccess(`Найдено ${data.stats.unique} уникальных прокси из ${data.stats.total} протестированных`);
    }
    
    showProgress() {
        const testingProgress = document.getElementById('testingProgress');
        testingProgress.style.display = 'block';
        
        // Сбрасываем прогресс
        document.getElementById('progressFill').style.width = '0%';
        document.getElementById('progressText').textContent = 'Подготовка к тестированию...';
        document.getElementById('totalCount').textContent = '0';
        document.getElementById('testedCount').textContent = '0';
        document.getElementById('workingCount').textContent = '0';
        document.getElementById('uniqueCount').textContent = '0';
    }
    
    hideProgress() {
        const testingProgress = document.getElementById('testingProgress');
        testingProgress.style.display = 'none';
    }
    
    hideResults() {
        const resultsContainer = document.getElementById('resultsContainer');
        const noResults = document.getElementById('noResults');
        resultsContainer.style.display = 'none';
        noResults.style.display = 'none';
    }
    
    showNoResults() {
        const noResults = document.getElementById('noResults');
        noResults.style.display = 'block';
    }
    
    copyToClipboard() {
        if (!this.currentResults || !this.currentResults.unique_proxies.length) {
            this.showError('Нет результатов для копирования');
            return;
        }
        
        const text = this.currentResults.unique_proxies.join('\n');
        
        navigator.clipboard.writeText(text).then(() => {
            this.showSuccess(`Скопировано ${this.currentResults.unique_proxies.length} прокси в буфер обмена`);
        }).catch(err => {
            this.showError('Ошибка при копировании: ' + err.message);
        });
    }
    
    exportToTsv() {
        if (!this.currentResults || !this.currentResults.unique_proxies.length) {
            this.showError('Нет результатов для экспорта');
            return;
        }
        
        fetch('/api/proxies/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.exportedFilename = data.filename;
                this.showSuccess(`Экспортировано ${data.count} прокси в файл ${data.filename}`);
                
                // Показываем кнопку синхронизации с БД
                document.getElementById('syncDb').style.display = 'inline-block';
            } else {
                this.showError(data.error);
            }
        })
        .catch(error => {
            this.showError('Ошибка при экспорте: ' + error.message);
        });
    }
    
    syncToDatabase() {
        if (!this.exportedFilename) {
            this.showError('Сначала экспортируйте прокси в файл');
            return;
        }
        
        fetch('/api/proxies/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: this.exportedFilename
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showSuccess('Запущена синхронизация прокси с базой данных');
            } else {
                this.showError(data.error);
            }
        })
        .catch(error => {
            this.showError('Ошибка при синхронизации: ' + error.message);
        });
    }
    
    showSyncLog(log) {
        // Можно добавить отображение логов синхронизации
        console.log('Sync log:', log.message);
    }
    
    showSyncComplete(exitCode) {
        if (exitCode === 0) {
            this.showSuccess('Синхронизация с базой данных завершена успешно');
        } else {
            this.showError(`Синхронизация завершена с ошибкой (код: ${exitCode})`);
        }
    }
    
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    showError(message) {
        this.showNotification(message, 'error');
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

// Инициализируем тестер прокси при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new ProxyTester();
});