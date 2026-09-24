// ============================================================
// GAMESUY STORE — Gestor de precios
// Permite asignar precio final UYU a cada variante
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
  roundUSD,
  formatUYU,
  formatUSD
} from './data-model.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------
// ESTADO
// ---------------------------------------------
let productos = [];
let cotizaciones = { arsAUYU: 0.055, usdAUYU: 39.50 };
let filtroSearch = '';
let filtroCat = 'all';
let filtroEstado = 'pendientes';
let pagina = 1;
const POR_PAGINA = 50;

// ---------------------------------------------
// CARGA DE DATOS
// ---------------------------------------------

onSnapshot(doc(db, 'settings', 'cotizaciones'), (snap) => {
  if (!snap.exists()) return;
  const c = snap.data();
  cotizaciones.arsAUYU = Number(c.arsAUYU) || 0.055;
  cotizaciones.usdAUYU = Number(c.usdAUYU) || 39.50;
  render();
});

async function cargarProductos() {
  const snap = await getDocs(collection(db, 'products'));
  productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
}

// ---------------------------------------------
// HELPERS
// ---------------------------------------------

function tienePrecio(variante) {
  return Number(variante.precioFinalUYU) > 0;
}

function productoCompleto(p) {
  // Un producto está completo si TODAS las variantes con costo válido tienen precio
  const vs = (p.variants || []).filter(v => Number(v.costoARS) > 0);
  if (vs.length === 0) return false;
  return vs.every(v => tienePrecio(v));
}

function productoPendiente(p) {
  const vs = (p.variants || []).filter(v => Number(v.costoARS) > 0);
  if (vs.length === 0) return false;
  return vs.some(v => !tienePrecio(v));
}

function filtrarProductos() {
  let lista = productos.filter(p => (p.variants || []).length > 0);

  // Filtro por estado
  if (filtroEstado === 'pendientes') {
    lista = lista.filter(p => productoPendiente(p));
  } else if (filtroEstado === 'completos') {
    lista = lista.filter(p => productoCompleto(p));
  }

  // Filtro por categoría
  if (filtroCat !== 'all') {
    lista = lista.filter(p => (p.categories || []).includes(filtroCat));
  }

  // Filtro por búsqueda
  if (filtroSearch) {
    const q = filtroSearch.toLowerCase().trim();
    lista = lista.filter(p => String(p.title || '').toLowerCase().includes(q));
  }

  // Ordenar alfabéticamente
  lista.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'es'));

  return lista;
}

// ---------------------------------------------
// RENDER DE UNA VARIANTE
// ---------------------------------------------

function renderVariante(prodId, variante) {
  const costoARS = Number(variante.costoARS) || 0;
  const costoUYU = getCostoUYU(costoARS, cotizaciones.arsAUYU);
  const precioActual = Number(variante.precioFinalUYU) || 0;
  const completo = precioActual > 0;
  const varianteId = `${prodId}_${variante.id}`;

  return `
    <div class="variante-row ${completo ? 'variante-done' : 'variante-pending'}" data-vid="${varianteId}">
      <div class="variante-info">
        <span class="variante-label">${variante.label}</span>
        <span class="variante-costo">
          Costo: ${costoARS} ARS → <strong>${formatUYU(costoUYU)}</strong>
        </span>
      </div>
      <div class="variante-input-wrap">
        <span class="input-prefix">$</span>
        <input
          type="number"
          class="variante-input"
          placeholder="Precio final"
          value="${precioActual || ''}"
          data-prod="${prodId}"
          data-variant="${variante.id}"
          min="0"
          step="1"
        >
        <span class="input-suffix">UYU</span>
      </div>
      <div class="variante-usd">
        <span class="variante-usd-label">≈</span>
        <span class="variante-usd-value" id="usd-${varianteId}">${precioActual > 0 ? formatUSD(calcPrecioUSD(precioActual, cotizaciones.usdAUYU)) : '—'}</span>
      </div>
      <div class="variante-actions">
        <button class="btn btn-primary btn-sm btn-save-variante" data-prod="${prodId}" data-variant="${variante.id}">
          ${completo ? '💾 Guardar' : '💾 Guardar'}
        </button>
      </div>
    </div>
  `;
}

// ---------------------------------------------
// RENDER DE UN PRODUCTO (ACORDEÓN)
// ---------------------------------------------

function renderProducto(p) {
  const cats = (p.categories || []).map(c => `<span class="badge badge-${c}">${c.toUpperCase()}</span>`).join('');
  const variantes = (p.variants || []).filter(v => Number(v.costoARS) > 0 || tienePrecio(v));

  const completas = variantes.filter(v => tienePrecio(v)).length;
  const totales = variantes.length;
  const completo = completas === totales && totales > 0;

  return `
    <div class="precio-card ${completo ? 'precio-card-done' : ''}" data-prod-id="${p.id}">
      <div class="precio-card-header" data-toggle="${p.id}">
        <div class="precio-card-title-wrap">
          <div class="precio-card-badges">${cats}</div>
          <h4 class="precio-card-title">${p.title || '(sin título)'}</h4>
          <span class="precio-card-progress ${completo ? 'progress-done' : 'progress-pending'}">
            ${completas}/${totales} variantes con precio
          </span>
        </div>
        <div class="precio-card-toggle">▼</div>
      </div>
      <div class="precio-card-body hidden" id="body-${p.id}">
        ${variantes.map(v => renderVariante(p.id, v)).join('')}
      </div>
    </div>
  `;
}

// ---------------------------------------------
// RENDER GENERAL
// ---------------------------------------------

function render() {
  const list = $('precios-list');
  if (!list) return;

  // Estadísticas globales
  const totalProds = productos.filter(p => (p.variants || []).length > 0).length;
  const pendientes = productos.filter(p => productoPendiente(p)).length;
  const completos = productos.filter(p => productoCompleto(p)).length;

  $('stat-total').textContent = totalProds;
  $('stat-pending').textContent = pendientes;
  $('stat-done').textContent = completos;

  // Filtrado
  const filtrados = filtrarProductos();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (pagina > totalPaginas) pagina = totalPaginas;

  const inicio = (pagina - 1) * POR_PAGINA;
  const fin = inicio + POR_PAGINA;
  const enPagina = filtrados.slice(inicio, fin);

  // Info paginación
  $('precios-page-info').textContent = `Página ${pagina} de ${totalPaginas} (${filtrados.length} resultados)`;
  $('precios-prev').disabled = pagina <= 1;
  $('precios-next').disabled = pagina >= totalPaginas;

  // Render
  if (enPagina.length === 0) {
    list.innerHTML = '<p class="empty-message">No hay productos que coincidan con los filtros.</p>';
    return;
  }

  list.innerHTML = enPagina.map(p => renderProducto(p)).join('');

  // Listeners
  list.querySelectorAll('.precio-card-header').forEach(h => {
    h.addEventListener('click', () => {
      const id = h.dataset.toggle;
      const body = document.getElementById('body-' + id);
      if (body) {
        body.classList.toggle('hidden');
        h.querySelector('.precio-card-toggle').textContent = body.classList.contains('hidden') ? '▼' : '▲';
      }
    });
  });

  list.querySelectorAll('.variante-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const prodId = inp.dataset.prod;
      const variantId = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const usdEl = document.getElementById(`usd-${prodId}_${variantId}`);
      if (usdEl) {
        usdEl.textContent = val > 0 ? formatUSD(calcPrecioUSD(val, cotizaciones.usdAUYU)) : '—';
      }
    });
  });

  list.querySelectorAll('.btn-save-variante').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await guardarPrecioVariante(btn.dataset.prod, btn.dataset.variant);
    });
  });
}

// ---------------------------------------------
// GUARDAR PRECIO DE UNA VARIANTE
// ---------------------------------------------

async function guardarPrecioVariante(prodId, varianteId) {
  const input = document.querySelector(`.variante-input[data-prod="${prodId}"][data-variant="${varianteId}"]`);
  const btn = document.querySelector(`.btn-save-variante[data-prod="${prodId}"][data-variant="${varianteId}"]`);
  if (!input || !btn) return;

  const nuevoPrecio = parseFloat(input.value) || 0;

  if (nuevoPrecio <= 0) {
    alert('Ingresá un precio mayor a 0.');
    return;
  }

  const prod = productos.find(p => p.id === prodId);
  if (!prod) return;

  const variante = (prod.variants || []).find(v => v.id === varianteId);
  if (!variante) return;

  const costoARS = Number(variante.costoARS) || 0;
  const ganancia = calcGananciaPct(nuevoPrecio, costoARS, cotizaciones.arsAUYU);

  const nuevasVariantes = (prod.variants || []).map(v => {
    if (v.id !== varianteId) return v;
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
    await updateDoc(doc(db, 'products', prodId), { variants: nuevasVariantes });

    // Actualizar estado local
    prod.variants = nuevasVariantes;
    btn.textContent = '✅';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '💾 Guardar';
    }, 800);

    render();
  } catch (err) {
    console.error('[GamesUy] Error guardando precio:', err);
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = '💾 Guardar';
  }
}

// ---------------------------------------------
// FILTROS Y PAGINACIÓN
// ---------------------------------------------

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

// ---------------------------------------------
// INIT
// ---------------------------------------------

cargarProductos();

console.log('[GamesUy] precios.js cargado');
