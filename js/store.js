// ============================================================
// GAMESUY STORE — Catálogo público
// Fase 4: Muestra productos con precio en la tienda
// ============================================================

import { db } from './firebase-config.js';
import {
  collection,
  onSnapshot,
  doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  calcPrecioUSD,
  formatUYU,
  formatUSD
} from './data-model.js';

const $ = (id) => document.getElementById(id);

// ============================================================
// ESTADO
// ============================================================
let productos = [];
let cotizaciones = { arsAUYU: 0.055, usdAUYU: 39.50 };
let pagosTexto = 'Prex / Mercado Pago / BROU';
let filtroSearch = '';
let filtroCat = 'all';
let pagina = 1;
const POR_PAGINA = 24;
let countdownInterval = null;

// ============================================================
// CARGA DE DATOS
// ============================================================

onSnapshot(doc(db, 'settings', 'cotizaciones'), (snap) => {
  if (!snap.exists()) return;
  const c = snap.data();
  cotizaciones.arsAUYU = Number(c.arsAUYU) || 0.055;
  cotizaciones.usdAUYU = Number(c.usdAUYU) || 39.50;
  render();
});

onSnapshot(doc(db, 'settings', 'payments'), (snap) => {
  if (snap.exists() && snap.data().text) {
    pagosTexto = snap.data().text;
  } else {
    pagosTexto = 'Prex / Mercado Pago / BROU';
  }
  render();
});

onSnapshot(collection(db, 'products'), (snap) => {
  productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log('[GamesUy] Catálogo: productos cargados:', productos.length);
  render();
});

// ============================================================
// HELPERS
// ============================================================

function tienePrecio(v) {
  return Number(v?.precioFinalUYU) > 0;
}

function varianteDisponible(v) {
  return v.disponible !== false && tienePrecio(v);
}

function productoVisible(p) {
  if (p.visible === false) return false;
  return (p.variants || []).some(v => varianteDisponible(v));
}

function ofertaVigente(v) {
  if (!v.enOferta) return null;
  if (!v.ofertaHasta) return null;
  const hoy = new Date().toISOString().split('T')[0];
  if (v.ofertaHasta < hoy) return null;
  if (!(Number(v.ofertaPrecioUYU) > 0)) return null;
  return {
    precio: Number(v.ofertaPrecioUYU),
    original: Number(v.precioFinalUYU) || 0,
    hasta: v.ofertaHasta
  };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

// ============================================================
// FILTROS
// ============================================================

function filtrarProductos() {
  let lista = productos.filter(productoVisible);

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

// ============================================================
// RENDER
// ============================================================

function render() {
  const grid = $('product-grid');
  const count = $('results-count');
  if (!grid) return;

  const filtrados = filtrarProductos();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  if (pagina > totalPaginas) pagina = totalPaginas;

  const inicio = (pagina - 1) * POR_PAGINA;
  const enPagina = filtrados.slice(inicio, inicio + POR_PAGINA);

  if (count) {
    count.textContent = filtrados.length === 0
      ? 'Sin productos'
      : `${filtrados.length} producto${filtrados.length !== 1 ? 's' : ''} encontrado${filtrados.length !== 1 ? 's' : ''}`;
  }

  if (enPagina.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <span class="catalog-empty-icon">🎮</span>
        <p>No hay juegos con precio cargado por ahora.</p>
        <p class="catalog-empty-sub">Volvé pronto — estamos actualizando el catálogo.</p>
      </div>`;
    renderPaginacion(0, 0);
    return;
  }

  grid.innerHTML = enPagina.map(renderCard).join('');

  // Listeners
  enPagina.forEach(p => {
    const cardId = p.id;

    // Selector de consola
    const selConsole = document.getElementById(`sel-console-${cardId}`);
    const selAccount = document.getElementById(`sel-account-${cardId}`);
    const selCurrency = document.getElementById(`sel-currency-${cardId}`);

    if (selConsole) {
      selConsole.addEventListener('change', () => {
        actualizarSelectoresCuenta(p, cardId);
        actualizarPrecio(p, cardId);
      });
    }
    if (selAccount) {
      selAccount.addEventListener('change', () => actualizarPrecio(p, cardId));
    }
    if (selCurrency) {
      selCurrency.addEventListener('change', () => actualizarPrecio(p, cardId));
    }

    // Estado inicial
    if (selConsole) actualizarSelectoresCuenta(p, cardId);
    actualizarPrecio(p, cardId);
  });

  renderPaginacion(pagina, totalPaginas);
}

function renderPaginacion(actual, total) {
  const cont = document.getElementById('catalog-pagination');
  if (!cont) return;

  if (total <= 1) {
    cont.innerHTML = '';
    return;
  }

  cont.innerHTML = `
    <button class="btn btn-secondary pag-btn" ${actual <= 1 ? 'disabled' : ''} data-pag="${actual - 1}">← Anterior</button>
    <span class="pag-info">Página ${actual} de ${total}</span>
    <button class="btn btn-secondary pag-btn" ${actual >= total ? 'disabled' : ''} data-pag="${actual + 1}">Siguiente →</button>
  `;

  cont.querySelectorAll('.pag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.pag);
      if (!isNaN(p) && p >= 1 && p <= total) {
        pagina = p;
        render();
        window.scrollTo({ top: 200, behavior: 'smooth' });
      }
    });
  });
}

// ============================================================
// CARD
// ============================================================

function renderCard(p) {
  const cardId = p.id;
  const cats = p.categories || [];
  const badges = cats
    .filter(c => ['ps4', 'ps5', 'ps3', 'steam', 'psplus', 'streaming', 'otros'].includes(c))
    .map(c => `<span class="badge badge-${c}">${c.toUpperCase()}</span>`)
    .join('');

  const imagen = p.coverUrl
    ? `<div class="card-image" style="background-image: url('${p.coverUrl}')"></div>`
    : `<div class="card-image card-image-empty"><span class="card-image-placeholder">🎮</span></div>`;

  const preorderBadge = p.isPreorder
    ? `<div class="card-preorder-badge">🚀 PREVENTA${p.releaseDate ? ` · ${formatearFecha(p.releaseDate)}` : ''}</div>`
    : '';

  // Selectores disponibles
  const consolasDisponibles = cats.filter(c => {
    return (p.variants || []).some(v => v.categoria === c && varianteDisponible(v));
  });

  const tieneSelectores = consolasDisponibles.length > 0;

  let selectoresHtml = '';
  if (tieneSelectores) {
    selectoresHtml = `
      <div class="card-variant-selectors">
        ${consolasDisponibles.length > 1
          ? `<select id="sel-console-${cardId}" class="card-select">
               ${consolasDisponibles.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('')}
             </select>`
          : `<input type="hidden" id="sel-console-${cardId}" value="${consolasDisponibles[0]}">`
        }
        <select id="sel-account-${cardId}" class="card-select"></select>
        <select id="sel-currency-${cardId}" class="card-select">
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
      <div class="card-offer-wrap" id="offer-wrap-${cardId}"></div>
      ${selectoresHtml}
      <div class="card-price-wrap" id="price-wrap-${cardId}"></div>
      <div class="card-stock-wrap" id="stock-wrap-${cardId}"></div>
      <div class="card-payments">💳 ${escapeHtml(pagosTexto)}</div>
      <div class="card-countdown" id="countdown-${cardId}"></div>
      <a class="btn btn-buy" id="wa-${cardId}" href="#" target="_blank" rel="noopener">💬 Comprar por WhatsApp</a>
      ${tieneTrailer ? `<button class="btn btn-secondary" onclick="abrirTrailer('${cardId}')">🎬 Ver Trailer</button>` : ''}
    </article>
  `;
}

function formatearFecha(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

// ============================================================
// SELECTORES DE CUENTA
// ============================================================

function actualizarSelectoresCuenta(p, cardId) {
  const selConsole = document.getElementById(`sel-console-${cardId}`);
  const selAccount = document.getElementById(`sel-account-${cardId}`);
  if (!selConsole || !selAccount) return;

  const catActual = selConsole.value;
  const variantesCat = (p.variants || []).filter(v => v.categoria === catActual && varianteDisponible(v));

  const tipos = [];
  if (variantesCat.some(v => v.tipo === 'primaria')) tipos.push('primaria');
  if (variantesCat.some(v => v.tipo === 'secundaria')) tipos.push('secundaria');

  const valorActual = selAccount.value;
  selAccount.innerHTML = tipos.map(t =>
    `<option value="${t}" ${t === valorActual ? 'selected' : ''}>${t === 'primaria' ? 'Primaria' : 'Secundaria'}</option>`
  ).join('');

  // Si no hay tipos, dejar vacío
  if (tipos.length === 0) {
    selAccount.innerHTML = '<option value="">—</option>';
  }
}

// ============================================================
// PRECIO
// ============================================================

function actualizarPrecio(p, cardId) {
  const priceWrap = document.getElementById(`price-wrap-${cardId}`);
  const stockWrap = document.getElementById(`stock-wrap-${cardId}`);
  const offerWrap = document.getElementById(`offer-wrap-${cardId}`);
  const countdown = document.getElementById(`countdown-${cardId}`);
  const waBtn = document.getElementById(`wa-${cardId}`);

  if (!priceWrap) return;

  const selConsole = document.getElementById(`sel-console-${cardId}`);
  const selAccount = document.getElementById(`sel-account-${cardId}`);
  const selCurrency = document.getElementById(`sel-currency-${cardId}`);

  if (!selConsole || !selAccount || !selCurrency) return;

  const cat = selConsole.value;
  const acc = selAccount.value;
  const moneda = selCurrency.value;

  const variante = (p.variants || []).find(v => v.categoria === cat && v.tipo === acc);

  if (!variante || !varianteDisponible(variante)) {
    priceWrap.innerHTML = `<div class="card-price card-price-empty">PRECIO A CONSULTAR</div>`;
    if (stockWrap) stockWrap.innerHTML = '';
    if (offerWrap) offerWrap.innerHTML = '';
    if (countdown) countdown.textContent = '';
    if (waBtn) {
      waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(`Hola GamesUy Store! Quiero consultar por ${p.title}`)}`;
    }
    return;
  }

  const oferta = ofertaVigente(variante);
  const precioActivo = oferta ? oferta.precio : Number(variante.precioFinalUYU);
  const precioMostrar = moneda === 'USD'
    ? formatUSD(calcPrecioUSD(precioActivo, cotizaciones.usdAUYU))
    : formatUYU(precioActivo);

  // Precio secundario (siempre mostrar en la otra moneda)
  const precioSecundario = moneda === 'USD'
    ? formatUYU(precioActivo)
    : '≈ ' + formatUSD(calcPrecioUSD(precioActivo, cotizaciones.usdAUYU));

  if (oferta) {
    const precioOriginalMostrar = moneda === 'USD'
      ? formatUSD(calcPrecioUSD(oferta.original, cotizaciones.usdAUYU))
      : formatUYU(oferta.original);

    priceWrap.innerHTML = `
      <div class="card-price-original">${precioOriginalMostrar}</div>
      <div class="card-price card-price-offer">${precioMostrar}</div>
      <div class="card-price-usd">${precioSecundario}</div>
    `;

    if (offerWrap) {
      offerWrap.innerHTML = `<div class="offer-banner-tag">🔥 OFERTA ESPECIAL</div>`;
    }

    if (countdown) {
      countdown.dataset.end = oferta.hasta + 'T23:59:59';
      countdown.style.display = '';
      actualizarCountdown(countdown);
    }
  } else {
    priceWrap.innerHTML = `
      <div class="card-price">${precioMostrar}</div>
      <div class="card-price-usd">${precioSecundario}</div>
    `;

    if (offerWrap) offerWrap.innerHTML = '';
    if (countdown) {
      countdown.textContent = '';
      countdown.style.display = 'none';
    }
  }

  if (stockWrap) {
    stockWrap.innerHTML = `<span class="stock-badge stock-ok">✓ Disponible</span>`;
  }

  // WhatsApp
  if (waBtn) {
    const tipoLabel = acc === 'secundaria' ? 'Secundaria' : 'Primaria';
    const catLabel = cat.toUpperCase();
    const msg = `Hola GamesUy Store! Quiero comprar *${p.title}* (${catLabel} ${tipoLabel}) por ${precioMostrar}`;
    waBtn.href = `https://wa.me/59896572226?text=${encodeURIComponent(msg)}`;
  }
}

// ============================================================
// COUNTDOWN
// ============================================================

function actualizarCountdown(el) {
  if (!el || !el.dataset.end) return;
  const end = new Date(el.dataset.end).getTime();
  const diff = end - Date.now();
  if (diff <= 0) {
    el.textContent = '⌛ Oferta finalizada';
    return;
  }
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
    if (embed) {
      html += `<div class="video-container"><iframe src="${embed}" allowfullscreen></iframe></div>`;
    }
  }
  if (p.gameplayUrl) {
    html += `<div style="margin-top:12px;"><h4 style="color:var(--cyan);margin-bottom:8px;">🎮 Gameplay</h4><img src="${p.gameplayUrl}" style="width:100%;border-radius:12px;border:1px solid var(--border);"></div>`;
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
// LISTENERS DE BÚSQUEDA Y CATEGORÍAS
// ============================================================

const searchInput = $('search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    filtroSearch = e.target.value;
    pagina = 1;
    render();
  });
}

document.querySelectorAll('#cat-nav .cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#cat-nav .cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filtroCat = btn.dataset.cat || 'all';
    pagina = 1;
    render();
  });
});

// Cerrar modal trailer
document.getElementById('trailer-close')?.addEventListener('click', () => {
  document.getElementById('trailer-modal')?.classList.add('hidden');
});
document.getElementById('trailer-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'trailer-modal') {
    document.getElementById('trailer-modal')?.classList.add('hidden');
  }
});

console.log('[GamesUy] store.js cargado');
