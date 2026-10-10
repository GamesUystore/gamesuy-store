// ============================================================
// GAMESUY STORE — Panel de Administración
// Fase 3.5: Recalculo automático de precios al cambiar cotización
// ============================================================

import { db } from './firebase-config.js';
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { roundUYU, roundUSD } from './data-model.js';

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
  }, 4000);
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
// COTIZACIONES + RECÁLCULO AUTOMÁTICO DE PRECIOS
// ============================================================

let cotizacionesActuales = { arsAUYU: 0.055, usdAUYU: 39.50 };

onSnapshot(doc(db, 'settings', 'cotizaciones'), (snap) => {
  if (!snap.exists()) return;
  const c = snap.data();
  cotizacionesActuales.arsAUYU = Number(c.arsAUYU) || 0.055;
  cotizacionesActuales.usdAUYU = Number(c.usdAUYU) || 39.50;

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

// ============================================================
// RECALCULAR TODOS LOS PRECIOS
// ============================================================
async function recalcularTodosLosPrecios(viejaCot, nuevaCot) {
  if (!viejaCot || viejaCot <= 0) {
    mostrarToast('⚠️ No se puede recalcular: la cotización vieja no es válida.', 'error');
    return;
  }

  const factor = nuevaCot / viejaCot;
  const porcentaje = Math.round((factor - 1) * 100 * 100) / 100;

  // Confirmar antes de proceder
  const confirmado = confirm(
    `🔄 RECALCULAR TODOS LOS PRECIOS\n\n` +
    `Cotización anterior: ${viejaCot}\n` +
    `Cotización nueva:    ${nuevaCot}\n\n` +
    `Factor: ×${factor.toFixed(4)} (${porcentaje >= 0 ? '+' : ''}${porcentaje}%)\n\n` +
    `Esto actualizará los precios de TODOS los juegos ` +
    `que tengan ganancia % guardada.\n\n` +
    `¿Proceder con el recálculo?`
  );

  if (!confirmado) {
    mostrarToast('Recálculo cancelado', 'error');
    return;
  }

  mostrarToast(`🔄 Recalculando precios de todos los juegos...`, 'success');

  try {
    const snap = await getDocs(collection(db, 'products'));
    const operaciones = [];
    let totalVariantes = 0;
    let variantesRecalculadas = 0;
    let variantesSinGanancia = 0;
    let variantesSinCosto = 0;
    let ofertasRecalculadas = 0;

    snap.docs.forEach(d => {
      const prod = { id: d.id, ...d.data() };
      const variantes = prod.variants || [];
      if (variantes.length === 0) return;

      let huboCambios = false;

      const nuevasVariantes = variantes.map(v => {
        totalVariantes++;

        const costoARS = Number(v.costoARS) || 0;
        const gananciaPct = (v.gananciaPct !== null && v.gananciaPct !== undefined)
          ? Number(v.gananciaPct)
          : null;

        // Sin costo: no se puede recalcular
        if (costoARS <= 0) {
          variantesSinCosto++;
          return v;
        }

        // Sin ganancia % (precio cargado a mano): no lo tocamos, avisamos
        if (gananciaPct === null || isNaN(gananciaPct)) {
          variantesSinGanancia++;
          return v;
        }

        // Recalcular precio normal
        const nuevoPrecioBase = costoARS * nuevaCot * (1 + gananciaPct);
        const nuevoPrecioUYU = roundUYU(nuevoPrecioBase);

        const resultado = {
          ...v,
          precioFinalUYU: nuevoPrecioUYU,
          updatedAt: new Date().toISOString()
        };

        // Si tiene oferta activa con ganancia definida, recalcular oferta también
        const ofertaCostoARS = Number(v.ofertaCostoARS) || 0;
        const ofertaGanancia = (v.ofertaGananciaPct !== null && v.ofertaGananciaPct !== undefined)
          ? Number(v.ofertaGananciaPct)
          : null;

        if (ofertaCostoARS > 0 && ofertaGanancia !== null && !isNaN(ofertaGanancia)) {
          const nuevoOfertaBase = ofertaCostoARS * nuevaCot * (1 + ofertaGanancia);
          resultado.ofertaPrecioUYU = roundUYU(nuevoOfertaBase);
          ofertasRecalculadas++;
        }

        huboCambios = true;
        variantesRecalculadas++;
        return resultado;
      });

      if (huboCambios) {
        operaciones.push({
          ref: doc(db, 'products', prod.id),
          data: { variants: nuevasVariantes, updatedAt: new Date().toISOString() }
        });
      }
    });

    if (operaciones.length === 0) {
      mostrarToast(
        `No se recalculó nada.\n` +
        `Variantes sin costo: ${variantesSinCosto}\n` +
        `Variantes sin ganancia %: ${variantesSinGanancia}`,
        'error'
      );
      return;
    }

    // Guardar en lotes
    const TAM = 400;
    for (let i = 0; i < operaciones.length; i += TAM) {
      const lote = operaciones.slice(i, i + TAM);
      const batch = writeBatch(db);
      lote.forEach(op => batch.set(op.ref, op.data, { merge: true }));
      await batch.commit();
    }

    // Resumen final
    const resumen =
      `✅ RECÁLCULO COMPLETO\n\n` +
      `Juegos actualizados:      ${operaciones.length}\n` +
      `Variantes recalculadas:   ${variantesRecalculadas}\n` +
      `Ofertas recalculadas:     ${ofertasRecalculadas}\n\n` +
      `⚠️  Sin ganancia %:        ${variantesSinGanancia}\n` +
      `⚠️  Sin costo ARS:         ${variantesSinCosto}\n\n` +
      (variantesSinGanancia > 0
        ? `Las variantes "sin ganancia %" fueron cargadas con precio a mano.\nRevisalas una por una en Admin → Carga masiva.`
        : `Todo calculado automáticamente.`);

    alert(resumen);
    mostrarToast(`✅ ${operaciones.length} juegos recalculados`, 'success');

  } catch (err) {
    console.error('[GamesUy] Error al recalcular:', err);
    mostrarToast('❌ Error: ' + err.message, 'error');
  }
}

// ============================================================
// GUARDAR COTIZACIÓN + RECÁLCULO AUTOMÁTICO
// ============================================================
$('btn-save-cot')?.addEventListener('click', async () => {
  try {
    const arsNueva = parseFloat($('admin-cot-ars').value);
    const usdNueva = parseFloat($('admin-cot-usd').value);

    if (!(arsNueva > 0)) {
      mostrarToast('La cotización ARS→UYU debe ser mayor a 0.', 'error');
      return;
    }
    if (!(usdNueva > 0)) {
      mostrarToast('La cotización USD→UYU debe ser mayor a 0.', 'error');
      return;
    }

    const arsVieja = cotizacionesActuales.arsAUYU;
    const cambióARS = Math.abs(arsNueva - arsVieja) > 0.0000001;

    // Guardar cotizaciones
    await setDoc(doc(db, 'settings', 'cotizaciones'), {
      arsAUYU: arsNueva,
      usdAUYU: usdNueva,
      actualizado: new Date().toISOString()
    }, { merge: true });

    delete $('admin-cot-ars').dataset.dirty;
    delete $('admin-cot-usd').dataset.dirty;

    mostrarToast('✅ Cotizaciones guardadas');

    // Si cambió la cotización ARS → recalcular todos los precios
    if (cambióARS) {
      setTimeout(async () => {
        await recalcularTodosLosPrecios(arsVieja, arsNueva);
      }, 500);
    } else {
      console.log('[GamesUy] Cotización ARS sin cambios → no se recalcula.');
    }

  } catch (err) {
    console.error('[GamesUy] Error al guardar cotizaciones:', err);
    mostrarToast('❌ ' + err.message, 'error');
  }
});

// ============================================================
// BOTÓN MANUAL: RECALCULAR (por si querés forzarlo)
// ============================================================
$('btn-recalcular-precios')?.addEventListener('click', async () => {
  const arsActual = cotizacionesActuales.arsAUYU;
  // Factor 1: usar la misma cotización (recalcula desde cero)
  // Pero necesitamos un factor distinto a 1. Entonces usamos la fórmula directa.
  if (!confirm(
    `🔄 RECALCULAR PRECIOS (manual)\n\n` +
    `Cotización actual: ${arsActual}\n\n` +
    `Esto recalcula el precio final de cada variante usando:\n` +
    `  costoARS × ${arsActual} × (1 + ganancia%)\n\n` +
    `Útil si algún precio quedó desactualizado.\n\n` +
    `¿Proceder?`
  )) return;

  mostrarToast('🔄 Recalculando precios...', 'success');

  try {
    const snap = await getDocs(collection(db, 'products'));
    const operaciones = [];
    let recalculadas = 0;
    let sinGanancia = 0;
    let sinCosto = 0;

    snap.docs.forEach(d => {
      const prod = { id: d.id, ...d.data() };
      const variantes = prod.variants || [];
      if (variantes.length === 0) return;

      let huboCambios = false;

      const nuevasVariantes = variantes.map(v => {
        const costoARS = Number(v.costoARS) || 0;
        const gananciaPct = (v.gananciaPct !== null && v.gananciaPct !== undefined)
          ? Number(v.gananciaPct)
          : null;

        if (costoARS <= 0) { sinCosto++; return v; }
        if (gananciaPct === null || isNaN(gananciaPct)) { sinGanancia++; return v; }

        const nuevoPrecioUYU = roundUYU(costoARS * arsActual * (1 + gananciaPct));
        const resultado = {
          ...v,
          precioFinalUYU: nuevoPrecioUYU,
          updatedAt: new Date().toISOString()
        };

        const ofertaCostoARS = Number(v.ofertaCostoARS) || 0;
        const ofertaGanancia = (v.ofertaGananciaPct !== null && v.ofertaGananciaPct !== undefined)
          ? Number(v.ofertaGananciaPct)
          : null;

        if (ofertaCostoARS > 0 && ofertaGanancia !== null && !isNaN(ofertaGanancia)) {
          resultado.ofertaPrecioUYU = roundUYU(ofertaCostoARS * arsActual * (1 + ofertaGanancia));
        }

        huboCambios = true;
        recalculadas++;
        return resultado;
      });

      if (huboCambios) {
        operaciones.push({
          ref: doc(db, 'products', prod.id),
          data: { variants: nuevasVariantes, updatedAt: new Date().toISOString() }
        });
      }
    });

    if (operaciones.length === 0) {
      mostrarToast('No hay precios para recalcular.', 'error');
      return;
    }

    const TAM = 400;
    for (let i = 0; i < operaciones.length; i += TAM) {
      const lote = operaciones.slice(i, i + TAM);
      const batch = writeBatch(db);
      lote.forEach(op => batch.set(op.ref, op.data, { merge: true }));
      await batch.commit();
    }

    alert(
      `✅ RECÁLCULO COMPLETO\n\n` +
      `Juegos actualizados:    ${operaciones.length}\n` +
      `Variantes recalculadas: ${recalculadas}\n` +
      `⚠️  Sin ganancia %:      ${sinGanancia}\n` +
      `⚠️  Sin costo ARS:       ${sinCosto}`
    );
    mostrarToast(`✅ ${operaciones.length} juegos recalculados`, 'success');

  } catch (err) {
    console.error('[GamesUy] Error al recalcular:', err);
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

$('btn-clear-banner-img')?.addEventListener('click', async () => {
  if (!confirm('¿Quitar solo la imagen del banner?\n\nEl texto, título y etiqueta se mantienen.')) return;
  try {
    await setDoc(doc(db, 'settings', 'homeAnnouncement'), { imageUrl: '' }, { merge: true });
    const imgInput = $('admin-banner-img');
    if (imgInput) imgInput.value = '';
    const fileInput = $('admin-banner-file');
    if (fileInput) fileInput.value = '';
    const imgEl = $('admin-banner-img');
    if (imgEl) delete imgEl.dataset.dirty;
    mostrarToast('✅ Imagen del banner eliminada');
  } catch (err) {
    console.error('[GamesUy] Error al quitar imagen:', err);
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

console.log('[GamesUy] admin.js v2 cargado (con recálculo automático de precios)');
