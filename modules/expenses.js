/**
 * @file expenses.js
 * Venus — расходы: таблица, фильтр, добавление, изменение, удаление.
 */
(function (global) {
    'use strict';

    const $ = global.jQuery;

    /** @type {string|null} */
    let editingExpenseId = null;

    const EXPENSE_LAST_FORM_KEY = 'venus-expense-last-form';

    /** @type {ReturnType<typeof global.venusDatetime>} */
    const dt = global.venusDatetime;

    /** @type {ReturnType<typeof global.venusCategoryCombobox>} */
    const cb = global.venusCategoryCombobox;

    /** @type {ReturnType<typeof cb.bind>|null} */
    let expenseCategoryCombo = null;

    /** @type {ReturnType<typeof cb.bind>|null} */
    let expenseSubcategoryCombo = null;

    /** @type {boolean} */
    let expenseCalcLock = false;

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
     * @param {string} value
     * @returns {number|null}
     */
    function parseOptionalDecimal(value) {
        const trimmed = (value || '').trim();
        if (!trimmed) {
            return null;
        }
        const normalized = trimmed.replace(/\s/g, '').replace(',', '.');
        const num = Number.parseFloat(normalized);
        if (!Number.isFinite(num) || num < 0) {
            return null;
        }
        return num;
    }

    /**
     * @param {number} value
     * @returns {number}
     */
    function roundMoney(value) {
        return Math.round(value * 100) / 100;
    }

    /**
     * @param {number} value
     * @returns {string}
     */
    function formatQuantity(value) {
        const rounded = Math.round(value * 10000) / 10000;
        return String(rounded).replace('.', ',');
    }

    /**
     * @returns {boolean}
     */
    function isExpenseMultiplyEnabled() {
        return document.getElementById('exp-multiply')?.checked ?? false;
    }

    /**
     * @returns {'price'|'qty'|'amount'|null}
     */
    function getExpenseCalcLock() {
        const active = document.querySelector('.js-venus-exp-lock.venus-exp-lock--active');
        const field = active?.getAttribute('data-exp-lock');
        if (field === 'price' || field === 'qty' || field === 'amount') {
            return field;
        }
        return null;
    }

    /**
     * @param {'price'|'qty'|'amount'|null} field
     */
    function setExpenseCalcLock(field) {
        document.querySelectorAll('.js-venus-exp-lock').forEach((button) => {
            const lockField = button.getAttribute('data-exp-lock');
            const isActive = field != null && lockField === field;
            button.classList.toggle('venus-exp-lock--active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            button.setAttribute(
                'aria-label',
                isActive
                    ? 'Снять фиксацию'
                    : lockField === 'price'
                      ? 'Зафиксировать цену'
                      : lockField === 'qty'
                        ? 'Зафиксировать количество'
                        : 'Зафиксировать сумму',
            );
        });
    }

    function updateExpenseLockButtonsState() {
        const enabled = isExpenseMultiplyEnabled();
        document.querySelectorAll('.js-venus-exp-lock').forEach((button) => {
            button.disabled = !enabled;
        });
        if (!enabled) {
            setExpenseCalcLock(null);
        }
    }

    /**
     * @param {'price'|'qty'|'amount'|'multiply'|'lock'} changedField
     */
    function syncExpenseAmountFields(changedField) {
        if (expenseCalcLock) {
            return;
        }

        if (!isExpenseMultiplyEnabled()) {
            return;
        }

        const priceInput = document.getElementById('exp-price');
        const qtyInput = document.getElementById('exp-qty');
        const amountInput = document.getElementById('exp-amount');
        if (!priceInput || !qtyInput || !amountInput) {
            return;
        }

        const locked = getExpenseCalcLock();
        const price = parseOptionalDecimal(priceInput.value);
        const qty = parseOptionalDecimal(qtyInput.value);
        const amount = parseAmount(amountInput.value);

        /**
         * @param {'price'|'qty'|'amount'} field
         * @param {number} value
         */
        function writeField(field, value) {
            if (locked === field || !Number.isFinite(value) || value <= 0) {
                return;
            }
            if (field === 'price') {
                priceInput.value = formatMoney(roundMoney(value));
            } else if (field === 'qty') {
                qtyInput.value = formatQuantity(roundMoney(value));
            } else {
                amountInput.value = formatMoney(roundMoney(value));
            }
        }

        expenseCalcLock = true;

        try {
            if (!locked) {
                if (
                    changedField === 'price' ||
                    changedField === 'qty' ||
                    changedField === 'multiply' ||
                    changedField === 'lock'
                ) {
                    if (price != null && price > 0 && qty != null && qty > 0) {
                        writeField('amount', price * qty);
                    }
                    return;
                }

                if (changedField === 'amount') {
                    if (amount != null && amount > 0 && qty != null && qty > 0) {
                        writeField('price', amount / qty);
                    } else if (amount != null && amount > 0 && price != null && price > 0) {
                        writeField('qty', amount / price);
                    }
                }
                return;
            }

            if (changedField === locked || changedField === 'lock' || changedField === 'multiply') {
                if (locked === 'amount') {
                    if (amount != null && amount > 0 && qty != null && qty > 0) {
                        writeField('price', amount / qty);
                    } else if (amount != null && amount > 0 && price != null && price > 0) {
                        writeField('qty', amount / price);
                    }
                } else if (locked === 'price') {
                    if (price != null && price > 0 && qty != null && qty > 0) {
                        writeField('amount', price * qty);
                    } else if (price != null && price > 0 && amount != null && amount > 0) {
                        writeField('qty', amount / price);
                    }
                } else if (locked === 'qty') {
                    if (price != null && price > 0 && qty != null && qty > 0) {
                        writeField('amount', price * qty);
                    } else if (qty != null && qty > 0 && amount != null && amount > 0) {
                        writeField('price', amount / qty);
                    }
                }
                return;
            }

            if (locked === 'amount' && amount != null && amount > 0) {
                if (changedField === 'price' && price != null && price > 0) {
                    writeField('qty', amount / price);
                } else if (changedField === 'qty' && qty != null && qty > 0) {
                    writeField('price', amount / qty);
                }
            } else if (locked === 'price' && price != null && price > 0) {
                if (changedField === 'qty' && qty != null && qty > 0) {
                    writeField('amount', price * qty);
                } else if (changedField === 'amount' && amount != null && amount > 0) {
                    writeField('qty', amount / price);
                }
            } else if (locked === 'qty' && qty != null && qty > 0) {
                if (changedField === 'price' && price != null && price > 0) {
                    writeField('amount', price * qty);
                } else if (changedField === 'amount' && amount != null && amount > 0) {
                    writeField('price', amount / qty);
                }
            }
        } finally {
            expenseCalcLock = false;
        }
    }

    /**
     * @param {number|null|undefined} unitPrice
     * @param {number|null|undefined} quantity
     * @param {number} amount
     * @returns {boolean}
     */
    function shouldEnableExpenseMultiply(unitPrice, quantity, amount) {
        if (unitPrice == null || quantity == null || quantity <= 0 || amount <= 0) {
            return false;
        }
        return Math.abs(amount - roundMoney(unitPrice * quantity)) < 0.005;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @returns {import('./storage').VenusTransaction[]}
     */
    function getExpenseTransactions(db) {
        return db.transactions.filter((transaction) => transaction.type === 'expense');
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {import('./storage').VenusTransaction[]} expenses
     * @returns {import('./storage').VenusTransaction[]}
     */
    function applyExpenseFilters(db, expenses) {
        const filterEnabled = document.querySelector('[data-venus-expense-filter]')?.checked;
        if (!filterEnabled) {
            return expenses;
        }

        const fromIso = parseDateInput(document.getElementById('filter-from')?.value || '');
        const toIso = parseDateInput(document.getElementById('filter-to')?.value || '');
        const accountId = document.getElementById('filter-account')?.value || '';
        const categoryId = document.getElementById('filter-category')?.value || '';
        const subcategoryId = document.getElementById('filter-subcategory')?.value || '';

        return expenses.filter((transaction) => {
            if (fromIso && transaction.date < fromIso) {
                return false;
            }
            if (toIso && transaction.date > toIso) {
                return false;
            }
            if (accountId && transaction.account_id !== accountId) {
                return false;
            }
            if (
                subcategoryId &&
                transaction.category_id !== subcategoryId
            ) {
                return false;
            }
            if (
                !subcategoryId &&
                categoryId &&
                !expenseCategoryMatchesFilter(db, transaction.category_id, categoryId)
            ) {
                return false;
            }
            return true;
        });
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} transactionCategoryId
     * @param {string} filterRootId
     * @returns {boolean}
     */
    function expenseCategoryMatchesFilter(db, transactionCategoryId, filterRootId) {
        if (!transactionCategoryId) {
            return false;
        }
        if (transactionCategoryId === filterRootId) {
            return true;
        }
        const categories = categoryMapById(db);
        const category = categories[transactionCategoryId];
        return category?.parent_id === filterRootId;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function currencyMapById(db) {
        /** @type {Record<string, { code: string; symbol: string }>} */
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
     */
    function categoryMapById(db) {
        /** @type {Record<string, { name: string; parent_id: string|null }>} */
        const map = {};
        db.categories.forEach((category) => {
            map[category.id] = category;
        });
        return map;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function unitMapById(db) {
        /** @type {Record<string, { short_name: string; name: string }>} */
        const map = {};
        db.units.forEach((unit) => {
            map[unit.id] = unit;
        });
        return map;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {import('./storage').VenusTransaction} transaction
     */
    function resolveExpenseRow(db, transaction) {
        const accounts = accountMapById(db);
        const categories = categoryMapById(db);
        const currencies = currencyMapById(db);
        const units = unitMapById(db);

        const category = transaction.category_id ? categories[transaction.category_id] : null;
        let categoryName = '—';
        let subcategoryName = '—';

        if (category) {
            if (category.parent_id) {
                const parent = categories[category.parent_id];
                categoryName = parent ? parent.name : '—';
                subcategoryName = category.name;
            } else {
                categoryName = category.name;
            }
        }

        const currency = currencies[transaction.currency_id];
        const code = currency?.code;
        const amountRur = code === 'RUR' ? transaction.amount : 0;
        const amountUsd = code === 'USD' ? transaction.amount : 0;

        let qtyLabel = '—';
        let unitLabel = '—';
        if (transaction.quantity != null && transaction.quantity > 0) {
            qtyLabel = String(transaction.quantity);
            if (transaction.unit_id && units[transaction.unit_id]) {
                unitLabel = units[transaction.unit_id].short_name || units[transaction.unit_id].name;
            }
        }

        return {
            date: dt.formatDateTimeDisplay(transaction.date, transaction.time),
            account: transaction.account_id ? accounts[transaction.account_id]?.name || '—' : '—',
            category: categoryName,
            subcategory: subcategoryName,
            qty: qtyLabel,
            unit: unitLabel,
            amountRur,
            amountUsd,
            note: transaction.note || '',
        };
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {import('./storage').VenusTransaction[]} expenses
     * @param {string|null} selectedId
     */
    function renderExpensesTable(db, expenses, selectedId) {
        const tbody = document.querySelector('[data-venus-expenses-tbody]');
        const countEl = document.querySelector('[data-venus-expenses-count]');
        if (!tbody) {
            return;
        }

        const sorted = expenses.slice().sort((a, b) => dt.compareTransactionsByDateTime(a, b));

        if (sorted.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="10" class="sun-summaryEmpty">Нет записей. Нажмите «Добавить», чтобы внести расход.</td></tr>';
        } else {
            tbody.innerHTML = sorted
                .map((transaction, index) => {
                    const row = resolveExpenseRow(db, transaction);
                    const selectedClass =
                        transaction.id === selectedId || (!selectedId && index === 0)
                            ? ' sun-protoRowSelected'
                            : '';
                    const noteCell = row.note
                        ? escapeHtml(row.note)
                        : '<span class="sun-protoMuted">—</span>';
                    const subCell =
                        row.subcategory === '—'
                            ? '<span class="sun-protoMuted">—</span>'
                            : escapeHtml(row.subcategory);
                    const qtyCell =
                        row.qty === '—' ? '<span class="sun-protoMuted">—</span>' : escapeHtml(row.qty);
                    const unitCell =
                        row.unit === '—' ? '<span class="sun-protoMuted">—</span>' : escapeHtml(row.unit);

                    return (
                        '<tr class="js-venus-expense-row' +
                        selectedClass +
                        '" data-expense-id="' +
                        transaction.id +
                        '">' +
                        '<td>' +
                        escapeHtml(row.date) +
                        '</td>' +
                        '<td>' +
                        escapeHtml(row.account) +
                        '</td>' +
                        '<td>' +
                        escapeHtml(row.category) +
                        '</td>' +
                        '<td>' +
                        subCell +
                        '</td>' +
                        '<td>' +
                        qtyCell +
                        '</td>' +
                        '<td>' +
                        unitCell +
                        '</td>' +
                        '<td class="sun-protoNumExpense">' +
                        formatMoney(row.amountRur) +
                        '</td>' +
                        '<td>' +
                        formatMoney(row.amountUsd) +
                        '</td>' +
                        '<td class="sun-protoMuted">—</td>' +
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
     * @param {import('./storage').VenusTransaction[]} expenses
     * @param {string} isoDate YYYY-MM-DD
     * @returns {{ RUR: number; USD: number }}
     */
    function sumByCurrencyForDate(expenses, isoDate) {
        const db = global.venusStorage.load();
        const currencies = currencyMapById(db);
        const totals = { RUR: 0, USD: 0 };

        expenses.forEach((transaction) => {
            if (transaction.date !== isoDate) {
                return;
            }
            const code = currencies[transaction.currency_id]?.code;
            if (code === 'RUR') {
                totals.RUR += transaction.amount;
            } else if (code === 'USD') {
                totals.USD += transaction.amount;
            }
        });

        return totals;
    }

    /**
     * @param {import('./storage').VenusTransaction[]} expenses
     * @param {Date} today
     * @returns {{ RUR: number; USD: number }}
     */
    function sumByCurrencyInRange(expenses, fromDate, toDate) {
        const db = global.venusStorage.load();
        const currencies = currencyMapById(db);
        const totals = { RUR: 0, USD: 0 };
        const fromIso = toIsoDate(fromDate);
        const toIso = toIsoDate(toDate);

        expenses.forEach((transaction) => {
            if (transaction.date < fromIso || transaction.date > toIso) {
                return;
            }
            const code = currencies[transaction.currency_id]?.code;
            if (code === 'RUR') {
                totals.RUR += transaction.amount;
            } else if (code === 'USD') {
                totals.USD += transaction.amount;
            }
        });

        return totals;
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
     * @param {import('./storage').VenusTransaction[]} expenses
     */
    function renderExpenseTotals(expenses) {
        const today = new Date();
        const todayIso = toIsoDate(today);

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 6);

        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const todayTotals = sumByCurrencyForDate(expenses, todayIso);
        const weekTotals = sumByCurrencyInRange(expenses, weekStart, today);
        const monthTotals = sumByCurrencyInRange(expenses, monthStart, monthEnd);

        const allTotals = { RUR: 0, USD: 0 };
        const currencies = currencyMapById(global.venusStorage.load());
        expenses.forEach((transaction) => {
            const code = currencies[transaction.currency_id]?.code;
            if (code === 'RUR') {
                allTotals.RUR += transaction.amount;
            } else if (code === 'USD') {
                allTotals.USD += transaction.amount;
            }
        });

        setTotalCell('[data-venus-expense-total-today-rur]', todayTotals.RUR);
        setTotalCell('[data-venus-expense-total-today-usd]', todayTotals.USD);
        setTotalCell('[data-venus-expense-total-week-rur]', weekTotals.RUR);
        setTotalCell('[data-venus-expense-total-week-usd]', weekTotals.USD);
        setTotalCell('[data-venus-expense-total-month-rur]', monthTotals.RUR);
        setTotalCell('[data-venus-expense-total-month-usd]', monthTotals.USD);
        setTotalCell('[data-venus-expense-total-all-rur]', allTotals.RUR);
        setTotalCell('[data-venus-expense-total-all-usd]', allTotals.USD);
    }

    /**
     * @param {string} selector
     * @param {number} amount
     */
    function setTotalCell(selector, amount) {
        const el = document.querySelector(selector);
        if (el) {
            el.textContent = formatMoney(amount);
        }
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
     */
    function expenseRootCategories(db) {
        return db.categories
            .filter((category) => category.type === 'expense' && !category.parent_id)
            .sort((a, b) => a.sort_order - b.sort_order);
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} parentId
     */
    function expenseSubcategories(db, parentId) {
        if (!parentId) {
            return [];
        }
        return db.categories
            .filter((category) => category.type === 'expense' && category.parent_id === parentId)
            .sort((a, b) => a.sort_order - b.sort_order);
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {import('./storage').VenusDatabase} db
     * @param {string} allLabel
     * @param {'account'|'category'} kind
     */
    function populateFilterSelect(select, db, allLabel, kind) {
        if (!select) {
            return;
        }

        let options = '<option value="">' + escapeHtml(allLabel) + '</option>';

        if (kind === 'account') {
            visibleAccountsForSelect(db).forEach((account) => {
                options +=
                    '<option value="' + account.id + '">' + escapeHtml(account.name) + '</option>';
            });
        } else {
            expenseRootCategories(db).forEach((category) => {
                options +=
                    '<option value="' +
                    category.id +
                    '">' +
                    escapeHtml(category.name) +
                    '</option>';
            });
        }

        const prev = select.value;
        select.innerHTML = options;
        if (prev && select.querySelector('option[value="' + prev + '"]')) {
            select.value = prev;
        }
    }

    /**
     * @param {HTMLSelectElement|null} select
     * @param {import('./storage').VenusDatabase} db
     * @param {string} rootCategoryId
     */
    function populateSubcategoryFilterSelect(select, db, rootCategoryId) {
        if (!select) {
            return;
        }

        const prev = select.value;

        if (!rootCategoryId) {
            select.innerHTML = '<option value="">&lt;Все подкатегории&gt;</option>';
            select.value = '';
            select.disabled = true;
            return;
        }

        const subs = expenseSubcategories(db, rootCategoryId);
        if (subs.length === 0) {
            select.innerHTML = '<option value="">&lt;Без подкатегорий&gt;</option>';
            select.value = '';
            select.disabled = true;
            return;
        }

        let options = '<option value="">&lt;Все подкатегории&gt;</option>';
        subs.forEach((category) => {
            options +=
                '<option value="' +
                category.id +
                '">' +
                escapeHtml(category.name) +
                '</option>';
        });

        select.disabled = false;
        select.innerHTML = options;
        if (prev && select.querySelector('option[value="' + prev + '"]')) {
            select.value = prev;
        } else {
            select.value = '';
        }
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function initFilterDateRange(db) {
        const fromInput = document.getElementById('filter-from');
        const toInput = document.getElementById('filter-to');
        const expenses = getExpenseTransactions(db);

        if (!fromInput || !toInput) {
            return;
        }

        if (expenses.length === 0) {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            fromInput.value = formatDateDisplay(toIsoDate(start));
            toInput.value = formatDateDisplay(toIsoDate(end));
            return;
        }

        let min = expenses[0].date;
        let max = expenses[0].date;
        expenses.forEach((transaction) => {
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
    function getSelectedExpenseId() {
        const row = document.querySelector('.js-venus-expense-row.sun-protoRowSelected');
        return row ? row.getAttribute('data-expense-id') : null;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} [selectedId]
     */
    function render(db, selectedId) {
        const expenses = applyExpenseFilters(db, getExpenseTransactions(db));
        renderExpensesTable(db, expenses, selectedId ?? getSelectedExpenseId());
        renderExpenseTotals(expenses);
        populateFilterSelect(
            document.getElementById('filter-account'),
            db,
            '<Все счета>',
            'account',
        );
        populateFilterSelect(
            document.getElementById('filter-category'),
            db,
            '<Все категории>',
            'category',
        );
        populateSubcategoryFilterSelect(
            document.getElementById('filter-subcategory'),
            db,
            document.getElementById('filter-category')?.value || '',
        );
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} selectedId
     */
    function populateAccountSelect(select, db, selectedId) {
        const accounts = visibleAccountsForSelect(db);
        if (accounts.length === 0) {
            select.innerHTML = '<option value="">— нет счетов —</option>';
            return;
        }
        const value = selectedId || accounts[0].id;
        select.innerHTML = accounts
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
    function populateCategorySelect(select, db, selectedId) {
        const categories = expenseRootCategories(db);
        const createNew = cb.createNewOptionMarkup();
        if (categories.length === 0) {
            select.innerHTML = createNew + '<option value="">— нет категорий —</option>';
            return;
        }
        const value =
            selectedId && (categories.some((category) => category.id === selectedId) || cb.isCreateNewValue(selectedId)) ?
                selectedId
            :   categories[0].id;
        select.innerHTML =
            createNew +
            categories
                .map(
                    (category) =>
                        '<option value="' +
                        category.id +
                        '"' +
                        (category.id === value ? ' selected' : '') +
                        '>' +
                        escapeHtml(category.name) +
                        '</option>',
                )
                .join('');
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} parentCategoryId
     * @param {string|null} selectedSubId
     */
    function populateSubcategorySelect(select, db, parentCategoryId, selectedSubId) {
        const subs =
            parentCategoryId && !cb.isCreateNewValue(parentCategoryId) ?
                expenseSubcategories(db, parentCategoryId)
            :   [];
        const value =
            selectedSubId &&
            (selectedSubId === '' ||
                cb.isCreateNewValue(selectedSubId) ||
                subs.some((category) => category.id === selectedSubId)) ?
                selectedSubId
            :   '';
        let options =
            '<option value="">&lt;Без подкатегории&gt;</option>' + cb.createNewOptionMarkup();
        subs.forEach((category) => {
            options +=
                '<option value="' +
                category.id +
                '"' +
                (category.id === value ? ' selected' : '') +
                '>' +
                escapeHtml(category.name) +
                '</option>';
        });
        if (cb.isCreateNewValue(value)) {
            select.innerHTML = options;
            select.value = cb.CREATE_NEW_VALUE;
            return;
        }
        select.innerHTML = options;
        select.value = value;
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} selectedId
     */
    function populateCurrencySelect(select, db, selectedId) {
        const rur = db.currencies.find((currency) => currency.code === 'RUR');
        const value = selectedId || rur?.id || db.currencies[0]?.id || '';
        select.innerHTML = db.currencies
            .filter((currency) => currency.is_enabled)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(
                (currency) =>
                    '<option value="' +
                    currency.id +
                    '"' +
                    (currency.id === value ? ' selected' : '') +
                    '>' +
                    escapeHtml(currency.name) +
                    '</option>',
            )
            .join('');
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} selectedId
     */
    function populateUnitSelect(select, db, selectedId) {
        let options = '<option value="">&lt;Без ед. изм.&gt;</option>';
        db.units
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .forEach((unit) => {
            options +=
                '<option value="' +
                unit.id +
                '"' +
                (unit.id === selectedId ? ' selected' : '') +
                '>' +
                escapeHtml(unit.short_name || unit.name) +
                '</option>';
        });
        select.innerHTML = options;
    }

    function refreshSubcategoriesFromForm() {
        const categorySelect = document.getElementById('exp-category');
        const subSelect = document.getElementById('exp-subcategory');
        if (!categorySelect || !subSelect) {
            return;
        }
        populateSubcategorySelect(subSelect, global.venusStorage.load(), categorySelect.value, null);
        expenseSubcategoryCombo?.refreshOptions();
        expenseSubcategoryCombo?.clearSearch();
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string} rootId
     * @param {string} categoryId
     */
    function refreshExpenseCategoryFields(db, rootId, categoryId) {
        const categorySelect = document.getElementById('exp-category');
        const subSelect = document.getElementById('exp-subcategory');
        const categories = categoryMapById(db);
        const category = categories[categoryId];
        let selectedRootId = rootId;
        let selectedSubId = null;
        if (category?.parent_id) {
            selectedRootId = category.parent_id;
            selectedSubId = categoryId;
        }
        if (categorySelect) {
            populateCategorySelect(categorySelect, db, selectedRootId);
        }
        if (subSelect) {
            populateSubcategorySelect(subSelect, db, selectedRootId, selectedSubId);
        }
        expenseCategoryCombo?.refreshOptions();
        expenseSubcategoryCombo?.refreshOptions();
        expenseCategoryCombo?.syncFromSelect();
        expenseSubcategoryCombo?.syncFromSelect();
    }

    function initExpenseCategoryCombos() {
        const categorySelect = document.getElementById('exp-category');
        const subSelect = document.getElementById('exp-subcategory');
        if (!categorySelect || !subSelect) {
            return;
        }
        expenseCategoryCombo = cb.bind(
            categorySelect,
            document.getElementById('exp-category-search'),
            { onSelectChange: refreshSubcategoriesFromForm },
        );
        expenseSubcategoryCombo = cb.bind(
            subSelect,
            document.getElementById('exp-subcategory-search'),
        );
    }

    /**
     * @returns {{
     *   accountId: string;
     *   rootCategoryId: string;
     *   subcategoryId: string;
     *   currencyId: string;
     *   unitId: string|null;
     *   quantity: number|null;
     *   unitPrice: number|null;
     *   multiplyPriceQty: boolean;
     *   calcLockField: 'price'|'qty'|'amount'|null;
     *   date: string;
     * }|null}
     */
    function loadLastExpenseFormDefaults() {
        try {
            const raw = global.localStorage.getItem(EXPENSE_LAST_FORM_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || !parsed.accountId || !parsed.rootCategoryId) {
                return null;
            }
            return {
                accountId: String(parsed.accountId),
                rootCategoryId: String(parsed.rootCategoryId),
                subcategoryId: parsed.subcategoryId ? String(parsed.subcategoryId) : '',
                currencyId: parsed.currencyId ? String(parsed.currencyId) : '',
                unitId: parsed.unitId ? String(parsed.unitId) : null,
                quantity:
                    parsed.quantity != null && Number.isFinite(Number(parsed.quantity))
                        ? Number(parsed.quantity)
                        : null,
                unitPrice:
                    parsed.unitPrice != null && Number.isFinite(Number(parsed.unitPrice))
                        ? Number(parsed.unitPrice)
                        : null,
                multiplyPriceQty: Boolean(parsed.multiplyPriceQty),
                calcLockField:
                    parsed.calcLockField === 'price' ||
                    parsed.calcLockField === 'qty' ||
                    parsed.calcLockField === 'amount'
                        ? parsed.calcLockField
                        : null,
                date: typeof parsed.date === 'string' ? parsed.date : '',
                time: typeof parsed.time === 'string' ? parsed.time : '',
            };
        } catch (err) {
            console.warn('venus.expenses.loadLastExpenseFormDefaults:', err);
            return null;
        }
    }

    /**
     * @param {object} form
     * @param {import('./storage').VenusDatabase} db
     */
    function saveLastExpenseFormDefaults(form, db) {
        const categories = categoryMapById(db);
        const category = categories[form.categoryId];
        let rootCategoryId = form.categoryId;
        let subcategoryId = '';
        if (category?.parent_id) {
            rootCategoryId = category.parent_id;
            subcategoryId = form.categoryId;
        }

        try {
            global.localStorage.setItem(
                EXPENSE_LAST_FORM_KEY,
                JSON.stringify({
                    accountId: form.accountId,
                    rootCategoryId,
                    subcategoryId,
                    currencyId: form.currencyId,
                    unitId: form.unitId,
                    quantity: form.quantity,
                    unitPrice: form.unitPrice,
                    multiplyPriceQty: form.multiplyPriceQty,
                    calcLockField: form.calcLockField,
                    date: form.date,
                    time: form.time || '',
                }),
            );
        } catch (err) {
            console.warn('venus.expenses.saveLastExpenseFormDefaults:', err);
        }
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string} transactionId
     */
    function ensureExpenseVisibleInFilter(db, transactionId) {
        const transaction = db.transactions.find((item) => item.id === transactionId);
        if (!transaction || transaction.type !== 'expense') {
            return;
        }

        const filterEnabled = document.querySelector('[data-venus-expense-filter]')?.checked;
        if (!filterEnabled) {
            return;
        }

        const fromInput = document.getElementById('filter-from');
        const toInput = document.getElementById('filter-to');
        const fromIso = parseDateInput(fromInput?.value || '');
        const toIso = parseDateInput(toInput?.value || '');

        if (fromIso && transaction.date < fromIso && fromInput) {
            fromInput.value = formatDateDisplay(transaction.date);
        }
        if (toIso && transaction.date > toIso && toInput) {
            toInput.value = formatDateDisplay(transaction.date);
        }
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {{
     *   accountId: string;
     *   rootCategoryId: string;
     *   subcategoryId: string;
     *   currencyId: string;
     *   unitId: string|null;
     *   quantity: number|null;
     *   unitPrice: number|null;
     *   multiplyPriceQty: boolean;
     *   calcLockField: 'price'|'qty'|'amount'|null;
     *   date: string;
     *   time: string;
     * }|null} last
     */
    function resolveLastExpenseDefaults(db, last) {
        if (!last) {
            return null;
        }

        const accountOk = db.accounts.some(
            (account) => account.id === last.accountId && !account.is_hidden,
        );
        if (!accountOk) {
            return null;
        }

        const categories = categoryMapById(db);
        const root = categories[last.rootCategoryId];
        if (!root || root.type !== 'expense' || root.parent_id) {
            return null;
        }

        let subcategoryId = '';
        if (last.subcategoryId) {
            const sub = categories[last.subcategoryId];
            if (!sub || sub.parent_id !== last.rootCategoryId) {
                return null;
            }
            subcategoryId = last.subcategoryId;
        }

        const currencyOk = db.currencies.some(
            (currency) => currency.id === last.currencyId && currency.is_enabled,
        );
        if (!currencyOk) {
            return null;
        }

        let unitId = last.unitId;
        if (unitId && !db.units.some((unit) => unit.id === unitId)) {
            unitId = null;
        }

        const date =
            last.date && /^\d{4}-\d{2}-\d{2}$/.test(last.date) ? last.date : toIsoDate(new Date());
        const time =
            last.time && /^\d{2}:\d{2}$/.test(last.time) ? last.time : '';

        return {
            accountId: last.accountId,
            rootCategoryId: last.rootCategoryId,
            subcategoryId,
            currencyId: last.currencyId,
            unitId,
            quantity: last.quantity,
            unitPrice: last.unitPrice,
            multiplyPriceQty: last.multiplyPriceQty,
            calcLockField: last.calcLockField,
            date,
            time,
        };
    }

    function resetExpenseForm() {
        editingExpenseId = null;
        const db = global.venusStorage.load();
        const last = resolveLastExpenseDefaults(db, loadLastExpenseFormDefaults());
        const title = document.querySelector('[data-venus-expense-modal-title]');
        const dateInput = document.getElementById('exp-date');
        const timeInput = document.getElementById('exp-time');
        const accountSelect = document.getElementById('exp-account');
        const categorySelect = document.getElementById('exp-category');
        const subSelect = document.getElementById('exp-subcategory');
        const priceInput = document.getElementById('exp-price');
        const multiplyInput = document.getElementById('exp-multiply');
        const amountInput = document.getElementById('exp-amount');
        const currencySelect = document.getElementById('exp-currency');
        const qtyInput = document.getElementById('exp-qty');
        const unitSelect = document.getElementById('exp-unit');
        const noteInput = document.getElementById('exp-note');

        if (title) {
            title.textContent = 'Карточка расхода';
        }
        dt.setDateTimeFields(
            dateInput,
            timeInput,
            last?.date || toIsoDate(new Date()),
            last?.time || '',
        );
        if (accountSelect) {
            populateAccountSelect(accountSelect, db, last?.accountId ?? null);
        }
        if (categorySelect) {
            populateCategorySelect(categorySelect, db, last?.rootCategoryId ?? null);
        }
        if (subSelect && categorySelect) {
            populateSubcategorySelect(
                subSelect,
                db,
                categorySelect.value,
                last?.subcategoryId || null,
            );
        }
        if (qtyInput) {
            qtyInput.value =
                last?.quantity != null && last.quantity > 0 ? formatQuantity(last.quantity) : '';
        }
        if (unitSelect) {
            populateUnitSelect(unitSelect, db, last?.unitId ?? null);
        }
        if (priceInput) {
            priceInput.value =
                last?.unitPrice != null && last.unitPrice > 0
                    ? formatMoney(last.unitPrice)
                    : '0,00';
        }
        if (multiplyInput) {
            multiplyInput.checked = last?.multiplyPriceQty ?? false;
        }
        updateExpenseLockButtonsState();
        if (last?.multiplyPriceQty && last.calcLockField) {
            setExpenseCalcLock(last.calcLockField);
        } else {
            setExpenseCalcLock(null);
        }
        if (amountInput) {
            amountInput.value = '0,00';
        }
        if (currencySelect) {
            populateCurrencySelect(currencySelect, db, last?.currencyId ?? null);
        }
        if (noteInput) {
            noteInput.value = '';
        }
        if (last?.multiplyPriceQty) {
            syncExpenseAmountFields('multiply');
        }
        expenseCategoryCombo?.refreshOptions();
        expenseSubcategoryCombo?.refreshOptions();
        expenseCategoryCombo?.syncFromSelect();
        expenseSubcategoryCombo?.clearSearch();
        expenseSubcategoryCombo?.syncFromSelect();
    }

    /**
     * @param {import('./storage').VenusTransaction} transaction
     * @param {import('./storage').VenusDatabase} db
     */
    function fillExpenseForm(transaction, db) {
        editingExpenseId = transaction.id;
        const categories = categoryMapById(db);
        const category = transaction.category_id ? categories[transaction.category_id] : null;

        let rootCategoryId = transaction.category_id;
        let subcategoryId = '';
        if (category?.parent_id) {
            rootCategoryId = category.parent_id;
            subcategoryId = transaction.category_id || '';
        }

        const title = document.querySelector('[data-venus-expense-modal-title]');
        if (title) {
            title.textContent = 'Изменить расход';
        }

        const dateInput = document.getElementById('exp-date');
        const timeInput = document.getElementById('exp-time');
        dt.setDateTimeFields(dateInput, timeInput, transaction.date, transaction.time);

        populateAccountSelect(
            document.getElementById('exp-account'),
            db,
            transaction.account_id,
        );
        populateCategorySelect(
            document.getElementById('exp-category'),
            db,
            rootCategoryId,
        );
        populateSubcategorySelect(
            document.getElementById('exp-subcategory'),
            db,
            rootCategoryId,
            subcategoryId || null,
        );
        populateCurrencySelect(
            document.getElementById('exp-currency'),
            db,
            transaction.currency_id,
        );
        populateUnitSelect(document.getElementById('exp-unit'), db, transaction.unit_id);

        const qtyInput = document.getElementById('exp-qty');
        if (qtyInput) {
            qtyInput.value =
                transaction.quantity != null && transaction.quantity > 0
                    ? formatQuantity(transaction.quantity)
                    : '';
        }

        const unitPrice =
            transaction.unit_price != null && transaction.unit_price > 0
                ? transaction.unit_price
                : transaction.quantity != null &&
                    transaction.quantity > 0 &&
                    transaction.amount > 0
                  ? roundMoney(transaction.amount / transaction.quantity)
                  : null;

        const priceInput = document.getElementById('exp-price');
        if (priceInput) {
            priceInput.value =
                unitPrice != null && unitPrice > 0 ? formatMoney(unitPrice) : '0,00';
        }

        const multiplyInput = document.getElementById('exp-multiply');
        if (multiplyInput) {
            multiplyInput.checked = shouldEnableExpenseMultiply(
                unitPrice,
                transaction.quantity,
                transaction.amount,
            );
        }
        updateExpenseLockButtonsState();
        setExpenseCalcLock(null);

        const amountInput = document.getElementById('exp-amount');
        if (amountInput) {
            amountInput.value = formatMoney(transaction.amount);
        }

        const noteInput = document.getElementById('exp-note');
        if (noteInput) {
            noteInput.value = transaction.note || '';
        }
        expenseCategoryCombo?.refreshOptions();
        expenseSubcategoryCombo?.refreshOptions();
        expenseCategoryCombo?.syncFromSelect();
        expenseSubcategoryCombo?.syncFromSelect();
    }

    /**
     * @returns {object|null}
     */
    function readExpenseForm() {
        const dateInput = document.getElementById('exp-date');
        const timeInput = document.getElementById('exp-time');
        const accountSelect = document.getElementById('exp-account');
        const categorySelect = document.getElementById('exp-category');
        const subSelect = document.getElementById('exp-subcategory');
        const priceInput = document.getElementById('exp-price');
        const multiplyInput = document.getElementById('exp-multiply');
        const amountInput = document.getElementById('exp-amount');
        const currencySelect = document.getElementById('exp-currency');
        const qtyInput = document.getElementById('exp-qty');
        const unitSelect = document.getElementById('exp-unit');
        const noteInput = document.getElementById('exp-note');

        const date = dateInput?.value || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            global.alert('Укажите дату расхода.');
            dateInput?.focus();
            return null;
        }
        const time = dt.readTimeInput(timeInput);

        const accountId = accountSelect?.value || '';
        if (!accountId) {
            global.alert('Выберите счёт для списания.');
            accountSelect?.focus();
            return null;
        }

        let amount = parseAmount(amountInput?.value || '');
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

        let quantity = null;
        const qtyRaw = (qtyInput?.value || '').trim();
        if (qtyRaw) {
            const parsedQty = Number.parseFloat(qtyRaw.replace(',', '.'));
            if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
                global.alert('Некорректное количество.');
                qtyInput?.focus();
                return null;
            }
            quantity = parsedQty;
        }

        const unitId = unitSelect?.value || null;
        if (quantity != null && !unitId) {
            quantity = null;
        }

        let unitPrice = parseOptionalDecimal(priceInput?.value || '');
        if (unitPrice != null && unitPrice <= 0) {
            unitPrice = null;
        }

        const multiplyPriceQty = multiplyInput?.checked ?? false;
        const calcLockField = getExpenseCalcLock();
        if (
            multiplyPriceQty &&
            calcLockField !== 'amount' &&
            unitPrice != null &&
            quantity != null &&
            quantity > 0
        ) {
            const expected = roundMoney(unitPrice * quantity);
            if (Math.abs(amount - expected) > 0.01) {
                amount = expected;
                amountInput.value = formatMoney(expected);
            }
        }

        return {
            date,
            time,
            accountId,
            amount,
            currencyId,
            quantity,
            unitPrice,
            unitId: unitId || null,
            multiplyPriceQty,
            calcLockField,
            note: noteInput ? noteInput.value.trim() : '',
        };
    }

    /**
     * @returns {boolean}
     */
    function saveExpense() {
        const form = readExpenseForm();
        if (!form) {
            return false;
        }

        const db = global.venusStorage.load();
        const categoryResolved = cb.resolveFromForm(db, 'expense', {
            categorySelect: document.getElementById('exp-category'),
            categoryInput: document.getElementById('exp-category-search'),
            subcategorySelect: document.getElementById('exp-subcategory'),
            subcategoryInput: document.getElementById('exp-subcategory-search'),
            emptyCategoryMessage: 'Выберите или введите категорию расхода.',
        });
        if (!categoryResolved.ok || !categoryResolved.categoryId || !categoryResolved.rootId) {
            global.alert(categoryResolved.message || 'Выберите или введите категорию расхода.');
            return false;
        }
        const categoryId = categoryResolved.categoryId;
        if (categoryResolved.dbChanged) {
            refreshExpenseCategoryFields(db, categoryResolved.rootId, categoryId);
        }

        const user = db.users.find((item) => item.is_active) || db.users[0];
        const now = new Date().toISOString();

        if (editingExpenseId) {
            const transaction = db.transactions.find((item) => item.id === editingExpenseId);
            if (!transaction || transaction.type !== 'expense') {
                return false;
            }

            transaction.date = form.date;
            dt.applyTransactionTime(transaction, form.time);
            transaction.account_id = form.accountId;
            transaction.category_id = categoryId;
            transaction.amount = form.amount;
            transaction.currency_id = form.currencyId;
            transaction.quantity = form.quantity;
            transaction.unit_price = form.unitPrice;
            transaction.unit_id = form.unitId;
            transaction.note = form.note;
            transaction.updated_at = now;

            global.venusStorage.save(db);
            render(db, transaction.id);
            if (global.venusAccounts) {
                global.venusAccounts.render(db);
            }
            editingExpenseId = null;
            return true;
        }

        const transactionId = global.venusStorage.createId();
        db.transactions.push({
            id: transactionId,
            type: 'expense',
            date: form.date,
            ...(form.time ? { time: form.time } : {}),
            account_id: form.accountId,
            account_from_id: null,
            account_to_id: null,
            category_id: categoryId,
            amount: form.amount,
            currency_id: form.currencyId,
            quantity: form.quantity,
            unit_price: form.unitPrice,
            unit_id: form.unitId,
            note: form.note,
            user_id: user ? user.id : null,
            created_at: now,
            updated_at: now,
        });

        global.venusStorage.save(db);
        saveLastExpenseFormDefaults({ ...form, categoryId }, db);
        ensureExpenseVisibleInFilter(db, transactionId);
        render(db, transactionId);
        if (global.venusAccounts) {
            global.venusAccounts.render(db);
        }
        return true;
    }

    /**
     * @param {string} expenseId
     * @returns {boolean}
     */
    function deleteExpense(expenseId) {
        const db = global.venusStorage.load();
        const transaction = db.transactions.find((item) => item.id === expenseId);
        if (!transaction || transaction.type !== 'expense') {
            return false;
        }

        const categories = categoryMapById(db);
        const accounts = accountMapById(db);
        const label =
            dt.formatDateTimeDisplay(transaction.date, transaction.time) +
            ', ' +
            (accounts[transaction.account_id]?.name || 'счёт') +
            ', ' +
            (categories[transaction.category_id]?.name || 'категория') +
            ', ' +
            formatMoney(transaction.amount);

        if (!global.confirm('Удалить расход: ' + label + '?')) {
            return false;
        }

        db.transactions = db.transactions.filter((item) => item.id !== expenseId);
        global.venusStorage.save(db);

        const expenses = applyExpenseFilters(db, getExpenseTransactions(db));
        const nextId = expenses[0]?.id ?? null;
        render(db, nextId);
        if (global.venusAccounts) {
            global.venusAccounts.render(db);
        }
        return true;
    }

    function deleteSelectedExpense() {
        const expenseId = getSelectedExpenseId();
        if (!expenseId) {
            return false;
        }
        return deleteExpense(expenseId);
    }

    /**
     * @param {string} expenseId
     * @returns {boolean}
     */
    function openEditForm(expenseId) {
        const db = global.venusStorage.load();
        const transaction = db.transactions.find((item) => item.id === expenseId);
        if (!transaction || transaction.type !== 'expense') {
            return false;
        }

        fillExpenseForm(transaction, db);
        $.xiermodal('show', 'venus-expense');
        return true;
    }

    function bindEvents() {
        $(document).on('click', '.js-venus-expense-add', (event) => {
            event.preventDefault();
            const db = global.venusStorage.load();
            if (visibleAccountsForSelect(db).length === 0) {
                global.alert('Сначала добавьте хотя бы один счёт на вкладке «Счета».');
                return;
            }
            if (expenseRootCategories(db).length === 0) {
                global.alert('Нет категорий расходов.');
                return;
            }
            resetExpenseForm();
            $.xiermodal('show', 'venus-expense');
        });

        $(document).on('click', '.js-venus-expense-edit', (event) => {
            event.preventDefault();
            const expenseId = getSelectedExpenseId();
            if (!expenseId) {
                return;
            }
            openEditForm(expenseId);
        });

        $(document).on('click', '.js-venus-expense-delete', (event) => {
            event.preventDefault();
            deleteSelectedExpense();
        });

        $(document).on('click', '.js-venus-expense-save', (event) => {
            event.preventDefault();
            if (saveExpense()) {
                $.xiermodal('hide', 'venus-expense');
            }
        });

        document.addEventListener('click', (event) => {
            const row = event.target.closest('.js-venus-expense-row');
            if (!row) {
                return;
            }
            document.querySelectorAll('.js-venus-expense-row').forEach((item) => {
                item.classList.toggle('sun-protoRowSelected', item === row);
            });
        });

        document.addEventListener('dblclick', (event) => {
            const row = event.target.closest('.js-venus-expense-row');
            if (!row) {
                return;
            }
            document.querySelectorAll('.js-venus-expense-row').forEach((item) => {
                item.classList.toggle('sun-protoRowSelected', item === row);
            });

            const expenseId = row.getAttribute('data-expense-id');
            if (expenseId) {
                openEditForm(expenseId);
            }
        });

        initExpenseCategoryCombos();

        document.getElementById('exp-price')?.addEventListener('input', () => {
            syncExpenseAmountFields('price');
        });
        document.getElementById('exp-price')?.addEventListener('blur', () => {
            syncExpenseAmountFields('price');
        });
        document.getElementById('exp-qty')?.addEventListener('input', () => {
            syncExpenseAmountFields('qty');
        });
        document.getElementById('exp-qty')?.addEventListener('blur', () => {
            syncExpenseAmountFields('qty');
        });
        document.getElementById('exp-amount')?.addEventListener('input', () => {
            syncExpenseAmountFields('amount');
        });
        document.getElementById('exp-amount')?.addEventListener('blur', () => {
            syncExpenseAmountFields('amount');
        });
        document.getElementById('exp-multiply')?.addEventListener('change', () => {
            updateExpenseLockButtonsState();
            syncExpenseAmountFields('multiply');
        });

        document.querySelectorAll('.js-venus-exp-lock').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                if (!isExpenseMultiplyEnabled()) {
                    return;
                }

                const field = button.getAttribute('data-exp-lock');
                if (field !== 'price' && field !== 'qty' && field !== 'amount') {
                    return;
                }

                if (button.classList.contains('venus-exp-lock--active')) {
                    setExpenseCalcLock(null);
                } else {
                    setExpenseCalcLock(field);
                }
                syncExpenseAmountFields('lock');
            });
        });

        document.querySelector('[data-venus-expense-filter]')?.addEventListener('change', () => {
            render(global.venusStorage.load());
        });
        ['filter-from', 'filter-to'].forEach((id) => {
            document.getElementById(id)?.addEventListener('keyup', () => {
                render(global.venusStorage.load());
            });
        });
        document.getElementById('filter-account')?.addEventListener('change', () => {
            render(global.venusStorage.load());
        });
        document.getElementById('filter-category')?.addEventListener('change', () => {
            const db = global.venusStorage.load();
            populateSubcategoryFilterSelect(
                document.getElementById('filter-subcategory'),
                db,
                document.getElementById('filter-category')?.value || '',
            );
            render(db);
        });
        document.getElementById('filter-subcategory')?.addEventListener('change', () => {
            render(global.venusStorage.load());
        });
    }

    function init() {
        const db = global.venusStorage.load();
        initFilterDateRange(db);
        bindEvents();
        render(db);
    }

    global.venusExpenses = {
        init,
        render,
        resetExpenseForm,
        openEditForm,
        saveExpense,
        deleteExpense,
    };
})(window);
