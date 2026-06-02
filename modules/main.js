/**
 * @file main.js
 * Venus — переключение вкладок и старт приложения.
 */
document.addEventListener('DOMContentLoaded', () => {
    if (window.venusWarning) {
        window.venusWarning.init();
    }

    const TAB_STORAGE_KEY = 'venus-active-tab';
    const VALID_TABS = ['accounts', 'expenses', 'incomes'];

    const tabButtons = document.querySelectorAll('.sun-tabButton[data-tab]');
    const tabPanels = document.querySelectorAll('.sun-tabContent[data-tab-panel]');

    /**
     * @param {string} tabId
     */
    function activateTab(tabId) {
        document.documentElement.setAttribute('data-venus-tab', tabId);
        tabButtons.forEach((button) => {
            button.classList.toggle('sun-active', button.dataset.tab === tabId);
        });
        tabPanels.forEach((panel) => {
            panel.classList.toggle('sun-active', panel.dataset.tabPanel === tabId);
        });
    }

    /**
     * @param {string} tabId
     */
    function saveActiveTab(tabId) {
        try {
            localStorage.setItem(TAB_STORAGE_KEY, tabId);
        } catch (err) {
            console.warn('venus.main.saveActiveTab:', err);
        }
    }

    /**
     * @returns {string|null}
     */
    function loadActiveTab() {
        try {
            const stored = localStorage.getItem(TAB_STORAGE_KEY);
            if (stored && VALID_TABS.includes(stored)) {
                return stored;
            }
        } catch (err) {
            console.warn('venus.main.loadActiveTab:', err);
        }
        return null;
    }

    const initialTab =
        document.documentElement.getAttribute('data-venus-tab') || loadActiveTab() || 'expenses';
    activateTab(initialTab);

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            if (!tabId || !VALID_TABS.includes(tabId)) {
                return;
            }

            activateTab(tabId);
            saveActiveTab(tabId);
        });
    });

    if (window.venusAccounts) {
        window.venusAccounts.init();
    }
    if (window.venusExpenses) {
        window.venusExpenses.init();
    }
    if (window.venusIncomes) {
        window.venusIncomes.init();
    }
    if (window.venusTransfers) {
        window.venusTransfers.init();
    }
    if (window.venusCategories) {
        window.venusCategories.init();
    }
    if (window.venusSettings) {
        window.venusSettings.init();
    }
});
