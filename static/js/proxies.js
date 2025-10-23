/**
 * JavaScript для страницы тестирования прокси (HTTP polling версия)
 */

class ProxyTester {
    constructor() {
        this.isTestingActive = false;
        this.progressInterval = null;
        this.currentResults = {
            working_proxies: [],
            unique_proxies: [],
        };
        this.exportedFilename = null;
        this.syncCommand = null;
        this.stateStorageKey = 'cp_proxy_tester_state';
        this.activeTab = 'unique';

        this.restorePersistedState();
        this.setupEventListeners();
        this.initializeState();
    }

    restorePersistedState() {
        const rawState = localStorage.getItem(this.stateStorageKey);
        const proxyInput = document.getElementById('proxyInput');

        if (proxyInput) {
            proxyInput.addEventListener('input', () => this.persistState());
        }

        if (!rawState) {
            this.setExportedFilename(null, { skipPersist: true });
            return;
        }

        try {
            const state = JSON.parse(rawState);

            if (proxyInput && typeof state.input === 'string') {
                proxyInput.value = state.input;
            }

            if (typeof state.activeTab === 'string') {
                this.activeTab = state.activeTab;
            }

            if (state.exportedFilename) {
                this.setExportedFilename(state.exportedFilename, { skipPersist: true });
            } else {
                this.setExportedFilename(null, { skipPersist: true });
            }
        } catch (error) {
            console.warn('Не удалось восстановить состояние proxy tester:', error);
            this.setExportedFilename(null, { skipPersist: true });
        }
    }

    setupEventListeners() {
        const testButton = document.getElementById('testProxies');
        const stopButton = document.getElementById('stopTesting');
        const clearButton = document.getElementById('clearInput');
        const copyButton = document.getElementById('copyResults');
        const exportButton = document.getElementById('exportTsv');
        const syncButton = document.getElementById('syncDb');
        const proxyInput = document.getElementById('proxyInput');

        if (testButton) {
            testButton.addEventListener('click', () => this.startTesting());
        }

        if (stopButton) {
            stopButton.addEventListener('click', () => this.stopTesting());
        }

        if (clearButton) {
            clearButton.addEventListener('click', () => {
                if (proxyInput) {
                    proxyInput.value = '';
                }
                this.hideResults();
                this.persistState();
            });
        }

        if (copyButton) {
            copyButton.addEventListener('click', () => this.copyToClipboard());
        }

        if (exportButton) {
            exportButton.addEventListener('click', () => this.exportToTsv());
        }

        if (syncButton) {
            syncButton.addEventListener('click', () => this.syncToDatabase());
        }

        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                const tabName = event.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    async initializeState() {
        await this.loadResults({ initial: true, restoreTab: true });
    }

    async startTesting() {
        const proxyInput = document.getElementById('proxyInput');
        if (!proxyInput) {
            return;
        }

        const proxies = proxyInput.value.trim();

        if (!proxies) {
            this.showNotification('Введите список прокси для тестирования', 'error');
            return;
        }

        try {
            const response = await fetch('/api/proxies/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ proxies }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.isTestingActive = true;
                this.showTestingUI();
                this.setExportedFilename(null);
                this.showNotification(data.message || 'Тестирование запущено', 'success');
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
                method: 'POST',
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.isTestingActive = false;
                this.stopProgressPolling();
                this.hideTestingUI();
                this.showNotification('Тестирование остановлено', 'info');
                await this.loadResults({ restoreTab: true });
            } else {
                this.showNotification(data.error || 'Не удалось остановить тестирование', 'error');
            }
        } catch (error) {
            console.error('Error stopping test:', error);
            this.showNotification('Ошибка остановки тестирования', 'error');
        }
    }

    showTestingUI() {
        const testButton = document.getElementById('testProxies');
        const stopButton = document.getElementById('stopTesting');
        const progressSection = document.querySelector('.progress-section');
        const progressText = document.querySelector('.progress-text');
        const progressBar = document.querySelector('.progress-fill');

        if (testButton) {
            testButton.style.display = 'none';
        }

        if (stopButton) {
            stopButton.style.display = 'inline-flex';
        }

        if (progressSection) {
            progressSection.style.display = 'block';
        }

        if (progressText) {
            progressText.textContent = 'Подготовка к тестированию...';
        }

        if (progressBar) {
            progressBar.style.width = '0%';
        }

        this.hideResults();
    }

    hideTestingUI() {
        const testButton = document.getElementById('testProxies');
        const stopButton = document.getElementById('stopTesting');
        const progressSection = document.querySelector('.progress-section');

        if (testButton) {
            testButton.style.display = 'inline-flex';
        }

        if (stopButton) {
            stopButton.style.display = 'none';
        }

        if (progressSection) {
            progressSection.style.display = 'none';
        }
    }

    startProgressPolling() {
        if (this.progressInterval) {
            return;
        }

        this.progressInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/proxies/progress');
                if (!response.ok) {
                    return;
                }

                const data = await response.json();
                this.updateProgress(data);

                if (!data.is_running && this.isTestingActive) {
                    this.isTestingActive = false;
                    this.stopProgressPolling();
                    this.hideTestingUI();
                    await this.loadResults({
                        autoSwitchTab: 'unique',
                        showNoResults: true,
                    });
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

    updateProgress(data = {}) {
        const progressBar = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        const statsElements = {
            tested: document.getElementById('testedCount'),
            working: document.getElementById('workingCount'),
            unique: document.getElementById('uniqueCount'),
            failed: document.getElementById('failedCount'),
        };

        const total = Number(data.total) || 0;
        const current = Number(data.current) || 0;
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = total > 0
                ? `${current}/${total} (${percentage}%)`
                : 'Ожидание результатов...';
        }

        if (statsElements.tested) statsElements.tested.textContent = current;
        if (statsElements.working) statsElements.working.textContent = Number(data.working) || 0;
        if (statsElements.unique) statsElements.unique.textContent = Number(data.unique_ips) || 0;
        if (statsElements.failed) statsElements.failed.textContent = Number(data.failed) || 0;
    }

    async loadResults(options = {}) {
        const { initial = false, autoSwitchTab = null, showNoResults = false, restoreTab = false } = options;

        try {
            const response = await fetch('/api/proxies/state');
            if (!response.ok) {
                throw new Error('Bad response');
            }

            const data = await response.json();
            this.applyState(data, {
                initial,
                autoSwitchTab,
                showNoResults,
                restoreTab,
            });
        } catch (error) {
            console.error('Error loading results:', error);
            if (!initial) {
                this.showNotification('Ошибка загрузки результатов', 'error');
            }
        }
    }

    applyState(data = {}, options = {}) {
        const { initial = false, autoSwitchTab = null, showNoResults = false, restoreTab = false } = options;

        if (data.is_running) {
            this.isTestingActive = true;
            this.showTestingUI();
            this.startProgressPolling();
        } else {
            this.isTestingActive = false;
            this.hideTestingUI();
            this.stopProgressPolling();
        }

        if (data.progress) {
            this.updateProgress(data.progress);
        }

        const working = Array.isArray(data.working) ? data.working : [];
        const unique = Array.isArray(data.unique) ? data.unique : [];

        this.currentResults = {
            working_proxies: working,
            unique_proxies: unique,
        };

        const hasAnyResults = working.length > 0 || unique.length > 0;

        this.displayResults({
            autoSwitchTab,
            restoreTab,
            showNoResults: showNoResults && !hasAnyResults,
        });

        const exportedFilename = data.exported_filename || null;
        this.setExportedFilename(exportedFilename, { skipPersist: true });

        this.persistState();
    }

    displayResults(options = {}) {
        const { autoSwitchTab = null, restoreTab = false, showNoResults = false } = options;

        const resultsSection = document.querySelector('.results-section');
        const noResultsBlock = document.getElementById('noResults');
        const workingList = document.getElementById('workingProxies');
        const uniqueList = document.getElementById('uniqueProxies');
        const workingCount = document.getElementById('workingProxiesCount');
        const uniqueCount = document.getElementById('uniqueProxiesCount');

        const working = this.currentResults?.working_proxies || [];
        const unique = this.currentResults?.unique_proxies || [];
        const hasResults = working.length > 0 || unique.length > 0;
        const shouldShow = hasResults || showNoResults;

        if (!shouldShow) {
            if (resultsSection) {
                resultsSection.style.display = 'none';
            }
            if (noResultsBlock) {
                noResultsBlock.style.display = 'none';
            }
            if (workingCount) workingCount.textContent = '0';
            if (uniqueCount) uniqueCount.textContent = '0';
            return;
        }

        if (resultsSection) {
            resultsSection.style.display = 'block';
        }

        if (workingCount) workingCount.textContent = working.length;
        if (uniqueCount) uniqueCount.textContent = unique.length;

        if (noResultsBlock) {
            noResultsBlock.style.display = hasResults ? 'none' : 'block';
        }

        if (hasResults) {
            if (workingList) {
                workingList.innerHTML = working
                    .map((proxy) => `<div class="proxy-item">${proxy}</div>`)
                    .join('');
            }

            if (uniqueList) {
                uniqueList.innerHTML = unique
                    .map((proxy) => `<div class="proxy-item">${proxy}</div>`)
                    .join('');
            }
        } else {
            if (workingList) {
                workingList.innerHTML = '<div class="empty-state">Рабочие прокси не найдены</div>';
            }

            if (uniqueList) {
                uniqueList.innerHTML = '<div class="empty-state">Уникальные прокси не найдены</div>';
            }
        }

        let targetTab = autoSwitchTab;
        if (!targetTab) {
            if (restoreTab && this.activeTab) {
                targetTab = this.activeTab;
            } else if (unique.length > 0) {
                targetTab = 'unique';
            } else {
                targetTab = 'working';
            }
        }

        this.switchTab(targetTab, { skipSave: !autoSwitchTab && restoreTab });
    }

    hideResults(options = {}) {
        const { preserveState = false } = options;
        const resultsSection = document.querySelector('.results-section');
        const noResultsBlock = document.getElementById('noResults');
        const workingList = document.getElementById('workingProxies');
        const uniqueList = document.getElementById('uniqueProxies');
        const workingCount = document.getElementById('workingProxiesCount');
        const uniqueCount = document.getElementById('uniqueProxiesCount');

        if (resultsSection) {
            resultsSection.style.display = 'none';
        }
        if (noResultsBlock) {
            noResultsBlock.style.display = 'none';
        }
        if (!preserveState) {
            this.currentResults = {
                working_proxies: [],
                unique_proxies: [],
            };
            if (workingList) workingList.innerHTML = '';
            if (uniqueList) uniqueList.innerHTML = '';
            if (workingCount) workingCount.textContent = '0';
            if (uniqueCount) uniqueCount.textContent = '0';
            this.persistState();
        }
    }

    async copyToClipboard() {
        const uniqueProxies = this.currentResults?.unique_proxies || [];
        if (!uniqueProxies.length) {
            this.showNotification('Нет результатов для копирования', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(uniqueProxies.join('\n'));
            this.showNotification(`Скопировано ${uniqueProxies.length} уникальных прокси`, 'success');
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            this.showNotification('Ошибка копирования в буфер обмена', 'error');
        }
    }

    async exportToTsv() {
        const uniqueProxies = this.currentResults?.unique_proxies || [];
        if (!uniqueProxies.length) {
            this.showNotification('Нет результатов для экспорта', 'error');
            return;
        }

        try {
            const response = await fetch('/api/proxies/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.setExportedFilename(data.filename);

                const command = data.display_command || `python supply\sync_proxies_v2.py -f files\proxies\${data.filename}`;
                this.syncCommand = command;

                const syncButton = document.getElementById('syncDb');
                if (syncButton) {
                    syncButton.setAttribute('title', command);
                }

                const count = Number(data.count) || uniqueProxies.length;
                this.showNotification(`Экспортировано ${count} уникальных прокси в файл ${data.filename}`, 'success');
            } else {
                this.showNotification(data.error || 'Ошибка экспорта', 'error');
            }
        } catch (error) {
            console.error('Error exporting:', error);
            this.showNotification('Ошибка экспорта файла', 'error');
        }
    }

    setExportedFilename(filename, options = {}) {
        const { skipPersist = false } = options;
        this.exportedFilename = filename || null;
        this.syncCommand = this.exportedFilename
            ? `python supply\sync_proxies_v2.py -f files\proxies\${this.exportedFilename}`
            : null;

        const syncButton = document.getElementById('syncDb');

        if (syncButton) {
            if (this.exportedFilename) {
                syncButton.style.display = 'inline-flex';
                syncButton.disabled = false;
                syncButton.dataset.filename = this.exportedFilename;
                if (this.syncCommand) {
                    syncButton.setAttribute('title', this.syncCommand);
                }
            } else {
                syncButton.style.display = 'none';
                syncButton.disabled = true;
                syncButton.removeAttribute('data-filename');
                syncButton.removeAttribute('title');
            }
        }

        if (!skipPersist) {
            this.persistState();
        }
    }

    async syncToDatabase() {
        if (!this.exportedFilename) {
            this.showNotification('Сначала выгрузите данные в TSV файл', 'error');
            return;
        }

        const syncButton = document.getElementById('syncDb');
        if (syncButton) {
            syncButton.disabled = true;
        }

        try {
            const response = await fetch('/api/proxies/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename: this.exportedFilename }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                const commandHint = data.display_command || this.syncCommand || '';
                if (commandHint) {
                    this.syncCommand = commandHint;
                    if (syncButton) {
                        syncButton.setAttribute('title', commandHint);
                    }
                }
                const message = commandHint
                    ? `Синхронизация запущена: ${commandHint}`
                    : 'Синхронизация запущена. Проверяйте раздел логов.';
                this.showNotification(message, 'success');
            } else {
                this.showNotification(data.error || 'Ошибка синхронизации', 'error');
            }
        } catch (error) {
            console.error('Error syncing:', error);
            this.showNotification('Ошибка синхронизации с базой данных', 'error');
        } finally {
            if (syncButton) {
                syncButton.disabled = false;
            }
        }
    }

    switchTab(tabName, options = {}) {
        if (!tabName) {
            return;
        }

        const { skipSave = false } = options;

        document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));

        const tabButton = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        const pane = document.getElementById(`${tabName}Proxies`);

        if (!tabButton || !pane) {
            return;
        }

        tabButton.classList.add('active');
        pane.classList.add('active');

        this.activeTab = tabName;

        if (!skipSave) {
            this.persistState();
        }
    }

    persistState() {
        const proxyInput = document.getElementById('proxyInput');
        const hasResults = !!(
            this.currentResults &&
            ((Array.isArray(this.currentResults.working_proxies) && this.currentResults.working_proxies.length > 0) ||
                (Array.isArray(this.currentResults.unique_proxies) && this.currentResults.unique_proxies.length > 0))
        );

        const state = {
            input: proxyInput ? proxyInput.value : '',
            activeTab: this.activeTab,
            exportedFilename: this.exportedFilename,
            hasResults,
        };

        try {
            localStorage.setItem(this.stateStorageKey, JSON.stringify(state));
        } catch (error) {
            console.warn('Не удалось сохранить состояние proxy tester:', error);
        }
    }

    showNotification(message, type = 'info') {
        if (window.notificationCenter) {
            window.notificationCenter.show(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }
}

// Инициализируем тестер при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.proxyTester = new ProxyTester();
});
