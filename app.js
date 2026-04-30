// =============================================================
// Склад — простое приложение в стиле 1С
// Справочники: Склады, Товары, Поставщики
// Документ:    Поступление товаров (закупка)
// Регистр:     Остатки на складах (вычисляется по документам)
// Хранилище:   localStorage
// =============================================================

const STORAGE_KEY = 'mc-warehouse-v1';

const state = {
    warehouses: [],
    products: [],
    productGroups: [],
    suppliers: [],
    supplierOrders: [],
    supplierInvoices: [],
    purchases: [],
    stockIns: [],       // оприходования
    writeOffs: [],      // списания
    transfers: [],      // перемещения
    inventories: [],    // инвентаризации
    currentView: 'warehouses',
    suppliersTab: 'list',
    purchasingTab: 'suppliers',
    warehouseDetailId: null,
    warehouseFilter: '', // suppliers | orders | receipts
    productsTab: 'list', // list | stockIns | writeOffs | transfers | inventories
    stockDocsTab: 'stockIns',
    productsUI: {
        groupId: null,        // выбранная группа в дереве (null = все)
        filterOpen: false,
        showType: 'all',      // all | товар | услуга | комплект
        filters: {
            name: '', sku: '', code: '', barcode: '', description: '', supplierId: '',
        },
        selected: new Set(),
        expanded: new Set(),  // id развернутых групп
    },
};

// ---------- Storage ----------
function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        state.warehouses = data.warehouses || [];
        state.products = data.products || [];
        state.productGroups = data.productGroups || [];
        state.suppliers = data.suppliers || [];
        state.supplierOrders = data.supplierOrders || [];
        state.supplierInvoices = data.supplierInvoices || [];
        state.purchases = data.purchases || [];
        state.stockIns = data.stockIns || [];
        state.writeOffs = data.writeOffs || [];
        state.transfers = data.transfers || [];
        state.inventories = data.inventories || [];
        // Миграция: дополним отсутствующие поля у старых товаров
        state.products.forEach(p => {
            if (!p.type) p.type = 'товар';
            if (p.code == null) p.code = '';
            if (p.barcode == null) p.barcode = '';
            if (p.priceSale == null) p.priceSale = 0;
            if (p.groupId === undefined) p.groupId = null;
            if (p.description == null) p.description = '';
            if (p.supplierId == null) p.supplierId = '';
        });
        // Миграция: дополним поля у старых поступлений и заказов
        state.purchases.forEach(d => {
            if (d.organization == null) d.organization = '';
            if (d.orderId == null) d.orderId = '';
        });
        state.supplierOrders.forEach(o => {
            if (!Array.isArray(o.items)) o.items = [];
        });
        state.supplierInvoices.forEach(inv => {
            if (!Array.isArray(inv.items)) inv.items = [];
            if (inv.organization == null) inv.organization = '';
            if (inv.orderId == null) inv.orderId = '';
            if (inv.dueDate == null) inv.dueDate = '';
            if (inv.paidAmount == null) inv.paidAmount = 0;
            if (inv.amount == null) inv.amount = 0;
            if (inv.status == null) inv.status = 'Новый';
            if (inv.comment == null) inv.comment = '';
        });
        // Миграция старых оприходований к расширенной схеме
        state.stockIns.forEach(d => {
            if (d.source == null) d.source = d.reason || 'Без основания';
            if (d.supplierId == null) d.supplierId = '';
            if (d.basisType == null) d.basisType = 'Без документа';
            if (d.basisNumber == null) d.basisNumber = '';
            if (d.basisDate == null) d.basisDate = '';
            if (d.responsible == null) d.responsible = '';
            if (d.qtyChecked == null) d.qtyChecked = d.status === 'done';
            if (d.qualityChecked == null) d.qualityChecked = d.status === 'done';
            if (d.hasDiscrepancy == null) d.hasDiscrepancy = false;
            if (d.discrepancyText == null) d.discrepancyText = '';
            if (d.actNumber == null) d.actNumber = '';
        });
    } catch (e) {
        console.error('Не удалось загрузить данные', e);
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        warehouses: state.warehouses,
        products: state.products,
        productGroups: state.productGroups,
        suppliers: state.suppliers,
        supplierOrders: state.supplierOrders,
        supplierInvoices: state.supplierInvoices,
        purchases: state.purchases,
        stockIns: state.stockIns,
        writeOffs: state.writeOffs,
        transfers: state.transfers,
        inventories: state.inventories,
    }));
}

function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------- Formatting ----------
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
const fmtQty = (n) => (Number(n) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('ru-RU');
};
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---------- Lookups ----------
const findWarehouse = (id) => state.warehouses.find(w => w.id === id);
const findProduct = (id) => state.products.find(p => p.id === id);
const findSupplier = (id) => state.suppliers.find(s => s.id === id);
const findGroup = (id) => state.productGroups.find(g => g.id === id);

function getGroupChildrenIds(rootId) {
    const ids = new Set([rootId]);
    let added = true;
    while (added) {
        added = false;
        for (const g of state.productGroups) {
            if (g.parentId && ids.has(g.parentId) && !ids.has(g.id)) {
                ids.add(g.id);
                added = true;
            }
        }
    }
    return ids;
}

function nextProductCode() {
    const nums = state.products
        .map(p => parseInt((p.code || '').replace(/\D/g, ''), 10))
        .filter(n => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return String(next).padStart(8, '0');
}

// ---------- Stock register (computed) ----------
function computeStock() {
    const map = new Map();
    const apply = (whId, productId, dQty, dValue) => {
        const key = `${whId}|${productId}`;
        const prev = map.get(key) || { warehouseId: whId, productId, qty: 0, value: 0 };
        prev.qty += dQty;
        prev.value += dValue;
        map.set(key, prev);
    };
    // + Приёмки (purchases)
    for (const d of state.purchases) {
        for (const it of (d.items || [])) {
            apply(d.warehouseId, it.productId, +Number(it.qty)||0, (+Number(it.qty)||0) * (+Number(it.price)||0));
        }
    }
    // + Оприходования (в остатки попадают только проведённые: done, discrepancy)
    for (const d of state.stockIns) {
        if (d.status !== 'done' && d.status !== 'discrepancy') continue;
        for (const it of (d.items || [])) {
            apply(d.warehouseId, it.productId, +Number(it.qty)||0, (+Number(it.qty)||0) * (+Number(it.price)||0));
        }
    }
    // − Списания
    for (const d of state.writeOffs) {
        if (d.status === 'draft') continue;
        for (const it of (d.items || [])) {
            apply(d.warehouseId, it.productId, -(Number(it.qty)||0), -((+Number(it.qty)||0) * (+Number(it.price)||0)));
        }
    }
    // ± Перемещения
    for (const d of state.transfers) {
        if (d.status === 'draft') continue;
        for (const it of (d.items || [])) {
            const v = (Number(it.qty)||0) * (Number(it.price)||0);
            apply(d.fromWarehouseId, it.productId, -(Number(it.qty)||0), -v);
            apply(d.toWarehouseId,   it.productId, +(Number(it.qty)||0), +v);
        }
    }
    // ± Инвентаризации (только проведённые)
    for (const d of state.inventories) {
        if (d.status !== 'done') continue;
        for (const it of (d.items || [])) {
            const diff = (Number(it.actualQty)||0) - (Number(it.expectedQty)||0);
            if (diff !== 0) apply(d.warehouseId, it.productId, diff, diff * (Number(it.price)||0));
        }
    }
    return Array.from(map.values());
}

// =============================================================
// Routing / view switching
// =============================================================
const views = {
    warehouses: renderWarehouses,
    products: renderProducts,
    purchasing: renderPurchasing,
    purchases: renderPurchases,
    stock: renderStock,
    turnover: renderTurnover,
    settings: renderSettings,
};

function setView(name) {
    state.currentView = name;
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.view === name);
    });
    const fn = views[name];
    if (fn) fn();
}

// =============================================================
// Helpers for rendering
// =============================================================
function setTitle(title, actionsHtml = '') {
    document.getElementById('view-title').textContent = title;
    document.getElementById('view-actions').innerHTML = actionsHtml;
}

function renderEmptyState({ icon, title, hint }) {
    return `
        <div class="empty-state">
            <div class="empty-state-icon">${icon}</div>
            <div class="empty-state-title">${title}</div>
            <div class="empty-state-hint">${hint}</div>
        </div>
    `;
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =============================================================
// Toast
// =============================================================
let toastTimer = null;
function toast(message, type = '') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2200);
}

// =============================================================
// Modal
// =============================================================
function openModal({ title, body, footer, large = false }) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer || '';
    document.getElementById('modal').classList.toggle('modal-large', large);
    document.getElementById('modal-backdrop').classList.add('open');
}
function closeModal() {
    document.getElementById('modal-backdrop').classList.remove('open');
}
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
});

// Вторая модалка (для вложенных диалогов поверх редактора документа)
function openModal2({ title, body, footer, large = false }) {
    document.getElementById('modal-title-2').textContent = title;
    document.getElementById('modal-body-2').innerHTML = body;
    document.getElementById('modal-footer-2').innerHTML = footer || '';
    document.getElementById('modal-2').classList.toggle('modal-large', large);
    document.getElementById('modal-backdrop-2').classList.add('open');
}
function closeModal2() {
    document.getElementById('modal-backdrop-2').classList.remove('open');
}
document.getElementById('modal-close-2').addEventListener('click', closeModal2);
document.getElementById('modal-backdrop-2').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop-2') closeModal2();
});

// =============================================================
// CRUD helpers (generic)
// =============================================================
function confirmDelete(name, onYes) {
    openModal({
        title: 'Удалить запись',
        body: `<p>Вы действительно хотите удалить «<strong>${escapeHtml(name)}</strong>»? Это действие нельзя отменить.</p>`,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-danger" id="modal-confirm">Удалить</button>
        `,
    });
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-confirm').onclick = () => { onYes(); closeModal(); };
}

// =============================================================
// View: Склады
// =============================================================
function renderWarehouses() {
    if (state.warehouseDetailId) {
        const wh = findWarehouse(state.warehouseDetailId);
        if (!wh) { state.warehouseDetailId = null; renderWarehouses(); return; }
        renderWarehouseDetail(wh);
        return;
    }

    setTitle('Склады', `<button class="btn btn-primary" id="add-warehouse">+ Новый склад</button>`);
    document.getElementById('add-warehouse').onclick = () => editWarehouse(null);

    const list = state.warehouses;
    const stock = computeStock();
    const aggByWh = stock.reduce((acc, s) => {
        const a = acc[s.warehouseId] || { qty: 0, value: 0, positions: 0 };
        a.qty += s.qty;
        a.value += s.value;
        if (s.qty !== 0) a.positions += 1;
        acc[s.warehouseId] = a;
        return acc;
    }, {});

    const content = document.getElementById('content');
    if (list.length === 0) {
        content.innerHTML = `<div class="card">${renderEmptyState({
            icon: '🏭',
            title: 'Складов пока нет',
            hint: 'Добавьте первый склад, чтобы начать вести учёт.',
        })}</div>`;
        return;
    }

    content.innerHTML = `
        <div class="card">
            <div class="table-toolbar">
                <input class="search-input" id="search" placeholder="Поиск по названию или адресу...">
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Наименование</th>
                        <th>Адрес</th>
                        <th>Ответственный</th>
                        <th class="col-num">Позиций</th>
                        <th class="col-num">Кол-во</th>
                        <th class="col-num">Стоимость</th>
                        <th class="col-actions">Действия</th>
                    </tr>
                </thead>
                <tbody id="rows">
                    ${list.map(w => {
                        const agg = aggByWh[w.id] || { qty: 0, value: 0, positions: 0 };
                        return `
                            <tr data-id="${w.id}">
                                <td><a href="#" class="link-name" data-act="open">${escapeHtml(w.name)}</a></td>
                                <td>${escapeHtml(w.address || '—')}</td>
                                <td>${escapeHtml(w.responsible || '—')}</td>
                                <td class="col-num">${agg.positions}</td>
                                <td class="col-num">${fmtQty(agg.qty)}</td>
                                <td class="col-num">${fmtMoney(agg.value)}</td>
                                <td class="col-actions">
                                    <button class="btn btn-small" data-act="open">Заполнение</button>
                                    <button class="btn btn-small" data-act="edit">Изменить</button>
                                    <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('search').oninput = (e) => filterRows(e.target.value);
    document.getElementById('rows').onclick = (e) => {
        const link = e.target.closest('a[data-act]');
        const btn = e.target.closest('button[data-act]');
        const target = link || btn;
        if (!target) return;
        if (link) e.preventDefault();
        const tr = target.closest('tr');
        const id = tr.dataset.id;
        const wh = findWarehouse(id);
        const act = target.dataset.act;
        if (act === 'open') { state.warehouseDetailId = id; state.warehouseFilter = ''; renderWarehouses(); }
        if (act === 'edit') editWarehouse(wh);
        if (act === 'del')  confirmDelete(wh.name, () => deleteWarehouse(id));
    };
}

function renderWarehouseDetail(wh) {
    setTitle(`Склад: ${wh.name}`, `
        <button class="btn btn-small" id="wh-back">← К списку складов</button>
        <button class="btn btn-small" id="wh-edit">Изменить склад</button>
    `);
    document.getElementById('wh-back').onclick = () => { state.warehouseDetailId = null; renderWarehouses(); };
    document.getElementById('wh-edit').onclick = () => editWarehouse(wh);

    const stock = computeStock().filter(s => s.warehouseId === wh.id);
    const positions = stock.filter(s => s.qty !== 0).length;
    const totalQty = stock.reduce((s, r) => s + r.qty, 0);
    const totalValue = stock.reduce((s, r) => s + r.value, 0);

    // Документы движения по этому складу
    const docsHere = [
        ...state.purchases.filter(d => d.warehouseId === wh.id).map(d => ({ kind: 'Приёмка', n: d.number, date: d.date, items: d.items })),
        ...state.stockIns.filter(d => d.warehouseId === wh.id && (d.status === 'done' || d.status === 'discrepancy')).map(d => ({ kind: 'Оприходование', n: d.number, date: d.date, items: d.items })),
        ...state.writeOffs.filter(d => d.warehouseId === wh.id && d.status !== 'draft').map(d => ({ kind: 'Списание', n: d.number, date: d.date, items: d.items })),
        ...state.transfers.filter(d => (d.fromWarehouseId === wh.id || d.toWarehouseId === wh.id) && d.status !== 'draft').map(d => ({ kind: d.fromWarehouseId === wh.id ? 'Перемещение (со)' : 'Перемещение (на)', n: d.number, date: d.date, items: d.items })),
    ].sort((a,b) => (b.date||'').localeCompare(a.date||''));

    const content = document.getElementById('content');
    const f = (state.warehouseFilter || '').toLowerCase();
    const rows = stock
        .filter(s => {
            if (!f) return true;
            const p = findProduct(s.productId);
            const hay = ((p?.name||'') + ' ' + (p?.sku||'') + ' ' + (p?.code||'') + ' ' + (p?.barcode||'')).toLowerCase();
            return hay.includes(f);
        })
        .sort((a,b) => {
            const pa = findProduct(a.productId), pb = findProduct(b.productId);
            return (pa?.name||'').localeCompare(pb?.name||'', 'ru');
        });

    content.innerHTML = `
        <div class="doc-meta">
            <div><div class="label">Адрес</div><div class="value">${escapeHtml(wh.address || '—')}</div></div>
            <div><div class="label">Ответственный</div><div class="value">${escapeHtml(wh.responsible || '—')}</div></div>
            <div><div class="label">Позиций</div><div class="value">${positions}</div></div>
        </div>
        <div class="summary-row">
            <div class="summary-card"><div class="summary-label">Позиций с остатком</div><div class="summary-value">${positions}</div></div>
            <div class="summary-card"><div class="summary-label">Суммарное кол-во</div><div class="summary-value">${fmtQty(totalQty)}</div></div>
            <div class="summary-card"><div class="summary-label">Стоимость остатков</div><div class="summary-value">${fmtMoney(totalValue)}</div></div>
            <div class="summary-card"><div class="summary-label">Документов по складу</div><div class="summary-value">${docsHere.length}</div></div>
        </div>
        <div class="card">
            <div class="table-toolbar">
                <input class="search-input" id="wh-search" placeholder="Поиск по товару, артикулу, коду или штрихкоду..." value="${escapeHtml(state.warehouseFilter)}">
                <span style="color:var(--text-muted);font-size:13px;margin-left:auto">Найдено: <strong>${rows.length}</strong> из ${stock.length}</span>
            </div>
            <div class="table-scroll">
            <table>
                <thead><tr>
                    <th>Товар</th>
                    <th>Артикул</th>
                    <th>Код</th>
                    <th>Группа</th>
                    <th>Ед.</th>
                    <th class="col-num">Кол-во</th>
                    <th class="col-num">Сред. цена</th>
                    <th class="col-num">Сумма</th>
                </tr></thead>
                <tbody>${rows.length === 0
                    ? `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:30px">${stock.length === 0 ? 'Склад пуст. Создайте приёмку или оприходование.' : 'Ничего не найдено по фильтру'}</td></tr>`
                    : rows.map(r => {
                        const p = findProduct(r.productId);
                        const avg = r.qty ? r.value / r.qty : 0;
                        const grp = p?.groupId ? (findGroup(p.groupId) || {}).name : '';
                        return `
                            <tr>
                                <td><strong>${escapeHtml(p?p.name:'— удалён —')}</strong></td>
                                <td>${escapeHtml(p?(p.sku||''):'—')}</td>
                                <td style="font-variant-numeric:tabular-nums">${escapeHtml(p?(p.code||''):'')}</td>
                                <td>${escapeHtml(grp || '—')}</td>
                                <td>${escapeHtml(p?p.unit:'')}</td>
                                <td class="col-num"><strong>${fmtQty(r.qty)}</strong></td>
                                <td class="col-num">${fmtMoney(avg)}</td>
                                <td class="col-num">${fmtMoney(r.value)}</td>
                            </tr>
                        `;
                    }).join('')
                }</tbody>
            </table>
            </div>
        </div>

        ${docsHere.length > 0 ? `
            <h3 style="margin:24px 0 12px;font-size:15px">Последние документы по складу</h3>
            <div class="card">
                <table>
                    <thead><tr><th>Тип</th><th>№</th><th>Дата</th><th class="col-num">Позиций</th></tr></thead>
                    <tbody>${docsHere.slice(0, 15).map(d => `
                        <tr>
                            <td>${escapeHtml(d.kind)}</td>
                            <td><strong>${escapeHtml(d.n||'')}</strong></td>
                            <td>${fmtDate(d.date)}</td>
                            <td class="col-num">${(d.items||[]).length}</td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            </div>
        ` : ''}
    `;

    document.getElementById('wh-search').oninput = (e) => {
        state.warehouseFilter = e.target.value;
        renderWarehouseDetail(wh);
    };
}

function editWarehouse(wh) {
    const isNew = !wh;
    const data = wh || { name: '', address: '', responsible: '' };
    openModal({
        title: isNew ? 'Новый склад' : 'Редактирование склада',
        body: `
            <div class="form-grid">
                <div class="field span-2">
                    <label>Наименование *</label>
                    <input id="f-name" value="${escapeHtml(data.name)}" autofocus>
                    <div class="field-error" id="err-name"></div>
                </div>
                <div class="field span-2">
                    <label>Адрес</label>
                    <input id="f-address" value="${escapeHtml(data.address || '')}">
                </div>
                <div class="field span-2">
                    <label>Ответственный</label>
                    <input id="f-responsible" value="${escapeHtml(data.responsible || '')}">
                </div>
            </div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-save">Сохранить</button>
        `,
    });
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
        const name = document.getElementById('f-name').value.trim();
        if (!name) {
            document.getElementById('err-name').textContent = 'Укажите наименование';
            return;
        }
        const payload = {
            name,
            address: document.getElementById('f-address').value.trim(),
            responsible: document.getElementById('f-responsible').value.trim(),
        };
        if (isNew) {
            state.warehouses.push({ id: uid('wh'), ...payload });
            toast('Склад создан', 'success');
        } else {
            Object.assign(wh, payload);
            toast('Склад сохранён', 'success');
        }
        saveState();
        closeModal();
        renderWarehouses();
    };
}

function deleteWarehouse(id) {
    const usedIn = state.purchases.find(p => p.warehouseId === id);
    if (usedIn) {
        toast('Склад используется в поступлениях, удалить нельзя', 'error');
        return;
    }
    state.warehouses = state.warehouses.filter(w => w.id !== id);
    saveState();
    toast('Склад удалён');
    renderWarehouses();
}

// =============================================================
// View: Товары
// =============================================================
function renderProducts() {
    const tab = state.productsTab;
    const stockTitles = {
        list:        'Товары и услуги',
        stockIns:    'Оприходования',
        writeOffs:   'Списания',
        transfers:   'Перемещения',
        inventories: 'Инвентаризации',
    };
    const tabs = [
        { key: 'list',        label: '📦 Товары и услуги' },
        { key: 'stockIns',    label: '➕ Оприходования' },
        { key: 'writeOffs',   label: '🗑️ Списания' },
        { key: 'transfers',   label: '🔁 Перемещения' },
        { key: 'inventories', label: '🧾 Инвентаризации' },
    ];

    if (tab !== 'list') {
        // Документы склада — рендерим внутри раздела «Товары»
        let actions = '';
        if (tab === 'stockIns')    actions = `<button class="btn btn-primary" id="add-stock-doc">+ Оприходование</button>`;
        if (tab === 'writeOffs')   actions = `<button class="btn btn-primary" id="add-stock-doc">+ Списание</button>`;
        if (tab === 'transfers')   actions = `<button class="btn btn-primary" id="add-stock-doc">+ Перемещение</button>`;
        if (tab === 'inventories') actions = `<button class="btn btn-primary" id="add-stock-doc">+ Инвентаризация</button>`;
        setTitle(stockTitles[tab], actions);

        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="tabs-row">
                ${tabs.map(t => `<button class="tab-btn ${tab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
            </div>
            <div id="stock-docs-body"></div>
        `;
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.onclick = () => { state.productsTab = b.dataset.tab; renderProducts(); };
        });
        document.getElementById('add-stock-doc').onclick = () => {
            if (tab === 'stockIns')    editStockIn(null);
            if (tab === 'writeOffs')   editWriteOff(null);
            if (tab === 'transfers')   editTransfer(null);
            if (tab === 'inventories') editInventory(null);
        };
        if (tab === 'stockIns')    renderStockInsList();
        if (tab === 'writeOffs')   renderWriteOffsList();
        if (tab === 'transfers')   renderTransfersList();
        if (tab === 'inventories') renderInventoriesList();
        return;
    }

    // tab === 'list' — обычный список товаров с деревом групп
    const ui = state.productsUI;

    setTitle('Товары и услуги', `
        <button class="btn btn-primary btn-small" data-add-type="товар">+ Товар</button>
        <button class="btn btn-primary btn-small" data-add-type="услуга">+ Услуга</button>
        <button class="btn btn-primary btn-small" data-add-type="комплект">+ Комплект</button>
        <button class="btn btn-small" id="add-group">+ Группа</button>
        <button class="btn btn-small ${ui.filterOpen ? 'btn-primary' : ''}" id="toggle-filter">Фильтр</button>
        <input class="search-input" id="quick-search" placeholder="Наименование, код или артикул" style="width:260px" value="${escapeHtml(ui.filters.name)}">
    `);

    document.querySelectorAll('[data-add-type]').forEach(btn => {
        btn.onclick = () => editProduct(null, btn.dataset.addType);
    });
    document.getElementById('add-group').onclick = () => editProductGroup(null);
    document.getElementById('toggle-filter').onclick = () => {
        ui.filterOpen = !ui.filterOpen;
        renderProducts();
    };
    document.getElementById('quick-search').oninput = (e) => {
        ui.filters.name = e.target.value;
        renderProductsBody();
    };

    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="tabs-row">
            ${tabs.map(t => `<button class="tab-btn ${tab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
        </div>
        ${ui.filterOpen ? renderProductsFilter() : ''}
        <div class="products-layout">
            <aside class="groups-tree card" id="groups-tree"></aside>
            <div class="products-table-wrap" id="products-body"></div>
        </div>
    `;

    document.querySelectorAll('.tabs-row .tab-btn').forEach(b => {
        b.onclick = () => { state.productsTab = b.dataset.tab; renderProducts(); };
    });

    if (ui.filterOpen) wireProductsFilter();
    renderGroupsTree();
    renderProductsBody();
}

function renderProductsFilter() {
    const f = state.productsUI.filters;
    const supplierOpts = `<option value="">Все</option>` +
        state.suppliers.map(s => `<option value="${s.id}" ${s.id === f.supplierId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    return `
        <div class="filter-panel card">
            <div class="filter-grid">
                <div class="field"><label>Наименование</label><input data-f="name" value="${escapeHtml(f.name)}"></div>
                <div class="field"><label>Описание</label><input data-f="description" value="${escapeHtml(f.description)}"></div>
                <div class="field"><label>Артикул</label><input data-f="sku" value="${escapeHtml(f.sku)}"></div>
                <div class="field"><label>Код</label><input data-f="code" value="${escapeHtml(f.code)}"></div>
                <div class="field"><label>Штрихкод</label><input data-f="barcode" value="${escapeHtml(f.barcode)}"></div>
                <div class="field"><label>Поставщик</label><select data-f="supplierId">${supplierOpts}</select></div>
            </div>
            <div class="filter-actions">
                <button class="btn btn-primary btn-small" id="filter-apply">Найти</button>
                <button class="btn btn-small" id="filter-clear">Очистить</button>
            </div>
        </div>
    `;
}

function wireProductsFilter() {
    const f = state.productsUI.filters;
    document.querySelectorAll('.filter-panel [data-f]').forEach(el => {
        el.oninput = (e) => { f[el.dataset.f] = e.target.value; };
    });
    document.getElementById('filter-apply').onclick = () => renderProductsBody();
    document.getElementById('filter-clear').onclick = () => {
        Object.keys(f).forEach(k => f[k] = '');
        renderProducts();
    };
}

function renderGroupsTree() {
    const ui = state.productsUI;
    const root = document.getElementById('groups-tree');
    const groups = state.productGroups;

    const countByGroup = (gid) => {
        const ids = gid ? getGroupChildrenIds(gid) : null;
        return state.products.filter(p => !ids || ids.has(p.groupId)).length;
    };
    const hasChildren = (gid) => groups.some(g => g.parentId === gid);

    const renderNode = (parentId, depth) => {
        const children = groups.filter(g => (g.parentId || null) === parentId)
            .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        return children.map(g => {
            const expanded = ui.expanded.has(g.id);
            const hasKids = hasChildren(g.id);
            return `
                <div class="tree-item ${ui.groupId === g.id ? 'active' : ''}"
                     data-gid="${g.id}" style="padding-left:${8 + depth * 16}px">
                    <span class="tree-caret ${hasKids ? 'has-kids' : ''} ${expanded ? 'open' : ''}">${hasKids ? '▸' : '·'}</span>
                    <span class="tree-icon">${hasKids ? (expanded ? '📂' : '📁') : '📁'}</span>
                    <span class="tree-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span>
                    <span class="tree-count">${countByGroup(g.id)}</span>
                    <span class="tree-actions">
                        <button class="btn btn-icon btn-small" data-tree-act="add-sub" title="Создать подгруппу">+</button>
                        <button class="btn btn-icon btn-small" data-tree-act="edit" title="Переименовать">✎</button>
                        <button class="btn btn-icon btn-small btn-danger" data-tree-act="del" title="Удалить">×</button>
                    </span>
                </div>
                ${expanded && hasKids ? renderNode(g.id, depth + 1) : ''}
            `;
        }).join('');
    };

    root.innerHTML = `
        <div class="tree-header">
            <span>Товары и услуги</span>
            <button class="btn btn-icon btn-small" id="tree-add-root" title="Создать группу в корне">+</button>
        </div>
        <div class="tree-item root ${ui.groupId === null ? 'active' : ''}" data-gid="">
            <span class="tree-caret"></span>
            <span class="tree-icon">📦</span>
            <span class="tree-name"><strong>Все</strong></span>
            <span class="tree-count">${countByGroup(null)}</span>
        </div>
        ${renderNode(null, 0)}
        ${groups.length === 0 ? `<div class="tree-empty">Нет групп. Нажмите «+» сверху, чтобы создать первую.</div>` : ''}
    `;

    document.getElementById('tree-add-root').onclick = (e) => {
        e.stopPropagation();
        editProductGroup(null, null);
    };

    root.onclick = (e) => {
        const actBtn = e.target.closest('[data-tree-act]');
        const item = e.target.closest('.tree-item');
        if (!item) return;
        const gid = item.dataset.gid || null;

        if (actBtn) {
            e.stopPropagation();
            const act = actBtn.dataset.treeAct;
            const g = findGroup(gid);
            if (act === 'add-sub') { ui.expanded.add(gid); editProductGroup(null, gid); return; }
            if (act === 'edit')    { editProductGroup(g); return; }
            if (act === 'del')     { confirmDelete(g.name, () => deleteProductGroup(gid)); return; }
        }

        state.productsUI.groupId = gid;
        if (gid && groups.some(g => g.parentId === gid)) {
            if (ui.expanded.has(gid)) ui.expanded.delete(gid);
            else ui.expanded.add(gid);
        }
        renderGroupsTree();
        renderProductsBody();
    };

    root.ondblclick = (e) => {
        const item = e.target.closest('.tree-item');
        if (!item || !item.dataset.gid) return;
        const g = findGroup(item.dataset.gid);
        if (g) editProductGroup(g);
    };
}

function applyProductFilters(list) {
    const ui = state.productsUI;
    const f = ui.filters;
    const groupIds = ui.groupId ? getGroupChildrenIds(ui.groupId) : null;
    const q = (s) => (s || '').toLowerCase();
    return list.filter(p => {
        if (groupIds && !groupIds.has(p.groupId)) return false;
        if (ui.showType !== 'all' && p.type !== ui.showType) return false;
        if (f.name) {
            const hay = q(p.name) + ' ' + q(p.code) + ' ' + q(p.sku);
            if (!hay.includes(q(f.name))) return false;
        }
        if (f.sku && !q(p.sku).includes(q(f.sku))) return false;
        if (f.code && !q(p.code).includes(q(f.code))) return false;
        if (f.barcode && !q(p.barcode).includes(q(f.barcode))) return false;
        if (f.description && !q(p.description).includes(q(f.description))) return false;
        if (f.supplierId && p.supplierId !== f.supplierId) return false;
        return true;
    });
}

function renderProductsBody() {
    const ui = state.productsUI;
    const wrap = document.getElementById('products-body');
    const stock = computeStock();
    const totalsByProduct = stock.reduce((acc, s) => {
        acc[s.productId] = (acc[s.productId] || 0) + s.qty;
        return acc;
    }, {});

    const filtered = applyProductFilters(state.products);

    if (state.products.length === 0) {
        wrap.innerHTML = `<div class="card">${renderEmptyState({
            icon: '📦',
            title: 'Товаров пока нет',
            hint: 'Нажмите «+ Товар» сверху, чтобы добавить позицию в номенклатуру.',
        })}</div>`;
        return;
    }

    wrap.innerHTML = `
        <div class="card">
            <div class="table-toolbar">
                <span style="color:var(--text-muted);font-size:13px">
                    Найдено: <strong>${filtered.length}</strong> из ${state.products.length}
                </span>
                <div style="margin-left:auto;display:flex;gap:6px">
                    <button class="btn btn-small ${ui.showType === 'all' ? 'btn-primary' : ''}" data-show="all">Все</button>
                    <button class="btn btn-small ${ui.showType === 'товар' ? 'btn-primary' : ''}" data-show="товар">Товары</button>
                    <button class="btn btn-small ${ui.showType === 'услуга' ? 'btn-primary' : ''}" data-show="услуга">Услуги</button>
                    <button class="btn btn-small ${ui.showType === 'комплект' ? 'btn-primary' : ''}" data-show="комплект">Комплекты</button>
                </div>
            </div>
            <div class="table-scroll">
            <table class="products-table">
                <thead>
                    <tr>
                        <th style="width:34px"><input type="checkbox" id="check-all"></th>
                        <th style="width:90px">Тип</th>
                        <th>Наименование</th>
                        <th style="width:120px">Код</th>
                        <th style="width:140px">Артикул</th>
                        <th style="width:80px">Ед. изм.</th>
                        <th class="col-num" style="width:130px">Цена закупки</th>
                        <th class="col-num" style="width:130px">Цена продажи</th>
                        <th class="col-num" style="width:110px">Остаток</th>
                        <th class="col-actions" style="width:160px">Действия</th>
                    </tr>
                </thead>
                <tbody id="rows">
                    ${filtered.length === 0 ? `
                        <tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:30px">Ничего не найдено по текущим фильтрам</td></tr>
                    ` : filtered.map(p => `
                        <tr data-id="${p.id}">
                            <td><input type="checkbox" class="row-check" data-id="${p.id}" ${ui.selected.has(p.id) ? 'checked' : ''}></td>
                            <td>${typeBadge(p.type)}</td>
                            <td><strong>${escapeHtml(p.name)}</strong>${p.groupId ? `<div style="color:var(--text-muted);font-size:12px">${escapeHtml((findGroup(p.groupId) || {}).name || '')}</div>` : ''}</td>
                            <td style="font-variant-numeric:tabular-nums">${escapeHtml(p.code || '')}</td>
                            <td>${escapeHtml(p.sku || '')}</td>
                            <td>${escapeHtml(p.unit || (p.type === 'услуга' ? '—' : 'шт'))}</td>
                            <td class="col-num">${p.type === 'услуга' ? '—' : fmtMoney(p.price)}</td>
                            <td class="col-num">${fmtMoney(p.priceSale)}</td>
                            <td class="col-num">${p.type === 'услуга' ? '—' : fmtQty(totalsByProduct[p.id] || 0)}</td>
                            <td class="col-actions">
                                <button class="btn btn-small" data-act="edit">Изменить</button>
                                <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            </div>
        </div>
    `;

    document.querySelectorAll('[data-show]').forEach(btn => {
        btn.onclick = () => {
            ui.showType = btn.dataset.show;
            renderProductsBody();
        };
    });

    const checkAll = document.getElementById('check-all');
    if (checkAll) {
        checkAll.onchange = () => {
            document.querySelectorAll('.row-check').forEach(c => {
                c.checked = checkAll.checked;
                if (checkAll.checked) ui.selected.add(c.dataset.id);
                else ui.selected.delete(c.dataset.id);
            });
        };
    }

    document.getElementById('rows').onclick = (e) => {
        const check = e.target.closest('.row-check');
        if (check) {
            if (check.checked) ui.selected.add(check.dataset.id);
            else ui.selected.delete(check.dataset.id);
            return;
        }
        const btn = e.target.closest('button');
        if (!btn) return;
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const p = findProduct(id);
        if (btn.dataset.act === 'edit') editProduct(p);
        if (btn.dataset.act === 'del') confirmDelete(p.name, () => deleteProduct(id));
    };
}

function typeBadge(t) {
    const map = {
        'товар':    { cls: 'badge-type-good',    label: 'Товар' },
        'услуга':   { cls: 'badge-type-service', label: 'Услуга' },
        'комплект': { cls: 'badge-type-kit',     label: 'Комплект' },
    };
    const m = map[t] || map['товар'];
    return `<span class="badge ${m.cls}">${m.label}</span>`;
}

// =============================================================
// Импорт / экспорт товаров (CSV)
// =============================================================

// Поля целевой модели и алиасы заголовков из экспортов МойСклад / 1С / Excel
const PRODUCT_IMPORT_FIELDS = [
    { key: 'name',        label: 'Наименование',  aliases: ['наименование', 'название', 'товар', 'product', 'name', 'name (en)'] },
    { key: 'code',        label: 'Код',           aliases: ['код', 'код товара', 'code', 'sku код'] },
    { key: 'sku',         label: 'Артикул',       aliases: ['артикул', 'артикул товара', 'article', 'sku'] },
    { key: 'barcode',     label: 'Штрихкод',      aliases: ['штрихкод', 'штрих-код', 'штрих код', 'barcode', 'ean', 'gtin'] },
    { key: 'unit',        label: 'Ед. изм.',      aliases: ['ед. изм.', 'единица', 'единица измерения', 'ед', 'unit'] },
    { key: 'price',       label: 'Цена закупки',  aliases: ['цена закупки', 'закупочная цена', 'себестоимость', 'покупная цена', 'cost', 'purchase price'] },
    { key: 'priceSale',   label: 'Цена продажи',  aliases: ['цена продажи', 'розничная цена', 'цена', 'price', 'retail price', 'sale price'] },
    { key: 'groupName',   label: 'Группа',        aliases: ['группа', 'группа товаров', 'категория', 'папка', 'category', 'group', 'folder'] },
    { key: 'description', label: 'Описание',      aliases: ['описание', 'description', 'comment', 'комментарий'] },
    { key: 'type',        label: 'Тип',           aliases: ['тип', 'type'] },
];

function detectDelimiter(headerLine) {
    const candidates = [';', ',', '\t', '|'];
    let best = ',', max = 0;
    for (const c of candidates) {
        const n = headerLine.split(c).length;
        if (n > max) { max = n; best = c; }
    }
    return best;
}

function parseCSV(text) {
    // Убираем BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delim = detectDelimiter(firstLine);

    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else field += ch;
        } else {
            if (ch === '"') inQuotes = true;
            else if (ch === delim) { row.push(field); field = ''; }
            else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else if (ch === '\r') { /* skip */ }
            else field += ch;
        }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => (c || '').trim() !== ''));
}

function autoMapColumns(headers) {
    const mapping = {};
    const norm = s => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    headers.forEach((h, idx) => {
        const nh = norm(h);
        for (const f of PRODUCT_IMPORT_FIELDS) {
            if (mapping[f.key] !== undefined) continue;
            if (f.aliases.some(a => nh === a || nh.includes(a))) {
                mapping[f.key] = idx;
                break;
            }
        }
    });
    return mapping;
}

function parseNumberRu(s) {
    if (s == null) return 0;
    const cleaned = String(s).trim().replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}

function ensureGroupByName(name) {
    if (!name) return null;
    const trimmed = String(name).trim();
    if (!trimmed) return null;
    // Поддержка вложенности через "/" — например "Молочные/Сыры"
    const parts = trimmed.split(/\s*\/\s*/).filter(Boolean);
    let parentId = null;
    for (const part of parts) {
        let g = state.productGroups.find(x => (x.parentId || null) === parentId && x.name.toLowerCase() === part.toLowerCase());
        if (!g) {
            g = { id: uid('grp'), name: part, parentId };
            state.productGroups.push(g);
        }
        parentId = g.id;
    }
    return parentId;
}

function openImportProductsDialog() {
    if (typeof XLSX === 'undefined') {
        toast('Библиотека Excel не загрузилась — проверьте интернет', 'error');
        return;
    }
    openModal({
        title: 'Импорт товаров из Excel',
        body: `
            <div style="margin-bottom:14px">
                <p style="color:var(--text-muted);font-size:13px;line-height:1.5">
                    Загрузите файл Excel (<code>.xlsx</code>, <code>.xls</code>) или CSV — выгрузка из МойСклад, 1С или вручную составленная таблица.
                    Заголовки колонок распознаются по названиям: <em>Наименование, Код, Артикул, Штрихкод, Цена закупки, Цена продажи, Группа, Ед. изм., Описание</em>.
                </p>
                <p style="color:var(--text-muted);font-size:13px;margin-top:8px">
                    Группа может быть с вложенностью через «/», например: <code>Молочные/Сыры</code> — недостающие группы будут созданы автоматически.
                </p>
            </div>
            <div class="field">
                <label>Файл</label>
                <input type="file" id="import-file" accept=".xlsx,.xls,.csv,.txt">
            </div>
            <div class="field" id="sheet-pick-wrap" style="display:none">
                <label>Лист книги</label>
                <select id="sheet-pick"></select>
            </div>
            <div class="field" style="margin-top:10px">
                <label>Если совпадает по</label>
                <select id="match-by">
                    <option value="code">Код</option>
                    <option value="sku">Артикул</option>
                    <option value="barcode">Штрихкод</option>
                    <option value="name">Наименование</option>
                    <option value="none">Не сопоставлять (всегда создавать)</option>
                </select>
            </div>
            <div class="field">
                <label class="check-line"><input type="checkbox" id="update-existing" checked> Обновлять существующие записи</label>
            </div>
            <div id="import-preview" style="margin-top:14px"></div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="import-do" disabled>Загрузить</button>
        `,
    });

    let parsedRows = null;
    let mapping = null;
    let workbook = null;

    const fileInput = document.getElementById('import-file');
    const previewEl = document.getElementById('import-preview');
    const doBtn = document.getElementById('import-do');
    const sheetPickWrap = document.getElementById('sheet-pick-wrap');
    const sheetPick = document.getElementById('sheet-pick');

    function loadSheet(rows) {
        if (!rows || rows.length < 2) { toast('В листе нет данных', 'error'); return; }
        parsedRows = rows;
        const headers = rows[0];
        mapping = autoMapColumns(headers);
        renderImportPreview(headers, rows.slice(1, 11), mapping);
        doBtn.disabled = mapping.name === undefined;
        if (mapping.name === undefined) {
            toast('Не найдена колонка «Наименование» — задайте маппинг вручную', 'error');
        }
    }

    sheetPick.onchange = () => {
        if (!workbook) return;
        const ws = workbook.Sheets[sheetPick.value];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
        loadSheet(rows.map(r => r.map(c => c == null ? '' : String(c))));
    };

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const reader = new FileReader();

        if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'xlsb') {
            reader.onload = (ev) => {
                try {
                    workbook = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
                    const sheetNames = workbook.SheetNames;
                    if (!sheetNames.length) { toast('В книге нет листов', 'error'); return; }
                    if (sheetNames.length > 1) {
                        sheetPickWrap.style.display = '';
                        sheetPick.innerHTML = sheetNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
                    } else {
                        sheetPickWrap.style.display = 'none';
                    }
                    sheetPick.value = sheetNames[0];
                    const ws = workbook.Sheets[sheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
                    loadSheet(rows.map(r => r.map(c => c == null ? '' : String(c))));
                } catch (err) {
                    console.error(err);
                    toast('Не удалось прочитать Excel: ' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            // CSV / TXT — как раньше
            workbook = null;
            sheetPickWrap.style.display = 'none';
            reader.onload = (ev) => {
                try {
                    const rows = parseCSV(ev.target.result);
                    loadSheet(rows);
                } catch (err) {
                    console.error(err);
                    toast('Не удалось разобрать файл: ' + err.message, 'error');
                }
            };
            reader.readAsText(file, 'UTF-8');
        }
    };

    function renderImportPreview(headers, dataRows, mapping) {
        const fieldOpts = (currentIdx) => {
            const opts = [`<option value="">— не использовать —</option>`];
            for (const f of PRODUCT_IMPORT_FIELDS) {
                const selected = mapping[f.key] === currentIdx ? 'selected' : '';
                opts.push(`<option value="${f.key}" ${selected}>${f.label}</option>`);
            }
            return opts.join('');
        };

        previewEl.innerHTML = `
            <h3 style="font-size:14px;margin-bottom:8px">Маппинг колонок</h3>
            <div class="table-scroll" style="margin-bottom:12px">
                <table style="font-size:12px">
                    <thead>
                        <tr>${headers.map((h, idx) => `<th style="min-width:140px">
                            <div style="font-weight:600;color:var(--text)">${escapeHtml(h)}</div>
                            <select data-col="${idx}" style="width:100%;margin-top:4px;padding:3px 6px;font-size:12px">${fieldOpts(idx)}</select>
                        </th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${dataRows.map(r => `<tr>${headers.map((_, i) => `<td>${escapeHtml(r[i] || '')}</td>`).join('')}</tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <p style="color:var(--text-muted);font-size:12px">Показаны первые ${dataRows.length} строк из ${parsedRows.length - 1}.</p>
        `;

        previewEl.querySelectorAll('select[data-col]').forEach(sel => {
            sel.onchange = (e) => {
                const col = parseInt(e.target.dataset.col, 10);
                const newKey = e.target.value;
                // Снимаем эту колонку из старых полей
                Object.keys(mapping).forEach(k => { if (mapping[k] === col) delete mapping[k]; });
                // Снимаем поле с других колонок
                if (newKey) {
                    Object.keys(mapping).forEach(k => { if (k === newKey) delete mapping[k]; });
                    mapping[newKey] = col;
                }
                doBtn.disabled = mapping.name === undefined;
            };
        });
    }

    document.getElementById('modal-cancel').onclick = closeModal;
    doBtn.onclick = () => {
        if (!parsedRows || mapping.name === undefined) return;
        const matchBy = document.getElementById('match-by').value;
        const updateExisting = document.getElementById('update-existing').checked;
        const dataRows = parsedRows.slice(1);

        let created = 0, updated = 0, skipped = 0;
        const groupsBefore = state.productGroups.length;

        for (const row of dataRows) {
            const get = (key) => {
                const idx = mapping[key];
                return idx === undefined ? '' : (row[idx] || '').trim();
            };
            const name = get('name');
            if (!name) { skipped++; continue; }

            const groupName = get('groupName');
            const groupId = groupName ? ensureGroupByName(groupName) : null;

            const typeRaw = get('type').toLowerCase();
            const type = ['услуга','комплект','товар'].includes(typeRaw) ? typeRaw : 'товар';

            const data = {
                type,
                code: get('code') || nextProductCode(),
                sku: get('sku'),
                barcode: get('barcode'),
                name,
                groupId,
                unit: get('unit') || (type === 'услуга' ? 'услуга' : 'шт'),
                price: parseNumberRu(get('price')),
                priceSale: parseNumberRu(get('priceSale')),
                supplierId: '',
                description: get('description'),
            };

            // Поиск существующего
            let existing = null;
            if (matchBy !== 'none') {
                const v = data[matchBy];
                if (v) existing = state.products.find(p => (p[matchBy] || '').toLowerCase() === v.toLowerCase());
            }

            if (existing) {
                if (updateExisting) {
                    Object.assign(existing, data, { id: existing.id });
                    updated++;
                } else {
                    skipped++;
                }
            } else {
                state.products.push({ id: uid('p'), ...data });
                created++;
            }
        }

        const newGroups = state.productGroups.length - groupsBefore;
        saveState();
        closeModal();
        toast(`Импорт: создано ${created}, обновлено ${updated}, пропущено ${skipped}${newGroups ? `, групп +${newGroups}` : ''}`, 'success');
        renderProducts();
    };
}

// =============================================================
// Импорт позиций (строк документа) из Excel/CSV
// =============================================================

const ITEM_IMPORT_FIELDS = [
    { key: 'name',      label: 'Наименование',  aliases: ['наименование', 'название', 'товар', 'name'] },
    { key: 'code',      label: 'Код',           aliases: ['код', 'код товара', 'code'] },
    { key: 'sku',       label: 'Артикул',       aliases: ['артикул', 'артикул товара', 'article', 'sku'] },
    { key: 'barcode',   label: 'Штрихкод',      aliases: ['штрихкод', 'штрих-код', 'штрих код', 'barcode', 'ean', 'gtin'] },
    { key: 'unit',      label: 'Ед. изм.',      aliases: ['ед. изм.', 'единица', 'единица измерения', 'unit'] },
    { key: 'groupName', label: 'Группа',        aliases: ['группа', 'категория', 'папка', 'group', 'category', 'folder'] },
    { key: 'qty',       label: 'Кол-во',        aliases: ['кол-во', 'количество', 'qty', 'quantity', 'кол.во'] },
    { key: 'price',     label: 'Цена',          aliases: ['цена', 'цена закупки', 'цена продажи', 'price', 'cost'] },
    { key: 'expectedQty', label: 'Учётный остаток',    aliases: ['учётный', 'учетный', 'учётный остаток', 'учетный остаток', 'expected'] },
    { key: 'actualQty',   label: 'Фактический остаток', aliases: ['фактический', 'фактический остаток', 'факт', 'actual'] },
];

function autoMapItemColumns(headers, allowedFields) {
    const mapping = {};
    const norm = s => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    const fields = allowedFields || ITEM_IMPORT_FIELDS;
    headers.forEach((h, idx) => {
        const nh = norm(h);
        for (const f of fields) {
            if (mapping[f.key] !== undefined) continue;
            if (f.aliases.some(a => nh === a || nh.includes(a))) { mapping[f.key] = idx; break; }
        }
    });
    return mapping;
}

function findProductForRow(get) {
    const code = get('code'), sku = get('sku'), barcode = get('barcode'), name = get('name');
    // Нормализация: убираем лидирующие нули у кодов, схлопываем пробелы, кейс
    const normCode = s => (s || '').toString().trim().toLowerCase().replace(/^0+/, '');
    const normText = s => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    const findStrict  = (key, val) => val && state.products.find(p => normText(p[key]) === normText(val));
    const findCode    = (key, val) => val && state.products.find(p => normCode(p[key]) === normCode(val));
    return findCode('code', code)
        || findStrict('sku', sku)
        || findStrict('barcode', barcode)
        || findStrict('name', name)
        || null;
}

function openImportItemsDialog({ priceField = true, qtyField = 'qty', onApply }) {
    if (typeof XLSX === 'undefined') { toast('Библиотека Excel не загрузилась', 'error'); return; }

    // Поля, релевантные текущему контексту документа
    const isInventory = qtyField === 'expectedQty';
    const allowedKeys = new Set(['name', 'code', 'sku', 'barcode', 'unit', 'groupName']);
    if (isInventory) {
        allowedKeys.add('expectedQty');
        allowedKeys.add('actualQty');
        if (priceField) allowedKeys.add('price');
    } else {
        allowedKeys.add('qty');
        if (priceField) allowedKeys.add('price');
    }
    const contextFields = ITEM_IMPORT_FIELDS.filter(f => allowedKeys.has(f.key));
    const qtyLabel = isInventory ? 'Учётный остаток (или Кол-во)' : 'Кол-во';

    openModal2({
        title: 'Загрузка позиций из Excel',
        large: true,
        body: `
            <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px;line-height:1.5">
                Загрузите Excel или CSV. Товары сопоставляются по <strong>Коду → Артикулу → Штрихкоду → Наименованию</strong> (что найдётся первым).
                Колонка <strong>${escapeHtml(qtyLabel)}</strong> обязательна${priceField ? ', <strong>Цена</strong> — опциональна (если не указана, возьмётся цена закупки из карточки товара)' : ''}.
            </p>
            <div class="field">
                <label>Файл</label>
                <input type="file" id="ii-file" accept=".xlsx,.xls,.csv,.txt">
            </div>
            <div class="field" id="ii-sheet-wrap" style="display:none">
                <label>Лист книги</label>
                <select id="ii-sheet"></select>
            </div>
            <div class="field" style="margin-top:8px">
                <label class="check-line"><input type="checkbox" id="ii-create-missing">
                    Создавать отсутствующие товары в справочнике
                </label>
                <span style="color:var(--text-muted);font-size:12px;margin-left:24px">
                    Из строки берётся: наименование, код, артикул, штрихкод, ед. изм., цена, группа (поддерживается вложенность через «/»).
                    Если товар с таким же названием уже есть, новый создан не будет — возьмётся существующий.
                </span>
            </div>
            <div id="ii-preview" style="margin-top:14px"></div>
        `,
        footer: `
            <button class="btn" id="ii-cancel">Отмена</button>
            <button class="btn btn-primary" id="ii-apply" disabled>Добавить позиции</button>
        `,
    });

    let parsedRows = null, mapping = null, workbook = null;
    let resolved = []; // [{product, qty, price, raw}]

    const fileInput = document.getElementById('ii-file');
    const previewEl = document.getElementById('ii-preview');
    const applyBtn = document.getElementById('ii-apply');
    const sheetWrap = document.getElementById('ii-sheet-wrap');
    const sheetSel = document.getElementById('ii-sheet');

    function loadSheet(rows) {
        if (!rows || rows.length < 2) { toast('Нет данных в таблице', 'error'); return; }
        parsedRows = rows;
        mapping = autoMapItemColumns(rows[0], contextFields);
        renderItemPreview();
    }

    sheetSel.onchange = () => {
        if (!workbook) return;
        const ws = workbook.Sheets[sheetSel.value];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
        loadSheet(rows.map(r => r.map(c => c == null ? '' : String(c))));
    };

    fileInput.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const reader = new FileReader();
        if (['xlsx','xls','xlsm','xlsb'].includes(ext)) {
            reader.onload = (ev) => {
                try {
                    workbook = XLSX.read(ev.target.result, { type: 'array' });
                    const names = workbook.SheetNames;
                    if (!names.length) { toast('Нет листов', 'error'); return; }
                    if (names.length > 1) {
                        sheetWrap.style.display = '';
                        sheetSel.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
                    } else sheetWrap.style.display = 'none';
                    sheetSel.value = names[0];
                    const ws = workbook.Sheets[names[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
                    loadSheet(rows.map(r => r.map(c => c == null ? '' : String(c))));
                } catch (err) { console.error(err); toast('Ошибка чтения Excel', 'error'); }
            };
            reader.readAsArrayBuffer(file);
        } else {
            workbook = null; sheetWrap.style.display = 'none';
            reader.onload = (ev) => {
                try { loadSheet(parseCSV(ev.target.result)); }
                catch (err) { toast('Ошибка чтения CSV: ' + err.message, 'error'); }
            };
            reader.readAsText(file, 'UTF-8');
        }
    };

    function renderItemPreview() {
        const headers = parsedRows[0];
        const rows = parsedRows.slice(1);
        const fieldOpts = (currentIdx) => {
            const opts = [`<option value="">— не использовать —</option>`];
            for (const f of contextFields) {
                opts.push(`<option value="${f.key}" ${mapping[f.key] === currentIdx ? 'selected' : ''}>${f.label}</option>`);
            }
            return opts.join('');
        };

        // Резолвим товары и выводим превью первых 30
        resolved = rows.map(r => {
            const get = (k) => mapping[k] === undefined ? '' : (r[mapping[k]] || '').toString().trim();
            const product = findProductForRow(get);
            const qty = parseNumberRu(get(qtyField === 'expectedQty' ? 'expectedQty' : 'qty')) || 0;
            const expectedQty = parseNumberRu(get('expectedQty'));
            const actualQty = parseNumberRu(get('actualQty'));
            const price = parseNumberRu(get('price'));
            return { product, qty, expectedQty, actualQty, price, get };
        });

        const createMissing = document.getElementById('ii-create-missing').checked;
        const matched = resolved.filter(r => r.product).length;
        const willCreate = createMissing ? resolved.filter(r => !r.product && r.get('name')).length : 0;
        const unmatched = resolved.length - matched - willCreate;

        const previewRows = resolved.slice(0, 30);

        previewEl.innerHTML = `
            <h3 style="font-size:14px;margin-bottom:8px">Маппинг колонок</h3>
            <div class="import-mapping-scroll">
                <table style="font-size:12px">
                    <thead><tr>${headers.map((h, idx) => `
                        <th style="min-width:160px">
                            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(h)}</div>
                            <select data-col="${idx}" style="width:100%;margin-top:4px;padding:3px 6px;font-size:12px">${fieldOpts(idx)}</select>
                        </th>
                    `).join('')}</tr></thead>
                </table>
            </div>

            <div style="display:flex;gap:14px;margin-bottom:10px;font-size:13px;flex-wrap:wrap">
                <span>Всего строк: <strong>${rows.length}</strong></span>
                <span style="color:#10b981">Сопоставлено: <strong>${matched}</strong></span>
                ${willCreate ? `<span style="color:#1e40af">Будет создано товаров: <strong>${willCreate}</strong></span>` : ''}
                <span style="color:#dc2626">Пропущено: <strong>${unmatched}</strong></span>
            </div>

            <div class="import-rows-scroll">
            <table style="font-size:12px">
                <thead><tr>
                    <th style="min-width:200px">Сопоставление</th>
                    <th>Товар (по строке)</th>
                    <th class="col-num">Кол-во</th>
                    ${qtyField === 'expectedQty' ? '<th class="col-num">Учётный</th><th class="col-num">Фактический</th>' : ''}
                    ${priceField ? '<th class="col-num">Цена</th>' : ''}
                </tr></thead>
                <tbody>${previewRows.map(r => {
                    const willMakeNew = createMissing && !r.product && r.get('name');
                    const status = r.product
                        ? `<span class="badge badge-success">✓ ${escapeHtml(r.product.name)}</span>`
                        : (willMakeNew
                            ? `<span class="badge" style="background:#dbeafe;color:#1e40af">+ Будет создан</span>`
                            : `<span class="badge badge-warn">✗ пропуск</span>`);
                    const rowName = [r.get('name'), r.get('code') && '['+r.get('code')+']', r.get('sku') && r.get('sku'), r.get('barcode') && r.get('barcode')].filter(Boolean).join(' / ');
                    return `<tr>
                        <td>${status}</td>
                        <td>${escapeHtml(rowName || '—')}</td>
                        <td class="col-num">${fmtQty(r.qty)}</td>
                        ${qtyField === 'expectedQty' ? `<td class="col-num">${fmtQty(r.expectedQty)}</td><td class="col-num">${fmtQty(r.actualQty)}</td>` : ''}
                        ${priceField ? `<td class="col-num">${fmtMoney(r.price)}</td>` : ''}
                    </tr>`;
                }).join('')}</tbody>
            </table>
            </div>
            ${rows.length > 30 ? `<p style="color:var(--text-muted);font-size:12px;margin-top:6px">Показаны первые 30 строк из ${rows.length}.</p>` : ''}
            <p style="color:var(--text-muted);font-size:12px;margin-top:6px">${createMissing
                ? 'Строки без сопоставления и без наименования будут пропущены.'
                : 'Несопоставленные строки будут пропущены — включите «Создавать отсутствующие товары», чтобы добавлять их в справочник.'
            }</p>
        `;

        previewEl.querySelectorAll('select[data-col]').forEach(sel => {
            sel.onchange = (e) => {
                const col = parseInt(e.target.dataset.col, 10);
                const newKey = e.target.value;
                Object.keys(mapping).forEach(k => { if (mapping[k] === col) delete mapping[k]; });
                if (newKey) {
                    Object.keys(mapping).forEach(k => { if (k === newKey) delete mapping[k]; });
                    mapping[newKey] = col;
                }
                renderItemPreview();
            };
        });

        applyBtn.disabled = (matched + willCreate) === 0;
    }

    // Перерисовываем превью при переключении чекбокса
    document.getElementById('ii-create-missing').onchange = () => {
        if (parsedRows) renderItemPreview();
    };

    document.getElementById('ii-cancel').onclick = closeModal2;
    applyBtn.onclick = () => {
        const createMissing = document.getElementById('ii-create-missing').checked;
        const items = [];
        let createdCount = 0;
        const groupsBefore = state.productGroups.length;

        for (const r of resolved) {
            let product = r.product;

            // Создаём отсутствующий товар, если включена опция и есть наименование
            if (!product && createMissing) {
                const name = r.get('name');
                if (!name) continue;

                // Финальная защита от дублей: ищем по точному совпадению нормализованного названия
                const norm = s => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
                const existingByName = state.products.find(p => norm(p.name) === norm(name));
                if (existingByName) {
                    product = existingByName;
                } else {
                    const groupId = r.get('groupName') ? ensureGroupByName(r.get('groupName')) : null;
                    product = {
                        id: uid('p'),
                        type: 'товар',
                        code: r.get('code') || nextProductCode(),
                        sku: r.get('sku'),
                        barcode: r.get('barcode'),
                        name,
                        groupId,
                        unit: r.get('unit') || 'шт',
                        price: r.price || 0,
                        priceSale: 0,
                        supplierId: '',
                        description: '',
                    };
                    state.products.push(product);
                    createdCount++;
                }
            }

            if (!product) continue;

            if (qtyField === 'expectedQty') {
                items.push({
                    productId: product.id,
                    expectedQty: r.expectedQty || r.qty || 0,
                    actualQty: r.actualQty || r.qty || 0,
                    price: r.price || Number(product.price) || 0,
                });
            } else {
                items.push({
                    productId: product.id,
                    qty: r.qty || 1,
                    ...(priceField ? { price: r.price || Number(product.price) || 0 } : {}),
                });
            }
        }

        if (items.length === 0) { toast('Нечего добавлять', 'error'); return; }

        if (createdCount > 0) saveState();
        closeModal2();
        onApply(items);

        const newGroups = state.productGroups.length - groupsBefore;
        let msg = `Добавлено позиций: ${items.length}`;
        if (createdCount) msg += `, создано товаров: ${createdCount}`;
        if (newGroups)    msg += `, групп: +${newGroups}`;
        toast(msg, 'success');
    };
}

function dedupeProducts() {
    // Группируем товары по нормализованному имени; в группе оставляем первого, остальные — дубли
    const norm = s => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    const groups = new Map();
    for (const p of state.products) {
        const key = norm(p.name);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
    }

    const remaps = new Map(); // duplicateId → canonicalId
    const toRemove = new Set();
    let dupGroups = 0;
    for (const [key, list] of groups) {
        if (list.length < 2) continue;
        dupGroups++;
        // Канонический — первый. Дополняем его поля из дублей, если у него пусто.
        const canonical = list[0];
        for (let i = 1; i < list.length; i++) {
            const d = list[i];
            if (!canonical.code && d.code) canonical.code = d.code;
            if (!canonical.sku && d.sku) canonical.sku = d.sku;
            if (!canonical.barcode && d.barcode) canonical.barcode = d.barcode;
            if (!canonical.groupId && d.groupId) canonical.groupId = d.groupId;
            if ((!canonical.price || canonical.price === 0) && d.price) canonical.price = d.price;
            if ((!canonical.priceSale || canonical.priceSale === 0) && d.priceSale) canonical.priceSale = d.priceSale;
            if (!canonical.description && d.description) canonical.description = d.description;
            remaps.set(d.id, canonical.id);
            toRemove.add(d.id);
        }
    }

    if (toRemove.size === 0) {
        toast('Дублей не найдено', 'success');
        return;
    }

    confirmDelete(`${toRemove.size} дубликат(а/ов) товаров (в ${dupGroups} группе/ах)`, () => {
        // Перенаправляем ссылки во всех документах
        const remapItems = (items) => {
            for (const it of (items || [])) {
                if (remaps.has(it.productId)) it.productId = remaps.get(it.productId);
            }
        };
        for (const d of state.purchases) remapItems(d.items);
        for (const d of state.supplierOrders) remapItems(d.items);
        for (const d of state.supplierInvoices) remapItems(d.items);
        for (const d of state.stockIns) remapItems(d.items);
        for (const d of state.writeOffs) remapItems(d.items);
        for (const d of state.transfers) remapItems(d.items);
        for (const d of state.inventories) remapItems(d.items);

        state.products = state.products.filter(p => !toRemove.has(p.id));
        saveState();
        toast(`Удалено дублей: ${toRemove.size}, объединено в ${dupGroups} групп`, 'success');
        renderSettings();
    });
}

function exportProductsCSV() {
    if (typeof XLSX === 'undefined') {
        toast('Библиотека Excel не загрузилась — проверьте интернет', 'error');
        return;
    }
    const groupPath = (gid) => {
        if (!gid) return '';
        const parts = [];
        let cur = findGroup(gid);
        while (cur) {
            parts.unshift(cur.name);
            cur = cur.parentId ? findGroup(cur.parentId) : null;
        }
        return parts.join('/');
    };
    const stock = computeStock();
    const totalsByProduct = stock.reduce((acc, s) => {
        acc[s.productId] = (acc[s.productId] || 0) + s.qty;
        return acc;
    }, {});

    const rows = state.products.map(p => ({
        'Наименование':  p.name,
        'Тип':           p.type || 'товар',
        'Код':           p.code || '',
        'Артикул':       p.sku || '',
        'Штрихкод':      p.barcode || '',
        'Группа':        groupPath(p.groupId),
        'Ед. изм.':      p.unit || '',
        'Цена закупки':  Number(p.price) || 0,
        'Цена продажи':  Number(p.priceSale) || 0,
        'Остаток':       Number(totalsByProduct[p.id] || 0),
        'Описание':      (p.description || '').replace(/\n/g, ' '),
    }));

    const ws = XLSX.utils.json_to_sheet(rows, {
        header: ['Наименование','Тип','Код','Артикул','Штрихкод','Группа','Ед. изм.','Цена закупки','Цена продажи','Остаток','Описание'],
    });
    // Ширины колонок
    ws['!cols'] = [
        { wch: 38 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
        { wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 40 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Товары');
    XLSX.writeFile(wb, `products-${todayISO()}.xlsx`);
    toast(`Экспортировано: ${state.products.length} позиций`, 'success');
}

function editProductGroup(g, presetParentId) {
    const isNew = !g;
    const data = g || { name: '', parentId: presetParentId || null };
    const parentOpts = `<option value="">— Корень —</option>` +
        state.productGroups
            .filter(x => !g || x.id !== g.id)
            .map(x => `<option value="${x.id}" ${x.id === data.parentId ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('');
    openModal({
        title: isNew ? 'Новая группа' : 'Редактирование группы',
        body: `
            <div class="form-grid">
                <div class="field span-2">
                    <label>Наименование *</label>
                    <input id="g-name" value="${escapeHtml(data.name)}" autofocus>
                    <div class="field-error" id="err-name"></div>
                </div>
                <div class="field span-2">
                    <label>Родительская группа</label>
                    <select id="g-parent">${parentOpts}</select>
                </div>
            </div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-save">Сохранить</button>
        `,
    });
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
        const name = document.getElementById('g-name').value.trim();
        if (!name) { document.getElementById('err-name').textContent = 'Укажите наименование'; return; }
        const parentId = document.getElementById('g-parent').value || null;
        if (isNew) {
            state.productGroups.push({ id: uid('grp'), name, parentId });
            toast('Группа создана', 'success');
        } else {
            Object.assign(g, { name, parentId });
            toast('Группа сохранена', 'success');
        }
        saveState();
        closeModal();
        renderProducts();
    };
}

function deleteProductGroup(id) {
    const hasChildren = state.productGroups.some(g => g.parentId === id);
    const hasProducts = state.products.some(p => p.groupId === id);
    if (hasChildren) { toast('Сначала удалите подгруппы', 'error'); return; }
    if (hasProducts) { toast('В группе есть товары — переместите их', 'error'); return; }
    state.productGroups = state.productGroups.filter(g => g.id !== id);
    if (state.productsUI.groupId === id) state.productsUI.groupId = null;
    saveState();
    toast('Группа удалена');
    renderProducts();
}

function editProduct(p, defaultType) {
    const isNew = !p;
    const data = p || {
        type: defaultType || 'товар',
        code: nextProductCode(),
        sku: '',
        barcode: '',
        name: '',
        groupId: state.productsUI.groupId || null,
        unit: 'шт',
        price: 0,
        priceSale: 0,
        supplierId: '',
        description: '',
    };

    const groupOpts = `<option value="">— Без группы —</option>` +
        state.productGroups.map(g => `<option value="${g.id}" ${g.id === data.groupId ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('');
    const supplierOpts = `<option value="">— Не указан —</option>` +
        state.suppliers.map(s => `<option value="${s.id}" ${s.id === data.supplierId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

    openModal({
        title: isNew ? `Новый${data.type === 'услуга' ? 'ая' : ''} ${data.type}` : `Карточка: ${data.name}`,
        large: true,
        body: `
            <div class="form-grid">
                <div class="field">
                    <label>Тип *</label>
                    <select id="f-type">
                        <option value="товар"    ${data.type === 'товар' ? 'selected' : ''}>Товар</option>
                        <option value="услуга"   ${data.type === 'услуга' ? 'selected' : ''}>Услуга</option>
                        <option value="комплект" ${data.type === 'комплект' ? 'selected' : ''}>Комплект</option>
                    </select>
                </div>
                <div class="field">
                    <label>Группа</label>
                    <select id="f-group">${groupOpts}</select>
                </div>
                <div class="field span-2">
                    <label>Наименование *</label>
                    <input id="f-name" value="${escapeHtml(data.name || '')}" autofocus>
                    <div class="field-error" id="err-name"></div>
                </div>
                <div class="field">
                    <label>Код</label>
                    <input id="f-code" value="${escapeHtml(data.code || '')}">
                </div>
                <div class="field">
                    <label>Артикул</label>
                    <input id="f-sku" value="${escapeHtml(data.sku || '')}">
                </div>
                <div class="field">
                    <label>Штрихкод</label>
                    <input id="f-barcode" value="${escapeHtml(data.barcode || '')}">
                </div>
                <div class="field">
                    <label>Единица измерения</label>
                    <select id="f-unit">
                        ${['шт','кг','г','л','мл','м','м²','м³','уп','компл','услуга'].map(u => `
                            <option value="${u}" ${u === (data.unit || 'шт') ? 'selected' : ''}>${u}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="field">
                    <label>Цена закупки, ₽</label>
                    <input id="f-price" type="number" min="0" step="0.01" value="${Number(data.price) || 0}">
                </div>
                <div class="field">
                    <label>Цена продажи, ₽</label>
                    <input id="f-price-sale" type="number" min="0" step="0.01" value="${Number(data.priceSale) || 0}">
                </div>
                <div class="field span-2">
                    <label>Поставщик</label>
                    <select id="f-supplier">${supplierOpts}</select>
                </div>
                <div class="field span-2">
                    <label>Описание</label>
                    <textarea id="f-description" rows="3">${escapeHtml(data.description || '')}</textarea>
                </div>
            </div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-save">Сохранить</button>
        `,
    });
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
        const name = document.getElementById('f-name').value.trim();
        if (!name) {
            document.getElementById('err-name').textContent = 'Укажите наименование';
            return;
        }
        const payload = {
            type: document.getElementById('f-type').value,
            code: document.getElementById('f-code').value.trim(),
            sku: document.getElementById('f-sku').value.trim(),
            barcode: document.getElementById('f-barcode').value.trim(),
            name,
            groupId: document.getElementById('f-group').value || null,
            unit: document.getElementById('f-unit').value,
            price: parseFloat(document.getElementById('f-price').value) || 0,
            priceSale: parseFloat(document.getElementById('f-price-sale').value) || 0,
            supplierId: document.getElementById('f-supplier').value || '',
            description: document.getElementById('f-description').value.trim(),
        };
        if (isNew) {
            state.products.push({ id: uid('p'), ...payload });
            toast('Товар создан', 'success');
        } else {
            Object.assign(p, payload);
            toast('Товар сохранён', 'success');
        }
        saveState();
        closeModal();
        renderProducts();
    };
}

function deleteProduct(id) {
    const usedIn = state.purchases.find(p => p.items.some(it => it.productId === id));
    if (usedIn) {
        toast('Товар используется в поступлениях, удалить нельзя', 'error');
        return;
    }
    state.products = state.products.filter(p => p.id !== id);
    saveState();
    toast('Товар удалён');
    renderProducts();
}

// =============================================================
// View: Поставщики
// =============================================================
function renderPurchasing() {
    const tab = state.purchasingTab;
    let actions = '';
    if (tab === 'suppliers') actions = `<button class="btn btn-primary" id="add-supplier">+ Новый поставщик</button>`;
    if (tab === 'orders')    actions = `<button class="btn btn-primary" id="add-order">+ Новый заказ</button>`;
    if (tab === 'invoices')  actions = `
        <button class="btn" id="add-invoice-from-order">Счёт по заказу</button>
        <button class="btn btn-primary" id="add-invoice">+ Новый счёт</button>
    `;
    if (tab === 'receipts')  actions = `
        <button class="btn" id="add-receipt-from-order">Создать по заказу</button>
        <button class="btn btn-primary" id="add-receipt">+ Новая приёмка</button>
    `;
    setTitle('Закупки', actions);

    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="tabs-row">
            <button class="tab-btn ${tab === 'suppliers' ? 'active' : ''}" data-tab="suppliers">🚚 Контрагенты</button>
            <button class="tab-btn ${tab === 'orders' ? 'active' : ''}" data-tab="orders">📨 Заказы поставщикам</button>
            <button class="tab-btn ${tab === 'invoices' ? 'active' : ''}" data-tab="invoices">🧾 Счета поставщикам</button>
            <button class="tab-btn ${tab === 'receipts' ? 'active' : ''}" data-tab="receipts">📥 Приёмки</button>
        </div>
        <div id="suppliers-body"></div>
    `;
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.onclick = () => { state.purchasingTab = b.dataset.tab; renderPurchasing(); };
    });

    if (tab === 'suppliers') {
        document.getElementById('add-supplier').onclick = () => editSupplier(null);
        renderSuppliersList();
    } else if (tab === 'orders') {
        document.getElementById('add-order').onclick = () => editSupplierOrder(null);
        renderSupplierOrders();
    } else if (tab === 'invoices') {
        document.getElementById('add-invoice').onclick = () => editSupplierInvoice(null);
        document.getElementById('add-invoice-from-order').onclick = () => createInvoiceFromOrder();
        renderSupplierInvoices();
    } else {
        document.getElementById('add-receipt').onclick = () => editPurchase(null);
        document.getElementById('add-receipt-from-order').onclick = () => createReceiptFromOrder();
        renderSupplierReceipts();
    }
}

function renderSupplierReceipts() {
    const body = document.getElementById('suppliers-body');
    const list = [...state.purchases].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (list.length === 0) {
        body.innerHTML = `<div class="card">${renderEmptyState({
            icon: '📥',
            title: 'Приёмок пока нет',
            hint: 'Создайте приёмку — товар будет оприходован на склад. Можно создать на основании заказа поставщику.',
        })}</div>`;
        return;
    }

    body.innerHTML = `
        <div class="card">
            <div class="table-toolbar">
                <input class="search-input" id="search" placeholder="Поиск по №, поставщику, складу или заказу...">
            </div>
            <div class="table-scroll">
            <table class="receipts-table">
                <thead>
                    <tr>
                        <th style="width:34px"><input type="checkbox"></th>
                        <th style="width:90px">№</th>
                        <th style="width:110px">Дата</th>
                        <th>Поставщик</th>
                        <th>Организация</th>
                        <th>Склад</th>
                        <th style="width:110px">Заказ</th>
                        <th class="col-num" style="width:80px">Позиций</th>
                        <th class="col-num" style="width:130px">Сумма</th>
                        <th style="width:120px">Статус</th>
                        <th>Комментарий</th>
                        <th class="col-actions" style="width:200px">Действия</th>
                    </tr>
                </thead>
                <tbody id="rows">
                    ${list.map(d => {
                        const total = (d.items || []).reduce((s, i) => s + (Number(i.qty)||0) * (Number(i.price)||0), 0);
                        const supplier = findSupplier(d.supplierId);
                        const wh = findWarehouse(d.warehouseId);
                        const order = d.orderId ? state.supplierOrders.find(o => o.id === d.orderId) : null;
                        const status = (d.items || []).length > 0 ? 'Проведена' : 'Черновик';
                        const statusCls = status === 'Проведена' ? 'badge badge-success' : 'badge badge-warn';
                        return `
                            <tr data-id="${d.id}">
                                <td><input type="checkbox"></td>
                                <td><strong>${escapeHtml(d.number || '')}</strong></td>
                                <td>${fmtDate(d.date)}</td>
                                <td>${escapeHtml(supplier ? supplier.name : '—')}</td>
                                <td>${escapeHtml(d.organization || '—')}</td>
                                <td>${escapeHtml(wh ? wh.name : '—')}</td>
                                <td>${order ? `<span class="badge">№ ${escapeHtml(order.number)}</span>` : '<span class="dot">—</span>'}</td>
                                <td class="col-num">${(d.items || []).length}</td>
                                <td class="col-num"><strong>${fmtMoney(total)}</strong></td>
                                <td><span class="${statusCls}">${status}</span></td>
                                <td class="ellipsis" title="${escapeHtml(d.comment || '')}">${escapeHtml(d.comment || '')}</td>
                                <td class="col-actions">
                                    <button class="btn btn-small" data-act="view">Открыть</button>
                                    <button class="btn btn-small" data-act="edit">Изменить</button>
                                    <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
        </div>
    `;

    document.getElementById('search').oninput = (e) => filterRows(e.target.value);
    document.getElementById('rows').onclick = (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const doc = state.purchases.find(p => p.id === id);
        if (btn.dataset.act === 'view') viewPurchase(doc);
        if (btn.dataset.act === 'edit') editPurchase(doc);
        if (btn.dataset.act === 'del') confirmDelete(`Приёмка №${doc.number}`, () => deletePurchase(id));
    };
}

function createReceiptFromOrder() {
    if (state.supplierOrders.length === 0) {
        toast('Сначала создайте заказ поставщику', 'error');
        return;
    }
    const opts = state.supplierOrders.map(o => {
        const s = findSupplier(o.supplierId);
        return `<option value="${o.id}">№ ${escapeHtml(o.number)} — ${escapeHtml(s ? s.name : '—')} (${fmtMoney(o.amount)})</option>`;
    }).join('');

    openModal({
        title: 'Создание приёмки на основании заказа',
        body: `
            <div class="field">
                <label>Заказ поставщику *</label>
                <select id="src-order">${opts}</select>
            </div>
            <p style="color:var(--text-muted);font-size:13px;margin-top:12px">
                В приёмку будут перенесены: контрагент, организация, сумма, комментарий.
                Состав товаров скопируется, если он указан в заказе; иначе добавьте позиции вручную.
            </p>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-ok">Создать</button>
        `,
    });
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-ok').onclick = () => {
        const orderId = document.getElementById('src-order').value;
        const order = state.supplierOrders.find(o => o.id === orderId);
        closeModal();

        const draft = {
            number: nextPurchaseNumber(),
            date: todayISO(),
            supplierId: order.supplierId,
            organization: order.organization || '',
            warehouseId: state.warehouses[0]?.id || '',
            orderId: order.id,
            comment: order.comment || '',
            items: Array.isArray(order.items) ? order.items.map(i => ({ ...i })) : [],
        };
        editPurchaseDraft(draft);
    };
}

function editPurchaseDraft(draft) {
    // Создаём новую приёмку через модалку editPurchase, передавая черновик через временный объект
    const tempPurchase = { ...draft };
    // Используем существующий редактор: подменяем как новый, но с предзаполненными полями
    state._draftReceipt = tempPurchase;
    editPurchase(null, tempPurchase);
    delete state._draftReceipt;
}

function renderSuppliersList() {
    const list = state.suppliers;
    const body = document.getElementById('suppliers-body');
    if (list.length === 0) {
        body.innerHTML = `<div class="card">${renderEmptyState({
            icon: '🚚',
            title: 'Поставщиков пока нет',
            hint: 'Добавьте поставщика, чтобы привязывать к нему документы поступления.',
        })}</div>`;
        return;
    }
    body.innerHTML = `
        <div class="card">
            <div class="table-toolbar">
                <input class="search-input" id="search" placeholder="Поиск по названию, ИНН или контакту...">
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Наименование</th>
                        <th>ИНН</th>
                        <th>Контакт</th>
                        <th>Телефон</th>
                        <th class="col-actions">Действия</th>
                    </tr>
                </thead>
                <tbody id="rows">
                    ${list.map(s => `
                        <tr data-id="${s.id}">
                            <td><strong>${escapeHtml(s.name)}</strong></td>
                            <td>${escapeHtml(s.inn || '—')}</td>
                            <td>${escapeHtml(s.contact || '—')}</td>
                            <td>${escapeHtml(s.phone || '—')}</td>
                            <td class="col-actions">
                                <button class="btn btn-small" data-act="edit">Изменить</button>
                                <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('search').oninput = (e) => filterRows(e.target.value);
    document.getElementById('rows').onclick = (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const s = findSupplier(id);
        if (btn.dataset.act === 'edit') editSupplier(s);
        if (btn.dataset.act === 'del') confirmDelete(s.name, () => deleteSupplier(id));
    };
}

const ORDER_STATUSES = ['Новый', 'В работе', 'Оплачен', 'Принят', 'Отменён'];
const ORDER_STATUS_CLASS = {
    'Новый': 'badge',
    'В работе': 'badge badge-warn',
    'Оплачен': 'badge badge-success',
    'Принят': 'badge badge-success',
    'Отменён': 'badge',
};

function nextOrderNumber() {
    const nums = state.supplierOrders.map(o => parseInt((o.number || '').replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return String(next).padStart(6, '0');
}

function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderSupplierOrders() {
    const body = document.getElementById('suppliers-body');
    const list = [...state.supplierOrders].sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''));

    if (list.length === 0) {
        body.innerHTML = `<div class="card">${renderEmptyState({
            icon: '📨',
            title: 'Заказов поставщикам нет',
            hint: 'Создайте первый заказ, чтобы отслеживать счета, оплаты и статусы.',
        })}</div>`;
        return;
    }

    body.innerHTML = `
        <div class="card">
            <div class="table-toolbar">
                <input class="search-input" id="search" placeholder="Поиск по №, контрагенту, статусу или комментарию...">
            </div>
            <div class="table-scroll">
            <table class="orders-table">
                <thead>
                    <tr>
                        <th style="width:34px"><input type="checkbox" id="check-all"></th>
                        <th style="width:90px">№</th>
                        <th style="width:130px">Время</th>
                        <th>Контрагент</th>
                        <th>Организация</th>
                        <th class="col-num" style="width:80px">Позиций</th>
                        <th class="col-num" style="width:120px">Сумма</th>
                        <th class="col-num" style="width:80px">Счета</th>
                        <th class="col-num" style="width:110px">Оплачено</th>
                        <th style="width:90px">Принято</th>
                        <th style="width:100px">В ожидании</th>
                        <th style="width:120px">Статус</th>
                        <th style="width:110px">Отправлено</th>
                        <th style="width:110px">Напечатано</th>
                        <th>Комментарий</th>
                        <th class="col-actions" style="width:160px">Действия</th>
                    </tr>
                </thead>
                <tbody id="rows">
                    ${list.map(o => {
                        const supplier = findSupplier(o.supplierId);
                        const cls = ORDER_STATUS_CLASS[o.status] || 'badge';
                        return `
                            <tr data-id="${o.id}">
                                <td><input type="checkbox"></td>
                                <td><strong>${escapeHtml(o.number || '')}</strong></td>
                                <td>${escapeHtml(fmtDateTime(o.datetime))}</td>
                                <td>${escapeHtml(supplier ? supplier.name : '—')}</td>
                                <td>${escapeHtml(o.organization || '—')}</td>
                                <td class="col-num">${(o.items || []).length}</td>
                                <td class="col-num"><strong>${fmtMoney(o.amount)}</strong></td>
                                <td class="col-num">${o.invoicesIssued || 0}</td>
                                <td class="col-num">${fmtMoney(o.paidAmount)}</td>
                                <td>${o.accepted ? '<span class="dot dot-ok">✓</span>' : '<span class="dot">—</span>'}</td>
                                <td>${o.pending ? '<span class="badge badge-warn">Да</span>' : '<span class="dot">—</span>'}</td>
                                <td><span class="${cls}">${escapeHtml(o.status || 'Новый')}</span></td>
                                <td>${o.sent ? '<span class="dot dot-ok">✓</span>' : '<span class="dot">—</span>'}</td>
                                <td>${o.printed ? '<span class="dot dot-ok">✓</span>' : '<span class="dot">—</span>'}</td>
                                <td class="ellipsis" title="${escapeHtml(o.comment || '')}">${escapeHtml(o.comment || '')}</td>
                                <td class="col-actions">
                                    <button class="btn btn-small" data-act="edit">Изменить</button>
                                    <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
        </div>
    `;

    document.getElementById('search').oninput = (e) => filterRows(e.target.value);
    document.getElementById('rows').onclick = (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const o = state.supplierOrders.find(x => x.id === id);
        if (btn.dataset.act === 'edit') editSupplierOrder(o);
        if (btn.dataset.act === 'del') confirmDelete(`Заказ № ${o.number}`, () => deleteSupplierOrder(id));
    };
}

function editSupplierOrder(o) {
    if (state.products.length === 0) { toast('Сначала добавьте товары', 'error'); return; }

    const isNew = !o;
    const data = o || {
        number: nextOrderNumber(),
        datetime: new Date().toISOString().slice(0, 16),
        supplierId: state.suppliers[0]?.id || '',
        organization: '',
        invoicesIssued: 0,
        paidAmount: 0,
        accepted: false,
        pending: false,
        status: 'Новый',
        sent: false,
        printed: false,
        comment: '',
        items: [],
    };
    let items = (data.items || []).map(i => ({ ...i }));

    const supplierOpts = `<option value="">— Не указан —</option>` +
        state.suppliers.map(s => `<option value="${s.id}" ${s.id === data.supplierId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    const statusOpts = ORDER_STATUSES.map(st => `<option value="${st}" ${st === (data.status || 'Новый') ? 'selected' : ''}>${st}</option>`).join('');

    const dt = data.datetime && data.datetime.length > 16 ? data.datetime.slice(0, 16) : (data.datetime || '');

    openModal({
        title: isNew ? 'Новый заказ поставщику' : `Заказ № ${data.number}`,
        large: true,
        body: `
            <div class="form-grid">
                <div class="field">
                    <label>Номер *</label>
                    <input id="o-number" value="${escapeHtml(data.number)}">
                </div>
                <div class="field">
                    <label>Время *</label>
                    <input id="o-datetime" type="datetime-local" value="${escapeHtml(dt)}">
                </div>
                <div class="field">
                    <label>Контрагент</label>
                    <select id="o-supplier">${supplierOpts}</select>
                </div>
                <div class="field">
                    <label>Организация</label>
                    <input id="o-organization" value="${escapeHtml(data.organization || '')}">
                </div>
                <div class="field">
                    <label>Выставлено счетов</label>
                    <input id="o-invoices" type="number" min="0" step="1" value="${Number(data.invoicesIssued) || 0}">
                </div>
                <div class="field">
                    <label>Оплачено, ₽</label>
                    <input id="o-paid" type="number" min="0" step="0.01" value="${Number(data.paidAmount) || 0}">
                </div>
                <div class="field">
                    <label>Статус</label>
                    <select id="o-status">${statusOpts}</select>
                </div>
                <div class="field">
                    <label class="check-line"><input type="checkbox" id="o-accepted" ${data.accepted ? 'checked' : ''}> Принято</label>
                    <label class="check-line"><input type="checkbox" id="o-pending"  ${data.pending ? 'checked' : ''}> В ожидании</label>
                </div>
                <div class="field">
                    <label class="check-line"><input type="checkbox" id="o-sent"     ${data.sent ? 'checked' : ''}> Отправлено</label>
                    <label class="check-line"><input type="checkbox" id="o-printed"  ${data.printed ? 'checked' : ''}> Напечатано</label>
                </div>
                <div class="field span-2">
                    <label>Комментарий</label>
                    <textarea id="o-comment" rows="2">${escapeHtml(data.comment || '')}</textarea>
                </div>
            </div>

            <div class="items-block">
                <div class="items-block-header">
                    <h3>Товары в заказе</h3>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" id="import-items">📥 Из Excel</button>
                        <button class="btn btn-small" id="add-item">+ Строка</button>
                    </div>
                </div>
                <table class="items-table">
                    <thead><tr>
                        <th style="width:30px">#</th>
                        <th>Товар</th>
                        <th class="col-qty">Кол-во</th>
                        <th class="col-price">Цена, ₽</th>
                        <th class="col-sum">Сумма, ₽</th>
                        <th class="col-del"></th>
                    </tr></thead>
                    <tbody id="items-tbody"></tbody>
                </table>
                <div class="items-block-footer">
                    <span style="color:var(--text-muted)">Позиций: <span id="items-count">0</span></span>
                    <span class="items-total">Итого: <span id="items-total">0,00 ₽</span></span>
                </div>
            </div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-save">Сохранить</button>
        `,
    });

    function paint() {
        const tbody = document.getElementById('items-tbody');
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Нет позиций. Нажмите «+ Строка», чтобы добавить товар.</td></tr>`;
        } else {
            tbody.innerHTML = items.map((it, idx) => {
                const sum = (Number(it.qty)||0) * (Number(it.price)||0);
                return `
                    <tr data-idx="${idx}">
                        <td>${idx+1}</td>
                        <td><select data-field="productId">
                            ${state.products.filter(p => p.type !== 'услуга').map(p => `<option value="${p.id}" ${p.id===it.productId?'selected':''}>${escapeHtml(p.name)}${p.sku ? ' ('+escapeHtml(p.sku)+')' : ''}</option>`).join('')}
                        </select></td>
                        <td class="col-qty"><input type="number" min="0" step="0.001" data-field="qty" value="${Number(it.qty)||0}" style="text-align:right"></td>
                        <td class="col-price"><input type="number" min="0" step="0.01" data-field="price" value="${Number(it.price)||0}" style="text-align:right"></td>
                        <td class="col-sum">${fmtMoney(sum)}</td>
                        <td class="col-del"><button class="btn btn-icon btn-danger" data-act="del">×</button></td>
                    </tr>
                `;
            }).join('');
        }
        const total = items.reduce((s,i) => s + (Number(i.qty)||0)*(Number(i.price)||0), 0);
        document.getElementById('items-count').textContent = items.length;
        document.getElementById('items-total').textContent = fmtMoney(total);
    }

    document.getElementById('add-item').onclick = () => {
        const p = state.products.find(x => x.type !== 'услуга') || state.products[0];
        items.push({ productId: p.id, qty: 1, price: Number(p.price)||0 });
        paint();
    };
    document.getElementById('import-items').onclick = () => {
        openImportItemsDialog({ priceField: true, onApply: (newItems) => { items.push(...newItems); paint(); } });
    };
    document.getElementById('items-tbody').addEventListener('input', (e) => {
        const tr = e.target.closest('tr'); if (!tr) return;
        const idx = Number(tr.dataset.idx);
        const f = e.target.dataset.field;
        if (f === 'productId') {
            items[idx].productId = e.target.value;
            const p = findProduct(e.target.value);
            if (p && (!items[idx].price || items[idx].price === 0)) items[idx].price = Number(p.price)||0;
        } else {
            items[idx][f] = parseFloat(e.target.value) || 0;
        }
        paint();
    });
    document.getElementById('items-tbody').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act="del"]'); if (!btn) return;
        const idx = Number(btn.closest('tr').dataset.idx);
        items.splice(idx, 1); paint();
    });

    paint();

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
        const number = document.getElementById('o-number').value.trim();
        const datetime = document.getElementById('o-datetime').value;
        if (!number) { toast('Укажите номер', 'error'); return; }
        if (!datetime) { toast('Укажите дату/время', 'error'); return; }
        if (items.some(i => !i.productId || !(Number(i.qty) > 0))) {
            toast('Заполните все строки: товар и кол-во > 0', 'error'); return;
        }

        const cleanItems = items.map(i => ({ productId: i.productId, qty: Number(i.qty), price: Number(i.price)||0 }));
        const amount = cleanItems.reduce((s,i) => s + i.qty * i.price, 0);

        const payload = {
            number, datetime,
            supplierId: document.getElementById('o-supplier').value,
            organization: document.getElementById('o-organization').value.trim(),
            amount,
            invoicesIssued: parseInt(document.getElementById('o-invoices').value, 10) || 0,
            paidAmount: parseFloat(document.getElementById('o-paid').value) || 0,
            status: document.getElementById('o-status').value,
            accepted: document.getElementById('o-accepted').checked,
            pending: document.getElementById('o-pending').checked,
            sent: document.getElementById('o-sent').checked,
            printed: document.getElementById('o-printed').checked,
            comment: document.getElementById('o-comment').value.trim(),
            items: cleanItems,
        };
        if (isNew) {
            state.supplierOrders.push({ id: uid('ord'), ...payload });
            toast('Заказ создан', 'success');
        } else {
            Object.assign(o, payload);
            toast('Заказ сохранён', 'success');
        }
        saveState();
        closeModal();
        renderPurchasing();
    };
}

function deleteSupplierOrder(id) {
    state.supplierOrders = state.supplierOrders.filter(o => o.id !== id);
    saveState();
    toast('Заказ удалён');
    renderPurchasing();
}

// =============================================================
// View: Счета поставщикам
// =============================================================
const INVOICE_STATUSES = ['Новый', 'Ожидает оплаты', 'Частично оплачен', 'Оплачен', 'Просрочен', 'Отменён'];
const INVOICE_STATUS_CLASS = {
    'Новый':            'badge',
    'Ожидает оплаты':   'badge badge-warn',
    'Частично оплачен': 'badge badge-warn',
    'Оплачен':          'badge badge-success',
    'Просрочен':        'badge badge-danger',
    'Отменён':          'badge',
};

function nextInvoiceNumber() {
    const nums = state.supplierInvoices.map(i => parseInt((i.number || '').replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return 'СЧ-' + String(next).padStart(5, '0');
}

function invoiceAutoStatus(inv) {
    if (inv.status === 'Отменён') return 'Отменён';
    const amount = Number(inv.amount) || 0;
    const paid = Number(inv.paidAmount) || 0;
    if (amount > 0 && paid >= amount) return 'Оплачен';
    if (paid > 0 && paid < amount) return 'Частично оплачен';
    if (inv.dueDate && inv.dueDate < todayISO() && paid < amount) return 'Просрочен';
    return inv.status || 'Новый';
}

function renderSupplierInvoices() {
    const body = document.getElementById('suppliers-body');
    const list = [...state.supplierInvoices].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (list.length === 0) {
        body.innerHTML = `<div class="card">${renderEmptyState({
            icon: '🧾',
            title: 'Счетов поставщиков нет',
            hint: 'Добавьте счёт поставщика — для контроля сумм, сроков и оплат. Можно создать на основании заказа.',
        })}</div>`;
        return;
    }

    body.innerHTML = `
        <div class="card">
            <div class="table-toolbar">
                <input class="search-input" id="search" placeholder="Поиск по №, поставщику, статусу или комментарию...">
            </div>
            <div class="table-scroll">
            <table class="receipts-table">
                <thead>
                    <tr>
                        <th style="width:34px"><input type="checkbox"></th>
                        <th style="width:110px">№ счёта</th>
                        <th style="width:110px">Дата</th>
                        <th style="width:110px">Срок оплаты</th>
                        <th>Поставщик</th>
                        <th>Организация</th>
                        <th style="width:110px">Заказ</th>
                        <th class="col-num" style="width:80px">Позиций</th>
                        <th class="col-num" style="width:130px">Сумма</th>
                        <th class="col-num" style="width:130px">Оплачено</th>
                        <th class="col-num" style="width:130px">Остаток</th>
                        <th style="width:140px">Статус</th>
                        <th>Комментарий</th>
                        <th class="col-actions" style="width:200px">Действия</th>
                    </tr>
                </thead>
                <tbody id="rows">
                    ${list.map(inv => {
                        const supplier = findSupplier(inv.supplierId);
                        const order = inv.orderId ? state.supplierOrders.find(o => o.id === inv.orderId) : null;
                        const status = invoiceAutoStatus(inv);
                        const cls = INVOICE_STATUS_CLASS[status] || 'badge';
                        const balance = (Number(inv.amount) || 0) - (Number(inv.paidAmount) || 0);
                        return `
                            <tr data-id="${inv.id}">
                                <td><input type="checkbox"></td>
                                <td><strong>${escapeHtml(inv.number || '')}</strong></td>
                                <td>${fmtDate(inv.date)}</td>
                                <td>${inv.dueDate ? fmtDate(inv.dueDate) : '<span class="dot">—</span>'}</td>
                                <td>${escapeHtml(supplier ? supplier.name : '—')}</td>
                                <td>${escapeHtml(inv.organization || '—')}</td>
                                <td>${order ? `<span class="badge">№ ${escapeHtml(order.number)}</span>` : '<span class="dot">—</span>'}</td>
                                <td class="col-num">${(inv.items || []).length}</td>
                                <td class="col-num"><strong>${fmtMoney(inv.amount)}</strong></td>
                                <td class="col-num">${fmtMoney(inv.paidAmount)}</td>
                                <td class="col-num">${fmtMoney(balance)}</td>
                                <td><span class="${cls}">${escapeHtml(status)}</span></td>
                                <td class="ellipsis" title="${escapeHtml(inv.comment || '')}">${escapeHtml(inv.comment || '')}</td>
                                <td class="col-actions">
                                    <button class="btn btn-small" data-act="pay">Оплата</button>
                                    <button class="btn btn-small" data-act="edit">Изменить</button>
                                    <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
        </div>
    `;

    document.getElementById('search').oninput = (e) => filterRows(e.target.value);
    document.getElementById('rows').onclick = (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const inv = state.supplierInvoices.find(x => x.id === id);
        if (btn.dataset.act === 'edit') editSupplierInvoice(inv);
        if (btn.dataset.act === 'pay')  payInvoiceDialog(inv);
        if (btn.dataset.act === 'del')  confirmDelete(`Счёт № ${inv.number}`, () => deleteSupplierInvoice(id));
    };
}

function payInvoiceDialog(inv) {
    const balance = Math.max(0, (Number(inv.amount) || 0) - (Number(inv.paidAmount) || 0));
    openModal({
        title: `Оплата по счёту № ${inv.number}`,
        body: `
            <div class="form-grid">
                <div class="field">
                    <label>Сумма счёта, ₽</label>
                    <input value="${fmtMoney(inv.amount)}" disabled>
                </div>
                <div class="field">
                    <label>Уже оплачено, ₽</label>
                    <input value="${fmtMoney(inv.paidAmount)}" disabled>
                </div>
                <div class="field span-2">
                    <label>Сумма платежа, ₽ *</label>
                    <input id="pay-amount" type="number" min="0" step="0.01" value="${balance.toFixed(2)}" autofocus>
                    <div style="color:var(--text-muted);font-size:13px;margin-top:6px">Остаток к оплате: <strong>${fmtMoney(balance)}</strong></div>
                </div>
            </div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-ok">Зачесть</button>
        `,
    });
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-ok').onclick = () => {
        const add = parseFloat(document.getElementById('pay-amount').value) || 0;
        if (add <= 0) { toast('Сумма платежа должна быть больше 0', 'error'); return; }
        inv.paidAmount = (Number(inv.paidAmount) || 0) + add;
        inv.status = invoiceAutoStatus(inv);
        saveState();
        toast('Оплата зачтена', 'success');
        closeModal();
        renderPurchasing();
    };
}

function createInvoiceFromOrder() {
    if (state.supplierOrders.length === 0) {
        toast('Сначала создайте заказ поставщику', 'error');
        return;
    }
    const opts = state.supplierOrders.map(o => {
        const s = findSupplier(o.supplierId);
        return `<option value="${o.id}">№ ${escapeHtml(o.number)} — ${escapeHtml(s ? s.name : '—')} (${fmtMoney(o.amount)})</option>`;
    }).join('');

    openModal({
        title: 'Новый счёт на основании заказа',
        body: `
            <div class="field">
                <label>Заказ поставщику *</label>
                <select id="src-order">${opts}</select>
            </div>
            <p style="color:var(--text-muted);font-size:13px;margin-top:12px">
                В счёт перенесутся: контрагент, организация, сумма, состав товаров и комментарий.
            </p>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-ok">Создать</button>
        `,
    });
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-ok').onclick = () => {
        const orderId = document.getElementById('src-order').value;
        const order = state.supplierOrders.find(o => o.id === orderId);
        closeModal();

        const draft = {
            number: nextInvoiceNumber(),
            date: todayISO(),
            dueDate: '',
            supplierId: order.supplierId,
            organization: order.organization || '',
            orderId: order.id,
            amount: Number(order.amount) || 0,
            paidAmount: 0,
            status: 'Ожидает оплаты',
            comment: order.comment || '',
            items: Array.isArray(order.items) ? order.items.map(i => ({ ...i })) : [],
        };
        editSupplierInvoice(null, draft);
    };
}

function editSupplierInvoice(inv, draft) {
    const isNew = !inv;
    const data = inv || draft || {
        number: nextInvoiceNumber(),
        date: todayISO(),
        dueDate: '',
        supplierId: state.suppliers[0]?.id || '',
        organization: '',
        orderId: '',
        amount: 0,
        paidAmount: 0,
        status: 'Новый',
        comment: '',
        items: [],
    };
    let items = (data.items || []).map(i => ({ ...i }));

    const supplierOpts = `<option value="">— Не указан —</option>` +
        state.suppliers.map(s => `<option value="${s.id}" ${s.id === data.supplierId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    const orderOpts = `<option value="">— Без заказа —</option>` +
        state.supplierOrders.map(o => {
            const sup = findSupplier(o.supplierId);
            const label = `№ ${o.number} — ${sup ? sup.name : '—'} (${fmtMoney(o.amount)})`;
            return `<option value="${o.id}" ${o.id === data.orderId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
    const statusOpts = INVOICE_STATUSES.map(st => `<option value="${st}" ${st === (data.status || 'Новый') ? 'selected' : ''}>${st}</option>`).join('');

    openModal({
        title: isNew ? 'Новый счёт поставщика' : `Счёт № ${data.number}`,
        large: true,
        body: `
            <div class="form-grid">
                <div class="field">
                    <label>Номер счёта *</label>
                    <input id="i-number" value="${escapeHtml(data.number)}">
                </div>
                <div class="field">
                    <label>Дата счёта *</label>
                    <input id="i-date" type="date" value="${escapeHtml(data.date || todayISO())}">
                </div>
                <div class="field">
                    <label>Срок оплаты</label>
                    <input id="i-due" type="date" value="${escapeHtml(data.dueDate || '')}">
                </div>
                <div class="field">
                    <label>Контрагент</label>
                    <select id="i-supplier">${supplierOpts}</select>
                </div>
                <div class="field">
                    <label>Организация</label>
                    <input id="i-organization" value="${escapeHtml(data.organization || '')}">
                </div>
                <div class="field">
                    <label>Заказ-основание</label>
                    <select id="i-order">${orderOpts}</select>
                </div>
                <div class="field">
                    <label>Сумма счёта, ₽ *</label>
                    <input id="i-amount" type="number" min="0" step="0.01" value="${Number(data.amount) || 0}">
                </div>
                <div class="field">
                    <label>Оплачено, ₽</label>
                    <input id="i-paid" type="number" min="0" step="0.01" value="${Number(data.paidAmount) || 0}">
                </div>
                <div class="field">
                    <label>Статус</label>
                    <select id="i-status">${statusOpts}</select>
                </div>
                <div class="field span-2">
                    <label>Комментарий</label>
                    <textarea id="i-comment" rows="2">${escapeHtml(data.comment || '')}</textarea>
                </div>
            </div>

            <div class="items-block">
                <div class="items-block-header">
                    <h3>Позиции счёта <span style="color:var(--text-muted);font-weight:normal;font-size:13px">(необязательно)</span></h3>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" id="import-items">📥 Из Excel</button>
                        <button class="btn btn-small" id="add-item">+ Строка</button>
                    </div>
                </div>
                <table class="items-table">
                    <thead><tr>
                        <th style="width:30px">#</th>
                        <th>Товар / услуга</th>
                        <th class="col-qty">Кол-во</th>
                        <th class="col-price">Цена, ₽</th>
                        <th class="col-sum">Сумма, ₽</th>
                        <th class="col-del"></th>
                    </tr></thead>
                    <tbody id="items-tbody"></tbody>
                </table>
                <div class="items-block-footer">
                    <span style="color:var(--text-muted)">Позиций: <span id="items-count">0</span></span>
                    <span class="items-total">Итого по позициям: <span id="items-total">0,00 ₽</span> <button type="button" class="btn btn-small" id="apply-items-total" style="margin-left:8px">→ В сумму счёта</button></span>
                </div>
            </div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-save">Сохранить</button>
        `,
    });

    function paint() {
        const tbody = document.getElementById('items-tbody');
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Позиции не обязательны. Можно сохранить счёт только с общей суммой.</td></tr>`;
        } else {
            tbody.innerHTML = items.map((it, idx) => {
                const sum = (Number(it.qty)||0) * (Number(it.price)||0);
                return `
                    <tr data-idx="${idx}">
                        <td>${idx+1}</td>
                        <td><select data-field="productId">
                            ${state.products.map(p => `<option value="${p.id}" ${p.id===it.productId?'selected':''}>${escapeHtml(p.name)}${p.sku ? ' ('+escapeHtml(p.sku)+')' : ''}</option>`).join('')}
                        </select></td>
                        <td class="col-qty"><input type="number" min="0" step="0.001" data-field="qty" value="${Number(it.qty)||0}" style="text-align:right"></td>
                        <td class="col-price"><input type="number" min="0" step="0.01" data-field="price" value="${Number(it.price)||0}" style="text-align:right"></td>
                        <td class="col-sum">${fmtMoney(sum)}</td>
                        <td class="col-del"><button class="btn btn-icon btn-danger" data-act="del">×</button></td>
                    </tr>
                `;
            }).join('');
        }
        const total = items.reduce((s,i) => s + (Number(i.qty)||0)*(Number(i.price)||0), 0);
        document.getElementById('items-count').textContent = items.length;
        document.getElementById('items-total').textContent = fmtMoney(total);
    }

    document.getElementById('add-item').onclick = () => {
        const p = state.products[0];
        if (!p) { toast('Сначала добавьте товары', 'error'); return; }
        items.push({ productId: p.id, qty: 1, price: Number(p.price)||0 });
        paint();
    };
    document.getElementById('import-items').onclick = () => {
        openImportItemsDialog({ priceField: true, onApply: (newItems) => { items.push(...newItems); paint(); } });
    };
    document.getElementById('apply-items-total').onclick = () => {
        const total = items.reduce((s,i) => s + (Number(i.qty)||0)*(Number(i.price)||0), 0);
        document.getElementById('i-amount').value = total.toFixed(2);
        toast('Сумма счёта обновлена', 'success');
    };
    document.getElementById('items-tbody').addEventListener('input', (e) => {
        const tr = e.target.closest('tr'); if (!tr) return;
        const idx = Number(tr.dataset.idx);
        const f = e.target.dataset.field;
        if (f === 'productId') {
            items[idx].productId = e.target.value;
            const p = findProduct(e.target.value);
            if (p && (!items[idx].price || items[idx].price === 0)) items[idx].price = Number(p.price)||0;
        } else {
            items[idx][f] = parseFloat(e.target.value) || 0;
        }
        paint();
    });
    document.getElementById('items-tbody').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act="del"]'); if (!btn) return;
        const idx = Number(btn.closest('tr').dataset.idx);
        items.splice(idx, 1); paint();
    });

    paint();

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
        const number = document.getElementById('i-number').value.trim();
        const date = document.getElementById('i-date').value;
        const amount = parseFloat(document.getElementById('i-amount').value) || 0;
        const paid = parseFloat(document.getElementById('i-paid').value) || 0;
        if (!number) { toast('Укажите номер счёта', 'error'); return; }
        if (!date) { toast('Укажите дату счёта', 'error'); return; }
        if (amount <= 0) { toast('Сумма счёта должна быть больше 0', 'error'); return; }
        if (paid < 0) { toast('Оплачено не может быть отрицательным', 'error'); return; }

        const cleanItems = items
            .filter(i => i.productId && (Number(i.qty) > 0))
            .map(i => ({ productId: i.productId, qty: Number(i.qty), price: Number(i.price)||0 }));

        const payload = {
            number,
            date,
            dueDate: document.getElementById('i-due').value,
            supplierId: document.getElementById('i-supplier').value,
            organization: document.getElementById('i-organization').value.trim(),
            orderId: document.getElementById('i-order').value,
            amount,
            paidAmount: paid,
            status: document.getElementById('i-status').value,
            comment: document.getElementById('i-comment').value.trim(),
            items: cleanItems,
        };
        payload.status = invoiceAutoStatus(payload);

        if (isNew) {
            state.supplierInvoices.push({ id: uid('inv'), ...payload });
            toast('Счёт создан', 'success');
        } else {
            Object.assign(inv, payload);
            toast('Счёт сохранён', 'success');
        }
        saveState();
        closeModal();
        renderPurchasing();
    };
}

function deleteSupplierInvoice(id) {
    state.supplierInvoices = state.supplierInvoices.filter(i => i.id !== id);
    saveState();
    toast('Счёт удалён');
    renderPurchasing();
}

function editSupplier(s) {
    const isNew = !s;
    const data = s || { name: '', inn: '', contact: '', phone: '', email: '' };
    openModal({
        title: isNew ? 'Новый поставщик' : 'Редактирование поставщика',
        body: `
            <div class="form-grid">
                <div class="field span-2">
                    <label>Наименование *</label>
                    <input id="f-name" value="${escapeHtml(data.name)}" autofocus>
                    <div class="field-error" id="err-name"></div>
                </div>
                <div class="field">
                    <label>ИНН</label>
                    <input id="f-inn" value="${escapeHtml(data.inn || '')}">
                </div>
                <div class="field">
                    <label>Контактное лицо</label>
                    <input id="f-contact" value="${escapeHtml(data.contact || '')}">
                </div>
                <div class="field">
                    <label>Телефон</label>
                    <input id="f-phone" value="${escapeHtml(data.phone || '')}">
                </div>
                <div class="field">
                    <label>Email</label>
                    <input id="f-email" value="${escapeHtml(data.email || '')}">
                </div>
            </div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-save">Сохранить</button>
        `,
    });
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
        const name = document.getElementById('f-name').value.trim();
        if (!name) {
            document.getElementById('err-name').textContent = 'Укажите наименование';
            return;
        }
        const payload = {
            name,
            inn: document.getElementById('f-inn').value.trim(),
            contact: document.getElementById('f-contact').value.trim(),
            phone: document.getElementById('f-phone').value.trim(),
            email: document.getElementById('f-email').value.trim(),
        };
        if (isNew) {
            state.suppliers.push({ id: uid('s'), ...payload });
            toast('Поставщик создан', 'success');
        } else {
            Object.assign(s, payload);
            toast('Поставщик сохранён', 'success');
        }
        saveState();
        closeModal();
        renderPurchasing();
    };
}

function deleteSupplier(id) {
    const usedIn = state.purchases.find(p => p.supplierId === id);
    if (usedIn) {
        toast('Поставщик используется в поступлениях, удалить нельзя', 'error');
        return;
    }
    state.suppliers = state.suppliers.filter(s => s.id !== id);
    saveState();
    toast('Поставщик удалён');
    renderPurchasing();
}

// =============================================================
// View: Поступления (закупки)
// =============================================================
function renderPurchases() {
    setTitle('Поступления товаров', `<button class="btn btn-primary" id="add-purchase">+ Новое поступление</button>`);
    document.getElementById('add-purchase').onclick = () => editPurchase(null);

    const list = [...state.purchases].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const content = document.getElementById('content');

    if (list.length === 0) {
        content.innerHTML = `<div class="card">${renderEmptyState({
            icon: '📥',
            title: 'Поступлений пока нет',
            hint: 'Создайте первое поступление, чтобы оприходовать товары на склад.',
        })}</div>`;
        return;
    }

    content.innerHTML = `
        <div class="card">
            <div class="table-toolbar">
                <input class="search-input" id="search" placeholder="Поиск по номеру, поставщику или складу...">
            </div>
            <table>
                <thead>
                    <tr>
                        <th>№ документа</th>
                        <th>Дата</th>
                        <th>Поставщик</th>
                        <th>Склад</th>
                        <th class="col-num">Позиций</th>
                        <th class="col-num">Сумма</th>
                        <th class="col-actions">Действия</th>
                    </tr>
                </thead>
                <tbody id="rows">
                    ${list.map(d => {
                        const total = (d.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
                        const supplier = findSupplier(d.supplierId);
                        const wh = findWarehouse(d.warehouseId);
                        return `
                            <tr data-id="${d.id}">
                                <td><strong>${escapeHtml(d.number || '')}</strong></td>
                                <td>${fmtDate(d.date)}</td>
                                <td>${escapeHtml(supplier ? supplier.name : '—')}</td>
                                <td>${escapeHtml(wh ? wh.name : '—')}</td>
                                <td class="col-num">${(d.items || []).length}</td>
                                <td class="col-num"><strong>${fmtMoney(total)}</strong></td>
                                <td class="col-actions">
                                    <button class="btn btn-small" data-act="view">Открыть</button>
                                    <button class="btn btn-small" data-act="edit">Изменить</button>
                                    <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('search').oninput = (e) => filterRows(e.target.value);
    document.getElementById('rows').onclick = (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const doc = state.purchases.find(p => p.id === id);
        if (btn.dataset.act === 'view') viewPurchase(doc);
        if (btn.dataset.act === 'edit') editPurchase(doc);
        if (btn.dataset.act === 'del') confirmDelete(`Поступление №${doc.number}`, () => deletePurchase(id));
    };
}

function nextPurchaseNumber() {
    const nums = state.purchases.map(p => parseInt((p.number || '').replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return String(next).padStart(6, '0');
}

function viewPurchase(doc) {
    const supplier = findSupplier(doc.supplierId);
    const wh = findWarehouse(doc.warehouseId);
    const total = (doc.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);

    openModal({
        title: `Поступление № ${doc.number} от ${fmtDate(doc.date)}`,
        large: true,
        body: `
            <div class="doc-meta">
                <div><div class="label">Поставщик</div><div class="value">${escapeHtml(supplier ? supplier.name : '—')}</div></div>
                <div><div class="label">Склад</div><div class="value">${escapeHtml(wh ? wh.name : '—')}</div></div>
                <div><div class="label">Сумма</div><div class="value">${fmtMoney(total)}</div></div>
            </div>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>#</th><th>Товар</th><th>Ед.</th>
                        <th class="col-qty">Кол-во</th>
                        <th class="col-price">Цена</th>
                        <th class="col-sum">Сумма</th>
                    </tr>
                </thead>
                <tbody>
                    ${(doc.items || []).map((it, idx) => {
                        const p = findProduct(it.productId);
                        return `
                            <tr>
                                <td>${idx + 1}</td>
                                <td>${escapeHtml(p ? p.name : 'Удалён')}</td>
                                <td>${escapeHtml(p ? p.unit : '')}</td>
                                <td class="col-qty">${fmtQty(it.qty)}</td>
                                <td class="col-price">${fmtMoney(it.price)}</td>
                                <td class="col-sum">${fmtMoney((Number(it.qty)||0) * (Number(it.price)||0))}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            ${doc.comment ? `<div style="margin-top:14px"><div style="font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Комментарий</div><div>${escapeHtml(doc.comment)}</div></div>` : ''}
        `,
        footer: `<button class="btn btn-primary" id="modal-cancel">Закрыть</button>`,
    });
    document.getElementById('modal-cancel').onclick = closeModal;
}

function editPurchase(doc, draft) {
    if (state.warehouses.length === 0) {
        toast('Сначала создайте хотя бы один склад', 'error');
        setView('warehouses');
        return;
    }
    if (state.products.length === 0) {
        toast('Сначала добавьте товары', 'error');
        setView('products');
        return;
    }

    const isNew = !doc;
    const data = doc || draft || {
        number: nextPurchaseNumber(),
        date: todayISO(),
        supplierId: state.suppliers[0]?.id || '',
        organization: '',
        warehouseId: state.warehouses[0]?.id || '',
        orderId: '',
        items: [],
        comment: '',
    };
    // Working copy of items so we don't mutate state until save
    let items = (data.items || []).map(it => ({ ...it }));

    openModal({
        title: isNew ? 'Новое поступление' : `Поступление № ${data.number}`,
        large: true,
        body: `
            <div class="form-grid">
                <div class="field">
                    <label>Номер *</label>
                    <input id="f-number" value="${escapeHtml(data.number)}">
                </div>
                <div class="field">
                    <label>Дата *</label>
                    <input id="f-date" type="date" value="${escapeHtml(data.date)}">
                </div>
                <div class="field">
                    <label>Поставщик</label>
                    <select id="f-supplier">
                        <option value="">— Не указан —</option>
                        ${state.suppliers.map(s => `<option value="${s.id}" ${s.id === data.supplierId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="field">
                    <label>Склад *</label>
                    <select id="f-warehouse">
                        ${state.warehouses.map(w => `<option value="${w.id}" ${w.id === data.warehouseId ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="field">
                    <label>Организация</label>
                    <input id="f-organization" value="${escapeHtml(data.organization || '')}">
                </div>
                <div class="field">
                    <label>Заказ поставщику</label>
                    <select id="f-order">
                        <option value="">— Без заказа —</option>
                        ${state.supplierOrders.map(o => {
                            const s = findSupplier(o.supplierId);
                            return `<option value="${o.id}" ${o.id === data.orderId ? 'selected' : ''}>№ ${escapeHtml(o.number)} — ${escapeHtml(s ? s.name : '')}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="field span-2">
                    <label>Комментарий</label>
                    <textarea id="f-comment">${escapeHtml(data.comment || '')}</textarea>
                </div>
            </div>

            <div class="items-block">
                <div class="items-block-header">
                    <h3>Товары</h3>
                    <button class="btn btn-small" id="add-item">+ Добавить строку</button>
                </div>
                <table class="items-table">
                    <thead>
                        <tr>
                            <th style="width:30px">#</th>
                            <th>Товар</th>
                            <th class="col-qty">Кол-во</th>
                            <th class="col-price">Цена, ₽</th>
                            <th class="col-sum">Сумма, ₽</th>
                            <th class="col-del"></th>
                        </tr>
                    </thead>
                    <tbody id="items-tbody"></tbody>
                </table>
                <div class="items-block-footer">
                    <span style="color:var(--text-muted)">Итого позиций: <span id="items-count">0</span></span>
                    <span class="items-total">Итого: <span id="items-total">0,00 ₽</span></span>
                </div>
            </div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-save">Провести и сохранить</button>
        `,
    });

    function renderItemsRows() {
        const tbody = document.getElementById('items-tbody');
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Нет позиций. Нажмите «Добавить строку».</td></tr>`;
        } else {
            tbody.innerHTML = items.map((it, idx) => {
                const sum = (Number(it.qty) || 0) * (Number(it.price) || 0);
                return `
                    <tr data-idx="${idx}">
                        <td>${idx + 1}</td>
                        <td>
                            <select data-field="productId">
                                ${state.products.map(p => `<option value="${p.id}" ${p.id === it.productId ? 'selected' : ''}>${escapeHtml(p.name)}${p.sku ? ' (' + escapeHtml(p.sku) + ')' : ''}</option>`).join('')}
                            </select>
                        </td>
                        <td class="col-qty"><input type="number" min="0" step="0.001" data-field="qty" value="${Number(it.qty) || 0}" style="text-align:right"></td>
                        <td class="col-price"><input type="number" min="0" step="0.01" data-field="price" value="${Number(it.price) || 0}" style="text-align:right"></td>
                        <td class="col-sum">${fmtMoney(sum)}</td>
                        <td class="col-del"><button class="btn btn-icon btn-danger" data-act="del-row" title="Удалить">×</button></td>
                    </tr>
                `;
            }).join('');
        }
        const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
        document.getElementById('items-count').textContent = items.length;
        document.getElementById('items-total').textContent = fmtMoney(total);
    }

    document.getElementById('add-item').onclick = () => {
        const firstProduct = state.products[0];
        items.push({
            productId: firstProduct.id,
            qty: 1,
            price: Number(firstProduct.price) || 0,
        });
        renderItemsRows();
    };

    document.getElementById('items-tbody').addEventListener('input', (e) => {
        const tr = e.target.closest('tr');
        if (!tr) return;
        const idx = Number(tr.dataset.idx);
        const field = e.target.dataset.field;
        if (!field) return;
        if (field === 'productId') {
            items[idx].productId = e.target.value;
            const p = findProduct(e.target.value);
            if (p && (!items[idx].price || items[idx].price === 0)) items[idx].price = Number(p.price) || 0;
        } else if (field === 'qty') {
            items[idx].qty = parseFloat(e.target.value) || 0;
        } else if (field === 'price') {
            items[idx].price = parseFloat(e.target.value) || 0;
        }
        renderItemsRows();
    });

    document.getElementById('items-tbody').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act="del-row"]');
        if (!btn) return;
        const tr = btn.closest('tr');
        const idx = Number(tr.dataset.idx);
        items.splice(idx, 1);
        renderItemsRows();
    });

    renderItemsRows();

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
        const number = document.getElementById('f-number').value.trim();
        const date = document.getElementById('f-date').value;
        const supplierId = document.getElementById('f-supplier').value;
        const warehouseId = document.getElementById('f-warehouse').value;
        const organization = document.getElementById('f-organization').value.trim();
        const orderId = document.getElementById('f-order').value;
        const comment = document.getElementById('f-comment').value.trim();

        if (!number) { toast('Укажите номер документа', 'error'); return; }
        if (!date) { toast('Укажите дату', 'error'); return; }
        if (!warehouseId) { toast('Выберите склад', 'error'); return; }
        if (items.length === 0) { toast('Добавьте хотя бы одну позицию', 'error'); return; }
        if (items.some(i => !i.productId || !(Number(i.qty) > 0))) {
            toast('Заполните все строки: товар и кол-во > 0', 'error'); return;
        }

        const payload = { number, date, supplierId, warehouseId, organization, orderId, comment, items: items.map(i => ({ productId: i.productId, qty: Number(i.qty), price: Number(i.price) || 0 })) };
        if (isNew) {
            state.purchases.push({ id: uid('doc'), ...payload });
            toast('Приёмка проведена', 'success');
        } else {
            Object.assign(doc, payload);
            toast('Приёмка обновлена', 'success');
        }
        saveState();
        closeModal();
        if (state.currentView === 'purchases') renderPurchases();
        else renderPurchasing();
    };
}

function deletePurchase(id) {
    state.purchases = state.purchases.filter(p => p.id !== id);
    saveState();
    toast('Поступление удалено');
    renderPurchases();
}

// =============================================================
// View: Остатки
// =============================================================
function renderStock() {
    setTitle('Остатки на складах');

    const stock = computeStock();
    const content = document.getElementById('content');

    const totalQty = stock.reduce((s, r) => s + r.qty, 0);
    const totalValue = stock.reduce((s, r) => s + r.value, 0);
    const positions = stock.filter(r => r.qty !== 0).length;
    const purchaseTotal = state.purchases.reduce(
        (s, d) => s + (d.items || []).reduce((ss, i) => ss + (Number(i.qty) || 0) * (Number(i.price) || 0), 0),
        0
    );

    const summary = `
        <div class="summary-row">
            <div class="summary-card">
                <div class="summary-label">Складов</div>
                <div class="summary-value">${state.warehouses.length}</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">Позиций с остатком</div>
                <div class="summary-value">${positions}</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">Суммарное кол-во</div>
                <div class="summary-value">${fmtQty(totalQty)}</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">Стоимость остатков</div>
                <div class="summary-value">${fmtMoney(totalValue)}</div>
            </div>
        </div>
    `;

    if (stock.length === 0) {
        content.innerHTML = summary + `<div class="card">${renderEmptyState({
            icon: '📊',
            title: 'Остатков пока нет',
            hint: 'Оформите поступление, чтобы товары появились на складах.',
        })}</div>`;
        return;
    }

    const whOptions = `<option value="">Все склады</option>` +
        state.warehouses.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');

    content.innerHTML = summary + `
        <div class="filters-row">
            <select id="filter-wh">${whOptions}</select>
            <input class="search-input" id="search" placeholder="Поиск по товару..." style="flex:1">
        </div>
        <div class="card">
            <table>
                <thead>
                    <tr>
                        <th>Склад</th>
                        <th>Товар</th>
                        <th>Артикул</th>
                        <th>Ед.</th>
                        <th class="col-num">Количество</th>
                        <th class="col-num">Сумма</th>
                    </tr>
                </thead>
                <tbody id="rows">
                    ${stock.map(r => {
                        const w = findWarehouse(r.warehouseId);
                        const p = findProduct(r.productId);
                        return `
                            <tr data-wh="${r.warehouseId}" data-search="${escapeHtml((p?.name || '') + ' ' + (p?.sku || '') + ' ' + (w?.name || ''))}">
                                <td>${escapeHtml(w ? w.name : '—')}</td>
                                <td><strong>${escapeHtml(p ? p.name : '— удалён —')}</strong></td>
                                <td>${escapeHtml(p ? (p.sku || '') : '')}</td>
                                <td>${escapeHtml(p ? p.unit : '')}</td>
                                <td class="col-num"><strong>${fmtQty(r.qty)}</strong></td>
                                <td class="col-num">${fmtMoney(r.value)}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top:12px;color:var(--text-muted);font-size:13px">Сумма всех закупок: <strong>${fmtMoney(purchaseTotal)}</strong></div>
    `;

    const filterWh = document.getElementById('filter-wh');
    const search = document.getElementById('search');
    function applyFilters() {
        const wh = filterWh.value;
        const q = search.value.toLowerCase();
        document.querySelectorAll('#rows tr').forEach(tr => {
            const matchWh = !wh || tr.dataset.wh === wh;
            const matchQ = !q || tr.dataset.search.toLowerCase().includes(q);
            tr.style.display = matchWh && matchQ ? '' : 'none';
        });
    }
    filterWh.onchange = applyFilters;
    search.oninput = applyFilters;
}

// =============================================================
// View: Настройки
// =============================================================
function renderSettings() {
    setTitle('Настройки');
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="card" style="padding:20px;max-width:720px">
            <h3 style="margin-bottom:12px">Импорт / экспорт товаров (Excel)</h3>
            <p style="color:var(--text-muted);margin-bottom:14px;font-size:13px;line-height:1.5">
                Загрузите справочник товаров из Excel-файла (<code>.xlsx</code>, <code>.xls</code>) или CSV — выгрузка из МойСклад, 1С или вручную.
                Колонки распознаются по заголовкам: Наименование, Код, Артикул, Штрихкод, Цена закупки, Цена продажи, Группа, Ед. изм., Остаток, Описание, Тип.
                Группа поддерживает вложенность через «/», например <code>Молочные/Сыры</code>.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-primary" id="btn-import-products">⬇ Импорт товаров из Excel</button>
                <button class="btn" id="btn-export-products">⬆ Экспорт товаров в Excel</button>
                <button class="btn" id="btn-dedupe-products">🧹 Удалить дубли товаров</button>
            </div>

            <h3 style="margin-top:28px;margin-bottom:12px">Резервная копия (JSON)</h3>
            <p style="color:var(--text-muted);margin-bottom:14px;font-size:13px">Все данные хранятся локально в этом браузере (localStorage). JSON содержит весь склад целиком — товары, склады, поставщиков и все документы.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn" id="btn-export">Экспорт в JSON</button>
                <button class="btn" id="btn-import">Импорт из JSON</button>
                <button class="btn" id="btn-seed">Загрузить демо-данные</button>
                <button class="btn btn-danger" id="btn-clear">Очистить все данные</button>
            </div>
            <input type="file" id="import-file" accept="application/json" style="display:none">

            <h3 style="margin-top:28px;margin-bottom:8px">Текущее состояние</h3>
            <ul style="color:var(--text-muted);line-height:1.8">
                <li>Складов: <strong>${state.warehouses.length}</strong></li>
                <li>Товаров: <strong>${state.products.length}</strong></li>
                <li>Групп товаров: <strong>${state.productGroups.length}</strong></li>
                <li>Поставщиков: <strong>${state.suppliers.length}</strong></li>
                <li>Заказов поставщикам: <strong>${state.supplierOrders.length}</strong></li>
                <li>Счетов поставщиков: <strong>${state.supplierInvoices.length}</strong></li>
                <li>Поступлений (приёмок): <strong>${state.purchases.length}</strong></li>
                <li>Оприходований: <strong>${state.stockIns.length}</strong></li>
                <li>Списаний: <strong>${state.writeOffs.length}</strong></li>
                <li>Перемещений: <strong>${state.transfers.length}</strong></li>
                <li>Инвентаризаций: <strong>${state.inventories.length}</strong></li>
            </ul>
        </div>
    `;

    document.getElementById('btn-import-products').onclick = () => openImportProductsDialog();
    document.getElementById('btn-export-products').onclick = () => exportProductsCSV();
    document.getElementById('btn-dedupe-products').onclick = () => dedupeProducts();
    document.getElementById('btn-export').onclick = exportData;
    document.getElementById('btn-import').onclick = () => document.getElementById('import-file').click();
    document.getElementById('import-file').onchange = importData;
    document.getElementById('btn-seed').onclick = seedDemoData;
    document.getElementById('btn-clear').onclick = () => {
        confirmDelete('ВСЕ данные', () => {
            state.warehouses = []; state.products = []; state.productGroups = []; state.suppliers = []; state.supplierOrders = []; state.supplierInvoices = []; state.purchases = []; state.stockIns = []; state.writeOffs = []; state.transfers = []; state.inventories = [];
            saveState();
            toast('Данные очищены');
            renderSettings();
        });
    };
}

function exportData() {
    const data = {
        warehouses: state.warehouses,
        products: state.products,
        suppliers: state.suppliers,
        purchases: state.purchases,
        exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouse-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Экспорт готов', 'success');
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            state.warehouses = data.warehouses || [];
            state.products = data.products || [];
            state.productGroups = data.productGroups || [];
            state.suppliers = data.suppliers || [];
            state.supplierOrders = data.supplierOrders || [];
            state.supplierInvoices = data.supplierInvoices || [];
            state.purchases = data.purchases || [];
            state.stockIns = data.stockIns || [];
            state.writeOffs = data.writeOffs || [];
            state.transfers = data.transfers || [];
            state.inventories = data.inventories || [];
            saveState();
            toast('Данные импортированы', 'success');
            renderSettings();
        } catch (err) {
            toast('Не удалось разобрать файл', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// =============================================================
// Search filter (generic for table rows)
// =============================================================
function filterRows(query) {
    const q = query.toLowerCase().trim();
    document.querySelectorAll('#rows tr').forEach(tr => {
        const text = tr.textContent.toLowerCase();
        tr.style.display = !q || text.includes(q) ? '' : 'none';
    });
}

// =============================================================
// Seed demo data
// =============================================================
function seedDemoData() {
    const wh1 = { id: uid('wh'), name: 'Главный склад', address: 'Москва, ул. Складская, 1', responsible: 'Иванов И.И.' };
    const wh2 = { id: uid('wh'), name: 'Магазин на Тверской', address: 'Москва, Тверская, 15', responsible: 'Петров П.П.' };

    const gMilk = { id: uid('grp'), name: 'Молочные', parentId: null };
    const gBread = { id: uid('grp'), name: 'Хлебобулочные', parentId: null };
    const gGroc = { id: uid('grp'), name: 'Бакалея', parentId: null };
    const gServ = { id: uid('grp'), name: 'Услуги', parentId: null };

    const p1 = { id: uid('p'), type: 'товар', code: '00000001', sku: 'A-001', barcode: '4600101010101', name: 'Молоко 3.2% 1л',          groupId: gMilk.id,  unit: 'шт', price: 75.00,   priceSale: 95.00,   supplierId: '', description: '' };
    const p2 = { id: uid('p'), type: 'товар', code: '00000002', sku: 'A-002', barcode: '4600101010202', name: 'Хлеб «Бородинский»',     groupId: gBread.id, unit: 'шт', price: 45.00,   priceSale: 65.00,   supplierId: '', description: '' };
    const p3 = { id: uid('p'), type: 'товар', code: '00000003', sku: 'A-003', barcode: '',              name: 'Сыр «Российский»',       groupId: gMilk.id,  unit: 'кг', price: 580.00,  priceSale: 780.00,  supplierId: '', description: '' };
    const p4 = { id: uid('p'), type: 'товар', code: '00000004', sku: 'B-101', barcode: '',              name: 'Кофе «Арабика» зерно',   groupId: gGroc.id,  unit: 'кг', price: 1450.00, priceSale: 1990.00, supplierId: '', description: '' };
    const p5 = { id: uid('p'), type: 'товар', code: '00000005', sku: 'B-102', barcode: '',              name: 'Сахар-песок',            groupId: gGroc.id,  unit: 'кг', price: 65.00,   priceSale: 89.00,   supplierId: '', description: '' };
    const p6 = { id: uid('p'), type: 'услуга', code: '00000006', sku: 'S-01', barcode: '',              name: 'Доставка до магазина',   groupId: gServ.id,  unit: 'услуга', price: 0,    priceSale: 500.00,  supplierId: '', description: '' };

    const s1 = { id: uid('s'), name: 'ООО «Молокозавод №1»', inn: '7701234567', contact: 'Сидоров А.А.', phone: '+7 495 123-45-67', email: 'sales@milk1.ru' };
    const s2 = { id: uid('s'), name: 'ИП Хлебников', inn: '770898765432', contact: 'Хлебников В.', phone: '+7 916 555-12-34', email: '' };
    const s3 = { id: uid('s'), name: 'ООО «Бакалея Опт»', inn: '7705556677', contact: 'Кузнецова М.', phone: '+7 495 987-65-43', email: 'opt@bakaleya.ru' };

    state.warehouses = [wh1, wh2];
    state.productGroups = [gMilk, gBread, gGroc, gServ];
    state.products = [p1, p2, p3, p4, p5, p6];
    state.suppliers = [s1, s2, s3];

    const nowISO = new Date().toISOString().slice(0, 16);
    state.supplierOrders = [
        { id: uid('ord'), number: '000001', datetime: nowISO, supplierId: s1.id, organization: 'ООО «Наша Компания»', amount: 32500, invoicesIssued: 1, paidAmount: 32500, accepted: true,  pending: false, status: 'Принят',   sent: true,  printed: true,  comment: 'Молочка, партия 12' },
        { id: uid('ord'), number: '000002', datetime: nowISO, supplierId: s2.id, organization: 'ООО «Наша Компания»', amount: 8000,  invoicesIssued: 1, paidAmount: 4000,  accepted: false, pending: true,  status: 'В работе', sent: true,  printed: false, comment: 'Хлебобулочные на завтра' },
        { id: uid('ord'), number: '000003', datetime: nowISO, supplierId: s3.id, organization: 'ИП Иванов И.И.',     amount: 47400, invoicesIssued: 2, paidAmount: 0,     accepted: false, pending: true,  status: 'Новый',    sent: false, printed: false, comment: '' },
    ];

    const ord1 = state.supplierOrders[0];
    const ord2 = state.supplierOrders[1];
    const ord3 = state.supplierOrders[2];
    const today = todayISO();
    const dueIn = (days) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    };

    state.supplierInvoices = [
        {
            id: uid('inv'), number: 'СЧ-00001', date: today, dueDate: dueIn(-2),
            supplierId: s1.id, organization: 'ООО «Наша Компания»', orderId: ord1.id,
            amount: 32500, paidAmount: 32500, status: 'Оплачен',
            comment: 'Полная оплата по заказу №000001',
            items: [
                { productId: p1.id, qty: 200, price: 70.00 },
                { productId: p3.id, qty: 15, price: 540.00 },
            ],
        },
        {
            id: uid('inv'), number: 'СЧ-00002', date: today, dueDate: dueIn(5),
            supplierId: s2.id, organization: 'ООО «Наша Компания»', orderId: ord2.id,
            amount: 8000, paidAmount: 4000, status: 'Частично оплачен',
            comment: 'Аванс 50%',
            items: [
                { productId: p2.id, qty: 100, price: 40.00 },
            ],
        },
        {
            id: uid('inv'), number: 'СЧ-00003', date: today, dueDate: dueIn(10),
            supplierId: s3.id, organization: 'ИП Иванов И.И.', orderId: ord3.id,
            amount: 47400, paidAmount: 0, status: 'Ожидает оплаты',
            comment: 'Бакалея — крупная партия',
            items: [
                { productId: p4.id, qty: 30, price: 1380.00 },
                { productId: p5.id, qty: 100, price: 60.00 },
            ],
        },
    ];

    state.purchases = [
        {
            id: uid('doc'), number: '000001', date: todayISO(),
            supplierId: s1.id, warehouseId: wh1.id, comment: 'Стартовая партия',
            items: [
                { productId: p1.id, qty: 200, price: 70.00 },
                { productId: p3.id, qty: 15, price: 540.00 },
            ],
        },
        {
            id: uid('doc'), number: '000002', date: todayISO(),
            supplierId: s2.id, warehouseId: wh1.id, comment: '',
            items: [
                { productId: p2.id, qty: 100, price: 40.00 },
            ],
        },
        {
            id: uid('doc'), number: '000003', date: todayISO(),
            supplierId: s3.id, warehouseId: wh2.id, comment: 'Доставка курьером',
            items: [
                { productId: p4.id, qty: 30, price: 1380.00 },
                { productId: p5.id, qty: 100, price: 60.00 },
            ],
        },
    ];

    saveState();
    toast('Демо-данные загружены', 'success');
    setView(state.currentView);
}

// =============================================================
// Документы склада: Оприходования, Списания, Перемещения, Инвентаризации
// =============================================================

const STOCK_DOCS = {
    stockIns:    { collection: 'stockIns',    title: 'Оприходования',  icon: '📦', single: 'Оприходование',  prefix: 'ST' },
    writeOffs:   { collection: 'writeOffs',   title: 'Списания',       icon: '🗑️', single: 'Списание',       prefix: 'WO' },
    transfers:   { collection: 'transfers',   title: 'Перемещения',    icon: '🔁', single: 'Перемещение',    prefix: 'TR' },
    inventories: { collection: 'inventories', title: 'Инвентаризации', icon: '🧾', single: 'Инвентаризация', prefix: 'IN' },
};

// renderProducts() удалён — документы склада теперь как табы внутри renderProducts()

function nextDocNumber(collection, prefix) {
    const nums = state[collection]
        .map(d => parseInt((d.number || '').replace(/\D/g, ''), 10))
        .filter(n => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `${prefix}-${String(next).padStart(5, '0')}`;
}

function statusBadge(status) {
    if (status === 'draft') return '<span class="badge badge-warn">Черновик</span>';
    if (status === 'done')  return '<span class="badge badge-success">Проведена</span>';
    return '<span class="badge badge-success">Проведён</span>';
}

// ---------- Оприходования (приёмка с проверкой качества/количества) ----------
const STOCKIN_SOURCES = ['От поставщика', 'Из производства', 'По инвентаризации (излишки)', 'Возврат от покупателя', 'Без основания', 'Прочее'];
const STOCKIN_BASIS_TYPES = ['ТОРГ-12', 'УПД', 'Накладная', 'Счёт-фактура', 'Акт', 'Без документа'];
const STOCKIN_STAGES = [
    { key: 'draft',        label: 'Черновик',         cls: 'badge' },
    { key: 'unloading',    label: 'Разгрузка',        cls: 'badge badge-warn' },
    { key: 'checking',     label: 'Проверка',         cls: 'badge badge-warn' },
    { key: 'discrepancy',  label: 'С расхождениями',  cls: 'badge badge-warn' },
    { key: 'done',         label: 'Оприходовано',     cls: 'badge badge-success' },
];

function stockInStageBadge(s) {
    const stage = STOCKIN_STAGES.find(x => x.key === s) || STOCKIN_STAGES[0];
    return `<span class="${stage.cls}">${stage.label}</span>`;
}

function renderStockInsList() {
    const list = [...state.stockIns].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const body = document.getElementById('stock-docs-body');
    if (list.length === 0) {
        body.innerHTML = `<div class="card">${renderEmptyState({
            icon: '📦', title: 'Оприходований нет',
            hint: 'Оприходование — это полная приёмка товара: разгрузка, сверка с ТОРГ-12/УПД, проверка качества и количества, фиксация расхождений.',
        })}</div>`;
        return;
    }
    body.innerHTML = `
        <div class="card">
            <div class="table-toolbar"><input class="search-input" id="search" placeholder="Поиск..."></div>
            <div class="table-scroll">
            <table class="receipts-table">
                <thead><tr>
                    <th>№</th><th>Дата</th><th>Склад</th><th>Источник</th>
                    <th>Поставщик</th><th>Документ-основание</th><th>МОЛ</th>
                    <th class="col-num">Позиций</th><th class="col-num">Сумма</th>
                    <th>Проверка</th><th>Расхождения</th><th>Этап</th>
                    <th>Комментарий</th><th class="col-actions">Действия</th>
                </tr></thead>
                <tbody id="rows">${list.map(d => {
                    const total = (d.items||[]).reduce((s,i) => s + (Number(i.qty)||0)*(Number(i.price)||0), 0);
                    const wh = findWarehouse(d.warehouseId);
                    const supplier = d.supplierId ? findSupplier(d.supplierId) : null;
                    const basis = (d.basisType && d.basisNumber) ? `${d.basisType} № ${d.basisNumber}${d.basisDate ? ' от ' + fmtDate(d.basisDate) : ''}` : '—';
                    const checks = `
                        <span class="dot ${d.qtyChecked ? 'dot-ok' : ''}" title="Кол-во">${d.qtyChecked ? '✓' : '○'}</span>
                        <span class="dot ${d.qualityChecked ? 'dot-ok' : ''}" title="Качество">${d.qualityChecked ? '✓' : '○'}</span>
                    `;
                    const discrepancy = d.hasDiscrepancy
                        ? `<span class="badge badge-warn">${d.actNumber ? 'Акт № ' + escapeHtml(d.actNumber) : 'Есть'}</span>`
                        : '<span class="dot">—</span>';
                    return `
                        <tr data-id="${d.id}">
                            <td><strong>${escapeHtml(d.number||'')}</strong></td>
                            <td>${fmtDate(d.date)}</td>
                            <td>${escapeHtml(wh?wh.name:'—')}</td>
                            <td>${escapeHtml(d.source||'—')}</td>
                            <td>${escapeHtml(supplier ? supplier.name : '—')}</td>
                            <td>${basis}</td>
                            <td>${escapeHtml(d.responsible||'—')}</td>
                            <td class="col-num">${(d.items||[]).length}</td>
                            <td class="col-num"><strong>${fmtMoney(total)}</strong></td>
                            <td style="white-space:nowrap">${checks}</td>
                            <td>${discrepancy}</td>
                            <td>${stockInStageBadge(d.status)}</td>
                            <td class="ellipsis" title="${escapeHtml(d.comment||'')}">${escapeHtml(d.comment||'')}</td>
                            <td class="col-actions">
                                <button class="btn btn-small" data-act="edit">Изменить</button>
                                <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                            </td>
                        </tr>
                    `;
                }).join('')}</tbody>
            </table>
            </div>
        </div>
    `;
    document.getElementById('search').oninput = (e) => filterRows(e.target.value);
    document.getElementById('rows').onclick = (e) => {
        const btn = e.target.closest('button'); if (!btn) return;
        const id = btn.closest('tr').dataset.id;
        const d = state.stockIns.find(x => x.id === id);
        if (btn.dataset.act === 'edit') editStockIn(d);
        if (btn.dataset.act === 'del') confirmDelete(`Оприходование ${d.number}`, () => {
            state.stockIns = state.stockIns.filter(x => x.id !== id);
            saveState(); toast('Удалено'); renderProducts();
        });
    };
}

function editStockIn(doc) {
    if (state.warehouses.length === 0 || state.products.length === 0) {
        toast('Сначала добавьте склад и хотя бы один товар', 'error'); return;
    }
    const isNew = !doc;
    const data = doc || {
        number: nextDocNumber('stockIns', 'OPR'),
        date: todayISO(),
        warehouseId: state.warehouses[0]?.id || '',
        source: STOCKIN_SOURCES[0],
        supplierId: '',
        basisType: 'ТОРГ-12',
        basisNumber: '',
        basisDate: '',
        responsible: '',
        qtyChecked: false,
        qualityChecked: false,
        hasDiscrepancy: false,
        discrepancyText: '',
        actNumber: '',
        comment: '',
        status: 'draft',
        items: [],
    };
    let items = (data.items || []).map(i => ({ ...i }));

    const supplierOpts = `<option value="">— Не указан —</option>` +
        state.suppliers.map(s => `<option value="${s.id}" ${s.id === data.supplierId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

    openModal({
        title: isNew ? 'Новое оприходование' : `Оприходование ${data.number}`,
        large: true,
        body: `
            <h3 style="font-size:14px;margin-bottom:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em">Шапка</h3>
            <div class="form-grid">
                <div class="field"><label>Номер *</label><input id="d-number" value="${escapeHtml(data.number)}"></div>
                <div class="field"><label>Дата *</label><input id="d-date" type="date" value="${escapeHtml(data.date)}"></div>
                <div class="field">
                    <label>Склад *</label>
                    <select id="d-warehouse">
                        ${state.warehouses.map(w => `<option value="${w.id}" ${w.id === data.warehouseId ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="field">
                    <label>Источник поступления</label>
                    <select id="d-source">${STOCKIN_SOURCES.map(r => `<option value="${r}" ${r === data.source ? 'selected' : ''}>${r}</option>`).join('')}</select>
                </div>
                <div class="field">
                    <label>Поставщик</label>
                    <select id="d-supplier">${supplierOpts}</select>
                </div>
                <div class="field">
                    <label>МОЛ (кто принял)</label>
                    <input id="d-responsible" value="${escapeHtml(data.responsible || '')}" placeholder="Иванов И.И.">
                </div>
            </div>

            <h3 style="font-size:14px;margin:18px 0 10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em">Документ-основание</h3>
            <div class="form-grid">
                <div class="field">
                    <label>Тип</label>
                    <select id="d-basis-type">${STOCKIN_BASIS_TYPES.map(t => `<option value="${t}" ${t === data.basisType ? 'selected' : ''}>${t}</option>`).join('')}</select>
                </div>
                <div class="field">
                    <label>Номер</label>
                    <input id="d-basis-number" value="${escapeHtml(data.basisNumber || '')}" placeholder="например 12345">
                </div>
                <div class="field">
                    <label>Дата документа</label>
                    <input id="d-basis-date" type="date" value="${escapeHtml(data.basisDate || '')}">
                </div>
            </div>

            <h3 style="font-size:14px;margin:18px 0 10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em">Проверка</h3>
            <div class="form-grid">
                <div class="field span-2">
                    <label class="check-line"><input type="checkbox" id="d-qty-checked" ${data.qtyChecked ? 'checked' : ''}> Количество сверено с накладной</label>
                    <label class="check-line"><input type="checkbox" id="d-quality-checked" ${data.qualityChecked ? 'checked' : ''}> Качество проверено (целостность упаковки, срок годности, маркировка)</label>
                    <label class="check-line"><input type="checkbox" id="d-has-discrepancy" ${data.hasDiscrepancy ? 'checked' : ''}> Есть расхождения (брак, недостача, излишек, пересорт)</label>
                </div>
                <div class="field">
                    <label>№ акта расхождений</label>
                    <input id="d-act-number" value="${escapeHtml(data.actNumber || '')}" placeholder="ТОРГ-2 / М-7">
                </div>
                <div class="field">
                    <label>Этап</label>
                    <select id="d-status">${STOCKIN_STAGES.map(s => `<option value="${s.key}" ${s.key === data.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
                </div>
                <div class="field span-2">
                    <label>Описание расхождений</label>
                    <textarea id="d-discrepancy-text" rows="2" placeholder="Например: бой 3 шт, недостача по поз. 12 — 2 ед.">${escapeHtml(data.discrepancyText || '')}</textarea>
                </div>
                <div class="field span-2">
                    <label>Комментарий</label>
                    <textarea id="d-comment" rows="2">${escapeHtml(data.comment || '')}</textarea>
                </div>
            </div>

            <div class="items-block">
                <div class="items-block-header">
                    <h3>Товары</h3>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" id="import-items">📥 Из Excel</button>
                        <button class="btn btn-small" id="add-item">+ Строка</button>
                    </div>
                </div>
                <table class="items-table">
                    <thead><tr>
                        <th style="width:30px">#</th>
                        <th>Товар</th>
                        <th class="col-qty">Кол-во</th>
                        <th class="col-price">Цена, ₽</th>
                        <th class="col-sum">Сумма, ₽</th>
                        <th class="col-del"></th>
                    </tr></thead>
                    <tbody id="items-tbody"></tbody>
                </table>
                <div class="items-block-footer">
                    <span style="color:var(--text-muted)">Позиций: <span id="items-count">0</span></span>
                    <span class="items-total">Итого: <span id="items-total">0,00 ₽</span></span>
                </div>
            </div>

            <p style="color:var(--text-muted);font-size:12px;margin-top:14px;padding:10px;background:#fef3c7;border-radius:6px">
                ℹ️ Регистр остатков обновляется только при этапе <strong>«Оприходовано»</strong> или <strong>«С расхождениями»</strong>. На черновике/проверке движений нет.
            </p>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-save">Сохранить</button>
        `,
    });

    function paint() {
        const tbody = document.getElementById('items-tbody');
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Нет позиций</td></tr>`;
        } else {
            tbody.innerHTML = items.map((it, idx) => {
                const sum = (Number(it.qty)||0) * (Number(it.price)||0);
                return `
                    <tr data-idx="${idx}">
                        <td>${idx+1}</td>
                        <td><select data-field="productId">
                            ${state.products.filter(p => p.type !== 'услуга').map(p => `<option value="${p.id}" ${p.id===it.productId?'selected':''}>${escapeHtml(p.name)}${p.sku ? ' ('+escapeHtml(p.sku)+')' : ''}</option>`).join('')}
                        </select></td>
                        <td class="col-qty"><input type="number" min="0" step="0.001" data-field="qty" value="${Number(it.qty)||0}" style="text-align:right"></td>
                        <td class="col-price"><input type="number" min="0" step="0.01" data-field="price" value="${Number(it.price)||0}" style="text-align:right"></td>
                        <td class="col-sum">${fmtMoney(sum)}</td>
                        <td class="col-del"><button class="btn btn-icon btn-danger" data-act="del">×</button></td>
                    </tr>
                `;
            }).join('');
        }
        const total = items.reduce((s, i) => s + (Number(i.qty)||0)*(Number(i.price)||0), 0);
        document.getElementById('items-count').textContent = items.length;
        document.getElementById('items-total').textContent = fmtMoney(total);
    }

    document.getElementById('add-item').onclick = () => {
        const p = state.products.find(x => x.type !== 'услуга') || state.products[0];
        items.push({ productId: p.id, qty: 1, price: Number(p.price)||0 });
        paint();
    };
    document.getElementById('import-items').onclick = () => {
        openImportItemsDialog({ priceField: true, onApply: (newItems) => { items.push(...newItems); paint(); } });
    };
    document.getElementById('items-tbody').addEventListener('input', (e) => {
        const tr = e.target.closest('tr'); if (!tr) return;
        const idx = Number(tr.dataset.idx);
        const f = e.target.dataset.field;
        if (f === 'productId') {
            items[idx].productId = e.target.value;
            const p = findProduct(e.target.value);
            if (p && (!items[idx].price || items[idx].price === 0)) items[idx].price = Number(p.price)||0;
        } else {
            items[idx][f] = parseFloat(e.target.value) || 0;
        }
        paint();
    });
    document.getElementById('items-tbody').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act="del"]'); if (!btn) return;
        const idx = Number(btn.closest('tr').dataset.idx);
        items.splice(idx, 1); paint();
    });

    // Если отметили расхождение — сразу подскажем этап
    document.getElementById('d-has-discrepancy').onchange = (e) => {
        if (e.target.checked) {
            const sel = document.getElementById('d-status');
            if (sel.value === 'done') sel.value = 'discrepancy';
        }
    };

    paint();

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
        const number = document.getElementById('d-number').value.trim();
        const date = document.getElementById('d-date').value;
        const warehouseId = document.getElementById('d-warehouse').value;
        if (!number || !date || !warehouseId) { toast('Заполните номер, дату и склад', 'error'); return; }

        const payload = {
            number, date, warehouseId,
            source: document.getElementById('d-source').value,
            supplierId: document.getElementById('d-supplier').value,
            responsible: document.getElementById('d-responsible').value.trim(),
            basisType: document.getElementById('d-basis-type').value,
            basisNumber: document.getElementById('d-basis-number').value.trim(),
            basisDate: document.getElementById('d-basis-date').value,
            qtyChecked: document.getElementById('d-qty-checked').checked,
            qualityChecked: document.getElementById('d-quality-checked').checked,
            hasDiscrepancy: document.getElementById('d-has-discrepancy').checked,
            discrepancyText: document.getElementById('d-discrepancy-text').value.trim(),
            actNumber: document.getElementById('d-act-number').value.trim(),
            status: document.getElementById('d-status').value,
            comment: document.getElementById('d-comment').value.trim(),
            items: items.map(i => ({ productId: i.productId, qty: Number(i.qty), price: Number(i.price)||0 })),
        };

        if (isNew) state.stockIns.push({ id: uid('si'), ...payload });
        else Object.assign(doc, payload);
        saveState();
        toast('Оприходование сохранено', 'success');
        closeModal();
        renderProducts();
    };
}

// ---------- Списания ----------
const WRITEOFF_REASONS = ['Брак', 'Истёк срок', 'Внутреннее использование', 'Порча', 'Прочее'];

function renderWriteOffsList() {
    const list = [...state.writeOffs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const body = document.getElementById('stock-docs-body');
    if (list.length === 0) {
        body.innerHTML = `<div class="card">${renderEmptyState({
            icon: '🗑️', title: 'Списаний нет',
            hint: 'Списание уменьшает остаток на складе (брак, порча, внутренние нужды).',
        })}</div>`;
        return;
    }
    body.innerHTML = `
        <div class="card">
            <div class="table-toolbar"><input class="search-input" id="search" placeholder="Поиск..."></div>
            <table>
                <thead><tr>
                    <th>№</th><th>Дата</th><th>Склад</th><th>Причина</th>
                    <th class="col-num">Позиций</th><th class="col-num">Сумма</th>
                    <th>Статус</th><th>Комментарий</th><th class="col-actions">Действия</th>
                </tr></thead>
                <tbody id="rows">${list.map(d => {
                    const total = (d.items||[]).reduce((s,i) => s + (Number(i.qty)||0)*(Number(i.price)||0), 0);
                    const wh = findWarehouse(d.warehouseId);
                    return `
                        <tr data-id="${d.id}">
                            <td><strong>${escapeHtml(d.number||'')}</strong></td>
                            <td>${fmtDate(d.date)}</td>
                            <td>${escapeHtml(wh?wh.name:'—')}</td>
                            <td>${escapeHtml(d.reason||'—')}</td>
                            <td class="col-num">${(d.items||[]).length}</td>
                            <td class="col-num"><strong>${fmtMoney(total)}</strong></td>
                            <td>${statusBadge(d.status)}</td>
                            <td class="ellipsis" title="${escapeHtml(d.comment||'')}">${escapeHtml(d.comment||'')}</td>
                            <td class="col-actions">
                                <button class="btn btn-small" data-act="edit">Изменить</button>
                                <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                            </td>
                        </tr>
                    `;
                }).join('')}</tbody>
            </table>
        </div>
    `;
    document.getElementById('search').oninput = (e) => filterRows(e.target.value);
    document.getElementById('rows').onclick = (e) => {
        const btn = e.target.closest('button'); if (!btn) return;
        const id = btn.closest('tr').dataset.id;
        const d = state.writeOffs.find(x => x.id === id);
        if (btn.dataset.act === 'edit') editWriteOff(d);
        if (btn.dataset.act === 'del') confirmDelete(`Списание ${d.number}`, () => {
            state.writeOffs = state.writeOffs.filter(x => x.id !== id);
            saveState(); toast('Удалено'); renderProducts();
        });
    };
}

function editWriteOff(doc) {
    if (state.warehouses.length === 0 || state.products.length === 0) {
        toast('Сначала добавьте склад и товары', 'error'); return;
    }
    const isNew = !doc;
    const data = doc || {
        number: nextDocNumber('writeOffs', 'SPS'),
        date: todayISO(),
        warehouseId: state.warehouses[0]?.id || '',
        reason: WRITEOFF_REASONS[0],
        comment: '',
        status: 'done',
        items: [],
    };
    openItemsDocEditor({
        title: isNew ? 'Новое списание' : `Списание ${data.number}`,
        data,
        extraFields: `
            <div class="field">
                <label>Склад *</label>
                <select id="d-warehouse">
                    ${state.warehouses.map(w => `<option value="${w.id}" ${w.id === data.warehouseId ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
                </select>
            </div>
            <div class="field">
                <label>Причина</label>
                <select id="d-reason">${WRITEOFF_REASONS.map(r => `<option value="${r}" ${r === data.reason ? 'selected' : ''}>${r}</option>`).join('')}</select>
            </div>
        `,
        onSave: (payload) => {
            payload.warehouseId = document.getElementById('d-warehouse').value;
            payload.reason = document.getElementById('d-reason').value;
            if (!payload.warehouseId) { toast('Выберите склад', 'error'); return false; }
            if (isNew) state.writeOffs.push({ id: uid('wo'), ...data, ...payload });
            else Object.assign(doc, payload);
            saveState(); toast('Списание сохранено', 'success'); renderProducts(); return true;
        }
    });
}

// ---------- Перемещения ----------
function renderTransfersList() {
    const list = [...state.transfers].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const body = document.getElementById('stock-docs-body');
    if (list.length === 0) {
        body.innerHTML = `<div class="card">${renderEmptyState({
            icon: '🔁', title: 'Перемещений нет',
            hint: 'Перемещение переносит товар между складами без изменения общей стоимости.',
        })}</div>`;
        return;
    }
    body.innerHTML = `
        <div class="card">
            <div class="table-toolbar"><input class="search-input" id="search" placeholder="Поиск..."></div>
            <table>
                <thead><tr>
                    <th>№</th><th>Дата</th><th>Со склада</th><th>На склад</th>
                    <th class="col-num">Позиций</th><th class="col-num">Кол-во</th>
                    <th>Статус</th><th>Комментарий</th><th class="col-actions">Действия</th>
                </tr></thead>
                <tbody id="rows">${list.map(d => {
                    const totalQty = (d.items||[]).reduce((s,i) => s + (Number(i.qty)||0), 0);
                    const wf = findWarehouse(d.fromWarehouseId);
                    const wt = findWarehouse(d.toWarehouseId);
                    return `
                        <tr data-id="${d.id}">
                            <td><strong>${escapeHtml(d.number||'')}</strong></td>
                            <td>${fmtDate(d.date)}</td>
                            <td>${escapeHtml(wf?wf.name:'—')}</td>
                            <td>${escapeHtml(wt?wt.name:'—')}</td>
                            <td class="col-num">${(d.items||[]).length}</td>
                            <td class="col-num">${fmtQty(totalQty)}</td>
                            <td>${statusBadge(d.status)}</td>
                            <td class="ellipsis" title="${escapeHtml(d.comment||'')}">${escapeHtml(d.comment||'')}</td>
                            <td class="col-actions">
                                <button class="btn btn-small" data-act="edit">Изменить</button>
                                <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                            </td>
                        </tr>
                    `;
                }).join('')}</tbody>
            </table>
        </div>
    `;
    document.getElementById('search').oninput = (e) => filterRows(e.target.value);
    document.getElementById('rows').onclick = (e) => {
        const btn = e.target.closest('button'); if (!btn) return;
        const id = btn.closest('tr').dataset.id;
        const d = state.transfers.find(x => x.id === id);
        if (btn.dataset.act === 'edit') editTransfer(d);
        if (btn.dataset.act === 'del') confirmDelete(`Перемещение ${d.number}`, () => {
            state.transfers = state.transfers.filter(x => x.id !== id);
            saveState(); toast('Удалено'); renderProducts();
        });
    };
}

function editTransfer(doc) {
    if (state.warehouses.length < 2) {
        toast('Нужно минимум два склада для перемещения', 'error'); return;
    }
    if (state.products.length === 0) { toast('Нет товаров', 'error'); return; }
    const isNew = !doc;
    const data = doc || {
        number: nextDocNumber('transfers', 'PER'),
        date: todayISO(),
        fromWarehouseId: state.warehouses[0]?.id || '',
        toWarehouseId: state.warehouses[1]?.id || '',
        comment: '',
        status: 'done',
        items: [],
    };
    openItemsDocEditor({
        title: isNew ? 'Новое перемещение' : `Перемещение ${data.number}`,
        data,
        priceField: false,
        extraFields: `
            <div class="field">
                <label>Со склада *</label>
                <select id="d-from">
                    ${state.warehouses.map(w => `<option value="${w.id}" ${w.id === data.fromWarehouseId ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
                </select>
            </div>
            <div class="field">
                <label>На склад *</label>
                <select id="d-to">
                    ${state.warehouses.map(w => `<option value="${w.id}" ${w.id === data.toWarehouseId ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
                </select>
            </div>
        `,
        onSave: (payload) => {
            payload.fromWarehouseId = document.getElementById('d-from').value;
            payload.toWarehouseId = document.getElementById('d-to').value;
            if (payload.fromWarehouseId === payload.toWarehouseId) {
                toast('Склады должны различаться', 'error'); return false;
            }
            if (isNew) state.transfers.push({ id: uid('tr'), ...data, ...payload });
            else Object.assign(doc, payload);
            saveState(); toast('Перемещение сохранено', 'success'); renderProducts(); return true;
        }
    });
}

// ---------- Инвентаризации ----------
function renderInventoriesList() {
    const list = [...state.inventories].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const body = document.getElementById('stock-docs-body');
    if (list.length === 0) {
        body.innerHTML = `<div class="card">${renderEmptyState({
            icon: '🧾', title: 'Инвентаризаций нет',
            hint: 'Инвентаризация фиксирует фактический остаток. После проведения излишки/недостачи попадут в остатки.',
        })}</div>`;
        return;
    }
    body.innerHTML = `
        <div class="card">
            <div class="table-toolbar"><input class="search-input" id="search" placeholder="Поиск..."></div>
            <table>
                <thead><tr>
                    <th>№</th><th>Дата</th><th>Склад</th>
                    <th class="col-num">Позиций</th><th class="col-num">Излишек</th><th class="col-num">Недостача</th>
                    <th>Статус</th><th>Комментарий</th><th class="col-actions">Действия</th>
                </tr></thead>
                <tbody id="rows">${list.map(d => {
                    let surplus = 0, shortage = 0;
                    (d.items||[]).forEach(it => {
                        const diff = (Number(it.actualQty)||0) - (Number(it.expectedQty)||0);
                        if (diff > 0) surplus += diff;
                        else if (diff < 0) shortage += -diff;
                    });
                    const wh = findWarehouse(d.warehouseId);
                    return `
                        <tr data-id="${d.id}">
                            <td><strong>${escapeHtml(d.number||'')}</strong></td>
                            <td>${fmtDate(d.date)}</td>
                            <td>${escapeHtml(wh?wh.name:'—')}</td>
                            <td class="col-num">${(d.items||[]).length}</td>
                            <td class="col-num" style="color:#10b981">${fmtQty(surplus)}</td>
                            <td class="col-num" style="color:#dc2626">${fmtQty(shortage)}</td>
                            <td>${statusBadge(d.status)}</td>
                            <td class="ellipsis" title="${escapeHtml(d.comment||'')}">${escapeHtml(d.comment||'')}</td>
                            <td class="col-actions">
                                <button class="btn btn-small" data-act="edit">Изменить</button>
                                <button class="btn btn-small btn-danger" data-act="del">Удалить</button>
                            </td>
                        </tr>
                    `;
                }).join('')}</tbody>
            </table>
        </div>
    `;
    document.getElementById('search').oninput = (e) => filterRows(e.target.value);
    document.getElementById('rows').onclick = (e) => {
        const btn = e.target.closest('button'); if (!btn) return;
        const id = btn.closest('tr').dataset.id;
        const d = state.inventories.find(x => x.id === id);
        if (btn.dataset.act === 'edit') editInventory(d);
        if (btn.dataset.act === 'del') confirmDelete(`Инвентаризация ${d.number}`, () => {
            state.inventories = state.inventories.filter(x => x.id !== id);
            saveState(); toast('Удалено'); renderProducts();
        });
    };
}

function editInventory(doc) {
    if (state.warehouses.length === 0 || state.products.length === 0) {
        toast('Сначала добавьте склад и товары', 'error'); return;
    }
    const isNew = !doc;
    const data = doc || {
        number: nextDocNumber('inventories', 'INV'),
        date: todayISO(),
        warehouseId: state.warehouses[0]?.id || '',
        comment: '',
        status: 'draft',
        items: [],
    };
    let items = (data.items || []).map(i => ({ ...i }));

    openModal({
        title: isNew ? 'Новая инвентаризация' : `Инвентаризация ${data.number}`,
        large: true,
        body: `
            <div class="form-grid">
                <div class="field"><label>Номер *</label><input id="d-number" value="${escapeHtml(data.number)}"></div>
                <div class="field"><label>Дата *</label><input id="d-date" type="date" value="${escapeHtml(data.date)}"></div>
                <div class="field">
                    <label>Склад *</label>
                    <select id="d-warehouse">
                        ${state.warehouses.map(w => `<option value="${w.id}" ${w.id === data.warehouseId ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="field">
                    <label>Статус</label>
                    <select id="d-status">
                        <option value="draft" ${data.status === 'draft' ? 'selected' : ''}>Черновик</option>
                        <option value="done"  ${data.status === 'done'  ? 'selected' : ''}>Проведена (применить разницы)</option>
                    </select>
                </div>
                <div class="field span-2"><label>Комментарий</label><textarea id="d-comment">${escapeHtml(data.comment || '')}</textarea></div>
            </div>
            <div class="items-block">
                <div class="items-block-header">
                    <h3>Позиции</h3>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" id="fill-from-stock">Заполнить остатками склада</button>
                        <button class="btn btn-small" id="import-items">📥 Из Excel</button>
                        <button class="btn btn-small" id="add-item">+ Строка</button>
                    </div>
                </div>
                <table class="items-table">
                    <thead><tr>
                        <th style="width:30px">#</th>
                        <th>Товар</th>
                        <th class="col-qty">Учётный</th>
                        <th class="col-qty">Фактический</th>
                        <th class="col-qty">Расхождение</th>
                        <th class="col-price">Цена</th>
                        <th class="col-del"></th>
                    </tr></thead>
                    <tbody id="items-tbody"></tbody>
                </table>
                <div class="items-block-footer">
                    <span style="color:var(--text-muted)">Позиций: <span id="items-count">0</span></span>
                </div>
            </div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-save">Сохранить</button>
        `,
    });

    function paint() {
        const tbody = document.getElementById('items-tbody');
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px">Нет позиций</td></tr>`;
        } else {
            tbody.innerHTML = items.map((it, idx) => {
                const diff = (Number(it.actualQty)||0) - (Number(it.expectedQty)||0);
                const diffColor = diff > 0 ? '#10b981' : (diff < 0 ? '#dc2626' : 'var(--text-muted)');
                return `
                    <tr data-idx="${idx}">
                        <td>${idx+1}</td>
                        <td><select data-field="productId">
                            ${state.products.filter(p => p.type !== 'услуга').map(p => `<option value="${p.id}" ${p.id===it.productId?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
                        </select></td>
                        <td class="col-qty"><input type="number" min="0" step="0.001" data-field="expectedQty" value="${Number(it.expectedQty)||0}" style="text-align:right"></td>
                        <td class="col-qty"><input type="number" min="0" step="0.001" data-field="actualQty"   value="${Number(it.actualQty)||0}"   style="text-align:right"></td>
                        <td class="col-qty" style="text-align:right;color:${diffColor};font-variant-numeric:tabular-nums;font-weight:600">${diff > 0 ? '+' : ''}${fmtQty(diff)}</td>
                        <td class="col-price"><input type="number" min="0" step="0.01" data-field="price" value="${Number(it.price)||0}" style="text-align:right"></td>
                        <td class="col-del"><button class="btn btn-icon btn-danger" data-act="del">×</button></td>
                    </tr>
                `;
            }).join('');
        }
        document.getElementById('items-count').textContent = items.length;
    }

    document.getElementById('add-item').onclick = () => {
        const p = state.products.find(x => x.type !== 'услуга') || state.products[0];
        items.push({ productId: p.id, expectedQty: 0, actualQty: 0, price: Number(p.price)||0 });
        paint();
    };

    document.getElementById('import-items').onclick = () => {
        openImportItemsDialog({
            priceField: true,
            qtyField: 'expectedQty',
            onApply: (newItems) => { items.push(...newItems); paint(); },
        });
    };

    document.getElementById('fill-from-stock').onclick = () => {
        const whId = document.getElementById('d-warehouse').value;
        const stock = computeStock().filter(s => s.warehouseId === whId && s.qty > 0);
        items = stock.map(s => {
            const p = findProduct(s.productId);
            return { productId: s.productId, expectedQty: s.qty, actualQty: s.qty, price: p ? Number(p.price) : 0 };
        });
        paint();
        toast(`Загружено позиций: ${items.length}`, 'success');
    };

    document.getElementById('items-tbody').addEventListener('input', (e) => {
        const tr = e.target.closest('tr'); if (!tr) return;
        const idx = Number(tr.dataset.idx);
        const f = e.target.dataset.field;
        if (f === 'productId') items[idx].productId = e.target.value;
        else items[idx][f] = parseFloat(e.target.value) || 0;
        paint();
    });
    document.getElementById('items-tbody').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act="del"]'); if (!btn) return;
        const idx = Number(btn.closest('tr').dataset.idx);
        items.splice(idx, 1); paint();
    });

    paint();

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
        const number = document.getElementById('d-number').value.trim();
        const date = document.getElementById('d-date').value;
        const warehouseId = document.getElementById('d-warehouse').value;
        const status = document.getElementById('d-status').value;
        const comment = document.getElementById('d-comment').value.trim();
        if (!number || !date || !warehouseId) { toast('Заполните номер, дату и склад', 'error'); return; }
        const payload = { number, date, warehouseId, status, comment, items: items.map(i => ({
            productId: i.productId, expectedQty: Number(i.expectedQty)||0, actualQty: Number(i.actualQty)||0, price: Number(i.price)||0
        })) };
        if (isNew) state.inventories.push({ id: uid('inv'), ...payload });
        else Object.assign(doc, payload);
        saveState(); toast('Инвентаризация сохранена', 'success'); closeModal(); renderProducts();
    };
}

// ---------- Универсальный редактор документов с табличной частью ----------
function openItemsDocEditor({ title, data, extraFields = '', priceField = true, onSave }) {
    let items = (data.items || []).map(i => ({ ...i }));

    openModal({
        title, large: true,
        body: `
            <div class="form-grid">
                <div class="field"><label>Номер *</label><input id="d-number" value="${escapeHtml(data.number)}"></div>
                <div class="field"><label>Дата *</label><input id="d-date" type="date" value="${escapeHtml(data.date)}"></div>
                ${extraFields}
                <div class="field">
                    <label>Статус</label>
                    <select id="d-status">
                        <option value="done"  ${data.status === 'done'  ? 'selected' : ''}>Проведён</option>
                        <option value="draft" ${data.status === 'draft' ? 'selected' : ''}>Черновик</option>
                    </select>
                </div>
                <div class="field span-2"><label>Комментарий</label><textarea id="d-comment">${escapeHtml(data.comment || '')}</textarea></div>
            </div>
            <div class="items-block">
                <div class="items-block-header">
                    <h3>Позиции</h3>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" id="import-items">📥 Из Excel</button>
                        <button class="btn btn-small" id="add-item">+ Строка</button>
                    </div>
                </div>
                <table class="items-table">
                    <thead><tr>
                        <th style="width:30px">#</th>
                        <th>Товар</th>
                        <th class="col-qty">Кол-во</th>
                        ${priceField ? '<th class="col-price">Цена, ₽</th><th class="col-sum">Сумма, ₽</th>' : ''}
                        <th class="col-del"></th>
                    </tr></thead>
                    <tbody id="items-tbody"></tbody>
                </table>
                <div class="items-block-footer">
                    <span style="color:var(--text-muted)">Позиций: <span id="items-count">0</span></span>
                    ${priceField ? '<span class="items-total">Итого: <span id="items-total">0,00 ₽</span></span>' : ''}
                </div>
            </div>
        `,
        footer: `
            <button class="btn" id="modal-cancel">Отмена</button>
            <button class="btn btn-primary" id="modal-save">Сохранить</button>
        `,
    });

    function paint() {
        const tbody = document.getElementById('items-tbody');
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${priceField?6:4}" style="text-align:center;color:var(--text-muted);padding:20px">Нет позиций</td></tr>`;
        } else {
            tbody.innerHTML = items.map((it, idx) => {
                const sum = (Number(it.qty)||0) * (Number(it.price)||0);
                return `
                    <tr data-idx="${idx}">
                        <td>${idx+1}</td>
                        <td><select data-field="productId">
                            ${state.products.filter(p => p.type !== 'услуга').map(p => `<option value="${p.id}" ${p.id===it.productId?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
                        </select></td>
                        <td class="col-qty"><input type="number" min="0" step="0.001" data-field="qty" value="${Number(it.qty)||0}" style="text-align:right"></td>
                        ${priceField ? `
                            <td class="col-price"><input type="number" min="0" step="0.01" data-field="price" value="${Number(it.price)||0}" style="text-align:right"></td>
                            <td class="col-sum">${fmtMoney(sum)}</td>
                        ` : ''}
                        <td class="col-del"><button class="btn btn-icon btn-danger" data-act="del">×</button></td>
                    </tr>
                `;
            }).join('');
        }
        document.getElementById('items-count').textContent = items.length;
        if (priceField) {
            const total = items.reduce((s, i) => s + (Number(i.qty)||0) * (Number(i.price)||0), 0);
            document.getElementById('items-total').textContent = fmtMoney(total);
        }
    }

    document.getElementById('add-item').onclick = () => {
        const p = state.products.find(x => x.type !== 'услуга') || state.products[0];
        items.push({ productId: p.id, qty: 1, price: Number(p.price)||0 });
        paint();
    };
    document.getElementById('import-items').onclick = () => {
        openImportItemsDialog({
            priceField,
            onApply: (newItems) => { items.push(...newItems); paint(); },
        });
    };
    document.getElementById('items-tbody').addEventListener('input', (e) => {
        const tr = e.target.closest('tr'); if (!tr) return;
        const idx = Number(tr.dataset.idx);
        const f = e.target.dataset.field;
        if (f === 'productId') {
            items[idx].productId = e.target.value;
            const p = findProduct(e.target.value);
            if (priceField && p && (!items[idx].price || items[idx].price === 0)) items[idx].price = Number(p.price)||0;
        } else {
            items[idx][f] = parseFloat(e.target.value) || 0;
        }
        paint();
    });
    document.getElementById('items-tbody').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act="del"]'); if (!btn) return;
        const idx = Number(btn.closest('tr').dataset.idx);
        items.splice(idx, 1); paint();
    });

    paint();

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
        const number = document.getElementById('d-number').value.trim();
        const date = document.getElementById('d-date').value;
        const status = document.getElementById('d-status').value;
        const comment = document.getElementById('d-comment').value.trim();
        if (!number || !date) { toast('Заполните номер и дату', 'error'); return; }
        if (items.length === 0) { toast('Добавьте позиции', 'error'); return; }
        if (items.some(i => !i.productId || !(Number(i.qty) > 0))) { toast('Заполните строки', 'error'); return; }

        const payload = {
            number, date, status, comment,
            items: items.map(i => priceField
                ? { productId: i.productId, qty: Number(i.qty), price: Number(i.price)||0 }
                : { productId: i.productId, qty: Number(i.qty) }),
        };
        const ok = onSave(payload);
        if (ok !== false) closeModal();
    };
}

// =============================================================
// Отчёт: Обороты
// =============================================================
function renderTurnover() {
    setTitle('Обороты');
    const content = document.getElementById('content');

    // Период по умолчанию — текущий месяц
    if (!state._turnoverPeriod) {
        const now = new Date();
        state._turnoverPeriod = {
            from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10),
            to:   todayISO(),
            warehouseId: '',
        };
    }
    const period = state._turnoverPeriod;

    const inPeriod = (d) => (!period.from || d.date >= period.from) && (!period.to || d.date <= period.to);
    const matchesWh = (whId) => !period.warehouseId || whId === period.warehouseId;

    // Map: productId → {in, out, inValue, outValue}
    const stats = new Map();
    const bump = (pid, inQ, outQ, inV, outV) => {
        const r = stats.get(pid) || { productId: pid, in: 0, out: 0, inValue: 0, outValue: 0 };
        r.in += inQ; r.out += outQ; r.inValue += inV; r.outValue += outV;
        stats.set(pid, r);
    };

    state.purchases.filter(d => inPeriod(d) && matchesWh(d.warehouseId)).forEach(d =>
        (d.items||[]).forEach(it => bump(it.productId, +Number(it.qty)||0, 0, (+Number(it.qty)||0)*(+Number(it.price)||0), 0)));
    state.stockIns.filter(d => (d.status === 'done' || d.status === 'discrepancy') && inPeriod(d) && matchesWh(d.warehouseId)).forEach(d =>
        (d.items||[]).forEach(it => bump(it.productId, +Number(it.qty)||0, 0, (+Number(it.qty)||0)*(+Number(it.price)||0), 0)));
    state.writeOffs.filter(d => d.status !== 'draft' && inPeriod(d) && matchesWh(d.warehouseId)).forEach(d =>
        (d.items||[]).forEach(it => bump(it.productId, 0, +Number(it.qty)||0, 0, (+Number(it.qty)||0)*(+Number(it.price)||0))));
    state.transfers.filter(d => d.status !== 'draft' && inPeriod(d)).forEach(d => (d.items||[]).forEach(it => {
        if (matchesWh(d.fromWarehouseId)) bump(it.productId, 0, +Number(it.qty)||0, 0, 0);
        if (matchesWh(d.toWarehouseId))   bump(it.productId, +Number(it.qty)||0, 0, 0, 0);
    }));
    state.inventories.filter(d => d.status === 'done' && inPeriod(d) && matchesWh(d.warehouseId)).forEach(d =>
        (d.items||[]).forEach(it => {
            const diff = (Number(it.actualQty)||0) - (Number(it.expectedQty)||0);
            if (diff > 0) bump(it.productId, diff, 0, diff*(Number(it.price)||0), 0);
            else if (diff < 0) bump(it.productId, 0, -diff, 0, -diff*(Number(it.price)||0));
        }));

    const rows = Array.from(stats.values()).filter(r => r.in || r.out);

    const totalIn = rows.reduce((s, r) => s + r.in, 0);
    const totalOut = rows.reduce((s, r) => s + r.out, 0);
    const totalInValue = rows.reduce((s, r) => s + r.inValue, 0);
    const totalOutValue = rows.reduce((s, r) => s + r.outValue, 0);

    const whOptions = `<option value="">Все склады</option>` +
        state.warehouses.map(w => `<option value="${w.id}" ${w.id === period.warehouseId ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('');

    content.innerHTML = `
        <div class="filters-row">
            <label>С: <input type="date" id="t-from" value="${period.from}"></label>
            <label>По: <input type="date" id="t-to"   value="${period.to}"></label>
            <select id="t-wh">${whOptions}</select>
            <button class="btn btn-primary btn-small" id="t-apply">Обновить</button>
        </div>
        <div class="summary-row">
            <div class="summary-card"><div class="summary-label">Поступило кол-во</div><div class="summary-value" style="color:#10b981">+${fmtQty(totalIn)}</div></div>
            <div class="summary-card"><div class="summary-label">Поступило сумма</div><div class="summary-value" style="color:#10b981">${fmtMoney(totalInValue)}</div></div>
            <div class="summary-card"><div class="summary-label">Ушло кол-во</div><div class="summary-value" style="color:#dc2626">−${fmtQty(totalOut)}</div></div>
            <div class="summary-card"><div class="summary-label">Ушло сумма</div><div class="summary-value" style="color:#dc2626">${fmtMoney(totalOutValue)}</div></div>
        </div>
        <div class="card">
            <table>
                <thead><tr>
                    <th>Товар</th><th>Артикул</th>
                    <th class="col-num">Поступило, кол-во</th>
                    <th class="col-num">Поступило, ₽</th>
                    <th class="col-num">Ушло, кол-во</th>
                    <th class="col-num">Ушло, ₽</th>
                    <th class="col-num">Δ кол-во</th>
                </tr></thead>
                <tbody>${rows.length === 0
                    ? `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">За период движений нет</td></tr>`
                    : rows.map(r => {
                        const p = findProduct(r.productId);
                        const delta = r.in - r.out;
                        return `
                            <tr>
                                <td><strong>${escapeHtml(p?p.name:'— удалён —')}</strong></td>
                                <td>${escapeHtml(p?(p.sku||''):'')}</td>
                                <td class="col-num" style="color:#10b981">${r.in ? '+'+fmtQty(r.in) : '—'}</td>
                                <td class="col-num">${r.inValue ? fmtMoney(r.inValue) : '—'}</td>
                                <td class="col-num" style="color:#dc2626">${r.out ? '−'+fmtQty(r.out) : '—'}</td>
                                <td class="col-num">${r.outValue ? fmtMoney(r.outValue) : '—'}</td>
                                <td class="col-num"><strong style="color:${delta>=0?'#10b981':'#dc2626'}">${delta>=0?'+':''}${fmtQty(delta)}</strong></td>
                            </tr>
                        `;
                    }).join('')
                }</tbody>
            </table>
        </div>
    `;

    const apply = () => {
        period.from = document.getElementById('t-from').value;
        period.to = document.getElementById('t-to').value;
        period.warehouseId = document.getElementById('t-wh').value;
        renderTurnover();
    };
    document.getElementById('t-apply').onclick = apply;
}

// =============================================================
// Init
// =============================================================
document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
        e.preventDefault();
        setView(el.dataset.view);
    });
});

document.getElementById('seed-btn').addEventListener('click', () => {
    if (state.warehouses.length || state.products.length || state.purchases.length) {
        confirmDelete('текущие данные (будут заменены демо-набором)', () => seedDemoData());
    } else {
        seedDemoData();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('modal-backdrop-2').classList.contains('open')) {
        closeModal2();
    } else if (document.getElementById('modal-backdrop').classList.contains('open')) {
        closeModal();
    }
});

loadState();
setView('warehouses');
