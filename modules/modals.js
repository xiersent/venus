/**
 * @file modals.js
 * Модальные окна Venus через xiermodal (xiermodalproject).
 */
(function ($) {
    'use strict';

    const base = {
        contentBackgroundColor: '#ffffff',
        contentAligment: 'center',
        contentShowAnimationName: 'fadeIn',
        contentHideAnimationName: 'fadeOut',
    };

    const sidePanel = {
        contentAligment: 'right',
        contentShowAnimationName: 'rightSlide',
        contentHideAnimationName: 'rightSlide',
    };

    const definitions = [
        { name: 'venus-expense', content: '#venus-modal-expense' },
        { name: 'venus-income', content: '#venus-modal-income' },
        { name: 'venus-account', content: '#venus-modal-account' },
        { name: 'venus-transfer', content: '#venus-modal-transfer' },
        { name: 'venus-categories', content: '#venus-modal-categories' },
        { name: 'venus-catalog-edit', content: '#venus-modal-catalog-edit' },
        { name: 'venus-settings', content: '#venus-modal-settings', ...sidePanel },
    ];

    const triggers = [
        { modal: 'venus-categories', selector: '.js-venus-modal-categories' },
        { modal: 'venus-settings', selector: '.js-venus-modal-settings' },
    ];

    $(function () {
        definitions.forEach((def) => {
            $.xiermodal(
                'content',
                def.content,
                $.extend({}, base, { name: def.name, content: def.content }),
            );
        });

        triggers.forEach(({ modal, selector }) => {
            $(document).on('click', selector, (event) => {
                event.preventDefault();
                $.xiermodal('show', modal);
            });
        });
    });
})(jQuery);
