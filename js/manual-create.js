// ============================================================
// GAMESUY STORE — Crear juego manual
// Formulario para agregar productos sin Excel
// ============================================================

import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, doc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getCostoUYU, calcGananciaPct, calcPrecioUSD,
  roundUYU, formatUYU, formatUSD
} from './data-model.js';

const $ = (id) => document.getElementById(id);

let cotizaciones = { arsAUYU: 0.055, usdAUYU: 39.50 };
let variantes = [];       // array de objetos { formId, label, categoria, tipo }
let coverB64 = '';         // imagen portada en Base64
let formIdCounter = 0;

console.log('[GamesUy] manual-create.js iniciando...');

// ============================================================
// COTIZACIONES
// ============================================================
onSnapshot(doc(db, 'settings', 'cotizaciones'), (snap) => {
  if (!snap.exists()) return;
  const c = snap.data();
  cotizaciones.arsAUYU = Number(c.arsAUYU) || 0.055;
  cotizaciones.usdAUYU = Number(c.usdAUYU) || 39.50;
  renderizarVariantes();
});

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function normalizarTitulo(t) {
  return String(t || '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '')
    .replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function nextFormId() {
  formIdCounter++;
  return 'v_' + formIdCounter + '_' + Date.now();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// VARIANTES DEFAULT POR CATEGORÍA
// ============================================================
function getVariantesDefault(tipoJuego) {
  switch (tipoJuego) {
    case 'ps4':
      return [
        { label: 'PS4 Primaria',   categoria: 'ps4', tipo: 'primaria' },
        { label: 'PS4 Secundaria', categoria: 'ps4', tipo: 'secundaria' }
      ];
    case 'ps5':
      return [
        { label: 'PS5 Primaria',   categoria: 'ps5', tipo: 'primaria' },
        { label: 'PS5 Secundaria', categoria: 'ps5', tipo: 'secundaria' }
      ];
    case 'ps4_ps5':
      return [
        { label: 'PS4 Primaria',   categoria: 'ps4', tipo: 'primaria' },
        { label: 'PS4 Secundaria', categoria: 'ps4', tipo: 'secundaria' },
        { label: 'PS5 Primaria',   categoria: 'ps5', tipo: 'primaria' },
        { label: 'PS5 Secundaria', categoria: 'ps5', tipo: 'secundaria' }
      ];
    case 'ps3':
      return [
        { label: 'PS3 Primaria',   categoria: 'ps3', tipo: 'primaria' },
        { label: 'PS3 Secundaria', categoria: 'ps3', tipo: 'secundaria' }
      ];
    case 'steam':
      return [
        { label: 'Steam', categoria: 'steam', tipo: 'estandar' }
      ];
    case 'psplus':
      return [
        { label: 'PS4 · 3 meses',  categoria: 'psplus', tipo: 'estandar' },
        { label: 'PS4 · 6 meses',  categoria: 'psplus', tipo: 'estandar' },
        { label: 'PS4 · 12 meses', categoria: 'psplus', tipo: 'estandar' },
        { label: 'PS5 · 3 meses',  categoria: 'psplus', tipo: 'estandar' },
        { label: 'PS5 · 6 meses',  categoria: 'psplus', tipo: 'estandar' },
        { label: 'PS5 · 12 meses', categoria: 'psplus', tipo: 'estandar' }
      ];
    case 'streaming':
      return [
        { label: 'Plan Estándar', categoria: 'streaming', tipo: 'estandar' }
      ];
    case 'otros':
      return [
        { label: 'Estándar', categoria: 'otros', tipo: 'estandar' }
      ];
    default:
      return [];
  }
}

function categoriasDeJuego(tipoJuego) {
  if (tipoJuego === 'ps4_ps5') return ['ps4', 'ps5'];
  return [tipoJuego];
}

// ============================================================
// HANDLER: CAMBIO DE CATEGORÍA
// ============================================================
$('crear-categoria')?.addEventListener('change', (e) => {
  const cat = e.target.value;
  if (!cat) {
    variantes = [];
    renderizarVariantes();
    actualizarBotones();
    return;
  }
  // Resetear variantes con las del tipo nuevo
  variantes = getVariantesDefault(cat).map(v => ({
    formId: nextFormId(),
    ...v
  }));
  renderizarVariantes();
  actualizarBotones();
});

// ============================================================
// HANDLER: AGREGAR VARIANTE
// ============================================================
$('btn-add-variante')?.addEventListener('click', () => {
  const cat = $('crear-categoria').value;
  if (!cat) return;
  const cats = categoriasDeJuego(cat);
  variantes.push({
    formId: nextFormId(),
    label: 'Nueva variante',
    categoria: cats[0],
    tipo: 'estandar'
  });
  renderizarVariantes();
});

// ============================================================
// RENDERIZAR VARIANTES
// ============================================================
function renderizarVariantes() {
  const container = $('crear-variantes-list');
  if (!container) return;

  if (variantes.length === 0) {
    container.innerHTML = '<p class="crear-empty-msg">Elegí una categoría para ver las variantes disponibles.</p>';
    return;
  }

  container.innerHTML = variantes.map(v => renderVarianteRow(v)).join('');
  activarListenersVariantes();
}

function renderVarianteRow(v) {
  const formId = v.formId;
  // Valores guardados en el DOM si existen (evita perderlos al re-renderizar)
  const existente = document.querySelector(`.crear-variante-row[data-form-id="${formId}"]`);
  const costoActual = existente ? (existente.querySelector('.crear-var-costo')?.value || '') : '';
  const precioActual = existente ? (existente.querySelector('.crear-var-precio')?.value || '') : '';

  const costoNum = parseFloat(costoActual) || 0;
  const precioNum = parseFloat(precioActual) || 0;
  const costoUYU = getCostoUYU(costoNum, cotizaciones.arsAUYU);
  const usdPreview = precioNum > 0 ? formatUSD(calcPrecioUSD(precioNum, cotizaciones.usdAUYU)) : '≈ —';

  return `
    <div class="crear-variante-row" data-form-id="${formId}">
      <div class="crear-var-header">
        <input type="text" class="crear-var-label" value="${escapeHtml(v.label)}" placeholder="Nombre de la variante">
        <button type="button" class="crear-var-delete" title="Eliminar variante">✕</button>
      </div>
      <div class="crear-var-inputs">
        <div class="crear-var-field">
          <label>Costo proveedor (ARS)</label>
          <div class="crear-var-input-wrap">
            <input type="number" class="crear-var-costo" value="${costoActual}" placeholder="0" min="0" step="1">
            <span>ARS</span>
          </div>
          <span class="crear-var-uyu">→ ${costoUYU > 0 ? formatUYU(costoUYU) : '$ 0'}</span>
        </div>
        <div class="crear-var-field">
          <label>Precio final de venta (UYU)</label>
          <div class="crear-var-input-wrap">
            <span>$</span>
            <input type="number" class="crear-var-precio" value="${precioActual}" placeholder="0" min="0" step="1">
            <span>UYU</span>
          </div>
          <span class="crear-var-usd">${usdPreview}</span>
        </div>
      </div>
    </div>
  `;
}

function activarListenersVariantes() {
  document.querySelectorAll('.crear-variante-row').forEach(row => {
    const formId = row.dataset.formId;
    const costoInput = row.querySelector('.crear-var-costo');
    const precioInput = row.querySelector('.crear-var-precio');
    const uyuEl = row.querySelector('.crear-var-uyu');
    const usdEl = row.querySelector('.crear-var-usd');
    const deleteBtn = row.querySelector('.crear-var-delete');

    costoInput?.addEventListener('input', () => {
      const val = parseFloat(costoInput.value) || 0;
      const uyu = getCostoUYU(val, cotizaciones.arsAUYU);
      if (uyuEl) uyuEl.textContent = '→ ' + (uyu > 0 ? formatUYU(uyu) : '$ 0');
    });

    precioInput?.addEventListener('input', () => {
      const val = parseFloat(precioInput.value) || 0;
      const usd = val > 0 ? formatUSD(calcPrecioUSD(val, cotizaciones.usdAUYU)) : '≈ —';
      if (usdEl) usdEl.textContent = usd;
    });

    deleteBtn?.addEventListener('click', () => {
      // Guardar valores actuales antes de eliminar
      variantes = variantes.filter(v => v.formId !== formId);
      renderizarVariantes();
    });
  });
}

// ============================================================
// BOTONES
// ============================================================
function actualizarBotones() {
  const cat = $('crear-categoria')?.value;
  const btnAdd = $('btn-add-variante');
  const btnCrear = $('btn-crear-juego');
  if (btnAdd) btnAdd.disabled = !cat;
  if (btnCrear) btnCrear.disabled = !cat;
}

// ============================================================
// PORTADA — SUBIR ARCHIVO O URL
// ============================================================
$('crear-cover-file')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const sizeKB = Math.round(file.size / 1024);
  const statusEl = $('crear-cover-status');
  if (sizeKB > 300) {
    if (statusEl) statusEl.textContent = `❌ Imagen muy grande (${sizeKB} KB, máx 300 KB).`;
    alert(`La imagen pesa ${sizeKB} KB. Máximo: 300 KB.\n\nComprimila en tinypng.com`);
    e.target.value = '';
    return;
  }
  if (statusEl) statusEl.textContent = `⏳ Procesando (${sizeKB} KB)...`;
  try {
    coverB64 = await fileToBase64(file);
    actualizarPreviewCrear(coverB64);
    if (statusEl) statusEl.textContent = `✅ Imagen lista (${sizeKB} KB).`;
  } catch (err) {
    if (statusEl) statusEl.textContent = '❌ Error: ' + err.message;
  }
});

$('crear-cover-url')?.addEventListener('input', (e) => {
  const url = e.target.value.trim();
  if (url) {
    coverB64 = url;
    actualizarPreviewCrear(url);
  } else {
    coverB64 = '';
    actualizarPreviewCrear('');
  }
});

function actualizarPreviewCrear(url) {
  const wrap = $('crear-cover-preview-wrap');
  const img = $('crear-cover-preview');
  if (!wrap || !img) return;
  if (url && url.trim()) {
    img.src = url;
    wrap.classList.remove('hidden');
  } else {
    img.removeAttribute('src');
    wrap.classList.add('hidden');
  }
}

document.querySelector('.upload-preview-clear[data-clear="crear"]')?.addEventListener('click', () => {
  coverB64 = '';
  const f = $('crear-cover-file'); if (f) f.value = '';
  const u = $('crear-cover-url'); if (u) u.value = '';
  actualizarPreviewCrear('');
  const s = $('crear-cover-status'); if (s) s.textContent = '';
});

// ============================================================
// CREAR JUEGO
// ============================================================
$('btn-crear-juego')?.addEventListener('click', async () => {
  const btn = $('btn-crear-juego');

  // Validaciones
  const cat = $('crear-categoria').value;
  const titulo = $('crear-titulo').value.trim();

  if (!cat) { alert('Elegí una categoría.'); return; }
  if (!titulo) { alert('Poné un título al producto.'); return; }

  // Leer variantes del DOM
  const rows = document.querySelectorAll('.crear-variante-row');
  if (rows.length === 0) { alert('Agregá al menos una variante.'); return; }

  const variantesFinales = Array.from(rows).map(row => {
    const formId = row.dataset.formId;
    const original = variantes.find(v => v.formId === formId) || {};
    const label = row.querySelector('.crear-var-label').value.trim() || 'Variante';
    const costo = parseFloat(row.querySelector('.crear-var-costo').value) || 0;
    const precio = parseFloat(row.querySelector('.crear-var-precio').value) || 0;

    let ganancia = null;
    if (costo > 0 && precio > 0) {
      ganancia = calcGananciaPct(precio, costo, cotizaciones.arsAUYU);
    }

    // ID único para esta variante
    const slug = label.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'var';
    const vid = `${original.categoria || cat}_${slug}_${formId}`;

    return {
      id: vid,
      label: label,
      categoria: original.categoria || cat,
      tipo: original.tipo || 'estandar',
      costoARS: costo,
      disponible: costo > 0,
      precioFinalUYU: precio > 0 ? roundUYU(precio) : null,
      gananciaPct: ganancia,
      enOferta: false,
      ofertaCostoARS: null,
      ofertaPrecioUYU: null,
      ofertaHasta: null
    };
  });

  const youtube = $('crear-youtube').value.trim();
  const descripcion = $('crear-descripcion').value.trim();
  const visible = $('crear-visible').checked;

  const categorias = categoriasDeJuego(cat);

  const data = {
    title: titulo,
    matchKey: normalizarTitulo(titulo),
    categories: categorias,
    coverUrl: coverB64 || '',
    gameplayUrl: '',
    youtubeUrl: youtube,
    description: descripcion,
    isPreorder: false,
    releaseDate: '',
    visible: visible,
    manual: true,
    variants: variantesFinales,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  btn.disabled = true;
  btn.textContent = '⏳ Creando...';

  try {
    await addDoc(collection(db, 'products'), data);
    alert(`✅ Producto "${titulo}" creado con éxito.\n\nSe agregó con ${variantesFinales.length} variante${variantesFinales.length !== 1 ? 's' : ''}.`);
    resetearFormulario();
  } catch (err) {
    console.error('[GamesUy] Error al crear:', err);
    alert('❌ Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Crear producto';
  }
});

// ============================================================
// RESET
// ============================================================
function resetearFormulario() {
  const cat = $('crear-categoria'); if (cat) cat.value = '';
  const titulo = $('crear-titulo'); if (titulo) titulo.value = '';
  const youtube = $('crear-youtube'); if (youtube) youtube.value = '';
  const desc = $('crear-descripcion'); if (desc) desc.value = '';
  const visible = $('crear-visible'); if (visible) visible.checked = true;
  const coverUrl = $('crear-cover-url'); if (coverUrl) coverUrl.value = '';
  const coverFile = $('crear-cover-file'); if (coverFile) coverFile.value = '';
  const coverStatus = $('crear-cover-status'); if (coverStatus) coverStatus.textContent = '';
  coverB64 = '';
  variantes = [];
  actualizarPreviewCrear('');
  renderizarVariantes();
  actualizarBotones();
}

$('btn-reset-crear')?.addEventListener('click', () => {
  if (confirm('¿Limpiar el formulario? Se pierden los datos no guardados.')) {
    resetearFormulario();
  }
});

// ============================================================
// INIT
// ============================================================
actualizarBotones();
console.log('[GamesUy] manual-create.js cargado');
