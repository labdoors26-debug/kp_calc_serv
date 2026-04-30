// ═══════════════════════════════════════════════════════════════════════
// СИСТЕМА УПРАВЛЕНИЯ ЦЕНАМИ Invisible Doors
// Структура соответствует Excel-прайсу: 4 матрицы дверей + наценки + допы
// ═══════════════════════════════════════════════════════════════════════

const PRICES_KEY = 'idloft_prices';

// ─── ПОКРЫТИЯ (колонки прайса) ─────────────────────────────────────────
// Унифицированный список — используется в админке и в калькуляторе.
const COVERINGS = {
  pod_pokras:        'Под покрас',
  zerk_pvh_1:        'Зеркало кромка ПВХ — 1 сторона',
  zerk_pvh_2:        'Зеркало кромка ПВХ — 2 стороны',
  zerk_al_1:         'Зеркало AL кромка — 1 сторона',
  zerk_al_2:         'Зеркало AL кромка — 2 стороны',
  ral_glanec:        'RAL глянец 90% Глосс',
  ral_mat:           'RAL матовый 18-23% Глосс',
  ral_supermat:      'RAL супермат 5% Глосс',
  spon_standart:     'Шпон Стандарт + AL кромка',
  spon_lux:          'Шпон Lux + AL кромка',
  spon_lux_plus:     'Шпон Lux Plus + AL кромка',
  plenka_al:         'Плёнка + AL кромка (до 850мм)',
  add_zerkalo:       'Добавить ЗЕРКАЛО (доплата)',
};

// ─── ВЫСОТНЫЕ ДИАПАЗОНЫ ────────────────────────────────────────────────
// h2000 = 2000мм, h2199 = 2010-2199мм, h2300 = 2200-2300мм,
// h2400 = 2310-2400мм, h2700 = 2410-2700мм, h3000 = 2710-3000мм
const HEIGHT_RANGES = {
  h2000: '2000мм',
  h2199: '2010-2199мм',
  h2300: '2200-2300мм',
  h2400: '2310-2400мм',
  h2700: '2410-2700мм',
  h3000: '2710-3000мм',
};

const PRICES_DEFAULTS = {
  // ═══════════════════════════════════════════════════════════════════
  // 1. ДВ-40 (Magic / Loft / Penal — раздвижные системы, прайс «MagicLOFT»)
  // 4 высоты: h2000, h2100 (до 2100), h2400 (2110-2400), h3000 (2410-3000)
  // У ДВ-40 нет столбцов «Зеркало ПВХ/AL» — зеркало добавляется отдельно (доплата за шт)
  // ═══════════════════════════════════════════════════════════════════
  doors_dv40: {
    h2000_pod_pokras:    { val: 19900, label: 'ДВ-40 h=2000, Под покрас' },
    h2000_ral_mat:       { val: 39900, label: 'ДВ-40 h=2000, RAL матовый' },
    h2000_ral_supermat:  { val: 47900, label: 'ДВ-40 h=2000, RAL супермат' },
    h2000_ral_glanec:    { val: 49900, label: 'ДВ-40 h=2000, RAL глянец' },
    h2000_spon_standart: { val: 43900, label: 'ДВ-40 h=2000, Шпон стандарт' },
    h2000_spon_lux:      { val: 60900, label: 'ДВ-40 h=2000, Шпон Lux' },
    h2000_spon_lux_plus: { val: 70900, label: 'ДВ-40 h=2000, Шпон Lux+' },
    h2000_plenka_al:     { val: 15000, label: 'ДВ-40 h=2000, Плёнка+AL до 850мм' },
    h2000_add_zerkalo:   { val: 10000, label: 'ДВ-40 h=2000, +Зеркало (за шт)' },

    h2100_pod_pokras:    { val: 21900, label: 'ДВ-40 h≤2100, Под покрас' },
    h2100_ral_mat:       { val: 41900, label: 'ДВ-40 h≤2100, RAL матовый' },
    h2100_ral_supermat:  { val: 49900, label: 'ДВ-40 h≤2100, RAL супермат' },
    h2100_ral_glanec:    { val: 52900, label: 'ДВ-40 h≤2100, RAL глянец' },
    h2100_spon_standart: { val: 49900, label: 'ДВ-40 h≤2100, Шпон стандарт' },
    h2100_spon_lux:      { val: 65900, label: 'ДВ-40 h≤2100, Шпон Lux' },
    h2100_spon_lux_plus: { val: 75900, label: 'ДВ-40 h≤2100, Шпон Lux+' },
    h2100_plenka_al:     { val: 15000, label: 'ДВ-40 h≤2100, Плёнка+AL до 850мм' },
    h2100_add_zerkalo:   { val: 10000, label: 'ДВ-40 h≤2100, +Зеркало (за шт)' },

    h2400_pod_pokras:    { val: 24900, label: 'ДВ-40 h≤2400, Под покрас' },
    h2400_ral_mat:       { val: 43900, label: 'ДВ-40 h≤2400, RAL матовый' },
    h2400_ral_supermat:  { val: 51900, label: 'ДВ-40 h≤2400, RAL супермат' },
    h2400_ral_glanec:    { val: 54900, label: 'ДВ-40 h≤2400, RAL глянец' },
    h2400_spon_standart: { val: 52900, label: 'ДВ-40 h≤2400, Шпон стандарт' },
    h2400_spon_lux:      { val: 73900, label: 'ДВ-40 h≤2400, Шпон Lux' },
    h2400_spon_lux_plus: { val: 86900, label: 'ДВ-40 h≤2400, Шпон Lux+' },
    h2400_plenka_al:     { val: 17000, label: 'ДВ-40 h≤2400, Плёнка+AL до 850мм' },
    h2400_add_zerkalo:   { val: 12000, label: 'ДВ-40 h≤2400, +Зеркало (за шт)' },

    h3000_pod_pokras:    { val: 38900, label: 'ДВ-40 h≤3000, Под покрас' },
    h3000_ral_mat:       { val: 51900, label: 'ДВ-40 h≤3000, RAL матовый' },
    h3000_ral_supermat:  { val: 58900, label: 'ДВ-40 h≤3000, RAL супермат' },
    h3000_ral_glanec:    { val: 62900, label: 'ДВ-40 h≤3000, RAL глянец' },
    h3000_spon_standart: { val: 63900, label: 'ДВ-40 h≤3000, Шпон стандарт' },
    h3000_spon_lux:      { val: 85900, label: 'ДВ-40 h≤3000, Шпон Lux' },
    h3000_spon_lux_plus: { val: 95900, label: 'ДВ-40 h≤3000, Шпон Lux+' },
    h3000_plenka_al:     { val: 17000, label: 'ДВ-40 h≤3000, Плёнка+AL до 850мм' },
    h3000_add_zerkalo:   { val: 12000, label: 'ДВ-40 h≤3000, +Зеркало (за шт)' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 2. ДВ-55 (базовая дверь — внутреннее/внешнее открывание)
  // Полный набор покрытий
  // ═══════════════════════════════════════════════════════════════════
  doors_dv55: {
    h2000_pod_pokras:    { val: 37100,  label: 'ДВ-55 h=2000, Под покрас' },
    h2000_zerk_pvh_1:    { val: 58400,  label: 'ДВ-55 h=2000, Зеркало ПВХ 1ст' },
    h2000_zerk_pvh_2:    { val: 70400,  label: 'ДВ-55 h=2000, Зеркало ПВХ 2ст' },
    h2000_zerk_al_1:     { val: 64400,  label: 'ДВ-55 h=2000, Зеркало AL 1ст' },
    h2000_zerk_al_2:     { val: 76400,  label: 'ДВ-55 h=2000, Зеркало AL 2ст' },
    h2000_ral_glanec:    { val: 64900,  label: 'ДВ-55 h=2000, RAL глянец' },
    h2000_ral_mat:       { val: 52900,  label: 'ДВ-55 h=2000, RAL матовый' },
    h2000_ral_supermat:  { val: 60900,  label: 'ДВ-55 h=2000, RAL супермат' },
    h2000_spon_standart: { val: 65400,  label: 'ДВ-55 h=2000, Шпон стандарт' },
    h2000_spon_lux:      { val: 77400,  label: 'ДВ-55 h=2000, Шпон Lux' },
    h2000_spon_lux_plus: { val: 87400,  label: 'ДВ-55 h=2000, Шпон Lux+' },
    h2000_plenka_al:     { val: 17000,  label: 'ДВ-55 h=2000, Плёнка+AL' },
    h2000_add_zerkalo:   { val: 12000,  label: 'ДВ-55 h=2000, +Зеркало (за шт)' },

    h2199_pod_pokras:    { val: 40000,  label: 'ДВ-55 h≤2199, Под покрас' },
    h2199_zerk_pvh_1:    { val: 60400,  label: 'ДВ-55 h≤2199, Зеркало ПВХ 1ст' },
    h2199_zerk_pvh_2:    { val: 72400,  label: 'ДВ-55 h≤2199, Зеркало ПВХ 2ст' },
    h2199_zerk_al_1:     { val: 66400,  label: 'ДВ-55 h≤2199, Зеркало AL 1ст' },
    h2199_zerk_al_2:     { val: 78400,  label: 'ДВ-55 h≤2199, Зеркало AL 2ст' },
    h2199_ral_glanec:    { val: 67400,  label: 'ДВ-55 h≤2199, RAL глянец' },
    h2199_ral_mat:       { val: 55900,  label: 'ДВ-55 h≤2199, RAL матовый' },
    h2199_ral_supermat:  { val: 63900,  label: 'ДВ-55 h≤2199, RAL супермат' },
    h2199_spon_standart: { val: 67400,  label: 'ДВ-55 h≤2199, Шпон стандарт' },
    h2199_spon_lux:      { val: 79400,  label: 'ДВ-55 h≤2199, Шпон Lux' },
    h2199_spon_lux_plus: { val: 89400,  label: 'ДВ-55 h≤2199, Шпон Lux+' },
    h2199_plenka_al:     { val: 17000,  label: 'ДВ-55 h≤2199, Плёнка+AL' },
    h2199_add_zerkalo:   { val: 12000,  label: 'ДВ-55 h≤2199, +Зеркало (за шт)' },

    h2300_pod_pokras:    { val: 44400,  label: 'ДВ-55 h≤2300, Под покрас' },
    h2300_zerk_pvh_1:    { val: 64400,  label: 'ДВ-55 h≤2300, Зеркало ПВХ 1ст' },
    h2300_zerk_pvh_2:    { val: 75900,  label: 'ДВ-55 h≤2300, Зеркало ПВХ 2ст' },
    h2300_zerk_al_1:     { val: 70400,  label: 'ДВ-55 h≤2300, Зеркало AL 1ст' },
    h2300_zerk_al_2:     { val: 82400,  label: 'ДВ-55 h≤2300, Зеркало AL 2ст' },
    h2300_ral_glanec:    { val: 71900,  label: 'ДВ-55 h≤2300, RAL глянец' },
    h2300_ral_mat:       { val: 59900,  label: 'ДВ-55 h≤2300, RAL матовый' },
    h2300_ral_supermat:  { val: 67900,  label: 'ДВ-55 h≤2300, RAL супермат' },
    h2300_spon_standart: { val: 72400,  label: 'ДВ-55 h≤2300, Шпон стандарт' },
    h2300_spon_lux:      { val: 85400,  label: 'ДВ-55 h≤2300, Шпон Lux' },
    h2300_spon_lux_plus: { val: 97400,  label: 'ДВ-55 h≤2300, Шпон Lux+' },
    h2300_plenka_al:     { val: 17000,  label: 'ДВ-55 h≤2300, Плёнка+AL' },
    h2300_add_zerkalo:   { val: 12000,  label: 'ДВ-55 h≤2300, +Зеркало (за шт)' },

    h2400_pod_pokras:    { val: 47600,  label: 'ДВ-55 h≤2400, Под покрас' },
    h2400_zerk_pvh_1:    { val: 69400,  label: 'ДВ-55 h≤2400, Зеркало ПВХ 1ст' },
    h2400_zerk_pvh_2:    { val: 80900,  label: 'ДВ-55 h≤2400, Зеркало ПВХ 2ст' },
    h2400_zerk_al_1:     { val: 75400,  label: 'ДВ-55 h≤2400, Зеркало AL 1ст' },
    h2400_zerk_al_2:     { val: 87400,  label: 'ДВ-55 h≤2400, Зеркало AL 2ст' },
    h2400_ral_glanec:    { val: 73900,  label: 'ДВ-55 h≤2400, RAL глянец' },
    h2400_ral_mat:       { val: 66900,  label: 'ДВ-55 h≤2400, RAL матовый' },
    h2400_ral_supermat:  { val: 74900,  label: 'ДВ-55 h≤2400, RAL супермат' },
    h2400_spon_standart: { val: 75400,  label: 'ДВ-55 h≤2400, Шпон стандарт' },
    h2400_spon_lux:      { val: 89400,  label: 'ДВ-55 h≤2400, Шпон Lux' },
    h2400_spon_lux_plus: { val: 101400, label: 'ДВ-55 h≤2400, Шпон Lux+' },
    h2400_plenka_al:     { val: 17000,  label: 'ДВ-55 h≤2400, Плёнка+AL' },
    h2400_add_zerkalo:   { val: 12000,  label: 'ДВ-55 h≤2400, +Зеркало (за шт)' },

    h2700_pod_pokras:    { val: 67400,  label: 'ДВ-55 h≤2700, Под покрас' },
    h2700_zerk_pvh_1:    { val: 78400,  label: 'ДВ-55 h≤2700, Зеркало ПВХ 1ст' },
    h2700_zerk_pvh_2:    { val: 91900,  label: 'ДВ-55 h≤2700, Зеркало ПВХ 2ст' },
    h2700_zerk_al_1:     { val: 87400,  label: 'ДВ-55 h≤2700, Зеркало AL 1ст' },
    h2700_zerk_al_2:     { val: 99400,  label: 'ДВ-55 h≤2700, Зеркало AL 2ст' },
    h2700_ral_glanec:    { val: 83900,  label: 'ДВ-55 h≤2700, RAL глянец' },
    h2700_ral_mat:       { val: 74900,  label: 'ДВ-55 h≤2700, RAL матовый' },
    h2700_ral_supermat:  { val: 82900,  label: 'ДВ-55 h≤2700, RAL супермат' },
    h2700_spon_standart: { val: 88400,  label: 'ДВ-55 h≤2700, Шпон стандарт' },
    h2700_spon_lux:      { val: 101400, label: 'ДВ-55 h≤2700, Шпон Lux' },
    h2700_spon_lux_plus: { val: 114400, label: 'ДВ-55 h≤2700, Шпон Lux+' },
    h2700_plenka_al:     { val: 19000,  label: 'ДВ-55 h≤2700, Плёнка+AL' },
    h2700_add_zerkalo:   { val: 14000,  label: 'ДВ-55 h≤2700, +Зеркало (за шт)' },

    h3000_pod_pokras:    { val: 75000,  label: 'ДВ-55 h≤3000, Под покрас' },
    h3000_zerk_pvh_1:    { val: 93400,  label: 'ДВ-55 h≤3000, Зеркало ПВХ 1ст' },
    h3000_zerk_pvh_2:    { val: 106900, label: 'ДВ-55 h≤3000, Зеркало ПВХ 2ст' },
    h3000_zerk_al_1:     { val: 102400, label: 'ДВ-55 h≤3000, Зеркало AL 1ст' },
    h3000_zerk_al_2:     { val: 114400, label: 'ДВ-55 h≤3000, Зеркало AL 2ст' },
    h3000_ral_glanec:    { val: 88900,  label: 'ДВ-55 h≤3000, RAL глянец' },
    h3000_ral_mat:       { val: 79900,  label: 'ДВ-55 h≤3000, RAL матовый' },
    h3000_ral_supermat:  { val: 87900,  label: 'ДВ-55 h≤3000, RAL супермат' },
    h3000_spon_standart: { val: 92400,  label: 'ДВ-55 h≤3000, Шпон стандарт' },
    h3000_spon_lux:      { val: 108400, label: 'ДВ-55 h≤3000, Шпон Lux' },
    h3000_spon_lux_plus: { val: 120400, label: 'ДВ-55 h≤3000, Шпон Lux+' },
    h3000_plenka_al:     { val: 19000,  label: 'ДВ-55 h≤3000, Плёнка+AL' },
    h3000_add_zerkalo:   { val: 14000,  label: 'ДВ-55 h≤3000, +Зеркало (за шт)' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 3. ДВ-60 ПРЕМИУМ (премиальное полотно — включает AL кромку, шумоизоляцию,
  // УВС, петли Armadillo, замок AGB по умолчанию)
  // У ДВ-60 ПРЕМИУМ нет «Зеркало ПВХ» — только зеркало с AL кромкой
  // ═══════════════════════════════════════════════════════════════════
  doors_dv60: {
    h2000_pod_pokras:    { val: 57400,  label: 'ДВ-60 ПРЕМИУМ h=2000, Под покрас' },
    h2000_zerk_al_1:     { val: 64400,  label: 'ДВ-60 ПРЕМИУМ h=2000, Зеркало AL 1ст' },
    h2000_zerk_al_2:     { val: 76400,  label: 'ДВ-60 ПРЕМИУМ h=2000, Зеркало AL 2ст' },
    h2000_ral_glanec:    { val: 81200,  label: 'ДВ-60 ПРЕМИУМ h=2000, RAL глянец' },
    h2000_ral_mat:       { val: 65800,  label: 'ДВ-60 ПРЕМИУМ h=2000, RAL матовый' },
    h2000_ral_supermat:  { val: 73800,  label: 'ДВ-60 ПРЕМИУМ h=2000, RAL супермат' },
    h2000_spon_standart: { val: 77900,  label: 'ДВ-60 ПРЕМИУМ h=2000, Шпон стандарт' },
    h2000_spon_lux:      { val: 89900,  label: 'ДВ-60 ПРЕМИУМ h=2000, Шпон Lux' },
    h2000_spon_lux_plus: { val: 99900,  label: 'ДВ-60 ПРЕМИУМ h=2000, Шпон Lux+' },
    h2000_plenka_al:     { val: 69400,  label: 'ДВ-60 ПРЕМИУМ h=2000, Плёнка+AL' },
    h2000_add_zerkalo:   { val: 12000,  label: 'ДВ-60 ПРЕМИУМ h=2000, +Зеркало (за шт)' },

    h2199_pod_pokras:    { val: 58400,  label: 'ДВ-60 ПРЕМИУМ h≤2199, Под покрас' },
    h2199_zerk_al_1:     { val: 65400,  label: 'ДВ-60 ПРЕМИУМ h≤2199, Зеркало AL 1ст' },
    h2199_zerk_al_2:     { val: 77400,  label: 'ДВ-60 ПРЕМИУМ h≤2199, Зеркало AL 2ст' },
    h2199_ral_glanec:    { val: 82200,  label: 'ДВ-60 ПРЕМИУМ h≤2199, RAL глянец' },
    h2199_ral_mat:       { val: 66800,  label: 'ДВ-60 ПРЕМИУМ h≤2199, RAL матовый' },
    h2199_ral_supermat:  { val: 74800,  label: 'ДВ-60 ПРЕМИУМ h≤2199, RAL супермат' },
    h2199_spon_standart: { val: 80500,  label: 'ДВ-60 ПРЕМИУМ h≤2199, Шпон стандарт' },
    h2199_spon_lux:      { val: 92500,  label: 'ДВ-60 ПРЕМИУМ h≤2199, Шпон Lux' },
    h2199_spon_lux_plus: { val: 102500, label: 'ДВ-60 ПРЕМИУМ h≤2199, Шпон Lux+' },
    h2199_plenka_al:     { val: 70400,  label: 'ДВ-60 ПРЕМИУМ h≤2199, Плёнка+AL' },
    h2199_add_zerkalo:   { val: 12000,  label: 'ДВ-60 ПРЕМИУМ h≤2199, +Зеркало (за шт)' },

    h2300_pod_pokras:    { val: 67700,  label: 'ДВ-60 ПРЕМИУМ h≤2300, Под покрас' },
    h2300_zerk_al_1:     { val: 74700,  label: 'ДВ-60 ПРЕМИУМ h≤2300, Зеркало AL 1ст' },
    h2300_zerk_al_2:     { val: 86700,  label: 'ДВ-60 ПРЕМИУМ h≤2300, Зеркало AL 2ст' },
    h2300_ral_glanec:    { val: 91600,  label: 'ДВ-60 ПРЕМИУМ h≤2300, RAL глянец' },
    h2300_ral_mat:       { val: 76300,  label: 'ДВ-60 ПРЕМИУМ h≤2300, RAL матовый' },
    h2300_ral_supermat:  { val: 84300,  label: 'ДВ-60 ПРЕМИУМ h≤2300, RAL супермат' },
    h2300_spon_standart: { val: 87000,  label: 'ДВ-60 ПРЕМИУМ h≤2300, Шпон стандарт' },
    h2300_spon_lux:      { val: 100000, label: 'ДВ-60 ПРЕМИУМ h≤2300, Шпон Lux' },
    h2300_spon_lux_plus: { val: 112000, label: 'ДВ-60 ПРЕМИУМ h≤2300, Шпон Lux+' },
    h2300_plenka_al:     { val: 79700,  label: 'ДВ-60 ПРЕМИУМ h≤2300, Плёнка+AL' },
    h2300_add_zerkalo:   { val: 12000,  label: 'ДВ-60 ПРЕМИУМ h≤2300, +Зеркало (за шт)' },

    h2400_pod_pokras:    { val: 73800,  label: 'ДВ-60 ПРЕМИУМ h≤2400, Под покрас' },
    h2400_zerk_al_1:     { val: 80800,  label: 'ДВ-60 ПРЕМИУМ h≤2400, Зеркало AL 1ст' },
    h2400_zerk_al_2:     { val: 92800,  label: 'ДВ-60 ПРЕМИУМ h≤2400, Зеркало AL 2ст' },
    h2400_ral_glanec:    { val: 94600,  label: 'ДВ-60 ПРЕМИУМ h≤2400, RAL глянец' },
    h2400_ral_mat:       { val: 79200,  label: 'ДВ-60 ПРЕМИУМ h≤2400, RAL матовый' },
    h2400_ral_supermat:  { val: 87200,  label: 'ДВ-60 ПРЕМИУМ h≤2400, RAL супермат' },
    h2400_spon_standart: { val: 90900,  label: 'ДВ-60 ПРЕМИУМ h≤2400, Шпон стандарт' },
    h2400_spon_lux:      { val: 103900, label: 'ДВ-60 ПРЕМИУМ h≤2400, Шпон Lux' },
    h2400_spon_lux_plus: { val: 115900, label: 'ДВ-60 ПРЕМИУМ h≤2400, Шпон Lux+' },
    h2400_plenka_al:     { val: 85800,  label: 'ДВ-60 ПРЕМИУМ h≤2400, Плёнка+AL' },
    h2400_add_zerkalo:   { val: 12000,  label: 'ДВ-60 ПРЕМИУМ h≤2400, +Зеркало (за шт)' },

    h2700_pod_pokras:    { val: 76100,  label: 'ДВ-60 ПРЕМИУМ h≤2700, Под покрас' },
    h2700_zerk_al_1:     { val: 90100,  label: 'ДВ-60 ПРЕМИУМ h≤2700, Зеркало AL 1ст' },
    h2700_zerk_al_2:     { val: 104100, label: 'ДВ-60 ПРЕМИУМ h≤2700, Зеркало AL 2ст' },
    h2700_ral_glanec:    { val: 105200, label: 'ДВ-60 ПРЕМИУМ h≤2700, RAL глянец' },
    h2700_ral_mat:       { val: 89800,  label: 'ДВ-60 ПРЕМИУМ h≤2700, RAL матовый' },
    h2700_ral_supermat:  { val: 97800,  label: 'ДВ-60 ПРЕМИУМ h≤2700, RAL супермат' },
    h2700_spon_standart: { val: 109700, label: 'ДВ-60 ПРЕМИУМ h≤2700, Шпон стандарт' },
    h2700_spon_lux:      { val: 122700, label: 'ДВ-60 ПРЕМИУМ h≤2700, Шпон Lux' },
    h2700_spon_lux_plus: { val: 134700, label: 'ДВ-60 ПРЕМИУМ h≤2700, Шпон Lux+' },
    h2700_plenka_al:     { val: 90100,  label: 'ДВ-60 ПРЕМИУМ h≤2700, Плёнка+AL' },
    h2700_add_zerkalo:   { val: 14000,  label: 'ДВ-60 ПРЕМИУМ h≤2700, +Зеркало (за шт)' },

    h3000_pod_pokras:    { val: 84100,  label: 'ДВ-60 ПРЕМИУМ h≤3000, Под покрас' },
    h3000_zerk_al_1:     { val: 98100,  label: 'ДВ-60 ПРЕМИУМ h≤3000, Зеркало AL 1ст' },
    h3000_zerk_al_2:     { val: 112100, label: 'ДВ-60 ПРЕМИУМ h≤3000, Зеркало AL 2ст' },
    h3000_ral_glanec:    { val: 113200, label: 'ДВ-60 ПРЕМИУМ h≤3000, RAL глянец' },
    h3000_ral_mat:       { val: 97800,  label: 'ДВ-60 ПРЕМИУМ h≤3000, RAL матовый' },
    h3000_ral_supermat:  { val: 105800, label: 'ДВ-60 ПРЕМИУМ h≤3000, RAL супермат' },
    h3000_spon_standart: { val: 114900, label: 'ДВ-60 ПРЕМИУМ h≤3000, Шпон стандарт' },
    h3000_spon_lux:      { val: 130900, label: 'ДВ-60 ПРЕМИУМ h≤3000, Шпон Lux' },
    h3000_spon_lux_plus: { val: 142900, label: 'ДВ-60 ПРЕМИУМ h≤3000, Шпон Lux+' },
    h3000_plenka_al:     { val: 98100,  label: 'ДВ-60 ПРЕМИУМ h≤3000, Плёнка+AL' },
    h3000_add_zerkalo:   { val: 14000,  label: 'ДВ-60 ПРЕМИУМ h≤3000, +Зеркало (за шт)' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 4. ПЕНАЛЫ (механизм + короб) — матрица высота × ширина для УНО и ДУО
  // У пеналов 5 высотных диапазонов: h2100 (2000-2100), h2300 (2200-2300),
  // h2400, h2700 (2500-2700), h3000 (2800-3000)
  // ═══════════════════════════════════════════════════════════════════
  penal_uno: {
    h2100_w900:  { val: 74000,  label: 'УНО, h≤2100, w≤900' },
    h2100_w1000: { val: 85000,  label: 'УНО, h≤2100, w=1000' },
    h2100_w1200: { val: 90000,  label: 'УНО, h≤2100, w=1200' },
    h2300_w900:  { val: 79000,  label: 'УНО, h≤2300, w≤900' },
    h2300_w1000: { val: 89000,  label: 'УНО, h≤2300, w=1000' },
    h2300_w1200: { val: 94500,  label: 'УНО, h≤2300, w=1200' },
    h2400_w900:  { val: 80000,  label: 'УНО, h=2400, w≤900' },
    h2400_w1000: { val: 90000,  label: 'УНО, h=2400, w=1000' },
    h2400_w1200: { val: 103500, label: 'УНО, h=2400, w=1200' },
    h2700_w900:  { val: 96100,  label: 'УНО, h≤2700, w≤900' },
    h2700_w1000: { val: 105300, label: 'УНО, h≤2700, w=1000' },
    h2700_w1200: { val: 118800, label: 'УНО, h≤2700, w=1200' },
    h3000_w900:  { val: 109000, label: 'УНО, h≤3000, w≤900' },
    h3000_w1000: { val: 117900, label: 'УНО, h≤3000, w=1000' },
    h3000_w1200: { val: 125000, label: 'УНО, h≤3000, w=1200' },
  },
  penal_duo: {
    h2100_w900:  { val: 148000, label: 'ДУО, h≤2100, w≤900' },
    h2100_w1000: { val: 170000, label: 'ДУО, h≤2100, w=1000' },
    h2100_w1200: { val: 180000, label: 'ДУО, h≤2100, w=1200' },
    h2300_w900:  { val: 158000, label: 'ДУО, h≤2300, w≤900' },
    h2300_w1000: { val: 178000, label: 'ДУО, h≤2300, w=1000' },
    h2300_w1200: { val: 189000, label: 'ДУО, h≤2300, w=1200' },
    h2400_w900:  { val: 160000, label: 'ДУО, h=2400, w≤900' },
    h2400_w1000: { val: 180000, label: 'ДУО, h=2400, w=1000' },
    h2400_w1200: { val: 207000, label: 'ДУО, h=2400, w=1200' },
    h2700_w900:  { val: 192200, label: 'ДУО, h≤2700, w≤900' },
    h2700_w1000: { val: 210600, label: 'ДУО, h≤2700, w=1000' },
    h2700_w1200: { val: 237600, label: 'ДУО, h≤2700, w=1200' },
    h3000_w900:  { val: 218000, label: 'ДУО, h≤3000, w≤900' },
    h3000_w1000: { val: 235800, label: 'ДУО, h≤3000, w=1000' },
    h3000_w1200: { val: 250000, label: 'ДУО, h≤3000, w=1200' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 5. НАЦЕНКИ И КОЭФФИЦИЕНТЫ (применяются к итоговой цене двери)
  // ═══════════════════════════════════════════════════════════════════
  markup: {
    mansardnaya:        { val: 50,    label: 'Мансардная дверь, +%' },
    height_3000_3450:   { val: 50,    label: 'Высота 3000-3450мм, +%' },
    width_901_1200:     { val: 50,    label: 'Ширина 901-1200мм, +%' },
    fire_dv55:          { val: 120,   label: 'Противопожарная EI60/EIS60 (только ДВ-55), +%' },
    razno_color_ral:    { val: 10,    label: 'Разноцвет RAL (мат/глянец), +%' },
    spon_diagonal:      { val: 20,    label: 'Шпон диагональ, +%' },
    spon_gorizont:      { val: 10,    label: 'Шпон горизонт, +%' },
    nonstandard_width:  { val: 3000,  label: 'Нестандарт ширина (до 900мм при h≤2400), доплата ₽' },
    individual:         { val: 50,    label: 'Индивидуальный тип, +%' },
    penal_nonstandard:  { val: 10000, label: 'Пенал — нестандарт высоты/ширины (доплата ₽)' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 6. MAGIC / LOFT — механизмы (доплата к базе ДВ-40)
  // ═══════════════════════════════════════════════════════════════════
  magic_mech: {
    archi:               { val: 33000, label: 'Механизм MAGIC ARCHI' },
    armadillo:           { val: 36000, label: 'Механизм MAGIC Armadillo' },
    magic2:              { val: 41000, label: 'Механизм MAGIC2 (1800мм)' },
    magic_1100:          { val: 36000, label: 'Механизм MAGIC 1100' },
  },
  loft: {
    base:                { val: 16400, label: 'Механизм LOFT базовый чёрный' },
    torc:                { val: 12100, label: 'Механизм LOFT торцевой чёрный' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 7. ДОПОПЦИИ (фиксированные цены)
  // ═══════════════════════════════════════════════════════════════════
  dop: {
    torc_zashelka:       { val: 1000,  label: 'Торцевая защёлка' },
    otboy:               { val: 6000,  label: 'Отбойная пластина 30×90см' },
    petly_agb:           { val: 3000,  label: 'Петля AGB (доп)' },
    petly_agb_six:       { val: 4000,  label: 'Петля AGB (6 шт.+)' },
    petly_dovod:         { val: 20500, label: 'Петля с доводчиком AGB' },
    invisible_dovod:     { val: 19900, label: 'Скрытый доводчик' },
    fire_protection:     { val: 6000,  label: 'Противопожарная пропитка (для ДВ-40 опция)' },
    shumka:              { val: 6000,  label: 'Звукоизоляция Rockwool' },
    lvl_napolneniye:     { val: 10000, label: 'LVL наполнение полотна' },
    stopor:              { val: 5000,  label: 'Скрытый стопор' },
    autoporog:           { val: 5500,  label: 'Автопорог 1100мм' },
    reshetka_white:      { val: 7000,  label: 'Вентрешётка белая/чёрная' },
    reshetka_ral:        { val: 11000, label: 'Вентрешётка RAL (7000+4000)' },
    laz_standart:        { val: 5000,  label: 'Лаз для питомца стандарт' },
    laz_cat:             { val: 10000, label: 'Лаз для кошки' },
    laz_vrez:            { val: 5000,  label: 'Врезка люка для лаза' },
    magic_zarez:         { val: 5000,  label: 'Зарез без механизма (Magic)' },
    tenevoy_one_side:    { val: 6000,  label: 'Эффект «Парящей двери» 1ст' },
    tenevoy_doble_side:  { val: 9000,  label: 'Эффект «Парящей двери» 2ст' },
    srez_width:          { val: 3000,  label: 'Срез по ширине' },
    emal_zerkalo_al:     { val: 9000,  label: 'Эмаль + зеркало + AL кромка' },
    frez_pod_dovod:      { val: 6000,  label: 'Фрезеровка под доводчик' },
    sync_system:         { val: 6000,  label: 'Синхронизация ДУО' },
    pokraska_torca_ral:  { val: 5000,  label: 'Покраска торца по RAL (за полотно)' },
    glass_ral:           { val: 10000, label: 'Зеркало/Стекло по RAL (за стекло)' },
    glanec_lak:          { val: 15000, label: 'Покрытие глянцевым лаком' },
    aktiv_stopor:        { val: 19900, label: 'Активный стопор с доводчиком DOORLOCK DL700' },
    elektro_replace:     { val: 12000, label: 'Замена комплекта фурнитуры на Kubica/AGB' },
    chasy_v_spon:        { val: 5000,  label: 'Часы в цвет шпона' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 8. ПЛИНТУС
  // ═══════════════════════════════════════════════════════════════════
  plintus_pm: {
    micro_mini:          { val: 680,   label: 'Микро-мини плинтус, ₽/п.м.' },
    micro_maxi:          { val: 850,   label: 'Микро-макси плинтус, ₽/п.м.' },
    tenevoy_3:           { val: 850,   label: 'Теневой 3м, ₽/п.м.' },
    skryty_cherny:       { val: 950,   label: 'Скрытый плинтус 105мм чёрный, ₽/п.м.' },
    skryty_mate_chrom:   { val: 850,   label: 'Скрытый плинтус 105мм мат.хром, ₽/п.м.' },
    teneovoy_reg:        { val: 600,   label: 'Регулируемый теневой плинтус, ₽/п.м.' },
    teneovoy_reg_painted:{ val: 850,   label: 'Регулируемый теневой плинтус (палка 3м), ₽/п.м.' },
  },
  plintus_tenevoy: {
    one_side:            { val: 6000,  label: 'Эффект «Парящей двери» (1 сторона)' },
    two_side:            { val: 9000,  label: 'Эффект «Парящей двери» (2 стороны)' },
    install_one_no_light:{ val: 17000, label: 'Регулируемый теневой плинтус с подгот. под подсветку (1ст)' },
    install_two_no_light:{ val: 22000, label: 'Регулируемый теневой плинтус с подгот. под подсветку (2ст)' },
    install_one_light:   { val: 20000, label: 'Регулируемый теневой плинтус с подсветкой (1ст)' },
    install_two_light:   { val: 25000, label: 'Регулируемый теневой плинтус с подсветкой (2ст)' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 9. ЗАМКИ И РУЧКИ
  // ═══════════════════════════════════════════════════════════════════
  lock: {
    standart:            { val: 0,     label: 'Штатный замок (входит в цену)' },
    fire:                { val: 5000,  label: 'Противопожарный замок' },
    antipanika:          { val: 7000,  label: 'Ручка антипаника (одностворчатая)' },
    antipanika_dvustvor: { val: 10000, label: 'Ручка антипаника (двустворка)' },
    rasporka:            { val: 3000,  label: 'Антипаника распорка' },
    touch:               { val: 3000,  label: 'AGB Touch (врезка)' },
    push_handle:         { val: 5000,  label: 'PUSH-ручка' },
    bonaiti:             { val: 4000,  label: 'Магнит Bonaiti' },
    skrytaya_wave:       { val: 27000, label: 'Скрытая ручка WAVE (фиксатор/цилиндр)' },
    skrytaya_wave_no:    { val: 20500, label: 'Скрытая ручка WAVE (без запирания)' },
    electro_atel:        { val: 6000,  label: 'Электромех. замок AT-EL800 (замок)' },
    electro_atel_vrez:   { val: 6000,  label: 'Электромех. замок AT-EL800 (врезка)' },
    skud:                { val: 6000,  label: 'СКУД замок (врезка)' },
    urban:               { val: 2000,  label: 'Врезка ручки купе URBAN' },
    change_lock_color:   { val: 2500,  label: 'Смена цвета замка/петель' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 10. AL КРОМКА (распашные двери, кроме ДВ-60 ПРЕМИУМ где включена)
  // ═══════════════════════════════════════════════════════════════════
  al_kromka: {
    chrome:              { val: 5000,  label: 'AL Хром мат' },
    cherny:              { val: 5000,  label: 'AL Чёрная' },
    shampan:             { val: 13000, label: 'AL Шампань' },
    ral:                 { val: 4000,  label: 'AL RAL' },
  },
  al_kromka_otkat: {
    chrome:              { val: 4000,  label: 'AL Хром (откатная)' },
    cherny:              { val: 5000,  label: 'AL Чёрная (откатная)' },
    shampan:             { val: 5000,  label: 'AL Шампань (откатная)' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 11. КОРОБ И КРОМКА — RAL/Black/Champagne
  // ═══════════════════════════════════════════════════════════════════
  korob_addons: {
    grunt_kromka_korob:  { val: 4000,  label: 'AL Короб ИЛИ кромка в Грунте (под покраску)' },
    grunt_kromka_plus_korob: { val: 6000,  label: 'AL Короб + кромка в Грунте' },
    ral_korob_only:      { val: 6000,  label: 'Короб по RAL' },
    ral_korob_kromka:    { val: 8000,  label: 'Короб + кромка по RAL' },
    ral_zoloto_korob:    { val: 8000,  label: 'Короб по RAL Цвет Золото' },
    ral_zoloto_kromka:   { val: 10000, label: 'Короб + кромка Цвет Золото' },
    gold_edition_korob:  { val: 9000,  label: 'Gold Edition matte (короб)' },
    gold_edition_full:   { val: 13000, label: 'Gold Edition matte (короб + кромка)' },
    black_edition:       { val: 5000,  label: 'Комплектация Black Edition (AL кромка чёрная, замок, петли)' },
    black_edition_no_al: { val: 3000,  label: 'Black Edition без AL кромки (торцы ПВХ, чёрные)' },
    ral_torec_addition:  { val: 2000,  label: 'Короб RAL — доплата если торец AL_RAL' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 12. RAL — лакобель/стекло/зеркало (доплаты к базе)
  // ═══════════════════════════════════════════════════════════════════
  ral_addons: {
    lacobel:             { val: 6000,  label: 'Стекло Lacobel — доплата к зеркалу за 1 сторону' },
    glass_ral:           { val: 14000, label: 'Стекло по RAL K7/NCS — доплата к зеркалу за 1 сторону' },
    zerk_color:          { val: 6000,  label: 'Зеркало графит/осветлённое/бронза/матовое — доплата за 1 сторону' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 13. ПАНЕЛИ (для отдельных стеновых панелей)
  // ═══════════════════════════════════════════════════════════════════
  panel: {
    egger:               { val: 10000, label: 'Панели EGGER (от 10000/сторона)' },
    hpl:                 { val: 7000,  label: 'Панели HPL (от 7000/сторона)' },
    profile_dec:         { val: 750,   label: 'Профиль для стеновых панелей, ₽/шт' },
    egger_wall:          { val: 12000, label: 'Панели EGGER на стену, ₽/м²' },
    spon_panel_8:        { val: 14000, label: 'Шпон-панель 8мм, ₽/м²' },
    spon_panel_10:       { val: 18000, label: 'Шпон-панель 10мм, ₽/м²' },
  },
  panel_polotno: {
    spon_t8_standart:    { val: 14000, label: 'Полотно-панель шпон стандарт, t=8' },
    spon_t8_lux:         { val: 17000, label: 'Полотно-панель шпон Lux, t=8' },
    spon_t8_lux_plus:    { val: 20000, label: 'Полотно-панель шпон Lux+, t=8' },
    spon_t10_standart:   { val: 18000, label: 'Полотно-панель шпон стандарт, t=10' },
    spon_t10_lux:        { val: 21000, label: 'Полотно-панель шпон Lux, t=10' },
    spon_t10_lux_plus:   { val: 24000, label: 'Полотно-панель шпон Lux+, t=10' },
    other:               { val: 12000, label: 'Полотно-панель прочее (по умолчанию)' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 14. ФУРНИТУРА — замена цвета
  // ═══════════════════════════════════════════════════════════════════
  furnitura_color: {
    standart:            { val: 4000,  label: 'Замена цвета фурнитуры (стандарт)' },
    gold_mate:           { val: 4500,  label: 'Замена цвета фурнитуры (gold mate)' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // 15. ДОП. ПЕТЛЯ (особая позиция в прайсе — отдельно для ДВ-55 и ДВ-60)
  // ═══════════════════════════════════════════════════════════════════
  dop_petlya: {
    dv55:                { val: 3000,  label: 'Доп. петля для ДВ-55 (хром/чёрная)' },
    dv60:                { val: 4000,  label: 'Доп. петля для ДВ-60 ПРЕМИУМ (хром/чёрная)' },
  },
};

// ═══════════════════════════════════════════════════════════════════════
// ЗАГРУЗКА И СОХРАНЕНИЕ
// ═══════════════════════════════════════════════════════════════════════

function clonePrices(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadPrices() {
  const prices = clonePrices(PRICES_DEFAULTS);
  try {
    const overrides = JSON.parse(localStorage.getItem(PRICES_KEY) || '{}');
    Object.keys(overrides).forEach(path => {
      const parts = path.split('.');
      if (parts.length !== 2) return;
      const [cat, key] = parts;
      if (prices[cat] && prices[cat][key]) {
        prices[cat][key].val = overrides[path];
      }
    });
  } catch(e) {
    console.warn('PRICES load error:', e);
  }
  return prices;
}

const PRICES = loadPrices();

function getPrice(path) {
  const parts = path.split('.');
  if (parts.length !== 2) return 0;
  const [cat, key] = parts;
  return (PRICES[cat] && PRICES[cat][key]) ? PRICES[cat][key].val : 0;
}

function savePriceOverride(path, value) {
  try {
    const overrides = JSON.parse(localStorage.getItem(PRICES_KEY) || '{}');
    overrides[path] = value;
    localStorage.setItem(PRICES_KEY, JSON.stringify(overrides));
    const parts = path.split('.');
    if (parts.length === 2 && PRICES[parts[0]] && PRICES[parts[0]][parts[1]]) {
      PRICES[parts[0]][parts[1]].val = value;
    }
    return true;
  } catch(e) {
    console.error('PRICES save error:', e);
    return false;
  }
}

function resetAllPrices() {
  localStorage.removeItem(PRICES_KEY);
}

// ═══════════════════════════════════════════════════════════════════════
// СИНХРОНИЗАЦИЯ МЕЖДУ ВКЛАДКАМИ
// Когда в одной вкладке (admin_prices.html) пользователь меняет цену,
// localStorage автоматически отправляет событие 'storage' во все остальные
// вкладки того же домена. Здесь мы это событие ловим и обновляем PRICES,
// чтобы изменения сразу применялись в открытом калькуляторе без перезагрузки.
// ═══════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  window.addEventListener('storage', function(e) {
    if (e.key === PRICES_KEY) {
      try {
        const overrides = e.newValue ? JSON.parse(e.newValue) : {};
        // Сначала сбрасываем все на дефолты
        Object.keys(PRICES).forEach(cat => {
          Object.keys(PRICES[cat]).forEach(key => {
            if (PRICES_DEFAULTS[cat] && PRICES_DEFAULTS[cat][key]) {
              PRICES[cat][key].val = PRICES_DEFAULTS[cat][key].val;
            }
          });
        });
        // Затем применяем актуальные overrides
        Object.keys(overrides).forEach(path => {
          const parts = path.split('.');
          if (parts.length === 2 && PRICES[parts[0]] && PRICES[parts[0]][parts[1]]) {
            PRICES[parts[0]][parts[1]].val = overrides[path];
          }
        });
        console.log('[PRICES] Обновлены цены из админки');
        // Если есть функция пересчёта — вызываем её
        if (typeof calculate === 'function') {
          try { calculate(); } catch(err){}
        }
      } catch(err) {
        console.error('PRICES sync error:', err);
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// УТИЛИТЫ ДЛЯ КАЛЬКУЛЯТОРА
// ═══════════════════════════════════════════════════════════════════════

// Определяет диапазон высоты для ДВ-55 / ДВ-60 (6 диапазонов)
function getHeightRange(heightMm) {
  const h = parseInt(heightMm, 10);
  if (h <= 2000) return 'h2000';
  if (h <= 2199) return 'h2199';
  if (h <= 2300) return 'h2300';
  if (h <= 2400) return 'h2400';
  if (h <= 2700) return 'h2700';
  return 'h3000';
}

// Особый диапазон для ДВ-40 (только 4 диапазона: h2000/h2100/h2400/h3000)
function getDV40HeightRange(heightMm) {
  const h = parseInt(heightMm, 10);
  if (h <= 2000) return 'h2000';
  if (h <= 2100) return 'h2100';
  if (h <= 2400) return 'h2400';
  return 'h3000';
}

// Возвращает диапазон высоты для пенала: h2100/h2300/h2400/h2700/h3000
function getPenalHeightRange(heightMm) {
  const h = parseInt(heightMm, 10);
  if (h <= 2100) return 'h2100';
  if (h <= 2300) return 'h2300';
  if (h <= 2400) return 'h2400';
  if (h <= 2700) return 'h2700';
  return 'h3000';
}

// Возвращает диапазон ширины пенала: w900 (≤900) / w1000 / w1200
function getPenalWidthRange(widthMm) {
  const w = parseInt(widthMm, 10);
  if (w <= 900) return 'w900';
  if (w <= 1000) return 'w1000';
  return 'w1200';
}

// Главная функция: получить цену двери по типу/высоте/покрытию
// type: 'dv40' | 'dv55' | 'dv60' (premium)
// heightMm: число
// covering: ключ из COVERINGS (например 'pod_pokras', 'ral_glanec', ...)
function getDoorPrice(type, heightMm, covering) {
  const tableKey = 'doors_' + type;
  const table = PRICES[tableKey];
  if (!table) {
    console.warn('Прайс не найден:', tableKey);
    return 0;
  }
  // ДВ-40 имеет другой набор диапазонов высоты (4 вместо 6)
  const hRange = (type === 'dv40') ? getDV40HeightRange(heightMm) : getHeightRange(heightMm);
  const cellKey = hRange + '_' + covering;
  const cell = table[cellKey];
  if (!cell) {
    console.warn('Цена не найдена:', tableKey + '.' + cellKey);
    return 0;
  }
  return cell.val;
}

// Получить цену пенала по системе/высоте/ширине
// system: 'uno' | 'duo'
function getPenalPrice(system, heightMm, widthMm) {
  const tableKey = 'penal_' + system;
  const table = PRICES[tableKey];
  if (!table) return 0;
  const hRange = getPenalHeightRange(heightMm);
  const wRange = getPenalWidthRange(widthMm);
  const cellKey = hRange + '_' + wRange;
  const cell = table[cellKey];
  return cell ? cell.val : 0;
}
