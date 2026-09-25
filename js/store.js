// ============================================================
// GAMESUY STORE — Catálogo público + Ofertas
// Fase 5.1: Oferta sin tachado cuando no hay precio normal
// ============================================================

import { db } from './firebase-config.js';
import { collection, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { calcPrecioUSD, formatUYU, formatUSD } from './data-model.js';

const $ = (id) => document.getElementById(id);

let productos = [];
let cotizaciones = { arsAUYU: 0.055, usdAUYU: 39.50 };
let pagosTexto = 'Prex / Mercado Pago / BROU';

let filtroSearch = '';
let filtroCat = 'all';
let pagina = 1;
const POR_PAGINA = 24;

let ofertasPagina = 1;
let ofertasSearch = '';
let ofertasCat = 'all';

let countdownInterval = null;

onSnapshot(doc(db, 'settings', 'cotizaciones'), (snap) => {
  if (!snap.exists()) return;
  const c = snap.data();
  cotizaciones.arsAUYU = Number(c.arsAUYU) || 0.055;
  cotizaciones.usdAUYU = Number(c.usdAUYU) || 39.50;
  render();
  renderOfertas();
});

onSnapshot(doc(db, 'settings', 'payments'), (snap) => {
  pagosTexto = (snap.exists() && snap.data().text) ? snap.data().text : 'Prex / Mercado Pago / BROU';
  render();
  renderOfertas();
});

onSnapshot(collection(db, 'products'), (snap) => {
  productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log('[GamesUy] Catálogo:', productos.length, 'productos');
  render();
  renderOfertas();
});

function tienePrecioNormal(v) { return Number(v?.precioFinalUYU) > 0; }
function tienePrecioOferta(v) { return Number(v?.ofertaPrecioUYU) > 0; }
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

function varianteVendible(v) {
  if (v.disponible === false) return false;
  return ofertaVigente(v) !== null || (tieneCostoNormal(v) && tienePrecioNormal(v));
}

function productoVisible(p) {
  if (p.visible === false) return false;
  if (p.soloOferta && !p.soloPreventa) {
    return (p.variants || []).some(v => ofertaVigente(v));
  }
  return (p.variants || []).some(varianteVendible);
}

function productoTieneOferta(p) {
  if (p.visible === false) return false;
  return (p.variants || []).some(v => ofertaVigente(v));
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

function filtrarProductos() {
  let lista = productos.filter(productoVisible);
  if (filtroCat !== 'all') lista = lista.filter(p => (p.categories || []).includes(filtroCat));
  if (filtroSearch) {
    const q = filtroSearch.toLowerCase().trim();
    lista = lista.filter(p => String(p.title || '').toLowerCase().includes(q));
  }
  lista.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'es'));
  return lista;
}

function filtrarOfertas() {
  let lista = productos.filter(productoTieneOferta);
  if (ofertasCat !== 'all') lista = lista.filter(p => (p.categories || []).includes(ofertasCat));
  if (ofertasSearch) {
    const q = ofertasSearch.toLowerCase().trim();
    lista = lista.filter(p => String(p.title || '').toLowerCase().includes(q));
  }
  lista.sort((a, b) => {
    const fa = (a.variants || []).map(v => v.ofertaHasta).filter(Boolean).sort()[0] || '9999';
    const fb = (b.variants || []).map(v => v.ofertaHasta).filter(Boolean).sort()[0] || '9999';
    return fa.localeCompare(fb);
  });
  return lista;
}

function render() {
  const grid = $('product-grid');
  const count = $('results-count');
  if (!grid) return;

  const filtrados = filtrarProductos();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (pagina > totalPaginas) pagina = totalPaginas;
  const inicio = (pagina - 1) * POR_PAGINA;
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
    renderPaginacion('catalog-pagination', 0, 0, (p) => { pagina = p; render(); });
    return;
  }

  grid.innerHTML = enPagina.map(p => renderCard(p, 'cat')).join('');
  activarCards(enPagina, 'cat');
  renderPaginacion('catalog-pagination', pagina, totalPaginas, (p) => { pagina = p; render(); });
}

function renderOfertas() {
  const grid = $('ofertas-grid');
  const count = $('ofertas-count');
  if (!grid) return;

  const filtrados = filtrarOfertas();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (ofertasPagina > totalPaginas) ofertasPagina = totalPaginas;
  const inicio = (ofertasPagina - 1) * POR_PAGINA;
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
    renderPaginacion('ofertas-pagination', 0, 0, (p) => { ofertasPagina = p; renderOfertas(); });
    return;
  }

  grid.innerHTML = enPagina.map(p => renderCard(p, 'oferta')).join('');
  activarCards(enPagina, 'oferta');
  renderPaginacion('ofertas-pagination', ofertasPagina, totalPaginas, (p) => { ofertasPagina = p; renderOfertas(); });
}

function activarCards(lista, prefijo) {
  lista.forEach(p => {
    const cardId = p.id;
    const selConsole = document.getElementById(`sel-console-${prefijo}-${cardId}`);
    const selAccount = document.getElementById(`sel-account-${prefijo}-${cardId}`);
    const selCurrency = document.getElementById(`sel-currency-${prefijo}-${cardId}`);
    if (selConsole) selConsole.addEventListener('change', () => { actualizarSelectoresCuenta(p, cardId, prefijo); actualizarPrecio(p, cardId, prefijo); });
    if (selAccount) selAccount.addEventListener('change', () => actualizarPrecio(p, cardId, prefijo));
    if (selCurrency) selCurrency.addEventListener('change', () => actualizarPrecio(p, cardId, prefijo));
    if (selConsole) actualizarSelectoresCuenta(p, cardId, prefijo);
    actualizarPrecio(p, cardId, prefijo);
  });
}

function renderPaginacion(contId, actual, total, onPage) {
  const cont = document.getElementById(contId);
  if (!cont) return;
  if (total <= 1) { cont.innerHTML = ''; return; }
  cont.innerHTML = `
    <button class="btn btn-secondary pag-btn" ${actual <= 1 ? 'disabled' : ''} data-pag="${actual - 1}">← Anterior</button>
    <span class="pag-info">Página ${actual} de ${total}</span>
    <button class="btn btn-secondary pag-btn" ${actual >= total ? 'disabled' : ''} data-pag="${actual + 1}">Siguiente →</button>
  `;
  cont.querySelectorAll('.pag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.pag);
      if (!isNaN(p) && p >= 1 && p <= total) { onPage(p); window.scrollTo({ top: 200, behavior: 'smooth' }); }
    });
  });
}

function renderCard(p, prefijo = 'cat') {
  const cardId = p.id;
  const cats = p.categories || [];
  const badges = cats.filter(c => ['ps4', 'ps5', 'ps3', 'steam', 'psplus', 'streaming', 'otros'].includes(c))
    .map(c => `<span class="badge badge-${c}">${c.toUpperCase()}</span>`).join('');

  const imagen = p.coverUrl
    ? `<div class="card-image"><img src="${safeUrl(p.coverUrl)}" alt="${escapeHtml(p.title || '')}" class="card-image-img" loading="lazy"></div>`
    : `<div class="card-image card-image-empty"><span class="card-image-placeholder">🎮</span></div>`;

  const preorderBadge = p.isPreorder
    ? `<div class="card-preorder-badge">🚀 PREVENTA${p.releaseDate ? ` · ${formatearFecha(p.releaseDate)}` : ''}</div>`
    : '';

  const esModoOferta = prefijo === 'oferta';
  const consolasDisponibles = cats.filter(c => {
    return (p.variants || []).some(v => {
      if (v.categoria !== c) return false;
      if (esModoOferta) return ofertaVigente(v) !== null;
      return tieneCostoNormal(v) || tieneCostoOferta(v);
    });
  });

  const tieneSelectores = consolasDisponibles.length > 0;
  let selectoresHtml = '';
  if (tieneSelectores) {
    selectoresHtml = `
      <div class="card-variant-selectors">
        ${consolasDisponibles.length > 1
          ? `<select id="sel-console-${prefijo}-${cardId}" class="card-select">${consolasDisponibles.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('')}</select>`
          : `<input type="hidden" id="sel-console-${prefijo}-${cardId}" value="${consolasDisponibles[0]}">`}
        <select id="sel-account-${prefijo}-${cardId}" class="card-select"></select>
        <select id="sel-currency-${prefijo}-${cardId}" class="card-select">
          <option value="UYU">$ UYU</option>
          <option value="USD">US$ USD</option>
        </select>
      </div>
    `;
  }

  const tieneTrailer = p.youtubeUrl || p.gameplayUrl;

  return `
    <article class="product-card" data-card-id="${cardId}">
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
    </article>
  `;
}

function actualizarSelectoresCuenta(p, cardId, prefijo) {
  const selConsole = document.getElementById(`sel-console-${prefijo}-${cardId}`);
  const selAccount = document.getElementById(`sel-account-${prefijo}-${cardId}`);
  if (!selConsole || !selAccount) return;

  const catActual = selConsole.value;
  const esModoOferta = prefijo === 'oferta';
  const variantesCat = (p.variants || []).filter(v => {
    if (v.categoria !== catActual) return false;
    if (esModoOferta) return ofertaVigente(v) !== null;
    return true;
  });

  const tipos = [];
  if (variantesCat.some(v => v.tipo === 'primaria')) tipos.push('primaria');
  if (variantesCat.some(v => v.tipo === 'secundaria')) tipos.push('secundaria');

  const valorActual = selAccount.value;
  selAccount.innerHTML = tipos.map(t =>
    `<option value="${t}" ${t === valorActual ? 'selected' : ''}>${t === 'primaria' ? 'Primaria' : 'Secundaria'}</option>`
  ).join('');
  if (tipos.length === 0) selAccount.innerHTML = '<option value="">—</option>';
}

function actualizarPrecio(p, cardId, prefijo) {
  const priceWrap = document.getElementById(`price-wrap-${prefijo}-${cardId}`);
  const stockWrap = document.getElementById(`stock-wrap-${prefijo}-${cardId}`);
  const offerWrap = document.getElementById(`offer-wrap-${prefijo}-${cardId}`);
  const countdown = document.getElementById(`countdown-${prefijo}-${cardId}`);
  const waBtn = document.getElementById(`wa-${prefijo}-${cardId}`);
  if (!priceWrap) return;

  const selConsole = document.getElementById(`sel-console-${prefijo}-${cardId}`);
  const selAccount = document.getElementById(`sel-account-${prefijo}-${cardId}`);
  const selCurrency = document.getElementById(`sel-currency-${prefijo}-${cardId}`);
  if (!selConsole || !selAccount || !selCurrency) return;

  const cat = selConsole.value;
  const acc = selAccount.value;
  const moneda = selCurrency.value;
  const variante = (p.variants || []).find(v => v.categoria === cat && v.tipo === acc);

  if (!variante) {
    priceWrap.innerHTML = `<div class="card-price card-price-empty">AGOTADO</div>`;
    if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-out">Sin stock</span>`;
    if (offerWrap) offerWrap.innerHTML = '';
    if (countdown) countdown.textContent = '';
    if (waBtn) {
      waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(`Hola GamesUy Store! Quiero reservar *${p.title}* cuando vuelva a estar disponible.`)}`;
      waBtn.innerText = '🔔 Reservar por WhatsApp';
      waBtn.classList.remove('btn-buy');
      waBtn.classList.add('btn-secondary');
    }
    return;
  }

  const oferta = ofertaVigente(variante);
  const tieneNormal = Number(variante.costoARS) > 0 && Number(variante.precioFinalUYU) > 0;

  // CASO 1 — Hay oferta Y hay precio normal → mostramos tachado + oferta
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
      const tipoLabel = acc === 'secundaria' ? 'Secundaria' : 'Primaria';
      const msg = `Hola GamesUy Store! Quiero comprar *${p.title}* (${cat.toUpperCase()} ${tipoLabel}) en oferta por ${precioMostrar}`;
      waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(msg)}`;
      waBtn.innerText = '💬 Comprar por WhatsApp';
      waBtn.classList.add('btn-buy');
      waBtn.classList.remove('btn-secondary');
    }
    return;
  }

  // CASO 2 — Hay oferta pero NO hay precio normal → mostramos con etiqueta "Precio especial"
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
      const tipoLabel = acc === 'secundaria' ? 'Secundaria' : 'Primaria';
      const msg = `Hola GamesUy Store! Quiero comprar *${p.title}* (${cat.toUpperCase()} ${tipoLabel}) en oferta por ${precioMostrar}`;
      waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(msg)}`;
      waBtn.innerText = '💬 Comprar por WhatsApp';
      waBtn.classList.add('btn-buy');
      waBtn.classList.remove('btn-secondary');
    }
    return;
  }

  // CASO 3 — Sin oferta, con precio normal
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
      const tipoLabel = acc === 'secundaria' ? 'Secundaria' : 'Primaria';
      const msg = `Hola GamesUy Store! Quiero comprar *${p.title}* (${cat.toUpperCase()} ${tipoLabel}) por ${precioMostrar}`;
      waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(msg)}`;
      waBtn.innerText = '💬 Comprar por WhatsApp';
      waBtn.classList.add('btn-buy');
      waBtn.classList.remove('btn-secondary');
    }
    return;
  }

  // CASO 4 — Sin precio ni oferta → AGOTADO
  priceWrap.innerHTML = `<div class="card-price card-price-empty">AGOTADO</div>`;
  if (stockWrap) stockWrap.innerHTML = `<span class="stock-badge stock-out">Sin stock</span>`;
  if (offerWrap) offerWrap.innerHTML = '';
  if (countdown) { countdown.textContent = ''; countdown.style.display = 'none'; }
  if (waBtn) {
    waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(`Hola GamesUy Store! Quiero reservar *${p.title}* cuando vuelva a estar disponible.`)}`;
    waBtn.innerText = '🔔 Reservar por WhatsApp';
    waBtn.classList.remove('btn-buy');
    waBtn.classList.add('btn-secondary');
  }
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

if (!countdownInterval) {
  countdownInterval = setInterval(() => {
    document.querySelectorAll('.card-countdown').forEach(actualizarCountdown);
  }, 1000);
}

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

const searchInput = $('search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const pageOfertas = $('page-ofertas');
    const enOfertas = pageOfertas && pageOfertas.classList.contains('active-page');
    if (enOfertas) {
      ofertasSearch = e.target.value;
      ofertasPagina = 1;
      renderOfertas();
    } else {
      filtroSearch = e.target.value;
      pagina = 1;
      render();
    }
  });
}

document.querySelectorAll('#cat-nav .cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#cat-nav .cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cat = btn.dataset.cat || 'all';
    const pageOfertas = $('page-ofertas');
    const enOfertas = pageOfertas && pageOfertas.classList.contains('active-page');
    if (enOfertas) {
      ofertasCat = cat;
      ofertasPagina = 1;
      renderOfertas();
    } else {
      filtroCat = cat;
      pagina = 1;
      render();
    }
  });
});

const originalSwitchPage = window.switchPage;
window.switchPage = function(pageId) {
  if (originalSwitchPage) originalSwitchPage(pageId);
  if (pageId === 'ofertas') {
    const si = $('search-input');
    if (si) ofertasSearch = si.value;
    const catActiva = document.querySelector('#cat-nav .cat-btn.active');
    if (catActiva) ofertasCat = catActiva.dataset.cat || 'all';
    ofertasPagina = 1;
    setTimeout(() => renderOfertas(), 50);
  }
  if (pageId === 'catalogo') {
    const si = $('search-input');
    if (si) filtroSearch = si.value;
    const catActiva = document.querySelector('#cat-nav .cat-btn.active');
    if (catActiva) filtroCat = catActiva.dataset.cat || 'all';
    pagina = 1;
    setTimeout(() => render(), 50);
  }
};

document.getElementById('trailer-close')?.addEventListener('click', () => {
  document.getElementById('trailer-modal')?.classList.add('hidden');
});
document.getElementById('trailer-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'trailer-modal') document.getElementById('trailer-modal')?.classList.add('hidden');
});

console.log('[GamesUy] store.js v5.1 cargado');
