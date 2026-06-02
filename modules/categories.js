/**
 * @file categories.js
 * Venus — окно «Категории»: 6 вкладок, CRUD, форма в отдельной модалке.
 */
(function (global) {
    'use strict';

    const $ = global.jQuery;

    /** @typedef {import('./storage').VenusCategoryType} VenusCategoryType */

    /** @typedef {'expense'|'income'|'units'|'creditors'|'debtors'|'deposits'} VenusCatalogTab */

    /**
     * @typedef {Object} VenusCatalogEditContext
     * @property {'add'|'edit'} mode
     * @property {'category-root'|'category-sub'|'unit'|'creditor'|'debtor'|'deposit'} entity
     * @property {VenusCategoryType} [categoryType]
     * @property {string} [itemId]
     * @property {string} [parentId]
     */

    /** @type {VenusCatalogTab} */
    let activeTab = 'expense';

    /** @type {Record<VenusCategoryType, string|null>} */
    const selectedRootId = { expense: null, income: null };

    /** @type {Record<VenusCategoryType, string|null>} */
    const selectedSubId = { expense: null, income: null };

    /** @type {Record<string, string|null>} */
    const selectedListId = {
        units: null,
        creditors: null,
        debtors: null,
        deposits: null,
    };

    /** @type {VenusCatalogEditContext|null} */
    let editContext = null;

    const TYPE_LABELS = {
        expense: { root: 'расходов', sub: 'расходов', category: 'расхода' },
        income: { root: 'доходов', sub: 'доходов', category: 'дохода' },
    };

    /** @type {Record<string, { dbKey: string, count: string, empty: string, col: string }>} */
    const LIST_TABS = {
        units: {
            dbKey: 'units',
            count: 'Единиц измерения',
            empty: 'Нет единиц измерения.',
            col: 'Единица',
        },
        creditors: {
            dbKey: 'creditors',
            count: 'Кредиторов',
            empty: 'Нет кредиторов.',
            col: 'Кредитор',
        },
        debtors: {
            dbKey: 'debtors',
            count: 'Должников',
            empty: 'Нет должников.',
            col: 'Должник',
        },
        deposits: {
            dbKey: 'deposit_names',
            count: 'Названий вкладов',
            empty: 'Нет названий вкладов.',
            col: 'Название вклада',
        },
    };

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
     * @param {VenusCategoryType} type
     * @param {import('./storage').VenusDatabase} db
     * @returns {import('./storage').VenusCategory[]}
     */
    function rootCategories(db, type) {
        return db.categories
            .filter((category) => category.type === type && !category.parent_id)
            .sort((a, b) => a.sort_order - b.sort_order);
    }

    /**
     * @param {VenusCategoryType} type
     * @param {import('./storage').VenusDatabase} db
     * @param {string} parentId
     * @returns {import('./storage').VenusCategory[]}
     */
    function subcategories(db, type, parentId) {
        return db.categories
            .filter((category) => category.type === type && category.parent_id === parentId)
            .sort((a, b) => a.sort_order - b.sort_order);
    }

    /**
     * @param {string} tab
     * @param {import('./storage').VenusDatabase} db
     * @returns {Array<{ id: string, name: string, sort_order: number, is_system?: boolean }>}
     */
    function listItems(db, tab) {
        const config = LIST_TABS[tab];
        if (!config) {
            return [];
        }

        const items = db[config.dbKey];
        if (!Array.isArray(items)) {
            return [];
        }

        return items.slice().sort((a, b) => a.sort_order - b.sort_order);
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string} categoryId
     * @returns {boolean}
     */
    function categoryHasTransactions(db, categoryId) {
        return db.transactions.some((transaction) => transaction.category_id === categoryId);
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string} rootId
     * @returns {boolean}
     */
    function rootTreeHasTransactions(db, rootId) {
        const ids = new Set([rootId]);
        db.categories.forEach((category) => {
            if (category.parent_id === rootId) {
                ids.add(category.id);
            }
        });
        return db.transactions.some(
            (transaction) => transaction.category_id && ids.has(transaction.category_id),
        );
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string} unitId
     * @returns {boolean}
     */
    function unitHasTransactions(db, unitId) {
        return db.transactions.some((transaction) => transaction.unit_id === unitId);
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {VenusCategoryType} type
     * @param {string} name
     * @param {string|null} parentId
     * @param {string|null} [exceptId]
     * @returns {boolean}
     */
    function categoryNameExists(db, type, name, parentId, exceptId) {
        const normalized = name.trim().toLowerCase();
        return db.categories.some(
            (category) =>
                category.type === type &&
                (category.parent_id || null) === (parentId || null) &&
                category.id !== exceptId &&
                category.name.trim().toLowerCase() === normalized,
        );
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string} dbKey
     * @param {string} name
     * @param {string|null} [exceptId]
     * @returns {boolean}
     */
    function listNameExists(db, dbKey, name, exceptId) {
        const normalized = name.trim().toLowerCase();
        const items = db[dbKey];
        if (!Array.isArray(items)) {
            return false;
        }
        return items.some(
            (item) =>
                item.id !== exceptId && item.name.trim().toLowerCase() === normalized,
        );
    }

    /**
     * @param {VenusCatalogTab} tab
     */
    function setActiveTab(tab) {
        activeTab = tab;

        document.querySelectorAll('.js-venus-cat-tab').forEach((button) => {
            const tabType = button.getAttribute('data-venus-cat-tab');
            button.classList.toggle('sun-active', tabType === tab);
        });

        document.querySelectorAll('[data-venus-cat-panel]').forEach((panel) => {
            const panelType = panel.getAttribute('data-venus-cat-panel');
            panel.classList.toggle('venus-hidden', panelType !== tab);
        });
    }

    /**
     * @param {VenusCategoryType} type
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} rootId
     */
    function renderRoots(db, type, rootId) {
        const tbody = document.querySelector('[data-venus-cat-roots="' + type + '"]');
        const countEl = document.querySelector('[data-venus-cat-root-count="' + type + '"]');
        const roots = rootCategories(db, type);
        const labels = TYPE_LABELS[type];

        if (!tbody) {
            return;
        }

        if (roots.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="2" class="sun-summaryEmpty">Нет категорий ' +
                labels.root +
                '.</td></tr>';
            selectedRootId[type] = null;
            selectedSubId[type] = null;
        } else {
            const activeId = rootId || selectedRootId[type] || roots[0].id;
            selectedRootId[type] = activeId;

            tbody.innerHTML = roots
                .map((category) => {
                    const subCount = subcategories(db, type, category.id).length;
                    const selected =
                        category.id === activeId ? ' sun-protoRowSelected' : '';
                    return (
                        '<tr class="js-venus-cat-root' +
                        selected +
                        '" data-venus-cat-type="' +
                        type +
                        '" data-category-id="' +
                        category.id +
                        '">' +
                        '<td class="sun-dateComparisonName">' +
                        escapeHtml(category.name) +
                        '</td>' +
                        '<td>' +
                        subCount +
                        '</td>' +
                        '</tr>'
                    );
                })
                .join('');
        }

        if (countEl) {
            countEl.textContent = 'Категорий ' + labels.root + ': ' + roots.length;
        }

        renderSubs(db, type, selectedRootId[type]);
    }

    /**
     * @param {VenusCategoryType} type
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} rootId
     * @param {string|null} [subId]
     */
    function renderSubs(db, type, rootId, subId) {
        const tbody = document.querySelector('[data-venus-cat-subs="' + type + '"]');
        const countEl = document.querySelector('[data-venus-cat-sub-count="' + type + '"]');
        const labels = TYPE_LABELS[type];

        if (!tbody) {
            return;
        }

        if (!rootId) {
            tbody.innerHTML =
                '<tr><td colspan="2" class="sun-summaryEmpty">Выберите категорию слева.</td></tr>';
            selectedSubId[type] = null;
            if (countEl) {
                countEl.textContent = 'Подкатегорий ' + labels.sub + ': 0';
            }
            return;
        }

        const subs = subcategories(db, type, rootId);

        if (subs.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="2" class="sun-summaryEmpty">Нет подкатегорий.</td></tr>';
            selectedSubId[type] = null;
        } else {
            const activeSubId = subId || selectedSubId[type] || subs[0].id;
            selectedSubId[type] = subs.some((item) => item.id === activeSubId)
                ? activeSubId
                : subs[0].id;

            tbody.innerHTML = subs
                .map((category, index) => {
                    const selected =
                        category.id === selectedSubId[type] ? ' sun-protoRowSelected' : '';
                    return (
                        '<tr class="js-venus-cat-sub' +
                        selected +
                        '" data-venus-cat-type="' +
                        type +
                        '" data-category-id="' +
                        category.id +
                        '">' +
                        '<td>' +
                        (index + 1) +
                        '</td>' +
                        '<td class="sun-dateComparisonName">' +
                        escapeHtml(category.name) +
                        '</td>' +
                        '</tr>'
                    );
                })
                .join('');
        }

        if (countEl) {
            countEl.textContent = 'Подкатегорий ' + labels.sub + ': ' + subs.length;
        }
    }

    /**
     * @param {string} tab
     * @param {import('./storage').VenusDatabase} db
     * @param {string|null} [itemId]
     */
    function renderList(db, tab, itemId) {
        const config = LIST_TABS[tab];
        const tbody = document.querySelector('[data-venus-cat-list="' + tab + '"]');
        const countEl = document.querySelector('[data-venus-cat-list-count="' + tab + '"]');

        if (!config || !tbody) {
            return;
        }

        const items = listItems(db, tab);

        if (items.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="2" class="sun-summaryEmpty">' + config.empty + '</td></tr>';
            selectedListId[tab] = null;
        } else {
            const activeId = itemId || selectedListId[tab] || items[0].id;
            selectedListId[tab] = items.some((item) => item.id === activeId)
                ? activeId
                : items[0].id;

            tbody.innerHTML = items
                .map((item, index) => {
                    const selected =
                        item.id === selectedListId[tab] ? ' sun-protoRowSelected' : '';
                    return (
                        '<tr class="js-venus-cat-list-row' +
                        selected +
                        '" data-venus-cat-tab="' +
                        tab +
                        '" data-item-id="' +
                        item.id +
                        '">' +
                        '<td>' +
                        (index + 1) +
                        '</td>' +
                        '<td class="sun-dateComparisonName">' +
                        escapeHtml(item.name) +
                        '</td>' +
                        '</tr>'
                    );
                })
                .join('');
        }

        if (countEl) {
            countEl.textContent = config.count + ': ' + items.length;
        }
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function render(db) {
        renderRoots(db, 'expense', selectedRootId.expense);
        renderRoots(db, 'income', selectedRootId.income);
        Object.keys(LIST_TABS).forEach((tab) => {
            renderList(db, tab, selectedListId[tab]);
        });
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function notifyCatalogChanged(db) {
        if (global.venusExpenses) {
            global.venusExpenses.render(db);
        }
        if (global.venusIncomes) {
            global.venusIncomes.render(db);
        }
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     */
    function persist(db) {
        db.meta.updated_at = new Date().toISOString();
        global.venusStorage.save(db);
        render(db);
        notifyCatalogChanged(db);
    }

    /**
     * @param {VenusCatalogEditContext} context
     * @param {string} [value]
     */
    function openEditModal(context, value) {
        editContext = context;

        const titleEl = document.querySelector('[data-venus-catalog-edit-title]');
        const nameInput = document.getElementById('venus-catalog-edit-name');

        let title = 'Название';

        if (context.entity === 'category-root') {
            title =
                (context.mode === 'add' ? 'Новая категория ' : 'Изменить категорию ') +
                TYPE_LABELS[context.categoryType].category;
        } else if (context.entity === 'category-sub') {
            title =
                (context.mode === 'add' ? 'Новая подкатегория ' : 'Изменить подкатегорию ') +
                TYPE_LABELS[context.categoryType].category;
        } else if (context.entity === 'unit') {
            title = context.mode === 'add' ? 'Новая единица измерения' : 'Изменить единицу измерения';
        } else if (context.entity === 'creditor') {
            title = context.mode === 'add' ? 'Новый кредитор' : 'Изменить кредитора';
        } else if (context.entity === 'debtor') {
            title = context.mode === 'add' ? 'Новый должник' : 'Изменить должника';
        } else if (context.entity === 'deposit') {
            title =
                context.mode === 'add' ? 'Новое название вклада' : 'Изменить название вклада';
        }

        if (titleEl) {
            titleEl.textContent = title;
        }
        if (nameInput) {
            nameInput.value = value || '';
        }

        $.xiermodal('show', 'venus-catalog-edit');

        global.setTimeout(() => {
            nameInput?.focus();
            nameInput?.select();
        }, 0);
    }

    /**
     * @returns {string|null}
     */
    function readEditName() {
        const nameInput = document.getElementById('venus-catalog-edit-name');
        if (!nameInput) {
            return null;
        }
        const name = nameInput.value.trim();
        if (!name) {
            nameInput.focus();
            global.alert('Введите название.');
            return null;
        }
        return name;
    }

    /**
     * @returns {boolean}
     */
    function saveEditModal() {
        if (!editContext) {
            return false;
        }

        const name = readEditName();
        if (!name) {
            return false;
        }

        const db = global.venusStorage.load();
        const ctx = editContext;

        if (ctx.entity === 'category-root' && ctx.categoryType) {
            const type = ctx.categoryType;

            if (ctx.mode === 'add') {
                if (categoryNameExists(db, type, name, null)) {
                    global.alert('Категория с таким названием уже есть.');
                    return false;
                }
                const id = global.venusStorage.createId();
                db.categories.push({
                    id,
                    type,
                    parent_id: null,
                    name,
                    sort_order: rootCategories(db, type).length,
                    is_system: false,
                    is_hidden: false,
                });
                selectedRootId[type] = id;
                selectedSubId[type] = null;
            } else if (ctx.itemId) {
                const category = db.categories.find((item) => item.id === ctx.itemId);
                if (!category || category.parent_id) {
                    return false;
                }
                if (name === category.name) {
                    return true;
                }
                if (categoryNameExists(db, type, name, null, category.id)) {
                    global.alert('Категория с таким названием уже есть.');
                    return false;
                }
                category.name = name;
            }
        } else if (ctx.entity === 'category-sub' && ctx.categoryType && ctx.parentId) {
            const type = ctx.categoryType;
            const parentId = ctx.parentId;

            if (ctx.mode === 'add') {
                if (categoryNameExists(db, type, name, parentId)) {
                    global.alert('Подкатегория с таким названием уже есть.');
                    return false;
                }
                const id = global.venusStorage.createId();
                db.categories.push({
                    id,
                    type,
                    parent_id: parentId,
                    name,
                    sort_order: subcategories(db, type, parentId).length,
                    is_system: false,
                    is_hidden: false,
                });
                selectedSubId[type] = id;
            } else if (ctx.itemId) {
                const category = db.categories.find((item) => item.id === ctx.itemId);
                if (!category || !category.parent_id) {
                    return false;
                }
                if (name === category.name) {
                    return true;
                }
                if (categoryNameExists(db, type, name, category.parent_id, category.id)) {
                    global.alert('Подкатегория с таким названием уже есть.');
                    return false;
                }
                category.name = name;
            }
        } else if (ctx.entity === 'unit') {
            if (ctx.mode === 'add') {
                if (listNameExists(db, 'units', name)) {
                    global.alert('Единица с таким названием уже есть.');
                    return false;
                }
                const id = global.venusStorage.createId();
                db.units.push({
                    id,
                    name,
                    short_name: name,
                    sort_order: db.units.length,
                    is_system: false,
                });
                selectedListId.units = id;
            } else if (ctx.itemId) {
                const unit = db.units.find((item) => item.id === ctx.itemId);
                if (!unit) {
                    return false;
                }
                if (name === unit.name) {
                    return true;
                }
                if (listNameExists(db, 'units', name, unit.id)) {
                    global.alert('Единица с таким названием уже есть.');
                    return false;
                }
                unit.name = name;
                unit.short_name = name;
            }
        } else if (ctx.entity === 'creditor') {
            if (!saveNamedRef(db, 'creditors', 'creditors', ctx, name)) {
                return false;
            }
        } else if (ctx.entity === 'debtor') {
            if (!saveNamedRef(db, 'debtors', 'debtors', ctx, name)) {
                return false;
            }
        } else if (ctx.entity === 'deposit') {
            if (!saveNamedRef(db, 'deposit_names', 'deposits', ctx, name)) {
                return false;
            }
        }

        persist(db);
        editContext = null;
        return true;
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {string} dbKey
     * @param {string} tab
     * @param {VenusCatalogEditContext} ctx
     * @param {string} name
     * @returns {boolean}
     */
    function saveNamedRef(db, dbKey, tab, ctx, name) {
        const label =
            dbKey === 'creditors'
                ? 'Кредитор'
                : dbKey === 'debtors'
                  ? 'Должник'
                  : 'Название вклада';

        if (ctx.mode === 'add') {
            if (listNameExists(db, dbKey, name)) {
                global.alert(label + ' с таким названием уже есть.');
                return false;
            }
            const id = global.venusStorage.createId();
            db[dbKey].push({
                id,
                name,
                sort_order: db[dbKey].length,
            });
            selectedListId[tab] = id;
            return true;
        }

        if (!ctx.itemId) {
            return false;
        }

        const item = db[dbKey].find((row) => row.id === ctx.itemId);
        if (!item) {
            return false;
        }
        if (name === item.name) {
            return true;
        }
        if (listNameExists(db, dbKey, name, item.id)) {
            global.alert(label + ' с таким названием уже есть.');
            return false;
        }
        item.name = name;
        return true;
    }

    /**
     * @param {VenusCategoryType} type
     */
    function startAddRoot(type) {
        openEditModal({ mode: 'add', entity: 'category-root', categoryType: type });
    }

    /**
     * @param {VenusCategoryType} type
     */
    function startEditRoot(type) {
        const rootId = selectedRootId[type];
        const db = global.venusStorage.load();
        const category = db.categories.find((item) => item.id === rootId);
        if (!category || category.parent_id) {
            global.alert('Выберите категорию в списке слева.');
            return;
        }
        openEditModal(
            {
                mode: 'edit',
                entity: 'category-root',
                categoryType: type,
                itemId: category.id,
            },
            category.name,
        );
    }

    /**
     * @param {VenusCategoryType} type
     */
    function deleteRoot(type) {
        const db = global.venusStorage.load();
        const rootId = selectedRootId[type];
        const category = db.categories.find((item) => item.id === rootId);

        if (!category || category.parent_id) {
            global.alert('Выберите категорию в списке слева.');
            return;
        }

        if (category.is_system) {
            global.alert('Встроенную категорию удалить нельзя.');
            return;
        }

        if (rootTreeHasTransactions(db, rootId)) {
            global.alert('Категорию нельзя удалить: есть операции с этой категорией или подкатегориями.');
            return;
        }

        if (
            !global.confirm(
                'Удалить категорию «' + category.name + '» и все её подкатегории?',
            )
        ) {
            return;
        }

        const removeIds = new Set([rootId]);
        db.categories.forEach((item) => {
            if (item.parent_id === rootId) {
                removeIds.add(item.id);
            }
        });

        db.categories = db.categories.filter((item) => !removeIds.has(item.id));
        selectedRootId[type] = null;
        selectedSubId[type] = null;
        persist(db);
    }

    /**
     * @param {VenusCategoryType} type
     */
    function startAddSub(type) {
        const rootId = selectedRootId[type];
        if (!rootId) {
            global.alert('Сначала выберите категорию слева.');
            return;
        }
        openEditModal({
            mode: 'add',
            entity: 'category-sub',
            categoryType: type,
            parentId: rootId,
        });
    }

    /**
     * @param {VenusCategoryType} type
     */
    function startEditSub(type) {
        const db = global.venusStorage.load();
        const subId = selectedSubId[type];
        const category = db.categories.find((item) => item.id === subId);

        if (!category || !category.parent_id) {
            global.alert('Выберите подкатегорию в списке справа.');
            return;
        }

        openEditModal(
            {
                mode: 'edit',
                entity: 'category-sub',
                categoryType: type,
                itemId: category.id,
                parentId: category.parent_id,
            },
            category.name,
        );
    }

    /**
     * @param {VenusCategoryType} type
     */
    function deleteSub(type) {
        const db = global.venusStorage.load();
        const subId = selectedSubId[type];
        const category = db.categories.find((item) => item.id === subId);

        if (!category || !category.parent_id) {
            global.alert('Выберите подкатегорию в списке справа.');
            return;
        }

        if (category.is_system) {
            global.alert('Встроенную подкатегорию удалить нельзя.');
            return;
        }

        if (categoryHasTransactions(db, subId)) {
            global.alert('Подкатегорию нельзя удалить: есть операции с этой подкатегорией.');
            return;
        }

        if (!global.confirm('Удалить подкатегорию «' + category.name + '»?')) {
            return;
        }

        db.categories = db.categories.filter((item) => item.id !== subId);
        selectedSubId[type] = null;
        persist(db);
    }

    /**
     * @param {string} tab
     */
    function startAddList(tab) {
        const entity =
            tab === 'units'
                ? 'unit'
                : tab === 'creditors'
                  ? 'creditor'
                  : tab === 'debtors'
                    ? 'debtor'
                    : 'deposit';
        openEditModal({ mode: 'add', entity });
    }

    /**
     * @param {string} tab
     */
    function startEditList(tab) {
        const config = LIST_TABS[tab];
        const itemId = selectedListId[tab];
        const db = global.venusStorage.load();
        const items = listItems(db, tab);
        const item = items.find((row) => row.id === itemId);

        if (!item) {
            global.alert('Выберите запись в списке.');
            return;
        }

        const entity =
            tab === 'units'
                ? 'unit'
                : tab === 'creditors'
                  ? 'creditor'
                  : tab === 'debtors'
                    ? 'debtor'
                    : 'deposit';

        openEditModal({ mode: 'edit', entity, itemId: item.id }, item.name);
    }

    /**
     * @param {string} tab
     */
    function deleteList(tab) {
        const config = LIST_TABS[tab];
        const itemId = selectedListId[tab];
        const db = global.venusStorage.load();
        const items = listItems(db, tab);
        const item = items.find((row) => row.id === itemId);

        if (!item) {
            global.alert('Выберите запись в списке.');
            return;
        }

        if (tab === 'units' && item.is_system) {
            global.alert('Встроенную единицу измерения удалить нельзя.');
            return;
        }

        if (tab === 'units' && unitHasTransactions(db, itemId)) {
            global.alert('Единицу нельзя удалить: есть операции с этой единицей.');
            return;
        }

        if (!global.confirm('Удалить «' + item.name + '»?')) {
            return;
        }

        db[config.dbKey] = db[config.dbKey].filter((row) => row.id !== itemId);
        db[config.dbKey].forEach((row, index) => {
            row.sort_order = index;
        });
        selectedListId[tab] = null;
        persist(db);
    }

    /**
     * @param {VenusCategoryType} type
     * @param {string} action
     */
    function handleCategoryAction(type, action) {
        switch (action) {
            case 'add-root':
                startAddRoot(type);
                break;
            case 'edit-root':
                startEditRoot(type);
                break;
            case 'delete-root':
                deleteRoot(type);
                break;
            case 'add-sub':
                startAddSub(type);
                break;
            case 'edit-sub':
                startEditSub(type);
                break;
            case 'delete-sub':
                deleteSub(type);
                break;
            default:
                break;
        }
    }

    /**
     * @param {string} tab
     * @param {string} action
     */
    function handleListAction(tab, action) {
        switch (action) {
            case 'add':
                startAddList(tab);
                break;
            case 'edit':
                startEditList(tab);
                break;
            case 'delete':
                deleteList(tab);
                break;
            default:
                break;
        }
    }

    function refreshSelections(db) {
        ['expense', 'income'].forEach((type) => {
            const roots = rootCategories(db, type);
            if (!selectedRootId[type] || !roots.some((item) => item.id === selectedRootId[type])) {
                selectedRootId[type] = roots[0]?.id ?? null;
            }
        });

        Object.keys(LIST_TABS).forEach((tab) => {
            const items = listItems(db, tab);
            if (!selectedListId[tab] || !items.some((item) => item.id === selectedListId[tab])) {
                selectedListId[tab] = items[0]?.id ?? null;
            }
        });
    }

    function bindEvents() {
        $(document).on('click', '.js-venus-modal-categories', () => {
            const db = global.venusStorage.load();
            refreshSelections(db);
            setActiveTab(activeTab);
            render(db);
        });

        $(document).on('click', '.js-venus-catalog-edit-save', (event) => {
            event.preventDefault();
            if (saveEditModal()) {
                $.xiermodal('hide', 'venus-catalog-edit');
            }
        });

        $(document).on('keydown', '#venus-catalog-edit-name', (event) => {
            if (event.key !== 'Enter') {
                return;
            }
            event.preventDefault();
            if (saveEditModal()) {
                $.xiermodal('hide', 'venus-catalog-edit');
            }
        });

        document.addEventListener('click', (event) => {
            const tabBtn = event.target.closest('.js-venus-cat-tab');
            if (!tabBtn || !tabBtn.closest('#venus-modal-categories')) {
                return;
            }
            const tabType = tabBtn.getAttribute('data-venus-cat-tab');
            if (!tabType) {
                return;
            }
            setActiveTab(tabType);
        });

        document.addEventListener('click', (event) => {
            const row = event.target.closest('.js-venus-cat-root');
            if (!row || !row.closest('#venus-modal-categories')) {
                return;
            }
            const type = row.getAttribute('data-venus-cat-type');
            if (type !== 'expense' && type !== 'income') {
                return;
            }
            selectedRootId[type] = row.getAttribute('data-category-id');
            selectedSubId[type] = null;
            document
                .querySelectorAll('.js-venus-cat-root[data-venus-cat-type="' + type + '"]')
                .forEach((item) => {
                    item.classList.toggle('sun-protoRowSelected', item === row);
                });
            renderSubs(global.venusStorage.load(), type, selectedRootId[type]);
        });

        document.addEventListener('click', (event) => {
            const row = event.target.closest('.js-venus-cat-sub');
            if (!row || !row.closest('#venus-modal-categories')) {
                return;
            }
            const type = row.getAttribute('data-venus-cat-type');
            if (type !== 'expense' && type !== 'income') {
                return;
            }
            selectedSubId[type] = row.getAttribute('data-category-id');
            document
                .querySelectorAll('.js-venus-cat-sub[data-venus-cat-type="' + type + '"]')
                .forEach((item) => {
                    item.classList.toggle('sun-protoRowSelected', item === row);
                });
        });

        document.addEventListener('click', (event) => {
            const row = event.target.closest('.js-venus-cat-list-row');
            if (!row || !row.closest('#venus-modal-categories')) {
                return;
            }
            const tab = row.getAttribute('data-venus-cat-tab');
            if (!tab || !LIST_TABS[tab]) {
                return;
            }
            selectedListId[tab] = row.getAttribute('data-item-id');
            document
                .querySelectorAll('.js-venus-cat-list-row[data-venus-cat-tab="' + tab + '"]')
                .forEach((item) => {
                    item.classList.toggle('sun-protoRowSelected', item === row);
                });
        });

        document.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-venus-cat-action]');
            if (!btn || !btn.closest('#venus-modal-categories')) {
                return;
            }
            const tab =
                btn.getAttribute('data-venus-cat-tab') || btn.getAttribute('data-venus-cat-type');
            const action = btn.getAttribute('data-venus-cat-action');
            if (!tab || !action) {
                return;
            }
            event.preventDefault();

            if (tab === 'expense' || tab === 'income') {
                handleCategoryAction(tab, action);
            } else if (LIST_TABS[tab]) {
                handleListAction(tab, action);
            }
        });

        document.addEventListener('dblclick', (event) => {
            const rootRow = event.target.closest('.js-venus-cat-root');
            if (rootRow && rootRow.closest('#venus-modal-categories')) {
                const type = rootRow.getAttribute('data-venus-cat-type');
                if (type === 'expense' || type === 'income') {
                    selectedRootId[type] = rootRow.getAttribute('data-category-id');
                    startEditRoot(type);
                }
                return;
            }

            const subRow = event.target.closest('.js-venus-cat-sub');
            if (subRow && subRow.closest('#venus-modal-categories')) {
                const type = subRow.getAttribute('data-venus-cat-type');
                if (type === 'expense' || type === 'income') {
                    selectedSubId[type] = subRow.getAttribute('data-category-id');
                    startEditSub(type);
                }
                return;
            }

            const listRow = event.target.closest('.js-venus-cat-list-row');
            if (listRow && listRow.closest('#venus-modal-categories')) {
                const tab = listRow.getAttribute('data-venus-cat-tab');
                if (tab && LIST_TABS[tab]) {
                    selectedListId[tab] = listRow.getAttribute('data-item-id');
                    startEditList(tab);
                }
            }
        });
    }

    function init() {
        bindEvents();
    }

    global.venusCategories = {
        init,
        render,
    };
})(window);
