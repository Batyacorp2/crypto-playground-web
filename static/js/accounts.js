class AccountsManager {
    constructor() {
        this.files = [];
        this.filteredFiles = [];
        this.currentFile = null;
        this.originalContent = '';
        this.isDirty = false;
        this.polling = null;

        this.elements = {
            list: document.getElementById('accountFilesList'),
            search: document.getElementById('accountSearch'),
            refresh: document.getElementById('refreshAccountFiles'),
            createInput: document.getElementById('newAccountFileName'),
            createButton: document.getElementById('createAccountFile'),
            uploadInput: document.getElementById('uploadAccountFile'),
            placeholder: document.getElementById('accountsEmptyState'),
            editorPanel: document.getElementById('accountsEditorPanel'),
            editor: document.getElementById('accountsEditor'),
            dirtyBadge: document.getElementById('accountsDirtyBadge'),
            recordsLabel: document.getElementById('editorRecordsCount'),
            sizeLabel: document.getElementById('editorFileSize'),
            fileTitle: document.getElementById('editorFileName'),
            saveButton: document.getElementById('saveAccountFile'),
            revertButton: document.getElementById('revertAccountFile'),
            deleteButton: document.getElementById('deleteAccountFile'),
            renameButton: document.getElementById('renameAccountFile'),
            downloadButton: document.getElementById('downloadAccountFile'),
        };

        this.bindEvents();
        this.fetchFiles();
    }

    bindEvents() {
        if (this.elements.refresh) {
            this.elements.refresh.addEventListener('click', () => this.fetchFiles(true));
        }
        if (this.elements.search) {
            this.elements.search.addEventListener('input', () => this.applySearch());
        }
        if (this.elements.createButton) {
            this.elements.createButton.addEventListener('click', () => this.createFile());
        }
        if (this.elements.createInput) {
            this.elements.createInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.createFile();
                }
            });
        }
        if (this.elements.uploadInput) {
            this.elements.uploadInput.addEventListener('change', (event) => {
                const target = event.target || event.srcElement;
                const files = target && target.files;
                const file = files && files[0];
                if (file) {
                    this.uploadFile(file);
                    target.value = '';
                }
            });
        }
        if (this.elements.editor) {
            this.elements.editor.addEventListener('input', () => this.handleEditorChange());
        }
        if (this.elements.saveButton) {
            this.elements.saveButton.addEventListener('click', () => this.saveCurrentFile());
        }
        if (this.elements.revertButton) {
            this.elements.revertButton.addEventListener('click', () => this.revertChanges());
        }
        if (this.elements.deleteButton) {
            this.elements.deleteButton.addEventListener('click', () => this.deleteCurrentFile());
        }
        if (this.elements.renameButton) {
            this.elements.renameButton.addEventListener('click', () => this.renameCurrentFile());
        }
        if (this.elements.downloadButton) {
            this.elements.downloadButton.addEventListener('click', () => this.downloadCurrentFile());
        }
    }

    async fetchFiles(showMessage = false) {
        try {
            const response = await fetch('/api/accounts/files');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Не удалось получить список файлов');
            }

            this.files = data.files || [];
            this.applySearch();
            if (showMessage) {
                window.showNotification('Список файлов обновлен', 'success', { timeout: 2500 });
            }
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    applySearch() {
        const query = (this.elements.search && this.elements.search.value
            ? this.elements.search.value
            : ''
        ).toLowerCase();
        this.filteredFiles = this.files.filter(file => file.name.toLowerCase().includes(query));
        this.renderFileList();
    }

    renderFileList() {
        const list = this.elements.list;
        if (!list) {
            return;
        }

        list.innerHTML = '';

        if (this.filteredFiles.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-message';
            empty.innerHTML = `
                <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
                    <path d="M4 4h16v16H4z" opacity="0.2"/>
                    <path d="M8 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
                    <path d="M9 12h6"/>
                    <path d="M9 16h6"/>
                </svg>
                <p>Файлы не найдены. Создайте новый или измените фильтр.</p>
            `;
            list.appendChild(empty);
            return;
        }

        this.filteredFiles.forEach(file => {
            const item = document.createElement('button');
            item.className = 'account-file';
            item.dataset.filename = file.name;
            if (file.name === this.currentFile) {
                item.classList.add('active');
            }
            item.innerHTML = `
                <div class="file-name">${file.name}</div>
                <div class="file-meta">
                    <span>${this.formatRecords(file.records)}</span>
                    <span>${this.formatBytes(file.size)}</span>
                </div>
                <div class="file-date">${this.formatDate(file.modified)}</div>
            `;
            item.addEventListener('click', () => this.handleFileSelect(file.name));
            list.appendChild(item);
        });
    }

    async handleFileSelect(filename) {
        if (this.isDirty && !confirm('Есть несохраненные изменения. Вы уверены, что хотите продолжить?')) {
            return;
        }
        await this.openFile(filename);
    }

    async openFile(filename) {
        try {
            const response = await fetch(`/api/accounts/files/${encodeURIComponent(filename)}`);
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось загрузить файл');
            }

            this.currentFile = data.filename;
            this.originalContent = data.content || '';
            this.isDirty = false;

            this.updateEditorUI({
                content: this.originalContent,
                filename: data.filename,
                records: data.records,
                size: (this.files.find(file => file.name === data.filename) || {}).size
                    || this.originalContent.length,
            });

            this.highlightSelected();
            window.showNotification(`Файл ${data.filename} загружен`, 'success');
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    updateEditorUI({ content, filename, records, size }) {
        if (!this.elements.editor || !this.elements.editorPanel || !this.elements.placeholder) {
            return;
        }

        this.elements.editor.value = content || '';
        this.elements.fileTitle.textContent = filename;
        this.elements.recordsLabel.textContent = this.formatRecords(records);
        this.elements.sizeLabel.textContent = this.formatBytes(size);

        this.elements.placeholder.style.display = 'none';
        this.elements.editorPanel.style.display = 'flex';
        this.setDirty(false);
    }

    highlightSelected() {
        const buttons = this.elements.list
            ? this.elements.list.querySelectorAll('.account-file')
            : null;
        if (!buttons) {
            return;
        }
        buttons.forEach(btn => {
            if (btn.dataset.filename === this.currentFile) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    handleEditorChange() {
        if (!this.currentFile) {
            return;
        }
        const currentValue = this.elements.editor.value;
        const records = this.countRecords(currentValue);
        this.elements.recordsLabel.textContent = this.formatRecords(records);
        this.elements.sizeLabel.textContent = this.formatBytes(currentValue.length);
        this.setDirty(currentValue !== this.originalContent);
    }

    setDirty(isDirty) {
        this.isDirty = isDirty;
        if (this.elements.dirtyBadge) {
            this.elements.dirtyBadge.style.display = isDirty ? 'inline-flex' : 'none';
        }
        if (this.elements.saveButton) {
            this.elements.saveButton.disabled = !isDirty;
        }
        if (this.elements.revertButton) {
            this.elements.revertButton.disabled = !isDirty;
        }
    }

    async saveCurrentFile() {
        if (!this.currentFile) {
            window.showNotification('Выберите файл для сохранения', 'warning');
            return;
        }

        const content = this.elements.editor.value;
        try {
            const response = await fetch(`/api/accounts/files/${encodeURIComponent(this.currentFile)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось сохранить файл');
            }

            this.originalContent = content;
            this.setDirty(false);
            await this.fetchFiles();
            this.highlightSelected();
            window.showNotification('Файл сохранен', 'success');
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    revertChanges() {
        if (!this.currentFile) {
            return;
        }
        this.elements.editor.value = this.originalContent;
        this.handleEditorChange();
        this.setDirty(false);
        window.showNotification('Изменения отменены', 'info');
    }

    async createFile() {
        const filename = this.elements.createInput
            ? this.elements.createInput.value.trim()
            : '';
        if (!filename) {
            window.showNotification('Укажите имя файла', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/accounts/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, content: '' })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось создать файл');
            }

            this.elements.createInput.value = '';
            await this.fetchFiles();
            await this.openFile(data.filename);
            window.showNotification(`Файл ${data.filename} создан`, 'success');
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/accounts/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось загрузить файл');
            }

            await this.fetchFiles();
            await this.openFile(data.filename);
            window.showNotification(`Файл ${data.filename} импортирован`, 'success');
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    async deleteCurrentFile() {
        if (!this.currentFile) {
            return;
        }
        if (!confirm(`Удалить файл ${this.currentFile}?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/accounts/files/${encodeURIComponent(this.currentFile)}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось удалить файл');
            }

            window.showNotification('Файл удален', 'success');
            this.currentFile = null;
            this.originalContent = '';
            this.elements.editorPanel.style.display = 'none';
            this.elements.placeholder.style.display = 'flex';
            await this.fetchFiles();
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    async renameCurrentFile() {
        if (!this.currentFile) {
            window.showNotification('Нет выбранного файла для переименования', 'warning');
            return;
        }

        const newName = prompt('Введите новое имя файла', this.currentFile) || '';
        if (!newName.trim() || newName === this.currentFile) {
            return;
        }

        try {
            const response = await fetch(`/api/accounts/files/${encodeURIComponent(this.currentFile)}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: newName })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось переименовать файл');
            }

            this.currentFile = data.filename;
            this.elements.fileTitle.textContent = data.filename;
            await this.fetchFiles();
            this.highlightSelected();
            window.showNotification(`Файл переименован в ${data.filename}`, 'success');
        } catch (error) {
            console.error(error);
            window.showNotification(error.message, 'error');
        }
    }

    downloadCurrentFile() {
        if (!this.currentFile) {
            window.showNotification('Выберите файл для скачивания', 'warning');
            return;
        }

        const blob = new Blob([this.elements.editor.value], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = this.currentFile;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    formatRecords(count) {
        if (count === undefined || count === null) {
            return '0 записей';
        }
        const plural = this.pluralize(count, ['запись', 'записи', 'записей']);
        return `${count} ${plural}`;
    }

    formatBytes(size) {
        if (typeof size !== 'number') {
            return '0 Б';
        }
        const units = ['Б', 'КБ', 'МБ', 'ГБ'];
        let index = 0;
        let value = size;
        while (value >= 1024 && index < units.length - 1) {
            value /= 1024;
            index += 1;
        }
        return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[index]}`;
    }

    formatDate(dateString) {
        if (!dateString) {
            return '—';
        }
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) {
            return dateString;
        }
        return date.toLocaleString();
    }

    countRecords(content) {
        return content.split('\n').filter(line => line.trim()).length;
    }

    pluralize(value, forms) {
        const mod10 = value % 10;
        const mod100 = value % 100;
        if (mod10 === 1 && mod100 !== 11) {
            return forms[0];
        }
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
            return forms[1];
        }
        return forms[2];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('accountFilesList')) {
        new AccountsManager();
    }
});
