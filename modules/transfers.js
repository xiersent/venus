/**
 * @file transfers.js
 * Venus — переносы между счетами: таблица, фильтр, CRUD.
 */
(function (global) {
    'use strict';

    const $ = global.jQuery;

    /** @type {string|null} */
    let editingTransferId = null;

    /** @type {ReturnType<typeof global.venusDatetime>} */
    const dt = global.venusDatetime;

    /**
     * @param {number} amount
     * @returns {string}
     */
    function formatMoney(amount) {
        return amount.toFixed(2).replace('.', ',');
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * @param {string} iso YYYY-MM-DD
     * @returns {string}
     */
    function formatDateDisplay(iso) {
        return dt.formatDateDisplay(iso);
    }

    /**
     * @param {string} value DD.MM.YYYY or YYYY-MM-DD
     * @returns {string|null}
     */
    function parseDateInput(value) {
        const trimmed = (value || '').trim();
        if (!trimmed) {
            return null;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed;
        }
        const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
        if (!match) {
            return null;
        }
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return year + '-' + month + '-' + day;
    }

    /**
     * @param {string} value
     * @returns {number|null}
     */
    function parseAmount(value) {
        const normalized = (value || '').trim().replace(/\s/g, '').replace(',', '.');
        if (!normalized) {
            return null;
        }
        const amount = Number.parseFloat(normalized);
        if (!Number.isFinite(amount) || amount < 0) {
            return null;
        }
        return amount;
    }

    /**
     * @param {Date} date
     * @returns {string}
     */
    function toIsoDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function currencyMapById(db) {
        /** @type {Record<string, { code: string }>} */
        const map = {};
        db.currencies.forEach((currency) => {
            map[currency.id] = currency;
        });
        return map;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function accountMapById(db) {
        /** @type {Record<string, { name: string }>} */
        const map = {};
        db.accounts.forEach((account) => {
            map[account.id] = account;
        });
        return map;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @returns {import('./storage').VenusTransaction[]}
     */
    function getTransferTransactions(db) {
        return db.transactions.filter((transaction) => transaction.type === 'transfer');
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {import('./storage').VenusTransaction[]} transfers
     */
    function applyTransferFilters(db, transfers) {
        const filterEnabled = document.querySelector('[data-venus-transfer-filter]')?.checked;
        if (!filterEnabled) {
            return transfers;
        }

        const fromIso = parseDateInput(
            document.getElementById('transfer-filter-from')?.value || '',
        );
        const toIso = parseDateInput(document.getElementById('transfer-filter-to')?.value || '');
        const fromAccountId = document.getElementById('transfer-filter-from-account')?.value || '';
        const toAccountId = document.getElementById('transfer-filter-to-account')?.value || '';

        return transfers.filter((transaction) => {
            if (fromIso && transaction.date < fromIso) {
                return false;
            }
            if (toIso && transaction.date > toIso) {
                return false;
            }
            if (fromAccountId && transaction.account_from_id !== fromAccountId) {
                return false;
            }
            if (toAccountId && transaction.account_to_id !== toAccountId) {
                return false;
            }
            return true;
        });
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function visibleAccountsForSelect(db) {
        return db.accounts
            .filter((account) => !account.is_hidden)
            .sort((a, b) => a.sort_order - b.sort_order);
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {import('./storage').VenusTransaction} transaction
     */
    function resolveTransferRow(db, transaction) {
        const accounts = accountMapById(db);
        const currencies = currencyMapById(db);
        const code = currencies[transaction.currency_id]?.code;

        return {
            date: dt.formatDateTimeDisplay(transaction.date, transaction.time),
            fromName: transaction.account_from_id
                ? accounts[transaction.account_from_id]?.name || '—'
                : '—',
            toName: transaction.account_to_id
                ? accounts[transaction.account_to_id]?.name || '—'
                : '—',
            amountRur: code === 'RUR' ? transaction.amount : 0,
            amountUsd: code === 'USD' ? transaction.amount : 0,
            note: transaction.note || '',
        };
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {import('./storage').VenusTransaction[]} transfers
     * @param {string|null} selectedId
     */
    function renderTransfersTable(db, transfers, selectedId) {
        const tbody = document.querySelector('[data-venus-transfers-tbody]');
        const countEl = document.querySelector('[data-venus-transfers-count]');
        if (!tbody) {
            return;
        }

        const sorted = transfers.slice().sort((a, b) => dt.compareTransactionsByDateTime(a, b));

        if (sorted.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="6" class="sun-summaryEmpty">Нет переносов. Нажмите «Добавить».</td></tr>';
        } else {
            tbody.innerHTML = sorted
                .map((transaction, index) => {
                    const row = resolveTransferRow(db, transaction);
                    const selectedClass =
                        transaction.id === selectedId || (!selectedId && index === 0)
                            ? ' sun-protoRowSelected'
                            : '';
                    const noteCell = row.note
                        ? escapeHtml(row.note)
                        : '<span class="sun-protoMuted">—</span>';

                    return (
                        '<tr class="js-venus-transfer-row' +
                        selectedClass +
                        '" data-transfer-id="' +
                        transaction.id +
                        '">' +
                        '<td>' +
                        escapeHtml(row.date) +
                        '</td>' +
                        '<td>' +
                        escapeHtml(row.fromName) +
                        '</td>' +
                        '<td>' +
                        escapeHtml(row.toName) +
                        '</td>' +
                        '<td class="sun-protoNumBalance">' +
                        formatMoney(row.amountRur) +
                        '</td>' +
                        '<td>' +
                        formatMoney(row.amountUsd) +
                        '</td>' +
                        '<td>' +
                        noteCell +
                        '</td>' +
                        '</tr>'
                    );
                })
                .join('');
        }

        if (countEl) {
            countEl.textContent = 'Строк: ' + sorted.length;
        }
    }

    /**
     * @param {import('./storage').VenusTransaction[]} transfers
     */
    function renderTransferTotals(transfers) {
        const currencies = currencyMapById(global.venusStorage.load());
        const totals = { RUR: 0, USD: 0 };

        transfers.forEach((transaction) => {
            const code = currencies[transaction.currency_id]?.code;
            if (code === 'RUR') {
                totals.RUR += transaction.amount;
            } else if (code === 'USD') {
                totals.USD += transaction.amount;
            }
        });

        const rurEl = document.querySelector('[data-venus-transfer-total-rur]');
        const usdEl = document.querySelector('[data-venus-transfer-total-usd]');
        if (rurEl) {
            rurEl.textContent = formatMoney(totals.RUR);
        }
        if (usdEl) {
            usdEl.textContent = formatMoney(totals.USD);
        }
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {import('./storage').VenusDatabase} db
     * @param {string} allLabel
     */
    function populateFilterAccountSelect(select, db, allLabel) {
        if (!select) {
            return;
        }

        let options = '<option value="">' + escapeHtml(allLabel) + '</option>';
        visibleAccountsForSelect(db).forEach((account) => {
            options +=
                '<option value="' + account.id + '">' + escapeHtml(account.name) + '</option>';
        });

        const prev = select.value;
        select.innerHTML = options;
        if (prev && select.querySelector('option[value="' + prev + '"]')) {
            select.value = prev;
        }
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function initFilterDateRange(db) {
        const fromInput = document.getElementById('transfer-filter-from');
        const toInput = document.getElementById('transfer-filter-to');
        const transfers = getTransferTransactions(db);

        if (!fromInput || !toInput) {
            return;
        }

        if (transfers.length === 0) {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            fromInput.value = formatDateDisplay(toIsoDate(start));
            toInput.value = formatDateDisplay(toIsoDate(end));
            return;
        }

        let min = transfers[0].date;
        let max = transfers[0].date;
        transfers.forEach((transaction) => {
            if (transaction.date < min) {
                min = transaction.date;
            }
            if (transaction.date > max) {
                max = transaction.date;
            }
        });

        fromInput.value = formatDateDisplay(min);
        toInput.value = formatDateDisplay(max);
    }

    /**
     * @returns {string|null}
     */
    function getSelectedTransferId() {
        const row = document.querySelector('.js-venus-transfer-row.sun-protoRowSelected');
        return row ? row.getAttribute('data-transfer-id') : null;
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} selectedId
     * @param {string|null} excludeId
     */
    function populateAccountSelect(select, db, selectedId, excludeId) {
        const accounts = visibleAccountsForSelect(db);
        if (accounts.length === 0) {
            select.innerHTML = '<option value="">— нет счетов —</option>';
            return;
        }

        const filtered = accounts.filter((account) => account.id !== excludeId);
        const list = filtered.length > 0 ? filtered : accounts;
        const value = selectedId && list.some((item) => item.id === selectedId) ? selectedId : list[0].id;

        select.innerHTML = list
            .map(
                (account) =>
                    '<option value="' +
                    account.id +
                    '"' +
                    (account.id === value ? ' selected' : '') +
                    '>' +
                    escapeHtml(account.name) +
                    '</option>',
            )
            .join('');
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} selectedId
     */
    function populateCurrencySelect(select, db, selectedId) {
        const currencies = db.currencies
            .filter((currency) => currency.is_enabled)
            .sort((a, b) => a.sort_order - b.sort_order);

        if (currencies.length === 0) {
            select.innerHTML = '<option value="">—</option>';
            return;
        }

        const value = selectedId || currencies[0].id;
        select.innerHTML = currencies
            .map(
                (currency) =>
                    '<option value="' +
                    currency.id +
                    '"' +
                    (currency.id === value ? ' selected' : '') +
                    '>' +
                    escapeHtml(currency.code) +
                    '</option>',
            )
            .join('');
    }

    function syncTransferAccountSelects() {
        const db = global.venusStorage.load();
        const fromSelect = document.getElementById('trf-from');
        const toSelect = document.getElementById('trf-to');
        if (!fromSelect || !toSelect) {
            return;
        }

        const fromId = fromSelect.value;
        const toId = toSelect.value;
        populateAccountSelect(fromSelect, db, fromId, toId);
        populateAccountSelect(toSelect, db, toId, fromId);
    }

    function resetTransferForm() {
        editingTransferId = null;
        const db = global.venusStorage.load();
        const title = document.querySelector('[data-venus-transfer-modal-title]');
        const dateInput = document.getElementById('trf-date');
        const timeInput = document.getElementById('trf-time');
        const fromSelect = document.getElementById('trf-from');
        const toSelect = document.getElementById('trf-to');
        const amountInput = document.getElementById('trf-amount');
        const currencySelect = document.getElementById('trf-currency');
        const noteInput = document.getElementById('trf-note');

        if (title) {
            title.textContent = 'Перенос между счетами';
        }
        dt.setDateTimeFields(dateInput, timeInput, toIsoDate(new Date()), '');
        if (fromSelect && toSelect) {
            const accounts = visibleAccountsForSelect(db);
            populateAccountSelect(fromSelect, db, accounts[0]?.id ?? null, null);
            populateAccountSelect(
                toSelect,
                db,
                accounts[1]?.id ?? accounts[0]?.id ?? null,
                fromSelect.value,
            );
        }
        if (amountInput) {
            amountInput.value = '0,00';
        }
        if (currencySelect) {
            populateCurrencySelect(currencySelect, db, null);
        }
        if (noteInput) {
            noteInput.value = '';
        }
    }

    /**
     * @param {import('./storage').VenusTransaction} transaction
     * @param {import('./storage').VenusDatabase} db
     */
    function fillTransferForm(transaction, db) {
        editingTransferId = transaction.id;

        const title = document.querySelector('[data-venus-transfer-modal-title]');
        if (title) {
            title.textContent = 'Изменить перенос';
        }

        const dateInput = document.getElementById('trf-date');
        const timeInput = document.getElementById('trf-time');
        dt.setDateTimeFields(dateInput, timeInput, transaction.date, transaction.time);

        populateAccountSelect(
            document.getElementById('trf-from'),
            db,
            transaction.account_from_id,
            transaction.account_to_id,
        );
        populateAccountSelect(
            document.getElementById('trf-to'),
            db,
            transaction.account_to_id,
            transaction.account_from_id,
        );
        populateCurrencySelect(
            document.getElementById('trf-currency'),
            db,
            transaction.currency_id,
        );

        const amountInput = document.getElementById('trf-amount');
        if (amountInput) {
            amountInput.value = formatMoney(transaction.amount);
        }

        const noteInput = document.getElementById('trf-note');
        if (noteInput) {
            noteInput.value = transaction.note || '';
        }
    }

    /**
     * @returns {object|null}
     */
    function readTransferForm() {
        const dateInput = document.getElementById('trf-date');
        const timeInput = document.getElementById('trf-time');
        const fromSelect = document.getElementById('trf-from');
        const toSelect = document.getElementById('trf-to');
        const amountInput = document.getElementById('trf-amount');
        const currencySelect = document.getElementById('trf-currency');
        const noteInput = document.getElementById('trf-note');

        const date = dateInput?.value || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            global.alert('Укажите дату переноса.');
            dateInput?.focus();
            return null;
        }
        const time = dt.readTimeInput(timeInput);

        const fromId = fromSelect?.value || '';
        const toId = toSelect?.value || '';
        if (!fromId || !toId) {
            global.alert('Выберите счета «откуда» и «куда».');
            return null;
        }
        if (fromId === toId) {
            global.alert('Счёт-источник и счёт-получатель должны различаться.');
            fromSelect?.focus();
            return null;
        }

        const amount = parseAmount(amountInput?.value || '');
        if (amount == null || amount <= 0) {
            global.alert('Укажите сумму больше нуля.');
            amountInput?.focus();
            return null;
        }

        const currencyId = currencySelect?.value || '';
        if (!currencyId) {
            global.alert('Выберите валюту.');
            return null;
        }

        return {
            date,
            time,
            fromId,
            toId,
            amount,
            currencyId,
            note: noteInput ? noteInput.value.trim() : '',
        };
    }

    /**
     * @returns {boolean}
     */
    function saveTransfer() {
        const form = readTransferForm();
        if (!form) {
            return false;
        }

        const db = global.venusStorage.load();
        const user = db.users.find((item) => item.is_active) || db.users[0];
        const now = new Date().toISOString();

        if (editingTransferId) {
            const transaction = db.transactions.find((item) => item.id === editingTransferId);
            if (!transaction || transaction.type !== 'transfer') {
                return false;
            }

            transaction.date = form.date;
            dt.applyTransactionTime(transaction, form.time);
            transaction.account_from_id = form.fromId;
            transaction.account_to_id = form.toId;
            transaction.account_id = null;
            transaction.amount = form.amount;
            transaction.currency_id = form.currencyId;
            transaction.note = form.note;
            transaction.updated_at = now;

            global.venusStorage.save(db);
            render(db, transaction.id);
            editingTransferId = null;
            return true;
        }

        const transactionId = global.venusStorage.createId();
        db.transactions.push({
            id: transactionId,
            type: 'transfer',
            date: form.date,
            ...(form.time ? { time: form.time } : {}),
            account_id: null,
            account_from_id: form.fromId,
            account_to_id: form.toId,
            category_id: null,
            amount: form.amount,
            currency_id: form.currencyId,
            quantity: null,
            unit_id: null,
            note: form.note,
            user_id: user ? user.id : null,
            created_at: now,
            updated_at: now,
        });

        global.venusStorage.save(db);
        render(db, transactionId);
        return true;
    }

    /**
     * @param {string} transferId
     * @returns {boolean}
     */
    function deleteTransfer(transferId) {
        const db = global.venusStorage.load();
        const transaction = db.transactions.find((item) => item.id === transferId);
        if (!transaction || transaction.type !== 'transfer') {
            return false;
        }

        const accounts = accountMapById(db);
        const label =
            dt.formatDateTimeDisplay(transaction.date, transaction.time) +
            ', ' +
            (accounts[transaction.account_from_id]?.name || '—') +
            ' → ' +
            (accounts[transaction.account_to_id]?.name || '—') +
            ', ' +
            formatMoney(transaction.amount);

        if (!global.confirm('Удалить перенос: ' + label + '?')) {
            return false;
        }

        db.transactions = db.transactions.filter((item) => item.id !== transferId);
        global.venusStorage.save(db);

        const transfers = applyTransferFilters(db, getTransferTransactions(db));
        render(db, transfers[0]?.id ?? null);
        return true;
    }

    function deleteSelectedTransfer() {
        const transferId = getSelectedTransferId();
        if (!transferId) {
            global.alert('Выберите перенос в таблице.');
            return false;
        }
        return deleteTransfer(transferId);
    }

    /**
     * @param {string} transferId
     * @returns {boolean}
     */
    function openEditForm(transferId) {
        const db = global.venusStorage.load();
        const transaction = db.transactions.find((item) => item.id === transferId);
        if (!transaction || transaction.type !== 'transfer') {
            return false;
        }

        fillTransferForm(transaction, db);
        $.xiermodal('show', 'venus-transfer');
        return true;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} [selectedId]
     */
    function render(db, selectedId) {
        const transfers = applyTransferFilters(db, getTransferTransactions(db));
        renderTransfersTable(db, transfers, selectedId ?? getSelectedTransferId());
        renderTransferTotals(transfers);
        populateFilterAccountSelect(
            document.getElementById('transfer-filter-from-account'),
            db,
            '<Все счета>',
        );
        populateFilterAccountSelect(
            document.getElementById('transfer-filter-to-account'),
            db,
            '<Все счета>',
        );

        if (global.venusAccounts) {
            global.venusAccounts.render(db);
        }
    }

    function bindEvents() {
        $(document).on('click', '.js-venus-transfer-add', (event) => {
            event.preventDefault();
            const db = global.venusStorage.load();
            if (visibleAccountsForSelect(db).length < 2) {
                global.alert('Для переноса нужно минимум два счёта на вкладке «Счета» → «Кратко».');
                return;
            }
            resetTransferForm();
            $.xiermodal('show', 'venus-transfer');
        });

        $(document).on('click', '.js-venus-transfer-edit', (event) => {
            event.preventDefault();
            const transferId = getSelectedTransferId();
            if (!transferId) {
                global.alert('Выберите перенос в таблице.');
                return;
            }
            openEditForm(transferId);
        });

        $(document).on('click', '.js-venus-transfer-delete', (event) => {
            event.preventDefault();
            deleteSelectedTransfer();
        });

        $(document).on('click', '.js-venus-transfer-save', (event) => {
            event.preventDefault();
            if (saveTransfer()) {
                $.xiermodal('hide', 'venus-transfer');
            }
        });

        document.addEventListener('click', (event) => {
            const row = event.target.closest('.js-venus-transfer-row');
            if (!row) {
                return;
            }
            document.querySelectorAll('.js-venus-transfer-row').forEach((item) => {
                item.classList.toggle('sun-protoRowSelected', item === row);
            });
        });

        document.addEventListener('dblclick', (event) => {
            const row = event.target.closest('.js-venus-transfer-row');
            if (!row) {
                return;
            }
            document.querySelectorAll('.js-venus-transfer-row').forEach((item) => {
                item.classList.toggle('sun-protoRowSelected', item === row);
            });

            const transferId = row.getAttribute('data-transfer-id');
            if (transferId) {
                openEditForm(transferId);
            }
        });

        document.getElementById('trf-from')?.addEventListener('change', syncTransferAccountSelects);
        document.getElementById('trf-to')?.addEventListener('change', syncTransferAccountSelects);

        document.querySelector('[data-venus-transfer-filter]')?.addEventListener('change', () => {
            render(global.venusStorage.load());
        });
        ['transfer-filter-from', 'transfer-filter-to'].forEach((id) => {
            const el = document.getElementById(id);
            el?.addEventListener('change', () => render(global.venusStorage.load()));
            el?.addEventListener('blur', () => render(global.venusStorage.load()));
        });
        document.getElementById('transfer-filter-from-account')?.addEventListener('change', () => {
            render(global.venusStorage.load());
        });
        document.getElementById('transfer-filter-to-account')?.addEventListener('change', () => {
            render(global.venusStorage.load());
        });
    }

    function init() {
        const db = global.venusStorage.load();
        initFilterDateRange(db);
        bindEvents();
        render(db);
    }

    global.venusTransfers = {
        init,
        render,
        resetTransferForm,
        openEditForm,
        saveTransfer,
        deleteTransfer,
    };
})(window);
