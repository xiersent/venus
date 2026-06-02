/*

// Параметры вызова
-------------------

name: false, // Имя модального окна, можно обращаться по нему, например показывать
button: false, // Селектор кнопки, которая будет вызывать показ
content: false,	// Селектор контента, который будет помещен в модальное окно (селектор, jq объект, ajax объект)
ajaxContentFormat: function(){}, // Функция, которая обработает аякс ответ, чтобы достать из него необходимый контент для показа
autoOpen: false, // Окно появится автоматически после вызова
autoShow: false, // Окно появится автоматически после вызова
hideOnEscape: true, // Закрывать ли окно по кнопке Esc
hideOnEnter: true,	// Закрывать ли окно по кнопке Enter //todo
destroyOnHide: false, // Уничтожать окно после его скрытия
hideOnBackgroundClick: true, // Закрывать окно по клику на фон
displayHideButton: true, // Отображать крестик закрытия
itemHolderTemplate:	'', // Шаблон разметки для окна
onBeforeHolderOpen: function(){}, // Перед тем, как откроется главный держатель всех окон
onAfterHolderOpen: function(){}, // После того, как откроется главный держатель всех окон
onBeforeHolderClose: function(){}, // Перед тем, как закроется главный держательно всех окон
onAfterHolderClose: function(){}, // После того, как закроется главный держатель всех окон
onBeforeShow: function(){}, // Перед тем, как покажется окно(перед анимацией, контент в окне уже присутствует, можно сбросить через return false;)
onAfterShow: function(){}, // После того, как покажется окно(после анимации)
onBeforeHide: function(){}, // Перед тем, как закроется окно(до анимации, можно сбросить через return false;)
onAfterHide: function(){}, // После того, как закроется окно(после анимации)
onBeforeDestroy: function(){}, // Перед тем, как уничтожится окно
onAfterDestroy: function(){}, // После того, как уничтожится окно
onStateChange: function(){} // Показалось/Скрылось окно (срабатывает независимо от анимаций)

// Объявление окна через контент общую функцию
-------------------
$.xiermodal('content', '.content', {
	button: '.button'
});

// Объявление окна через контент и указание кнопки
-------------------
$('.content').xiermodal({
	button: '.button'
});

// Объявление окна через кнопку и указание контента
-------------------
$.xiermodal('button', '.button', {
	content: '.content'
});

// Показать окно по имени, имя это параметр name при инициализации
-------------------
$.xiermodal('show', name);

// Показать окно по имени, имя это параметр name при инициализации
-------------------
$.xiermodal('hide', name);

// Скрыть все окна
-------------------
$.xiermodal('hideAll');

// Показать все окна мгновенно
-------------------
$.xiermodal('showAllForce');

// Скрыть все окна мгновенно
-------------------
$.xiermodal('hideAllForce');

// Получить текущее открытое окно на переднем плане
-------------------
$.xiermodal('getCurrentItem');

// Получить все инициализированные окна
-------------------
$.xiermodal();

// Получить текущюю инициализацию плагина в колбеке
-------------------
$.xiermodal('content', '.content', {
	button: '.button',
	onAfterShow: function(){
		this - это текущий плагин
		в нем лежат и опции и переменные

		this.$element - это контент модалки
	}
});


*/

;(function($, window, document, undefined){
	
	'use strict';
 
	// Имя плагина
	var pluginName = 'xiermodal';

	// Стандартные настройки плагина
	var defaults = {
		name: false,
		button: false,
		content: false,
		ajaxContentFormat: function(data){
			return data.html;
		},
		autoOpen: false, // Для обратной совместимости!
		autoShow: false,
		hideOnEscape: true,
		hideOnEnter: true,
		destroyOnHide: false,
		hideOnBackgroundClick: true,
		displayHideButton: true,
		backgroundClass: '',
		contentBackgroundColor: 'transparent', // #fff, rgb()
		contentAligment: 'center', // .xierModal__aligner--aligned-CENTER
		contentShowAnimationName: 'fadeIn', // .xierModal__contentAnimation--FADEIN-1
		contentHideAnimationName: 'fadeOut', // .xierModal__contentAnimation--FADEOUT-0
		backgroundShowAnimationName: 'fadeIn', // .xierModal__backgroundAnimation--FADEIN-1
		backgroundHideAnimationName: 'fadeOut', // .xierModal__backgroundAnimation--FADEOUT-0
		animationForceName: 'xierModal--animationForce',
		animationFillmodeFix: 'xierModal--animationFillmodeFix',
		modalClasses: '',
		onBeforeHolderOpen: function(){},
		onAfterHolderOpen: function(){},
		onBeforeHolderClose: function(){},
		onAfterHolderClose: function(){},
		onBeforeShow: function(){},
		onAfterShow: function(){},
		onBeforeHide: function(){},
		onAfterHide: function(){},
		onBeforeDestroy: function(){},
		onAfterDestroy: function(){},
		onStateChange: function(){},
		itemHolderTemplate:	'<div class="xierModal__item">'+
								'<div class="xierModal__background"></div>'+
								'<div class="xierModal__scroller">'+
									'<div class="xierModal__aligner">'+
										'<div class="xierModal__content">'+
											'<div class="xierModal__contentInner"></div>'+
										'</div>'+
									'</div>'+
								'</div>'+
							'</div>'
	};

	// Состояния
	var states = {
		hidden: 'hidden',
		showed: 'showed'
	};
	
	// Глобальные переменные
	var globals = {
		scrollbarWidth: false,
		supportsScrollerGutterStable: false,
		transitionEventName: false,
		animationStartEventName: false,
		animationEndEventName: false,
		isScreenLocked: false,
		screenOffsetApplied: false,
		scrollLockScrollY: 0,
		scrollLockGutter: 0,
		scrollLockSaved: false,
		scrollerObservers: {},
		$mainHolder: false,
		mainHolderClosed: false,
		incrementId: false,
		currentItem: false,
		currentIncrementId: false,
		escapeAttached: false,
		hashchangeAttached: false,
		showCounter: 0,
		items: {}
	}

	// Конструктор плагина
	function plugin(element, options){
		
		this.incrementId = false;
		this.showNumber = false;
		this.currentButton = false;
		this.$currentButton = false;
		this.element = element;
		this.$element = $(element);
		this.$itemHolder = false;
		this.state = states.hidden;
		this.options = $.extend({}, defaults, options);
		this.dataOptions = this.$element.data(pluginName);
		
		if(typeof this.dataOptions === 'string'){
			this.dataOptions = this.dataOptions.replace(/\'/g, '"');
			this.dataOptions = this._tryParseJson(this.dataOptions);
			if(typeof this.dataOptions === 'object'){
				var actual_this = this;
				$.each(this.options, function(key){
					if(actual_this.dataOptions[key]){
						var obj = new Object();
						obj[key] = actual_this.dataOptions[key];
						actual_this.options = $.extend({}, actual_this.options, obj);
					}
				});
			}
		}
			
		this._contentShowAnimationName = 'xierModal__contentAnimation--'+this.options.contentShowAnimationName+'-1'; // .xierModal__contentAnimation--FADEIN-1
		this._contentHideAnimationName = 'xierModal__contentAnimation--'+this.options.contentHideAnimationName+'-0'; // .xierModal__contentAnimation--FADEOUT-0
		this._backgroundShowAnimationName = 'xierModal__backgroundAnimation--'+this.options.backgroundShowAnimationName+'-1'; // .xierModal__backgroundAnimation--FADEIN-1
		this._backgroundHideAnimationName = 'xierModal__backgroundAnimation--'+this.options.backgroundHideAnimationName+'-0'; // .xierModal__backgroundAnimation--FADEOUT-0
		
		this._init();
	}

	// Добавляем методы
	$.extend(plugin.prototype, {
		_example: function(){
			//this.element = DOM element
			//this.$element = jquery element
			//this.options = options
			//this.yourOtherFunction();
		},
		_private: function(){
			// Private function
		},
		public: function(){
			// Public function
		},
		_init: function(){

			var actual_this = this;

			if(!globals.$mainHolder){
				globals.$mainHolder = true;
				globals.$mainHolder = this._createMainHolder();
				if(!this._isMainHolderClosed()){
					this._closeMainHolder();
				}
			}
			if(!this.incrementId){
				if(globals.incrementId === false){
					globals.incrementId = 0;
				}else{
					globals.incrementId++;
				}
				this.incrementId = globals.incrementId;
				globals.items[this.incrementId] = this;
			}
			if(!globals.scrollbarWidth){
				globals.scrollbarWidth = this._getScrollbarWidth();
			}
			if(globals.supportsScrollerGutterStable === false){
				globals.supportsScrollerGutterStable = !!(window.CSS && window.CSS.supports && window.CSS.supports('scrollbar-gutter', 'stable'));
			}
			if(!globals.transitionEventName){
				globals.transitionEventName = this._getTransitionEventName();
			}
			if(!globals.animationStartEventName){
				globals.animationStartEventName = this._getAnimationStartEventName();
			}
			if(!globals.animationEndEventName){
				globals.animationEndEventName = this._getAnimationEndEventName();
			}
			if(!globals.escapeAttached){
				globals.escapeAttached = true;
				$(document).on('keyup', function(e){
					if(e.keyCode === 27 && globals.currentItem){
						if(actual_this.options.hideOnEscape===true)
						{
							globals.currentItem._hide();
						}					
					}
				});
			}
			if(!this.$itemHolder){
				this.$itemHolder = this._createItemHolder();
				this.$itemHolder.on('click', '.js-xierModalClose', function(){
					actual_this._hide();
				});
				this.$itemHolder.on('click', function(e){
					if(actual_this.options.hideOnBackgroundClick===true)
					{
						if(!actual_this.$itemHolder.find('.xierModal__content').is(e.target) && !actual_this.$itemHolder.find('.xierModal__content').has(e.target).length){
							actual_this._hide();
						}
					}
				});
				if(this.options.autoOpen || this.options.autoShow){
					this._show();
				}
			}
			if(this.options.button){
				$(document).on('click', this.options.button, function(){
					actual_this.currentButton = this;
					actual_this.$currentButton = $(this);
					actual_this._show();
				});
			}
			/*if(!globals.hashchangeAttached){
				//$(window).on('hashchange', function(){
					var hash = window.location.hash.slice(1);

					var params = {}
					hash.split('&').map( hk => { 
						var temp = hk.split('='); 
						params[temp[0]] = temp[1]; 
					});
					
					$.each(params, function(key, val){
						if(key == 'xiermodal'){
							$.each(globals.items, function(){
								if(this.options.name == val){
									this.show();
								}
							});
						}
					});

				//}).trigger('hashchange');
				
				globals.hashchangeAttached = true;
			}*/
                        var hash = window.location.hash.slice(1);
                        if(hash != '' &&  hash == actual_this.options.name){
                            actual_this._show();
                            history.pushState('',document.title,window.location.pathname + window.location.search);
                        }
		},
		_createMainHolder: function(){
			var $body = $(document.body);
			var $mainHolderTemplate = $('<div class="xierModal"></div>');
			$mainHolderTemplate.appendTo($body);

			return $mainHolderTemplate;
		},
		_createItemHolder: function(){
			var $itemHolderTemplate = $(this.options.itemHolderTemplate);
			$itemHolderTemplate.addClass(this.options.modalClasses);
			$itemHolderTemplate.appendTo(globals.$mainHolder);

			var actual_this = this;
			var content_type = typeof this.options.content;

			// Установить скрытое состояние для фона, зафорсить его
			$itemHolderTemplate.find('.xierModal__background').addClass(this.options.backgroundClass);

			// Установить скрытое состояние для фона, зафорсить его
			$itemHolderTemplate.find('.xierModal__background').addClass(this.options.animationForceName).addClass(this._backgroundHideAnimationName);
			
			// Установить скрытое состояние для контента, зафорсить его
			$itemHolderTemplate.find('.xierModal__content').addClass(this.options.animationForceName).addClass(this._contentHideAnimationName);

			// Добавить кнопку закрыть форму если такая нужна
			if(this.options.displayHideButton===true) {
				$itemHolderTemplate.find('.xierModal__content').append('<div class="xierModal__hide js-xierModalClose" role="button" aria-label="Закрыть"><span class="xierModal__hideIcon" aria-hidden="true"></span></div>');
			}

			// Заалигнить контент
			$itemHolderTemplate.find('.xierModal__aligner').addClass('xierModal__aligner--aligned-'+actual_this.options.contentAligment);
			
			// Задать фон подложке
			$itemHolderTemplate.find('.xierModal__contentInner').css('background-color', actual_this.options.contentBackgroundColor);
			
			// Положить контент в холдер
			actual_this.$element.appendTo($itemHolderTemplate.find('.xierModal__contentInner'));
			
			if(this.options.content instanceof jQuery){
				this.options.content.appendTo(actual_this.$element);
			}else if(content_type == 'object'){
				if(actual_this.options.content.ajax){
					$.ajax(this.options.content.ajax).done(function(data){
						var html;
						if($.isFunction(actual_this.options.ajaxContentFormat)){
							html = actual_this.options.ajaxContentFormat(data);
						}
						actual_this.$element.html(html);
						// $(html).appendTo(actual_this.$element);
					});
				}
			}else if(content_type == 'function'){

			}else if(content_type == 'string'){
				if($(document.body).find(this.options.content).length){
					$(this.options.content).appendTo(actual_this.$element);
				}else{

				}
			}

			return $itemHolderTemplate;
		},
		_getScrollbarWidth: function(){
			var outer = document.createElement('div');
			var inner = document.createElement('div');
			var widthNoScroll;
			var widthWithScroll;
			outer.style.visibility = 'hidden';
			outer.style.width = '100px';
			document.body.appendChild(outer);
			widthNoScroll = outer.offsetWidth;
			outer.style.overflow = 'scroll';
			inner.style.width = '100%';
			outer.appendChild(inner);
			widthWithScroll = inner.offsetWidth;
			outer.parentNode.removeChild(outer);
			return widthNoScroll - widthWithScroll;
		},
		_getViewportWidth: function(){
			var width;
			if(window.innerWidth){
				width = window.innerWidth;
			}else if(document.documentElement && document.documentElement.clientWidth){
				width = document.documentElement.clientWidth;
			}else{
				console.warn('Can not detect viewport width.');
			}
			return width;
		},
		_hasVerticalScrollbar: function(){
			var doc = document.documentElement;
			return doc.scrollHeight > doc.clientHeight;
		},
		_cssPx: function($el, prop){
			var value = parseInt($el.css(prop), 10);
			return isNaN(value) ? 0 : value;
		},
		_getScrollLockGutter: function(){
			var html = document.documentElement;
			var computedGutter = window.getComputedStyle(html).scrollbarGutter || 'auto';

			if(!globals.scrollbarWidth){
				globals.scrollbarWidth = this._getScrollbarWidth();
			}

			var liveGutter = window.innerWidth - html.clientWidth;

			if(liveGutter < 0){
				liveGutter = 0;
			}

			var scrollY = window.pageYOffset || html.scrollTop || 0;
			var pageScrollable = this._hasVerticalScrollbar() || scrollY > 0;

			// scrollbar-gutter: stable на html — полоса уже в вёрстке; при lock снимаем stable и компенсируем padding
			if(computedGutter.indexOf('stable') !== -1){
				if(!pageScrollable && liveGutter === 0){
					return 0;
				}

				return Math.max(liveGutter, globals.scrollbarWidth || 0);
			}

			if(!pageScrollable && liveGutter === 0){
				return 0;
			}

			return Math.max(liveGutter, globals.scrollbarWidth || 0);
		},
		_scrollerHasOverflow: function(scrollerEl){
			if(!scrollerEl){
				return false;
			}

			return scrollerEl.scrollHeight > scrollerEl.clientHeight + 1;
		},
		_syncItemScrollerLayout: function(){
			if(!this.$itemHolder){
				return;
			}

			var $scroller = this.$itemHolder.find('.xierModal__scroller');
			var scrollerEl = $scroller[0];

			if(!scrollerEl){
				return;
			}

			if(globals.supportsScrollerGutterStable){
				$scroller.removeClass('xierModal__scroller--overflowFallback');
				return;
			}

			if(!globals.scrollbarWidth){
				globals.scrollbarWidth = this._getScrollbarWidth();
			}

			var hasOverflow = this._scrollerHasOverflow(scrollerEl);

			$scroller.toggleClass('xierModal__scroller--overflowFallback', hasOverflow);
		},
		_setupScrollerWatch: function(){
			var actual_this = this;

			this._teardownScrollerWatch();

			if(typeof window.ResizeObserver === 'undefined' || !this.$element || !this.$element.length){
				this._syncItemScrollerLayout();
				return;
			}

			var $scroller = this.$itemHolder.find('.xierModal__scroller');
			var scrollerEl = $scroller[0];

			if(!scrollerEl){
				return;
			}

			var observer = new ResizeObserver(function(){
				actual_this._syncItemScrollerLayout();
			});

			observer.observe(this.$element[0]);
			observer.observe(scrollerEl);
			globals.scrollerObservers[this.incrementId] = observer;
			this._syncItemScrollerLayout();
		},
		_teardownScrollerWatch: function(){
			var observer = globals.scrollerObservers[this.incrementId];

			if(observer){
				observer.disconnect();
				delete globals.scrollerObservers[this.incrementId];
			}

			if(this.$itemHolder){
				this.$itemHolder.find('.xierModal__scroller').removeClass('xierModal__scroller--overflowFallback');
			}
		},
		_saveScrollLockInlineStyles: function($html, $body){
			globals.scrollLockSaved = {
				html: {
					overflow: $html[0].style.overflow,
					overflowX: $html[0].style.overflowX,
					overflowY: $html[0].style.overflowY,
					scrollbarGutter: $html[0].style.scrollbarGutter,
					paddingRight: $html[0].style.paddingRight
				},
				body: {
					overflow: $body[0].style.overflow,
					overflowX: $body[0].style.overflowX,
					overflowY: $body[0].style.overflowY,
					paddingRight: $body[0].style.paddingRight
				},
				mainHolderPaddingRight: globals.$mainHolder ? globals.$mainHolder[0].style.paddingRight : ''
			};
		},
		_restoreScrollLockInlineStyles: function($html, $body){
			if(!globals.scrollLockSaved){
				return;
			}

			var htmlSaved = globals.scrollLockSaved.html;
			var bodySaved = globals.scrollLockSaved.body;

			$html.css({
				overflow: htmlSaved.overflow,
				overflowX: htmlSaved.overflowX,
				overflowY: htmlSaved.overflowY,
				scrollbarGutter: htmlSaved.scrollbarGutter
			});
			$body.css({
				overflow: bodySaved.overflow,
				overflowX: bodySaved.overflowX,
				overflowY: bodySaved.overflowY
			});

			if(globals.$mainHolder){
				globals.$mainHolder.css('padding-right', globals.scrollLockSaved.mainHolderPaddingRight);
				if(globals.$mainHolder.attr('style') === ''){
					globals.$mainHolder.removeAttr('style');
				}
			}

			globals.scrollLockSaved = false;
		},
		_getTransitionEventName: function(){
			var i;
			var el = document.createElement('div');
			var transitions = {
				'transition': 'transitionend',
				'OTransition': 'otransitionend',  // oTransitionEnd in very old Opera
				'MozTransition': 'transitionend',
				'WebkitTransition': 'webkitTransitionEnd'
			};

			for(i in transitions){
				if(el.style[i] !== undefined){
					return transitions[i];
				}
			}
		},
		_getAnimationStartEventName: function(){
			var i;
			var el = document.createElement('div');

			var animations = {
				'animation': 'animationstart',
				'OAnimation': 'oAnimationStart',
				'MozAnimation': 'animationstart',
				'WebkitAnimation': 'webkitAnimationStart'
			}

			for (i in animations){
				if(el.style[i] !== undefined){
					return animations[i];
				}
			}
		},
		_getAnimationEndEventName: function(){
			var i; 
			var el = document.createElement('div');

			var animations = {
				'animation': 'animationend',
				'OAnimation': 'oAnimationEnd',
				'MozAnimation': 'animationend',
				'WebkitAnimation': 'webkitAnimationEnd'
			}

			for (i in animations){
				if(el.style[i] !== undefined){
					return animations[i];
				}
			}
		},
		_openMainHolder: function(){
			this.options.onBeforeHolderOpen.call(this);
			globals.mainHolderClosed = false;
			globals.$mainHolder.css({
				'visibility': 'visible',
				'z-index': '1000'
			});
			this.lockScreen();
			this.options.onAfterHolderOpen.call(this);
		},
		_closeMainHolder: function(){
			this.options.onBeforeHolderClose.call(this);
			globals.mainHolderClosed = true;
			globals.showCounter = 0;
			globals.$mainHolder.css({
				'visibility': 'hidden',
				'z-index': '-1'
			});
			this.unlockScreen();
			this.options.onAfterHolderClose.call(this);
		},
		_showItemContent: function(force){
	
			var actual_this = this;
			var deferred = $.Deferred();
			var block = actual_this.$itemHolder.find('.xierModal__content');
			
			if(block.hasClass(actual_this._contentShowAnimationName)){
				
				deferred.resolve();
				
				block.addClass(actual_this.options.animationFillmodeFix);
				
			}else{
				
				block.one(globals.animationEndEventName, function() {
					
					deferred.resolve();

					block.addClass(actual_this.options.animationFillmodeFix);
					
				});
				
			}
			
			if(force){
				block.addClass(actual_this.options.animationForceName);
			}else{
				block.removeClass(actual_this.options.animationForceName);
			}
			
			block.removeClass(actual_this._contentHideAnimationName);
			block.addClass(actual_this._contentShowAnimationName);
			
			return deferred.promise();
		},
		_hideItemContent: function(force){

			var actual_this = this;
			var deferred = $.Deferred();
			var block = actual_this.$itemHolder.find('.xierModal__content');
			
			block.removeClass(actual_this.options.animationFillmodeFix);
			
			if(block.hasClass(actual_this._contentHideAnimationName)){
				
				deferred.resolve();

			}else{
				block.one(globals.animationEndEventName, function() {
					
					deferred.resolve();
					
				});
			}
			
			if(force){
				block.addClass(actual_this.options.animationForceName);
			}else{
				block.removeClass(actual_this.options.animationForceName);
			}
			
			block.removeClass(actual_this._contentShowAnimationName);
			block.addClass(actual_this._contentHideAnimationName);
			
			return deferred.promise();
		},
		_showItemBackground: function(force){
			
			var actual_this = this;
			var deferred = $.Deferred();
			var block = actual_this.$itemHolder.find('.xierModal__background');
			
			if(block.hasClass(actual_this._backgroundShowAnimationName)){
				
				deferred.resolve();
				
				block.addClass(actual_this.options.animationFillmodeFix);
				
			}else{
				block.one(globals.animationEndEventName, function(){
					
					deferred.resolve();
					
					block.addClass(actual_this.options.animationFillmodeFix);
					
				});	
			}
			
			if(force){
				block.addClass(actual_this.options.animationForceName);
			}else{
				block.removeClass(actual_this.options.animationForceName);
			}
			
			block.removeClass(actual_this._backgroundHideAnimationName);
			block.addClass(actual_this._backgroundShowAnimationName);
			
			return deferred.promise();
		},
		_hideItemBackground: function(force){
			
			var actual_this = this;
			var deferred = $.Deferred();
			var block = actual_this.$itemHolder.find('.xierModal__background');
			
			block.removeClass(actual_this.options.animationFillmodeFix);

			if(block.hasClass(actual_this._backgroundHideAnimationName)){
				
				deferred.resolve();
				
			}else{
				block.one(globals.animationEndEventName, function(){
					
					deferred.resolve();
					
				});
			}
			
			if(force){
				block.addClass(actual_this.options.animationForceName);
			}else{
				block.removeClass(actual_this.options.animationForceName);
			}
			
			block.removeClass(actual_this._backgroundShowAnimationName);
			block.addClass(actual_this._backgroundHideAnimationName);
			
			return deferred.promise();
		},
		_isMainHolderClosed: function(){
			return globals.mainHolderClosed;
		},
		_isScreenLocked: function(){
			return globals.isScreenLocked;
		},
		_isAllItemsHidden: function(){
			var allItemsHidden = true;
		
			$.each(globals.items, function(key, val){
				if(globals.items[key].state != 'hidden'){
					allItemsHidden = false;
				}
			});

			return allItemsHidden;
		},
		_tryParseJson: function(string){
			try{
				var o = JSON.parse(string);
                                // Проверка json
				// Handle non-exception-throwing cases:
				// Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
				// but... JSON.parse(null) returns null, and typeof null === "object", 
				// so we must check for that, too. Thankfully, null is falsey, so this suffices:
				if(o && typeof o === 'object'){
					return o;
				}
			}
			catch(e){}
			
			console.warn('String `'+string+'` is not valid json string');
			return false;
		},
		_setState: function(state){
			this.state = states[state];
			this.options.onStateChange.call(this);
		},
		_moveOnFront: function(){
			// ONLY CSS
			this.$itemHolder.css({'z-index': globals.showCounter});
		},
		_moveOutFront: function(){
			// ONLY CSS
			this.$itemHolder.css({'z-index': ''});
			if(this.$itemHolder.attr('style') == ''){
				this.$itemHolder.removeAttr('style');
			}
		},
		_setCurrent: function(){
			globals.currentIncrementId = this.incrementId;
			globals.currentItem = this;
		},
		_unsetCurrent: function(){
			if(this._isAllItemsHidden()){
				globals.currentIncrementId = false;
				globals.currentItem = false;
			}else{
				var maxShowNumber = 0;
				$.each(globals.items, function(){
					if(this.showNumber && this.showNumber > maxShowNumber){
						maxShowNumber = this.showNumber;
					}
				});
				$.each(globals.items, function(){
					if(this.showNumber == maxShowNumber){
						globals.currentIncrementId = this.incrementId;
						globals.currentItem = this;
						return false;
					}
				});
			}	
		},
		getItemIncrementId: function(){
			return this.incrementId;
		},
		show: function(){
			this._show();
		},
		showForce: function(){
			this._show(true, true);
		},
		_show: function(forceContent, forceBackground){
			
			var deferred = $.Deferred();
			var actual_this = this;
			var onBeforeShowSuccess = true;
			
			if(this.options.onBeforeShow && this.options.onBeforeShow.call(this) === false){
				onBeforeShowSuccess = false;
			}

			if(onBeforeShowSuccess){
				
				// Костылик для дифбека ='(
				//actual_this.$element.find('.field textarea, .field input').val('').prop('checked', false);
				actual_this.$element.find('.fform-data, .diFBack-form').show();
				actual_this.$element.find('.success, .msg').hide();
				
				if(this._isMainHolderClosed()){
					this._openMainHolder();
				}

				this._setState('showed');
				globals.showCounter++;
				this.showNumber = globals.showCounter;
				this._moveOnFront();
				this._setCurrent();

				if(!this._isAllItemsHidden()){
					$.each(globals.items, function(){
						if(this.incrementId !== globals.currentIncrementId && this.state == 'showed'){
							this._hideItemBackground(true);
							forceBackground = true;
						}
					});
				}

				var promise_showContent = this._showItemContent(forceContent);
				var promise_showBackground = this._showItemBackground(forceBackground);

				$.when(promise_showContent, promise_showBackground).done(function(){
					actual_this._setupScrollerWatch();
					deferred.resolve();
					actual_this.options.onAfterShow.call(actual_this);
				});
				
			}else{
				deferred.reject();
			}
			
			return deferred.promise();
		},
		hide: function(){
			this._hide();
		},
		hideForce: function(){
			this._hide(true, true);
		},
		_hide: function(forceContent, forceBackground){

			var deferred = $.Deferred();
			var actual_this = this;
			var onBeforeHideSuccess = true;
			
			if(this.options.onBeforeHide && this.options.onBeforeHide.call(this) === false){
				onBeforeHideSuccess = false;
			}
			
			if(onBeforeHideSuccess){
				this._setState('hidden');
				this.showNumber = false;
				this._unsetCurrent();

				if(!this._isAllItemsHidden()){
					$.each(globals.items, function(){
						if(this.incrementId == globals.currentIncrementId && this.state == 'showed'){
							this._showItemBackground(true);
							forceBackground = true;
						}
					});
				}

				var promise_hideContent = this._hideItemContent(forceContent);
				var promise_hideBackground = this._hideItemBackground(forceBackground);
				
				$.when(promise_hideContent, promise_hideBackground).done(function(){
					actual_this._teardownScrollerWatch();
					actual_this._moveOutFront();
					deferred.resolve();

					actual_this.options.onAfterHide.call(actual_this);
					if(actual_this.options.destroyOnHide){
						actual_this._destroy();
					}
					if(actual_this._isAllItemsHidden()){
						if(!actual_this._isMainHolderClosed()){
							actual_this._closeMainHolder();
						}			
					}
				});
			}else{
				deferred.reject();
			}
			

			return deferred.promise();		
	
		},
		destroy: function(){
			this._destroy(true);
		},
		_destroy: function(called_manually){ // Внутренние вызовы _detroy() должны выполняться только на скрытых модалках
	
			this.options.onBeforeDestroy.call(this);
			var actual_this = this;
			
			var promise;
			if(called_manually){
				if(this.state !== 'hidden'){
					promise = this._hide();
				}else{
					promise = true;
				}
			}
			
			$.when(promise).done(function(){
				delete(globals.items[actual_this.incrementId]);
				
				actual_this.$itemHolder.detach();
				actual_this.options.onAfterDestroy.call(actual_this);
			});

		},
		getState: function(){
			return this.state;
		},
		lockScreen: function(){
			if(this._isScreenLocked()){
				return;
			}

			globals.isScreenLocked = true;
			globals.scrollLockScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
			globals.scrollLockGutter = this._getScrollLockGutter();
			globals.screenOffsetApplied = globals.scrollLockGutter > 0;

			var $html = $(document.documentElement);
			var $body = $(document.body);
			var actual_this = this;

			this._saveScrollLockInlineStyles($html, $body);

			if(globals.screenOffsetApplied){
				$html.css('padding-right', (this._cssPx($html, 'padding-right') + globals.scrollLockGutter) + 'px');

				if(globals.$mainHolder){
					globals.$mainHolder.css('padding-right', globals.scrollLockGutter + 'px');
				}
			}

			$html.addClass('xierModal--scrollLock');

			// Inline перебивает overflow-y: scroll на html/body (sun, venus и т.п.)
			$html.css({ overflow: 'hidden', scrollbarGutter: 'auto' });
			$body.css({ overflow: 'hidden' });

			if(globals.screenOffsetApplied){
				var $fixedElements = $('*').not('[class*="xierModal"]').filter(function(){
					var $node = $(this);
					return $node.css('position') === 'fixed' && $node.css('right') === '0px';
				});

				$fixedElements.each(function(){
					var $node = $(this);
					$node.addClass('xierModal--fixedFix');
					$node.css({
						'padding-right': (actual_this._cssPx($node, 'padding-right') + globals.scrollLockGutter) + 'px'
					});
				});
			}
		},
		unlockScreen: function(){
			if(!this._isScreenLocked()){
				return;
			}

			globals.isScreenLocked = false;

			var $html = $(document.documentElement);
			var $body = $(document.body);
			var scrollY = globals.scrollLockScrollY;
			var gutter = globals.scrollLockGutter;
			var hadOffset = globals.screenOffsetApplied;
			var htmlPaddingBefore = globals.scrollLockSaved ? globals.scrollLockSaved.html.paddingRight : '';

			$html.removeClass('xierModal--scrollLock');

			this._restoreScrollLockInlineStyles($html, $body);

			if(hadOffset){
				var htmlPadding = this._cssPx($html, 'padding-right') - gutter;

				$html.css('padding-right', htmlPadding > 0 ? htmlPadding + 'px' : htmlPaddingBefore);

				var actual_this = this;

				$('.xierModal--fixedFix').each(function(){
					var $node = $(this);
					var newPadding = actual_this._cssPx($node, 'padding-right') - gutter;

					$node.css('padding-right', newPadding > 0 ? newPadding + 'px' : '');

					if($node.attr('style') === ''){
						$node.removeAttr('style');
					}

					$node.removeClass('xierModal--fixedFix');
				});
			}

			if($html.attr('style') === ''){
				$html.removeAttr('style');
			}
			if($body.attr('style') === ''){
				$body.removeAttr('style');
			}

			globals.screenOffsetApplied = false;
			globals.scrollLockGutter = 0;
			globals.scrollLockScrollY = 0;

			window.scrollTo(0, scrollY);
		},
	});

	$.fn.xiermodal = function(options){
		return this.each(function(){
			var $this = $(this);
			var data = $this.data(pluginName);

			if(!data){
				data = new plugin(this, options);
				$this.data(pluginName, data);
			}

			if(typeof options === 'string' && options.charAt(0) !== '_' && $.isFunction(plugin.prototype[options])){
				data[options].apply(data, Array.prototype.slice.call(arguments, 1));
			}else{
				//$.error('Для плагина "'+pluginName+'" метода "'+options+'" не существует.');
			}
		});
	}
	
	// Создание глобальной функции
	$.extend({
		[pluginName]: function(action, target, options){

			if(typeof action === 'string'){
				if(action == 'button'){
					options.button = target;
					return $('<div/>').xiermodal(options);
				}
				if(action == 'content'){
					return $(target).xiermodal(options);
				}
				if(action == 'show'){
					$.each(globals.items, function(){
						if(this.options.name == target){
							this.show();
						}
					});
				}
				if(action == 'hide'){
					if(target){
						$.each(globals.items, function(){
							if(this.options.name == target){
								this.hide();
							}
						});
					}else{
						$.each(globals.items, function(){
							this.hide();
						});
					}
				}
				if(action == 'showAll'){
					$.each(globals.items, function(){
						this.show();
					});
				}
				if(action == 'showAllForce'){
					$.each(globals.items, function(){
						this.showForce();
					});
				}
				if(action == 'hideAll'){
					$.each(globals.items, function(){
						this.hide();
					});
				}
				if(action == 'hideAllForce'){
					$.each(globals.items, function(){
						this.hideForce();
					});
				}
				if(action == 'getCurrentIncrementId'){
					return globals.currentIncrementId;
				}
				if(action == 'getCurrentItem'){
					return globals.currentItem;
				}
			}else if(!action){
				return globals.items;
			}
		}
	});
	
})(jQuery, window, document);