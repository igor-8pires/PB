const root = document.getElementById('offline-content');
const userKey = 'sistema-vendas-offline-user';
const storagePrefix = 'sistema-vendas:offline:';
const routeAccess = {
  '/pedidos': ['ADMIN', 'VENDEDOR'],
  '/pedidos/novo': ['ADMIN', 'VENDEDOR'],
  '/produtos': ['ADMIN', 'VENDEDOR'],
  '/precos': ['ADMIN', 'VENDEDOR'],
  '/entregas/minhas': ['ENTREGADOR'],
};
const statusNames = {
  DRAFT: 'Rascunho',
  CONFIRMED: 'Confirmado',
  SEPARATING: 'Separando',
  READY_FOR_DELIVERY: 'Pronto para entrega',
  OUT_FOR_DELIVERY: 'Em entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  ASSIGNED: 'Atribuída',
  FAILED: 'Falhou',
  PENDING_SYNC: 'Aguardando sincronização',
  SYNC_ERROR: 'Erro de sincronização',
};

function element(tag, parent, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  parent.appendChild(node);
  return node;
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function showMessage(message) {
  root.replaceChildren();
  element('p', root, message, 'notice');
}

function readTable(name) {
  try {
    const value = JSON.parse(localStorage.getItem(`${storagePrefix}${name}`) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeTable(name, records) {
  localStorage.setItem(`${storagePrefix}${name}`, JSON.stringify(records));
}

function putRecord(name, key, record) {
  const records = readTable(name);
  const index = records.findIndex((item) => item[key] === record[key]);
  if (index < 0) records.push(record);
  else records[index] = record;
  writeTable(name, records);
}

function readRecord(name, key, value) {
  return readTable(name).find((record) => record[key] === value) || null;
}

function addNavigation(user) {
  const nav = element('nav', root, undefined, 'nav');
  const routes = user.role === 'ENTREGADOR'
    ? ['/entregas/minhas']
    : ['/pedidos', '/pedidos/novo', '/produtos', '/precos'];
  for (const route of routes) {
    const labels = {
      '/pedidos': 'Pedidos',
      '/pedidos/novo': 'Novo pedido offline',
      '/produtos': 'Produtos',
      '/precos': 'Preços offline',
      '/entregas/minhas': 'Entregas ativas',
    };
    const link = element('a', nav, labels[route]);
    link.href = route;
  }
}

function renderOrders(snapshot, drafts, user) {
  const actions = element('div', root, undefined, 'page-actions');
  const newOrderLink = element('a', actions, '+ Novo pedido', 'button button-primary');
  newOrderLink.href = '/pedidos/novo';

  element('h2', root, user.role === 'ADMIN' ? 'Pedidos recentes' : 'Meus pedidos');
  if (!snapshot.data.length) element('p', root, 'Nenhum pedido salvo neste dispositivo.', 'muted');
  else {
    const wrapper = element('div', root, undefined, 'table-wrap');
    const table = element('table', wrapper);
    const head = element('thead', table);
    const header = element('tr', head);
    for (const title of ['Pedido', 'Cliente', ...(user.role === 'ADMIN' ? ['Vendedor'] : []), 'Status', 'Total', 'Data']) {
      element('th', header, title);
    }
    const body = element('tbody', table);
    for (const order of snapshot.data) {
      const row = element('tr', body);
      element('td', row, `#${String(order.id).slice(-6).toUpperCase()}`);
      element('td', row, order.customerName);
      if (user.role === 'ADMIN') element('td', row, order.sellerName);
      element('td', row, statusNames[order.status] || order.status);
      element('td', row, money(order.total));
      element('td', row, new Date(order.createdAt).toLocaleDateString('pt-BR'));
    }
  }

  const ownDrafts = drafts.filter((draft) => draft.sellerId === user.userId && draft.syncStatus !== 'SYNCED');
  element('h2', root, 'Pedidos aguardando sincronização');
  if (!ownDrafts.length) element('p', root, 'Nenhum rascunho pendente.', 'muted');
  for (const draft of ownDrafts) {
    const card = element('article', root, undefined, 'entry');
    element('strong', card, `Pedido local ${draft.localId || ''}`);
    element('p', card, `${statusNames[draft.syncStatus] || draft.syncStatus} · ${money(draft.total)}`);
    if (draft.syncError) element('p', card, draft.syncError, 'muted');
  }
}

function renderProducts(snapshot) {
  element('h2', root, 'Produtos salvos');
  if (!snapshot.data.length) {
    element('p', root, 'Nenhum produto salvo neste dispositivo.', 'muted');
    return;
  }
  const wrapper = element('div', root, undefined, 'table-wrap');
  const table = element('table', wrapper);
  const head = element('thead', table);
  const header = element('tr', head);
  for (const title of ['Produto', 'SKU', 'Categoria', 'Unidade', 'Custo', 'Status']) element('th', header, title);
  const body = element('tbody', table);
  for (const product of snapshot.data) {
    const row = element('tr', body);
    element('td', row, product.name);
    element('td', row, product.sku);
    element('td', row, product.categoryName);
    element('td', row, product.unit || 'UN');
    element('td', row, money(product.costPrice));
    element('td', row, product.active ? 'Ativo' : 'Inativo');
  }
}

function renderDeliveries(snapshot) {
  element('h2', root, 'Entregas ativas salvas');
  if (!snapshot.data.length) {
    element('p', root, 'Nenhuma entrega ativa salva neste dispositivo.', 'muted');
    return;
  }
  for (const delivery of snapshot.data) {
    const card = element('article', root, undefined, 'entry');
    element('h3', card, delivery.customerName);
    element('p', card, delivery.address || 'Endereço não informado');
    if (delivery.phone) element('p', card, `Telefone: ${delivery.phone}`);
    element('p', card, statusNames[delivery.status] || delivery.status, 'status');
    if (delivery.notes) {
      element('p', card, 'Observações para entrega');
      element('p', card, delivery.notes);
    }
    const list = element('ul', card);
    for (const item of delivery.items || []) {
      element('li', list, `${item.quantity} ${item.unit || ''} ${item.productName}`.trim());
    }
    element('strong', card, `Total: ${money(delivery.total)}`);
  }
}

function quantityInDiscountUnit(line, ruleUnit) {
  if (ruleUnit === line.product.unit) return line.baseQuantity;
  if (ruleUnit === line.product.purchaseUnit && line.product.unitsPerPurchaseUnit > 0) {
    return line.baseQuantity / line.product.unitsPerPurchaseUnit;
  }
  return null;
}

function matchingDiscount(rules, getQuantity) {
  return rules
    .map((rule) => ({ rule, quantity: getQuantity(rule) }))
    .filter(({ rule, quantity }) =>
      quantity !== null &&
      rule.minQuantity <= quantity &&
      (rule.maxQuantity === null || quantity <= rule.maxQuantity),
    )
    .sort((left, right) => right.rule.minQuantity - left.rule.minQuantity)[0]?.rule;
}

function getLineDiscount(line, lines, rules) {
  const productRule = matchingDiscount(
    rules.filter((rule) =>
      rule.productId === line.product.id &&
      rule.categoryId === null &&
      rule.baseUnit === line.product.unit,
    ),
    (rule) => lines
      .filter((candidate) => candidate.product.id === line.product.id)
      .reduce((sum, candidate) => sum + (quantityInDiscountUnit(candidate, rule.unit || '') || 0), 0),
  );
  if (productRule) return productRule.discountPercent;

  const categoryRule = matchingDiscount(
    rules.filter((rule) =>
      rule.categoryId === line.product.categoryId &&
      rule.productId === null &&
      rule.baseUnit === line.product.unit,
    ),
    (rule) => {
      if (quantityInDiscountUnit(line, rule.unit || '') === null) return null;
      return lines
        .filter((candidate) =>
          candidate.product.categoryId === line.product.categoryId &&
          candidate.product.unit === line.product.unit,
        )
        .reduce((sum, candidate) => sum + (quantityInDiscountUnit(candidate, rule.unit || '') || 0), 0);
    },
  );
  if (categoryRule) return categoryRule.discountPercent;

  const generalRule = matchingDiscount(
    rules.filter((rule) =>
      rule.categoryId === null &&
      rule.productId === null &&
      rule.unit === null &&
      rule.baseUnit === null,
    ),
    () => line.baseQuantity,
  );
  return generalRule?.discountPercent || 0;
}

function renderOfflinePrices(snapshot) {
  const data = snapshot.data;
  const products = data.products || [];
  const locations = data.locations || [];
  const basePrices = data.basePrices || [];

  element('h2', root, 'Preços salvos');
  if (!basePrices.length) {
    element('p', root, 'Nenhum preço-base salvo neste dispositivo.', 'muted');
  } else {
    const productById = new Map(products.map((product) => [product.id, product]));
    const locationById = new Map(locations.map((location) => [location.id, location]));
    const availablePrices = basePrices.filter(
      (price) => productById.has(price.productId) && locationById.has(price.locationId),
    );
    if (!availablePrices.length) {
      element('p', root, 'Nenhum preço ativo para os produtos e localidades salvos.', 'muted');
    } else {
      const wrapper = element('div', root, undefined, 'table-wrap');
      const table = element('table', wrapper);
      const head = element('thead', table);
      const header = element('tr', head);
      for (const title of ['Produto', 'SKU', 'Unidade', 'Localidade', 'Preço-base']) {
        element('th', header, title);
      }
      const body = element('tbody', table);
      for (const price of availablePrices) {
        const product = productById.get(price.productId);
        const location = locationById.get(price.locationId);
        const row = element('tr', body);
        element('td', row, product.name);
        element('td', row, product.sku);
        element('td', row, product.unit || 'UN');
        element('td', row, `${location.name} (${location.city}/${location.state})`);
        element('td', row, money(price.price));
      }
    }
  }

  const calculator = element('section', root, undefined, 'entry');
  element('h3', calculator, 'Simular preço final');
  const profile = data.sellerProfile;
  if (!profile) {
    element('p', calculator, 'Preço final indisponível: não há perfil comercial ativo salvo.', 'muted');
    return;
  }

  const customerLabel = element('label', calculator, 'Cliente');
  customerLabel.htmlFor = 'offline-price-customer';
  const customerSelect = element('select', calculator);
  customerSelect.id = 'offline-price-customer';
  customerSelect.className = 'mt-1 w-full rounded-md border px-3 py-2 text-sm';
  element('option', customerSelect, 'Selecione um cliente').value = '';
  for (const customer of data.customers || []) {
    const option = element('option', customerSelect, customer.name);
    option.value = customer.id;
  }

  const productLabel = element('label', calculator, 'Produto');
  productLabel.htmlFor = 'offline-price-product';
  productLabel.className = 'mt-3 block';
  const productSelect = element('select', calculator);
  productSelect.id = 'offline-price-product';
  productSelect.className = 'mt-1 w-full rounded-md border px-3 py-2 text-sm';
  element('option', productSelect, 'Selecione um produto').value = '';
  for (const product of products) {
    const option = element('option', productSelect, product.name);
    option.value = product.id;
  }

  const quantityLabel = element('label', calculator, 'Quantidade');
  quantityLabel.htmlFor = 'offline-price-quantity';
  quantityLabel.className = 'mt-3 block';
  const quantityInput = element('input', calculator);
  quantityInput.id = 'offline-price-quantity';
  quantityInput.type = 'number';
  quantityInput.min = '1';
  quantityInput.step = '1';
  quantityInput.value = '1';
  quantityInput.className = 'mt-1 w-full rounded-md border px-3 py-2 text-sm';

  const unitLabel = element('label', calculator, 'Unidade');
  unitLabel.htmlFor = 'offline-price-unit';
  unitLabel.className = 'mt-3 block';
  const unitSelect = element('select', calculator);
  unitSelect.id = 'offline-price-unit';
  unitSelect.className = 'mt-1 w-full rounded-md border px-3 py-2 text-sm';

  const updateUnits = () => {
    unitSelect.replaceChildren();
    const product = products.find((item) => item.id === productSelect.value);
    const units = product ? [...new Set([product.unit, product.purchaseUnit].filter(Boolean))] : [];
    if (!units.length) element('option', unitSelect, 'Selecione um produto').value = '';
    for (const unit of units) {
      const option = element('option', unitSelect, unit);
      option.value = unit;
    }
  };

  const estimate = element('p', calculator, 'Selecione cliente e produto para calcular.', 'muted');
  const updateEstimate = () => {
    const customer = (data.customers || []).find((item) => item.id === customerSelect.value);
    const product = products.find((item) => item.id === productSelect.value);
    const quantity = Number(quantityInput.value);
    if (!customer || !product || !Number.isInteger(quantity) || quantity <= 0) {
      estimate.textContent = 'Selecione cliente e produto e informe uma quantidade inteira válida.';
      return;
    }

    const basePrice = basePrices.find(
      (price) => price.productId === product.id && price.locationId === customer.locationId,
    );
    if (!basePrice) {
      estimate.textContent = 'Não há preço-base salvo para este produto na localidade do cliente.';
      return;
    }

    const unit = unitSelect.value || product.unit;
    const factor = unit === product.unit ? 1 : Number(product.unitsPerPurchaseUnit || 0);
    if (factor <= 0) {
      estimate.textContent = 'A conversão da unidade selecionada não está configurada.';
      return;
    }

    const line = {
      product,
      quantity,
      enteredUnit: unit,
      factor,
      baseQuantity: quantity * factor,
    };
    const discountPercent = getLineDiscount(line, [line], data.quantityDiscounts || []);
    const unitPrice = Number(basePrice.price) *
      (1 + Number(profile.defaultMarginPercent) / 100) *
      (1 - discountPercent / 100) * factor;
    estimate.textContent = `Preço estimado: ${money(unitPrice)} por ${unit} · Total: ${money(unitPrice * quantity)} · Desconto: ${discountPercent}%`;
  };

  productSelect.addEventListener('change', () => {
    updateUnits();
    updateEstimate();
  });
  customerSelect.addEventListener('change', updateEstimate);
  quantityInput.addEventListener('input', updateEstimate);
  unitSelect.addEventListener('change', updateEstimate);
  updateUnits();
}

async function renderOfflineOrderForm(snapshot, user, savedWork) {
  const data = snapshot.data;
  const customers = data.customers || [];
  const products = data.products || [];
  const activeProducts = products.filter((product) => product.active);
  const margin = Number(data.sellerProfile.defaultMarginPercent);
  let cart = Array.isArray(savedWork?.cart) ? savedWork.cart : [];
  let selectedCustomerId = savedWork?.customerId || '';
  let selectedProductId = savedWork?.selectedProductId || '';
  let selectedQuantity = savedWork?.quantity || 1;
  let selectedUnit = savedWork?.enteredUnit || '';
  let notes = savedWork?.notes || '';

  element('h2', root, 'Novo pedido offline');
  element('p', root, 'O rascunho fica neste dispositivo. Preço e estoque serão revalidados quando houver conexão.', 'notice');

  const form = element('form', root, undefined, 'entry');
  const customerLabel = element('label', form, 'Cliente');
  customerLabel.htmlFor = 'offline-customer';
  const customerSelect = element('select', form);
  customerSelect.id = 'offline-customer';
  customerSelect.className = 'mt-1 w-full rounded-md border px-3 py-2 text-sm';
  element('option', customerSelect, 'Selecione um cliente');
  customerSelect.options[0].value = '';
  for (const customer of customers) {
    const option = element('option', customerSelect, customer.name);
    option.value = customer.id;
  }
  customerSelect.value = selectedCustomerId;

  const productLabel = element('label', form, 'Produto');
  productLabel.htmlFor = 'offline-product';
  productLabel.className = 'mt-3 block';
  const productSelect = element('select', form);
  productSelect.id = 'offline-product';
  productSelect.className = 'mt-1 w-full rounded-md border px-3 py-2 text-sm';
  element('option', productSelect, 'Selecione um produto');
  productSelect.options[0].value = '';
  for (const product of activeProducts) {
    const option = element('option', productSelect, `${product.name} · SKU ${product.sku}`);
    option.value = product.id;
  }
  productSelect.value = selectedProductId;

  const quantityLabel = element('label', form, 'Quantidade');
  quantityLabel.htmlFor = 'offline-quantity';
  quantityLabel.className = 'mt-3 block';
  const quantityInput = element('input', form);
  quantityInput.id = 'offline-quantity';
  quantityInput.type = 'number';
  quantityInput.min = '1';
  quantityInput.step = '1';
  quantityInput.value = String(selectedQuantity);
  quantityInput.className = 'mt-1 w-full rounded-md border px-3 py-2 text-sm';

  const unitLabel = element('label', form, 'Unidade');
  unitLabel.htmlFor = 'offline-unit';
  unitLabel.className = 'mt-3 block';
  const unitSelect = element('select', form);
  unitSelect.id = 'offline-unit';
  unitSelect.className = 'mt-1 w-full rounded-md border px-3 py-2 text-sm';

  const updateUnits = () => {
    unitSelect.replaceChildren();
    const product = activeProducts.find((item) => item.id === productSelect.value);
    const units = product ? [product.unit, product.purchaseUnit].filter(Boolean) : [];
    for (const unit of [...new Set(units)]) {
      const option = element('option', unitSelect, unit);
      option.value = unit;
    }
    if (units.includes(selectedUnit)) unitSelect.value = selectedUnit;
    else if (units.length) unitSelect.value = units[0];
  };
  productSelect.addEventListener('change', updateUnits);
  updateUnits();

  const addButton = element('button', form, 'Adicionar item');
  addButton.type = 'button';
  addButton.className = 'button button-secondary';
  const errorMessage = element('p', form, '', 'muted');
  const cartContainer = element('div', root);
  const notesLabel = element('label', root, 'Observações para o entregador');
  notesLabel.htmlFor = 'offline-notes';
  notesLabel.className = 'mt-4 block text-sm font-semibold';
  const notesInput = element('textarea', root);
  notesInput.id = 'offline-notes';
  notesInput.rows = 3;
  notesInput.maxLength = 1000;
  notesInput.value = notes;
  notesInput.placeholder = 'Instruções para a entrega';
  notesInput.className = 'mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm';
  const saveButton = element('button', root, 'Salvar rascunho neste dispositivo');
  saveButton.type = 'button';
  saveButton.className = 'button button-confirm';
  const feedback = element('p', root, '', 'muted');

  function persistWork() {
    putRecord('offlinePageSnapshots', 'id', {
      id: `${user.userId}:/pedidos/novo:work`,
      userId: user.userId,
      role: user.role,
      route: '/pedidos/novo:work',
      savedAt: new Date().toISOString(),
      data: {
        customerId: selectedCustomerId,
        notes,
        cart,
        selectedProductId: productSelect.value,
        quantity: Number(quantityInput.value) || 1,
        enteredUnit: unitSelect.value,
      },
    });
  }

  function priceCart() {
    const customer = customers.find((item) => item.id === selectedCustomerId);
    if (!customer) return null;

    const lines = cart.map((line) => {
      const product = activeProducts.find((item) => item.id === line.productId);
      if (!product) return null;
      const factor = line.enteredUnit === product.unit
        ? 1
        : Number(product.unitsPerPurchaseUnit || 0);
      if (factor <= 0) return null;
      return { ...line, product, factor, baseQuantity: line.quantity * factor };
    });
    if (lines.some((line) => !line)) return null;

    const validLines = lines;
    return validLines.map((line) => {
      const basePriceRecord = data.basePrices.find(
        (price) => price.productId === line.productId && price.locationId === customer.locationId,
      );
      if (!basePriceRecord) return null;
      const discountPercent = getLineDiscount(line, validLines, data.quantityDiscounts || []);
      const unitPrice =
        Number(basePriceRecord.price) *
        (1 + margin / 100) *
        (1 - discountPercent / 100) *
        line.factor;
      return {
        productId: line.productId,
        productName: line.product.name,
        quantity: line.quantity,
        enteredUnit: line.enteredUnit,
        finalUnitPrice: unitPrice,
        total: unitPrice * line.quantity,
      };
    });
  }

  function renderCart() {
    cartContainer.replaceChildren();
    const pricedLines = priceCart();
    const total = pricedLines?.reduce((sum, line) => sum + (line?.total || 0), 0) || 0;
    element('h3', cartContainer, `Itens do rascunho (${cart.length})`);
    if (!cart.length) element('p', cartContainer, 'Adicione produtos para montar o pedido.', 'muted');
    for (const line of pricedLines || []) {
      if (!line) continue;
      element('p', cartContainer, `${line.quantity} ${line.enteredUnit} ${line.productName} · ${money(line.finalUnitPrice)} · ${money(line.total)}`);
    }
    element('strong', cartContainer, `Total estimado: ${money(total)}`);
    return { pricedLines, total };
  }

  function updatePersistedCart() {
    const result = renderCart();
    const invalidPrice = result.pricedLines?.some((line) => !line);
    saveButton.disabled = !selectedCustomerId || !cart.length || invalidPrice;
    saveButton.classList.toggle('disabled', saveButton.disabled);
    persistWork();
  }

  form.addEventListener('submit', (event) => event.preventDefault());
  productSelect.addEventListener('change', () => {
    selectedProductId = productSelect.value;
    updateUnits();
    persistWork();
  });
  quantityInput.addEventListener('input', () => {
    selectedQuantity = Number(quantityInput.value) || 1;
    persistWork();
  });
  unitSelect.addEventListener('change', () => {
    selectedUnit = unitSelect.value;
    persistWork();
  });

  customerSelect.addEventListener('change', () => {
    selectedCustomerId = customerSelect.value;
    updatePersistedCart();
  });
  notesInput.addEventListener('input', () => {
    notes = notesInput.value;
    persistWork();
  });
  addButton.addEventListener('click', () => {
    errorMessage.textContent = '';
    const product = activeProducts.find((item) => item.id === productSelect.value);
    const enteredQuantity = Number(quantityInput.value);
    if (!selectedCustomerId || !product || !Number.isInteger(enteredQuantity) || enteredQuantity <= 0) {
      errorMessage.textContent = 'Selecione cliente e produto e informe uma quantidade inteira válida.';
      return;
    }
    const selectedUnit = unitSelect.value || product.unit;
    if (selectedUnit !== product.unit && selectedUnit !== product.purchaseUnit) {
      errorMessage.textContent = 'A unidade selecionada não está configurada para o produto.';
      return;
    }
    const basePriceExists = data.basePrices.some(
      (price) => price.productId === product.id && price.locationId === customers.find((item) => item.id === selectedCustomerId)?.locationId,
    );
    if (!basePriceExists) {
      errorMessage.textContent = 'Não há preço salvo para este produto na localidade do cliente.';
      return;
    }
    cart.push({ productId: product.id, quantity: enteredQuantity, enteredUnit: selectedUnit });
    productSelect.value = '';
    quantityInput.value = '1';
    updateUnits();
    updatePersistedCart();
  });

  saveButton.addEventListener('click', () => {
    const priced = renderCart();
    if (!selectedCustomerId || !priced.pricedLines?.length || priced.pricedLines.some((line) => !line)) {
      feedback.textContent = 'Escolha cliente e itens com preços disponíveis antes de salvar.';
      return;
    }
    try {
      const drafts = readTable('draftOrders');
      const localId = drafts.reduce((max, draft) => Math.max(max, Number(draft.localId) || 0), 0) + 1;
      drafts.push({
        localId,
        sellerId: user.userId,
        customerId: selectedCustomerId,
        notes: notes.trim(),
        total: priced.total,
        items: priced.pricedLines.map((item) => item),
        createdAt: new Date().toISOString(),
        syncStatus: 'PENDING_SYNC',
        syncError: null,
      });
      writeTable('draftOrders', drafts);
      writeTable(
        'offlinePageSnapshots',
        readTable('offlinePageSnapshots').filter((snapshot) => snapshot.id !== `${user.userId}:/pedidos/novo:work`),
      );
      cart = [];
      notes = '';
      notesInput.value = '';
      updatePersistedCart();
      feedback.textContent = 'Rascunho salvo. Será revalidado e sincronizado ao reconectar.';
    } catch {
      feedback.textContent = 'Não foi possível salvar o rascunho neste dispositivo.';
    }
  });

  const savedDraft = readRecord('offlinePageSnapshots', 'id', `${user.userId}:/pedidos/novo:work`);
  if (savedDraft?.data) {
    selectedCustomerId = savedDraft.data.customerId || '';
    customerSelect.value = selectedCustomerId;
    selectedProductId = savedDraft.data.selectedProductId || '';
    productSelect.value = selectedProductId;
    selectedQuantity = savedDraft.data.quantity || 1;
    quantityInput.value = String(selectedQuantity);
    selectedUnit = savedDraft.data.enteredUnit || '';
    updateUnits();
    notes = savedDraft.data.notes || '';
    notesInput.value = notes;
    cart = Array.isArray(savedDraft.data.cart) ? savedDraft.data.cart : [];
  }
  updatePersistedCart();
}

async function showHome(user) {
  element('h2', root, 'Áreas disponíveis offline');
  addNavigation(user);
  element('p', root, 'As páginas mostram os dados salvos na última sincronização.', 'muted');
}

async function start() {
  let user;
  try {
    user = JSON.parse(localStorage.getItem(userKey) || 'null');
  } catch {
    user = null;
  }
  if (!user?.userId || !user?.role) {
    showMessage('Conecte-se e entre na sua conta para preparar os dados offline neste dispositivo.');
    return;
  }

  const route = location.pathname.replace(/\/$/, '') || '/';
  if (route === '/') {
    await showHome(user);
    return;
  }
  if (!routeAccess[route]?.includes(user.role)) {
    showMessage('Esta área não está disponível offline para o perfil atual.');
    return;
  }

  try {
    const snapshot = readRecord('offlinePageSnapshots', 'id', `${user.userId}:${route}`);
    const savedWork = route === '/pedidos/novo'
      ? readRecord('offlinePageSnapshots', 'id', `${user.userId}:/pedidos/novo:work`)
      : null;
    const drafts = readTable('draftOrders');

    if (!snapshot || snapshot.role !== user.role) {
      showMessage('Ainda não há dados offline desta página. Abra-a conectado à internet primeiro.');
      return;
    }

    const pageTitle = route === '/pedidos'
      ? 'Pedidos'
      : route === '/pedidos/novo'
        ? 'Novo pedido'
        : route === '/produtos'
          ? 'Produtos'
          : route === '/precos'
            ? 'Preços offline'
            : 'Entregas ativas';
    element('p', root, `Atualizado em ${new Date(snapshot.savedAt).toLocaleString('pt-BR')}`, 'muted');
    addNavigation(user);
    if (route === '/pedidos') renderOrders(snapshot, drafts, user);
    else if (route === '/pedidos/novo') await renderOfflineOrderForm(snapshot, user, savedWork);
    else if (route === '/produtos') renderProducts(snapshot);
    else if (route === '/precos') renderOfflinePrices(snapshot);
    else renderDeliveries(snapshot);
    document.title = `${pageTitle} · Vendas+ offline`;
  } catch {
    showMessage('Não foi possível ler os dados offline deste dispositivo.');
  }
}

void start();
