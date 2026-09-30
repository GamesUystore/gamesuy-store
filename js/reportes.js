// ============================================================
// GAMESUY STORE — Sistema de Reportes y Pedidos
// Fase 15: Problemas reportados + Juegos solicitados
// ============================================================

import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function formatearFecha(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

function limpiarTexto(str, max = 500) {
  return String(str || '').trim().slice(0, max);
}

function crearEnlaceWhatsapp(numero, mensaje) {
  const limpio = String(numero || '').replace(/[^0-9]/g, '');
  if (!limpio) return '';
  return `https://wa.me/${limpio}?text=${encodeURIComponent(mensaje)}`;
}

// ============================================================
// ============================================================
//  SECCIÓN 1: MODAL "REPORTAR PROBLEMA"
// ============================================================
// ============================================================

let juegoReportado = '';

// Abrir modal (llamado desde las cards)
window.abrirModalReporte = function(cardId) {
  const modal = $('reporte-modal');
  if (!modal) return;

  // Buscar el producto para autocompletar el nombre
  const productosGlobales = window.__productosCache || [];
  const prod = productosGlobales.find(p => p.id === cardId);
  const titulo = prod ? (prod.title || '') : '';

  juegoReportado = titulo;
  const input = $('reporte-juego');
  if (input) input.value = titulo || '(sin título)';

  // Reset
  const form = $('reporte-form');
  if (form) form.reset();
  const juegoInput = $('reporte-juego');
  if (juegoInput) juegoInput.value = titulo || '(sin título)';

  const err = $('reporte-error');
  if (err) err.classList.add('hidden');
  const ok = $('reporte-exito');
  if (ok) ok.classList.add('hidden');

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

// Cerrar modal
window.cerrarModalReporte = function() {
  const modal = $('reporte-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
  juegoReportado = '';
};

// Enviar reporte
$('reporte-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = $('reporte-submit');
  const errEl = $('reporte-error');
  const okEl = $('reporte-exito');

  if (errEl) errEl.classList.add('hidden');
  if (okEl) okEl.classList.add('hidden');

  const tipo = $('reporte-tipo').value;
  const descripcion = limpiarTexto($('reporte-descripcion').value, 500);
  const email = limpiarTexto($('reporte-email').value, 80);
  const whatsapp = limpiarTexto($('reporte-whatsapp').value, 20);

  // Validaciones
  if (!tipo) {
    if (errEl) { errEl.textContent = '❌ Elegí el tipo de problema.'; errEl.classList.remove('hidden'); }
    return;
  }
  if (descripcion.length < 10) {
    if (errEl) { errEl.textContent = '❌ Contanos un poco más (mínimo 10 caracteres).'; errEl.classList.remove('hidden'); }
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Enviando...';

  try {
    await addDoc(collection(db, 'reportes'), {
      juego: juegoReportado || '(sin título)',
      tipo,
      descripcion,
      email,
      whatsapp,
      resuelto: false,
      createdAt: new Date().toISOString()
    });

    if (okEl) {
      okEl.textContent = '✅ ¡Gracias! Recibimos tu reporte. Lo revisaremos pronto.';
      okEl.classList.remove('hidden');
    }

    // Limpiar
    const form = $('reporte-form');
    if (form) form.reset();

    setTimeout(() => window.cerrarModalReporte(), 3000);
  } catch (err) {
    console.error('[GamesUy] Error al enviar reporte:', err);
    if (errEl) { errEl.textContent = '❌ Error: ' + err.message; errEl.classList.remove('hidden'); }
  } finally {
    btn.disabled = false;
    btn.textContent = '📩 Enviar reporte';
  }
});

// ============================================================
// ============================================================
//  SECCIÓN 2: MODAL "PEDIR JUEGO"
// ============================================================
// ============================================================

window.abrirModalPedido = function() {
  const modal = $('pedido-modal');
  if (!modal) return;

  const form = $('pedido-form');
  if (form) form.reset();

  const err = $('pedido-error');
  if (err) err.classList.add('hidden');
  const ok = $('pedido-exito');
  if (ok) ok.classList.add('hidden');

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.cerrarModalPedido = function() {
  const modal = $('pedido-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
};

// Enviar pedido
$('pedido-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = $('pedido-submit');
  const errEl = $('pedido-error');
  const okEl = $('pedido-exito');

  if (errEl) errEl.classList.add('hidden');
  if (okEl) okEl.classList.add('hidden');

  const juego = limpiarTexto($('pedido-juego').value, 100);
  const plataforma = limpiarTexto($('pedido-plataforma').value, 60);
  const descripcion = limpiarTexto($('pedido-descripcion').value, 300);
  const email = limpiarTexto($('pedido-email').value, 80);
  const whatsapp = limpiarTexto($('pedido-whatsapp').value, 20);

  // Validaciones
  if (juego.length < 2) {
    if (errEl) { errEl.textContent = '❌ Escribí qué juego buscás.'; errEl.classList.remove('hidden'); }
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Enviando...';

  try {
    await addDoc(collection(db, 'pedidos'), {
      juego,
      plataforma,
      descripcion,
      email,
      whatsapp,
      resuelto: false,
      createdAt: new Date().toISOString()
    });

    if (okEl) {
      okEl.textContent = '✅ ¡Gracias! Vamos a ver si podemos conseguir lo que buscás.';
      okEl.classList.remove('hidden');
    }

    const form = $('pedido-form');
    if (form) form.reset();

    setTimeout(() => window.cerrarModalPedido(), 3000);
  } catch (err) {
    console.error('[GamesUy] Error al enviar pedido:', err);
    if (errEl) { errEl.textContent = '❌ Error: ' + err.message; errEl.classList.remove('hidden'); }
  } finally {
    btn.disabled = false;
    btn.textContent = '📩 Enviar pedido';
  }
});

// ============================================================
// ============================================================
//  SECCIÓN 3: ADMIN — Reportes
// ============================================================
// ============================================================

const TIPOS_REPORTE = {
  'precio': '💵 Precio incorrecto',
  'no-funciona': '🔧 El juego no funciona',
  'descripcion': '📝 Error en descripción/imagen',
  'otro': '❓ Otro'
};

onSnapshot(collection(db, 'reportes'), (snap) => {
  const pendientes = $('admin-reportes-pendientes');
  const resueltos = $('admin-reportes-resueltos');
  const statPend = $('admin-reportes-stat-pend');
  const statRes = $('admin-reportes-stat-res');
  if (!pendientes && !resueltos) return;

  const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const listaPend = todos.filter(r => r.resuelto !== true).sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
  const listaRes = todos.filter(r => r.resuelto === true).sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );

  if (statPend) statPend.textContent = listaPend.length;
  if (statRes) statRes.textContent = listaRes.length;

  if (pendientes) {
    pendientes.innerHTML = listaPend.length === 0
      ? '<p style="color:var(--text-muted);text-align:center;padding:20px;">No hay reportes pendientes. 🎉</p>'
      : listaPend.map(r => renderReporteAdmin(r, 'pendiente')).join('');
  }

  if (resueltos) {
    resueltos.innerHTML = listaRes.length === 0
      ? '<p style="color:var(--text-muted);text-align:center;padding:20px;">No hay reportes resueltos.</p>'
      : listaRes.map(r => renderReporteAdmin(r, 'resuelto')).join('');
  }
});

function renderReporteAdmin(r, tipo) {
  const tipoLabel = TIPOS_REPORTE[r.tipo] || '❓ Reporte';
  const contacto = [];
  if (r.email) contacto.push(`📧 <a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a>`);
  if (r.whatsapp) {
    const wa = crearEnlaceWhatsapp(r.whatsapp, `Hola! Te contacto por tu reporte sobre "${r.juego}"`);
    contacto.push(`💬 <a href="${wa}" target="_blank" rel="noopener">${escapeHtml(r.whatsapp)}</a>`);
  }
  const contactoHtml = contacto.length
    ? `<div class="admin-reporte-contacto">${contacto.join(' · ')}</div>`
    : '';

  const acciones = tipo === 'pendiente'
    ? `<button class="btn btn-primary btn-sm" onclick="window.marcarReporteResuelto('${r.id}')">✅ Marcar resuelto</button>
       <button class="btn btn-danger btn-sm" onclick="window.eliminarReporte('${r.id}')">🗑️ Eliminar</button>`
    : `<button class="btn btn-secondary btn-sm" onclick="window.marcarReportePendiente('${r.id}')">↩️ Reabrir</button>
       <button class="btn btn-danger btn-sm" onclick="window.eliminarReporte('${r.id}')">🗑️ Eliminar</button>`;

  return `
    <div class="admin-reporte-item">
      <div class="admin-reporte-info">
        <div class="admin-reporte-head">
          <span class="admin-reporte-tipo">${tipoLabel}</span>
          <span class="admin-reporte-fecha">${formatearFecha(r.createdAt)}</span>
        </div>
        <strong class="admin-reporte-juego">🎮 ${escapeHtml(r.juego || '(sin título)')}</strong>
        <p class="admin-reporte-desc">${escapeHtml(r.descripcion || '')}</p>
        ${contactoHtml}
      </div>
      <div class="admin-reporte-acciones">${acciones}</div>
    </div>
  `;
}

window.marcarReporteResuelto = async function(id) {
  if (!auth.currentUser) { alert('Debés iniciar sesión.'); return; }
  try {
    await updateDoc(doc(db, 'reportes', id), { resuelto: true });
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('❌ Error: ' + err.message);
  }
};

window.marcarReportePendiente = async function(id) {
  if (!auth.currentUser) { alert('Debés iniciar sesión.'); return; }
  try {
    await updateDoc(doc(db, 'reportes', id), { resuelto: false });
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('❌ Error: ' + err.message);
  }
};

window.eliminarReporte = async function(id) {
  if (!auth.currentUser) { alert('Debés iniciar sesión.'); return; }
  if (!confirm('¿Eliminar este reporte para siempre?')) return;
  try {
    await deleteDoc(doc(db, 'reportes', id));
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('❌ Error: ' + err.message);
  }
};

// ============================================================
// ============================================================
//  SECCIÓN 4: ADMIN — Pedidos
// ============================================================
// ============================================================

onSnapshot(collection(db, 'pedidos'), (snap) => {
  const pendientes = $('admin-pedidos-pendientes');
  const resueltos = $('admin-pedidos-resueltos');
  const statPend = $('admin-pedidos-stat-pend');
  const statRes = $('admin-pedidos-stat-res');
  if (!pendientes && !resueltos) return;

  const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const listaPend = todos.filter(r => r.resuelto !== true).sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
  const listaRes = todos.filter(r => r.resuelto === true).sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );

  if (statPend) statPend.textContent = listaPend.length;
  if (statRes) statRes.textContent = listaRes.length;

  if (pendientes) {
    pendientes.innerHTML = listaPend.length === 0
      ? '<p style="color:var(--text-muted);text-align:center;padding:20px;">No hay pedidos pendientes. 🎉</p>'
      : listaPend.map(r => renderPedidoAdmin(r, 'pendiente')).join('');
  }

  if (resueltos) {
    resueltos.innerHTML = listaRes.length === 0
      ? '<p style="color:var(--text-muted);text-align:center;padding:20px;">No hay pedidos resueltos.</p>'
      : listaRes.map(r => renderPedidoAdmin(r, 'resuelto')).join('');
  }
});

function renderPedidoAdmin(r, tipo) {
  const contacto = [];
  if (r.email) contacto.push(`📧 <a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a>`);
  if (r.whatsapp) {
    const wa = crearEnlaceWhatsapp(r.whatsapp, `Hola! Te contacto por tu pedido de "${r.juego}"`);
    contacto.push(`💬 <a href="${wa}" target="_blank" rel="noopener">${escapeHtml(r.whatsapp)}</a>`);
  }
  const contactoHtml = contacto.length
    ? `<div class="admin-reporte-contacto">${contacto.join(' · ')}</div>`
    : '';

  const plataformaTag = r.plataforma
    ? `<span class="admin-pedido-plataforma">${escapeHtml(r.plataforma)}</span>`
    : '';

  const descripcionHtml = r.descripcion
    ? `<p class="admin-reporte-desc">${escapeHtml(r.descripcion)}</p>`
    : '';

  const acciones = tipo === 'pendiente'
    ? `<button class="btn btn-primary btn-sm" onclick="window.marcarPedidoResuelto('${r.id}')">✅ Marcar conseguido</button>
       <button class="btn btn-danger btn-sm" onclick="window.eliminarPedido('${r.id}')">🗑️ Eliminar</button>`
    : `<button class="btn btn-secondary btn-sm" onclick="window.marcarPedidoPendiente('${r.id}')">↩️ Reabrir</button>
       <button class="btn btn-danger btn-sm" onclick="window.eliminarPedido('${r.id}')">🗑️ Eliminar</button>`;

  return `
    <div class="admin-reporte-item">
      <div class="admin-reporte-info">
        <div class="admin-reporte-head">
          <span class="admin-reporte-tipo admin-pedido-tipo">🔍 Pedido</span>
          ${plataformaTag}
          <span class="admin-reporte-fecha">${formatearFecha(r.createdAt)}</span>
        </div>
        <strong class="admin-reporte-juego">🎮 ${escapeHtml(r.juego || '(sin título)')}</strong>
        ${descripcionHtml}
        ${contactoHtml}
      </div>
      <div class="admin-reporte-acciones">${acciones}</div>
    </div>
  `;
}

window.marcarPedidoResuelto = async function(id) {
  if (!auth.currentUser) { alert('Debés iniciar sesión.'); return; }
  try {
    await updateDoc(doc(db, 'pedidos', id), { resuelto: true });
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('❌ Error: ' + err.message);
  }
};

window.marcarPedidoPendiente = async function(id) {
  if (!auth.currentUser) { alert('Debés iniciar sesión.'); return; }
  try {
    await updateDoc(doc(db, 'pedidos', id), { resuelto: false });
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('❌ Error: ' + err.message);
  }
};

window.eliminarPedido = async function(id) {
  if (!auth.currentUser) { alert('Debés iniciar sesión.'); return; }
  if (!confirm('¿Eliminar este pedido para siempre?')) return;
  try {
    await deleteDoc(doc(db, 'pedidos', id));
  } catch (err) {
    console.error('[GamesUy] Error:', err);
    alert('❌ Error: ' + err.message);
  }
};

// ============================================================
// Cerrar modales al hacer click afuera
// ============================================================
$('reporte-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'reporte-modal') window.cerrarModalReporte();
});
$('pedido-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'pedido-modal') window.cerrarModalPedido();
});

console.log('[GamesUy] reportes.js cargado');
