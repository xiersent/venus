/**
 * @file accounts.js
 * Venus — таблица счетов: добавление, изменение, удаление.
 */
(function (global) {
    'use strict';

    const $ = global.jQuery;

    /** @type {string|null} */
    let editingAccountId = null;

    /**
     * @param {number} amount
     * @returns {string}
     */
    function formatMoney(amount) {
        return amount.toFixed(2).replace('.', ',');
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @returns {Record<string, { code: string }>}
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
     * @param {string} accountId
     */
    function accountTotals(db, accountId) {
        const currencies = currencyMapById(db);
        const totals = {
            expense: { RUR: 0, USD: 0 },
            income: { RUR: 0, USD: 0 },
            other: { RUR: 0, USD: 0 },
            balance: { RUR: 0, USD: 0 },
        };

        db.transactions.forEach((transaction) => {
            const code = currencies[transaction.currency_id]?.code;
            if (code !== 'RUR' && code !== 'USD') {
                return;
            }

            if (transaction.type === 'expense' && transaction.account_id === accountId) {
                totals.expense[code] += transaction.amount;
            } else if (transaction.type === 'income' && transaction.account_id === accountId) {
                totals.income[code] += transaction.amount;
            } else if (transaction.type === 'transfer') {
                if (transaction.account_from_id === accountId) {
                    totals.other[code] -= transaction.amount;
                }
                if (transaction.account_to_id === accountId) {
                    totals.other[code] += transaction.amount;
                }
            } else if (transaction.type === 'initial_balance' && transaction.account_id === accountId) {
                totals.other[code] += transaction.amount;
            } else if (transaction.account_id === accountId) {
                totals.other[code] += transaction.amount;
            }
        });

        totals.balance.RUR = totals.income.RUR - totals.expense.RUR + totals.other.RUR;
        totals.balance.USD = totals.income.USD - totals.expense.USD + totals.other.USD;

        return totals;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {boolean} showHidden
     * @returns {import('./storage').VenusAccount[]}
     */
    function visibleAccounts(db, showHidden) {
        return db.accounts
            .filter((account) => showHidden || !account.is_hidden)
            .sort((a, b) => a.sort_order - b.sort_order);
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} selectedId
     */
    function renderAccountsTable(db, selectedId) {
        const tbody = document.querySelector('[data-venus-accounts-tbody]');
        const countEl = document.querySelector('[data-venus-accounts-count]');
        const showHidden = document.querySelector('[data-venus-show-hidden]')?.checked ?? false;
        const accounts = visibleAccounts(db, showHidden);

        if (!tbody) {
            return;
        }

        if (accounts.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="10" class="sun-summaryEmpty">Нет счетов. Нажмите «Добавить».</td></tr>';
        } else {
            tbody.innerHTML = accounts
                .map((account, index) => {
                    const totals = accountTotals(db, account.id);
                    const selectedClass =
                        account.id === selectedId || (!selectedId && index === 0)
                            ? ' sun-protoRowSelected'
                            : '';

                    return (
                        '<tr class="js-venus-account-row' +
                        selectedClass +
                        '" data-account-id="' +
                        account.id +
                        '">' +
                        '<td>' +
                        (index + 1) +
                        '</td>' +
                        '<td class="sun-dateComparisonName">' +
                        escapeHtml(account.name) +
                        '</td>' +
                        '<td class="sun-protoNumExpense">' +
                        formatMoney(totals.expense.RUR) +
                        '</td>' +
                        '<td>' +
                        formatMoney(totals.expense.USD) +
                        '</td>' +
                        '<td class="sun-protoNumIncome">' +
                        formatMoney(totals.income.RUR) +
                        '</td>' +
                        '<td>' +
                        formatMoney(totals.income.USD) +
                        '</td>' +
                        '<td>' +
                        formatMoney(totals.other.RUR) +
                        '</td>' +
                        '<td>' +
                        formatMoney(totals.other.USD) +
                        '</td>' +
                        '<td class="sun-protoNumBalance">' +
                        formatMoney(totals.balance.RUR) +
                        '</td>' +
                        '<td>' +
                        formatMoney(totals.balance.USD) +
                        '</td>' +
                        '</tr>'
                    );
                })
                .join('');
        }

        if (countEl) {
            countEl.textContent = 'Счетов: ' + accounts.length;
        }

        const grand = { RUR: 0, USD: 0 };
        accounts.forEach((account) => {
            const totals = accountTotals(db, account.id);
            grand.RUR += totals.balance.RUR;
            grand.USD += totals.balance.USD;
        });

        const totalRur = document.querySelector('[data-venus-total-balance-rur]');
        const totalUsd = document.querySelector('[data-venus-total-balance-usd]');
        if (totalRur) {
            totalRur.textContent = formatMoney(grand.RUR);
        }
        if (totalUsd) {
            totalUsd.textContent = formatMoney(grand.USD);
        }
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
     * @param {import('./storage').VenusDatabase} db
     */
    function renderUserName(db) {
        const user = db.users.find((item) => item.is_active) || db.users[0];
        const el = document.querySelector('[data-venus-user-name]');
        if (el && user) {
            el.textContent = user.name;
        }
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} selectedId
     */
    function populateCurrencySelect(select, db, selectedId) {
        const defaultCurrency = db.currencies.find((currency) => currency.code === 'RUR');
        const value = selectedId || defaultCurrency?.id || db.currencies[0]?.id || '';

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
                    escapeHtml(currency.name + ' (' + currency.code + ')') +
                    '</option>',
            )
            .join('');
    }

    /**
     * @returns {string|null}
     */
    function getSelectedAccountId() {
        const row = document.querySelector('.js-venus-account-row.sun-protoRowSelected');
        return row ? row.getAttribute('data-account-id') : null;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string} accountId
     * @returns {boolean}
     */
    function accountHasTransactions(db, accountId) {
        return db.transactions.some(
            (transaction) =>
                transaction.account_id === accountId ||
                transaction.account_from_id === accountId ||
                transaction.account_to_id === accountId,
        );
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} [selectedId]
     */
    function render(db, selectedId) {
        renderUserName(db);
        renderAccountsTable(db, selectedId ?? getSelectedAccountId());
    }

    function resetAccountForm() {
        editingAccountId = null;

        const nameInput = document.getElementById('acc-name');
        const noteInput = document.getElementById('acc-note');
        const hiddenInput = document.getElementById('acc-hidden');
        const currencySelect = document.getElementById('acc-currency');
        const title = document.querySelector('[data-venus-account-modal-title]');

        if (nameInput) {
            nameInput.value = '';
        }
        if (noteInput) {
            noteInput.value = '';
        }
        if (hiddenInput) {
            hiddenInput.checked = false;
        }
        if (title) {
            title.textContent = 'Новый счёт';
        }
        if (currencySelect) {
            currencySelect.disabled = false;
            populateCurrencySelect(currencySelect, global.venusStorage.load(), null);
        }
    }

    /**
     * @param {import('./storage').VenusAccount} account
     * @param {import('./storage').VenusDatabase} db
     */
    function fillAccountForm(account, db) {
        const nameInput = document.getElementById('acc-name');
        const noteInput = document.getElementById('acc-note');
        const hiddenInput = document.getElementById('acc-hidden');
        const currencySelect = document.getElementById('acc-currency');
        const title = document.querySelector('[data-venus-account-modal-title]');

        editingAccountId = account.id;

        if (title) {
            title.textContent = 'Изменить счёт';
        }
        if (nameInput) {
            nameInput.value = account.name;
        }
        if (noteInput) {
            noteInput.value = account.note;
        }
        if (hiddenInput) {
            hiddenInput.checked = account.is_hidden;
        }
        if (currencySelect) {
            populateCurrencySelect(currencySelect, db, account.currency_id);
            currencySelect.disabled = accountHasTransactions(db, account.id);
        }
    }

    /**
     * @returns {{ name: string, currencyId: string, note: string, isHidden: boolean }|null}
     */
    function readAccountForm() {
        const nameInput = document.getElementById('acc-name');
        const currencySelect = document.getElementById('acc-currency');
        const noteInput = document.getElementById('acc-note');
        const hiddenInput = document.getElementById('acc-hidden');

        if (!nameInput || !currencySelect) {
            return null;
        }

        const name = nameInput.value.trim();
        if (!name) {
            nameInput.focus();
            return null;
        }

        return {
            name,
            currencyId: currencySelect.value,
            note: noteInput ? noteInput.value.trim() : '',
            isHidden: hiddenInput ? hiddenInput.checked : false,
        };
    }

    /**
     * @returns {boolean}
     */
    function saveAccount() {
        const form = readAccountForm();
        if (!form) {
            return false;
        }

        const db = global.venusStorage.load();
        const now = new Date().toISOString();

        if (editingAccountId) {
            const account = db.accounts.find((item) => item.id === editingAccountId);
            if (!account) {
                return false;
            }

            account.name = form.name;
            account.note = form.note;
            account.is_hidden = form.isHidden;
            if (!accountHasTransactions(db, account.id)) {
                account.currency_id = form.currencyId;
            }
            account.updated_at = now;

            global.venusStorage.save(db);
            render(db, account.id);
            editingAccountId = null;
            return true;
        }

        const user = db.users.find((item) => item.is_active) || db.users[0];
        const accountId = global.venusStorage.createId();

        db.accounts.push({
            id: accountId,
            name: form.name,
            currency_id: form.currencyId,
            note: form.note,
            is_hidden: form.isHidden,
            sort_order: db.accounts.length,
            user_id: user ? user.id : null,
            created_at: now,
            updated_at: now,
        });

        global.venusStorage.save(db);
        render(db, accountId);
        return true;
    }

    /**
     * @param {string} accountId
     * @returns {boolean}
     */
    function openEditForm(accountId) {
        const db = global.venusStorage.load();
        const account = db.accounts.find((item) => item.id === accountId);
        if (!account) {
            return false;
        }

        fillAccountForm(account, db);
        $.xiermodal('show', 'venus-account');
        return true;
    }

    /**
     * @param {string} accountId
     * @returns {boolean}
     */
    function deleteAccount(accountId) {
        const db = global.venusStorage.load();
        const account = db.accounts.find((item) => item.id === accountId);
        if (!account) {
            return false;
        }

        if (accountHasTransactions(db, accountId)) {
            global.alert(
                'Нельзя удалить счёт «' + account.name + '»: по нему есть операции.',
            );
            return false;
        }

        if (!global.confirm('Удалить счёт «' + account.name + '»?')) {
            return false;
        }

        db.accounts = db.accounts.filter((item) => item.id !== accountId);
        db.accounts.forEach((item, index) => {
            item.sort_order = index;
        });

        global.venusStorage.save(db);

        const showHidden = document.querySelector('[data-venus-show-hidden]')?.checked ?? false;
        const remaining = visibleAccounts(db, showHidden);
        const nextSelectedId = remaining[0]?.id ?? null;

        render(db, nextSelectedId);
        return true;
    }

    /**
     * @returns {boolean}
     */
    function deleteSelectedAccount() {
        const accountId = getSelectedAccountId();
        if (!accountId) {
            return false;
        }
        return deleteAccount(accountId);
    }

    /**
     * @returns {boolean}
     */
    function hideSelectedAccount() {
        const accountId = getSelectedAccountId();
        if (!accountId) {
            global.alert('Выберите счёт в таблице.');
            return false;
        }

        const db = global.venusStorage.load();
        const account = db.accounts.find((item) => item.id === accountId);
        if (!account) {
            return false;
        }

        if (account.is_hidden) {
            global.alert('Счёт «' + account.name + '» уже скрыт.');
            return false;
        }

        account.is_hidden = true;
        account.updated_at = new Date().toISOString();
        global.venusStorage.save(db);

        const showHidden = document.querySelector('[data-venus-show-hidden]')?.checked ?? false;
        const remaining = visibleAccounts(db, showHidden);
        const nextSelectedId = remaining.some((item) => item.id === accountId)
            ? accountId
            : remaining[0]?.id ?? null;

        render(db, nextSelectedId);
        return true;
    }

    function bindEvents() {
        $(document).on('click', '.js-venus-account-add', (event) => {
            event.preventDefault();
            resetAccountForm();
            $.xiermodal('show', 'venus-account');
        });

        $(document).on('click', '.js-venus-account-edit', (event) => {
            event.preventDefault();
            const accountId = getSelectedAccountId();
            if (!accountId) {
                return;
            }
            openEditForm(accountId);
        });

        $(document).on('click', '.js-venus-account-delete', (event) => {
            event.preventDefault();
            deleteSelectedAccount();
        });

        $(document).on('click', '.js-venus-account-hide', (event) => {
            event.preventDefault();
            hideSelectedAccount();
        });

        $(document).on('click', '.js-venus-account-save', (event) => {
            event.preventDefault();
            if (saveAccount()) {
                $.xiermodal('hide', 'venus-account');
            }
        });

        document.addEventListener('click', (event) => {
            const row = event.target.closest('.js-venus-account-row');
            if (!row) {
                return;
            }

            document.querySelectorAll('.js-venus-account-row').forEach((item) => {
                item.classList.toggle('sun-protoRowSelected', item === row);
            });
        });

        document.addEventListener('dblclick', (event) => {
            const row = event.target.closest('.js-venus-account-row');
            if (!row) {
                return;
            }

            document.querySelectorAll('.js-venus-account-row').forEach((item) => {
                item.classList.toggle('sun-protoRowSelected', item === row);
            });

            const accountId = row.getAttribute('data-account-id');
            if (accountId) {
                openEditForm(accountId);
            }
        });

        const showHiddenCheckbox = document.querySelector('[data-venus-show-hidden]');
        if (showHiddenCheckbox) {
            showHiddenCheckbox.addEventListener('change', () => {
                render(global.venusStorage.load());
            });
        }
    }

    const ACCOUNTS_SUBTAB_KEY = 'venus-accounts-subtab';

    /**
     * @param {string} subtabId
     */
    function activateAccountsSubtab(subtabId) {
        document.querySelectorAll('[data-accounts-subtab]').forEach((button) => {
            button.classList.toggle('sun-active', button.dataset.accountsSubtab === subtabId);
        });
        document.querySelectorAll('[data-accounts-subpanel]').forEach((panel) => {
            panel.classList.toggle('sun-active', panel.dataset.accountsSubpanel === subtabId);
        });
    }

    function initAccountsSubtabs() {
        const valid = ['brief', 'transfers'];
        let subtab = 'brief';
        try {
            const stored = localStorage.getItem(ACCOUNTS_SUBTAB_KEY);
            if (stored && valid.includes(stored)) {
                subtab = stored;
            }
        } catch (err) {
            console.warn('venus.accounts.initAccountsSubtabs:', err);
        }

        activateAccountsSubtab(subtab);

        document.querySelectorAll('[data-accounts-subtab]').forEach((button) => {
            button.addEventListener('click', () => {
                const subtabId = button.dataset.accountsSubtab;
                if (!subtabId || !valid.includes(subtabId)) {
                    return;
                }
                activateAccountsSubtab(subtabId);
                try {
                    localStorage.setItem(ACCOUNTS_SUBTAB_KEY, subtabId);
                } catch (err) {
                    console.warn('venus.accounts.saveAccountsSubtab:', err);
                }
            });
        });
    }

    function init() {
        initAccountsSubtabs();
        bindEvents();
        render(global.venusStorage.load());
    }

    global.venusAccounts = {
        init,
        render,
        resetAccountForm,
        openEditForm,
        saveAccount,
        deleteAccount,
        deleteSelectedAccount,
        hideSelectedAccount,
    };
})(window);
