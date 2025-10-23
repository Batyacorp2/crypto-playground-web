/**
 * JavaScript для страницы тестирования прокси (HTTP polling версия)
 */

class ProxyTester {
    constructor() {
        this.isTestingActive = false;
        this.currentResults = null;
        this.exportedFilename = null;
        this.progressInterval = null;
        
        console.log('ProxyTester initialized (HTTP polling version)');
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Кнопка тестирования
        document.getElementById('testProxies').addEventListener('click', () => {
            this.startTesting();
        });
        
        // Кнопка остановки
        document.getElementById('stopTesting').addEventListener('click', () => {
            this.stopTesting();
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
        
        // Обработчики табов
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
    }
    
    async startTesting() {
        const proxyInput = document.getElementById('proxyInput');
        const proxies = proxyInput.value.trim();
        
        if (!proxies) {
            this.showNotification('Введите список прокси для тестирования', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/proxies/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ proxies: proxies })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.isTestingActive = true;
                this.showTestingUI();
                this.showNotification(data.message, 'success');
                this.startProgressPolling();
            } else {
                this.showNotification(data.error || 'Ошибка запуска тестирования', 'error');
            }
        } catch (error) {
            console.error('Error starting test:', error);
            this.showNotification('Ошибка соединения с сервером', 'error');
        }
    }
    
    async stopTesting() {
        try {
            const response = await fetch('/api/proxies/stop', {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.isTestingActive = false;
                this.stopProgressPolling();
                this.hideTestingUI();
                this.showNotification('Тестирование остановлено', 'info');
            }
        } catch (error) {
            console.error('Error stopping test:', error);
            this.showNotification('Ошибка остановки тестирования', 'error');
        }
    }
    
    startProgressPolling() {
        // Опрашиваем прогресс каждую секунду
        this.progressInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/proxies/progress');
                const data = await response.json();
                
                this.updateProgress(data);
                
                if (!data.is_running && this.isTestingActive) {
                    // Тестирование завершено
                    this.isTestingActive = false;
                    this.stopProgressPolling();
                    this.hideTestingUI();
                    await this.loadResults();
                    this.showNotification('Тестирование завершено!', 'success');
                }
            } catch (error) {
                console.error('Error polling progress:', error);
            }
        }, 1000);
    }
    
    stopProgressPolling() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }
    
    async loadResults() {
        try {
            const [workingResponse, uniqueResponse] = await Promise.all([
                fetch('/api/proxies/working'),
                fetch('/api/proxies/unique')
            ]);
            
            const workingData = await workingResponse.json();
            const uniqueData = await uniqueResponse.json();
            
            this.currentResults = {
                working_proxies: workingData.working || [],
                unique_proxies: uniqueData.unique || []
            };
            
            this.displayResults();
        } catch (error) {
            console.error('Error loading results:', error);
            this.showNotification('Ошибка загрузки результатов', 'error');
        }
    }
    
    updateProgress(data) {
        const progressBar = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        const statsElements = {
            tested: document.getElementById('testedCount'),
            working: document.getElementById('workingCount'),
            unique: document.getElementById('uniqueCount'),
            failed: document.getElementById('failedCount')
        };
        
        if (data.total > 0) {
            const percentage = Math.round((data.current / data.total) * 100);
            
            if (progressBar) {
                progressBar.style.width = percentage + '%';
            }
            
            if (progressText) {
                progressText.textContent = `${data.current}/${data.total} (${percentage}%)`;
            }
        }
        
        // Обновляем статистику
        if (statsElements.tested) statsElements.tested.textContent = data.current || 0;
        if (statsElements.working) statsElements.working.textContent = data.working || 0;
        if (statsElements.unique) statsElements.unique.textContent = data.unique_ips || 0;
        if (statsElements.failed) statsElements.failed.textContent = data.failed || 0;
    }
    
    showTestingUI() {
        const testButton = document.getElementById('testProxies');
        const stopButton = document.getElementById('stopTesting');
        const progressSection = document.querySelector('.progress-section');
        
        if (testButton) {
            testButton.style.display = 'none';
        }
        
        if (stopButton) {
            stopButton.style.display = 'inline-block';
        }
        
        if (progressSection) {
            progressSection.style.display = 'block';
        }
        
        this.hideResults();
    }
    
    hideTestingUI() {
        const testButton = document.getElementById('testProxies');
        const stopButton = document.getElementById('stopTesting');
        const progressSection = document.querySelector('.progress-section');
        
        if (testButton) {
            testButton.style.display = 'inline-block';
        }
        
        if (stopButton) {
            stopButton.style.display = 'none';
        }
        
        if (progressSection) {
            progressSection.style.display = 'none';
        }
    }
    
    displayResults() {
        if (!this.currentResults) return;
        
        const resultsSection = document.querySelector('.results-section');
        const workingList = document.getElementById('workingProxies');
        const uniqueList = document.getElementById('uniqueProxies');
        const workingCount = document.getElementById('workingProxiesCount');
        const uniqueCount = document.getElementById('uniqueProxiesCount');
        
        if (resultsSection) {
            resultsSection.style.display = 'block';
        }
        
        // Отображаем рабочие прокси
        if (workingList && this.currentResults.working_proxies) {
            if (this.currentResults.working_proxies.length > 0) {
                workingList.innerHTML = this.currentResults.working_proxies
                    .map(proxy => `<div class="proxy-item">${proxy}</div>`)
                    .join('');
            } else {
                workingList.innerHTML = '<div class="empty-state">Рабочие прокси не найдены</div>';
            }
        }
        
        // Отображаем уникальные прокси
        if (uniqueList && this.currentResults.unique_proxies) {
            if (this.currentResults.unique_proxies.length > 0) {
                uniqueList.innerHTML = this.currentResults.unique_proxies
                    .map(proxy => `<div class="proxy-item">${proxy}</div>`)
                    .join('');
            } else {
                uniqueList.innerHTML = '<div class="empty-state">Уникальные прокси не найдены</div>';
            }
        }
        
        // Обновляем счетчики
        if (workingCount) {
            workingCount.textContent = this.currentResults.working_proxies.length;
        }
        
        if (uniqueCount) {
            uniqueCount.textContent = this.currentResults.unique_proxies.length;
        }
    }
    
    hideResults() {
        const resultsSection = document.querySelector('.results-section');
        if (resultsSection) {
            resultsSection.style.display = 'none';
        }
        this.currentResults = null;
    }
    
    async copyToClipboard() {
        if (!this.currentResults || !this.currentResults.unique_proxies.length) {
            this.showNotification('Нет результатов для копирования', 'error');
            return;
        }
        
        try {
            const text = this.currentResults.unique_proxies.join('\n');
            await navigator.clipboard.writeText(text);
            this.showNotification(`Скопировано ${this.currentResults.unique_proxies.length} уникальных прокси`, 'success');
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            this.showNotification('Ошибка копирования в буфер обмена', 'error');
        }
    }
    
    async exportToTsv() {
        if (!this.currentResults || !this.currentResults.unique_proxies.length) {
            this.showNotification('Нет результатов для экспорта', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/proxies/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.exportedFilename = data.filename;
                this.showNotification(`Экспортировано в файл: ${data.filename}`, 'success');
            } else {
                this.showNotification(data.error || 'Ошибка экспорта', 'error');
            }
        } catch (error) {
            console.error('Error exporting:', error);
            this.showNotification('Ошибка экспорта файла', 'error');
        }
    }
    
    async syncToDatabase() {
        if (!this.currentResults || !this.currentResults.unique_proxies.length) {
            this.showNotification('Нет результатов для синхронизации', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/proxies/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showNotification(`Синхронизировано ${data.count} прокси с базой данных`, 'success');
            } else {
                this.showNotification(data.error || 'Ошибка синхронизации', 'error');
            }
        } catch (error) {
            console.error('Error syncing:', error);
            this.showNotification('Ошибка синхронизации с базой данных', 'error');
        }
    }
    
    switchTab(tabName) {
        // Убираем активный класс со всех кнопок и панелей
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        
        // Добавляем активный класс к выбранным элементам
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}Proxies`).classList.add('active');
    }

    showNotification(message, type = 'info') {
        if (window.notificationCenter) {
            window.notificationCenter.show(message, type);
        } else {
            // Резервный вариант
            console.log(`[${type}] ${message}`);
        }
    }
}

// Инициализируем тестер при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.proxyTester = new ProxyTester();
});