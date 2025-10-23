class LogsViewer {
    constructor() {
        this.processes = [];
        this.currentProcessId = null;
        this.currentLogs = [];
        this.filter = 'all';
        this.pollInterval = null;
        this.detailTimer = null;
        this.logLimit = 400;

        this.elements = {
            list: document.getElementById('processList'),
            placeholder: document.getElementById('logsPlaceholder'),
            content: document.getElementById('logsContent'),
            statusBadge: document.getElementById('logsStatusBadge'),
            commandId: document.getElementById('logsCommandId'),
            command: document.getElementById('logsCommand'),
            started: document.getElementById('logsStarted'),
            finished: document.getElementById('logsFinished'),
            exitCode: document.getElementById('logsExitCode'),
            pid: document.getElementById('logsPid'),
            count: document.getElementById('logsCount'),
            logs: document.getElementById('processLogs'),
            refresh: document.getElementById('refreshProcesses'),
            download: document.getElementById('downloadLogs'),
            stop: document.getElementById('stopProcess'),
            remove: document.getElementById('deleteProcess'),
            filters: document.querySelectorAll('.filter-btn'),
        };

        this.bindEvents();
        this.fetchProcesses();
        this.startPolling();
    }

    bindEvents() {
        this.elements.refresh?.addEventListener('click', () => this.fetchProcesses(true));
        this.elements.download?.addEventListener('click', () => this.downloadLogs());
        this.elements.stop?.addEventListener('click', () => this.stopCurrentProcess());
        this.elements.remove?.addEventListener('click', () => this.deleteCurrentProcess());

        this.elements.filters?.forEach(btn => {
            btn.addEventListener('click', () => {
                this.filter = btn.dataset.filter;
                this.elements.filters.forEach(item => item.classList.toggle('active', item === btn));
                this.renderProcessList();
            });
        });
    }

    startPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        this.pollInterval = setInterval(() => this.fetchProcesses(), 5000);
    }

    async fetchProcesses(showMessage = false) {
        try {
            const response = await fetch('/api/processes');
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось получить список процессов');
            }

            this.processes = (data.processes || []).map(process => ({
                ...process,
                started_at: process.started_at || null,
                finished_at: process.finished_at || null,
            }));
            this.renderProcessList();

            if (showMessage) {
                window.showNotification('Список процессов обновлен', 'success', { timeout: 2000 });
            }

            if (this.currentProcessId) {
                const exists = this.processes.some(p => p.command_id === this.currentProcessId);
                if (!exists) {
                    this.resetViewer();
                }
            }
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    renderProcessList() {
        const list = this.elements.list;
        if (!list) {
            return;
        }

        list.innerHTML = '';

        const filtered = this.processes
            .filter(process => this.filterProcess(process, this.filter))
            .sort((a, b) => this.sortByDateDesc(a.started_at, b.started_at));

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-message';
            empty.innerHTML = `
                <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
                    <path d="M3 3h18v18H3z" opacity="0.2"/>
                    <path d="M7 8h10"/>
                    <path d="M7 12h10"/>
                    <path d="M7 16h10"/>
                </svg>
                <p>Нет процессов по текущему фильтру</p>
            `;
            list.appendChild(empty);
            return;
        }

        filtered.forEach(process => {
            const item = document.createElement('button');
            item.className = `process-item status-${process.status}`;
            item.dataset.commandId = process.command_id;
            if (process.command_id === this.currentProcessId) {
                item.classList.add('active');
            }

            item.innerHTML = `
                <div class="process-header">
                    <span class="process-id">${process.command_id}</span>
                    <span class="status-badge ${process.status}">${this.getStatusLabel(process.status)}</span>
                </div>
                <div class="process-command" title="${process.command || ''}">${process.command || '—'}</div>
                <div class="process-meta">
                    <span>${this.formatDate(process.started_at)}</span>
                    <span>${this.formatExitCode(process)}</span>
                </div>
            `;

            item.addEventListener('click', () => this.selectProcess(process.command_id));
            list.appendChild(item);
        });
    }

    filterProcess(process, filter) {
        if (filter === 'all') {
            return true;
        }
        if (filter === 'running') {
            return process.status === 'running';
        }
        if (filter === 'finished') {
            return process.status === 'finished' || (process.status === 'stopped' && process.exit_code === 0);
        }
        if (filter === 'failed') {
            return ['failed'].includes(process.status) || (process.exit_code && process.exit_code !== 0);
        }
        return true;
    }

    sortByDateDesc(a, b) {
        const dateA = a ? new Date(a).getTime() : 0;
        const dateB = b ? new Date(b).getTime() : 0;
        return dateB - dateA;
    }

    async selectProcess(commandId) {
        if (!commandId) {
            return;
        }
        this.currentProcessId = commandId;
        this.renderProcessList();
        await this.loadProcessDetails(commandId);
    }

    async loadProcessDetails(commandId) {
        if (this.detailTimer) {
            clearTimeout(this.detailTimer);
        }

        try {
            const response = await fetch(`/api/processes/${encodeURIComponent(commandId)}?limit=${this.logLimit}`);
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось получить детали процесса');
            }

            this.currentLogs = data.logs || [];
            this.updateViewer(data);

            if (data.status === 'running') {
                this.detailTimer = setTimeout(() => this.loadProcessDetails(commandId), 3000);
            }
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    updateViewer(data) {
        if (!this.elements.content || !this.elements.placeholder) {
            return;
        }

        this.elements.placeholder.style.display = 'none';
        this.elements.content.style.display = 'flex';

        this.elements.commandId.textContent = data.command_id;
        this.elements.command.textContent = data.command || '—';
        this.elements.started.textContent = this.formatDate(data.started_at);
        this.elements.finished.textContent = this.formatDate(data.finished_at);
        this.elements.exitCode.textContent = data.exit_code !== null && data.exit_code !== undefined ? data.exit_code : '—';
        this.elements.pid.textContent = data.pid || '—';
        this.elements.count.textContent = data.log_count ?? data.logs?.length ?? 0;

        const statusClass = `status-badge ${data.status}`;
        this.elements.statusBadge.className = statusClass;
        this.elements.statusBadge.textContent = this.getStatusLabel(data.status);

        if (this.elements.stop) {
            this.elements.stop.disabled = data.status !== 'running';
        }

        this.renderLogs(this.currentLogs);
    }

    renderLogs(logs) {
        const container = this.elements.logs;
        if (!container) {
            return;
        }

        container.innerHTML = '';
        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="logs-empty">Логи отсутствуют</div>';
            return;
        }

        logs.forEach(entry => {
            const line = document.createElement('div');
            line.className = 'log-entry';
            line.innerHTML = `
                <span class="log-time">${this.formatTime(entry.timestamp)}</span>
                <span class="log-message">${this.escapeHtml(entry.message)}</span>
            `;
            container.appendChild(line);
        });

        container.scrollTop = container.scrollHeight;
    }

    async stopCurrentProcess() {
        if (!this.currentProcessId) {
            return;
        }
        try {
            const response = await fetch(`/api/stop/${encodeURIComponent(this.currentProcessId)}`, {
                method: 'POST'
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Не удалось остановить процесс');
            }
            window.showNotification('Процесс остановлен', 'info');
            await this.loadProcessDetails(this.currentProcessId);
            await this.fetchProcesses();
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    async deleteCurrentProcess() {
        if (!this.currentProcessId) {
            return;
        }
        if (!confirm('Удалить запись о процессе?')) {
            return;
        }
        try {
            const response = await fetch(`/api/processes/${encodeURIComponent(this.currentProcessId)}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось удалить запись');
            }
            window.showNotification('Запись о процессе удалена', 'success');
            this.currentProcessId = null;
            this.resetViewer();
            await this.fetchProcesses();
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    downloadLogs() {
        if (!this.currentProcessId || !this.currentLogs.length) {
            window.showNotification('Нет логов для сохранения', 'warning');
            return;
        }
        const content = this.currentLogs.map(entry => `[${this.formatTime(entry.timestamp)}] ${entry.message}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${this.currentProcessId}.log`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    resetViewer() {
        if (this.detailTimer) {
            clearTimeout(this.detailTimer);
        }
        if (this.elements.content) {
            this.elements.content.style.display = 'none';
        }
        if (this.elements.placeholder) {
            this.elements.placeholder.style.display = 'flex';
        }
        this.currentLogs = [];
        this.renderProcessList();
    }

    getStatusLabel(status) {
        switch (status) {
            case 'running':
                return 'Выполняется';
            case 'finished':
                return 'Завершено';
            case 'failed':
                return 'Ошибка';
            case 'stopped':
                return 'Остановлено';
            default:
                return status || 'Неизвестно';
        }
    }

    formatExitCode(process) {
        if (process.status === 'running') {
            return 'В процессе';
        }
        if (process.exit_code === null || process.exit_code === undefined) {
            return '—';
        }
        return `Код: ${process.exit_code}`;
    }

    formatDate(value) {
        if (!value) {
            return '—';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleString();
    }

    formatTime(value) {
        if (!value) {
            return '—';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleTimeString();
    }

    escapeHtml(text = '') {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('processList')) {
        new LogsViewer();
    }
});
