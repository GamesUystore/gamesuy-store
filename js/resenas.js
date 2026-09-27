// ============================================================
// GAMESUY STORE — Sistema de Reseñas
// Fase 11: Reseñas con captura, aprobación manual
// ============================================================

import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const MAX_IMG_KB = 300;
const MIN_TEXTO = 20;

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatearFecha(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) { return ''; }
}

function estrellasHtml(n) {
  const num = Math.max(1, Math.min(5, parseInt(n) || 5));
  return '⭐'.repeat(num) + '☆'.repeat(5 - num);
}

// ============================================================
// 1. SECCIÓN PÚBLICA — Mostrar reseñas aprobadas
// ============================================================
onSnapshot(collection(db, 'reviews'), (snap) => {
  const list = $('resenas-list');
  const count = $('resenas-count');
  if (!list) return;

  // Solo aprobadas
  const aprobadas = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.aprobada === true);

  // Ordenar: primero destacadas, luego por fecha descendente
  aprobadas.sort((a, b) => {
    if (a.destacada && !b.destacada) return -1;
    if (!a.destacada && b.destacada) return 1;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });

  if (count) {
    count.textContent = aprobadas.length === 0
      ? 'Sin reseñas todavía'
      : `${aprobadas.length} reseña${aprobadas.length !== 1 ? 's' : ''}`;
  }

  if (aprobadas.length === 0) {
    list.innerHTML = `
      <div class="catalog-empty">
        <span class="catalog-empty-icon">⭐</span>
        <p>Todavía no hay reseñas publicadas.</p>
        <p class="catalog-empty-sub">¡Sé el primero en dejar la tuya!</p>
      </div>`;
    return;
  }

  list.innerHTML = aprobadas.map(r => {
    const captura = r.captura
      ? `<div class="resena-captura-wrap"><img src="${r.captura}" alt="Captura de ${escapeHtml(r.nombre)}" class="resena-captura" loading="lazy"></div>`
      : '';
    const destacada = r.destacada ? '<span class="resena-destacada">⭐ Destacada</span>' : '';
    const juego = r.juego ? `<span class="resena-juego">🎮 ${escapeHtml(r.juego)}</span>` : '';

    return `
      <article class="resena-card">
        <div class="resena-header">
          <div class="resena-user">
            <span class="resena-avatar">${escapeHtml((r.nombre || '?').charAt(0).toUpperCase())}</span>
            <div>
              <strong class="resena-nombre">${escapeHtml(r.nombre || 'Anónimo')}</strong>
              ${juego}
            </div>
          </div>
          <div class="resena-meta">
            ${destacada}
            <span class="resena-fecha">${formatearFecha(r.createdAt)}</span>
          </div>
        </div>
        <div class="resena-estrellas">${estrellasHtml(r.estrellas)}</div>
        <p class="resena-texto">${escapeHtml(r.texto || '')}</p>
        ${captura}
      </article>
    `;
  }).join('');
});

// ============================================================
// 2. FORMULARIO PÚBLICO — Dejar reseña
// ============================================================
let capturaB64 = '';

// Abrir modal
window.abrirModalResena = function() {
  const modal = $('resena-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  // Reset
  capturaB64 = '';
  const form = $('resena-form');
  if (form) form.reset();
  const preview = $('resena-captura-preview-wrap');
  if (preview) preview.classList.add('hidden');
  const status = $('resena-captura-status');
  if (status) status.textContent = '';
  const err = $('resena-error');
  if (err) err.classList.add('hidden');
  const ok = $('resena-exito');
  if (ok) ok.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Cerrar modal
window.cerrarModalResena = function() {
  const modal = $('resena-modal');
  if (modal) modal.classList.add('hidden');
  capturaB64 = '';
};

// Subir captura
$('resena-captura-file')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const sizeKB = Math.round(file.size / 1024);
  const statusEl = $('resena-captura-status');
  const previewWrap = $('resena-captura-preview-wrap');
  const previewImg = $('resena-captura-preview');

  if (sizeKB > MAX_IMG_KB) {
    if (statusEl) statusEl.textContent = `❌ Imagen muy grande (${sizeKB} KB, máx ${MAX_IMG_KB} KB).`;
    e.target.value = '';
    return;
  }

  if (statusEl) statusEl.textContent = `⏳ Procesando (${sizeKB} KB)...`;
  try {
    capturaB64 = await fileToBase64(file);
    if (previewImg) previewImg.src = capturaB64;
    if (previewWrap) previewWrap.classList.remove('hidden');
    if (statusEl) statusEl.textContent = `✅ Captura lista (${sizeKB} KB).`;
  } catch (err) {
    if (statusEl) statusEl.textContent = '❌ Error: ' + err.message;
  }
});

// Quitar captura
$('resena-captura-clear')?.addEventListener('click', () => {
  capturaB64 = '';
  const file = $('resena-captura-file');
  if (file) file.value = '';
  const preview = $('resena-captura-preview-wrap');
  if (preview) preview.classList.add('hidden');
  const status = $('resena-captura-status');
  if (status) status.textContent = '';
});

// Enviar reseña
$('resena-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = $('resena-submit');
  const errEl = $('resena-error');
  const okEl = $('resena-exito');

  if (errEl) errEl.classList.add('hidden');
  if (okEl) okEl.classList.add('hidden');

  const nombre = $('resena-nombre').value.trim();
  const juego = $('resena-juego').value.trim();
  const estrellas = parseInt($('resena-estrellas').value) || 5;
  const texto = $('resena-texto').value.trim();

  // Validaciones
  if (nombre.length < 2) {
    if (errEl) { errEl.textContent = '❌ El nombre debe tener al menos 2 caracteres.'; errEl.classList.remove('hidden'); }
    return;
  }
  if (texto.length < MIN_TEXTO) {
    if (errEl) { errEl.textContent = `❌ La reseña debe tener al menos ${MIN_TEXTO} caracteres.`; errEl.classList.remove('hidden'); }
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Enviando...';

  try {
    await addDoc(collection(db, 'reviews'), {
      nombre,
      juego: juego || '',
      estrellas,
      texto,
      captura: capturaB64 || '',
      aprobada: false,
      destacada: false,
      createdAt: new Date().toISOString()
    });

    if (okEl) {
      okEl.textContent = '✅ ¡Gracias! Tu reseña fue enviada. La publicaremos después de revisarla.';
      okEl.classList.remove('hidden');
    }

    // Limpiar form
    const form = $('resena-form');
    if (form) form.reset();
    capturaB64 = '';
    const preview = $('resena-captura-preview-wrap');
    if (preview) preview.classList.add('hidden');
    const status = $('resena-captura-status');
    if (status) status.textContent = '';

    // Auto-cerrar en 5s
    setTimeout(() => window.cerrarModalResena(), 5000);
  } catch (err) {
    console.error('[GamesUy] Error al enviar reseña:', err);
    if (errEl) { errEl.textContent = '❌ Error: ' + err.message; errEl.classList.remove('hidden'); }
  } finally {
    btn.disabled = false;
    btn.textContent = '📩 Enviar reseña';
  }
});

// ============================================================
// 3. ADMIN — Lista de reseñas (pendientes + aprobadas)
// ============================================================
onSnapshot(collection(db, 'reviews'), (snap) => {
  const pendientes = $('admin-resenas-pendientes');
  const aprobadas = $('admin-resenas-aprobadas');
  const statPend = $('admin-resenas-stat-pend');
  const statApro = $('admin-resenas-stat-apro');
  if (!pendientes && !aprobadas) return;

  const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const listaPend = todas.filter(r => r.aprobada !== true).sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
  const listaApro = todas.filter(r => r.aprobada === true).sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );

  if (statPend) statPend.textContent = listaPend.length;
  if (statApro) statApro.textContent = listaApro.length;

  if (pendientes) {
    pendientes.innerHTML = listaPend.length === 0
      ? '<p style="color:var(--text-muted);text-align:center;padding:20px;">No hay reseñas pendientes. 🎉</p>'
      : listaPend.map(r => renderAdminResena(r, 'pendiente')).join('');
  }

  if (aprobadas) {
    aprobadas.innerHTML = listaApro.length === 0
      ? '<p style="color:var(--text-muted);text-align:center;padding:20px;">No hay reseñas aprobadas todavía.</p>'
      : listaApro.map(r => renderAdminResena(r, 'aprobada')).join('');
  }
});

function renderAdminResena(r, tipo) {
  const captura = r.captura
    ? `<img src="${r.captura}" alt="Captura" class="admin-resena-captura" onclick="window.open('${r.captura}','_blank')">`
    : '<span class="admin-resena-sin-captura">Sin captura</span>';

  const acciones = tipo === 'pendiente'
    ? `<button class="btn btn-primary btn-sm" onclick="window.aprobarResena('${r.id}')">✅ Aprobar</button>
       <button class="btn btn-danger btn-sm" onclick="window.eliminarResena('${r.id}')">🗑️ Rechazar</button>`
    : `<button class="btn btn-secondary btn-sm" onclick="window.destacarResena('${r.id}', ${r.destacada ? 'false' : 'true'})">${r.destacada ? '⭐ Quitar destaque' : '☆ Destacar'}</button>
       <button class="btn btn-secondary btn-sm" onclick="window.desaprobarResena('${r.id}')">↩️ Ocultar</button>
       <button class="btn btn-danger btn-sm" onclick="window.eliminarResena('${r.id}')">🗑️ Eliminar</button>`;

  return `
    <div class="admin-resena-item">
      <div class="admin-resena-info">
        <div class="admin-resena-head">
          <strong>${escapeHtml(r.nombre || 'Anónimo')}</strong>
          ${r.juego ? `<span class="resena-juego">🎮 ${escapeHtml(r.juego)}</span>` : ''}
          <span class="admin-resena-fecha">${formatearFecha(r.createdAt)}</span>
        </div>
        <div class="admin-resena-estrellas">${estrellasHtml(r.estrellas)}</div>
        <p class="admin-resena-texto">${escapeHtml(r.texto || '')}</p>
        ${captura}
      </div>
      <div class="admin-resena-acciones">${acciones}</div>
    </div>
  `;
}

// Acciones del admin
window.aprobarResena = async function(id) {
  if (!auth.currentUser) { alert('Debés iniciar sesión.'); return; }
  try {
    await updateDoc(doc(db, 'reviews', id), { aprobada: true });
  } catch (err) {
    console.error('[GamesUy] Error al aprobar:', err);
    alert('❌ Error: ' + err.message);
  }
};

window.desaprobarResena = async function(id) {
  if (!auth.currentUser) { alert('Debés iniciar sesión.'); return; }
  if (!confirm('¿Ocultar esta reseña de la web pública?')) return;
  try {
    await updateDoc(doc(db, 'reviews', id), { aprobada: false });
  } catch (err) {
    console.error('[GamesUy] Error al ocultar:', err);
    alert('❌ Error: ' + err.message);
  }
};

window.destacarResena = async function(id, valor) {
  if (!auth.currentUser) { alert('Debés iniciar sesión.'); return; }
  try {
    await updateDoc(doc(db, 'reviews', id), { destacada: !!valor });
  } catch (err) {
    console.error('[GamesUy] Error al destacar:', err);
    alert('❌ Error: ' + err.message);
  }
};

window.eliminarResena = async function(id) {
  if (!auth.currentUser) { alert('Debés iniciar sesión.'); return; }
  if (!confirm('¿Eliminar esta reseña para siempre? Esta acción no se puede deshacer.')) return;
  try {
    await deleteDoc(doc(db, 'reviews', id));
  } catch (err) {
    console.error('[GamesUy] Error al eliminar:', err);
    alert('❌ Error: ' + err.message);
  }
};

console.log('[GamesUy] resenas.js cargado');
