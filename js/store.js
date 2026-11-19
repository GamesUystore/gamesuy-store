// ============================================================
// GAMESUY STORE — Catálogo público + Ofertas + Preventas
// ============================================================

import { db, auth } from './firebase-config.js';
import {
  collection, onSnapshot, doc, deleteDoc, updateDoc
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

// Cache y Countdowns
const CACHE_KEY = 'gamesuy_products_cache_v1';
const CACHE_TTL = 5 * 60 * 1000; 

function leerCacheProductos() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return null;
    if (Date.now() - timestamp > CACHE_TTL) return null;
    return data;
  } catch (e) { return null; }
}

function guardarCacheProductos(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) { }
}

let countdownInterval = null;
function iniciarCountdowns() {
  detenerCountdowns();
  const hay = document.querySelector('.card-countdown[data-end]');
  if (!hay) return;
  countdownInterval = setInterval(() => {
    if (document.hidden) return;
    document.querySelectorAll('.card-countdown[data-end]').forEach(actualizarCountdown);
  }, 1000);
}
function detenerCountdowns() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) detenerCountdowns(); else iniciarCountdowns();
});

// SEO
const SEO_TITULOS = {
  'catalogo': 'Catálogo de Juegos Digitales', 'ofertas': '🔥 Ofertas Especiales', 'preventas': '🚀 Preventas',
  'faq': 'Preguntas Frecuentes', 'terminos': 'Términos y Condiciones', 'resenas': '⭐ Reseñas de Clientes',
  'contacto': 'Contacto', 'admin': 'Panel de Administración'
};
function actualizarSEOPagina(pageId) {
  const base = 'GamesUy Store';
  document.title = SEO_TITULOS[pageId] ? `${SEO_TITULOS[pageId]} | ${base}` : `${base} | Tienda Digital Gamer`;
}

onAuthStateChanged(auth, (user) => { isAdmin = !!user; renderAll(); });
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

const productosCache = leerCacheProductos();
if (productosCache) {
  productos = productosCache;
  window.__productosCache = productos;
  renderAll();
}

onSnapshot(collection(db, 'products'), (snap) => {
  productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  window.__productosCache = productos;
  guardarCacheProductos(productos);
  renderAll();
  if (!hashProcesado) { hashProcesado = true; setTimeout(procesarHashInicial, 300); }
  if (typeof window.__estRegistrarVista === 'function') window.__estRegistrarVista();
});

// Helpers de Precios
function tienePrecioNormal(v) { return Number(v?.precioFinalUYU) > 0; }
function tieneCostoNormal(v) { return Number(v?.costoARS) > 0; }

function ofertaVigente(v) {
  if (!v.enOferta || !v.ofertaHasta) return null;
  const hoy = new Date().toISOString().split('T')[0];
  if (v.ofertaHasta < hoy) return null;
  if (!(Number(v.ofertaPrecioUYU) > 0)) return null;
  return { precio: Number(v.ofertaPrecioUYU), original: Number(v.precioFinalUYU) || 0, hasta: v.ofertaHasta };
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
  const releaseDateStr = String(p.releaseDate).split('T')[0];
  const hoy = new Date().toISOString().split('T')[0];
  return releaseDateStr > hoy;
}

function productoVisible(p) {
  if (p.visible === false) return false;
  if (esPreventaActiva(p)) return false;
  if (p.soloOferta && !p.soloPreventa) return (p.variants || []).some(v => ofertaVigente(v));
  return (p.variants || []).some(varianteConStock);
}

function productoTieneOferta(p) {
  if (p.visible === false) return false;
  if (esPreventaActiva(p)) return false;
  return (p.variants || []).some(v => ofertaVigente(v));
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function safeUrl(url) {
  return String(url || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatearFecha(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

function consolasDisponiblesDe(p, modoOferta) {
  const cats = p.categories || [];
  const conStock = cats.filter(c => {
    return (p.variants || []).some(v => {
      if (v.categoria !== c) return false;
      if (modoOferta === true) return ofertaVigente(v) !== null;
      return varianteConStock(v);
    });
  });
  if (conStock.length > 0) return conStock;
  return cats.filter(c => (p.variants || []).some(v => v.categoria === c && (Number(v.costoARS) > 0 || v.disponible === false)));
}

function variantesDeCategoria(p, categoria, modoOferta) {
  const todas = (p.variants || []).filter(v => v.categoria === categoria && (Number(v.costoARS) > 0 || Number(v.ofertaCostoARS) > 0 || v.disponible === false));
  const conStock = todas.filter(v => modoOferta ? ofertaVigente(v) !== null : varianteConStock(v));
  return conStock.length > 0 ? conStock : todas;
}

// Filtros
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
  return lista;
}

function filtrarPreventas() {
  let lista = productos.filter(esPreventaActiva);
  if (preState.cat !== 'all') lista = lista.filter(p => (p.categories || []).includes(preState.cat));
  if (preState.search) {
    const q = preState.search.toLowerCase().trim();
    lista = lista.filter(p => String(p.title || '').toLowerCase().includes(q));
  }
  return lista;
}

// Render Global
function renderAll() {
  renderDestacados();
  renderCatalogo();
  renderOfertas();
  renderPreventas();
}

// ============================================================
// RENDER DESTACADOS (Sincroniza precio y variante)
// ============================================================
function renderDestacados() {
  const track = document.getElementById('flash-gamers-grid');
  if (!track) return;

  const destacados = productos.filter(p => p.destacado === true && p.visible !== false);

  if (destacados.length === 0) {
    track.innerHTML = '<p style="color:var(--text-muted); text-align:center; width:100%; padding: 20px;">No hay juegos destacados. Marcá algunos con la ⭐ en el catálogo.</p>';
    return;
  }

  track.innerHTML = destacados.map(p => {
    const imgHtml = p.coverUrl 
      ? `<img src="${safeUrl(p.coverUrl)}" alt="${escapeHtml(p.title)}">` 
      : `<div style="height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; background:var(--bg-0); border-radius:8px;">🎮</div>`;
    
    // LÓGICA: Buscar la variante Primaria (o la primera que tenga precio)
    let displayPrice = 0;
    let selectedVariantId = '';
    
    const primaryVariant = (p.variants || []).find(v => 
      v.tipo === 'primaria' && (Number(v.ofertaPrecioUYU) > 0 || Number(v.precioFinalUYU) > 0)
    );
    
    if (primaryVariant) {
      displayPrice = Number(primaryVariant.ofertaPrecioUYU) > 0 ? Number(primaryVariant.ofertaPrecioUYU) : Number(primaryVariant.precioFinalUYU);
      selectedVariantId = primaryVariant.id;
    } else {
      const anyVariant = (p.variants || []).find(v => 
        (Number(v.ofertaPrecioUYU) > 0 || Number(v.precioFinalUYU) > 0)
      );
      if (anyVariant) {
        displayPrice = Number(anyVariant.ofertaPrecioUYU) > 0 ? Number(anyVariant.ofertaPrecioUYU) : Number(anyVariant.precioFinalUYU);
        selectedVariantId = anyVariant.id;
      }
    }

    const priceHtml = displayPrice > 0 
      ? `<div class="fc-price">${formatUYU(displayPrice)}</div>` 
      : `<div class="fc-price" style="font-size:0.8rem; color:var(--text-muted);">Ver opciones</div>`;
      
    const titleCorto = String(p.title).substring(0, 25);

    // Navegación directa por función
    return `
      <div class="featured-card" onclick="irAlJuegoDesdeDestacado('${p.id}', '${selectedVariantId}')">
        ${imgHtml}
        <div class="fc-title">${escapeHtml(titleCorto)}</div>
        ${priceHtml}
      </div>
    `;
  }).join('');

  // Lógica para los botones de scroll
  const btnPrev = document.getElementById('btn-prev-featured');
  const btnNext = document.getElementById('btn-next-featured');
  const wrapper = document.querySelector('.carousel-wrapper');

  if (btnPrev && btnNext && wrapper) {
    btnPrev.onclick = () => wrapper.scrollBy({ left: -280, behavior: 'smooth' });
    btnNext.onclick = () => wrapper.scrollBy({ left: 280, behavior: 'smooth' });
  }
}

// ============================================================
// NAVEGACIÓN DIRECTA DESDE DESTACADOS (Click)
// ============================================================
window.irAlJuegoDesdeDestacado = function(id, variantId) {
  if (typeof window.switchPage === 'function') window.switchPage('catalogo');
  
  catState.cat = 'all';
  catState.search = '';
  catState.pagina = 1;
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  document.querySelectorAll('#cat-nav .cat-btn').forEach(b => b.classList.remove('active'));
  const btnAll = document.querySelector('#cat-nav .cat-btn[data-cat="all"]');
  if (btnAll) btnAll.classList.add('active');

  const filtrados = filtrarProductos();
  const index = filtrados.findIndex(p => p.id === id);
  if (index === -1) return;

  catState.pagina = Math.floor(index / POR_PAGINA) + 1;
  renderCatalogo();

  setTimeout(() => {
    const card = document.querySelector(`.product-card[data-card-id="${id}"]`);
    if (!card) return;

    if (variantId) {
      const prod = productos.find(p => p.id === id);
      const variant = (prod.variants || []).find(v => v.id === variantId);
      if (variant) {
        const selConsole = document.getElementById(`sel-console-cat-${id}`);
        const selVariant = document.getElementById(`sel-variant-cat-${id}`);
        
        if (selConsole && selVariant) {
          if (selConsole.tagName === 'SELECT') {
            selConsole.value = variant.categoria;
            selConsole.dispatchEvent(new Event('change')); 
          }
          selVariant.value = variantId;
          selVariant.dispatchEvent(new Event('change')); 
        }
      }
    }

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('card-destacada');
    setTimeout(() => card.classList.remove('card-destacada'), 4000);
  }, 400);
};

// ============================================================
// PROCESAR HASH (Para links compartidos)
// ============================================================
function procesarHashInicial() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#producto=')) return;
  
  const parts = hash.replace('#producto=', '').split('&');
  const cardId = parts[0];
  let variantId = null;
  parts.forEach(p => { if (p.startsWith('variant=')) variantId = p.split('=')[1]; });

  if (typeof window.irAlJuegoDesdeDestacado === 'function') {
    window.irAlJuegoDesdeDestacado(cardId, variantId);
  }
}
window.addEventListener('hashchange', () => procesarHashInicial());

// ============================================================
// RESTO DE RENDERS (Catálogo, Ofertas, Preventas)
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

  if (count) count.textContent = filtrados.length === 0 ? 'Sin productos' : `${filtrados.length} productos`;

  if (enPagina.length === 0) {
    grid.innerHTML = `<div class="catalog-empty"><p>No hay juegos con precio cargado por ahora.</p></div>`;
    renderPaginacion('catalog-pagination', 0, 0, () => {});
    return;
  }

  grid.innerHTML = enPagina.map(p => renderCard(p, 'cat')).join('');
  activarCards(enPagina, 'cat');
  renderPaginacion('catalog-pagination', catState.pagina, totalPaginas, (p) => { catState.pagina = p; renderCatalogo(); });
  iniciarCountdowns();
}

function renderOfertas() {
  const grid = $('ofertas-grid');
  if (!grid) return;
  const filtrados = filtrarOfertas();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (ofState.pagina > totalPaginas) ofState.pagina = totalPaginas;
  const enPagina = filtrados.slice((ofState.pagina - 1) * POR_PAGINA, (ofState.pagina - 1) * POR_PAGINA + POR_PAGINA);
  
  const count = $('ofertas-count');
  if (count) count.textContent = `${filtrados.length} ofertas`;

  if (enPagina.length === 0) { grid.innerHTML = `<p class="empty-message">No hay ofertas activas.</p>`; return; }
  grid.innerHTML = enPagina.map(p => renderCard(p, 'oferta')).join('');
  activarCards(enPagina, 'oferta');
  renderPaginacion('ofertas-pagination', ofState.pagina, totalPaginas, (p) => { ofState.pagina = p; renderOfertas(); });
  iniciarCountdowns();
}

function renderPreventas() {
  const grid = $('preventas-grid');
  if (!grid) return;
  const filtrados = filtrarPreventas();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (preState.pagina > totalPaginas) preState.pagina = totalPaginas;
  const enPagina = filtrados.slice((preState.pagina - 1) * POR_PAGINA, (preState.pagina - 1) * POR_PAGINA + POR_PAGINA);
  
  const count = $('preventas-count');
  if (count) count.textContent = `${filtrados.length} preventas`;

  if (enPagina.length === 0) { grid.innerHTML = `<p class="empty-message">No hay preventas publicadas.</p>`; return; }
  grid.innerHTML = enPagina.map(p => renderCard(p, 'preventa')).join('');
  activarCards(enPagina, 'preventa');
  renderPaginacion('preventas-pagination', preState.pagina, totalPaginas, (p) => { preState.pagina = p; renderPreventas(); });
}

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

    const waBtn = document.getElementById(`wa-${prefijo}-${cardId}`);
    if (waBtn && !waBtn.dataset.tracked) {
      waBtn.dataset.tracked = '1';
      waBtn.addEventListener('click', () => {
        if (typeof window.__estRegistrarWhatsApp === 'function') window.__estRegistrarWhatsApp(p.id, p.title || '');
      });
    }
  });
}

function renderPaginacion(contId, actual, total, onPage) {
  const cont = document.getElementById(contId);
  if (!cont) return;
  if (total <= 1) { cont.innerHTML = ''; return; }
  const paginas = new Set([1, total, actual - 1, actual, actual + 1].filter(n => n >= 1 && n <= total));
  const lista = Array.from(paginas).sort((a, b) => a - b);
  
  let html = `<button class="pag-btn pag-nav" data-pag="${actual - 1}" ${actual <= 1 ? 'disabled' : ''}>«</button>`;
  let previo = 0;
  lista.forEach(p => {
    if (previo && p - previo > 1) html += `<span class="pag-ellipsis">…</span>`;
    html += `<button class="pag-btn pag-num ${p === actual ? 'pag-active' : ''}" data-pag="${p}">${p}</button>`;
    previo = p;
  });
  html += `<button class="pag-btn pag-nav" data-pag="${actual + 1}" ${actual >= total ? 'disabled' : ''}>»</button>`;
  
  cont.innerHTML = html;
  cont.querySelectorAll('.pag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.pag, 10);
      if (!isNaN(p) && p >= 1 && p <= total && p !== actual) { onPage(p); window.scrollTo({ top: 200, behavior: 'smooth' }); }
    });
  });
}

function renderCard(p, prefijo = 'cat') {
  const cardId = p.id;
  const cats = p.categories || [];
  const badges = cats.filter(c => ['ps4', 'ps5', 'ps3', 'steam', 'psplus', 'streaming', 'otros'].includes(c))
    .map(c => `<span class="badge badge-${c}">${c.toUpperCase()}</span>`).join('');

  const imagen = p.coverUrl
    ? `<div class="card-image"><img src="${safeUrl(p.coverUrl)}" alt="${escapeHtml(p.title || '')}" class="card-image-img" loading="lazy" decoding="async"></div>`
    : `<div class="card-image card-image-empty"><span class="card-image-placeholder">🎮</span></div>`;

  const preorderBadge = prefijo === 'preventa' ? `<div class="card-preorder-badge">🚀 PREVENTA${p.releaseDate ? ` · Estreno: ${formatearFecha(p.releaseDate)}` : ''}</div>` : '';
  const consolas = consolasDisponiblesDe(p, prefijo === 'oferta');
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
        <select id="sel-currency-${prefijo}-${cardId}" class="card-select"><option value="UYU">$ UYU</option><option value="USD">US$</option></select>
      </div>`;
  }

  const btnDestacarLabel = p.destacado ? '🌟 Destacado' : '⭐ Destacar';
  const btnDestacarClase = p.destacado ? 'card-admin-destacar activo' : 'card-admin-destacar';
  const adminBtns = isAdmin ? `
    <div class="card-admin-actions">
      <button class="card-admin-btn card-admin-edit" onclick="abrirEditarDesdeCatalogo('${cardId}')">✏️ Editar</button>
      <button class="card-admin-btn ${btnDestacarClase}" onclick="toggleDestacadoCatalogo('${cardId}', ${!!p.destacado})">${btnDestacarLabel}</button>
      <button class="card-admin-btn card-admin-delete" onclick="eliminarDesdeCatalogo('${cardId}')">🗑️</button>
    </div>` : '';

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
      ${(p.youtubeUrl || p.gameplayUrl) ? `<button class="btn btn-secondary" onclick="abrirTrailer('${cardId}')">🎬 Ver Trailer</button>` : ''}
      <div class="card-share-btns">
        <button class="btn btn-share" onclick="compartirWhatsapp('${cardId}', '${prefijo}')">📱 WhatsApp</button>
        <button class="btn btn-share" data-share-copy="${cardId}" onclick="copiarLinkJuego('${cardId}')">🔗 Link</button>
      </div>
      <button class="btn btn-reporte" onclick="abrirModalReporte('${cardId}')">⚠️ Reportar</button>
    </article>
  `;
}

// Acciones
window.toggleDestacadoCatalogo = async function(id, currentState) {
  if (!auth.currentUser) return;
  try {
    await updateDoc(doc(db, 'products', id), { destacado: !currentState });
    const prod = productos.find(p => p.id === id);
    if (prod) prod.destacado = !currentState;
    guardarCacheProductos(productos);
    renderAll();
  } catch (err) { alert('❌ Error: ' + err.message); }
};

window.compartirWhatsapp = function(cardId, prefijo = 'cat') {
  const prod = productos.find(p => p.id === cardId);
  if (!prod) return;
  const url = `${window.location.origin}${window.location.pathname}#producto=${cardId}`;
  const msg = `¡Mirá este juego en GamesUy Store!\n\n🎮 *${prod.title}*\n\n${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
};

window.copiarLinkJuego = async function(cardId) {
  const url = `${window.location.origin}${window.location.pathname}#producto=${cardId}`;
  try {
    await navigator.clipboard.writeText(url);
    alert('✅ Link copiado al portapapeles');
  } catch (err) { prompt('Copiá este link:', url); }
};

window.abrirEditarDesdeCatalogo = function(id) {
  if (typeof window.abrirEditarProducto === 'function') window.abrirEditarProducto(id);
};
window.eliminarDesdeCatalogo = async function(id) {
  if (!auth.currentUser) return alert('Iniciá sesión.');
  if (!confirm('¿Eliminar juego?')) return;
  try {
    await deleteDoc(doc(db, 'products', id));
    productos = productos.filter(p => p.id !== id);
    guardarCacheProductos(productos);
    renderAll();
  } catch (err) { alert('Error: ' + err.message); }
};

function actualizarSelectorVariante(p, cardId, prefijo) {
  const selConsole = document.getElementById(`sel-console-${prefijo}-${cardId}`);
  const selVariant = document.getElementById(`sel-variant-${prefijo}-${cardId}`);
  if (!selConsole || !selVariant || selVariant.tagName === 'INPUT') return;
  const variantes = variantesDeCategoria(p, selConsole.value, prefijo === 'oferta');
  const valorActual = selVariant.value;
  if (variantes.length === 0) { selVariant.innerHTML = '<option value="">—</option>'; return; }
  selVariant.innerHTML = variantes.map(v => `<option value="${v.id}" ${v.id === valorActual ? 'selected' : ''}>${escapeHtml(v.label)}</option>`).join('');
}

function actualizarPrecio(p, cardId, prefijo) {
  const priceWrap = document.getElementById(`price-wrap-${prefijo}-${cardId}`);
  const stockWrap = document.getElementById(`stock-wrap-${prefijo}-${cardId}`);
  const offerWrap = document.getElementById(`offer-wrap-${prefijo}-${cardId}`);
  const countdown = document.getElementById(`countdown-${prefijo}-${cardId}`);
  const waBtn = document.getElementById(`wa-${prefijo}-${cardId}`);
  if (!priceWrap) return;

  const cat = document.getElementById(`sel-console-${prefijo}-${cardId}`).value;
  const variantId = document.getElementById(`sel-variant-${prefijo}-${cardId}`).value;
  const moneda = document.getElementById(`sel-currency-${prefijo}-${cardId}`).value;
  const variante = (p.variants || []).find(v => v.id === variantId);

  if (!variante) {
    priceWrap.innerHTML = `<div class="card-price card-price-empty">AGOTADO</div>`;
    if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-out">Sin stock</span>`;
    if (waBtn) { waBtn.href = `https://wa.me/59896572226?text=Reservar ${p.title}`; waBtn.innerText = '🔔 Reservar'; waBtn.className = 'btn btn-secondary'; }
    return;
  }

  const oferta = ofertaVigente(variante);
  const tieneNormal = Number(variante.costoARS) > 0 && Number(variante.precioFinalUYU) > 0;

  if (prefijo === 'preventa') {
    if (tieneNormal) {
      const precioMostrar = moneda === 'USD' ? formatUSD(calcPrecioUSD(variante.precioFinalUYU, cotizaciones.usdAUYU)) : formatUYU(variante.precioFinalUYU);
      priceWrap.innerHTML = `<div class="card-price-tag">PRECIO DE RESERVA</div><div class="card-price">${precioMostrar}</div>`;
    } else {
      priceWrap.innerHTML = `<div class="card-price-tag">PRECIO</div><div class="card-price card-price-preorder">🔒 A CONFIRMAR</div>`;
    }
    if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-preorder">🚀 Preventa</span>`;
    if (waBtn) { waBtn.href = `https://wa.me/59896572226?text=Reservar ${p.title}`; waBtn.innerText = '🚀 Reservar Preventa'; waBtn.className = 'btn btn-preorder'; }
    return;
  }

  if (oferta && tieneNormal) {
    const precioMostrar = moneda === 'USD' ? formatUSD(calcPrecioUSD(oferta.precio, cotizaciones.usdAUYU)) : formatUYU(oferta.precio);
    const precioOriginalMostrar = moneda === 'USD' ? formatUSD(calcPrecioUSD(oferta.original, cotizaciones.usdAUYU)) : formatUYU(oferta.original);
    priceWrap.innerHTML = `<div class="card-price-original">${precioOriginalMostrar}</div><div class="card-price card-price-offer">${precioMostrar}</div>`;
    if (offerWrap) offerWrap.innerHTML = `<div class="offer-banner-tag">🔥 OFERTA</div>`;
    if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-ok">✓ Disponible</span>`;
    if (countdown) { countdown.dataset.end = oferta.hasta + 'T23:59:59'; countdown.style.display = ''; actualizarCountdown(countdown); }
    if (waBtn) { waBtn.href = `https://wa.me/59896572226?text=Comprar ${p.title} en oferta`; waBtn.innerText = '💬 Comprar'; waBtn.className = 'btn btn-buy'; }
    return;
  }

  if (tieneNormal) {
    const precioMostrar = moneda === 'USD' ? formatUSD(calcPrecioUSD(variante.precioFinalUYU, cotizaciones.usdAUYU)) : formatUYU(variante.precioFinalUYU);
    priceWrap.innerHTML = `<div class="card-price">${precioMostrar}</div>`;
    if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-ok">✓ Disponible</span>`;
    if (waBtn) { waBtn.href = `https://wa.me/59896572226?text=Comprar ${p.title}`; waBtn.innerText = '💬 Comprar'; waBtn.className = 'btn btn-buy'; }
    return;
  }

  priceWrap.innerHTML = `<div class="card-price card-price-empty">AGOTADO</div>`;
  if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-out">Sin stock</span>`;
}

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

window.abrirTrailer = function(cardId) {
  const p = productos.find(x => x.id === cardId);
  if (!p) return;
  if (typeof window.__estRegistrarTrailer === 'function') window.__estRegistrarTrailer(p.id, p.title || '');
  const modal = document.getElementById('trailer-modal');
  const body = document.getElementById('trailer-body');
  if (!modal || !body) return;
  document.getElementById('trailer-title').textContent = p.title || 'Trailer';
  let html = '';
  if (p.youtubeUrl) {
    const m = p.youtubeUrl.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/);
    const embed = (m && m[2].length === 11) ? `https://www.youtube.com/embed/${m[2]}` : null;
    if (embed) html += `<div class="video-container"><iframe src="${embed}" allowfullscreen></iframe></div>`;
  }
  if (!html) html = '<p class="empty-message">Sin contenido.</p>';
  body.innerHTML = html;
  modal.classList.remove('hidden');
};

const searchInput = $('search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    const enOfertas = $('page-ofertas')?.classList.contains('active-page');
    const enPreventas = $('page-preventas')?.classList.contains('active-page');
    if (enOfertas) { ofState.search = val; ofState.pagina = 1; renderOfertas(); }
    else if (enPreventas) { preState.search = val; preState.pagina = 1; renderPreventas(); }
    else { catState.search = val; catState.pagina = 1; renderCatalogo(); }
  });
}

document.querySelectorAll('#cat-nav .cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#cat-nav .cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cat = btn.dataset.cat || 'all';
    const enOfertas = $('page-ofertas')?.classList.contains('active-page');
    const enPreventas = $('page-preventas')?.classList.contains('active-page');
    if (cat !== 'all' && typeof window.__estRegistrarCategoria === 'function') window.__estRegistrarCategoria(cat);
    if (enOfertas) { ofState.cat = cat; ofState.pagina = 1; renderOfertas(); }
    else if (enPreventas) { preState.cat = cat; preState.pagina = 1; renderPreventas(); }
    else { catState.cat = cat; catState.pagina = 1; renderCatalogo(); }
  });
});

const originalSwitchPage = window.switchPage;
window.switchPage = function(pageId) {
  if (originalSwitchPage) originalSwitchPage(pageId);
  actualizarSEOPagina(pageId);
  const si = $('search-input');
  const cat = document.querySelector('#cat-nav .cat-btn.active')?.dataset.cat || 'all';
  if (pageId === 'ofertas') { if (si) ofState.search = si.value; ofState.cat = cat; ofState.pagina = 1; setTimeout(() => renderOfertas(), 50); }
  if (pageId === 'preventas') { if (si) preState.search = si.value; preState.cat = cat; preState.pagina = 1; setTimeout(() => renderPreventas(), 50); }
  if (pageId === 'catalogo') { if (si) catState.search = si.value; catState.cat = cat; catState.pagina = 1; setTimeout(() => renderCatalogo(), 50); }
};

document.getElementById('trailer-close')?.addEventListener('click', () => document.getElementById('trailer-modal')?.classList.add('hidden'));
document.getElementById('trailer-modal')?.addEventListener('click', (e) => { if (e.target.id === 'trailer-modal') document.getElementById('trailer-modal')?.classList.add('hidden'); });

console.log('[GamesUy] store.js v24 cargado (navegacion directa fix)');
