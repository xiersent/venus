/**
 * @file incomes.js
 * Venus — доходы: таблица, фильтр, добавление, изменение, удаление.
 */
(function (global) {
    'use strict';

    const $ = global.jQuery;

    /** @type {string|null} */
    let editingIncomeId = null;

    /** @type {ReturnType<typeof global.venusDatetime>} */
    const dt = global.venusDatetime;

    /** @type {ReturnType<typeof global.venusCategoryCombobox>} */
    const cb = global.venusCategoryCombobox;

    /** @type {ReturnType<typeof cb.bind>|null} */
    let incomeCategoryCombo = null;

    /** @type {ReturnType<typeof cb.bind>|null} */
    let incomeSubcategoryCombo = null;

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
     * @param {import('./storage').VenusDatabase} db
     * @returns {import('./storage').VenusTransaction[]}
     */
    function getIncomeTransactions(db) {
        return db.transactions.filter((transaction) => transaction.type === 'income');
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {import('./storage').VenusTransaction[]} incomes
     * @returns {import('./storage').VenusTransaction[]}
     */
    function applyIncomeFilters(db, incomes) {
        const filterEnabled = document.querySelector('[data-venus-income-filter]')?.checked;
        if (!filterEnabled) {
            return incomes;
        }

        const fromIso = parseDateInput(document.getElementById('inc-filter-from')?.value || '');
        const toIso = parseDateInput(document.getElementById('inc-filter-to')?.value || '');
        const accountId = document.getElementById('inc-filter-account')?.value || '';
        const categoryId = document.getElementById('inc-filter-category')?.value || '';
        const subcategoryId = document.getElementById('inc-filter-subcategory')?.value || '';

        return incomes.filter((transaction) => {
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
                !incomeCategoryMatchesFilter(db, transaction.category_id, categoryId)
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
    function incomeCategoryMatchesFilter(db, transactionCategoryId, filterRootId) {
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
    function resolveIncomeRow(db, transaction) {
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
     * @param {import('./storage').VenusTransaction[]} incomes
     * @param {string|null} selectedId
     */
    function renderIncomesTable(db, incomes, selectedId) {
        const tbody = document.querySelector('[data-venus-incomes-tbody]');
        const countEl = document.querySelector('[data-venus-incomes-count]');
        if (!tbody) {
            return;
        }

        const sorted = incomes.slice().sort((a, b) => dt.compareTransactionsByDateTime(a, b));

        if (sorted.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="10" class="sun-summaryEmpty">Нет записей. Нажмите «Добавить», чтобы внести доход.</td></tr>';
        } else {
            tbody.innerHTML = sorted
                .map((transaction, index) => {
                    const row = resolveIncomeRow(db, transaction);
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
                        '<tr class="js-venus-income-row' +
                        selectedClass +
                        '" data-income-id="' +
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
                        '<td class="sun-protoNumIncome">' +
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
     * @param {import('./storage').VenusTransaction[]} incomes
     * @param {string} isoDate YYYY-MM-DD
     * @returns {{ RUR: number; USD: number }}
     */
    function sumByCurrencyForDate(incomes, isoDate) {
        const db = global.venusStorage.load();
        const currencies = currencyMapById(db);
        const totals = { RUR: 0, USD: 0 };

        incomes.forEach((transaction) => {
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
     * @param {import('./storage').VenusTransaction[]} incomes
     * @param {Date} today
     * @returns {{ RUR: number; USD: number }}
     */
    function sumByCurrencyInRange(incomes, fromDate, toDate) {
        const db = global.venusStorage.load();
        const currencies = currencyMapById(db);
        const totals = { RUR: 0, USD: 0 };
        const fromIso = toIsoDate(fromDate);
        const toIso = toIsoDate(toDate);

        incomes.forEach((transaction) => {
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
     * @param {import('./storage').VenusTransaction[]} incomes
     */
    function renderIncomeTotals(incomes) {
        const today = new Date();
        const todayIso = toIsoDate(today);

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 6);

        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const todayTotals = sumByCurrencyForDate(incomes, todayIso);
        const weekTotals = sumByCurrencyInRange(incomes, weekStart, today);
        const monthTotals = sumByCurrencyInRange(incomes, monthStart, monthEnd);

        const allTotals = { RUR: 0, USD: 0 };
        const currencies = currencyMapById(global.venusStorage.load());
        incomes.forEach((transaction) => {
            const code = currencies[transaction.currency_id]?.code;
            if (code === 'RUR') {
                allTotals.RUR += transaction.amount;
            } else if (code === 'USD') {
                allTotals.USD += transaction.amount;
            }
        });

        setTotalCell('[data-venus-income-total-today-rur]', todayTotals.RUR);
        setTotalCell('[data-venus-income-total-today-usd]', todayTotals.USD);
        setTotalCell('[data-venus-income-total-week-rur]', weekTotals.RUR);
        setTotalCell('[data-venus-income-total-week-usd]', weekTotals.USD);
        setTotalCell('[data-venus-income-total-month-rur]', monthTotals.RUR);
        setTotalCell('[data-venus-income-total-month-usd]', monthTotals.USD);
        setTotalCell('[data-venus-income-total-all-rur]', allTotals.RUR);
        setTotalCell('[data-venus-income-total-all-usd]', allTotals.USD);
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
    function incomeRootCategories(db) {
        return db.categories
            .filter((category) => category.type === 'income' && !category.parent_id)
            .sort((a, b) => a.sort_order - b.sort_order);
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} parentId
     */
    function incomeSubcategories(db, parentId) {
        if (!parentId) {
            return [];
        }
        return db.categories
            .filter((category) => category.type === 'income' && category.parent_id === parentId)
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
            incomeRootCategories(db).forEach((category) => {
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

        const subs = incomeSubcategories(db, rootCategoryId);
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
        const fromInput = document.getElementById('inc-filter-from');
        const toInput = document.getElementById('inc-filter-to');
        const incomes = getIncomeTransactions(db);

        if (!fromInput || !toInput) {
            return;
        }

        if (incomes.length === 0) {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            fromInput.value = formatDateDisplay(toIsoDate(start));
            toInput.value = formatDateDisplay(toIsoDate(end));
            return;
        }

        let min = incomes[0].date;
        let max = incomes[0].date;
        incomes.forEach((transaction) => {
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
    function getSelectedIncomeId() {
        const row = document.querySelector('.js-venus-income-row.sun-protoRowSelected');
        return row ? row.getAttribute('data-income-id') : null;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} [selectedId]
     */
    function render(db, selectedId) {
        const incomes = applyIncomeFilters(db, getIncomeTransactions(db));
        renderIncomesTable(db, incomes, selectedId ?? getSelectedIncomeId());
        renderIncomeTotals(incomes);
        populateFilterSelect(
            document.getElementById('inc-filter-account'),
            db,
            '<Все счета>',
            'account',
        );
        populateFilterSelect(
            document.getElementById('inc-filter-category'),
            db,
            '<Все категории>',
            'category',
        );
        populateSubcategoryFilterSelect(
            document.getElementById('inc-filter-subcategory'),
            db,
            document.getElementById('inc-filter-category')?.value || '',
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
        const categories = incomeRootCategories(db);
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
                incomeSubcategories(db, parentCategoryId)
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
        const categorySelect = document.getElementById('inc-category');
        const subSelect = document.getElementById('inc-subcategory');
        if (!categorySelect || !subSelect) {
            return;
        }
        populateSubcategorySelect(subSelect, global.venusStorage.load(), categorySelect.value, null);
        incomeSubcategoryCombo?.refreshOptions();
        incomeSubcategoryCombo?.clearSearch();
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string} rootId
     * @param {string} categoryId
     */
    function refreshIncomeCategoryFields(db, rootId, categoryId) {
        const categorySelect = document.getElementById('inc-category');
        const subSelect = document.getElementById('inc-subcategory');
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
        incomeCategoryCombo?.refreshOptions();
        incomeSubcategoryCombo?.refreshOptions();
        incomeCategoryCombo?.syncFromSelect();
        incomeSubcategoryCombo?.syncFromSelect();
    }

    function initIncomeCategoryCombos() {
        const categorySelect = document.getElementById('inc-category');
        const subSelect = document.getElementById('inc-subcategory');
        if (!categorySelect || !subSelect) {
            return;
        }
        incomeCategoryCombo = cb.bind(
            categorySelect,
            document.getElementById('inc-category-search'),
            { onSelectChange: refreshSubcategoriesFromForm },
        );
        incomeSubcategoryCombo = cb.bind(
            subSelect,
            document.getElementById('inc-subcategory-search'),
        );
    }

    function resetIncomeForm() {
        editingIncomeId = null;
        const db = global.venusStorage.load();
        const title = document.querySelector('[data-venus-income-modal-title]');
        const dateInput = document.getElementById('inc-date');
        const timeInput = document.getElementById('inc-time');
        const accountSelect = document.getElementById('inc-account');
        const categorySelect = document.getElementById('inc-category');
        const subSelect = document.getElementById('inc-subcategory');
        const amountInput = document.getElementById('inc-amount');
        const currencySelect = document.getElementById('inc-currency');
        const qtyInput = document.getElementById('inc-qty');
        const unitSelect = document.getElementById('inc-unit');
        const noteInput = document.getElementById('inc-note');

        if (title) {
            title.textContent = 'Карточка дохода';
        }
        dt.setDateTimeFields(dateInput, timeInput, toIsoDate(new Date()), '');
        if (accountSelect) {
            populateAccountSelect(accountSelect, db, null);
        }
        if (categorySelect) {
            populateCategorySelect(categorySelect, db, null);
        }
        if (subSelect && categorySelect) {
            populateSubcategorySelect(subSelect, db, categorySelect.value, null);
        }
        if (amountInput) {
            amountInput.value = '0,00';
        }
        if (currencySelect) {
            populateCurrencySelect(currencySelect, db, null);
        }
        if (qtyInput) {
            qtyInput.value = '';
        }
        if (unitSelect) {
            populateUnitSelect(unitSelect, db, null);
        }
        if (noteInput) {
            noteInput.value = '';
        }
        incomeCategoryCombo?.refreshOptions();
        incomeSubcategoryCombo?.refreshOptions();
        incomeCategoryCombo?.syncFromSelect();
        incomeSubcategoryCombo?.clearSearch();
        incomeSubcategoryCombo?.syncFromSelect();
    }

    /**
     * @param {import('./storage').VenusTransaction} transaction
     * @param {import('./storage').VenusDatabase} db
     */
    function fillIncomeForm(transaction, db) {
        editingIncomeId = transaction.id;
        const categories = categoryMapById(db);
        const category = transaction.category_id ? categories[transaction.category_id] : null;

        let rootCategoryId = transaction.category_id;
        let subcategoryId = '';
        if (category?.parent_id) {
            rootCategoryId = category.parent_id;
            subcategoryId = transaction.category_id || '';
        }

        const title = document.querySelector('[data-venus-income-modal-title]');
        if (title) {
            title.textContent = 'Изменить доход';
        }

        const dateInput = document.getElementById('inc-date');
        const timeInput = document.getElementById('inc-time');
        dt.setDateTimeFields(dateInput, timeInput, transaction.date, transaction.time);

        populateAccountSelect(
            document.getElementById('inc-account'),
            db,
            transaction.account_id,
        );
        populateCategorySelect(
            document.getElementById('inc-category'),
            db,
            rootCategoryId,
        );
        populateSubcategorySelect(
            document.getElementById('inc-subcategory'),
            db,
            rootCategoryId,
            subcategoryId || null,
        );
        populateCurrencySelect(
            document.getElementById('inc-currency'),
            db,
            transaction.currency_id,
        );
        populateUnitSelect(document.getElementById('inc-unit'), db, transaction.unit_id);

        const amountInput = document.getElementById('inc-amount');
        if (amountInput) {
            amountInput.value = formatMoney(transaction.amount);
        }

        const qtyInput = document.getElementById('inc-qty');
        if (qtyInput) {
            qtyInput.value =
                transaction.quantity != null && transaction.quantity > 0
                    ? String(transaction.quantity)
                    : '';
        }

        const noteInput = document.getElementById('inc-note');
        if (noteInput) {
            noteInput.value = transaction.note || '';
        }
        incomeCategoryCombo?.refreshOptions();
        incomeSubcategoryCombo?.refreshOptions();
        incomeCategoryCombo?.syncFromSelect();
        incomeSubcategoryCombo?.syncFromSelect();
    }

    /**
     * @returns {object|null}
     */
    function readIncomeForm() {
        const dateInput = document.getElementById('inc-date');
        const timeInput = document.getElementById('inc-time');
        const accountSelect = document.getElementById('inc-account');
        const categorySelect = document.getElementById('inc-category');
        const subSelect = document.getElementById('inc-subcategory');
        const amountInput = document.getElementById('inc-amount');
        const currencySelect = document.getElementById('inc-currency');
        const qtyInput = document.getElementById('inc-qty');
        const unitSelect = document.getElementById('inc-unit');
        const noteInput = document.getElementById('inc-note');

        const date = dateInput?.value || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            global.alert('Укажите дату дохода.');
            dateInput?.focus();
            return null;
        }
        const time = dt.readTimeInput(timeInput);

        const accountId = accountSelect?.value || '';
        if (!accountId) {
            global.alert('Выберите счёт для зачисления.');
            accountSelect?.focus();
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

        return {
            date,
            time,
            accountId,
            amount,
            currencyId,
            quantity,
            unitId: unitId || null,
            note: noteInput ? noteInput.value.trim() : '',
        };
    }

    /**
     * @returns {boolean}
     */
    function saveIncome() {
        const form = readIncomeForm();
        if (!form) {
            return false;
        }

        const db = global.venusStorage.load();
        const categoryResolved = cb.resolveFromForm(db, 'income', {
            categorySelect: document.getElementById('inc-category'),
            categoryInput: document.getElementById('inc-category-search'),
            subcategorySelect: document.getElementById('inc-subcategory'),
            subcategoryInput: document.getElementById('inc-subcategory-search'),
            emptyCategoryMessage: 'Выберите или введите категорию дохода.',
        });
        if (!categoryResolved.ok || !categoryResolved.categoryId || !categoryResolved.rootId) {
            global.alert(categoryResolved.message || 'Выберите или введите категорию дохода.');
            return false;
        }
        const categoryId = categoryResolved.categoryId;
        if (categoryResolved.dbChanged) {
            refreshIncomeCategoryFields(db, categoryResolved.rootId, categoryId);
        }

        const user = db.users.find((item) => item.is_active) || db.users[0];
        const now = new Date().toISOString();

        if (editingIncomeId) {
            const transaction = db.transactions.find((item) => item.id === editingIncomeId);
            if (!transaction || transaction.type !== 'income') {
                return false;
            }

            transaction.date = form.date;
            dt.applyTransactionTime(transaction, form.time);
            transaction.account_id = form.accountId;
            transaction.category_id = categoryId;
            transaction.amount = form.amount;
            transaction.currency_id = form.currencyId;
            transaction.quantity = form.quantity;
            transaction.unit_id = form.unitId;
            transaction.note = form.note;
            transaction.updated_at = now;

            global.venusStorage.save(db);
            render(db, transaction.id);
            if (global.venusAccounts) {
                global.venusAccounts.render(db);
            }
            editingIncomeId = null;
            return true;
        }

        const transactionId = global.venusStorage.createId();
        db.transactions.push({
            id: transactionId,
            type: 'income',
            date: form.date,
            ...(form.time ? { time: form.time } : {}),
            account_id: form.accountId,
            account_from_id: null,
            account_to_id: null,
            category_id: categoryId,
            amount: form.amount,
            currency_id: form.currencyId,
            quantity: form.quantity,
            unit_id: form.unitId,
            note: form.note,
            user_id: user ? user.id : null,
            created_at: now,
            updated_at: now,
        });

        global.venusStorage.save(db);
        render(db, transactionId);
        if (global.venusAccounts) {
            global.venusAccounts.render(db);
        }
        return true;
    }

    /**
     * @param {string} incomeId
     * @returns {boolean}
     */
    function deleteIncome(incomeId) {
        const db = global.venusStorage.load();
        const transaction = db.transactions.find((item) => item.id === incomeId);
        if (!transaction || transaction.type !== 'income') {
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

        if (!global.confirm('Удалить доход: ' + label + '?')) {
            return false;
        }

        db.transactions = db.transactions.filter((item) => item.id !== incomeId);
        global.venusStorage.save(db);

        const incomes = applyIncomeFilters(db, getIncomeTransactions(db));
        const nextId = incomes[0]?.id ?? null;
        render(db, nextId);
        if (global.venusAccounts) {
            global.venusAccounts.render(db);
        }
        return true;
    }

    function deleteSelectedIncome() {
        const incomeId = getSelectedIncomeId();
        if (!incomeId) {
            return false;
        }
        return deleteIncome(incomeId);
    }

    /**
     * @param {string} incomeId
     * @returns {boolean}
     */
    function openEditForm(incomeId) {
        const db = global.venusStorage.load();
        const transaction = db.transactions.find((item) => item.id === incomeId);
        if (!transaction || transaction.type !== 'income') {
            return false;
        }

        fillIncomeForm(transaction, db);
        $.xiermodal('show', 'venus-income');
        return true;
    }

    function bindEvents() {
        $(document).on('click', '.js-venus-income-add', (event) => {
            event.preventDefault();
            const db = global.venusStorage.load();
            if (visibleAccountsForSelect(db).length === 0) {
                global.alert('Сначала добавьте хотя бы один счёт на вкладке «Счета».');
                return;
            }
            if (incomeRootCategories(db).length === 0) {
                global.alert('Нет категорий доходов.');
                return;
            }
            resetIncomeForm();
            $.xiermodal('show', 'venus-income');
        });

        $(document).on('click', '.js-venus-income-edit', (event) => {
            event.preventDefault();
            const incomeId = getSelectedIncomeId();
            if (!incomeId) {
                return;
            }
            openEditForm(incomeId);
        });

        $(document).on('click', '.js-venus-income-delete', (event) => {
            event.preventDefault();
            deleteSelectedIncome();
        });

        $(document).on('click', '.js-venus-income-save', (event) => {
            event.preventDefault();
            if (saveIncome()) {
                $.xiermodal('hide', 'venus-income');
            }
        });

        document.addEventListener('click', (event) => {
            const row = event.target.closest('.js-venus-income-row');
            if (!row) {
                return;
            }
            document.querySelectorAll('.js-venus-income-row').forEach((item) => {
                item.classList.toggle('sun-protoRowSelected', item === row);
            });
        });

        document.addEventListener('dblclick', (event) => {
            const row = event.target.closest('.js-venus-income-row');
            if (!row) {
                return;
            }
            document.querySelectorAll('.js-venus-income-row').forEach((item) => {
                item.classList.toggle('sun-protoRowSelected', item === row);
            });

            const incomeId = row.getAttribute('data-income-id');
            if (incomeId) {
                openEditForm(incomeId);
            }
        });

        initIncomeCategoryCombos();

        document.querySelector('[data-venus-income-filter]')?.addEventListener('change', () => {
            render(global.venusStorage.load());
        });
        ['inc-filter-from', 'inc-filter-to'].forEach((id) => {
            document.getElementById(id)?.addEventListener('keyup', () => {
                render(global.venusStorage.load());
            });
        });
        document.getElementById('inc-filter-account')?.addEventListener('change', () => {
            render(global.venusStorage.load());
        });
        document.getElementById('inc-filter-category')?.addEventListener('change', () => {
            const db = global.venusStorage.load();
            populateSubcategoryFilterSelect(
                document.getElementById('inc-filter-subcategory'),
                db,
                document.getElementById('inc-filter-category')?.value || '',
            );
            render(db);
        });
        document.getElementById('inc-filter-subcategory')?.addEventListener('change', () => {
            render(global.venusStorage.load());
        });
    }

    function init() {
        const db = global.venusStorage.load();
        initFilterDateRange(db);
        bindEvents();
        render(db);
    }

    global.venusIncomes = {
        init,
        render,
        resetIncomeForm,
        openEditForm,
        saveIncome,
        deleteIncome,
    };
})(window);
