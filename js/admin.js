// ============================================================
// GAMESUY STORE — Panel de Administración
// ============================================================

import { db } from './firebase-config.js';
import {
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// ============================================================
// UTILIDADES
// ============================================================

function mostrarToast(msg, tipo = 'success') {
  const toast = $('admin-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'admin-toast ' + tipo;
  setTimeout(() => {
    toast.className = 'admin-toast hidden';
  }, 3200);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function validarImagen(file, maxKB) {
  if (file.size > maxKB * 1024) {
    throw new Error(`La imagen supera el límite de ${maxKB} KB. Comprimila antes.`);
  }
  return await fileToBase64(file);
}

// ============================================================
// COTIZACIONES
// ============================================================

onSnapshot(doc(db, 'settings', 'cotizaciones'), (snap) => {
  if (!snap.exists()) return;
  const c = snap.data();
  const elArs = $('admin-cot-ars');
  const elUsd = $('admin-cot-usd');
  const elUpd = $('admin-cot-updated');

  if (elArs && !elArs.dataset.dirty) elArs.value = c.arsAUYU ?? '';
  if (elUsd && !elUsd.dataset.dirty) elUsd.value = c.usdAUYU ?? '';

  if (elUpd && c.actualizado) {
    const d = new Date(c.actualizado);
    elUpd.textContent = 'Última actualización: ' + d.toLocaleString('es-UY');
  }
});

['admin-cot-ars', 'admin-cot-usd'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', () => { el.dataset.dirty = '1'; });
});

$('btn-save-cot')?.addEventListener('click', async () => {
  try {
    const ars = parseFloat($('admin-cot-ars').value);
    const usd = parseFloat($('admin-cot-usd').value);

    if (!(ars > 0)) {
      mostrarToast('La cotización ARS→UYU debe ser mayor a 0.', 'error');
      return;
    }
    if (!(usd > 0)) {
      mostrarToast('La cotización USD→UYU debe ser mayor a 0.', 'error');
      return;
    }

    await setDoc(doc(db, 'settings', 'cotizaciones'), {
      arsAUYU: ars,
      usdAUYU: usd,
      actualizado: new Date().toISOString()
    }, { merge: true });

    delete $('admin-cot-ars').dataset.dirty;
    delete $('admin-cot-usd').dataset.dirty;

    mostrarToast('✅ Cotizaciones guardadas');
  } catch (err) {
    console.error('[GamesUy] Error al guardar cotizaciones:', err);
    mostrarToast('❌ ' + err.message, 'error');
  }
});

// ============================================================
// LOGO
// ============================================================

function pintarPreviewLogo(url) {
  const img = $('admin-logo-preview');
  const fb  = $('admin-logo-preview-fallback');
  if (!img || !fb) return;
  if (url && url.trim()) {
    img.src = url;
    img.classList.add('visible');
    fb.style.display = 'none';
  } else {
    img.classList.remove('visible');
    img.removeAttribute('src');
    fb.style.display = 'block';
  }
}

onSnapshot(doc(db, 'settings', 'site'), (snap) => {
  const url = snap.exists() ? (snap.data().logoUrl || '') : '';
  pintarPreviewLogo(url);
});

$('btn-save-logo')?.addEventListener('click', async () => {
  try {
    const fileInput = $('admin-logo-file');
    const urlInput  = $('admin-logo-url');
    let finalUrl = urlInput.value.trim();

    if (fileInput.files && fileInput.files[0]) {
      finalUrl = await validarImagen(fileInput.files[0], 300);
    }

    if (!finalUrl) {
      mostrarToast('Elegí un archivo o pegá una URL.', 'error');
      return;
    }

    await setDoc(doc(db, 'settings', 'site'), { logoUrl: finalUrl }, { merge: true });
    fileInput.value = '';
    urlInput.value  = '';
    delete urlInput.dataset.dirty;
    mostrarToast('✅ Logo actualizado');
  } catch (err) {
    console.error('[GamesUy] Error al guardar logo:', err);
    mostrarToast('❌ ' + err.message, 'error');
  }
});

$('btn-clear-logo')?.addEventListener('click', async () => {
  if (!confirm('¿Quitar el logo actual?')) return;
  await setDoc(doc(db, 'settings', 'site'), { logoUrl: '' }, { merge: true });
  mostrarToast('Logo eliminado');
});

// ============================================================
// REDES
// ============================================================

onSnapshot(doc(db, 'settings', 'social'), (snap) => {
  if (!snap.exists()) return;
  const s = snap.data();
  ['wa', 'ig', 'fb', 'tt'].forEach(k => {
    const input = $('admin-social-' + k);
    if (input && !input.dataset.dirty) input.value = s[k] || '';
  });
});

['admin-social-wa','admin-social-ig','admin-social-fb','admin-social-tt'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', () => { el.dataset.dirty = '1'; });
});

$('btn-save-social')?.addEventListener('click', async () => {
  try {
    const data = {
      wa: $('admin-social-wa').value.trim(),
      ig: $('admin-social-ig').value.trim(),
      fb: $('admin-social-fb').value.trim(),
      tt: $('admin-social-tt').value.trim()
    };
    await setDoc(doc(db, 'settings', 'social'), data, { merge: true });
    ['wa','ig','fb','tt'].forEach(k => delete $('admin-social-' + k).dataset.dirty);
    mostrarToast('✅ Redes sociales guardadas');
  } catch (err) {
    console.error('[GamesUy] Error al guardar redes:', err);
    mostrarToast('❌ ' + err.message, 'error');
  }
});

// ============================================================
// BANNER
// ============================================================

onSnapshot(doc(db, 'settings', 'homeAnnouncement'), (snap) => {
  if (!snap.exists()) return;
  const b = snap.data();
  const set = (id, val) => {
    const el = $(id);
    if (el && !el.dataset.dirty) el.value = val || '';
  };
  set('admin-banner-label', b.label);
  set('admin-banner-title', b.title);
  set('admin-banner-text',  b.text);
  set('admin-banner-img',   b.imageUrl);
  set('admin-banner-link',  b.link);
});

['admin-banner-label','admin-banner-title','admin-banner-text','admin-banner-img','admin-banner-link'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', () => { el.dataset.dirty = '1'; });
});

$('btn-save-banner')?.addEventListener('click', async () => {
  try {
    const fileInput = $('admin-banner-file');
    const imgInput  = $('admin-banner-img');
    let imageUrl = imgInput.value.trim();

    if (fileInput.files && fileInput.files[0]) {
      imageUrl = await validarImagen(fileInput.files[0], 500);
    }

    const data = {
      label:    $('admin-banner-label').value.trim() || '📢 NOVEDAD',
      title:    $('admin-banner-title').value.trim(),
      text:     $('admin-banner-text').value.trim(),
      imageUrl: imageUrl,
      link:     $('admin-banner-link').value.trim()
    };

    await setDoc(doc(db, 'settings', 'homeAnnouncement'), data, { merge: true });
    fileInput.value = '';
    imgInput.value  = '';
    ['admin-banner-label','admin-banner-title','admin-banner-text','admin-banner-img','admin-banner-link']
      .forEach(id => delete $(id).dataset.dirty);
    mostrarToast('✅ Banner actualizado');
  } catch (err) {
    console.error('[GamesUy] Error al guardar banner:', err);
    mostrarToast('❌ ' + err.message, 'error');
  }
});

$('btn-clear-banner')?.addEventListener('click', async () => {
  if (!confirm('¿Ocultar el banner de la página de inicio?')) return;
  await setDoc(doc(db, 'settings', 'homeAnnouncement'), {
    label: '', title: '', text: '', imageUrl: '', link: ''
  }, { merge: true });
  ['admin-banner-label','admin-banner-title','admin-banner-text','admin-banner-img','admin-banner-link']
    .forEach(id => { const el = $(id); el.value = ''; delete el.dataset.dirty; });
  mostrarToast('Banner oculto');
});

console.log('[GamesUy] admin.js cargado');
