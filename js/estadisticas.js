// ============================================================
// GAMESUY STORE — Estadísticas internas
// Fase 18: Tracking de vistas, trailers, WhatsApp, categorías, búsquedas
// Fase 3 Perf: usar increment() para reducir lecturas
// ============================================================

import { db, auth } from './firebase-config.js';
import {
  doc, getDoc, setDoc, increment, collection, getDocs, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// ============================================================
// HELPERS
// ============================================================
function hoy() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function normalizarBusqueda(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 60);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

// ============================================================
// API PÚBLICA — Se llama desde store.js
// ============================================================

/**
 * Registrar una vista del catálogo (1 vez por sesión por página).
 * Optimizado: 1 sola operación a Firestore (antes eran 2).
 */
window.__estRegistrarVista = async function() {
  if (auth.currentUser) return; // No contar admins

  try {
    const key = 'gamesuy_vista_registrada_' + hoy();
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    const ref = doc(db, 'estadisticas', 'vistas');
    await setDoc(ref, {
      total: increment(1),
      ultimaVista: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('[GamesUy] Error al registrar vista:', err);
  }
};

/**
 * Registrar apertura de trailer de un juego.
 */
window.__estRegistrarTrailer = async function(productId, productTitle) {
  if (!productId) return;
  try {
    const ref = doc(db, 'estadisticas', 'trailers');
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const juegos = data.juegos || {};

    if (!juegos[productId]) {
      juegos[productId] = { titulo: productTitle || '', count: 0 };
    }
    juegos[productId].count += 1;
    juegos[productId].titulo = productTitle || juegos[productId].titulo || '';
    juegos[productId].ultimaVez = new Date().toISOString();

    await setDoc(ref, {
      juegos,
      ultimaActualizacion: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('[GamesUy] Error al registrar trailer:', err);
  }
};

/**
 * Registrar click en "Comprar por WhatsApp".
 */
window.__estRegistrarWhatsApp = async function(productId, productTitle) {
  if (!productId) return;
  try {
    const ref = doc(db, 'estadisticas', 'whatsapp');
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const juegos = data.juegos || {};

    if (!juegos[productId]) {
      juegos[productId] = { titulo: productTitle || '', count: 0 };
    }
    juegos[productId].count += 1;
    juegos[productId].titulo = productTitle || juegos[productId].titulo || '';
    juegos[productId].ultimaVez = new Date().toISOString();

    await setDoc(ref, {
      juegos,
      ultimaActualizacion: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('[GamesUy] Error al registrar WhatsApp:', err);
  }
};

/**
 * Registrar click en una categoría (filtro).
 */
window.__estRegistrarCategoria = async function(categoria) {
  if (!categoria || categoria === 'all') return;
  try {
    const ref = doc(db, 'estadisticas', 'categorias');
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const cats = data.categorias || {};

    if (!cats[categoria]) cats[categoria] = { count: 0 };
    cats[categoria].count += 1;
    cats[categoria].ultimaVez = new Date().toISOString();

    await setDoc(ref, { categorias: cats, ultimaActualizacion: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error('[GamesUy] Error al registrar categoría:', err);
  }
};

/**
 * Registrar búsqueda que no arroja resultados.
 */
window.__estRegistrarBusquedaVacia = async function(termino) {
  const norm = normalizarBusqueda(termino);
  if (!norm || norm.length < 2) return;
  try {
    const ref = doc(db, 'estadisticas', 'busquedas');
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const busquedas = data.busquedas || {};

    if (!busquedas[norm]) busquedas[norm] = { count: 0 };
    busquedas[norm].count += 1;
    busquedas[norm].ultimaVez = new Date().toISOString();

    await setDoc(ref, { busquedas, ultimaActualizacion: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error('[GamesUy] Error al registrar búsqueda:', err);
  }
};

// ============================================================
// ADMIN — Render de estadísticas
// ============================================================
async function cargarTodo() {
  try {
    const [vistas, trailers, whatsapp, categorias, busquedas] = await Promise.all([
      getDoc(doc(db, 'estadisticas', 'vistas')),
      getDoc(doc(db, 'estadisticas', 'trailers')),
      getDoc(doc(db, 'estadisticas', 'whatsapp')),
      getDoc(doc(db, 'estadisticas', 'categorias')),
      getDoc(doc(db, 'estadisticas', 'busquedas'))
    ]);

    const totalVistas = vistas.exists() ? (Number(vistas.data().total) || 0) : 0;
    const elTotal = $('est-total-vistas');
    if (elTotal) elTotal.textContent = totalVistas.toLocaleString('es-UY');

    renderTop('est-top-trailers', trailers.exists() ? trailers.data().juegos : {}, '🎬');
    renderTop('est-top-whatsapp', whatsapp.exists() ? whatsapp.data().juegos : {}, '💬');
    renderTopCategorias('est-top-categorias', categorias.exists() ? categorias.data().categorias : {});
    renderTopBusquedas('est-top-busquedas', busquedas.exists() ? busquedas.data().busquedas : {});
  } catch (err) {
    console.error('[GamesUy] Error al cargar estadísticas:', err);
  }
}

function renderTop(contId, juegosObj, icono) {
  const cont = $(contId);
  if (!cont) return;

  const lista = Object.entries(juegosObj)
    .map(([id, data]) => ({
      id,
      titulo: data.titulo || '(sin título)',
      count: Number(data.count) || 0
    }))
    .filter(j => j.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (lista.length === 0) {
    cont.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Todavía no hay datos.</p>';
    return;
  }

  const max = Math.max(...lista.map(j => j.count));

  cont.innerHTML = lista.map((j, i) => {
    const pct = Math.round((j.count / max) * 100);
    const medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    return `
      <div class="est-fila">
        <div class="est-fila-num">${medalla}</div>
        <div class="est-fila-info">
          <div class="est-fila-titulo">${icono} ${escapeHtml(j.titulo)}</div>
          <div class="est-fila-barra-wrap">
            <div class="est-fila-barra" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="est-fila-count">${j.count}</div>
      </div>
    `;
  }).join('');
}

function renderTopCategorias(contId, catsObj) {
  const cont = $(contId);
  if (!cont) return;

  const nombres = {
    'ps5': '🎮 PS5',
    'ps4': '🎮 PS4',
    'ps3': '🎮 PS3',
    'steam': '💻 Steam',
    'psplus': '💠 PS Plus',
    'streaming': '📺 Streaming',
    'otros': '📦 Otros'
  };

  const lista = Object.entries(catsObj)
    .map(([cat, data]) => ({
      cat,
      nombre: nombres[cat] || cat.toUpperCase(),
      count: Number(data.count) || 0
    }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  if (lista.length === 0) {
    cont.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Todavía no hay datos.</p>';
    return;
  }

  const max = Math.max(...lista.map(c => c.count));

  cont.innerHTML = lista.map(c => {
    const pct = Math.round((c.count / max) * 100);
    return `
      <div class="est-fila">
        <div class="est-fila-info">
          <div class="est-fila-titulo">${escapeHtml(c.nombre)}</div>
          <div class="est-fila-barra-wrap">
            <div class="est-fila-barra" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="est-fila-count">${c.count}</div>
      </div>
    `;
  }).join('');
}

function renderTopBusquedas(contId, busquedasObj) {
  const cont = $(contId);
  if (!cont) return;

  const lista = Object.entries(busquedasObj)
    .map(([termino, data]) => ({
      termino,
      count: Number(data.count) || 0
    }))
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  if (lista.length === 0) {
    cont.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Todavía no hay búsquedas sin resultados. 🎉</p>';
    return;
  }

  const max = Math.max(...lista.map(b => b.count));

  cont.innerHTML = lista.map(b => {
    const pct = Math.round((b.count / max) * 100);
    return `
      <div class="est-fila">
        <div class="est-fila-info">
          <div class="est-fila-titulo">🔍 "${escapeHtml(b.termino)}"</div>
          <div class="est-fila-barra-wrap">
            <div class="est-fila-barra est-fila-barra-alerta" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="est-fila-count">${b.count}</div>
      </div>
    `;
  }).join('');
}

document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'estadisticas') {
      setTimeout(cargarTodo, 100);
    }
  });
});

cargarTodo();

console.log('[GamesUy] estadisticas.js v2 cargado (con increment optimizado)');
