// ============================================================
// GAMESUY STORE — Carga masiva de precios
// Fase 7.1: Badges visuales (stock/oferta/preventa/solo-oferta)
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, getDocs, doc, writeBatch, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getCostoUYU, calcGananciaPct, calcPrecioUSD,
  roundUYU, formatUYU, formatUSD
} from './data-model.js';

const $ = (id) => document.getElementById(id);

let productos = [];
let cotizaciones = { arsAUYU: 0.055, usdAUYU: 39.50 };
let filtroSearch = '';
let filtroCat = 'all';
let filtroEstado = 'sin-precio';
let pagina = 1;
const POR_PAGINA = 20;

let cambios = {};

console.log('[GamesUy] precios-masivo.js v2 iniciando...');

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
    console.log('[GamesUy] Productos cargados (masivo):', productos.length);
    render();
  } catch (err) {
    console.error('[GamesUy] Error:', err);
  }
}

// ============================================================
// HELPERS
// ============================================================
function tieneStock(v) { return Number(v?.costoARS) > 0 && v?.disponible !== false; }

function ofertaVigente(v) {
  if (!v.enOferta || !v.ofertaHasta) return false;
  const hoy = new Date().toISOString().split('T')[0];
  return v.ofertaHasta >= hoy;
}

function productoEsPreventa(p) {
  if (p.isPreorder !== true) return false;
  if (!p.releaseDate) return true;
  const hoy = new Date().toISOString().split('T')[0];
  return p.releaseDate > hoy;
}

function productoTieneOferta(p) {
  return (p.variants || []).some(v => ofertaVigente(v));
}

function productoTieneStock(p) {
  return (p.variants || []).some(tieneStock);
}

function productoSinPrecio(p) {
  const vs = (p.variants || []).filter(v => Number(v.costoARS) > 0);
  if (vs.length === 0) return false;
  return vs.some(v => Number(v.precioFinalUYU) === 0);
}

function productoConPrecio(p) {
  const vs = (p.variants || []).filter(v => Number(v.costoARS) > 0);
  if (vs.length === 0) return false;
  return vs.every(v => Number(v.precioFinalUYU) > 0);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function formatFecha(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

// Devuelve el estado del juego para mostrar el badge correcto
function obtenerEstadoProducto(p) {
  const esPreventa = productoEsPreventa(p);
  const esSoloOferta = p.soloOferta && !p.soloPreventa;
  const tieneOferta = productoTieneOferta(p);
  const tieneStock = productoTieneStock(p);

  // Orden de prioridad: Preventa > Solo Oferta > Oferta > Con Stock > Sin Stock
  if (esPreventa) {
    return {
      tipo: 'preventa',
      icono: '🚀',
      label: 'PREVENTA',
      extra: p.releaseDate ? `Estreno: ${formatFecha(p.releaseDate)}` : 'Sin fecha',
      clase: 'masivo-juego-preventa'
    };
  }
  if (esSoloOferta) {
    const fechaFin = (p.variants || []).map(v => v.ofertaHasta).filter(Boolean).sort()[0];
    return {
      tipo: 'solo-oferta',
      icono: '🎁',
      label: 'SOLO OFERTA',
      extra: fechaFin ? `hasta ${formatFecha(fechaFin)}` : '',
      clase: 'masivo-juego-solo-oferta'
    };
  }
  if (tieneOferta) {
    const fechaFin = (p.variants || []).map(v => v.ofertaHasta).filter(Boolean).sort()[0];
    return {
      tipo: 'oferta',
      icono: '🔥',
      label: 'OFERTA ACTIVA',
      extra: fechaFin ? `hasta ${formatFecha(fechaFin)}` : '',
      clase: 'masivo-juego-oferta'
    };
  }
  if (tieneStock) {
    return {
      tipo: 'stock',
      icono: '🟢',
      label: 'STOCK NORMAL',
      extra: '',
      clase: 'masivo-juego-stock'
    };
  }
  return {
    tipo: 'sin-stock',
    icono: '⚫',
    label: 'SIN STOCK',
    extra: '',
    clase: 'masivo-juego-sin-stock'
  };
}

// ============================================================
// FILTROS
// ============================================================
function filtrarProductos() {
  let lista = productos.filter(p => (p.variants || []).some(v => Number(v.costoARS) > 0));

  if (filtroEstado === 'sin-precio') lista = lista.filter(productoSinPrecio);
  else if (filtroEstado === 'con-precio') lista = lista.filter(productoConPrecio);
  else if (filtroEstado === 'ofertas') lista = lista.filter(productoTieneOferta);
  else if (filtroEstado === 'preventas') lista = lista.filter(productoEsPreventa);

  if (filtroCat !== 'all') lista = lista.filter(p => (p.categories || []).includes(filtroCat));

  if (filtroSearch) {
    const q = filtroSearch.toLowerCase().trim();
    lista = lista.filter(p => String(p.title || '').toLowerCase().includes(q));
  }

  lista.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'es'));
  return lista;
}

// ============================================================
// CAMBIOS PENDIENTES
// ============================================================
function actualizarBarraCambios() {
  const total = Object.values(cambios).reduce((acc, prod) => acc + Object.keys(prod).length, 0);
  const el = $('masivo-changes');
  const btn = $('btn-save-masivo');
  if (el) {
    el.textContent = total === 0
      ? 'Sin cambios pendientes'
      : `${total} cambio${total !== 1 ? 's' : ''} pendiente${total !== 1 ? 's' : ''}`;
    el.classList.toggle('con-cambios', total > 0);
  }
  if (btn) btn.disabled = total === 0;
}

function registrarCambio(productId, variantId, campo, valor) {
  if (!cambios[productId]) cambios[productId] = {};
  if (!cambios[productId][variantId]) cambios[productId][variantId] = {};
  cambios[productId][variantId][campo] = valor;
  actualizarBarraCambios();
}

// ============================================================
// RENDER
// ============================================================
function render() {
  const list = $('masivo-list');
  if (!list) return;

  const filtrados = filtrarProductos();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (pagina > totalPaginas) pagina = totalPaginas;

  const inicio = (pagina - 1) * POR_PAGINA;
  const enPagina = filtrados.slice(inicio, inicio + POR_PAGINA);

  const count = $('masivo-count');
  if (count) count.textContent = `${filtrados.length} juego${filtrados.length !== 1 ? 's' : ''}`;

  const pageInfo = $('masivo-page-info');
  if (pageInfo) pageInfo.textContent = `Página ${pagina} de ${totalPaginas}`;

  const prevBtn = $('masivo-prev'); if (prevBtn) prevBtn.disabled = pagina <= 1;
  const nextBtn = $('masivo-next'); if (nextBtn) nextBtn.disabled = pagina >= totalPaginas;

  if (enPagina.length === 0) {
    list.innerHTML = '<p class="empty-message">No hay juegos que coincidan.</p>';
    return;
  }

  list.innerHTML = enPagina.map(p => renderJuego(p)).join('');
  activarListeners();
  actualizarBarraCambios();
}

function renderJuego(p) {
  const estado = obtenerEstadoProducto(p);
  const cats = (p.categories || []).map(c => `<span class="badge badge-${c}">${c.toUpperCase()}</span>`).join('');

  // Solo mostramos variantes con costo > 0
  const variantes = (p.variants || []).filter(v => Number(v.costoARS) > 0);

  const variantesHtml = variantes.map(v => {
    const costoARS = Number(v.costoARS) || 0;
    const costoUYU = getCostoUYU(costoARS, cotizaciones.arsAUYU);
    const precioActual = Number(v.precioFinalUYU) || 0;
    const usdPreview = precioActual > 0 ? formatUSD(calcPrecioUSD(precioActual, cotizaciones.usdAUYU)) : '—';

    // ¿Esta variante tiene oferta activa?
    const tieneOfertaVar = ofertaVigente(v);
    const ofertaBadge = tieneOfertaVar ? '<span class="masivo-var-oferta-badge">🔥</span>' : '';

    // ¿Esta variante tiene oferta con precio cargado?
    const ofertaPrecio = Number(v.ofertaPrecioUYU) || 0;
    const ofertaInfo = tieneOfertaVar && ofertaPrecio > 0
      ? `<div class="masivo-var-oferta-info">🔥 Oferta: $${ofertaPrecio} UYU</div>`
      : '';

    return `
      <div class="masivo-variante-row ${tieneOfertaVar ? 'masivo-var-con-oferta' : ''}" data-variant="${v.id}">
        <div class="masivo-var-label">
          ${ofertaBadge}${escapeHtml(v.label)}
        </div>

        <div class="masivo-var-costo">
          <input type="number" class="masivo-input-costo" data-prod="${p.id}" data-variant="${v.id}"
                 value="${costoARS}" min="0" step="1" placeholder="ARS">
          <span class="masivo-var-ars">ARS</span>
          <span class="masivo-var-arrow">→</span>
          <span class="masivo-var-uyu" data-costo-uyu="${p.id}_${v.id}">${formatUYU(costoUYU)}</span>
        </div>

        <div class="masivo-var-precio">
          <span class="masivo-var-symbol">$</span>
          <input type="number" class="masivo-input-precio" data-prod="${p.id}" data-variant="${v.id}"
                 value="${precioActual || ''}" min="0" step="1" placeholder="Precio final">
          <span class="masivo-var-uyu-label">UYU</span>
        </div>

        <div class="masivo-var-usd" data-usd="${p.id}_${v.id}">${precioActual > 0 ? usdPreview : '≈ —'}</div>
        ${ofertaInfo}
      </div>
    `;
  }).join('');

  // Badge del estado general
  const estadoBadge = `
    <span class="masivo-estado-badge masivo-estado-${estado.tipo}">
      ${estado.icono} ${estado.label}${estado.extra ? ` · ${estado.extra}` : ''}
    </span>
  `;

  return `
    <div class="masivo-juego ${estado.clase}" data-prod-id="${p.id}">
      <div class="masivo-juego-header">
        <div class="masivo-juego-title">
          <div class="masivo-juego-badges">
            ${estadoBadge}
            ${cats}
          </div>
          <h4>${escapeHtml(p.title || '(sin título)')}</h4>
        </div>
      </div>
      <div class="masivo-juego-variantes">
        ${variantesHtml}
      </div>
    </div>
  `;
}

function activarListeners() {
  document.querySelectorAll('.masivo-input-costo').forEach(inp => {
    inp.addEventListener('input', () => {
      const prodId = inp.dataset.prod;
      const variantId = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const costoUYU = getCostoUYU(val, cotizaciones.arsAUYU);
      const el = document.querySelector(`[data-costo-uyu="${prodId}_${variantId}"]`);
      if (el) el.textContent = formatUYU(costoUYU);
      registrarCambio(prodId, variantId, 'costoARS', val);
    });
  });

  document.querySelectorAll('.masivo-input-precio').forEach(inp => {
    inp.addEventListener('input', () => {
      const prodId = inp.dataset.prod;
      const variantId = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const usdEl = document.querySelector(`[data-usd="${prodId}_${variantId}"]`);
      if (usdEl) usdEl.textContent = val > 0 ? '≈ ' + formatUSD(calcPrecioUSD(val, cotizaciones.usdAUYU)) : '≈ —';

      const costoInput = document.querySelector(`.masivo-input-costo[data-prod="${prodId}"][data-variant="${variantId}"]`);
      const costoARS = parseFloat(costoInput?.value) || 0;
      let ganancia = null;
      if (costoARS > 0 && val > 0) {
        ganancia = calcGananciaPct(val, costoARS, cotizaciones.arsAUYU);
      }

      registrarCambio(prodId, variantId, 'precioFinalUYU', val);
      registrarCambio(prodId, variantId, 'gananciaPct', ganancia);
    });
  });
}

// ============================================================
// GUARDAR TODOS LOS CAMBIOS
// ============================================================
async function guardarTodos() {
  const total = Object.keys(cambios).length;
  if (total === 0) return;

  if (!confirm(`¿Guardar los cambios de ${total} juego${total !== 1 ? 's' : ''}?`)) return;

  const btn = $('btn-save-masivo');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    const operaciones = [];

    for (const [prodId, variants] of Object.entries(cambios)) {
      const prod = productos.find(p => p.id === prodId);
      if (!prod) continue;

      const nuevasVariantes = (prod.variants || []).map(v => {
        const cambiosVar = variants[v.id];
        if (!cambiosVar) return v;

        const nuevoCosto = cambiosVar.costoARS !== undefined ? cambiosVar.costoARS : Number(v.costoARS) || 0;
        const nuevoPrecio = cambiosVar.precioFinalUYU !== undefined ? cambiosVar.precioFinalUYU : Number(v.precioFinalUYU) || 0;
        const nuevaGanancia = cambiosVar.gananciaPct !== undefined ? cambiosVar.gananciaPct : v.gananciaPct;

        return {
          ...v,
          costoARS: nuevoCosto,
          disponible: nuevoCosto > 0,
          precioFinalUYU: nuevoPrecio > 0 ? roundUYU(nuevoPrecio) : v.precioFinalUYU,
          gananciaPct: nuevaGanancia,
          updatedAt: new Date().toISOString()
        };
      });

      operaciones.push({
        ref: doc(db, 'products', prodId),
        data: { variants: nuevasVariantes, updatedAt: new Date().toISOString() }
      });
    }

    const TAM = 400;
    for (let i = 0; i < operaciones.length; i += TAM) {
      const lote = operaciones.slice(i, i + TAM);
      const batch = writeBatch(db);
      lote.forEach(op => batch.set(op.ref, op.data, { merge: true }));
      await batch.commit();
    }

    for (const op of operaciones) {
      const prod = productos.find(p => p.id === op.ref.id);
      if (prod) prod.variants = op.data.variants;
    }

    cambios = {};
    actualizarBarraCambios();
    alert(`✅ ${total} juego${total !== 1 ? 's' : ''} guardado${total !== 1 ? 's' : ''} correctamente.`);
    render();
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('❌ Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar todos los cambios';
  }
}

// ============================================================
// FILTROS Y PAGINACIÓN
// ============================================================
$('masivo-search')?.addEventListener('input', (e) => {
  filtroSearch = e.target.value;
  pagina = 1;
  render();
});

$('masivo-cat')?.addEventListener('change', (e) => {
  filtroCat = e.target.value;
  pagina = 1;
  render();
});

$('masivo-estado')?.addEventListener('change', (e) => {
  filtroEstado = e.target.value;
  pagina = 1;
  render();
});

$('masivo-prev')?.addEventListener('click', () => {
  if (pagina > 1) { pagina--; render(); }
});

$('masivo-next')?.addEventListener('click', () => {
  pagina++;
  render();
});

$('btn-save-masivo')?.addEventListener('click', guardarTodos);

// ============================================================
// INIT
// ============================================================
cargarProductos();
console.log('[GamesUy] precios-masivo.js v2 cargado');
