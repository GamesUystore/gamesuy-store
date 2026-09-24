// ============================================================
// GAMESUY STORE — Importador de Excel del proveedor
// FASE 3.2: procesamiento de Stock (crear/actualizar productos)
// ============================================================

import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  doc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  parseCosto,
  esCostoValido,
  aplicarVariacion,
  roundUYU
} from './data-model.js';

const $ = (id) => document.getElementById(id);

// Guardamos los datos leídos de cada Excel en memoria
const EXCEL_DATA = {
  stock:    null,
  ofertas:  null,
  preventas: null
};

// ============================================================
// LOG
// ============================================================

function log(msg, tipo = 'info') {
  const el = $('import-log');
  if (!el) return;
  const cls = tipo === 'error' ? 'import-error' : (tipo === 'ok' ? 'import-ok' : '');
  el.innerHTML += `<div class="${cls}">${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}

function logClear() {
  const el = $('import-log');
  if (el) el.innerHTML = '';
}

// ============================================================
// LECTURA DE ARCHIVOS EXCEL
// ============================================================

async function leerExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        resolve({ sheetName, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ============================================================
// PREVIEW EN EL LOG
// ============================================================

function mostrarPreview(nombre, sheetName, rows) {
  logClear();
  log(`📄 <strong>${nombre}</strong>`);
  log(`Hoja: <code>${sheetName}</code>`);
  log(`Total de filas leídas: <b>${rows.length}</b>`);

  const primerasFilas = rows.slice(0, 6);
  let html = '<table class="import-preview-table">';
  primerasFilas.forEach((fila, i) => {
    html += '<tr>';
    for (let j = 0; j < 6; j++) {
      const celda = fila[j] !== undefined && fila[j] !== null ? String(fila[j]) : '';
      const texto = celda.length > 35 ? celda.slice(0, 35) + '…' : celda;
      html += `<td>${i === 0 ? '<b>' + texto + '</b>' : texto}</td>`;
    }
    html += '</tr>';
  });
  html += '</table>';
  log(html);
}

// ============================================================
// LISTENERS DE FILE INPUTS
// ============================================================

function attachListener(inputId, tipo) {
  const input = $(inputId);
  if (!input) return;

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) {
      EXCEL_DATA[tipo] = null;
      return;
    }

    logClear();

    try {
      const { sheetName, rows } = await leerExcel(file);
      EXCEL_DATA[tipo] = { nombre: file.name, sheetName, rows };
      mostrarPreview(file.name, sheetName, rows);

      actualizarEstadoBoton();
      console.log(`[GamesUy] Excel "${file.name}" leído:`, { tipo, sheetName, totalFilas: rows.length });
    } catch (err) {
      console.error('[GamesUy] Error leyendo Excel:', err);
      log(`❌ Error al leer: ${err.message}`, 'error');
    }
  });
}

attachListener('excel-stock',    'stock');
attachListener('excel-ofertas',  'ofertas');
attachListener('excel-preventas','preventas');

function actualizarEstadoBoton() {
  const btn = $('btn-import-process');
  if (!btn) return;
  const hayAlgo = EXCEL_DATA.stock || EXCEL_DATA.ofertas || EXCEL_DATA.preventas;
  btn.disabled = !hayAlgo;
}

// ============================================================
// UTILIDADES DE NORMALIZACIÓN
// ============================================================

/**
 * Normaliza el título para usarlo como clave de matching.
 * Respeta puntuación (™, ®, :, etc.) para no fusionar juegos distintos.
 */
function normalizarTitulo(titulo) {
  return String(titulo || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Verifica si el valor de una celda es "NO DISPONIBLE".
 * Si es "NO DISPONIBLE", esa variante no existe.
 */
function esNoDisponible(valor) {
  if (valor === null || valor === undefined) return false;
  return /no\s*disponible/i.test(String(valor));
}

/**
 * Verifica si el valor de una celda es un encabezado o leyenda del Excel.
 */
function esFilaEncabezado(titulo) {
  const t = String(titulo || '').trim();
  if (!t) return true;
  if (t.toUpperCase() === 'JUEGO') return true;
  if (/🎮|TOKYO|VIGENTES|PARA USAR LA FUNCION|IMPORTANTE|SI EL JUEGO/i.test(t)) return true;
  return false;
}

// ============================================================
// CONSTRUIR VARIANTES DESDE UNA FILA DEL EXCEL DE STOCK
// ============================================================

/**
 * Columnas del Excel de Stock:
 *  A (0) → JUEGO
 *  B (1) → PRIMARIA PS4 (ARS)
 *  C (2) → PRIMARIA PS5 (ARS)
 *  D (3) → SECUNDARIA (ARS, aplica a ambas consolas)
 *  E,F,G → USDT (ignoramos)
 *  H (7) → SI/NO 3x2
 */
function construirVariantesDesdeFilaStock(fila) {
  const ps4PriRaw = fila[1];
  const ps5PriRaw = fila[2];
  const secRaw    = fila[3];
  const promoRaw  = fila[7];

  const ps4PriNoDisp = esNoDisponible(ps4PriRaw);
  const ps5PriNoDisp = esNoDisponible(ps5PriRaw);
  const secNoDisp    = esNoDisponible(secRaw);

  const tienePS4 = !ps4PriNoDisp;
  const tienePS5 = !ps5PriNoDisp;

  const variantes = [];

  // --- PS4 PRIMARIA ---
  if (tienePS4) {
    const costoARS = parseCosto(ps4PriRaw);
    variantes.push({
      id: 'ps4_primaria',
      label: 'PS4 Primaria',
      categoria: 'ps4',
      tipo: 'primaria',
      costoARS: costoARS,
      disponible: esCostoValido(ps4PriRaw),
      gananciaPct: null,
      precioFinalUYU: null,
      enOferta: false,
      ofertaCostoARS: null,
      ofertaPrecioUYU: null,
      ofertaHasta: null
    });
  }

  // --- PS5 PRIMARIA ---
  if (tienePS5) {
    const costoARS = parseCosto(ps5PriRaw);
    variantes.push({
      id: 'ps5_primaria',
      label: 'PS5 Primaria',
      categoria: 'ps5',
      tipo: 'primaria',
      costoARS: costoARS,
      disponible: esCostoValido(ps5PriRaw),
      gananciaPct: null,
      precioFinalUYU: null,
      enOferta: false,
      ofertaCostoARS: null,
      ofertaPrecioUYU: null,
      ofertaHasta: null
    });
  }

  // --- SECUNDARIA (una sola columna para ambas consolas) ---
  if (!secNoDisp) {
    const costoSec = parseCosto(secRaw);
    const disponible = esCostoValido(secRaw);

    if (tienePS4) {
      variantes.push({
        id: 'ps4_secundaria',
        label: 'PS4 Secundaria',
        categoria: 'ps4',
        tipo: 'secundaria',
        costoARS: costoSec,
        disponible: disponible,
        gananciaPct: null,
        precioFinalUYU: null,
        enOferta: false,
        ofertaCostoARS: null,
        ofertaPrecioUYU: null,
        ofertaHasta: null
      });
    }
    if (tienePS5) {
      variantes.push({
        id: 'ps5_secundaria',
        label: 'PS5 Secundaria',
        categoria: 'ps5',
        tipo: 'secundaria',
        costoARS: costoSec,
        disponible: disponible,
        gananciaPct: null,
        precioFinalUYU: null,
        enOferta: false,
        ofertaCostoARS: null,
        ofertaPrecioUYU: null,
        ofertaHasta: null
      });
    }
  }

  return variantes;
}

// ============================================================
// FUSIONAR VARIANTES: NUEVA (Excel) + EXISTENTE (Firestore)
// ============================================================

/**
 * Reglas:
 * - Si la variante no existía antes → se agrega tal cual.
 * - Si el costo no cambió → no se toca nada.
 * - Si el costo cambió y ambos > 0 → se aplica variación al precio final.
 * - Si antes era 0 y ahora > 0 → se actualiza costo y disponible, sin tocar precio.
 * - Si antes > 0 y ahora 0 → se marca no disponible, mantiene precio.
 * - Los campos manuales (gananciaPct, precioFinalUYU editado) se respetan.
 */
function fusionarVariante(varianteNueva, varianteExistente) {
  if (!varianteExistente) {
    return varianteNueva;
  }

  const costoViejo = Number(varianteExistente.costoARS) || 0;
  const costoNuevo = Number(varianteNueva.costoARS) || 0;

  const resultado = { ...varianteExistente };

  // Costo idéntico → no tocamos nada
  if (costoViejo === costoNuevo) {
    // Solo actualizamos disponibilidad si cambió
    resultado.disponible = varianteNueva.disponible;
    return resultado;
  }

  // Variación real (ambos > 0)
  if (costoViejo > 0 && costoNuevo > 0) {
    const variacion = (costoNuevo / costoViejo) - 1;
    const precioViejo = Number(resultado.precioFinalUYU) || 0;

    if (precioViejo > 0) {
      resultado.precioFinalUYU = aplicarVariacion(precioViejo, variacion);
    }
    resultado.costoARS = costoNuevo;
    resultado.disponible = true;
    return resultado;
  }

  // Antes sin costo, ahora con costo
  if (costoViejo === 0 && costoNuevo > 0) {
    resultado.costoARS = costoNuevo;
    resultado.disponible = true;
    return resultado;
  }

  // Antes con costo, ahora sin costo (SIN STOCK)
  if (costoViejo > 0 && costoNuevo === 0) {
    resultado.costoARS = 0;
    resultado.disponible = false;
    // Mantenemos precioFinalUYU por si vuelve
    return resultado;
  }

  return resultado;
}

// ============================================================
// PROCESAR STOCK
// ============================================================

async function procesarStock() {
  const excel = EXCEL_DATA.stock;
  if (!excel) {
    log('⚠ No hay Excel de Stock cargado.', 'error');
    return { creados: 0, actualizados: 0, saltados: 0 };
  }

  log('⏳ Leyendo productos existentes en Firestore...');
  const snap = await getDocs(collection(db, 'products'));
  const productosPorMatchKey = {};
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.matchKey) {
      productosPorMatchKey[data.matchKey] = { id: d.id, ...data };
    }
  });
  log(`✔ Encontrados ${snap.size} productos existentes en Firestore.`);

  // Saltear las primeras 5 filas (headers del proveedor)
  const filas = excel.rows.slice(5);

  let creados = 0;
  let actualizados = 0;
  let saltados = 0;

  // Preparar batch (máx 500 operaciones por batch)
  const operaciones = [];

  for (const fila of filas) {
    const titulo = String(fila[0] || '').trim();

    if (esFilaEncabezado(titulo)) {
      saltados++;
      continue;
    }

    const matchKey = normalizarTitulo(titulo);
    const variantesNuevas = construirVariantesDesdeFilaStock(fila);

    if (variantesNuevas.length === 0) {
      // Todas las variantes eran "NO DISPONIBLE" → no existe el juego
      saltados++;
      continue;
    }

    const existente = productosPorMatchKey[matchKey];

    if (existente) {
      // ACTUALIZAR: fusionar variantes
      const variantesFinales = variantesNuevas.map(vn => {
        const ve = (existente.variants || []).find(v => v.id === vn.id);
        return fusionarVariante(vn, ve);
      });

      // Preservar variantes que existían pero ya no vienen del Excel
      // (por ejemplo, cargadas a mano desde otro proveedor)
      const idsNuevos = new Set(variantesNuevas.map(v => v.id));
      (existente.variants || []).forEach(ve => {
        if (!idsNuevos.has(ve.id)) {
          // La variante existía pero no está en el Excel actual
          // La dejamos como está (por si es de otro proveedor)
          variantesFinales.push(ve);
        }
      });

      // Detectar si hubo cambios
      const huboCambio = JSON.stringify(variantesFinales) !== JSON.stringify(existente.variants || []);

      if (huboCambio) {
        const ref = doc(db, 'products', existente.id);
        operaciones.push({
          ref,
          data: {
            variants: variantesFinales,
            updatedAt: new Date().toISOString()
          }
        });
        actualizados++;
      } else {
        saltados++;
      }
    } else {
      // CREAR nuevo producto
      const categories = [];
      if (variantesNuevas.some(v => v.categoria === 'ps4')) categories.push('ps4');
      if (variantesNuevas.some(v => v.categoria === 'ps5')) categories.push('ps5');

      const promoRaw = String(fila[7] || '').trim().toUpperCase();
      const aplica3x2 = promoRaw === 'SI';

      const ref = doc(collection(db, 'products'));
      operaciones.push({
        ref,
        data: {
          title: titulo,
          matchKey,
          categories,
          coverUrl: '',
          youtubeUrl: '',
          description: '',
          isPreorder: false,
          releaseDate: '',
          visible: true,
          aplica3x2,
          variants: variantesNuevas,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
      creados++;
    }
  }

  log(`⏳ Guardando ${operaciones.length} operaciones en Firestore...`);

  // Ejecutar en batches de 400
  const TAM_BATCH = 400;
  for (let i = 0; i < operaciones.length; i += TAM_BATCH) {
    const lote = operaciones.slice(i, i + TAM_BATCH);
    const batch = writeBatch(db);
    lote.forEach(op => {
      if (op.data) {
        // Es crear o actualizar
        batch.set(op.ref, op.data, { merge: true });
      }
    });
    await batch.commit();
    log(`  → Lote ${Math.floor(i / TAM_BATCH) + 1} guardado (${lote.length} operaciones).`);
  }

  return { creados, actualizados, saltados };
}

// ============================================================
// BOTÓN PROCESAR
// ============================================================

$('btn-import-process')?.addEventListener('click', async () => {
  const btn = $('btn-import-process');
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = '⏳ Procesando...';

  try {
    if (!EXCEL_DATA.stock) {
      log('⚠ Para esta fase solo está implementado el Excel de Stock.', 'error');
      log('Subí el Excel de Stock y probá de nuevo.', 'error');
      return;
    }

    logClear();
    log('🚀 Iniciando procesamiento del Excel de Stock...');
    log('');

    const res = await procesarStock();

    log('');
    log('═══════════════════════════════════════');
    log(`✅ PROCESO COMPLETADO`);
    log(`   🆕 Creados:      ${res.creados}`);
    log(`   🔄 Actualizados: ${res.actualizados}`);
    log(`   ⏭️  Saltados:     ${res.saltados}`);
    log('═══════════════════════════════════════');

    alert(`✅ Importación completada\n\nCreados: ${res.creados}\nActualizados: ${res.actualizados}\nSaltados: ${res.saltados}`);
  } catch (err) {
    console.error('[GamesUy] Error procesando Stock:', err);
    log(`❌ Error: ${err.message}`, 'error');
    alert('❌ Error al procesar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

console.log('[GamesUy] excel-importer.js cargado (Fase 3.2 - Stock)');
