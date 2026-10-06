// ============================================================
// GAMESUY STORE — Sistema de pendientes
// Avisa cuando hay juegos nuevos o variantes nuevas sin precio
// ============================================================

import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, query, where, onSnapshot,
  doc, updateDoc, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let pendientesActuales = [];

// ============================================================
// CREAR UN PENDIENTE
// Se llama desde excel-importer.js cuando detecta algo nuevo
// ============================================================
export async function crearPendiente(datos) {
  try {
    await addDoc(collection(db, 'pendientes'), {
      productoId: datos.productoId || '',
      productoTitle: datos.productoTitle || '(sin título)',
      tipo: datos.tipo || 'variante_nueva', // 'juego_nuevo' | 'variante_nueva'
      variantesNuevas: datos.variantesNuevas || [],
      origen: datos.origen || 'excel-stock', // stock, ofertas, preventas
      resuelto: false,
      createdAt: new Date().toISOString(),
      resueltoAt: null
    });
    console.log('[GamesUy] Pendiente creado:', datos.productoTitle);
  } catch (err) {
    console.error('[GamesUy] Error al crear pendiente:', err);
  }
}

// ============================================================
// MARCAR COMO RESUELTO
// Se llama desde precios.js cuando se guarda info del producto
// ============================================================
export async function marcarPendienteResuelto(productoId) {
  if (!productoId) return;
  try {
    const q = query(
      collection(db, 'pendientes'),
      where('productoId', '==', productoId),
      where('resuelto', '==', false)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const updates = snap.docs.map(d =>
      updateDoc(doc(db, 'pendientes', d.id), {
        resuelto: true,
        resueltoAt: new Date().toISOString()
      })
    );
    await Promise.all(updates);
    console.log('[GamesUy] Pendiente resuelto para producto:', productoId);
  } catch (err) {
    console.error('[GamesUy] Error al marcar pendiente:', err);
  }
}

// ============================================================
// ELIMINAR UN PENDIENTE (si el usuario descarta)
// ============================================================
export async function eliminarPendiente(pendienteId) {
  if (!pendienteId) return;
  try {
    await deleteDoc(doc(db, 'pendientes', pendienteId));
  } catch (err) {
    console.error('[GamesUy] Error al eliminar pendiente:', err);
  }
}

// ============================================================
// RENDER DEL BANNER
// ============================================================
function renderBannerPendientes() {
  const banner = $('pendientes-banner');
  if (!banner) return;

  if (!auth.currentUser) {
    banner.classList.add('hidden');
    return;
  }

  if (pendientesActuales.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');

  const count = pendientesActuales.length;
  const countText = $('pendientes-count-text');
  if (countText) {
    countText.textContent = count === 1
      ? '1 juego necesita que le pongas precio'
      : `${count} juegos necesitan que les pongas precio`;
  }

  const lista = $('pendientes-lista');
  if (lista) {
    const items = pendientesActuales.slice(0, 5).map(p => {
      const variantes = (p.variantesNuevas || []).map(v => {
        const costo = Number(v.costoARS) || 0;
        return `${v.label}${costo > 0 ? ` · ARS ${costo.toLocaleString('es-UY')}` : ' · sin costo'}`;
      }).join(' · ');

      return `
        <div class="pendiente-item">
          <div class="pendiente-item-titulo">🎮 ${escapeHtml(p.productoTitle)}</div>
          <div class="pendiente-item-variantes">${escapeHtml(variantes)}</div>
        </div>
      `;
    }).join('');

    const mas = count > 5
      ? `<div class="pendiente-item-mas">... y ${count - 5} más</div>`
      : '';

    lista.innerHTML = items + mas;
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

// ============================================================
// LISTENER EN TIEMPO REAL
// ============================================================
onSnapshot(
  query(collection(db, 'pendientes'), where('resuelto', '==', false)),
  (snap) => {
    pendientesActuales = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    renderBannerPendientes();
  },
  (err) => {
    console.error('[GamesUy] Error escuchando pendientes:', err);
  }
);

// Cuando el usuario hace click en "Ver pendientes"
window.irAPendientes = function() {
  // Cambiar a admin y luego al tab masivo con filtro especial
  if (typeof window.switchPage === 'function') {
    window.switchPage('admin');
  }
  setTimeout(() => {
    if (typeof window.switchTab === 'function') {
      window.switchTab('masivo');
    }
    // Disparar el filtro de pendientes en precios-masivo
    setTimeout(() => {
      const sel = document.getElementById('masivo-estado');
      if (sel) {
        sel.value = 'pendientes';
        sel.dispatchEvent(new Event('change'));
      }
    }, 150);
  }, 100);
};

// Cuando el usuario cierra el banner temporalmente
window.cerrarBannerPendientes = function() {
  const banner = $('pendientes-banner');
  if (banner) banner.classList.add('hidden');
};

console.log('[GamesUy] pendientes.js cargado');
