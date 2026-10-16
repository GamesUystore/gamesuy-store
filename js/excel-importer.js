// ============================================================
// GAMESUY STORE — Importador de Excel (formato NEO GAMING STORE)
// Fase 4.5: Soporta Stock NGS + Ofertas NGS
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, getDocs, doc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  parseCosto, esCostoValido, aplicarVariacion, roundUYU
} from './data-model.js';
import { crearPendiente } from './pendientes.js';

const $ = (id) => document.getElementById(id);

const EXCEL = { stock: null, ofertas: null, preventas: null };
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
  t = t.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s💎]+/u, '');
  t = t.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}💎]/gu, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function normalizarTitulo(titulo) {
  return String(titulo || '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s💎]+/u, '')
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
  return String(str || '').toLowerCase()
    .replace(/[™®©]/g, '').replace(/[:\-–—.,;!?'"()\[\]{}]/g, ' ')
    .replace(/[\uFE0E\uFE0F]/g, '').replace(/\s+/g, ' ').trim();
}

function crearClaveSúperRelajada(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '').replace(/[:\-–—.,;!?'"()\[\]{}]/g, ' ')
    .replace(/[\uFE0E\uFE0F]/g, '').replace(PALABRAS_IDIOMA, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ============================================================
// DETECCIÓN DE ESTRUCTURA
// ============================================================
function encontrarInicioDatos(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const fila = rows[i] || [];
    for (const celda of fila) {
      const txt = String(celda || '').toUpperCase();
      if (txt.includes('PRIMARIA PS4') || txt.includes('PRIMARIA PS5')) {
        return i + 1;
      }
    }
  }
  return 4;
}

function encontrarInicioOfertas(rows) {
  // Buscar la primera fila que tenga un precio numérico en columna B
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const fila = rows[i] || [];
    const titulo = String(fila[0] || '');
    const precio = parseCosto(fila[1]);
    if (titulo && precio > 0 && !/OFERTAS|DESTACADAS|PRECIOS|CONSULTAR|SECUNDARIA|^▬|^$/i.test(titulo)) {
      return i;
    }
  }
  return 7; // fallback
}

function esFilaEncabezado(titulo) {
  const t = String(titulo || '').trim();
  if (!t) return true;
  const upper = t.toUpperCase();
  if (upper === 'JUEGO' || upper === 'NEO GAMING STORE') return true;
  if (/^LISTADO|^PRECIOS EN PESOS|^SI EL JUEGO|^NO DISPONIBLE/i.test(t)) return true;
  if (/OFERTAS|DESTACADAS|^▬+|^━+|PRECIOS|CONSULTAR|SECUNDARIA|^🎮|^🔥|^💎\s*$/i.test(t)) return true;
  return false;
}

// ============================================================
// PARSEO STOCK NGS
// ============================================================
function parsearValorNGS(raw) {
  if (raw === null || raw === undefined) return { tipo: 'sin_stock', valor: 0 };
  const s = String(raw).trim().toUpperCase();
  if (!s) return { tipo: 'sin_stock', valor: 0 };
  if (/^NO\s*DISPONIBLE/i.test(s)) return { tipo: 'no_disponible', valor: 0 };
  if (/^SIN\s*STOCK/i.test(s)) return { tipo: 'sin_stock', valor: 0 };

  const limpio = String(raw).replace(/[^0-9.,]/g, '').replace(',', '.');
  const num = parseFloat(limpio);
  if (!isNaN(num) && num > 0) return { tipo: 'costo', valor: num };
  return { tipo: 'sin_stock', valor: 0 };
}

function construirVariantesNGS(fila) {
  const defs = [
    { id: 'ps4_primaria',   label: 'PS4 Primaria',   categoria: 'ps4', tipo: 'primaria',   col: 1 },
    { id: 'ps4_secundaria', label: 'PS4 Secundaria', categoria: 'ps4', tipo: 'secundaria', col: 2 },
    { id: 'ps5_primaria',   label: 'PS5 Primaria',   categoria: 'ps5', tipo: 'primaria',   col: 3 },
    { id: 'ps5_secundaria', label: 'PS5 Secundaria', categoria: 'ps5', tipo: 'secundaria', col: 4 }
  ];

  const variantes = [];
  for (const def of defs) {
    const parseado = parsearValorNGS(fila[def.col]);
    if (parseado.tipo === 'no_disponible') continue;
    const disponible = parseado.tipo === 'costo' && parseado.valor > 0;
    variantes.push({
      id: def.id,
      label: def.label,
      categoria: def.categoria,
      tipo: def.tipo,
      costoARS: disponible ? parseado.valor : 0,
      disponible: disponible,
      gananciaPct: null,
      precioFinalUYU: null,
      enOferta: false,
      ofertaCostoARS: null,
      ofertaPrecioUYU: null,
      ofertaHasta: null
    });
  }
  return variantes;
}

// ============================================================
// PARSEO OFERTAS NGS
// ============================================================
function extraerFechaOfertaNGS(rows) {
  for (const fila of rows.slice(0, 12)) {
    for (const celda of fila) {
      const txt = String(celda || '');
      const m = txt.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (m) {
        const d = m[1].padStart(2, '0');
        const mes = m[2].padStart(2, '0');
        return `${m[3]}-${mes}-${d}`;
      }
    }
  }
  return null;
}

function parsearTituloOfertaNGS(tituloRaw) {
  let t = limpiarTituloBase(tituloRaw);

  // Quitar guiones finales " -", " –", " —"
  t = t.replace(/\s*[-–—]\s*$/, '').trim();

  const plataformas = [];

  // Buscar "PS4" o "PS5" en cualquier parte del título
  const tienePS4 = /\bPS4\b/i.test(t);
  const tienePS5 = /\bPS5\b/i.test(t);

  if (tienePS4) plataformas.push('ps4');
  if (tienePS5) plataformas.push('ps5');

  // Si no menciona ninguna, asumimos ambas
  if (plataformas.length === 0) {
    plataformas.push('ps4', 'ps5');
  }

  // Quitar " PS4", " PS5" y variantes del título
  t = t.replace(/\s*[-–—]?\s*PS4\s*[-–—]?\s*/gi, ' ')
       .replace(/\s*[-–—]?\s*PS5\s*[-–—]?\s*/gi, ' ')
       .replace(/\s+/g, ' ')
       .trim();

  return { titulo: t, plataformas };
}

// ============================================================
// MATCHING
// ============================================================
function buscarFuzzy(matchKey, productosMap) {
  const palabrasExcel = quitarAcentos(matchKey).split(/\s+/).filter(w => w.length >= 3);
  if (palabrasExcel.length < 2) return null;
  const palabrasExcelSet = new Set(palabrasExcel);
  let mejorProd = null; let mejorScore = 0;
  for (const [key, prod] of Object.entries(productosMap)) {
    const palabrasStock = quitarAcentos(key).split(/\s+/).filter(w => w.length >= 3);
    if (palabrasStock.length < 2) continue;
    const palabrasStockSet = new Set(palabrasStock);
    let comunes = 0;
    for (const w of palabrasExcelSet) if (palabrasStockSet.has(w)) comunes++;
    if (comunes < 3) continue;
    const minTokens = Math.min(palabrasExcelSet.size, palabrasStockSet.size);
    const score = comunes / minTokens;
    if (score >= 0.85 && score > mejorScore) { mejorScore = score; mejorProd = prod; }
  }
  return mejorProd;
}

function buscarProducto(matchKey, m1, m2, m3) {
  if (m1[matchKey]) return { prod: m1[matchKey], tipo: 'exacto' };
  const claveRel = crearClaveRelajada(matchKey);
  if (m2[claveRel]) return { prod: m2[claveRel], tipo: 'relajado' };
  const claveSuper = crearClaveSúperRelajada(matchKey);
  if (m3[claveSuper]) return { prod: m3[claveSuper], tipo: 'super-relajado' };
  const prodFuzzy = buscarFuzzy(claveSuper, m3);
  if (prodFuzzy) return { prod: prodFuzzy, tipo: 'fuzzy' };
  return { prod: null, tipo: null };
}

// ============================================================
// FUSIÓN DE VARIANTES (STOCK)
// ============================================================
function fusionarVarianteNGS(nueva, existente) {
  if (!existente) return nueva;
  const costoViejo = Number(existente.costoARS) || 0;
  const costoNuevo = Number(nueva.costoARS) || 0;
  const resultado = { ...existente };

  if (costoViejo === costoNuevo) {
    resultado.disponible = nueva.disponible;
    return resultado;
  }
  if (costoViejo > 0 && costoNuevo > 0) {
    const variacion = (costoNuevo / costoViejo) - 1;
    const precioViejo = Number(resultado.precioFinalUYU) || 0;
    if (precioViejo > 0) resultado.precioFinalUYU = aplicarVariacion(precioViejo, variacion);
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

// ============================================================
// LISTENER
// ============================================================
function attachFileListener(inputId, tipo, logId, btnId) {
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
      if (btn) btn.disabled = false;
    } catch (err) {
      log(logId, `❌ Error al leer: ${err.message}`, 'error');
    }
  });
}

attachFileListener('excel-stock',    'stock',    'stock-log',    'btn-process-stock');
attachFileListener('excel-ofertas',  'ofertas',  'ofertas-log',  'btn-process-ofertas');
attachFileListener('excel-preventas','preventas','preventas-log','btn-process-preventas');

// ============================================================
// PROCESAR STOCK (formato NGS)
// ============================================================
async function procesarStock() {
  const excel = EXCEL.stock;
  if (!excel) { log('stock-log', '⚠ No hay Excel de Stock cargado.', 'error'); return; }

  const inicioIdx = encontrarInicioDatos(excel.rows);
  log('stock-log', `📌 Datos detectados desde la fila ${inicioIdx + 1}`);
  log('stock-log', '⏳ Leyendo productos existentes en Firestore...');

  const snap = await getDocs(collection(db, 'products'));
  const productosMap = {};
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.matchKey) productosMap[data.matchKey] = { id: d.id, ...data };
  });
  log('stock-log', `✔ ${snap.size} productos en la base.`);

  const filas = excel.rows.slice(inicioIdx);
  let creados = 0, actualizados = 0, saltados = 0;
  let sinStockTotal = 0, nuevasVariantes = 0;
  const operaciones = [];
  const pendientesACrear = [];

  for (const fila of filas) {
    const titulo = String(fila[0] || '').trim();
    if (esFilaEncabezado(titulo)) { saltados++; continue; }
    if (titulo.length < 2) { saltados++; continue; }

    const matchKey = normalizarTitulo(titulo);
    const variantesNuevas = construirVariantesNGS(fila);
    if (variantesNuevas.length === 0) { saltados++; continue; }

    variantesNuevas.forEach(v => { if (!v.disponible) sinStockTotal++; });

    const categories = [];
    if (variantesNuevas.some(v => v.categoria === 'ps4')) categories.push('ps4');
    if (variantesNuevas.some(v => v.categoria === 'ps5')) categories.push('ps5');

    const existente = productosMap[matchKey];

    if (existente) {
      const idsExistentes = new Set((existente.variants || []).map(v => v.id));
      const agregadas = variantesNuevas.filter(vn => !idsExistentes.has(vn.id));

      const variantesFinales = variantesNuevas.map(vn => {
        const ve = (existente.variants || []).find(v => v.id === vn.id);
        return fusionarVarianteNGS(vn, ve);
      });

      const idsNuevos = new Set(variantesNuevas.map(v => v.id));
      (existente.variants || []).forEach(ve => {
        if (!idsNuevos.has(ve.id)) variantesFinales.push(ve);
      });

      const huboCambio = JSON.stringify(variantesFinales) !== JSON.stringify(existente.variants || []);
      if (huboCambio) {
        operaciones.push({
          ref: doc(db, 'products', existente.id),
          data: {
            variants: variantesFinales,
            categories: [...new Set([...(existente.categories || []), ...categories])],
            updatedAt: new Date().toISOString()
          }
        });
        actualizados++;
        if (agregadas.length > 0) {
          nuevasVariantes += agregadas.length;
          pendientesACrear.push({
            productoId: existente.id,
            productoTitle: existente.title || titulo,
            tipo: 'variante_nueva',
            variantesNuevas: agregadas.map(v => ({ id: v.id, label: v.label, costoARS: v.costoARS })),
            origen: 'stock-ngs'
          });
        }
      } else { saltados++; }
    } else {
      const ref = doc(collection(db, 'products'));
      operaciones.push({
        ref,
        data: {
          title: titulo, matchKey, categories,
          coverUrl: '', gameplayUrl: '', youtubeUrl: '', description: '',
          isPreorder: false, releaseDate: '', visible: true,
          variants: variantesNuevas,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
      creados++;
      pendientesACrear.push({
        productoId: ref.id,
        productoTitle: titulo,
        tipo: 'juego_nuevo',
        variantesNuevas: variantesNuevas.map(v => ({ id: v.id, label: v.label, costoARS: v.costoARS })),
        origen: 'stock-ngs'
      });
    }
  }

  log('stock-log', `⏳ Guardando ${operaciones.length} operaciones...`);
  await ejecutarBatches(operaciones, 'stock-log');

  if (pendientesACrear.length > 0) {
    log('stock-log', `⏳ Creando ${pendientesACrear.length} alertas...`);
    for (const p of pendientesACrear) await crearPendiente(p);
  }

  log('stock-log', '');
  log('stock-log', '═══════════════════════════════════');
  log('stock-log', `✅ STOCK NGS PROCESADO`);
  log('stock-log', `   🆕 Creados:              ${creados}`);
  log('stock-log', `   🔄 Actualizados:         ${actualizados}`);
  log('stock-log', `   ✨ Variantes nuevas:     ${nuevasVariantes}`);
  log('stock-log', `   ⚫ Sin stock:            ${sinStockTotal}`);
  log('stock-log', `   🔔 Alertas creadas:      ${pendientesACrear.length}`);
  log('stock-log', `   ⏭️  Saltados:             ${saltados}`);
  log('stock-log', '═══════════════════════════════════');

  alert(`✅ Stock NGS procesado\n\nCreados: ${creados}\nActualizados: ${actualizados}\nVariantes nuevas: ${nuevasVariantes}`);
}

// ============================================================
// PROCESAR OFERTAS (formato NGS)
// ============================================================
async function procesarOfertas() {
  const excel = EXCEL.ofertas;
  if (!excel) { log('ofertas-log', '⚠ No hay Excel de Ofertas cargado.', 'error'); return; }

  // Detectar fecha del header si no está puesta
  let fechaHasta = $('oferta-fecha-hasta')?.value;
  if (!fechaHasta) {
    const autoFecha = extraerFechaOfertaNGS(excel.rows);
    if (autoFecha) {
      fechaHasta = autoFecha;
      const input = $('oferta-fecha-hasta');
      if (input) input.value = autoFecha;
      log('ofertas-log', `📅 Fecha detectada automáticamente: <b>${autoFecha}</b>`);
    }
  }
  if (!fechaHasta) {
    log('ofertas-log', '⚠ Ingresá la fecha de vencimiento (no la detecté en el Excel).', 'error');
    alert('Ingresá la fecha antes de procesar.'); return;
  }

  log('ofertas-log', `📅 Ofertas válidas hasta: <b>${fechaHasta}</b>`);
  log('ofertas-log', '⏳ Leyendo productos de Firestore...');

  const snap = await getDocs(collection(db, 'products'));
  const m1 = {}, m2 = {}, m3 = {};
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.matchKey) {
      m1[data.matchKey] = { id: d.id, ...data };
      const r = crearClaveRelajada(data.matchKey);
      if (!m2[r]) m2[r] = { id: d.id, ...data };
      const s = crearClaveSúperRelajada(data.matchKey);
      if (!m3[s]) m3[s] = { id: d.id, ...data };
    }
  });
  log('ofertas-log', `✔ ${snap.size} productos en la base.`);

  const inicioIdx = encontrarInicioOfertas(excel.rows);
  log('ofertas-log', `📌 Datos detectados desde la fila ${inicioIdx + 1}`);

  const filas = excel.rows.slice(inicioIdx);
  const stats = { exacto: 0, relajado: 0, 'super-relajado': 0, fuzzy: 0, sinMatch: 0 };
  let sinPrecio = 0, saltadas = 0, aplicadas = 0;
  const operaciones = [];
  const sinMatchTitulos = [];

  for (const fila of filas) {
    const tituloRaw = String(fila[0] || '').trim();
    if (!tituloRaw) { saltadas++; continue; }
    if (/OFERTAS|DESTACADAS|PRECIOS|CONSULTAR|SECUNDARIA|^▬|^━/i.test(tituloRaw)) { saltadas++; continue; }

    const costoOfertaARS = parseCosto(fila[1]);
    if (!costoOfertaARS) { sinPrecio++; continue; }

    const { titulo, plataformas } = parsearTituloOfertaNGS(tituloRaw);
    const matchKey = normalizarTitulo(titulo);

    const { prod, tipo } = buscarProducto(matchKey, m1, m2, m3);

    if (prod) {
      let modificado = false;
      const nuevasVariantes = (prod.variants || []).map(v => {
        // Solo modificamos variantes primarias de las plataformas indicadas
        if (v.tipo !== 'primaria') return v;
        if (!plataformas.includes(v.categoria)) return v;
        modificado = true;
        return {
          ...v,
          enOferta: true,
          ofertaCostoARS: costoOfertaARS,
          ofertaPrecioUYU: Number(v.ofertaPrecioUYU) || 0,
          ofertaHasta: fechaHasta
        };
      });

      if (modificado) {
        operaciones.push({
          ref: doc(db, 'products', prod.id),
          data: { variants: nuevasVariantes, updatedAt: new Date().toISOString() }
        });
        stats[tipo] = (stats[tipo] || 0) + 1;
        aplicadas++;
      } else {
        stats.sinMatch++;
        sinMatchTitulos.push(titulo);
      }
    } else {
      stats.sinMatch++;
      sinMatchTitulos.push(titulo);
    }
  }

  log('ofertas-log', `⏳ Guardando ${operaciones.length} operaciones...`);
  await ejecutarBatches(operaciones, 'ofertas-log');

  if (sinMatchTitulos.length > 0) {
    log('ofertas-log', '');
    log('ofertas-log', '<b>⚠️ Sin coincidencia (no están en el catálogo):</b>');
    sinMatchTitulos.slice(0, 30).forEach(t => log('ofertas-log', `  • ${t}`));
    if (sinMatchTitulos.length > 30) {
      log('ofertas-log', `  ... y ${sinMatchTitulos.length - 30} más`);
    }
  }

  log('ofertas-log', '');
  log('ofertas-log', '═══════════════════════════════════');
  log('ofertas-log', `✅ OFERTAS PROCESADAS`);
  log('ofertas-log', `   ✨ Total aplicadas:  ${aplicadas}`);
  log('ofertas-log', `   🎯 Match exacto:     ${stats.exacto || 0}`);
  log('ofertas-log', `   🎯 Match relajado:   ${stats.relajado || 0}`);
  log('ofertas-log', `   🎯 Match super-rel:  ${stats['super-relajado'] || 0}`);
  log('ofertas-log', `   🎯 Match fuzzy:      ${stats.fuzzy || 0}`);
  log('ofertas-log', `   ⚠️  Sin coincidencia: ${stats.sinMatch || 0}`);
  log('ofertas-log', `   ⏭️  Sin precio:       ${sinPrecio}`);
  log('ofertas-log', `   ⏭️  Saltadas:         ${saltadas}`);
  log('ofertas-log', '═══════════════════════════════════');

  alert(
    `✅ Ofertas procesadas\n\n` +
    `Aplicadas: ${aplicadas}\n` +
    `Sin coincidencia: ${stats.sinMatch || 0}\n\n` +
    `📅 Válidas hasta: ${fechaHasta}`
  );
}

// ============================================================
// PREVENTAS (placeholder)
// ============================================================
async function procesarPreventas() {
  const excel = EXCEL.preventas;
  if (!excel) { log('preventas-log', '⚠ No hay Excel de Preventas cargado.', 'error'); return; }
  log('preventas-log', '⚠️  El formato de preventas todavía no está adaptado. Avisame cuando tengas un Excel de preventas de NGS.');
  alert('Falta adaptar el formato. Avisame qué formato tiene.');
}

// ============================================================
// LIMPIAR OFERTAS VENCIDAS
// ============================================================
async function limpiarOfertasVencidas() {
  if (!confirm('¿Limpiar todas las ofertas vencidas?')) return;
  const hoy = new Date().toISOString().split('T')[0];
  const snap = await getDocs(collection(db, 'products'));
  const operaciones = [];

  snap.docs.forEach(d => {
    const data = d.data();
    let modificado = false;
    const nuevasVariantes = (data.variants || []).map(v => {
      if (!v.enOferta || !v.ofertaHasta || v.ofertaHasta >= hoy) return v;
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

  if (operaciones.length === 0) { alert('No había ofertas vencidas.'); return; }
  await ejecutarBatches(operaciones, 'ofertas-log');
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
  finally { btn.disabled = false; btn.textContent = '📥 Procesar Stock NGS'; }
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

console.log('[GamesUy] excel-importer.js v19 cargado (stock + ofertas NGS)');
