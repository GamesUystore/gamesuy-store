// ============================================================
// GAMESUY STORE — Importador de Excel
// Fase 3.6: Preventas (PS5, Primaria)
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

const EXCEL = {
  stock:    null,
  ofertas:  null,
  preventas: null
};

const PALABRAS_IDIOMA = /\b(español|espanol|inglés|ingles|latino|españa|espana|sub|subtitulado|latam)\b/gi;

// ============================================================
// UTILIDADES
// ============================================================

function log(id, msg, tipo = 'info') {
  const el = $(id);
  if (!el) return;
  const cls = tipo === 'error' ? 'import-error' : (tipo === 'ok' ? 'import-ok' : '');
  el.innerHTML += `<div class="${cls}">${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}

async function leerExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {
          type: 'array', cellText: true, cellDates: false, raw: false, codepage: 65001
        });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        resolve({ sheetName, rows });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function repararEncodingRoto(str) {
  if (!str) return str;
  const s = String(str);
  const tieneHalfwidth = /[\uFF61-\uFF9F]/.test(s);
  const tieneRaros = /[\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF]/.test(s);
  if (!tieneHalfwidth && !tieneRaros) return s;
  try {
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (code >= 0xFF61 && code <= 0xFF9F) { bytes.push(code - 0xFEC0); continue; }
      if (code < 0x80) { bytes.push(code); continue; }
      if (code >= 0x80 && code <= 0xFF) { bytes.push(code); continue; }
      if (code >= 0x4E00 && code <= 0x9FFF) return s;
      bytes.push(code & 0xFF);
    }
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
    const reemplazos = (decoded.match(/\uFFFD/g) || []).length;
    if (reemplazos > s.length * 0.3) return s;
    return decoded;
  } catch (e) { return s; }
}

function limpiarTituloBase(titulo) {
  let t = String(titulo || '');
  t = repararEncodingRoto(t);
  t = t.replace(/[\u00A0\u2007\u202F\u2009\u200A\u200B\u200C\u200D\u2060\uFEFF]/g, ' ');
  t = t.replace(/[\r\n\t]+/g, ' ');
  t = t.replace(/[\uFE0E\uFE0F]/g, '');
  t = t.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '');
  t = t.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function normalizarTitulo(titulo) {
  return String(titulo || '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function quitarAcentos(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function crearClaveRelajada(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[:\-–—.,;!?'"()\[\]{}]/g, ' ')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function crearClaveSúperRelajada(str) {
  let s = String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/[:\-–—.,;!?'"()\[\]{}]/g, ' ')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(PALABRAS_IDIOMA, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function parsearTituloOferta(tituloRaw) {
  let titulo = limpiarTituloBase(tituloRaw);
  const plataformas = [];

  titulo = titulo.replace(/\s*[-–—]\s*$/, '').trim();

  const matchParentesis = titulo.match(/\s*\(([^)]+)\)\s*$/);
  if (matchParentesis) {
    const contenido = matchParentesis[1].toUpperCase();
    if (contenido.includes('PS5')) plataformas.push('ps5');
    if (contenido.includes('PS4')) plataformas.push('ps4');
    if (plataformas.length > 0) {
      titulo = titulo.replace(/\s*\([^)]+\)\s*$/, '').trim();
    }
  }

  const matchPS = titulo.match(/\s+PS([45])\s*[-–—]?\s*$/i);
  if (matchPS) {
    const plat = 'ps' + matchPS[1];
    if (!plataformas.includes(plat)) plataformas.push(plat);
    titulo = titulo.replace(/\s+PS[45]\s*[-–—]?\s*$/i, '').trim();
  }

  const matchPSAny = titulo.match(/PS([45])/i);
  if (matchPSAny && !plataformas.includes('ps' + matchPSAny[1])) {
    plataformas.push('ps' + matchPSAny[1]);
  }
  titulo = titulo.replace(/\s*[-–—]?\s*PS[45]\s*[-–—]?\s*/gi, ' ').trim();

  titulo = titulo.replace(/\s*[-–—]\s*$/, '').trim();
  titulo = titulo.replace(/\s+/g, ' ').trim();
  titulo = titulo.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'");

  if (plataformas.length === 0) plataformas.push('ps4', 'ps5');

  return { titulo, plataformas };
}

function esFilaEncabezado(titulo) {
  const t = String(titulo || '').trim();
  if (!t) return true;
  const upper = t.toUpperCase();
  if (upper === 'JUEGO') return true;
  if (/🎮|TOKYO|VIGENTES|PARA USAR LA FUNCION|IMPORTANTE|SI EL JUEGO/i.test(t)) return true;
  if (/OFERTAS|AVENTURAS DE PRIMAVERA|DESTACADAS HASTA/i.test(t)) return true;
  if (/CUENTA ORIGINAL|CON GARANTIA|STOCKEABLE|CONSULTAR SECUNDARIA/i.test(t)) return true;
  if (/^▬+|^[━═]+$/.test(t)) return true;
  if (/^PREVENTAS$/i.test(t)) return true;
  return false;
}

function esNoDisponible(v) {
  if (v === null || v === undefined) return false;
  return /no\s*disponible/i.test(String(v));
}

function extraerFechaVencimiento(rows) {
  for (const fila of rows.slice(0, 15)) {
    for (const celda of fila) {
      const txt = String(celda || '');
      const m = txt.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  return null;
}

/**
 * Convierte una fecha del Excel a formato YYYY-MM-DD.
 * Soporta:
 *  - Excel ya serializado: "2026-11-19 00:00:00"
 *  - DD/MM/YYYY
 *  - YYYY-MM-DD
 */
function parseFechaExcel(valor) {
  if (!valor) return '';
  const s = String(valor).trim();

  // Formato ISO ya: "2026-11-19 00:00:00"
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mes = m[2].padStart(2, '0');
    return `${m[3]}-${mes}-${d}`;
  }

  return '';
}

// ============================================================
// MATCHING
// ============================================================

function buscarFuzzy(matchKey, productosMap) {
  const palabrasExcel = quitarAcentos(matchKey).split(/\s+/).filter(w => w.length >= 3);
  if (palabrasExcel.length < 2) return null;
  const palabrasExcelSet = new Set(palabrasExcel);
  let mejorProd = null;
  let mejorScore = 0;

  for (const [key, prod] of Object.entries(productosMap)) {
    const palabrasStock = quitarAcentos(key).split(/\s+/).filter(w => w.length >= 3);
    if (palabrasStock.length < 2) continue;
    const palabrasStockSet = new Set(palabrasStock);
    let comunes = 0;
    for (const w of palabrasExcelSet) {
      if (palabrasStockSet.has(w)) comunes++;
    }
    if (comunes < 3) continue;
    const minTokens = Math.min(palabrasExcelSet.size, palabrasStockSet.size);
    const score = comunes / minTokens;
    if (score >= 0.85 && score > mejorScore) {
      mejorScore = score;
      mejorProd = prod;
    }
  }
  return mejorProd;
}

function buscarProducto(matchKey, productosMap, productosMapRelajado, productosMapSuperRelajado) {
  if (productosMap[matchKey]) return { prod: productosMap[matchKey], tipo: 'exacto' };
  const claveRel = crearClaveRelajada(matchKey);
  if (productosMapRelajado[claveRel]) return { prod: productosMapRelajado[claveRel], tipo: 'relajado' };
  const claveSuper = crearClaveSúperRelajada(matchKey);
  if (productosMapSuperRelajado[claveSuper]) return { prod: productosMapSuperRelajado[claveSuper], tipo: 'super-relajado' };
  const prodFuzzy = buscarFuzzy(claveSuper, productosMapSuperRelajado);
  if (prodFuzzy) return { prod: prodFuzzy, tipo: 'fuzzy' };
  return { prod: null, tipo: null };
}

// ============================================================
// LISTENERS
// ============================================================

function attachFileListener(inputId, tipo, logId, btnId, autoFechaId) {
  const input = $(inputId);
  if (!input) return;

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    const logEl = $(logId);
    const btn = $(btnId);

    if (logEl) logEl.innerHTML = '';
    EXCEL[tipo] = null;
    if (btn) btn.disabled = true;

    if (!file) return;

    try {
      const { sheetName, rows } = await leerExcel(file);
      EXCEL[tipo] = { nombre: file.name, sheetName, rows };

      log(logId, `📄 <b>${file.name}</b>`);
      log(logId, `Hoja: <code>${sheetName}</code>`);
      log(logId, `Total de filas: <b>${rows.length}</b>`);

      if (autoFechaId) {
        const fecha = extraerFechaVencimiento(rows);
        if (fecha) {
          const input = $(autoFechaId);
          if (input && !input.value) {
            input.value = fecha;
            log(logId, `📅 Fecha detectada: <b>${fecha}</b>`);
          }
        }
      }

      if (btn) btn.disabled = false;
    } catch (err) {
      log(logId, `❌ Error al leer: ${err.message}`, 'error');
      console.error('[GamesUy] Error leyendo Excel:', err);
    }
  });
}

attachFileListener('excel-stock',    'stock',    'stock-log',    'btn-process-stock',    null);
attachFileListener('excel-ofertas',  'ofertas',  'ofertas-log',  'btn-process-ofertas',  'oferta-fecha-hasta');
attachFileListener('excel-preventas','preventas','preventas-log','btn-process-preventas',null);

// ============================================================
// STOCK
// ============================================================

function construirVariantesStock(fila) {
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

  if (tienePS4) {
    const costoARS = parseCosto(ps4PriRaw);
    variantes.push({
      id: 'ps4_primaria', label: 'PS4 Primaria', categoria: 'ps4', tipo: 'primaria',
      costoARS, disponible: esCostoValido(ps4PriRaw),
      gananciaPct: null, precioFinalUYU: null,
      enOferta: false, ofertaCostoARS: null, ofertaPrecioUYU: null, ofertaHasta: null
    });
  }

  if (tienePS5) {
    const costoARS = parseCosto(ps5PriRaw);
    variantes.push({
      id: 'ps5_primaria', label: 'PS5 Primaria', categoria: 'ps5', tipo: 'primaria',
      costoARS, disponible: esCostoValido(ps5PriRaw),
      gananciaPct: null, precioFinalUYU: null,
      enOferta: false, ofertaCostoARS: null, ofertaPrecioUYU: null, ofertaHasta: null
    });
  }

  if (!secNoDisp) {
    const costoSec = parseCosto(secRaw);
    const disponible = esCostoValido(secRaw);

    if (tienePS4) {
      variantes.push({
        id: 'ps4_secundaria', label: 'PS4 Secundaria', categoria: 'ps4', tipo: 'secundaria',
        costoARS: costoSec, disponible,
        gananciaPct: null, precioFinalUYU: null,
        enOferta: false, ofertaCostoARS: null, ofertaPrecioUYU: null, ofertaHasta: null
      });
    }
    if (tienePS5) {
      variantes.push({
        id: 'ps5_secundaria', label: 'PS5 Secundaria', categoria: 'ps5', tipo: 'secundaria',
        costoARS: costoSec, disponible,
        gananciaPct: null, precioFinalUYU: null,
        enOferta: false, ofertaCostoARS: null, ofertaPrecioUYU: null, ofertaHasta: null
      });
    }
  }

  return variantes;
}

function fusionarVarianteStock(varianteNueva, existente) {
  if (!existente) return varianteNueva;

  const costoViejo = Number(existente.costoARS) || 0;
  const costoNuevo = Number(varianteNueva.costoARS) || 0;
  const resultado = { ...existente };

  if (costoViejo === costoNuevo) {
    resultado.disponible = varianteNueva.disponible;
    return resultado;
  }

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

  if (costoViejo === 0 && costoNuevo > 0) {
    resultado.costoARS = costoNuevo;
    resultado.disponible = true;
    return resultado;
  }

  if (costoViejo > 0 && costoNuevo === 0) {
    resultado.costoARS = 0;
    resultado.disponible = false;
    return resultado;
  }

  return resultado;
}

async function procesarStock() {
  const excel = EXCEL.stock;
  if (!excel) {
    log('stock-log', '⚠ No hay Excel de Stock cargado.', 'error');
    return;
  }

  log('stock-log', '⏳ Leyendo productos existentes...');
  const snap = await getDocs(collection(db, 'products'));
  const productosMap = {};
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.matchKey) productosMap[data.matchKey] = { id: d.id, ...data };
  });
  log('stock-log', `✔ ${snap.size} productos encontrados en Firestore.`);

  const filas = excel.rows.slice(5);
  let creados = 0, actualizados = 0, saltados = 0;
  const operaciones = [];

  for (const fila of filas) {
    const titulo = String(fila[0] || '').trim();
    if (esFilaEncabezado(titulo)) { saltados++; continue; }

    const matchKey = normalizarTitulo(titulo);
    const variantesNuevas = construirVariantesStock(fila);

    if (variantesNuevas.length === 0) { saltados++; continue; }

    const existente = productosMap[matchKey];

    if (existente) {
      const variantesFinales = variantesNuevas.map(vn => {
        const ve = (existente.variants || []).find(v => v.id === vn.id);
        return fusionarVarianteStock(vn, ve);
      });

      const idsNuevos = new Set(variantesNuevas.map(v => v.id));
      (existente.variants || []).forEach(ve => {
        if (!idsNuevos.has(ve.id)) variantesFinales.push(ve);
      });

      const huboCambio = JSON.stringify(variantesFinales) !== JSON.stringify(existente.variants || []);
      if (huboCambio) {
        operaciones.push({
          ref: doc(db, 'products', existente.id),
          data: { variants: variantesFinales, updatedAt: new Date().toISOString() }
        });
        actualizados++;
      } else {
        saltados++;
      }
    } else {
      const categories = [];
      if (variantesNuevas.some(v => v.categoria === 'ps4')) categories.push('ps4');
      if (variantesNuevas.some(v => v.categoria === 'ps5')) categories.push('ps5');
      const promoRaw = String(fila[7] || '').trim().toUpperCase();
      const aplica3x2 = promoRaw === 'SI';

      operaciones.push({
        ref: doc(collection(db, 'products')),
        data: {
          title: titulo, matchKey, categories,
          coverUrl: '', gameplayUrl: '', youtubeUrl: '', description: '',
          isPreorder: false, releaseDate: '', visible: true, aplica3x2,
          variants: variantesNuevas,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
      creados++;
    }
  }

  log('stock-log', `⏳ Guardando ${operaciones.length} operaciones...`);
  await ejecutarBatches(operaciones, 'stock-log');

  log('stock-log', '');
  log('stock-log', '═══════════════════════════════════');
  log('stock-log', `✅ STOCK PROCESADO`);
  log('stock-log', `   🆕 Creados:      ${creados}`);
  log('stock-log', `   🔄 Actualizados: ${actualizados}`);
  log('stock-log', `   ⏭️  Saltados:     ${saltados}`);
  log('stock-log', '═══════════════════════════════════');

  alert(`✅ Stock procesado\n\nCreados: ${creados}\nActualizados: ${actualizados}\nSaltados: ${saltados}`);
}

// ============================================================
// OFERTAS
// ============================================================

async function procesarOfertas() {
  const excel = EXCEL.ofertas;
  if (!excel) {
    log('ofertas-log', '⚠ No hay Excel de Ofertas cargado.', 'error');
    return;
  }

  const fechaHasta = $('oferta-fecha-hasta').value;
  if (!fechaHasta) {
    log('ofertas-log', '⚠ Ingresá la fecha de vencimiento.', 'error');
    alert('Ingresá la fecha antes de procesar.');
    return;
  }

  log('ofertas-log', `📅 Válidas hasta: <b>${fechaHasta}</b>`);
  log('ofertas-log', '⏳ Leyendo productos existentes...');

  const snap = await getDocs(collection(db, 'products'));
  const productosMap = {};
  const productosMapRelajado = {};
  const productosMapSuperRelajado = {};

  snap.docs.forEach(d => {
    const data = d.data();
    if (data.matchKey) {
      productosMap[data.matchKey] = { id: d.id, ...data };
      const claveRel = crearClaveRelajada(data.matchKey);
      if (!productosMapRelajado[claveRel]) {
        productosMapRelajado[claveRel] = { id: d.id, ...data };
      }
      const claveSuper = crearClaveSúperRelajada(data.matchKey);
      if (!productosMapSuperRelajado[claveSuper]) {
        productosMapSuperRelajado[claveSuper] = { id: d.id, ...data };
      }
    }
  });
  log('ofertas-log', `✔ ${snap.size} productos en Firestore.`);

  let inicioIdx = 0;
  for (let i = 0; i < Math.min(excel.rows.length, 20); i++) {
    const fila = excel.rows[i];
    if (!fila) continue;
    const titulo = String(fila[0] || '').trim();
    const costo = parseCosto(fila[1]);
    if (titulo && costo > 0 && !esFilaEncabezado(titulo)) {
      inicioIdx = i;
      break;
    }
  }
  log('ofertas-log', `📌 Datos desde la fila ${inicioIdx + 1}`);

  const filas = excel.rows.slice(inicioIdx);
  const stats = { exacto: 0, relajado: 0, 'super-relajado': 0, fuzzy: 0, creados: 0 };
  let sinPrecio = 0, saltadas = 0;
  const operaciones = [];

  for (const fila of filas) {
    const tituloRaw = String(fila[0] || '').trim();
    if (esFilaEncabezado(tituloRaw)) { saltadas++; continue; }

    const costoOfertaARS = parseCosto(fila[1]);
    if (!costoOfertaARS) { sinPrecio++; continue; }

    const { titulo, plataformas } = parsearTituloOferta(tituloRaw);
    const matchKey = normalizarTitulo(titulo);

    const { prod, tipo } = buscarProducto(matchKey, productosMap, productosMapRelajado, productosMapSuperRelajado);

    if (prod) {
      let modificado = false;
      const nuevasVariantes = (prod.variants || []).map(v => {
        if (v.tipo !== 'primaria') return v;
        if (!plataformas.includes(v.categoria)) return v;

        const precioActual = Number(v.precioFinalUYU) || 0;
        const costoActual = Number(v.costoARS) || 0;

        let ofertaPrecioUYU = 0;
        if (precioActual > 0 && costoActual > 0) {
          const variacion = (costoOfertaARS / costoActual) - 1;
          ofertaPrecioUYU = roundUYU(precioActual * (1 + variacion));
        }

        modificado = true;
        return {
          ...v,
          enOferta: true,
          ofertaCostoARS: costoOfertaARS,
          ofertaPrecioUYU: ofertaPrecioUYU,
          ofertaHasta: fechaHasta
        };
      });

      if (modificado) {
        operaciones.push({
          ref: doc(db, 'products', prod.id),
          data: { variants: nuevasVariantes, updatedAt: new Date().toISOString() }
        });
        stats[tipo] = (stats[tipo] || 0) + 1;
      }
    } else {
      const categories = [...plataformas];

      const variantesNuevas = plataformas.map(plat => ({
        id: `${plat}_primaria`,
        label: `${plat.toUpperCase()} Primaria`,
        categoria: plat,
        tipo: 'primaria',
        costoARS: costoOfertaARS,
        disponible: true,
        gananciaPct: null,
        precioFinalUYU: null,
        enOferta: true,
        ofertaCostoARS: costoOfertaARS,
        ofertaPrecioUYU: 0,
        ofertaHasta: fechaHasta
      }));

      operaciones.push({
        ref: doc(collection(db, 'products')),
        data: {
          title: titulo,
          matchKey,
          categories,
          coverUrl: '', gameplayUrl: '', youtubeUrl: '', description: '',
          isPreorder: false, releaseDate: '', visible: true, soloOferta: true,
          variants: variantesNuevas,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
      stats.creados++;
    }
  }

  log('ofertas-log', `⏳ Guardando ${operaciones.length} operaciones...`);
  await ejecutarBatches(operaciones, 'ofertas-log');

  const totalAplicadas =
    (stats.exacto || 0) +
    (stats.relajado || 0) +
    (stats['super-relajado'] || 0) +
    (stats.fuzzy || 0);

  log('ofertas-log', '');
  log('ofertas-log', '═══════════════════════════════════');
  log('ofertas-log', `✅ OFERTAS PROCESADAS`);
  log('ofertas-log', `   🎯 Exactas:        ${stats.exacto || 0}`);
  log('ofertas-log', `   🎯 Relajadas:      ${stats.relajado || 0}`);
  log('ofertas-log', `   🎯 Súper relajadas: ${stats['super-relajado'] || 0}`);
  log('ofertas-log', `   🎯 Fuzzy:          ${stats.fuzzy || 0}`);
  log('ofertas-log', `   ─────────────────────`);
  log('ofertas-log', `   ✨ Total aplicadas: ${totalAplicadas}`);
  log('ofertas-log', `   🆕 CREADOS NUEVOS:  ${stats.creados}`);
  log('ofertas-log', `   ⏭️  Sin precio:      ${sinPrecio}`);
  log('ofertas-log', `   ⏭️  Saltadas:        ${saltadas}`);
  log('ofertas-log', '═══════════════════════════════════');

  alert(`✅ Ofertas procesadas\n\nAplicadas: ${totalAplicadas}\nCreados nuevos: ${stats.creados}`);
}

// ============================================================
// PREVENTAS
// ============================================================

/**
 * Excel de Preventas:
 *   col 0 (A) → JUEGO
 *   col 1 (B) → FECHA DE ESTRENO
 *   col 2 (C) → PRECIO PS5 PRIMARIA (ARS)
 *   col 3 (D) → USDT (ignorar)
 *   col 4 (E) → SECUNDARIA PESOS (ARS) - la ignoramos por ahora
 *   col 5 (F) → USDT SECUNDARIA (ignorar)
 */
async function procesarPreventas() {
  const excel = EXCEL.preventas;
  if (!excel) {
    log('preventas-log', '⚠ No hay Excel de Preventas cargado.', 'error');
    return;
  }

  log('preventas-log', '⏳ Leyendo productos existentes...');
  const snap = await getDocs(collection(db, 'products'));
  const productosMap = {};
  const productosMapRelajado = {};
  const productosMapSuperRelajado = {};

  snap.docs.forEach(d => {
    const data = d.data();
    if (data.matchKey) {
      productosMap[data.matchKey] = { id: d.id, ...data };
      const claveRel = crearClaveRelajada(data.matchKey);
      if (!productosMapRelajado[claveRel]) {
        productosMapRelajado[claveRel] = { id: d.id, ...data };
      }
      const claveSuper = crearClaveSúperRelajada(data.matchKey);
      if (!productosMapSuperRelajado[claveSuper]) {
        productosMapSuperRelajado[claveSuper] = { id: d.id, ...data };
      }
    }
  });
  log('preventas-log', `✔ ${snap.size} productos en Firestore.`);

  // Encontrar la primera fila con datos válidos
  let inicioIdx = 0;
  for (let i = 0; i < Math.min(excel.rows.length, 20); i++) {
    const fila = excel.rows[i];
    if (!fila) continue;
    const titulo = String(fila[0] || '').trim();
    const costo = parseCosto(fila[2]);
    if (titulo && costo > 0 && !esFilaEncabezado(titulo)) {
      inicioIdx = i;
      break;
    }
  }
  log('preventas-log', `📌 Datos desde la fila ${inicioIdx + 1}`);

  const filas = excel.rows.slice(inicioIdx);
  const stats = { exacto: 0, relajado: 0, 'super-relajado': 0, fuzzy: 0, creados: 0 };
  let sinCosto = 0, saltadas = 0;
  const operaciones = [];

  for (const fila of filas) {
    const tituloRaw = String(fila[0] || '').trim();
    if (esFilaEncabezado(tituloRaw)) { saltadas++; continue; }

    const fechaEstreno = parseFechaExcel(fila[1]);
    const costoPS5Primaria = parseCosto(fila[2]);

    if (!costoPS5Primaria) { sinCosto++; continue; }

    // Para preventas, el título viene sin sufijo PS4/PS5, lo limpiamos igual
    const { titulo } = parsearTituloOferta(tituloRaw);
    const matchKey = normalizarTitulo(titulo);

    const { prod, tipo } = buscarProducto(matchKey, productosMap, productosMapRelajado, productosMapSuperRelajado);

    if (prod) {
      // Ya existe → actualizar con info de preventa
      const variantesActualizadas = (prod.variants || []).map(v => {
        if (v.id === 'ps5_primaria') {
          return {
            ...v,
            costoARS: costoPS5Primaria,
            disponible: true,
            // actualizar fecha como oferta hasta
          };
        }
        return v;
      });

      // Si NO existía la variante ps5_primaria, la creamos
      const tienePS5 = (prod.variants || []).some(v => v.id === 'ps5_primaria');
      if (!tienePS5) {
        variantesActualizadas.push({
          id: 'ps5_primaria',
          label: 'PS5 Primaria',
          categoria: 'ps5',
          tipo: 'primaria',
          costoARS: costoPS5Primaria,
          disponible: true,
          gananciaPct: null,
          precioFinalUYU: null,
          enOferta: false,
          ofertaCostoARS: null,
          ofertaPrecioUYU: null,
          ofertaHasta: null
        });
      }

      const categories = new Set([...(prod.categories || []), 'ps5']);

      operaciones.push({
        ref: doc(db, 'products', prod.id),
        data: {
          variants: variantesActualizadas,
          categories: [...categories],
          isPreorder: true,
          releaseDate: fechaEstreno || prod.releaseDate || '',
          updatedAt: new Date().toISOString()
        }
      });
      stats[tipo] = (stats[tipo] || 0) + 1;
    } else {
      // No existe → crear como preventa
      const variantesNuevas = [{
        id: 'ps5_primaria',
        label: 'PS5 Primaria',
        categoria: 'ps5',
        tipo: 'primaria',
        costoARS: costoPS5Primaria,
        disponible: true,
        gananciaPct: null,
        precioFinalUYU: null,
        enOferta: false,
        ofertaCostoARS: null,
        ofertaPrecioUYU: null,
        ofertaHasta: null
      }];

      operaciones.push({
        ref: doc(collection(db, 'products')),
        data: {
          title: titulo,
          matchKey,
          categories: ['ps5'],
          coverUrl: '', gameplayUrl: '', youtubeUrl: '', description: '',
          isPreorder: true,
          releaseDate: fechaEstreno || '',
          visible: true,
          soloPreventa: true,
          variants: variantesNuevas,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
      stats.creados++;
    }
  }

  log('preventas-log', `⏳ Guardando ${operaciones.length} operaciones...`);
  await ejecutarBatches(operaciones, 'preventas-log');

  const totalAplicadas =
    (stats.exacto || 0) +
    (stats.relajado || 0) +
    (stats['super-relajado'] || 0) +
    (stats.fuzzy || 0);

  log('preventas-log', '');
  log('preventas-log', '═══════════════════════════════════');
  log('preventas-log', `✅ PREVENTAS PROCESADAS`);
  log('preventas-log', `   🎯 Exactas:        ${stats.exacto || 0}`);
  log('preventas-log', `   🎯 Relajadas:      ${stats.relajado || 0}`);
  log('preventas-log', `   🎯 Súper relajadas: ${stats['super-relajado'] || 0}`);
  log('preventas-log', `   🎯 Fuzzy:          ${stats.fuzzy || 0}`);
  log('preventas-log', `   ─────────────────────`);
  log('preventas-log', `   ✨ Total aplicadas: ${totalAplicadas}`);
  log('preventas-log', `   🆕 CREADOS NUEVOS:  ${stats.creados}`);
  log('preventas-log', `   ⏭️  Sin costo:       ${sinCosto}`);
  log('preventas-log', `   ⏭️  Saltadas:        ${saltadas}`);
  log('preventas-log', '═══════════════════════════════════');

  alert(`✅ Preventas procesadas\n\nAplicadas: ${totalAplicadas}\nCreados nuevos: ${stats.creados}`);
}

// ============================================================
// LIMPIAR OFERTAS VENCIDAS
// ============================================================

async function limpiarOfertasVencidas() {
  if (!confirm('¿Limpiar todas las ofertas cuya fecha de vencimiento ya pasó?')) return;

  const hoy = new Date().toISOString().split('T')[0];
  const snap = await getDocs(collection(db, 'products'));
  const operaciones = [];

  snap.docs.forEach(d => {
    const data = d.data();
    const variantes = data.variants || [];
    let modificado = false;

    const nuevasVariantes = variantes.map(v => {
      if (!v.enOferta) return v;
      if (!v.ofertaHasta) return v;
      if (v.ofertaHasta >= hoy) return v;

      modificado = true;
      return { ...v, enOferta: false, ofertaCostoARS: null, ofertaPrecioUYU: null, ofertaHasta: null };
    });

    if (modificado) {
      operaciones.push({
        ref: doc(db, 'products', d.id),
        data: { variants: nuevasVariantes, updatedAt: new Date().toISOString() }
      });
    }
  });

  if (operaciones.length === 0) {
    alert('No había ofertas vencidas para limpiar.');
    return;
  }

  log('ofertas-log', `⏳ Limpiando ${operaciones.length} ofertas vencidas...`);
  await ejecutarBatches(operaciones, 'ofertas-log');
  log('ofertas-log', `✅ ${operaciones.length} productos limpiados.`);
  alert(`✅ ${operaciones.length} productos actualizados.`);
}

// ============================================================
// BATCHES
// ============================================================

async function ejecutarBatches(operaciones, logId) {
  const TAM = 400;
  for (let i = 0; i < operaciones.length; i += TAM) {
    const lote = operaciones.slice(i, i + TAM);
    const batch = writeBatch(db);
    lote.forEach(op => batch.set(op.ref, op.data, { merge: true }));
    await batch.commit();
    log(logId, `  → Lote ${Math.floor(i / TAM) + 1} guardado (${lote.length} ops).`);
  }
}

// ============================================================
// BOTONES
// ============================================================

$('btn-process-stock')?.addEventListener('click', async () => {
  const btn = $('btn-process-stock');
  btn.disabled = true; btn.textContent = '⏳ Procesando...';
  try { await procesarStock(); }
  catch (err) { log('stock-log', `❌ ${err.message}`, 'error'); console.error(err); }
  finally { btn.disabled = false; btn.textContent = '📥 Procesar Stock'; }
});

$('btn-process-ofertas')?.addEventListener('click', async () => {
  const btn = $('btn-process-ofertas');
  btn.disabled = true; btn.textContent = '⏳ Procesando...';
  try { await procesarOfertas(); }
  catch (err) { log('ofertas-log', `❌ ${err.message}`, 'error'); console.error(err); }
  finally { btn.disabled = false; btn.textContent = '🔥 Procesar Ofertas'; }
});

$('btn-process-preventas')?.addEventListener('click', async () => {
  const btn = $('btn-process-preventas');
  btn.disabled = true; btn.textContent = '⏳ Procesando...';
  try { await procesarPreventas(); }
  catch (err) { log('preventas-log', `❌ ${err.message}`, 'error'); console.error(err); }
  finally { btn.disabled = false; btn.textContent = '🚀 Procesar Preventas'; }
});

$('btn-clean-ofertas')?.addEventListener('click', async () => {
  const btn = $('btn-clean-ofertas');
  btn.disabled = true; btn.textContent = '⏳ Limpiando...';
  try { await limpiarOfertasVencidas(); }
  catch (err) { log('ofertas-log', `❌ ${err.message}`, 'error'); console.error(err); }
  finally { btn.disabled = false; btn.textContent = '🧹 Limpiar ofertas vencidas'; }
});

console.log('[GamesUy] excel-importer.js v15 cargado (Preventas)');
