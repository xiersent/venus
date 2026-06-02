/**
 * @file warning.js
 * Venus — стартовое предупреждение (как в sun).
 */
(function (global) {
    'use strict';

    const OVERLAY_SELECTOR = '[data-venus-warning-overlay]';
    const BOX_SELECTOR = '[data-venus-warning-box]';

    /**
     * @returns {{ overlay: HTMLElement; box: HTMLElement }|null}
     */
    function getWarningElements() {
        const overlay = document.querySelector(OVERLAY_SELECTOR);
        const box = document.querySelector(BOX_SELECTOR);
        if (!(overlay instanceof HTMLElement) || !(box instanceof HTMLElement)) {
            return null;
        }
        return { overlay, box };
    }

    function showWarning() {
        const elements = getWarningElements();
        if (!elements) {
            return;
        }

        elements.overlay.classList.remove('sun-hidden');
        elements.box.classList.remove('sun-hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeWarning() {
        const elements = getWarningElements();
        if (!elements) {
            return;
        }

        elements.overlay.classList.add('sun-hidden');
        elements.box.classList.add('sun-hidden');
        document.body.style.overflow = '';
    }

    function bindEvents() {
        document.querySelectorAll('.js-venus-warning-continue').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                closeWarning();
            });
        });
    }

    function init() {
        bindEvents();
        showWarning();
    }

    global.venusWarning = {
        init,
        show: showWarning,
        close: closeWarning,
    };
})(window);
