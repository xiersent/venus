/**
 * @file settings.js
 * Venus — настройки: пользователь, валюты, экспорт/импорт, сброс данных.
 */
(function (global) {
    'use strict';

    const $ = global.jQuery;

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function refreshAllUi(db) {
        if (global.venusAccounts) {
            global.venusAccounts.render(db);
        }
        if (global.venusExpenses) {
            global.venusExpenses.render(db);
        }
        if (global.venusIncomes) {
            global.venusIncomes.render(db);
        }
        if (global.venusTransfers) {
            global.venusTransfers.render(db);
        }
        if (global.venusCategories) {
            global.venusCategories.render(db);
        }
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function renderSettings(db) {
        const user = db.users.find((item) => item.is_active) || db.users[0];
        const nameInput = document.getElementById('settings-user-name');
        const currenciesEl = document.querySelector('[data-venus-settings-currencies]');
        const metaEl = document.querySelector('[data-venus-settings-meta]');

        if (nameInput && user) {
            nameInput.value = user.name;
        }

        if (currenciesEl) {
            const list = db.currencies
                .filter((currency) => currency.is_enabled)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((currency) => currency.code + ' (' + currency.name + ')')
                .join(', ');
            currenciesEl.textContent = list || '—';
        }

        if (metaEl) {
            metaEl.textContent =
                'Обновлено: ' +
                (db.meta.updated_at ? db.meta.updated_at.slice(0, 19).replace('T', ' ') : '—');
        }
    }

    function exportDatabase() {
        const db = global.venusStorage.load();
        const json = global.venusStorage.exportJson(db);
        const date = global.venusStorage.toDateOnly();
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'venus-backup-' + date + '.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    /**
     * @param {File} file
     */
    function importDatabaseFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const db = global.venusStorage.importJson(String(reader.result || ''));
                refreshAllUi(db);
                renderSettings(db);
                global.alert('Данные успешно импортированы.');
            } catch (err) {
                global.alert(
                    'Не удалось импортировать файл: ' +
                        (err instanceof Error ? err.message : String(err)),
                );
            }
        };
        reader.onerror = () => {
            global.alert('Не удалось прочитать файл.');
        };
        reader.readAsText(file, 'utf-8');
    }

    function saveUserName() {
        const nameInput = document.getElementById('settings-user-name');
        if (!nameInput) {
            return;
        }

        const name = nameInput.value.trim();
        if (!name) {
            nameInput.focus();
            global.alert('Введите имя пользователя.');
            return;
        }

        const db = global.venusStorage.load();
        const user = db.users.find((item) => item.is_active) || db.users[0];
        if (!user) {
            return;
        }

        user.name = name;
        global.venusStorage.save(db);
        refreshAllUi(db);
        renderSettings(db);
    }

    function resetEmpty() {
        if (
            !global.confirm(
                'Очистить все данные и начать с пустой базы? Это действие нельзя отменить.',
            )
        ) {
            return;
        }

        const db = global.venusStorage.resetToEmpty();
        refreshAllUi(db);
        renderSettings(db);
    }

    function bindEvents() {
        $(document).on('click', '.js-venus-export', (event) => {
            event.preventDefault();
            exportDatabase();
        });

        $(document).on('click', '.js-venus-settings-export', (event) => {
            event.preventDefault();
            exportDatabase();
        });

        $(document).on('click', '.js-venus-settings-import', (event) => {
            event.preventDefault();
            document.getElementById('venus-import-file')?.click();
        });

        $(document).on('click', '.js-venus-settings-reset-empty', (event) => {
            event.preventDefault();
            resetEmpty();
        });

        $(document).on('click', '.js-venus-settings-save-user', (event) => {
            event.preventDefault();
            saveUserName();
        });

        $(document).on('click', '.js-venus-modal-settings', () => {
            renderSettings(global.venusStorage.load());
        });

        const importInput = document.getElementById('venus-import-file');
        if (importInput) {
            importInput.addEventListener('change', () => {
                const file = importInput.files && importInput.files[0];
                importInput.value = '';
                if (file) {
                    importDatabaseFile(file);
                }
            });
        }

        const nameInput = document.getElementById('settings-user-name');
        if (nameInput) {
            nameInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    saveUserName();
                }
            });
        }
    }

    function init() {
        bindEvents();
        renderSettings(global.venusStorage.load());
    }

    global.venusSettings = {
        init,
        render: renderSettings,
        refreshAllUi,
        exportDatabase,
    };
})(window);
