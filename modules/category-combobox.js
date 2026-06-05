/**
 * @file category-combobox.js
 * Venus — селект категории + поле поиска/ввода своего значения.
 */
(function (global) {
    'use strict';

    /** @typedef {import('./storage').VenusCategoryType} VenusCategoryType */

    const CREATE_NEW_VALUE = '__venus_new__';

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {VenusCategoryType} type
     * @param {string|null} parentId
     * @returns {import('./storage').VenusCategory[]}
     */
    function siblings(db, type, parentId) {
        return db.categories.filter(
            (category) =>
                category.type === type && (category.parent_id || null) === (parentId || null),
        );
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {VenusCategoryType} type
     * @param {string} name
     * @param {string|null} parentId
     * @returns {import('./storage').VenusCategory|null}
     */
    function findCategoryByName(db, type, name, parentId) {
        const normalized = name.trim().toLowerCase();
        if (!normalized) {
            return null;
        }
        return (
            db.categories.find(
                (category) =>
                    category.type === type &&
                    (category.parent_id || null) === (parentId || null) &&
                    category.name.trim().toLowerCase() === normalized,
            ) || null
        );
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {VenusCategoryType} type
     * @param {string} name
     * @param {string|null} parentId
     * @returns {{ category: import('./storage').VenusCategory, created: boolean }}
     */
    function findOrCreateCategory(db, type, name, parentId) {
        const trimmed = name.trim();
        if (!trimmed) {
            throw new Error('empty category name');
        }

        const existing = findCategoryByName(db, type, trimmed, parentId);
        if (existing) {
            return { category: existing, created: false };
        }

        const id = global.venusStorage.createId();
        const category = {
            id,
            type,
            parent_id: parentId || null,
            name: trimmed,
            sort_order: siblings(db, type, parentId).length,
            is_system: false,
            is_hidden: false,
        };
        db.categories.push(category);
        return { category, created: true };
    }

    /**
     * @returns {string}
     */
    function createNewOptionMarkup() {
        return '<option value="' + CREATE_NEW_VALUE + '">&lt;Создать новую&gt;</option>';
    }

    /**
     * @param {string|null|undefined} value
     * @returns {boolean}
     */
    function isCreateNewValue(value) {
        return value === CREATE_NEW_VALUE;
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {HTMLInputElement} input
     * @param {{ onSelectChange?: () => void }} [options]
     */
    function bind(select, input, options) {
        /** @type {{ value: string, label: string }[]} */
        let allOptions = [];

        function isRealOption(option) {
            return Boolean(option.value) && option.value !== CREATE_NEW_VALUE;
        }

        function readOptionsFromSelect() {
            allOptions = Array.from(select.options).map((option) => ({
                value: option.value,
                label: option.textContent || '',
            }));
        }

        function findExactMatchingOption(query) {
            return (
                allOptions.find(
                    (option) =>
                        isRealOption(option) &&
                        option.label.trim().toLowerCase() === query,
                ) || null
            );
        }

        function firstRealOption() {
            return allOptions.find(isRealOption) || null;
        }

        function selectCreateNew() {
            if (select.value === CREATE_NEW_VALUE) {
                return;
            }
            if (!allOptions.some((option) => option.value === CREATE_NEW_VALUE)) {
                return;
            }
            select.value = CREATE_NEW_VALUE;
            options?.onSelectChange?.();
        }

        /** Перевыбирает пункт в селекте, не сужая список опций. */
        function applySearchSelect() {
            const query = input.value.trim();
            if (!query) {
                if (isCreateNewValue(select.value)) {
                    const first = firstRealOption();
                    if (first) {
                        select.value = first.value;
                        options?.onSelectChange?.();
                    }
                }
                return;
            }

            const exact = findExactMatchingOption(query.toLowerCase());
            if (exact) {
                if (select.value !== exact.value) {
                    select.value = exact.value;
                    options?.onSelectChange?.();
                }
                return;
            }

            selectCreateNew();
        }

        function syncInputFromSelect() {
            const option = select.selectedOptions[0];
            if (!option || !option.value) {
                input.value = '';
                return;
            }
            if (isCreateNewValue(option.value)) {
                return;
            }
            input.value = option.textContent || '';
        }

        input.addEventListener('input', applySearchSelect);
        select.addEventListener('change', () => {
            syncInputFromSelect();
            options?.onSelectChange?.();
        });

        readOptionsFromSelect();

        return {
            refreshOptions() {
                const selectedValue = select.value;
                readOptionsFromSelect();
                if (selectedValue && allOptions.some((option) => option.value === selectedValue)) {
                    select.value = selectedValue;
                }
                if (input.value.trim()) {
                    applySearchSelect();
                }
            },
            syncFromSelect() {
                syncInputFromSelect();
            },
            clearSearch() {
                input.value = '';
                const first = firstRealOption();
                if (first && isCreateNewValue(select.value)) {
                    select.value = first.value;
                    options?.onSelectChange?.();
                }
            },
            getSearchText() {
                return input.value.trim();
            },
        };
    }

    /**
     * @param {import('./storage').VenusDatabase} db
     * @param {VenusCategoryType} type
     * @param {{
     *   categorySelect: HTMLSelectElement|null|undefined;
     *   categoryInput: HTMLInputElement|null|undefined;
     *   subcategorySelect: HTMLSelectElement|null|undefined;
     *   subcategoryInput: HTMLInputElement|null|undefined;
     *   emptyCategoryMessage: string;
     * }} fields
     * @returns {{
     *   ok: boolean;
     *   message?: string;
     *   categoryId?: string;
     *   rootId?: string;
     *   dbChanged?: boolean;
     * }}
     */
    function resolveFromForm(db, type, fields) {
        const searchRoot = fields.categoryInput?.value.trim() || '';
        const searchSub = fields.subcategoryInput?.value.trim() || '';

        let rootId = '';
        let dbChanged = false;

        if (searchRoot) {
            try {
                const result = findOrCreateCategory(db, type, searchRoot, null);
                rootId = result.category.id;
                dbChanged = dbChanged || result.created;
            } catch (err) {
                return { ok: false, message: fields.emptyCategoryMessage };
            }
        } else if (isCreateNewValue(fields.categorySelect?.value || '')) {
            return { ok: false, message: 'Введите название новой категории.' };
        } else {
            rootId = fields.categorySelect?.value || '';
            if (!rootId) {
                return { ok: false, message: fields.emptyCategoryMessage };
            }
        }

        if (searchSub) {
            try {
                const result = findOrCreateCategory(db, type, searchSub, rootId);
                return {
                    ok: true,
                    categoryId: result.category.id,
                    rootId,
                    dbChanged: dbChanged || result.created,
                };
            } catch (err) {
                return { ok: false, message: fields.emptyCategoryMessage };
            }
        }

        const subId = fields.subcategorySelect?.value || '';
        if (isCreateNewValue(subId)) {
            return { ok: false, message: 'Введите название новой подкатегории.' };
        }

        return {
            ok: true,
            categoryId: subId || rootId,
            rootId,
            dbChanged,
        };
    }

    global.venusCategoryCombobox = {
        CREATE_NEW_VALUE,
        createNewOptionMarkup,
        isCreateNewValue,
        bind,
        resolveFromForm,
        findOrCreateCategory,
        findCategoryByName,
    };
})(window);
