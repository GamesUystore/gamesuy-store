// ============================================================
// GAMESUY STORE — Carga masiva de precios
// Fase 7.3: Botón Editar
// Fase 3.2: Filtro de pendientes + marcado automático
// Fase 3.3: Precio de OFERTA editable desde carga masiva
// Fase 3.4: Toggle "Activar oferta" por variante
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, getDocs, doc, writeBatch, onSnapshot, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getCostoUYU, calcGananciaPct, calcPrecioUSD,
  roundUYU, formatUYU, formatUSD
} from './data-model.js';
import { marcarPendienteResuelto } from './pendientes.js';

const $ = (id) => document.getElementById(id);

let productos = [];
let cotizaciones = { arsAUYU: 0.055, usdAUYU: 39.50 };
let filtroSearch = '';
let filtroCat = 'all';
let filtroEstado = 'sin-precio';
let pagina = 1;
const POR_PAGINA = 20;

let cambios = {};
let pendingIds = new Set();

console.log('[GamesUy] precios-masivo.js v7 iniciando...');

onSnapshot(doc(db, 'settings', 'cotizaciones'), (snap) => {
  if (!snap.exists()) return;
  const c = snap.data();
  cotizaciones.arsAUYU = Number(c.arsAUYU) || 0.055;
  cotizaciones.usdAUYU = Number(c.usdAUYU) || 39.50;
  render();
});

onSnapshot(
  query(collection(db, 'pendientes'), where('resuelto', '==', false)),
  (snap) => {
    pendingIds = new Set(snap.docs.map(d => d.data().productoId).filter(Boolean));
    render();
  },
  (err) => {
    console.warn('[GamesUy] No se pudo escuchar pendientes:', err);
  }
);

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

function sumarDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  f.setDate(f.getDate() + dias);
  const yy = f.getFullYear();
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const dd = String(f.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function fechaHoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function obtenerEstadoProducto(p) {
  const esPreventa = productoEsPreventa(p);
  const esSoloOferta = p.soloOferta && !p.soloPreventa;
  const tieneOferta = productoTieneOferta(p);
  const tieneStock = productoTieneStock(p);

  if (esPreventa) {
    return {
      tipo: 'preventa', icono: '🚀', label: 'PREVENTA',
      extra: p.releaseDate ? `Estreno: ${formatFecha(p.releaseDate)}` : 'Sin fecha',
      clase: 'masivo-juego-preventa'
    };
  }
  if (esSoloOferta) {
    const fechaFin = (p.variants || []).map(v => v.ofertaHasta).filter(Boolean).sort()[0];
    return {
      tipo: 'solo-oferta', icono: '🎁', label: 'SOLO OFERTA',
      extra: fechaFin ? `hasta ${formatFecha(fechaFin)}` : '', clase: 'masivo-juego-solo-oferta'
    };
  }
  if (tieneOferta) {
    const fechaFin = (p.variants || []).map(v => v.ofertaHasta).filter(Boolean).sort()[0];
    return {
      tipo: 'oferta', icono: '🔥', label: 'OFERTA ACTIVA',
      extra: fechaFin ? `hasta ${formatFecha(fechaFin)}` : '', clase: 'masivo-juego-oferta'
    };
  }
  if (tieneStock) {
    return {
      tipo: 'stock', icono: '🟢', label: 'STOCK NORMAL', extra: '', clase: 'masivo-juego-stock'
    };
  }
  return {
    tipo: 'sin-stock', icono: '⚫', label: 'SIN STOCK', extra: '', clase: 'masivo-juego-sin-stock'
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
  else if (filtroEstado === 'pendientes') lista = lista.filter(p => pendingIds.has(p.id));

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
  const variantes = (p.variants || []).filter(v => Number(v.costoARS) > 0);

  const esPendiente = pendingIds.has(p.id);
  const pendienteBadge = esPendiente
    ? '<span class="masivo-pendiente-badge">⚠️ PENDIENTE</span>'
    : '';

  const variantesHtml = variantes.map(v => renderVarianteConOferta(p, v)).join('');

  const estadoBadge = `
    <span class="masivo-estado-badge masivo-estado-${estado.tipo}">
      ${estado.icono} ${estado.label}${estado.extra ? ` · ${estado.extra}` : ''}
    </span>
  `;

  const tituloEscapado = String(p.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

  return `
    <div class="masivo-juego ${estado.clase} ${esPendiente ? 'masivo-juego-pendiente' : ''}" data-prod-id="${p.id}">
      <div class="masivo-juego-header">
        <div class="masivo-juego-title">
          <div class="masivo-juego-badges">
            ${pendienteBadge}
            ${estadoBadge}
            ${cats}
          </div>
          <h4>${escapeHtml(p.title || '(sin título)')}</h4>
        </div>
        <div class="masivo-juego-actions">
          <button class="masivo-juego-edit" title="Editar este juego"
                  onclick="window.abrirEditarMasivo('${p.id}')">✏️ Editar</button>
          <button class="masivo-juego-delete" title="Eliminar este juego"
                  onclick="window.eliminarJuegoMasivo('${p.id}', '${tituloEscapado}')">🗑️</button>
        </div>
      </div>
      <div class="masivo-juego-variantes">
        ${variantesHtml}
      </div>
    </div>
  `;
}

// ============================================================
// RENDER DE VARIANTE — con TOGGLE de oferta
// ============================================================
function renderVarianteConOferta(p, v) {
  const costoARS = Number(v.costoARS) || 0;
  const costoUYU = getCostoUYU(costoARS, cotizaciones.arsAUYU);
  const precioNormal = Number(v.precioFinalUYU) || 0;
  const usdNormal = precioNormal > 0 ? formatUSD(calcPrecioUSD(precioNormal, cotizaciones.usdAUYU)) : '—';

  // ¿Tiene oferta activa?
  const ofertaOn = v.enOferta === true;
  const ofertaCostoARS = Number(v.ofertaCostoARS) || 0;
  const ofertaCostoUYU = getCostoUYU(ofertaCostoARS, cotizaciones.arsAUYU);
  const ofertaPrecio = Number(v.ofertaPrecioUYU) || 0;
  const usdOferta = ofertaPrecio > 0 ? formatUSD(calcPrecioUSD(ofertaPrecio, cotizaciones.usdAUYU)) : '⚠️ Falta';

  // Fecha: si ya tenía, mantener. Si no, por defecto hoy + 7 días
  const fechaOferta = v.ofertaHasta || sumarDias(fechaHoyISO(), 7);

  return `
    <div class="masivo-variante-bloque ${ofertaOn ? 'masivo-con-oferta' : ''}" data-variante-id="${v.id}">
      <div class="masivo-var-header">
        <div class="masivo-var-titulo">🎮 ${escapeHtml(v.label)}</div>
        <label class="masivo-toggle-oferta" title="Activar/desactivar oferta para esta variante">
          <input type="checkbox" class="masivo-check-oferta"
                 data-prod="${p.id}" data-variant="${v.id}"
                 ${ofertaOn ? 'checked' : ''}>
          <span class="masivo-toggle-label">🔥 Oferta</span>
        </label>
      </div>

      <!-- Fila NORMAL -->
      <div class="masivo-var-fila masivo-var-fila-normal">
        <div class="masivo-var-fila-label">💰 NORMAL</div>
        <div class="masivo-var-costo">
          <input type="number" class="masivo-input-costo"
                 data-prod="${p.id}" data-variant="${v.id}"
                 value="${costoARS}" min="0" step="1" placeholder="ARS">
          <span class="masivo-var-ars">ARS</span>
          <span class="masivo-var-arrow">→</span>
          <span class="masivo-var-uyu" data-costo-uyu="${p.id}_${v.id}_normal">${formatUYU(costoUYU)}</span>
        </div>
        <div class="masivo-var-precio">
          <span class="masivo-var-symbol">$</span>
          <input type="number" class="masivo-input-precio"
                 data-prod="${p.id}" data-variant="${v.id}"
                 value="${precioNormal || ''}" min="0" step="1" placeholder="Precio final">
          <span class="masivo-var-uyu-label">UYU</span>
        </div>
        <div class="masivo-var-usd" data-usd="${p.id}_${v.id}_normal">${precioNormal > 0 ? usdNormal : '≈ —'}</div>
      </div>

      <!-- Fila OFERTA (oculta si toggle off) -->
      <div class="masivo-var-fila masivo-var-fila-oferta ${ofertaOn ? '' : 'hidden'}" data-fila-oferta="${v.id}">
        <div class="masivo-var-fila-label">
          🔥 OFERTA
          <input type="date" class="masivo-input-fecha-oferta"
                 data-prod="${p.id}" data-variant="${v.id}"
                 value="${fechaOferta}">
        </div>
        <div class="masivo-var-costo">
          <input type="number" class="masivo-input-costo-oferta"
                 data-prod="${p.id}" data-variant="${v.id}"
                 value="${ofertaCostoARS || ''}" min="0" step="1" placeholder="ARS">
          <span class="masivo-var-ars">ARS</span>
          <span class="masivo-var-arrow">→</span>
          <span class="masivo-var-uyu" data-costo-uyu="${p.id}_${v.id}_oferta">${formatUYU(ofertaCostoUYU)}</span>
        </div>
        <div class="masivo-var-precio masivo-var-precio-oferta">
          <span class="masivo-var-symbol">$</span>
          <input type="number" class="masivo-input-precio-oferta"
                 data-prod="${p.id}" data-variant="${v.id}"
                 value="${ofertaPrecio || ''}" min="0" step="1" placeholder="Precio OFERTA">
          <span class="masivo-var-uyu-label">UYU</span>
        </div>
        <div class="masivo-var-usd masivo-var-usd-oferta" data-usd="${p.id}_${v.id}_oferta">${ofertaPrecio > 0 ? usdOferta : '⚠️ Falta precio'}</div>
      </div>
    </div>
  `;
}

function activarListeners() {
  // Toggle de oferta
  document.querySelectorAll('.masivo-check-oferta').forEach(chk => {
    chk.addEventListener('change', () => {
      const prodId = chk.dataset.prod;
      const variantId = chk.dataset.variant;
      const filaOferta = document.querySelector(`[data-fila-oferta="${variantId}"]`);

      if (chk.checked) {
        if (filaOferta) filaOferta.classList.remove('hidden');
        registrarCambio(prodId, variantId, 'enOferta', true);
        // Si no tiene fecha guardada, la guardamos
        const fechaInput = document.querySelector(`.masivo-input-fecha-oferta[data-prod="${prodId}"][data-variant="${variantId}"]`);
        if (fechaInput) {
          registrarCambio(prodId, variantId, 'ofertaHasta', fechaInput.value);
        }
      } else {
        if (filaOferta) filaOferta.classList.add('hidden');
        registrarCambio(prodId, variantId, 'enOferta', false);
      }
    });
  });

  // Input de fecha de oferta
  document.querySelectorAll('.masivo-input-fecha-oferta').forEach(inp => {
    inp.addEventListener('input', () => {
      registrarCambio(inp.dataset.prod, inp.dataset.variant, 'ofertaHasta', inp.value);
    });
  });

  // Inputs de COSTO NORMAL
  document.querySelectorAll('.masivo-input-costo').forEach(inp => {
    inp.addEventListener('input', () => {
      const prodId = inp.dataset.prod;
      const variantId = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const costoUYU = getCostoUYU(val, cotizaciones.arsAUYU);
      const el = document.querySelector(`[data-costo-uyu="${prodId}_${variantId}_normal"]`);
      if (el) el.textContent = formatUYU(costoUYU);
      registrarCambio(prodId, variantId, 'costoARS', val);
    });
  });

  // Inputs de COSTO OFERTA
  document.querySelectorAll('.masivo-input-costo-oferta').forEach(inp => {
    inp.addEventListener('input', () => {
      const prodId = inp.dataset.prod;
      const variantId = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const costoUYU = getCostoUYU(val, cotizaciones.arsAUYU);
      const el = document.querySelector(`[data-costo-uyu="${prodId}_${variantId}_oferta"]`);
      if (el) el.textContent = formatUYU(costoUYU);
      registrarCambio(prodId, variantId, 'ofertaCostoARS', val);
    });
  });

  // Inputs de PRECIO NORMAL
  document.querySelectorAll('.masivo-input-precio').forEach(inp => {
    inp.addEventListener('input', () => {
      const prodId = inp.dataset.prod;
      const variantId = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const usdEl = document.querySelector(`[data-usd="${prodId}_${variantId}_normal"]`);
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

  // Inputs de PRECIO OFERTA
  document.querySelectorAll('.masivo-input-precio-oferta').forEach(inp => {
    inp.addEventListener('input', () => {
      const prodId = inp.dataset.prod;
      const variantId = inp.dataset.variant;
      const val = parseFloat(inp.value) || 0;
      const usdEl = document.querySelector(`[data-usd="${prodId}_${variantId}_oferta"]`);
      if (usdEl) usdEl.textContent = val > 0 ? '≈ ' + formatUSD(calcPrecioUSD(val, cotizaciones.usdAUYU)) : '⚠️ Falta precio';

      const costoInput = document.querySelector(`.masivo-input-costo-oferta[data-prod="${prodId}"][data-variant="${variantId}"]`);
      const costoARS = parseFloat(costoInput?.value) || 0;
      let ganancia = null;
      if (costoARS > 0 && val > 0) {
        ganancia = calcGananciaPct(val, costoARS, cotizaciones.arsAUYU);
      }

      registrarCambio(prodId, variantId, 'ofertaPrecioUYU', val);
      registrarCambio(prodId, variantId, 'ofertaGananciaPct', ganancia);
    });
  });
}

// ============================================================
// ABRIR EDITOR
// ============================================================
window.abrirEditarMasivo = function(id) {
  if (typeof window.abrirEditarProducto !== 'function') {
    alert('No se pudo abrir el editor. Recargá la página e intentá de nuevo.');
    return;
  }
  window.abrirEditarProducto(id);
  setTimeout(() => {
    if (typeof window.switchModalTab === 'function') {
      window.switchModalTab('info');
    }
  }, 80);
};

// ============================================================
// ELIMINAR
// ============================================================
window.eliminarJuegoMasivo = async function(id, titulo) {
  const primera = confirm(
    `⚠️ ¿ELIMINAR ESTE JUEGO?\n\n` +
    `"${titulo}"\n\n` +
    `Esta acción NO se puede deshacer.`
  );
  if (!primera) return;

  const segunda = confirm(
    `⚠️ CONFIRMACIÓN FINAL\n\n` +
    `Se van a borrar TODAS las variantes de este juego.\n\n` +
    `¿Estás completamente seguro?`
  );
  if (!segunda) return;

  try {
    await deleteDoc(doc(db, 'products', id));
    productos = productos.filter(p => p.id !== id);
    delete cambios[id];
    marcarPendienteResuelto(id);
    alert(`✅ Juego eliminado:\n\n${titulo}`);
    render();
  } catch (err) {
    console.error('[GamesUy] Error al eliminar juego:', err);
    alert('❌ Error: ' + err.message);
  }
};

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
    const prodsConCambios = [];

    for (const [prodId, variants] of Object.entries(cambios)) {
      const prod = productos.find(p => p.id === prodId);
      if (!prod) continue;

      const nuevasVariantes = (prod.variants || []).map(v => {
        const cambiosVar = variants[v.id];
        if (!cambiosVar) return v;

        const nuevoCosto = cambiosVar.costoARS !== undefined ? cambiosVar.costoARS : Number(v.costoARS) || 0;
        const nuevoPrecio = cambiosVar.precioFinalUYU !== undefined ? cambiosVar.precioFinalUYU : Number(v.precioFinalUYU) || 0;
        const nuevaGanancia = cambiosVar.gananciaPct !== undefined ? cambiosVar.gananciaPct : v.gananciaPct;

        const resultado = {
          ...v,
          costoARS: nuevoCosto,
          disponible: nuevoCosto > 0,
          precioFinalUYU: nuevoPrecio > 0 ? roundUYU(nuevoPrecio) : v.precioFinalUYU,
          gananciaPct: nuevaGanancia,
          updatedAt: new Date().toISOString()
        };

        // Si el usuario tocó el toggle de oferta
        if (cambiosVar.enOferta !== undefined) {
          if (cambiosVar.enOferta === true) {
            // ACTIVAR oferta
            resultado.enOferta = true;
            resultado.ofertaCostoARS = cambiosVar.ofertaCostoARS !== undefined
              ? cambiosVar.ofertaCostoARS
              : Number(v.ofertaCostoARS) || 0;
            resultado.ofertaPrecioUYU = cambiosVar.ofertaPrecioUYU !== undefined && cambiosVar.ofertaPrecioUYU > 0
              ? roundUYU(cambiosVar.ofertaPrecioUYU)
              : Number(v.ofertaPrecioUYU) || 0;
            resultado.ofertaGananciaPct = cambiosVar.ofertaGananciaPct !== undefined
              ? cambiosVar.ofertaGananciaPct
              : v.ofertaGananciaPct;
            resultado.ofertaHasta = cambiosVar.ofertaHasta || v.ofertaHasta || sumarDias(fechaHoyISO(), 7);
          } else {
            // DESACTIVAR oferta
            resultado.enOferta = false;
            resultado.ofertaCostoARS = null;
            resultado.ofertaPrecioUYU = null;
            resultado.ofertaGananciaPct = null;
            resultado.ofertaHasta = null;
          }
        } else if (ofertaVigente(v)) {
          // No tocó el toggle, pero ya estaba en oferta → actualizar valores
          if (cambiosVar.ofertaCostoARS !== undefined) resultado.ofertaCostoARS = cambiosVar.ofertaCostoARS;
          if (cambiosVar.ofertaPrecioUYU !== undefined) {
            resultado.ofertaPrecioUYU = cambiosVar.ofertaPrecioUYU > 0
              ? roundUYU(cambiosVar.ofertaPrecioUYU)
              : v.ofertaPrecioUYU;
          }
          if (cambiosVar.ofertaGananciaPct !== undefined) resultado.ofertaGananciaPct = cambiosVar.ofertaGananciaPct;
          if (cambiosVar.ofertaHasta !== undefined) resultado.ofertaHasta = cambiosVar.ofertaHasta;
        }

        return resultado;
      });

      operaciones.push({
        ref: doc(db, 'products', prodId),
        data: { variants: nuevasVariantes, updatedAt: new Date().toISOString() }
      });

      prodsConCambios.push(prodId);
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

    for (const prodId of prodsConCambios) {
      await marcarPendienteResuelto(prodId);
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
console.log('[GamesUy] precios-masivo.js v7 cargado (con toggle de oferta)');
