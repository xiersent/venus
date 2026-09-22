/**
 * @file grid.js
 * Venus — разметка CSS Grid (строки и ячейки вместо table/tr/td).
 */
(function (global) {
    'use strict';

    /**
     * @param {string} html
     * @param {string} [className]
     * @returns {string}
     */
    function cell(html, className) {
        return (
            '<div class="venus-gridCell' + (className ? ' ' + className : '') + '">' + html + '</div>'
        );
    }

    /**
     * @param {string} html
     * @param {string} [className]
     * @returns {string}
     */
    function numCell(html, className) {
        const extra = className ? ' ' + className : '';
        return '<div class="venus-gridCell venus-gridCell--num' + extra + '">' + html + '</div>';
    }

    /**
     * @param {string} cellsHtml
     * @param {string} [rowClass]
     * @param {string} [attrs]
     * @returns {string}
     */
    function row(cellsHtml, rowClass, attrs) {
        return (
            '<div class="venus-gridRow' +
            (rowClass || '') +
            '"' +
            (attrs ? ' ' + attrs : '') +
            '>' +
            cellsHtml +
            '</div>'
        );
    }

    /**
     * @param {string} message
     * @returns {string}
     */
    function emptyRow(message) {
        return (
            '<div class="venus-gridRow venus-gridRow--empty">' +
            '<div class="venus-gridCell venus-gridCell--full sun-summaryEmpty">' +
            message +
            '</div></div>'
        );
    }

    global.venusGrid = {
        cell,
        numCell,
        row,
        emptyRow,
    };
})(window);
