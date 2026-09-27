// ============================================================
// GAMESUY STORE — Admin de FAQs + Términos
// ============================================================

import { db, auth } from './firebase-config.js';
import {
  doc, collection, addDoc, deleteDoc, setDoc, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

// ============================================================
// FAQs — ADMIN
// ============================================================
onSnapshot(collection(db, 'faqs'), (snap) => {
  const container = $('admin-faq-list');
  if (!container) return;

  if (snap.empty) {
    container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">No hay FAQs registradas todavía.</p>';
    return;
  }

  const faqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  faqs.sort((a, b) => String(a.q || '').localeCompare(String(b.q || ''), 'es'));

  container.innerHTML = faqs.map(f => `
    <div class="admin-list-item">
      <div class="admin-list-item-content">
        <strong>❓ ${escapeHtml(f.q || '')}</strong>
        <p class="admin-list-item-text">${escapeHtml(f.a || '')}</p>
      </div>
      <button class="admin-delete-btn" onclick="eliminarFaq('${f.id}')">🗑️ Eliminar</button>
    </div>
  `).join('');
});

// Eliminar FAQ
window.eliminarFaq = async function(id) {
  if (!auth.currentUser) {
    alert('Debés iniciar sesión como administrador.');
    return;
  }
  if (!confirm('¿Eliminar esta pregunta frecuente?')) return;

  try {
    await deleteDoc(doc(db, 'faqs', id));
    console.log('[GamesUy] FAQ eliminada:', id);
  } catch (err) {
    console.error('[GamesUy] Error al eliminar FAQ:', err);
    alert('❌ Error: ' + err.message);
  }
};

// Agregar FAQ
$('btn-add-faq')?.addEventListener('click', async () => {
  const q = $('faq-q').value.trim();
  const a = $('faq-a').value.trim();

  if (!q || !a) {
    alert('Completá la pregunta y la respuesta.');
    return;
  }

  const btn = $('btn-add-faq');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    // Chequear duplicado
    const normalized = q.toLowerCase().replace(/\s+/g, ' ');
    const snap = await getDocs(collection(db, 'faqs'));
    const existe = snap.docs.some(d =>
      String(d.data().q || '').toLowerCase().replace(/\s+/g, ' ') === normalized
    );

    if (existe) {
      alert('Ya existe una pregunta con el mismo texto.');
      btn.disabled = false;
      btn.textContent = '💾 Guardar FAQ';
      return;
    }

    await addDoc(collection(db, 'faqs'), { q, a });

    $('faq-q').value = '';
    $('faq-a').value = '';

    // Feedback visual breve
    btn.textContent = '✅ Guardado';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '💾 Guardar FAQ';
    }, 900);
  } catch (err) {
    console.error('[GamesUy] Error al agregar FAQ:', err);
    alert('❌ Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = '💾 Guardar FAQ';
  }
});

// ============================================================
// TÉRMINOS — ADMIN
// ============================================================
onSnapshot(doc(db, 'settings', 'terms'), (snap) => {
  const textarea = $('admin-terms-input');
  if (!textarea) return;

  if (snap.exists() && !textarea.dataset.dirty) {
    textarea.value = snap.data().text || '';
  }
});

$('admin-terms-input')?.addEventListener('input', () => {
  $('admin-terms-input').dataset.dirty = '1';
});

$('btn-save-terms')?.addEventListener('click', async () => {
  const btn = $('btn-save-terms');
  const text = $('admin-terms-input').value;

  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    await setDoc(doc(db, 'settings', 'terms'), { text }, { merge: true });
    delete $('admin-terms-input').dataset.dirty;
    btn.textContent = '✅ Guardado';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '💾 Guardar Términos';
    }, 900);
  } catch (err) {
    console.error('[GamesUy] Error al guardar términos:', err);
    alert('❌ Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = '💾 Guardar Términos';
  }
});

console.log('[GamesUy] contenido.js cargado');
