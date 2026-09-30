// ============================================================
// GAMESUY STORE — Catálogo público + Ofertas + Preventas
// Fase 8.8: Compartir juego por WhatsApp + Copiar link
// ============================================================

import { db, auth } from './firebase-config.js';
import {
  collection, onSnapshot, doc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { calcPrecioUSD, formatUYU, formatUSD } from './data-model.js';

const $ = (id) => document.getElementById(id);

let productos = [];
let cotizaciones = { arsAUYU: 0.055, usdAUYU: 39.50 };
let pagosTexto = 'Prex / Mercado Pago / BROU';
let isAdmin = false;
let hashProcesado = false;

let catState = { search: '', cat: 'all', pagina: 1 };
let ofState = { search: '', cat: 'all', pagina: 1 };
let preState = { search: '', cat: 'all', pagina: 1 };
const POR_PAGINA = 24;

let countdownInterval = null;

// Detectar si el usuario es admin
onAuthStateChanged(auth, (user) => {
  isAdmin = !!user;
  renderAll();
});

onSnapshot(doc(db, 'settings', 'cotizaciones'), (snap) => {
  if (!snap.exists()) return;
  const c = snap.data();
  cotizaciones.arsAUYU = Number(c.arsAUYU) || 0.055;
  cotizaciones.usdAUYU = Number(c.usdAUYU) || 39.50;
  renderAll();
});

onSnapshot(doc(db, 'settings', 'payments'), (snap) => {
  pagosTexto = (snap.exists() && snap.data().text) ? snap.data().text : 'Prex / Mercado Pago / BROU';
  renderAll();
});

onSnapshot(collection(db, 'products'), (snap) => {
  productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  window.__productosCache = productos;
  console.log('[GamesUy] Catálogo:', productos.length, 'productos');
  renderAll();

  // Procesar hash de URL (link compartido) solo la primera vez que cargan
  if (!hashProcesado) {
    hashProcesado = true;
    setTimeout(procesarHashInicial, 300);
  }
});

// ============================================================
// HELPERS
// ============================================================
function tienePrecioNormal(v) { return Number(v?.precioFinalUYU) > 0; }
function tieneCostoNormal(v) { return Number(v?.costoARS) > 0; }
function tieneCostoOferta(v) { return Number(v?.ofertaCostoARS) > 0; }

function ofertaVigente(v) {
  if (!v.enOferta || !v.ofertaHasta) return null;
  const hoy = new Date().toISOString().split('T')[0];
  if (v.ofertaHasta < hoy) return null;
  if (!(Number(v.ofertaPrecioUYU) > 0)) return null;
  return {
    precio: Number(v.ofertaPrecioUYU),
    original: Number(v.precioFinalUYU) || 0,
    hasta: v.ofertaHasta
  };
}

function varianteConStock(v) {
  if (v.disponible === false) return false;
  if (ofertaVigente(v) !== null) return true;
  return tieneCostoNormal(v) && tienePrecioNormal(v);
}

function esPreventaActiva(p) {
  if (p.visible === false) return false;
  if (p.isPreorder !== true) return false;
  if (!p.releaseDate) return true;
  const hoy = new Date().toISOString().split('T')[0];
  return p.releaseDate > hoy;
}

function productoVisible(p) {
  if (p.visible === false) return false;
  if (esPreventaActiva(p)) return false;
  if (p.soloOferta && !p.soloPreventa) {
    return (p.variants || []).some(v => ofertaVigente(v));
  }
  return (p.variants || []).some(varianteConStock);
}

function productoTieneOferta(p) {
  if (p.visible === false) return false;
  if (esPreventaActiva(p)) return false;
  return (p.variants || []).some(v => ofertaVigente(v));
}

function productoEsPreventa(p) {
  return esPreventaActiva(p);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function safeUrl(url) {
  return String(url || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatearFecha(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

// ============================================================
// CATEGORÍAS DISPONIBLES
// ============================================================
function consolasDisponiblesDe(p, modoOferta) {
  const cats = p.categories || [];
  const esOferta = modoOferta === true;

  const conStock = cats.filter(c => {
    return (p.variants || []).some(v => {
      if (v.categoria !== c) return false;
      if (esOferta) return ofertaVigente(v) !== null;
      return varianteConStock(v);
    });
  });

  if (conStock.length > 0) return conStock;

  return cats.filter(c => {
    return (p.variants || []).some(v => {
      if (v.categoria !== c) return false;
      return Number(v.costoARS) > 0 || v.disponible === false;
    });
  });
}

function variantesDeCategoria(p, categoria, modoOferta) {
  const esOferta = modoOferta === true;

  const todas = (p.variants || []).filter(v => {
    if (v.categoria !== categoria) return false;
    return Number(v.costoARS) > 0 || Number(v.ofertaCostoARS) > 0 || v.disponible === false;
  });

  const conStock = todas.filter(v => {
    if (esOferta) return ofertaVigente(v) !== null;
    return varianteConStock(v);
  });

  if (conStock.length > 0) return conStock;
  return todas;
}

// ============================================================
// FILTROS
// ============================================================
function filtrarProductos() {
  let lista = productos.filter(productoVisible);
  if (catState.cat !== 'all') lista = lista.filter(p => (p.categories || []).includes(catState.cat));
  if (catState.search) {
    const q = catState.search.toLowerCase().trim();
    lista = lista.filter(p => String(p.title || '').toLowerCase().includes(q));
  }
  lista.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'es'));
  return lista;
}

function filtrarOfertas() {
  let lista = productos.filter(productoTieneOferta);
  if (ofState.cat !== 'all') lista = lista.filter(p => (p.categories || []).includes(ofState.cat));
  if (ofState.search) {
    const q = ofState.search.toLowerCase().trim();
    lista = lista.filter(p => String(p.title || '').toLowerCase().includes(q));
  }
  lista.sort((a, b) => {
    const fa = (a.variants || []).map(v => v.ofertaHasta).filter(Boolean).sort()[0] || '9999';
    const fb = (b.variants || []).map(v => v.ofertaHasta).filter(Boolean).sort()[0] || '9999';
    return fa.localeCompare(fb);
  });
  return lista;
}

function filtrarPreventas() {
  let lista = productos.filter(productoEsPreventa);
  if (preState.cat !== 'all') lista = lista.filter(p => (p.categories || []).includes(preState.cat));
  if (preState.search) {
    const q = preState.search.toLowerCase().trim();
    lista = lista.filter(p => String(p.title || '').toLowerCase().includes(q));
  }
  lista.sort((a, b) => {
    const fa = a.releaseDate || '9999';
    const fb = b.releaseDate || '9999';
    return fa.localeCompare(fb);
  });
  return lista;
}

// ============================================================
// RENDER GLOBAL
// ============================================================
function renderAll() {
  renderCatalogo();
  renderOfertas();
  renderPreventas();
}

// ============================================================
// RENDER CATÁLOGO
// ============================================================
function renderCatalogo() {
  const grid = $('product-grid');
  const count = $('results-count');
  if (!grid) return;

  const filtrados = filtrarProductos();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (catState.pagina > totalPaginas) catState.pagina = totalPaginas;
  const inicio = (catState.pagina - 1) * POR_PAGINA;
  const enPagina = filtrados.slice(inicio, inicio + POR_PAGINA);

  if (count) count.textContent = filtrados.length === 0
    ? 'Sin productos'
    : `${filtrados.length} producto${filtrados.length !== 1 ? 's' : ''}`;

  if (enPagina.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <span class="catalog-empty-icon">🎮</span>
        <p>No hay juegos con precio cargado por ahora.</p>
        <p class="catalog-empty-sub">Volvé pronto — estamos actualizando el catálogo.</p>
      </div>`;
    renderPaginacion('catalog-pagination', 0, 0, (p) => { catState.pagina = p; renderCatalogo(); });
    return;
  }

  grid.innerHTML = enPagina.map(p => renderCard(p, 'cat')).join('');
  activarCards(enPagina, 'cat');
  renderPaginacion('catalog-pagination', catState.pagina, totalPaginas, (p) => { catState.pagina = p; renderCatalogo(); });
}

// ============================================================
// RENDER OFERTAS
// ============================================================
function renderOfertas() {
  const grid = $('ofertas-grid');
  const count = $('ofertas-count');
  if (!grid) return;

  const filtrados = filtrarOfertas();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (ofState.pagina > totalPaginas) ofState.pagina = totalPaginas;
  const inicio = (ofState.pagina - 1) * POR_PAGINA;
  const enPagina = filtrados.slice(inicio, inicio + POR_PAGINA);

  if (count) count.textContent = filtrados.length === 0
    ? 'Sin ofertas activas'
    : `${filtrados.length} oferta${filtrados.length !== 1 ? 's' : ''} disponible${filtrados.length !== 1 ? 's' : ''}`;

  if (enPagina.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <span class="catalog-empty-icon">🔥</span>
        <p>No hay ofertas activas en este momento.</p>
        <p class="catalog-empty-sub">Volvé pronto — renovamos las ofertas cada 15 días.</p>
      </div>`;
    renderPaginacion('ofertas-pagination', 0, 0, (p) => { ofState.pagina = p; renderOfertas(); });
    return;
  }

  grid.innerHTML = enPagina.map(p => renderCard(p, 'oferta')).join('');
  activarCards(enPagina, 'oferta');
  renderPaginacion('ofertas-pagination', ofState.pagina, totalPaginas, (p) => { ofState.pagina = p; renderOfertas(); });
}

// ============================================================
// RENDER PREVENTAS
// ============================================================
function renderPreventas() {
  const grid = $('preventas-grid');
  const count = $('preventas-count');
  if (!grid) return;

  const filtrados = filtrarPreventas();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (preState.pagina > totalPaginas) preState.pagina = totalPaginas;
  const inicio = (preState.pagina - 1) * POR_PAGINA;
  const enPagina = filtrados.slice(inicio, inicio + POR_PAGINA);

  if (count) count.textContent = filtrados.length === 0
    ? 'Sin preventas disponibles'
    : `${filtrados.length} preventa${filtrados.length !== 1 ? 's' : ''} disponible${filtrados.length !== 1 ? 's' : ''}`;

  if (enPagina.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <span class="catalog-empty-icon">🚀</span>
        <p>No hay preventas publicadas en este momento.</p>
        <p class="catalog-empty-sub">Volvé pronto — actualizamos las preventas cada mes.</p>
      </div>`;
    renderPaginacion('preventas-pagination', 0, 0, (p) => { preState.pagina = p; renderPreventas(); });
    return;
  }

  grid.innerHTML = enPagina.map(p => renderCard(p, 'preventa')).join('');
  activarCards(enPagina, 'preventa');
  renderPaginacion('preventas-pagination', preState.pagina, totalPaginas, (p) => { preState.pagina = p; renderPreventas(); });
}

// ============================================================
// ACTIVAR CARDS
// ============================================================
function activarCards(lista, prefijo) {
  lista.forEach(p => {
    const cardId = p.id;
    const selConsole = document.getElementById(`sel-console-${prefijo}-${cardId}`);
    const selVariant = document.getElementById(`sel-variant-${prefijo}-${cardId}`);
    const selCurrency = document.getElementById(`sel-currency-${prefijo}-${cardId}`);
    if (selConsole) selConsole.addEventListener('change', () => { actualizarSelectorVariante(p, cardId, prefijo); actualizarPrecio(p, cardId, prefijo); });
    if (selVariant) selVariant.addEventListener('change', () => actualizarPrecio(p, cardId, prefijo));
    if (selCurrency) selCurrency.addEventListener('change', () => actualizarPrecio(p, cardId, prefijo));
    if (selConsole) actualizarSelectorVariante(p, cardId, prefijo);
    actualizarPrecio(p, cardId, prefijo);
  });
}

// ============================================================
// PAGINACIÓN MEJORADA
// ============================================================
function renderPaginacion(contId, actual, total, onPage) {
  const cont = document.getElementById(contId);
  if (!cont) return;

  if (total <= 1) {
    cont.innerHTML = '';
    return;
  }

  const paginas = new Set();
  paginas.add(1);
  if (total >= 2) paginas.add(2);
  paginas.add(actual - 1);
  paginas.add(actual);
  paginas.add(actual + 1);
  if (total >= 3) paginas.add(total - 1);
  paginas.add(total);

  const listaNumeros = Array.from(paginas)
    .filter(n => n >= 1 && n <= total)
    .sort((a, b) => a - b);

  let html = '';

  html += `<button class="pag-btn pag-nav" data-pag="1" ${actual <= 1 ? 'disabled' : ''} title="Primera página">«</button>`;
  html += `<button class="pag-btn pag-nav" data-pag="${actual - 1}" ${actual <= 1 ? 'disabled' : ''} title="Anterior">←</button>`;

  let previo = 0;
  listaNumeros.forEach(p => {
    if (previo && p - previo > 1) {
      html += `<span class="pag-ellipsis">…</span>`;
    }
    const activa = p === actual ? 'pag-active' : '';
    html += `<button class="pag-btn pag-num ${activa}" data-pag="${p}">${p}</button>`;
    previo = p;
  });

  html += `<button class="pag-btn pag-nav" data-pag="${actual + 1}" ${actual >= total ? 'disabled' : ''} title="Siguiente">→</button>`;
  html += `<button class="pag-btn pag-nav" data-pag="${total}" ${actual >= total ? 'disabled' : ''} title="Última página">»</button>`;

  cont.innerHTML = html;

  cont.querySelectorAll('.pag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.pag, 10);
      if (!isNaN(p) && p >= 1 && p <= total && p !== actual) {
        onPage(p);
        window.scrollTo({ top: 200, behavior: 'smooth' });
      }
    });
  });
}

// ============================================================
// CARD
// ============================================================
function renderCard(p, prefijo = 'cat') {
  const cardId = p.id;
  const cats = p.categories || [];
  const badges = cats.filter(c => ['ps4', 'ps5', 'ps3', 'steam', 'psplus', 'streaming', 'otros'].includes(c))
    .map(c => `<span class="badge badge-${c}">${c.toUpperCase()}</span>`).join('');

  const imagen = p.coverUrl
    ? `<div class="card-image"><img src="${safeUrl(p.coverUrl)}" alt="${escapeHtml(p.title || '')}" class="card-image-img" loading="lazy"></div>`
    : `<div class="card-image card-image-empty"><span class="card-image-placeholder">🎮</span></div>`;

  const esPreventa = prefijo === 'preventa';
  const preorderBadge = esPreventa
    ? `<div class="card-preorder-badge">🚀 PREVENTA${p.releaseDate ? ` · Estreno: ${formatearFecha(p.releaseDate)}` : ''}</div>`
    : '';

  const esModoOferta = prefijo === 'oferta';
  const consolas = consolasDisponiblesDe(p, esModoOferta);
  const tieneSelectores = consolas.length > 0;

  let selectoresHtml = '';
  if (tieneSelectores) {
    const selectConsolaHtml = consolas.length > 1
      ? `<select id="sel-console-${prefijo}-${cardId}" class="card-select">${consolas.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('')}</select>`
      : `<input type="hidden" id="sel-console-${prefijo}-${cardId}" value="${consolas[0]}">`;

    selectoresHtml = `
      <div class="card-variant-selectors">
        ${selectConsolaHtml}
        <select id="sel-variant-${prefijo}-${cardId}" class="card-select"></select>
        <select id="sel-currency-${prefijo}-${cardId}" class="card-select">
          <option value="UYU">$ UYU</option>
          <option value="USD">US$ USD</option>
        </select>
      </div>
    `;
  }

  const tieneTrailer = p.youtubeUrl || p.gameplayUrl;

  const adminBtns = isAdmin
    ? `<div class="card-admin-actions">
         <button class="card-admin-btn card-admin-edit" title="Editar este juego"
                 onclick="abrirEditarDesdeCatalogo('${cardId}')">✏️ Editar</button>
         <button class="card-admin-btn card-admin-delete" title="Eliminar este juego"
                 onclick="eliminarDesdeCatalogo('${cardId}')">🗑️ Eliminar</button>
       </div>`
    : '';

  return `
    <article class="product-card" data-card-id="${cardId}">
      ${adminBtns}
      <div class="card-badges">${badges}</div>
      ${imagen}
      <h3 class="card-title">${escapeHtml(p.title || '(sin título)')}</h3>
      ${preorderBadge}
      <div class="card-offer-wrap" id="offer-wrap-${prefijo}-${cardId}"></div>
      ${selectoresHtml}
      <div class="card-price-wrap" id="price-wrap-${prefijo}-${cardId}"></div>
      <div class="card-stock-wrap" id="stock-wrap-${prefijo}-${cardId}"></div>
      <div class="card-payments">💳 ${escapeHtml(pagosTexto)}</div>
      <div class="card-countdown" id="countdown-${prefijo}-${cardId}"></div>
      <a class="btn btn-buy" id="wa-${prefijo}-${cardId}" href="#" target="_blank" rel="noopener">💬 Comprar por WhatsApp</a>
      ${tieneTrailer ? `<button class="btn btn-secondary" onclick="abrirTrailer('${cardId}')">🎬 Ver Trailer</button>` : ''}
      <div class="card-share-btns">
        <button class="btn btn-share" onclick="compartirWhatsapp('${cardId}', '${prefijo}')" title="Compartir por WhatsApp">📱 WhatsApp</button>
        <button class="btn btn-share" data-share-copy="${cardId}" onclick="copiarLinkJuego('${cardId}')" title="Copiar link del juego">🔗 Copiar link</button>
      </div>
      <button class="btn btn-reporte" onclick="abrirModalReporte('${cardId}')">⚠️ Reportar problema</button>
    </article>
  `;
}

// ============================================================
// COMPARTIR POR WHATSAPP
// ============================================================
window.compartirWhatsapp = function(cardId, prefijo = 'cat') {
  const prod = productos.find(p => p.id === cardId);
  if (!prod) return;

  // Obtener variante y moneda actuales de la card
  const selConsole = document.getElementById(`sel-console-${prefijo}-${cardId}`);
  const selVariant = document.getElementById(`sel-variant-${prefijo}-${cardId}`);
  const selCurrency = document.getElementById(`sel-currency-${prefijo}-${cardId}`);

  let precioTexto = '';
  let varianteLabel = '';
  let categoriaLabel = '';

  if (selConsole && selVariant && selCurrency) {
    const variante = (prod.variants || []).find(v => v.id === selVariant.value);
    if (variante) {
      const oferta = ofertaVigente(variante);
      const tieneNormal = Number(variante.costoARS) > 0 && Number(variante.precioFinalUYU) > 0;
      const moneda = selCurrency.value;

      varianteLabel = variante.label || '';
      categoriaLabel = (selConsole.value || '').toUpperCase();

      if (oferta && tieneNormal) {
        const precioMostrar = moneda === 'USD'
          ? formatUSD(calcPrecioUSD(oferta.precio, cotizaciones.usdAUYU))
          : formatUYU(oferta.precio);
        const precioOriginal = moneda === 'USD'
          ? formatUSD(calcPrecioUSD(oferta.original, cotizaciones.usdAUYU))
          : formatUYU(oferta.original);
        precioTexto = `🔥 *${precioMostrar}* (antes ${precioOriginal})`;
      } else if (oferta && !tieneNormal) {
        const precioMostrar = moneda === 'USD'
          ? formatUSD(calcPrecioUSD(oferta.precio, cotizaciones.usdAUYU))
          : formatUYU(oferta.precio);
        precioTexto = `🔥 ${precioMostrar}`;
      } else if (tieneNormal) {
        const precioMostrar = moneda === 'USD'
          ? formatUSD(calcPrecioUSD(variante.precioFinalUYU, cotizaciones.usdAUYU))
          : formatUYU(variante.precioFinalUYU);
        precioTexto = precioMostrar;
      }
    }
  }

  const url = `${window.location.origin}${window.location.pathname}#producto=${cardId}`;

  let mensaje = `¡Mirá este juego en GamesUy Store!\n\n`;
  mensaje += `🎮 *${prod.title}*`;
  if (categoriaLabel) mensaje += `\n📦 ${categoriaLabel}`;
  if (varianteLabel) mensaje += ` · ${varianteLabel}`;
  if (precioTexto) mensaje += `\n💰 ${precioTexto}`;
  mensaje += `\n\n${url}`;

  const wa = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  window.open(wa, '_blank', 'noopener');
};

// ============================================================
// COPIAR LINK DEL JUEGO
// ============================================================
window.copiarLinkJuego = async function(cardId) {
  const url = `${window.location.origin}${window.location.pathname}#producto=${cardId}`;

  const btn = document.querySelector(`[data-share-copy="${cardId}"]`);
  const originalHtml = btn ? btn.innerHTML : '';

  try {
    await navigator.clipboard.writeText(url);
    if (btn) {
      btn.innerHTML = '✅ ¡Copiado!';
      btn.classList.add('btn-copiado');
      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.classList.remove('btn-copiado');
      }, 2000);
    }
  } catch (err) {
    // Fallback para navegadores sin clipboard API
    console.warn('[GamesUy] Clipboard API no disponible, usando prompt');
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      if (btn) {
        btn.innerHTML = '✅ ¡Copiado!';
        btn.classList.add('btn-copiado');
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.classList.remove('btn-copiado');
        }, 2000);
      }
    } catch (e) {
      prompt('Copiá este link:', url);
    }
    document.body.removeChild(input);
  }
};

// ============================================================
// PROCESAR HASH DE URL (link compartido)
// ============================================================
function procesarHashInicial() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#producto=')) return;

  const cardId = hash.replace('#producto=', '').split('&')[0];
  if (!cardId) return;

  console.log('[GamesUy] Procesando link compartido para:', cardId);

  // Buscar el producto
  const prod = productos.find(p => p.id === cardId);
  if (!prod) {
    console.log('[GamesUy] Producto no encontrado en el catálogo:', cardId);
    return;
  }

  // Ir al catálogo
  if (typeof window.switchPage === 'function') {
    window.switchPage('catalogo');
  }

  // Buscar la página donde está el producto
  const filtrados = filtrarProductos();
  const index = filtrados.findIndex(p => p.id === cardId);

  if (index === -1) {
    console.log('[GamesUy] Producto no está en la lista filtrada');
    return;
  }

  const pag = Math.floor(index / POR_PAGINA) + 1;
  catState.pagina = pag;
  renderCatalogo();

  // Esperar a que el DOM esté listo y hacer scroll
  setTimeout(() => {
    const card = document.querySelector(`.product-card[data-card-id="${cardId}"]`);
    if (!card) return;

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Agregar clase de destacado
    card.classList.add('card-destacada');

    // Quitar el destacado después de 4 segundos
    setTimeout(() => {
      card.classList.remove('card-destacada');
    }, 4000);
  }, 400);
}

// Re-procesar hash si cambia (ej: cuando alguien pega un link estando ya en la web)
window.addEventListener('hashchange', () => {
  procesarHashInicial();
});

// ============================================================
// ABRIR EDITAR DESDE EL CATÁLOGO
// ============================================================
window.abrirEditarDesdeCatalogo = function(id) {
  if (typeof window.abrirEditarProducto === 'function') {
    window.abrirEditarProducto(id);
  } else {
    alert('No se pudo abrir el editor. Recargá la página e intentá de nuevo.');
  }
};

// ============================================================
// ELIMINAR DESDE EL CATÁLOGO
// ============================================================
window.eliminarDesdeCatalogo = async function(id) {
  if (!auth.currentUser) {
    alert('Debés iniciar sesión como administrador.');
    return;
  }

  const prod = productos.find(p => p.id === id);
  const titulo = prod ? (prod.title || '(sin título)') : 'este juego';

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
    window.__productosCache = productos;
    console.log('[GamesUy] Juego eliminado:', titulo);
    alert(`✅ Juego eliminado:\n\n${titulo}`);
    renderAll();
  } catch (err) {
    console.error('[GamesUy] Error al eliminar:', err);
    alert('❌ Error: ' + err.message);
  }
};

// ============================================================
// SELECTOR DE VARIANTE
// ============================================================
function actualizarSelectorVariante(p, cardId, prefijo) {
  const selConsole = document.getElementById(`sel-console-${prefijo}-${cardId}`);
  const selVariant = document.getElementById(`sel-variant-${prefijo}-${cardId}`);
  if (!selConsole || !selVariant || selVariant.tagName === 'INPUT') return;

  const catActual = selConsole.value;
  const esModoOferta = prefijo === 'oferta';
  const variantes = variantesDeCategoria(p, catActual, esModoOferta);

  const valorActual = selVariant.value;

  if (variantes.length === 0) {
    selVariant.innerHTML = '<option value="">—</option>';
    return;
  }

  selVariant.innerHTML = variantes.map(v =>
    `<option value="${v.id}" ${v.id === valorActual ? 'selected' : ''}>${escapeHtml(v.label)}</option>`
  ).join('');
}

// ============================================================
// PRECIO
// ============================================================
function actualizarPrecio(p, cardId, prefijo) {
  const priceWrap = document.getElementById(`price-wrap-${prefijo}-${cardId}`);
  const stockWrap = document.getElementById(`stock-wrap-${prefijo}-${cardId}`);
  const offerWrap = document.getElementById(`offer-wrap-${prefijo}-${cardId}`);
  const countdown = document.getElementById(`countdown-${prefijo}-${cardId}`);
  const waBtn = document.getElementById(`wa-${prefijo}-${cardId}`);
  if (!priceWrap) return;

  const selConsole = document.getElementById(`sel-console-${prefijo}-${cardId}`);
  const selVariant = document.getElementById(`sel-variant-${prefijo}-${cardId}`);
  const selCurrency = document.getElementById(`sel-currency-${prefijo}-${cardId}`);
  if (!selConsole || !selVariant || !selCurrency) return;

  const cat = selConsole.value;
  const variantId = selVariant.value;
  const moneda = selCurrency.value;

  const variante = (p.variants || []).find(v => v.id === variantId);

  if (!variante) {
    priceWrap.innerHTML = `<div class="card-price card-price-empty">AGOTADO</div>`;
    if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-out">Sin stock</span>`;
    if (offerWrap) offerWrap.innerHTML = '';
    if (countdown) countdown.textContent = '';
    if (waBtn) {
      waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(`Hola GamesUy Store! Quiero reservar *${p.title}* cuando vuelva a estar disponible.`)}`;
      waBtn.innerText = '🔔 Reservar por WhatsApp';
      waBtn.classList.remove('btn-buy', 'btn-preorder');
      waBtn.classList.add('btn-secondary');
    }
    return;
  }

  const oferta = ofertaVigente(variante);
  const tieneNormal = Number(variante.costoARS) > 0 && Number(variante.precioFinalUYU) > 0;
  const esPreventa = prefijo === 'preventa';

  if (esPreventa) {
    if (tieneNormal) {
      const precioMostrar = moneda === 'USD'
        ? formatUSD(calcPrecioUSD(variante.precioFinalUYU, cotizaciones.usdAUYU))
        : formatUYU(variante.precioFinalUYU);
      const precioSecundario = moneda === 'USD'
        ? formatUYU(variante.precioFinalUYU)
        : '≈ ' + formatUSD(calcPrecioUSD(variante.precioFinalUYU, cotizaciones.usdAUYU));

      priceWrap.innerHTML = `
        <div class="card-price-tag">PRECIO DE RESERVA</div>
        <div class="card-price">${precioMostrar}</div>
        <div class="card-price-usd">${precioSecundario}</div>
      `;
    } else {
      priceWrap.innerHTML = `
        <div class="card-price-tag">PRECIO</div>
        <div class="card-price card-price-preorder">🔒 A CONFIRMAR</div>
      `;
    }
    if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-preorder">🚀 Preventa</span>`;
    if (offerWrap) offerWrap.innerHTML = '';
    if (countdown) { countdown.textContent = ''; countdown.style.display = 'none'; }
    if (waBtn) {
      const varianteLabel = variante.label || 'Estándar';
      const catLabel = cat.toUpperCase();
      const fecha = p.releaseDate ? ` (estreno: ${formatearFecha(p.releaseDate)})` : '';
      const msg = `Hola GamesUy Store! Quiero RESERVAR *${p.title}* (${catLabel} - ${varianteLabel})${fecha}`;
      waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(msg)}`;
      waBtn.innerText = '🚀 Reservar Preventa';
      waBtn.classList.add('btn-preorder');
      waBtn.classList.remove('btn-buy', 'btn-secondary');
    }
    return;
  }

  if (oferta && tieneNormal) {
    const precioMostrar = moneda === 'USD'
      ? formatUSD(calcPrecioUSD(oferta.precio, cotizaciones.usdAUYU))
      : formatUYU(oferta.precio);
    const precioOriginalMostrar = moneda === 'USD'
      ? formatUSD(calcPrecioUSD(oferta.original, cotizaciones.usdAUYU))
      : formatUYU(oferta.original);
    const precioSecundario = moneda === 'USD'
      ? formatUYU(oferta.precio)
      : '≈ ' + formatUSD(calcPrecioUSD(oferta.precio, cotizaciones.usdAUYU));

    priceWrap.innerHTML = `
      <div class="card-price-original">${precioOriginalMostrar}</div>
      <div class="card-price card-price-offer">${precioMostrar}</div>
      <div class="card-price-usd">${precioSecundario}</div>
    `;
    if (offerWrap) offerWrap.innerHTML = `<div class="offer-banner-tag">🔥 OFERTA ESPECIAL</div>`;
    if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-ok">✓ Disponible</span>`;
    if (countdown) {
      countdown.dataset.end = oferta.hasta + 'T23:59:59';
      countdown.style.display = '';
      actualizarCountdown(countdown);
    }
    if (waBtn) {
      const varianteLabel = variante.label || '';
      const msg = `Hola GamesUy Store! Quiero comprar *${p.title}* (${cat.toUpperCase()} - ${varianteLabel}) en oferta por ${precioMostrar}`;
      waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(msg)}`;
      waBtn.innerText = '💬 Comprar por WhatsApp';
      waBtn.classList.add('btn-buy');
      waBtn.classList.remove('btn-secondary', 'btn-preorder');
    }
    return;
  }

  if (oferta && !tieneNormal) {
    const precioMostrar = moneda === 'USD'
      ? formatUSD(calcPrecioUSD(oferta.precio, cotizaciones.usdAUYU))
      : formatUYU(oferta.precio);
    const precioSecundario = moneda === 'USD'
      ? formatUYU(oferta.precio)
      : '≈ ' + formatUSD(calcPrecioUSD(oferta.precio, cotizaciones.usdAUYU));

    priceWrap.innerHTML = `
      <div class="card-price-tag">PRECIO ESPECIAL</div>
      <div class="card-price card-price-offer">${precioMostrar}</div>
      <div class="card-price-usd">${precioSecundario}</div>
    `;
    if (offerWrap) offerWrap.innerHTML = `<div class="offer-banner-tag">🔥 OFERTA ESPECIAL</div>`;
    if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-ok">✓ Disponible</span>`;
    if (countdown) {
      countdown.dataset.end = oferta.hasta + 'T23:59:59';
      countdown.style.display = '';
      actualizarCountdown(countdown);
    }
    if (waBtn) {
      const varianteLabel = variante.label || '';
      const msg = `Hola GamesUy Store! Quiero comprar *${p.title}* (${cat.toUpperCase()} - ${varianteLabel}) en oferta por ${precioMostrar}`;
      waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(msg)}`;
      waBtn.innerText = '💬 Comprar por WhatsApp';
      waBtn.classList.add('btn-buy');
      waBtn.classList.remove('btn-secondary', 'btn-preorder');
    }
    return;
  }

  if (tieneNormal) {
    const precioMostrar = moneda === 'USD'
      ? formatUSD(calcPrecioUSD(variante.precioFinalUYU, cotizaciones.usdAUYU))
      : formatUYU(variante.precioFinalUYU);
    const precioSecundario = moneda === 'USD'
      ? formatUYU(variante.precioFinalUYU)
      : '≈ ' + formatUSD(calcPrecioUSD(variante.precioFinalUYU, cotizaciones.usdAUYU));

    priceWrap.innerHTML = `
      <div class="card-price">${precioMostrar}</div>
      <div class="card-price-usd">${precioSecundario}</div>
    `;
    if (offerWrap) offerWrap.innerHTML = '';
    if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-ok">✓ Disponible</span>`;
    if (countdown) { countdown.textContent = ''; countdown.style.display = 'none'; }
    if (waBtn) {
      const varianteLabel = variante.label || '';
      const msg = `Hola GamesUy Store! Quiero comprar *${p.title}* (${cat.toUpperCase()} - ${varianteLabel}) por ${precioMostrar}`;
      waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(msg)}`;
      waBtn.innerText = '💬 Comprar por WhatsApp';
      waBtn.classList.add('btn-buy');
      waBtn.classList.remove('btn-secondary', 'btn-preorder');
    }
    return;
  }

  priceWrap.innerHTML = `<div class="card-price card-price-empty">AGOTADO</div>`;
  if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-out">Sin stock</span>`;
  if (offerWrap) offerWrap.innerHTML = '';
  if (countdown) { countdown.textContent = ''; countdown.style.display = 'none'; }
  if (waBtn) {
    waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(`Hola GamesUy Store! Quiero reservar *${p.title}* cuando vuelva a estar disponible.`)}`;
    waBtn.innerText = '🔔 Reservar por WhatsApp';
    waBtn.classList.remove('btn-buy', 'btn-preorder');
    waBtn.classList.add('btn-secondary');
  }
}

// ============================================================
// COUNTDOWN
// ============================================================
function actualizarCountdown(el) {
  if (!el || !el.dataset.end) return;
  const end = new Date(el.dataset.end).getTime();
  const diff = end - Date.now();
  if (diff <= 0) { el.textContent = '⌛ Oferta finalizada'; return; }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  el.textContent = `⌛ Termina en: ${d}d ${h}h ${m}m ${s}s`;
}

if (!countdownInterval) {
  countdownInterval = setInterval(() => {
    document.querySelectorAll('.card-countdown').forEach(actualizarCountdown);
  }, 1000);
}

// ============================================================
// TRAILER
// ============================================================
window.abrirTrailer = function(cardId) {
  const p = productos.find(x => x.id === cardId);
  if (!p) return;
  const modal = document.getElementById('trailer-modal');
  const title = document.getElementById('trailer-title');
  const body = document.getElementById('trailer-body');
  if (!modal || !body) return;
  if (title) title.textContent = p.title || 'Trailer';
  let html = '';
  if (p.youtubeUrl) {
    const embed = getYouTubeEmbed(p.youtubeUrl);
    if (embed) html += `<div class="video-container"><iframe src="${embed}" allowfullscreen></iframe></div>`;
  }
  if (p.gameplayUrl) {
    html += `<div style="margin-top:12px;"><h4 style="color:var(--cyan);margin-bottom:8px;">🎮 Gameplay</h4><img src="${safeUrl(p.gameplayUrl)}" style="width:100%;border-radius:12px;border:1px solid var(--border);"></div>`;
  }
  if (!html) html = '<p class="empty-message">Sin contenido disponible.</p>';
  body.innerHTML = html;
  modal.classList.remove('hidden');
};

function getYouTubeEmbed(url) {
  if (!url) return null;
  const m = url.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/);
  return (m && m[2].length === 11) ? `https://www.youtube.com/embed/${m[2]}` : null;
}

// ============================================================
// LISTENERS
// ============================================================
const searchInput = $('search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    const enOfertas = $('page-ofertas')?.classList.contains('active-page');
    const enPreventas = $('page-preventas')?.classList.contains('active-page');
    if (enOfertas) {
      ofState.search = val; ofState.pagina = 1; renderOfertas();
    } else if (enPreventas) {
      preState.search = val; preState.pagina = 1; renderPreventas();
    } else {
      catState.search = val; catState.pagina = 1; renderCatalogo();
    }
  });
}

document.querySelectorAll('#cat-nav .cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#cat-nav .cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cat = btn.dataset.cat || 'all';
    const enOfertas = $('page-ofertas')?.classList.contains('active-page');
    const enPreventas = $('page-preventas')?.classList.contains('active-page');
    if (enOfertas) {
      ofState.cat = cat; ofState.pagina = 1; renderOfertas();
    } else if (enPreventas) {
      preState.cat = cat; preState.pagina = 1; renderPreventas();
    } else {
      catState.cat = cat; catState.pagina = 1; renderCatalogo();
    }
  });
});

const originalSwitchPage = window.switchPage;
window.switchPage = function(pageId) {
  if (originalSwitchPage) originalSwitchPage(pageId);
  const si = $('search-input');
  const catActiva = document.querySelector('#cat-nav .cat-btn.active');
  const cat = catActiva ? (catActiva.dataset.cat || 'all') : 'all';

  if (pageId === 'ofertas') {
    if (si) ofState.search = si.value;
    ofState.cat = cat;
    ofState.pagina = 1;
    setTimeout(() => renderOfertas(), 50);
  }
  if (pageId === 'preventas') {
    if (si) preState.search = si.value;
    preState.cat = cat;
    preState.pagina = 1;
    setTimeout(() => renderPreventas(), 50);
  }
  if (pageId === 'catalogo') {
    if (si) catState.search = si.value;
    catState.cat = cat;
    catState.pagina = 1;
    setTimeout(() => renderCatalogo(), 50);
  }
};

document.getElementById('trailer-close')?.addEventListener('click', () => {
  document.getElementById('trailer-modal')?.classList.add('hidden');
});
document.getElementById('trailer-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'trailer-modal') document.getElementById('trailer-modal')?.classList.add('hidden');
});

console.log('[GamesUy] store.js v15 cargado (con compartir juego)');
