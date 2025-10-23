class NotificationCenter {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'notification-container';
        document.body.appendChild(this.container);
    }

    show(message, type = 'info', options = {}) {
        if (!message) {
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notification-item ${type}`;
        notification.innerHTML = `
            <div class="notification-icon">
                ${this.getIcon(type)}
            </div>
            <div class="notification-body">
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close" aria-label="Закрыть">&times;</button>
        `;

        this.container.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        const timeout = (options && typeof options.timeout === 'number')
            ? options.timeout
            : 5000;
        let autoHideTimer = null;
        if (timeout > 0) {
            autoHideTimer = setTimeout(() => this.dismiss(notification), timeout);
        }

        notification.querySelector('.notification-close').addEventListener('click', () => {
            if (autoHideTimer) {
                clearTimeout(autoHideTimer);
            }
            this.dismiss(notification);
        });

        notification.addEventListener('mouseenter', () => {
            if (autoHideTimer) {
                clearTimeout(autoHideTimer);
                autoHideTimer = null;
            }
        });

        notification.addEventListener('mouseleave', () => {
            if (!autoHideTimer && timeout > 0) {
                autoHideTimer = setTimeout(() => this.dismiss(notification), timeout / 2);
            }
        });
    }

    dismiss(notification) {
        if (!notification) {
            return;
        }
        notification.classList.remove('show');
        notification.addEventListener('transitionend', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, { once: true });
    }

    clearAll() {
        [...this.container.children].forEach(child => this.dismiss(child));
    }

    getIcon(type) {
        switch (type) {
            case 'success':
                return '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';
            case 'error':
                return '<svg viewBox="0 0 24 24"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>';
            case 'warning':
                return '<svg viewBox="0 0 24 24"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>';
            default:
                return '<svg viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1"/><path d="M12 8h.01"/><circle cx="12" cy="12" r="10"/></svg>';
        }
    }
}

window.notificationCenter = new NotificationCenter();
window.showNotification = (message, type = 'info', options = {}) => {
    window.notificationCenter.show(message, type, options);
};
