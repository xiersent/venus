/**
 * @file decimal-input.js
 * Venus — поля сумм/количества: только цифры и одна запятая;
 * точка и пробел при вводе заменяются на запятую.
 */
(function () {
    'use strict';

    /**
     * @param {string} value
     * @returns {boolean}
     */
    function isNormalizedDecimalValue(value) {
        if (!/^[\d,]*$/.test(value)) {
            return false;
        }
        const commas = value.match(/,/g);
        return !commas || commas.length <= 1;
    }

    /**
     * @param {HTMLInputElement} input
     */
    function normalizeDecimalInput(input) {
        const selectionStart = input.selectionStart ?? 0;
        const selectionEnd = input.selectionEnd ?? 0;
        const prepared = input.value.replace(/[.\s\u00A0]/g, ',');

        if (isNormalizedDecimalValue(prepared) && prepared === input.value) {
            return;
        }

        let filtered = '';
        let commaSeen = false;
        let newStart = 0;
        let newEnd = 0;

        for (let index = 0; index < prepared.length; index += 1) {
            const char = prepared[index];
            let keep = false;

            if (char >= '0' && char <= '9') {
                keep = true;
                filtered += char;
            } else if (char === ',' && !commaSeen) {
                commaSeen = true;
                keep = true;
                filtered += char;
            }

            if (keep) {
                if (index < selectionStart) {
                    newStart += 1;
                }
                if (index < selectionEnd) {
                    newEnd += 1;
                }
            }
        }

        if (filtered === input.value && newStart === selectionStart && newEnd === selectionEnd) {
            return;
        }

        input.value = filtered;
        input.setSelectionRange(newStart, newEnd);
    }

    /**
     * @param {Event} event
     */
    function onInput(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
            return;
        }
        if (target.inputMode !== 'decimal') {
            return;
        }
        normalizeDecimalInput(target);
    }

    function init() {
        document.addEventListener('input', onInput);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
