/**
 * @file storage.js
 * Venus — логическая БД: типы, пустая база, localStorage, export/import JSON.
 * Схема: TASKS.md → «Схема данных».
 */
(function (global) {
    'use strict';

    /** @typedef {string} VenusId */

    /**
     * @typedef {'expense'|'income'|'transfer'|'initial_balance'} VenusTransactionType
     */

    /**
     * @typedef {'expense'|'income'} VenusCategoryType
     */

    /**
     * @typedef {'manual'|'operation'} VenusExchangeRateSource
     */

    /**
     * @typedef {Object} VenusAppMeta
     * @property {number} schema_version
     * @property {string} created_at ISO datetime
     * @property {string} updated_at ISO datetime
     * @property {VenusId} default_user_id
     */

    /**
     * @typedef {Object} VenusUser
     * @property {VenusId} id
     * @property {string} name
     * @property {boolean} is_active
     * @property {string} created_at
     */

    /**
     * @typedef {Object} VenusCurrency
     * @property {VenusId} id
     * @property {string} code RUR, USD, …
     * @property {string} name
     * @property {string} symbol
     * @property {number} sort_order
     * @property {boolean} is_enabled
     */

    /**
     * @typedef {Object} VenusAccount
     * @property {VenusId} id
     * @property {string} name
     * @property {VenusId} currency_id
     * @property {string} note
     * @property {boolean} is_hidden
     * @property {number} sort_order
     * @property {VenusId|null} [user_id]
     * @property {string} created_at
     * @property {string} updated_at
     */

    /**
     * @typedef {Object} VenusCategory
     * @property {VenusId} id
     * @property {VenusCategoryType} type
     * @property {VenusId|null} parent_id
     * @property {string} name
     * @property {number} sort_order
     * @property {boolean} is_system
     * @property {boolean} is_hidden
     */

    /**
     * @typedef {Object} VenusUnit
     * @property {VenusId} id
     * @property {string} name
     * @property {string} short_name
     * @property {number} [sort_order]
     * @property {boolean} [is_system]
     */

    /**
     * @typedef {Object} VenusNamedRef
     * @property {VenusId} id
     * @property {string} name
     * @property {number} sort_order
     */

    /**
     * @typedef {Object} VenusExchangeRate
     * @property {VenusId} id
     * @property {string} date YYYY-MM-DD
     * @property {VenusId} from_currency_id
     * @property {VenusId} to_currency_id
     * @property {number} rate
     * @property {VenusExchangeRateSource} source
     */

    /**
     * @typedef {Object} VenusTransaction
     * @property {VenusId} id
     * @property {VenusTransactionType} type
     * @property {string} date YYYY-MM-DD
     * @property {VenusId|null} [account_id]
     * @property {VenusId|null} [account_from_id]
     * @property {VenusId|null} [account_to_id]
     * @property {VenusId|null} [category_id]
     * @property {number} amount
     * @property {VenusId} currency_id
     * @property {number|null} [quantity]
     * @property {number|null} [unit_price] цена за единицу
     * @property {VenusId|null} [unit_id]
     * @property {string} note
     * @property {VenusId|null} [user_id]
     * @property {string} created_at
     * @property {string} updated_at
     */

    /**
     * @typedef {Object} VenusDatabase
     * @property {number} schema_version
     * @property {VenusAppMeta} meta
     * @property {VenusUser[]} users
     * @property {VenusCurrency[]} currencies
     * @property {VenusAccount[]} accounts
     * @property {VenusCategory[]} categories
     * @property {VenusUnit[]} units
     * @property {VenusNamedRef[]} creditors
     * @property {VenusNamedRef[]} debtors
     * @property {VenusNamedRef[]} deposit_names
     * @property {VenusExchangeRate[]} exchange_rates
     * @property {VenusTransaction[]} transactions
     */

    const SCHEMA_VERSION = 1;
    const STORAGE_KEY = 'venus-database-v1';

    /** @type {readonly VenusTransactionType[]} */
    const TRANSACTION_TYPES = Object.freeze([
        'expense',
        'income',
        'transfer',
        'initial_balance',
    ]);

    /** @type {readonly VenusCategoryType[]} */
    const CATEGORY_TYPES = Object.freeze(['expense', 'income']);

    /**
     * @returns {string}
     */
    function nowIso() {
        return new Date().toISOString();
    }

    /**
     * @returns {VenusId}
     */
    function createId() {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') {
            return global.crypto.randomUUID();
        }
        return 'venus-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    /**
     * @param {string} [dateIso]
     * @returns {string} YYYY-MM-DD
     */
    function toDateOnly(dateIso) {
        return (dateIso || nowIso()).slice(0, 10);
    }

    /**
     * Встроенный справочник ДБ8 (TASKS.md → окно «Категории»).
     * @typedef {{ name: string, children?: readonly string[] }} VenusSeedCategoryNode
     */

    /** @type {readonly VenusSeedCategoryNode[]} */
    const SYSTEM_EXPENSE_CATEGORIES = Object.freeze([
        {
            name: 'Автомобиль',
            children: Object.freeze([
                'Автомойка',
                'Аксессуары',
                'Антифриз',
                'Бензин',
                'Запчасти',
                'Масло моторное',
                'Мойка кузова',
                'Налог',
                'Омыватель',
                'Парковка',
                'Прочее',
                'Ремонт',
                'Стоянка',
                'Страховка',
                'Технический осмотр',
                'Тонировка',
                'Шины',
                'Штраф',
                'Эвакуатор',
            ]),
        },
        {
            name: 'Комиссии',
            children: Object.freeze([
                'Банкомат',
                'Валютный перевод',
                'Комиссия банка',
                'Обмен валюты',
                'Обслуживание карты',
                'Перенос средств между счетами',
                'Перевод СБП',
                'Прочее',
                'SWIFT',
            ]),
        },
        {
            name: 'Коммунальные услуги',
            children: Object.freeze([
                'Аренда',
                'Водоотведение',
                'Водоснабжение',
                'Вывоз мусора',
                'Газ',
                'Домофон',
                'Капремонт',
                'Квартплата',
                'Лифт',
                'Охрана',
                'Отопление',
                'Прочее',
                'Ремонт',
                'Страховка',
                'Телефон',
                'Электроэнергия',
            ]),
        },
        {
            name: 'Мебель',
            children: Object.freeze([
                'Белье',
                'Ванная',
                'Гостиная',
                'Дверь',
                'Детская',
                'Диван',
                'Зеркало',
                'Кабинет',
                'Картина',
                'Кресло',
                'Кровать',
                'Кухня',
                'Лампа',
                'Матрас',
                'Офис',
                'Подушка',
                'Прихожая',
                'Спальня',
                'Стол',
                'Стулья',
                'Тумба',
                'Шкаф',
                'Шторы',
                'Ковер',
                'Прочее',
            ]),
        },
        {
            name: 'Медицина',
            children: Object.freeze([
                'Анализы',
                'Витамины',
                'Вызов врача',
                'Диагностика',
                'Лекарство',
                'Массаж',
                'Оптика',
                'Прививка',
                'Прием врача',
                'Прочее',
                'Реабилитация',
                'Санаторий',
                'Стоматология',
                'Страховка',
                'Физиотерапия',
            ]),
        },
        {
            name: 'Обувь',
            children: Object.freeze([
                'Балеринки',
                'Босоножки',
                'Ботильоны',
                'Ботинки',
                'Ботфорты',
                'Кеды',
                'Кроссовки',
                'Мокасины',
                'Плюшки',
                'Полуботинки',
                'Полусапоги',
                'Сабо',
                'Сандали',
                'Сапоги',
                'Спортивная',
                'Тапочки',
                'Туфли',
                'Шлепанцы',
                'Прочее',
            ]),
        },
        {
            name: 'Одежда',
            children: Object.freeze([
                'Блузка',
                'Боди',
                'Бриджи',
                'Брюки',
                'Бюстгальтер',
                'Варежки',
                'Ветровка',
                'Галстук',
                'Гольфы',
                'Джемпер',
                'Джинсы',
                'Жакет',
                'Жилет',
                'Капри',
                'Кардиган',
                'Колготки',
                'Комбинезон',
                'Корсет',
                'Костюм',
                'Кофта',
                'Куртка',
                'Майка',
                'Нижнее белье',
                'Носки',
                'Пальто',
                'Пиджак',
                'Пижама',
                'Плащ',
                'Платье',
                'Полукомбинезон',
                'Пуховик',
                'Пуловер',
                'Ремень',
                'Рубашка',
                'Сарафан',
                'Свитер',
                'Толстовка',
                'Трусы',
                'Туника',
                'Футболка',
                'Чулки',
                'Шарф',
                'Шорты',
                'Юбка',
                'Прочее',
            ]),
        },
        {
            name: 'Продукты питания',
            children: Object.freeze([
                'Алкоголь',
                'Бакалея',
                'Блины',
                'Вафли',
                'Грибы',
                'Зефир',
                'Икра',
                'Какао',
                'Каша',
                'Колбаса',
                'Консервы',
                'Конфеты',
                'Корм для животных',
                'Котлеты',
                'Кофе',
                'Крупа',
                'Курица',
                'Майонез',
                'Макароны',
                'Масло растительное',
                'Масло сливочное',
                'Мед',
                'Молоко',
                'Морепродукты',
                'Мороженое',
                'Мука',
                'Мясо',
                'Напитки',
                'Овощи',
                'Орехи',
                'Пельмени',
                'Печенье',
                'Пирожное',
                'Пицца',
                'Полуфабрикаты',
                'Приправы и специи',
                'Пряники',
                'Птица',
                'Рыба',
                'Салаты',
                'Сахар',
                'Семечки',
                'Сметана',
                'Сок',
                'Соль',
                'Соус',
                'Сухари',
                'Сухофрукты',
                'Сыр',
                'Торт',
                'Уксус',
                'Фарш',
                'Фрукты',
                'Хлеб',
                'Чай',
                'Шоколад',
                'Ягоды',
                'Яйца',
                'Прочее',
            ]),
        },
        {
            name: 'Развлечения',
            children: Object.freeze([
                'Аттракцион',
                'Боулинг',
                'Видеоигры',
                'Диск',
                'Дискотека',
                'Игра',
                'Кафе',
                'Кинотеатр',
                'Книги',
                'Концерт',
                'Музей',
                'Ночной клуб',
                'Отпуск',
                'Подарки',
                'Подписка',
                'Прочее',
                'Ресторан',
                'Спорт',
                'Стриминг',
                'Театр',
                'Хобби',
                'Экскурсии',
            ]),
        },
        {
            name: 'Регулярные платежи',
            children: Object.freeze([
                'Абонентская плата',
                'Антивирус',
                'Детский сад',
                'Интернет',
                'Карточка оплаты',
                'Клубная карта',
                'Мобильная связь',
                'Облако',
                'Обучение',
                'Прочее',
                'Спортзал',
                'Страховка',
                'Телевидение',
                'Телефон',
                'Хостинг',
            ]),
        },
        {
            name: 'Техника',
            children: Object.freeze([
                'Аксессуары для фото и видеокамеры',
                'Блендер',
                'Бритва',
                'Вентилятор',
                'Весы',
                'Видеокамера',
                'Водонагреватель',
                'Вытяжка',
                'Гриль',
                'DVD проигрыватель',
                'Домашний кинотеатр',
                'Зубная щетка',
                'Игровая приставка',
                'Карманный компьютер',
                'Комплектующие',
                'Компьютер',
                'Кондиционер',
                'Кофеварка',
                'Кофемолка',
                'Кухонный комбайн',
                'Магнитофон',
                'Машинка для стрижки',
                'Микроволновая печь',
                'Миксер',
                'Монитор',
                'Мультиварка',
                'Музыкальный центр',
                'Мясорубка',
                'Наушники',
                'Обогреватель',
                'Пароварка',
                'Печь',
                'Плеер',
                'Плита',
                'Посудомоечная машина',
                'Принтер',
                'Прочее',
                'Пылесос',
                'Радио',
                'Сканер',
                'Соковыжималка',
                'Стиральная машина',
                'Сушильная машина',
                'Телевизор',
                'Телефон',
                'Термометр',
                'Термос',
                'Тостер',
                'Утюг',
                'Факс',
                'Фильтр для очистки воды',
                'Фотоаппарат',
                'Фритюрница',
                'Холодильник',
                'Чайник',
                'Часы',
                'Швейная машина',
                'Эпилятор',
            ]),
        },
        {
            name: 'Транспорт',
            children: Object.freeze([
                'Автобус',
                'Велосипед',
                'Единый',
                'Каршеринг',
                'Маршрутка',
                'Метро',
                'Парковка',
                'Поезд',
                'Прокат транспорта',
                'Проездной',
                'Самокат',
                'Самолет',
                'Такси',
                'Трамвай',
                'Троллейбус',
                'Штраф',
                'Электричка',
            ]),
        },
        {
            name: 'Услуги',
            children: Object.freeze([
                'Адвокат',
                'Бухгалтер',
                'Доставка',
                'Заточка',
                'Клининг',
                'Курьер',
                'Ксерокопия',
                'Маникюр',
                'Нотариус',
                'Переводчик',
                'Печать фотографий',
                'Прачечная',
                'Прокат диска',
                'Прочее',
                'Ремонт обуви',
                'Ремонт техники',
                'Салон красоты',
                'Сантехник',
                'Стрижка',
                'Фотосессия',
                'Химчистка',
                'Электрик',
                'Юрист',
            ]),
        },
        {
            name: 'Хозяйственные товары',
            children: Object.freeze([
                'Бальзам',
                'Батарейки',
                'Бытовая химия',
                'Ведро',
                'Веник',
                'Весы',
                'Вешалка',
                'Вилки',
                'Гвозди',
                'Гель',
                'Гель для волос',
                'Гель для душа',
                'Губка',
                'Дезодорант',
                'Замок',
                'Зеркало',
                'Зонт',
                'Зубная паста',
                'Зубная щетка',
                'Инструмент',
                'Канцтовары',
                'Кисть',
                'Клей',
                'Ключ',
                'Кондиционер',
                'Краска',
                'Крем',
                'Лак',
                'Лампочка',
                'Ложка',
                'Лопата',
                'Люстра',
                'Магнит',
                'Маска',
                'Метла',
                'Молоток',
                'Мочалка',
                'Мыло',
                'Наждачная бумага',
                'Нож',
                'Ножницы',
                'Освежитель воздуха',
                'Пакеты',
                'Перчатки',
                'Пила',
                'Пинцет',
                'Пленка',
                'Посуда',
                'Прочее',
                'Расческа',
                'Розетка',
                'Салфетки',
                'Светильник',
                'Свеча',
                'Скотч',
                'Степлер',
                'Стакан',
                'Сумка',
                'Тарелка',
                'Таз',
                'Туалетная бумага',
                'Удлинитель',
            ]),
        },
    ]);

    /** @type {readonly VenusSeedCategoryNode[]} */
    const SYSTEM_INCOME_CATEGORIES = Object.freeze([
        {
            name: 'Аренда жилья',
            children: Object.freeze([
                'Аренда комнаты',
                'Аренда квартиры',
                'Долгосрочная аренда',
                'Краткосрочная аренда',
                'Посуточная аренда',
                'Прочее',
                'Сдача гаража',
                'Сдача парковки',
                'Субаренда',
            ]),
        },
        {
            name: 'Дивиденды',
            children: Object.freeze([
                'Акции',
                'Бонусные акции',
                'Валютные',
                'За год',
                'За квартал',
                'За полугодие',
                'Облигации',
                'ПИФы',
                'Прочее',
                'Реинвестирование',
            ]),
        },
        {
            name: 'Дотация',
            children: Object.freeze([
                'Алименты',
                'Детские',
                'Жилищная',
                'Льготы',
                'Материнский капитал',
                'Пособие по безработице',
                'Прочее',
                'Региональная',
                'Социальная',
                'Субсидия',
            ]),
        },
        {
            name: 'Зарплата',
            children: Object.freeze([
                'Аванс',
                'Бонус',
                'Надбавка',
                'Оклад',
                'Премия',
                'Отпускные',
                'Больничные',
                'Командировочные',
                'Прочее',
            ]),
        },
        {
            name: 'Лотерея',
            children: Object.freeze([
                'Билет',
                'Выигрыш онлайн',
                'Колесо фортуны',
                'Прочее',
                'Розыгрыш',
                'Скретч-карта',
                'Ставки',
                'Тотализатор',
            ]),
        },
        {
            name: 'Материальная помощь',
            children: Object.freeze([
                'От государства',
                'От организации',
                'От родственников',
                'Прочее',
                'Разовая',
                'Регулярная',
                'Целевая',
            ]),
        },
        {
            name: 'Наследство',
            children: Object.freeze([
                'Деньги',
                'Доля в бизнесе',
                'Недвижимость',
                'Прочее',
                'Транспорт',
                'Ценные бумаги',
                'Ювелирные изделия',
            ]),
        },
        {
            name: 'Находка',
            children: Object.freeze([
                'Возврат переплаты',
                'Кэшбэк',
                'Прочее',
                'Сдача в магазине',
                'Случайный доход',
                'Чаевые',
            ]),
        },
        {
            name: 'Пенсия',
            children: Object.freeze([
                'Военная',
                'По инвалидности',
                'По потере кормильца',
                'По старости',
                'Прочее',
                'Страховая',
                'Накопительная',
            ]),
        },
        {
            name: 'Подарок',
            children: Object.freeze([
                'Деньги',
                'На день рождения',
                'На праздник',
                'На свадьбу',
                'Прочее',
                'Сертификат',
                'Юбилей',
            ]),
        },
        {
            name: 'Продажа имущества',
            children: Object.freeze([
                'Автомобиль',
                'Антиквариат',
                'Гараж',
                'Земельный участок',
                'Квартира',
                'Коллекция',
                'Мебель',
                'Прочее',
                'Техника',
                'Ценные бумаги',
            ]),
        },
        {
            name: 'Стипендия',
            children: Object.freeze([
                'Академическая',
                'Государственная',
                'Именная',
                'Поощрительная',
                'Прочее',
                'Повышенная',
                'Социальная',
            ]),
        },
        {
            name: 'Страховка',
            children: Object.freeze([
                'Возврат премии',
                'Выплата по КАСКО',
                'Выплата по ОСАГО',
                'Выплата по полису',
                'Жизнь и здоровье',
                'Имущество',
                'Прочее',
                'Путешествия',
            ]),
        },
        {
            name: 'Халтура',
            children: Object.freeze([
                'Дизайн',
                'Доставка',
                'Консультация',
                'Монтаж',
                'Онлайн-услуги',
                'Подработка в выходные',
                'Прочее',
                'Разовый заказ',
                'Репетиторство',
                'Фриланс',
                'Фотосъёмка',
                'Хендмейд',
            ]),
        },
    ]);

    /** @type {readonly string[]} */
    const SYSTEM_UNITS = Object.freeze([
        'батон',
        'билет',
        'букет',
        'бутылка',
        'гр.',
        'дес.',
        'кг.',
        'комплект',
        'коробка',
        'л.',
        'мешок',
        'пакет',
        'пара',
        'пачка',
        'поездка',
        'рулон',
        'упаковка',
        'шт.',
    ]);

    /**
     * @param {VenusCategoryType} type
     * @param {VenusId|null} parentId
     * @param {string} name
     * @param {number} sortOrder
     * @returns {VenusCategory}
     */
    function makeSystemCategory(type, parentId, name, sortOrder) {
        return {
            id: createId(),
            type,
            parent_id: parentId,
            name,
            sort_order: sortOrder,
            is_system: true,
            is_hidden: false,
        };
    }

    /**
     * @param {VenusCategoryType} type
     * @param {readonly VenusSeedCategoryNode[]} nodes
     * @returns {VenusCategory[]}
     */
    function buildCategoriesFromSeed(type, nodes) {
        /** @type {VenusCategory[]} */
        const categories = [];

        nodes.forEach((node, rootIndex) => {
            const root = makeSystemCategory(type, null, node.name, rootIndex);
            categories.push(root);

            const children = node.children || [];
            children.forEach((childName, childIndex) => {
                categories.push(makeSystemCategory(type, root.id, childName, childIndex));
            });
        });

        return categories;
    }

    /**
     * @returns {VenusUnit[]}
     */
    function buildUnitsFromSeed() {
        return SYSTEM_UNITS.map((name, index) => ({
            id: createId(),
            name,
            short_name: name,
            sort_order: index,
            is_system: true,
        }));
    }

    /**
     * @param {VenusDatabase} db
     * @param {VenusCategoryType} type
     * @param {string} name
     * @param {VenusId|null} parentId
     * @returns {VenusCategory|undefined}
     */
    function findCategory(db, type, name, parentId) {
        return db.categories.find(
            (category) =>
                category.type === type &&
                category.name === name &&
                (category.parent_id || null) === (parentId || null),
        );
    }

    /**
     * @param {VenusDatabase} db
     * @returns {boolean}
     */
    function ensureNamedLists(db) {
        let changed = false;

        if (!Array.isArray(db.creditors)) {
            db.creditors = [];
            changed = true;
        }
        if (!Array.isArray(db.debtors)) {
            db.debtors = [];
            changed = true;
        }
        if (!Array.isArray(db.deposit_names)) {
            db.deposit_names = [];
            changed = true;
        }

        return changed;
    }

    /**
     * Добавляет в существующую базу недостающие системные категории и единицы.
     * @param {VenusDatabase} db
     * @returns {boolean} были изменения
     */
    function ensureSystemCatalog(db) {
        let changed = ensureNamedLists(db);

        /**
         * @param {VenusCategoryType} type
         * @param {readonly VenusSeedCategoryNode[]} nodes
         */
        function mergeCategoryTree(type, nodes) {
            nodes.forEach((node, rootIndex) => {
                let root = findCategory(db, type, node.name, null);
                if (!root) {
                    root = makeSystemCategory(type, null, node.name, rootIndex);
                    db.categories.push(root);
                    changed = true;
                }

                const children = node.children || [];
                children.forEach((childName, childIndex) => {
                    if (!findCategory(db, type, childName, root.id)) {
                        db.categories.push(
                            makeSystemCategory(type, root.id, childName, childIndex),
                        );
                        changed = true;
                    }
                });
            });
        }

        mergeCategoryTree('expense', SYSTEM_EXPENSE_CATEGORIES);
        mergeCategoryTree('income', SYSTEM_INCOME_CATEGORIES);

        const commissionSingular = findCategory(db, 'expense', 'Комиссия', null);
        let commissionRoot = findCategory(db, 'expense', 'Комиссии', null);
        if (commissionSingular && !commissionRoot) {
            commissionSingular.name = 'Комиссии';
            commissionRoot = commissionSingular;
            changed = true;
        }
        if (commissionRoot) {
            const commissionSubs = ['Обмен валюты', 'Перенос средств между счетами'];
            commissionSubs.forEach((childName, childIndex) => {
                if (!findCategory(db, 'expense', childName, commissionRoot.id)) {
                    db.categories.push(
                        makeSystemCategory('expense', commissionRoot.id, childName, childIndex),
                    );
                    changed = true;
                }
            });
        }

        const clothingRoot = findCategory(db, 'expense', 'Одежда', null);
        if (clothingRoot) {
            const underwearSingular = findCategory(db, 'expense', 'Белье', clothingRoot.id);
            const underwearFull = findCategory(db, 'expense', 'Нижнее белье', clothingRoot.id);
            if (underwearSingular && !underwearFull) {
                underwearSingular.name = 'Нижнее белье';
                changed = true;
            }
        }

        const foodRoot = findCategory(db, 'expense', 'Продукты питания', null);
        if (foodRoot) {
            const foodRenames = [
                ['Пирожки', 'Пирожное'],
                ['Приправы', 'Приправы и специи'],
            ];
            foodRenames.forEach(([from, to]) => {
                const oldCat = findCategory(db, 'expense', from, foodRoot.id);
                if (oldCat && !findCategory(db, 'expense', to, foodRoot.id)) {
                    oldCat.name = to;
                    changed = true;
                }
            });
        }

        const techRoot = findCategory(db, 'expense', 'Техника', null);
        if (techRoot) {
            const techRenames = [['Радиоприемник', 'Радио']];
            techRenames.forEach(([from, to]) => {
                const oldCat = findCategory(db, 'expense', from, techRoot.id);
                if (oldCat && !findCategory(db, 'expense', to, techRoot.id)) {
                    oldCat.name = to;
                    changed = true;
                }
            });
        }

        SYSTEM_UNITS.forEach((name, index) => {
            const exists = db.units.some(
                (unit) => unit.name === name || unit.short_name === name,
            );
            if (!exists) {
                db.units.push({
                    id: createId(),
                    name,
                    short_name: name,
                    sort_order: index,
                    is_system: true,
                });
                changed = true;
            }
        });

        if (changed) {
            touchDatabase(db);
        }

        return changed;
    }

    /**
     * Базовые валюты, категории и единицы «из коробки» (ДБ8).
     * @returns {{ currencies: VenusCurrency[], categories: VenusCategory[], units: VenusUnit[], currencyIds: Record<string, VenusId> }}
     */
    function buildSeedCatalog() {
        const currencyIds = {
            RUR: createId(),
            USD: createId(),
        };

        /** @type {VenusCurrency[]} */
        const currencies = [
            {
                id: currencyIds.RUR,
                code: 'RUR',
                name: 'Рубли',
                symbol: '₽',
                sort_order: 0,
                is_enabled: true,
            },
            {
                id: currencyIds.USD,
                code: 'USD',
                name: 'Доллары',
                symbol: '$',
                sort_order: 1,
                is_enabled: true,
            },
        ];

        const categories = [
            ...buildCategoriesFromSeed('expense', SYSTEM_EXPENSE_CATEGORIES),
            ...buildCategoriesFromSeed('income', SYSTEM_INCOME_CATEGORIES),
        ];

        return {
            currencies,
            categories,
            units: buildUnitsFromSeed(),
            currencyIds,
        };
    }

    /**
     * Пустая база для онбординга (без счетов и операций).
     * @returns {VenusDatabase}
     */
    function createEmptyDatabase() {
        const now = nowIso();
        const userId = createId();
        const { currencies, categories, units } = buildSeedCatalog();

        return {
            schema_version: SCHEMA_VERSION,
            meta: {
                schema_version: SCHEMA_VERSION,
                created_at: now,
                updated_at: now,
                default_user_id: userId,
            },
            users: [
                {
                    id: userId,
                    name: 'Пользователь',
                    is_active: true,
                    created_at: now,
                },
            ],
            currencies,
            accounts: [],
            categories,
            units,
            creditors: [],
            debtors: [],
            deposit_names: [],
            exchange_rates: [],
            transactions: [],
        };
    }

    /**
     * @param {unknown} value
     * @returns {value is VenusDatabase}
     */
    function isDatabase(value) {
        if (!value || typeof value !== 'object') {
            return false;
        }

        const db = /** @type {Record<string, unknown>} */ (value);

        return (
            db.schema_version === SCHEMA_VERSION &&
            Array.isArray(db.users) &&
            Array.isArray(db.currencies) &&
            Array.isArray(db.accounts) &&
            Array.isArray(db.categories) &&
            Array.isArray(db.units) &&
            Array.isArray(db.exchange_rates) &&
            Array.isArray(db.transactions) &&
            (!db.creditors || Array.isArray(db.creditors)) &&
            (!db.debtors || Array.isArray(db.debtors)) &&
            (!db.deposit_names || Array.isArray(db.deposit_names)) &&
            db.meta !== null &&
            typeof db.meta === 'object'
        );
    }

    /**
     * @param {VenusDatabase} db
     * @returns {VenusDatabase}
     */
    function touchDatabase(db) {
        db.meta.updated_at = nowIso();
        return db;
    }

    /** @type {VenusDatabase|null} */
    let cache = null;

    /**
     * @returns {VenusDatabase}
     */
    function load() {
        if (cache) {
            if (ensureSystemCatalog(cache)) {
                save(cache);
            }
            return cache;
        }

        try {
            const raw = global.localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (isDatabase(parsed)) {
                    if (ensureSystemCatalog(parsed)) {
                        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                    }
                    cache = parsed;
                    return cache;
                }
            }
        } catch (err) {
            console.warn('venus.storage.load:', err);
        }

        cache = createEmptyDatabase();
        save(cache);
        return cache;
    }

    /**
     * @param {VenusDatabase} db
     */
    function save(db) {
        touchDatabase(db);
        cache = db;
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    }

    /**
     * @param {VenusDatabase} db
     * @returns {string}
     */
    function exportJson(db) {
        return JSON.stringify(touchDatabase(db), null, 2);
    }

    /**
     * @param {string} json
     * @returns {VenusDatabase}
     */
    function importJson(json) {
        const parsed = JSON.parse(json);
        if (!isDatabase(parsed)) {
            throw new Error('Неверный формат файла Venus (schema_version или таблицы).');
        }
        ensureSystemCatalog(parsed);
        save(parsed);
        return parsed;
    }

    /**
     * Полная очистка (онбординг с нуля).
     * @returns {VenusDatabase}
     */
    function resetToEmpty() {
        cache = createEmptyDatabase();
        save(cache);
        return cache;
    }

    global.venusStorage = {
        SCHEMA_VERSION,
        STORAGE_KEY,
        TRANSACTION_TYPES,
        CATEGORY_TYPES,
        createId,
        toDateOnly,
        createEmptyDatabase,
        isDatabase,
        load,
        save,
        exportJson,
        importJson,
        resetToEmpty,
        SYSTEM_EXPENSE_CATEGORIES,
        SYSTEM_INCOME_CATEGORIES,
        SYSTEM_UNITS,
        ensureSystemCatalog,
    };
})(window);
