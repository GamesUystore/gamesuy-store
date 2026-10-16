// ============================================================
// GAMESUY STORE — Sistema de pendientes
// Fase 3.7: Redirección mejorada al tab de carga masiva
// ============================================================

import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, query, where, onSnapshot,
  doc, updateDoc, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let pendientesActuales = [];

export async function crearPendiente(datos) {
  try {
    await addDoc(collection(db, 'pendientes'), {
      productoId: datos.productoId || '',
      productoTitle: datos.productoTitle || '(sin título)',
      tipo: datos.tipo || 'variante_nueva',
      variantesNuevas: datos.variantesNuevas || [],
      origen: datos.origen || 'excel-stock',
      resuelto: false,
      createdAt: new Date().toISOString(),
      resueltoAt: null
    });
  } catch (err) {
    console.error('[GamesUy] Error al crear pendiente:', err);
  }
}

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
  } catch (err) {
    console.error('[GamesUy] Error al marcar pendiente:', err);
  }
}

export async function eliminarPendiente(pendienteId) {
  if (!pendienteId) return;
  try {
    await deleteDoc(doc(db, 'pendientes', pendienteId));
  } catch (err) {
    console.error('[GamesUy] Error al eliminar pendiente:', err);
  }
}

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

window.irAPendientes = function() {
  if (!auth.currentUser) {
    alert('⚠️ Necesitás iniciar sesión como administrador');
    return;
  }

  if (typeof window.switchPage === 'function') {
    window.switchPage('admin');
  }

  setTimeout(() => {
    if (typeof window.switchTab === 'function') {
      window.switchTab('masivo');
    }
    setTimeout(() => {
      const sel = document.getElementById('masivo-estado');
      if (sel) {
        sel.value = 'pendientes';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 250);
  }, 200);
};

window.cerrarBannerPendientes = function() {
  const banner = $('pendientes-banner');
  if (banner) banner.classList.add('hidden');
};

console.log('[GamesUy] pendientes.js v2 cargado');
