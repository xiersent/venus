/**
 * @file datetime.js
 * Venus — дата и время операций (отображение, ввод, сортировка).
 */
(function (global) {
    'use strict';

    /**
     * @param {string} iso YYYY-MM-DD
     * @returns {string}
     */
    function formatDateDisplay(iso) {
        const parts = (iso || '').split('-');
        if (parts.length !== 3) {
            return iso || '';
        }
        return parts[2] + '.' + parts[1] + '.' + parts[0];
    }

    /**
     * @param {string} dateIso YYYY-MM-DD
     * @param {string|null|undefined} timeHm HH:MM
     * @returns {string}
     */
    function formatDateTimeDisplay(dateIso, timeHm) {
        const datePart = formatDateDisplay(dateIso);
        if (timeHm && /^\d{2}:\d{2}$/.test(timeHm)) {
            return datePart + ' ' + timeHm;
        }
        return datePart;
    }

    /**
     * @param {HTMLInputElement|null|undefined} input
     * @returns {string} HH:MM or empty
     */
    function readTimeInput(input) {
        const value = (input?.value || '').trim();
        if (!value) {
            return '';
        }
        if (/^\d{2}:\d{2}$/.test(value)) {
            return value;
        }
        return '';
    }

    /**
     * @param {import('./storage').VenusTransaction} transaction
     * @param {string} time HH:MM or empty
     */
    function applyTransactionTime(transaction, time) {
        if (time) {
            transaction.time = time;
        } else {
            delete transaction.time;
        }
    }

    /**
     * @param {import('./storage').VenusTransaction} a
     * @param {import('./storage').VenusTransaction} b
     * @returns {number}
     */
    function compareTransactionsByDateTime(a, b) {
        if (a.date !== b.date) {
            return a.date < b.date ? 1 : -1;
        }

        const timeA = a.time || '';
        const timeB = b.time || '';
        if (timeA && timeB && timeA !== timeB) {
            return timeA < timeB ? 1 : -1;
        }
        if (timeA && !timeB) {
            return -1;
        }
        if (!timeA && timeB) {
            return 1;
        }

        return a.created_at < b.created_at ? 1 : -1;
    }

    /**
     * @param {HTMLInputElement|null|undefined} dateInput
     * @param {HTMLInputElement|null|undefined} timeInput
     * @param {string} dateIso
     * @param {string|null|undefined} timeHm
     */
    function setDateTimeFields(dateInput, timeInput, dateIso, timeHm) {
        if (dateInput) {
            dateInput.value = dateIso || '';
        }
        if (timeInput) {
            timeInput.value = timeHm && /^\d{2}:\d{2}$/.test(timeHm) ? timeHm : '';
        }
    }

    global.venusDatetime = {
        formatDateDisplay,
        formatDateTimeDisplay,
        readTimeInput,
        applyTransactionTime,
        compareTransactionsByDateTime,
        setDateTimeFields,
    };
})(window);
