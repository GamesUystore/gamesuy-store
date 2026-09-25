// ============================================================
// GAMESUY STORE — Gestor de precios
// Fase 5.3: Modal unificado (todas las variantes igual)
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, getDocs, doc, updateDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getCostoUYU, calcGananciaPct, calcPrecioUSD,
  roundUYU, formatUYU, formatUSD
} from './data-model.js';

const $ = (id) => document.getElementById(id);
const MAX_IMG_KB = 300;

let productos = [];
let cotizaciones = { arsAUYU: 0.055, usdAUYU: 39.50 };
let filtroSearch = '';
let filtroCat = 'all';
let filtroEstado = 'todos';
let pagina = 1;
const POR_PAGINA = 30;
let productoActivo = null;

console.log('[GamesUy] precios.js v15 iniciando...');

onSnapshot(doc(db, 'settings', 'cotizaciones'), (snap) => {
  if (!snap.exists()) return;
  const c = snap.data();
  cotizaciones.arsAUYU = Number(c.arsAUYU) || 0.055;
  cotizaciones.usdAUYU = Number(c.usdAUYU) || 39.50;
  render();
});

async function cargarProductos() {
  try {
    const snap = await getDocs(collection(db, 'products'));
    productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log('[GamesUy] Productos cargados:', productos.length);
    render();
  } catch (err) { console.error('[GamesUy] Error:', err); }
}

function tienePrecioNormal(v) { return Number(v?.precioFinalUYU) > 0; }
function tienePrecioOferta(v) { return Number(v?.ofertaPrecioUYU) > 0; }
function tieneStock(v) { return Number(v?.costoARS) > 0; }

function ofertaVigente(v) {
  if (!v.enOferta || !v.ofertaHasta) return false;
  const hoy = new Date().toISOString().split('T')[0];
  return v.ofertaHasta >= hoy;
}

function productoTieneStock(p) {
  return (p.variants || []).some(tieneStock);
}

function productoCompleto(p) {
  const vs = (p.variants || []);
  if (vs.length === 0) return false;
  return vs.every(v => {
    const necesitaNormal = Number(v.costoARS) > 0;
    const necesitaOferta = ofertaVigente(v);
    if (necesitaNormal && !tienePrecioNormal(v)) return false;
    if (necesitaOferta && !tienePrecioOferta(v)) return false;
    return true;
  });
}

function productoPendiente(p) {
  const vs = (p.variants || []);
  if (vs.length === 0) return false;
  return vs.some(v => {
    const necesitaNormal = Number(v.costoARS) > 0;
    const necesitaOferta = ofertaVigente(v);
    if (necesitaNormal && !tienePrecioNormal(v)) return true;
    if (necesitaOferta && !tienePrecioOferta(v)) return true;
    return false;
  });
}

function filtrarProductos() {
  let lista = productos.filter(p => (p.variants || []).length > 0);
  if (filtroEstado === 'pendientes') lista = lista.filter(productoPendiente);
  else if (filtroEstado === 'completos') lista = lista.filter(productoCompleto);
  else if (filtroEstado === 'con-stock') lista = lista.filter(productoTieneStock);
  else if (filtroEstado === 'sin-stock') lista = lista.filter(p => !productoTieneStock(p));

  if (filtroCat !== 'all') lista = lista.filter(p => (p.categories || []).includes(filtroCat));
  if (filtroSearch) {
    const q = filtroSearch.toLowerCase().trim();
    lista = lista.filter(p => String(p.title || '').toLowerCase().includes(q));
  }
  lista.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'es'));
  return lista;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFecha(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

function render() {
  const list = $('precios-list');
  if (!list) return;

  const totalProds = productos.filter(p => (p.variants || []).length > 0).length;
  const pendientes = productos.filter(productoPendiente).length;
  const completos = productos.filter(productoCompleto).length;

  const st = $('stat-total'); if (st) st.textContent = totalProds;
  const sp = $('stat-pending'); if (sp) sp.textContent = pendientes;
  const sd = $('stat-done'); if (sd) sd.textContent = completos;

  const filtrados = filtrarProductos();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (pagina > totalPaginas) pagina = totalPaginas;
  const inicio = (pagina - 1) * POR_PAGINA;
  const enPagina = filtrados.slice(inicio, inicio + POR_PAGINA);

  const pageInfo = $('precios-page-info');
  if (pageInfo) pageInfo.textContent = `Página ${pagina} de ${totalPaginas} (${filtrados.length} resultados)`;

  const prevBtn = $('precios-prev'); if (prevBtn) prevBtn.disabled = pagina <= 1;
  const nextBtn = $('precios-next'); if (nextBtn) nextBtn.disabled = pagina >= totalPaginas;

  if (enPagina.length === 0) {
    list.innerHTML = '<p class="empty-message">No hay productos que coincidan.</p>';
    return;
  }

  list.innerHTML = enPagina.map(p => {
    const cats = (p.categories || []).map(c => `<span class="badge badge-${c}">${c.toUpperCase()}</span>`).join('');
    const vs = (p.variants || []);

    let totalItems = 0, completosItems = 0;
    vs.forEach(v => {
      if (Number(v.costoARS) > 0) { totalItems++; if (tienePrecioNormal(v)) completosItems++; }
      if (ofertaVigente(v) && Number(v.ofertaCostoARS) > 0) { totalItems++; if (tienePrecioOferta(v)) completosItems++; }
    });

    const completo = completosItems === totalItems && totalItems > 0;
    const progresoClase = completo ? 'progress-done' : (completosItems > 0 ? 'progress-partial' : 'progress-pending');
    const tieneImg = p.coverUrl ? '<span class="fila-img-badge">🖼️</span> ' : '';
    const oculto = p.visible === false ? '<span style="color:#ff8aa8; font-size:0.7rem;">(oculto)</span> ' : '';
    const tieneOferta = vs.some(ofertaVigente);
    const badgeOferta = tieneOferta ? '<span class="fila-oferta-badge">🔥</span> ' : '';
    const soloOferta = p.soloOferta ? '<span class="fila-solo-oferta">[SOLO OFERTA]</span> ' : '';
    const tieneStockReal = productoTieneStock(p);
    const badgeStock = tieneStockReal
      ? '<span class="fila-stock-badge fila-stock-ok">🟢</span> '
      : '<span class="fila-stock-badge fila-stock-off">⚫</span> ';

    return `
      <div class="fila-juego ${completo ? 'fila-completa' : ''}" data-prod-id="${p.id}">
        <div class="fila-badges">${cats}</div>
        <div class="fila-titulo">${badgeStock}${oculto}${tieneImg}${badgeOferta}${soloOferta}${escapeHtml(p.title || '(sin título)')}</div>
        <div class="fila-progreso ${progresoClase}">${completosItems}/${totalItems}</div>
        <div class="fila-arrow">✏️</div>
      </div>
    `;
  }).join('');

  if (!list.dataset.delegado) {
    list.addEventListener('click', (e) => {
      const fila = e.target.closest('.fila-juego');
      if (!fila) return;
      const id = fila.dataset.prodId;
      if (id) abrirModal(id);
    });
    list.dataset.delegado = '1';
  }
}

function abrirModal(prodId) {
  const prod = productos.find(p => p.id === prodId);
  if (!prod) return;
  productoActivo = prod;
  const title = $('price-modal-title');
  if (title) title.textContent = prod.title || 'Editar';
  window.switchModalTab('precios');
  renderModalPrecios(prod);
  renderModalInfo(prod);
  const modal = $('price-modal');
  if (modal) modal.classList.remove('hidden');
}

function cerrarModal() {
  const modal = $('price-modal');
  if (modal) modal.classList.add('hidden');
  productoActivo = null;
}

function renderModalPrecios(prod) {
  const body = $('price-modal-precios');
  if (!body) return;

  const variantes = prod.variants || [];
  if (variantes.length === 0) {
    body.innerHTML = `
      <div class="empty-message">
        <p>Este producto no tiene variantes cargadas.</p>
        <p style="font-size:0.85rem;margin-top:8px;color:var(--text-muted);">Re-procesá el Excel de Stock.</p>
      </div>`;
    return;
  }

  body.innerHTML = variantes.map(v => renderVarianteUnificada(v)).join('');
  activarListenersVariante(body, prod);
}

function renderVarianteUnificada(v) {
  const costoARS = Number(v.costoARS) || 0;
  const ofertaCostoARS = Number(v.ofertaCostoARS) || 0;
  const esOferta = ofertaVigente(v);
  const sinStock = !costoARS && !esOferta;

  const costoUYU = getCostoUYU(costoARS, cotizaciones.arsAUYU);
  const precioNormal = Number(v.precioFinalUYU) || 0;
  const usdNormal = precioNormal > 0 ? formatUSD(calcPrecioUSD(precioNormal, cotizaciones.usdAUYU)) : '—';

  const ofertaCostoUYU = getCostoUYU(ofertaCostoARS, cotizaciones.arsAUYU);
  const ofertaPrecio = Number(v.ofertaPrecioUYU) || 0;
  const usdOferta = ofertaPrecio > 0 ? formatUSD(calcPrecioUSD(ofertaPrecio, cotizaciones.usdAUYU)) : '—';

  const ofertaBadge = esOferta
    ? `<span class="variante-oferta-badge">🔥 hasta ${formatFecha(v.ofertaHasta)}</span>`
    : (v.enOferta ? `<span class="variante-oferta-badge variante-oferta-vencida">⌛ Vencida</span>` : '');

  const sinStockBadge = sinStock ? '<span class="variante-sinstock-badge">SIN STOCK</span>' : '';

  const bloqueNormal = `
    <div class="precio-seccion">
      <div class="precio-seccion-titulo">💰 PRECIO NORMAL</div>

      <div class="precio-costo-row">
        <label class="precio-costo-label">Costo proveedor (ARS):</label>
        <div class="precio-costo-inputs">
          <input type="number" class="variante-input-costo" data-variant="${v.id}"
                 value="${costoARS || ''}" placeholder="0" min="0" step="1">
          <span class="costo-ars-label">ARS</span>
          <span class="costo-arrow">→</span>
          <span class="costo-uyu-preview" data-costo-uyu="${v.id}">${costoUYU > 0 ? formatUYU(costoUYU) : '$ 0'}</span>
        </div>
      </div>

      <div class="precio-final-row">
        <label class="precio-final-label">Precio final (UYU):</label>
        <div class="precio-final-inputs">
          <div class="precio-input-wrap">
            <span class="input-prefix">$</span>
            <input type="number" class="variante-input-normal" data-variant="${v.id}"
                   value="${precioNormal || ''}" placeholder="0" min="0" step="1">
            <span class="input-suffix">UYU</span>
          </div>
          <span class="precio-usd-preview" data-usd-normal="${v.id}">≈ ${usdNormal}</span>
        </div>
      </div>

      <div class="variante-actions">
        <button type="button" class="btn btn-primary btn-sm btn-save-normal" data-variant="${v.id}">💾 Guardar precio normal</button>
      </div>
    </div>
  `;

  const bloqueOferta = esOferta ? `
    <div class="precio-seccion precio-seccion-oferta">
      <div class="precio-seccion-titulo">🔥 PRECIO DE OFERTA</div>

      <div class="precio-costo-row">
        <label class="precio-costo-label">Costo proveedor (ARS):</label>
        <div class="precio-costo-inputs">
          <input type="number" class="variante-input-costo-oferta" data-variant="${v.id}"
                 value="${ofertaCostoARS || ''}" placeholder="0" min="0" step="1">
          <span class="costo-ars-label">ARS</span>
          <span class="costo-arrow">→</span>
          <span class="costo-uyu-preview" data-costo-uyu-oferta="${v.id}">${ofertaCostoUYU > 0 ? formatUYU(ofertaCostoUYU) : '$ 0'}</span>
        </div>
      </div>

      <div class="precio-final-row">
        <label class="precio-final-label">Precio de oferta (UYU):</label>
        <div class="precio-final-inputs">
          <div class="precio-input-wrap">
            <span class="input-prefix">$</span>
            <input type="number" class="variante-input-oferta" data-variant="${v.id}"
                   value="${ofertaPrecio || ''}" placeholder="0" min="0" step="1">
            <span class="input-suffix">UYU</span>
          </div>
          <span class="precio-usd-preview" data-usd-oferta="${v.id}">≈ ${usdOferta}</span>
        </div>
      </div>

      <div class="variante-actions">
        <button type="button" class="btn btn-primary btn-sm btn-save-oferta" data-variant="${v.id}">💾 Guardar precio de oferta</button>
      </div>
    </div>
  ` : '';

  return `
    <div class="variante-bloque ${esOferta ? 'variante-con-oferta' : ''}">
      <div class="variante-header">
        <span class="variante-label">${v.label}</span>
        <div class="variante-header-badges">
          ${sinStockBadge}
          ${ofertaBadge}
        </div>
      </div>
      ${bloqueNormal}
      ${bloqueOferta}
    </div>
  `;
}

function activarListenersVariante(body, prod) {
  body.querySelectorAll('.variante-input-costo').forEach(inp => {
    inp.addEventListener('input', () => {
      const vid = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const costUYU = getCostoUYU(val, cotizaciones.arsAUYU);
      const el = body.querySelector(`[data-costo-uyu="${vid}"]`);
      if (el) el.textContent = costUYU > 0 ? formatUYU(costUYU) : '$ 0';
    });
  });

  body.querySelectorAll('.variante-input-costo-oferta').forEach(inp => {
    inp.addEventListener('input', () => {
      const vid = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const costUYU = getCostoUYU(val, cotizaciones.arsAUYU);
      const el = body.querySelector(`[data-costo-uyu-oferta="${vid}"]`);
      if (el) el.textContent = costUYU > 0 ? formatUYU(costUYU) : '$ 0';
    });
  });

  body.querySelectorAll('.variante-input-normal').forEach(inp => {
    inp.addEventListener('input', () => {
      const vid = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const el = body.querySelector(`[data-usd-normal="${vid}"]`);
      if (el) el.textContent = val > 0 ? '≈ ' + formatUSD(calcPrecioUSD(val, cotizaciones.usdAUYU)) : '≈ —';
    });
  });

  body.querySelectorAll('.variante-input-oferta').forEach(inp => {
    inp.addEventListener('input', () => {
      const vid = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const el = body.querySelector(`[data-usd-oferta="${vid}"]`);
      if (el) el.textContent = val > 0 ? '≈ ' + formatUSD(calcPrecioUSD(val, cotizaciones.usdAUYU)) : '≈ —';
    });
  });

  body.querySelectorAll('.btn-save-normal').forEach(btn => {
    btn.addEventListener('click', () => guardarNormal(prod, btn.dataset.variant, body));
  });

  body.querySelectorAll('.btn-save-oferta').forEach(btn => {
    btn.addEventListener('click', () => guardarOferta(prod, btn.dataset.variant, body));
  });
}

async function guardarNormal(prod, variantId, body) {
  const costoInput = body.querySelector(`.variante-input-costo[data-variant="${variantId}"]`);
  const precioInput = body.querySelector(`.variante-input-normal[data-variant="${variantId}"]`);
  const btn = body.querySelector(`.btn-save-normal[data-variant="${variantId}"]`);
  if (!costoInput || !precioInput || !btn) return;

  const nuevoCosto = parseFloat(costoInput.value) || 0;
  const nuevoPrecio = parseFloat(precioInput.value) || 0;

  if (nuevoCosto <= 0 && nuevoPrecio <= 0) {
    alert('Ingresá al menos el costo o el precio final.');
    return;
  }

  const ganancia = nuevoCosto > 0 && nuevoPrecio > 0
    ? calcGananciaPct(nuevoPrecio, nuevoCosto, cotizaciones.arsAUYU)
    : null;

  const nuevasVariantes = (prod.variants || []).map(v => {
    if (v.id !== variantId) return v;
    return {
      ...v,
      costoARS: nuevoCosto,
      disponible: nuevoCosto > 0,
      precioFinalUYU: nuevoPrecio > 0 ? roundUYU(nuevoPrecio) : v.precioFinalUYU,
      gananciaPct: ganancia !== null ? ganancia : v.gananciaPct,
      updatedAt: new Date().toISOString()
    };
  });

  btn.disabled = true; btn.textContent = '⏳';
  try {
    await updateDoc(doc(db, 'products', prod.id), { variants: nuevasVariantes });
    prod.variants = nuevasVariantes;
    btn.textContent = '✅ Guardado';
    setTimeout(() => { btn.disabled = false; btn.textContent = '💾 Guardar precio normal'; render(); }, 900);
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('Error: ' + err.message);
    btn.disabled = false; btn.textContent = '💾 Guardar precio normal';
  }
}

async function guardarOferta(prod, variantId, body) {
  const costoInput = body.querySelector(`.variante-input-costo-oferta[data-variant="${variantId}"]`);
  const precioInput = body.querySelector(`.variante-input-oferta[data-variant="${variantId}"]`);
  const btn = body.querySelector(`.btn-save-oferta[data-variant="${variantId}"]`);
  if (!costoInput || !precioInput || !btn) return;

  const nuevoCosto = parseFloat(costoInput.value) || 0;
  const nuevoPrecio = parseFloat(precioInput.value) || 0;

  if (nuevoCosto <= 0 && nuevoPrecio <= 0) {
    alert('Ingresá al menos el costo o el precio final.');
    return;
  }

  const ganancia = nuevoCosto > 0 && nuevoPrecio > 0
    ? calcGananciaPct(nuevoPrecio, nuevoCosto, cotizaciones.arsAUYU)
    : null;

  const nuevasVariantes = (prod.variants || []).map(v => {
    if (v.id !== variantId) return v;
    return {
      ...v,
      ofertaCostoARS: nuevoCosto,
      ofertaPrecioUYU: nuevoPrecio > 0 ? roundUYU(nuevoPrecio) : v.ofertaPrecioUYU,
      ofertaGananciaPct: ganancia !== null ? ganancia : v.ofertaGananciaPct,
      updatedAt: new Date().toISOString()
    };
  });

  btn.disabled = true; btn.textContent = '⏳';
  try {
    await updateDoc(doc(db, 'products', prod.id), { variants: nuevasVariantes });
    prod.variants = nuevasVariantes;
    btn.textContent = '✅ Guardado';
    setTimeout(() => { btn.disabled = false; btn.textContent = '💾 Guardar precio de oferta'; render(); }, 900);
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('Error: ' + err.message);
    btn.disabled = false; btn.textContent = '💾 Guardar precio de oferta';
  }
}

function renderModalInfo(prod) {
  const t = $('info-title'); if (t) t.value = prod.title || '';
  const c = $('info-categories'); if (c) c.value = (prod.categories || []).join(', ');
  const y = $('info-youtube'); if (y) y.value = prod.youtubeUrl || '';
  const d = $('info-description'); if (d) d.value = prod.description || '';
  const p = $('info-preorder'); if (p) p.checked = !!prod.isPreorder;
  const v = $('info-visible'); if (v) v.checked = prod.visible !== false;
  const r = $('info-release'); if (r) r.value = prod.releaseDate || '';
  actualizarPreview('cover', prod.coverUrl || '');
  actualizarPreview('gameplay', prod.gameplayUrl || '');
  const cf = $('info-cover-file'); if (cf) cf.value = '';
  const gf = $('info-gameplay-file'); if (gf) gf.value = '';
  const cu = $('info-cover-url'); if (cu) cu.value = '';
  const gu = $('info-gameplay-url'); if (gu) gu.value = '';
  const cs = $('info-cover-status'); if (cs) cs.textContent = '';
  const gs = $('info-gameplay-status'); if (gs) gs.textContent = '';
}

function actualizarPreview(tipo, url) {
  const wrap = $(`info-${tipo}-preview-wrap`);
  const img = $(`info-${tipo}-preview`);
  if (!wrap || !img) return;
  if (url && url.trim()) {
    img.src = url;
    wrap.classList.remove('hidden');
    wrap.dataset.url = url;
  } else {
    img.removeAttribute('src');
    wrap.classList.add('hidden');
    delete wrap.dataset.url;
  }
}

['cover', 'gameplay'].forEach(tipo => {
  const fileInput = $(`info-${tipo}-file`);
  const urlInput = $(`info-${tipo}-url`);
  const statusEl = $(`info-${tipo}-status`);

  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const sizeKB = Math.round(file.size / 1024);
      if (sizeKB > MAX_IMG_KB) {
        if (statusEl) statusEl.textContent = `❌ Imagen muy grande (${sizeKB} KB, máx ${MAX_IMG_KB} KB).`;
        alert(`La imagen pesa ${sizeKB} KB. Máximo: ${MAX_IMG_KB} KB.\n\nComprimila en tinypng.com`);
        fileInput.value = '';
        return;
      }
      if (statusEl) statusEl.textContent = `⏳ Procesando (${sizeKB} KB)...`;
      try {
        const b64 = await fileToBase64(file);
        actualizarPreview(tipo, b64);
        if (statusEl) statusEl.textContent = `✅ Imagen lista. Guardá información.`;
      } catch (err) {
        if (statusEl) statusEl.textContent = '❌ Error: ' + err.message;
      }
      fileInput.value = '';
    });
  }
  if (urlInput) urlInput.addEventListener('input', () => actualizarPreview(tipo, urlInput.value));
});

document.querySelectorAll('.upload-preview-clear').forEach(btn => {
  btn.addEventListener('click', () => {
    const tipo = btn.dataset.clear;
    const url = $(`info-${tipo}-url`); if (url) url.value = '';
    const file = $(`info-${tipo}-file`); if (file) file.value = '';
    actualizarPreview(tipo, '');
    const status = $(`info-${tipo}-status`); if (status) status.textContent = '';
  });
});

$('btn-save-info')?.addEventListener('click', async () => {
  if (!productoActivo) return;
  const btn = $('btn-save-info');
  btn.disabled = true; btn.textContent = '⏳ Guardando...';
  try {
    const coverWrap = $('info-cover-preview-wrap');
    const gameplayWrap = $('info-gameplay-preview-wrap');
    const coverUrl = (coverWrap?.dataset.url) || '';
    const gameplayUrl = (gameplayWrap?.dataset.url) || '';
    const categorias = $('info-categories').value.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);

    const data = {
      title: $('info-title').value.trim(),
      categories: categorias,
      coverUrl, gameplayUrl,
      youtubeUrl: $('info-youtube').value.trim(),
      description: $('info-description').value.trim(),
      isPreorder: $('info-preorder').checked,
      visible: $('info-visible').checked,
      releaseDate: $('info-release').value || '',
      updatedAt: new Date().toISOString()
    };

    await updateDoc(doc(db, 'products', productoActivo.id), data);
    Object.assign(productoActivo, data);
    btn.textContent = '✅ Guardado';
    setTimeout(() => { btn.disabled = false; btn.textContent = '💾 Guardar información'; render(); }, 900);
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('Error: ' + err.message);
    btn.disabled = false; btn.textContent = '💾 Guardar información';
  }
});

$('price-modal-close')?.addEventListener('click', cerrarModal);
$('price-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'price-modal') cerrarModal();
});

$('precios-search')?.addEventListener('input', (e) => { filtroSearch = e.target.value; pagina = 1; render(); });
$('precios-cat')?.addEventListener('change', (e) => { filtroCat = e.target.value; pagina = 1; render(); });
$('precios-estado')?.addEventListener('change', (e) => { filtroEstado = e.target.value; pagina = 1; render(); });
$('precios-prev')?.addEventListener('click', () => { if (pagina > 1) { pagina--; render(); } });
$('precios-next')?.addEventListener('click', () => { pagina++; render(); });

cargarProductos();
console.log('[GamesUy] precios.js v15 cargado (modal unificado)');
