// ============================================================
// GAMESUY STORE — Gestor de precios + Información del juego
// ============================================================

import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getCostoUYU,
  calcGananciaPct,
  calcPrecioUSD,
  roundUYU,
  formatUYU,
  formatUSD
} from './data-model.js';

const $ = (id) => document.getElementById(id);

// Cloudinary
const CLOUDINARY_CLOUD_NAME = 'takxvid9';
const CLOUDINARY_UPLOAD_PRESET = 'gamesuy_unsigned';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// Estado
let productos = [];
let cotizaciones = { arsAUYU: 0.055, usdAUYU: 39.50 };
let filtroSearch = '';
let filtroCat = 'all';
let filtroEstado = 'todos';
let pagina = 1;
const POR_PAGINA = 30;
let productoActivo = null;

console.log('[GamesUy] precios.js v8 iniciando...');

// ============================================================
// COTIZACIONES
// ============================================================

onSnapshot(doc(db, 'settings', 'cotizaciones'), (snap) => {
  if (!snap.exists()) return;
  const c = snap.data();
  cotizaciones.arsAUYU = Number(c.arsAUYU) || 0.055;
  cotizaciones.usdAUYU = Number(c.usdAUYU) || 39.50;
  render();
});

// ============================================================
// PRODUCTOS
// ============================================================

async function cargarProductos() {
  try {
    const snap = await getDocs(collection(db, 'products'));
    productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log('[GamesUy] Productos cargados:', productos.length);
    render();
  } catch (err) {
    console.error('[GamesUy] Error cargando productos:', err);
  }
}

// ============================================================
// HELPERS
// ============================================================

function tienePrecio(v) { return Number(v?.precioFinalUYU) > 0; }

function productoCompleto(p) {
  const vs = (p.variants || []).filter(v => Number(v.costoARS) > 0);
  if (vs.length === 0) return false;
  return vs.every(tienePrecio);
}

function productoPendiente(p) {
  const vs = (p.variants || []).filter(v => Number(v.costoARS) > 0);
  if (vs.length === 0) return false;
  return vs.some(v => !tienePrecio(v));
}

function filtrarProductos() {
  let lista = productos.filter(p => (p.variants || []).length > 0);

  if (filtroEstado === 'pendientes') lista = lista.filter(productoPendiente);
  else if (filtroEstado === 'completos') lista = lista.filter(productoCompleto);

  if (filtroCat !== 'all') {
    lista = lista.filter(p => (p.categories || []).includes(filtroCat));
  }

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

// ============================================================
// RENDER
// ============================================================

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
    list.innerHTML = '<p class="empty-message">No hay productos que coincidan con los filtros.</p>';
    return;
  }

  list.innerHTML = enPagina.map(p => {
    const cats = (p.categories || []).map(c => `<span class="badge badge-${c}">${c.toUpperCase()}</span>`).join('');
    const vs = (p.variants || []).filter(v => Number(v.costoARS) > 0 || tienePrecio(v));
    const completas = vs.filter(tienePrecio).length;
    const totales = vs.length;
    const completo = completas === totales && totales > 0;
    const progresoClase = completo ? 'progress-done' : (completas > 0 ? 'progress-partial' : 'progress-pending');
    const tieneImg = p.coverUrl ? '<span class="fila-img-badge">🖼️</span> ' : '';
    const oculto = p.visible === false ? '<span style="color:#ff8aa8; font-size:0.7rem;">(oculto)</span> ' : '';

    return `
      <div class="fila-juego ${completo ? 'fila-completa' : ''}" data-prod-id="${p.id}">
        <div class="fila-badges">${cats}</div>
        <div class="fila-titulo">${oculto}${tieneImg}${escapeHtml(p.title || '(sin título)')}</div>
        <div class="fila-progreso ${progresoClase}">${completas}/${totales}</div>
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

// ============================================================
// MODAL
// ============================================================

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

// ============================================================
// TAB PRECIOS
// ============================================================

function renderModalPrecios(prod) {
  const body = $('price-modal-precios');
  if (!body) return;

  const variantes = (prod.variants || []).filter(v => Number(v.costoARS) > 0 || tienePrecio(v));

  if (variantes.length === 0) {
    body.innerHTML = '<p class="empty-message">Este producto no tiene variantes con costo cargado.</p>';
    return;
  }

  body.innerHTML = variantes.map(v => {
    const costoARS = Number(v.costoARS) || 0;
    const costoUYU = getCostoUYU(costoARS, cotizaciones.arsAUYU);
    const precioActual = Number(v.precioFinalUYU) || 0;
    const usdPreview = precioActual > 0 ? formatUSD(calcPrecioUSD(precioActual, cotizaciones.usdAUYU)) : '—';

    return `
      <div class="variante-modal-row">
        <div class="variante-modal-header">
          <span class="variante-modal-label">${v.label}</span>
        </div>
        <div class="variante-modal-costo">
          <span class="info-label">Costo proveedor:</span>
          <span class="info-value">${costoARS} ARS → <strong>${formatUYU(costoUYU)}</strong></span>
        </div>
        <div class="variante-modal-input-row">
          <div class="variante-modal-input-wrap">
            <span class="input-prefix">$</span>
            <input type="number" class="variante-modal-input" placeholder="Precio final"
              value="${precioActual || ''}" data-variant="${v.id}" min="0" step="1">
            <span class="input-suffix">UYU</span>
          </div>
          <span class="variante-modal-usd" data-usd-variant="${v.id}">≈ ${usdPreview}</span>
        </div>
        <div class="variante-modal-actions">
          <button type="button" class="btn btn-primary btn-sm btn-modal-save" data-variant="${v.id}">💾 Guardar</button>
        </div>
      </div>
    `;
  }).join('');

  body.querySelectorAll('.variante-modal-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const vid = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const usdEl = body.querySelector(`[data-usd-variant="${vid}"]`);
      if (usdEl) usdEl.textContent = val > 0 ? '≈ ' + formatUSD(calcPrecioUSD(val, cotizaciones.usdAUYU)) : '≈ —';
    });
  });

  body.querySelectorAll('.btn-modal-save').forEach(btn => {
    btn.addEventListener('click', () => guardarPrecio(prod, btn.dataset.variant, body));
  });
}

async function guardarPrecio(prod, variantId, body) {
  const input = body.querySelector(`.variante-modal-input[data-variant="${variantId}"]`);
  const btn = body.querySelector(`.btn-modal-save[data-variant="${variantId}"]`);
  if (!input || !btn) return;

  const nuevoPrecio = parseFloat(input.value) || 0;
  if (nuevoPrecio <= 0) { alert('Ingresá un precio mayor a 0.'); return; }

  const variante = (prod.variants || []).find(v => v.id === variantId);
  if (!variante) return;

  const costoARS = Number(variante.costoARS) || 0;
  const ganancia = calcGananciaPct(nuevoPrecio, costoARS, cotizaciones.arsAUYU);

  const nuevasVariantes = (prod.variants || []).map(v => {
    if (v.id !== variantId) return v;
    return {
      ...v,
      precioFinalUYU: roundUYU(nuevoPrecio),
      gananciaPct: ganancia,
      updatedAt: new Date().toISOString()
    };
  });

  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    await updateDoc(doc(db, 'products', prod.id), { variants: nuevasVariantes });
    prod.variants = nuevasVariantes;
    btn.textContent = '✅ Guardado';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '💾 Guardar';
      render();
    }, 900);
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = '💾 Guardar';
  }
}

// ============================================================
// TAB INFORMACIÓN
// ============================================================

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

// Upload listeners
['cover', 'gameplay'].forEach(tipo => {
  const fileInput = $(`info-${tipo}-file`);
  const urlInput = $(`info-${tipo}-url`);

  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        alert('La imagen supera los 5 MB.');
        fileInput.value = '';
        return;
      }

      const statusEl = $(`info-${tipo}-status`);
      if (statusEl) statusEl.textContent = '⏳ Subiendo a Cloudinary...';

      try {
        const url = await subirACloudinary(file);
        actualizarPreview(tipo, url);
        if (statusEl) statusEl.textContent = '✅ Imagen subida. No olvides Guardar información.';
      } catch (err) {
        console.error('[GamesUy] Error subiendo:', err);
        if (statusEl) statusEl.textContent = '❌ Error: ' + (err.message || 'desconocido');
        alert('❌ Error al subir:\n' + err.message);
      }

      fileInput.value = '';
    });
  }

  if (urlInput) {
    urlInput.addEventListener('input', () => {
      actualizarPreview(tipo, urlInput.value);
    });
  }
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

// ============================================================
// SUBIR A CLOUDINARY
// ============================================================

async function subirACloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  // NO mandamos 'folder' porque el preset unsigned no lo acepta
  // (Si querés organizar por carpeta, se configura EN el preset, en Cloudinary)

  console.log('[GamesUy] Subiendo a Cloudinary:', file.name, file.size, 'bytes');

  const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });

  if (!res.ok) {
    let msg = 'Error HTTP ' + res.status;
    try {
      const errData = await res.json();
      msg = errData?.error?.message || msg;
      console.error('[GamesUy] Respuesta Cloudinary:', errData);
    } catch (e) {}
    throw new Error(msg);
  }

  const data = await res.json();
  console.log('[GamesUy] Subida OK:', data.secure_url);
  return data.secure_url;
}

// Guardar info
$('btn-save-info')?.addEventListener('click', async () => {
  if (!productoActivo) return;
  const btn = $('btn-save-info');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    const coverWrap = $('info-cover-preview-wrap');
    const gameplayWrap = $('info-gameplay-preview-wrap');
    const coverUrl = (coverWrap?.dataset.url) || '';
    const gameplayUrl = (gameplayWrap?.dataset.url) || '';

    const categorias = $('info-categories').value
      .split(',')
      .map(c => c.trim().toLowerCase())
      .filter(Boolean);

    const data = {
      title: $('info-title').value.trim(),
      categories: categorias,
      coverUrl: coverUrl,
      gameplayUrl: gameplayUrl,
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
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '💾 Guardar información';
      render();
    }, 900);
  } catch (err) {
    console.error('[GamesUy] Error guardando info:', err);
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = '💾 Guardar información';
  }
});

// ============================================================
// CERRAR MODAL
// ============================================================

$('price-modal-close')?.addEventListener('click', cerrarModal);
$('price-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'price-modal') cerrarModal();
});

// ============================================================
// FILTROS Y PAGINACIÓN
// ============================================================

$('precios-search')?.addEventListener('input', (e) => {
  filtroSearch = e.target.value;
  pagina = 1;
  render();
});

$('precios-cat')?.addEventListener('change', (e) => {
  filtroCat = e.target.value;
  pagina = 1;
  render();
});

$('precios-estado')?.addEventListener('change', (e) => {
  filtroEstado = e.target.value;
  pagina = 1;
  render();
});

$('precios-prev')?.addEventListener('click', () => {
  if (pagina > 1) { pagina--; render(); }
});

$('precios-next')?.addEventListener('click', () => {
  pagina++;
  render();
});

// ============================================================
// INIT
// ============================================================

cargarProductos();

console.log('[GamesUy] precios.js v8 cargado');
