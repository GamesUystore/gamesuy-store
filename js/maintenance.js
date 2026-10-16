// ============================================================
// GAMESUY STORE — Mantenimiento
// Fase 3.5.6: Limpieza + borrado por fecha
// Fase 3.7: Eliminar productos no-NGS con FUZZY MATCH
// ============================================================

import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  doc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// ============================================================
// ESTADO
// ============================================================
let productosABorrar = [];
let analizado = false;
let tipoAnalisis = null;

let productosNoNGS = [];
let matchKeysNGS = null;

// ============================================================
// HELPERS DE LOG
// ============================================================
function logClean(html) {
  const el = $('clean-log');
  if (!el) return;
  el.innerHTML += `<div>${html}</div>`;
  el.scrollTop = el.scrollHeight;
}

function logCleanClear() {
  const el = $('clean-log');
  if (el) el.innerHTML = '';
}

function logNGS(html) {
  const el = $('clean-ngs-log');
  if (!el) return;
  el.innerHTML += `<div>${html}</div>`;
  el.scrollTop = el.scrollHeight;
}

function logNGSClear() {
  const el = $('clean-ngs-log');
  if (el) el.innerHTML = '';
}

// ============================================================
// NORMALIZACIÓN AGRESIVA PARA COMPARAR
// ============================================================
function limpiarParaComparar(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/[“”«»"'‘’]/g, '')
    .replace(/[:\-–—.,;!?()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokensDe(str) {
  const limpio = limpiarParaComparar(str);
  return new Set(limpio.split(/\s+/).filter(w => w.length >= 3));
}

function matcheaConNGS(mkFirestore, matchKeysNGS) {
  const limpioFS = limpiarParaComparar(mkFirestore);

  if (matchKeysNGS.has(limpioFS)) return 'exacto';

  const tokensFS = tokensDe(mkFirestore);
  if (tokensFS.size < 2) return null;

  let mejorScore = 0;
  for (const mkNGS of matchKeysNGS) {
    const tokensNGS = tokensDe(mkNGS);
    if (tokensNGS.size < 2) continue;

    let comunes = 0;
    for (const t of tokensFS) if (tokensNGS.has(t)) comunes++;

    const minTokens = Math.min(tokensFS.size, tokensNGS.size);
    const score = comunes / minTokens;
    if (score > mejorScore) mejorScore = score;
    if (mejorScore >= 0.75) return 'fuzzy';
  }
  return null;
}

// ============================================================
// HELPERS EXCEL
// ============================================================
function esFilaEncabezadoNGS(titulo) {
  const t = String(titulo || '').trim();
  if (!t) return true;
  const upper = t.toUpperCase();
  if (upper === 'JUEGO' || upper === 'NEO GAMING STORE') return true;
  if (/^LISTADO|^PRECIOS EN PESOS|^SI EL JUEGO|^NO DISPONIBLE/i.test(t)) return true;
  if (/OFERTAS|DESTACADAS|^▪+|^═+|PRECIOS|CONSULTAR|SECUNDARIA|^🎮|^🔥|^💎\s*$/i.test(t)) return true;
  return false;
}

function leerExcelSimple(file) {
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

// ============================================================
// EXISTENTE: ANALIZAR — sin matchKey
// ============================================================
$('btn-analyze-clean')?.addEventListener('click', async () => {
  const btn = $('btn-analyze-clean');
  btn.disabled = true;
  btn.textContent = '⏳ Analizando...';

  logCleanClear();
  logClean('🔍 Leyendo productos de Firestore...');

  try {
    const snap = await getDocs(collection(db, 'products'));
    productosABorrar = [];

    snap.docs.forEach(d => {
      const data = d.data();
      if (!data.matchKey || !String(data.matchKey).trim()) {
        productosABorrar.push({ id: d.id, title: data.title || '(sin título)' });
      }
    });

    logClean('');
    logClean(`📊 Total en Firestore: <b>${snap.size}</b>`);
    logClean(`✅ Productos con matchKey: <b>${snap.size - productosABorrar.length}</b>`);
    logClean(`🗑️  Productos SIN matchKey: <b>${productosABorrar.length}</b>`);

    if (productosABorrar.length === 0) {
      logClean('');
      logClean('🎉 No hay nada para borrar.');
      $('btn-do-clean').disabled = true;
      $('clean-confirm').disabled = true;
      return;
    }

    logClean('');
    logClean('<strong>Primeros 20 a borrar:</strong>');
    productosABorrar.slice(0, 20).forEach(p => logClean(`&nbsp;&nbsp;• ${p.title}`));
    if (productosABorrar.length > 20) {
      logClean(`&nbsp;&nbsp;... y ${productosABorrar.length - 20} más.`);
    }

    analizado = true;
    tipoAnalisis = 'sin-matchkey';
    $('clean-confirm').disabled = false;
    $('clean-confirm').value = '';
    $('btn-do-clean').disabled = true;

    logClean('');
    logClean('✍️  Para habilitar el borrado, escribí <b>BORRAR</b> en el campo de confirmación.');
  } catch (err) {
    console.error('[GamesUy] Error analizando:', err);
    logClean(`❌ Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Analizar';
  }
});

// ============================================================
// EXISTENTE: ANALIZAR — creados recientemente
// ============================================================
$('btn-analyze-recent')?.addEventListener('click', async () => {
  const btn = $('btn-analyze-recent');
  btn.disabled = true;
  btn.textContent = '⏳ Analizando...';

  logCleanClear();
  logClean('🔍 Leyendo productos creados en las últimas 3 horas...');

  try {
    const snap = await getDocs(collection(db, 'products'));
    productosABorrar = [];
    const ahora = Date.now();
    const TRES_HORAS = 3 * 60 * 60 * 1000;

    snap.docs.forEach(d => {
      const data = d.data();
      if (!data.createdAt) return;
      const creado = new Date(data.createdAt).getTime();
      if (isNaN(creado)) return;
      if (ahora - creado < TRES_HORAS) {
        productosABorrar.push({ id: d.id, title: data.title || '(sin título)' });
      }
    });

    logClean('');
    logClean(`📊 Total en Firestore: <b>${snap.size}</b>`);
    logClean(`🆕 Creados en las últimas 3 horas: <b>${productosABorrar.length}</b>`);

    if (productosABorrar.length === 0) {
      logClean('');
      logClean('🎉 No hay productos recientes para borrar.');
      $('btn-do-clean').disabled = true;
      $('clean-confirm').disabled = true;
      return;
    }

    logClean('');
    logClean('<strong>Primeros 30 productos recientes:</strong>');
    productosABorrar.slice(0, 30).forEach(p => logClean(`&nbsp;&nbsp;• ${p.title}`));
    if (productosABorrar.length > 30) {
      logClean(`&nbsp;&nbsp;... y ${productosABorrar.length - 30} más.`);
    }

    analizado = true;
    tipoAnalisis = 'recientes';
    $('clean-confirm').disabled = false;
    $('clean-confirm').value = '';
    $('btn-do-clean').disabled = true;

    logClean('');
    logClean('✍️  Para habilitar el borrado, escribí <b>BORRAR</b> en el campo de confirmación.');
  } catch (err) {
    console.error('[GamesUy] Error analizando recientes:', err);
    logClean(`❌ Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '⏰ Analizar recientes';
  }
});

// ============================================================
// EXISTENTE: CONFIRMACIÓN
// ============================================================
$('clean-confirm')?.addEventListener('input', (e) => {
  const val = e.target.value.trim().toUpperCase();
  $('btn-do-clean').disabled = val !== 'BORRAR';
});

// ============================================================
// EXISTENTE: BORRAR
// ============================================================
$('btn-do-clean')?.addEventListener('click', async () => {
  if (!analizado || productosABorrar.length === 0) return;

  const confirmacion = $('clean-confirm').value.trim().toUpperCase();
  if (confirmacion !== 'BORRAR') return;

  const modo = tipoAnalisis === 'recientes' ? 'productos recientes' : 'productos sin matchKey';

  if (!confirm(`⚠️ Vas a borrar ${productosABorrar.length} ${modo}.\n\nEsta acción NO se puede deshacer.\n\n¿Continuar?`)) {
    return;
  }

  const btn = $('btn-do-clean');
  btn.disabled = true;
  btn.textContent = '⏳ Borrando...';

  logClean('');
  logClean('🗑️  Iniciando borrado...');

  try {
    const TAM = 400;
    let borrados = 0;

    for (let i = 0; i < productosABorrar.length; i += TAM) {
      const lote = productosABorrar.slice(i, i + TAM);
      const batch = writeBatch(db);
      lote.forEach(p => batch.delete(doc(db, 'products', p.id)));
      await batch.commit();
      borrados += lote.length;
      logClean(`&nbsp;&nbsp;→ Borrados ${borrados} / ${productosABorrar.length}`);
    }

    logClean('');
    logClean(`✅ <strong>Limpieza completada. ${borrados} productos eliminados.</strong>`);

    productosABorrar = [];
    analizado = false;
    tipoAnalisis = null;
    $('clean-confirm').value = '';
    $('clean-confirm').disabled = true;
    $('btn-do-clean').disabled = true;

    alert(`✅ Limpieza completada.\n${borrados} productos eliminados.`);
  } catch (err) {
    console.error('[GamesUy] Error borrando:', err);
    logClean(`❌ Error: ${err.message}`);
    btn.disabled = false;
  } finally {
    btn.textContent = '🗑️ Borrar productos viejos';
  }
});

// ============================================================
// NGS: INYECTAR CARD EN EL TAB MANTENIMIENTO
// ============================================================
function inyectarCardNGS() {
  const grid = document.querySelector('[data-tab-content="mantenimiento"] .admin-grid');
  if (!grid) return;
  if (document.getElementById('clean-ngs-card')) return;

  grid.insertAdjacentHTML('beforeend', `
    <div class="admin-card admin-card-wide admin-card-danger" id="clean-ngs-card">
      <h3>🗑️ Eliminar productos que NO están en el Excel de NGS actual</h3>
      <p class="admin-help">
        Subí el Excel de STOCK de NGS. Solo se eliminarán los productos que <b>no coincidan de ninguna forma</b> con el Excel (match inteligente: ignora ™, ®, acentos, "Digital Edition", etc.).<br><br>
        <strong>🔒 Los productos creados manualmente NO se borran.</strong>
      </p>
      <input type="file" id="clean-ngs-file" accept=".xlsx,.xls" class="admin-file">
      <div id="clean-ngs-log" class="import-log"><em>Esperando Excel de NGS...</em></div>
      <div class="admin-actions">
        <button id="btn-analyze-ngs" class="btn btn-warning" disabled>🔍 Analizar productos fuera del Excel</button>
        <button id="btn-do-clean-ngs" class="btn btn-danger" disabled>🗑️ Borrar productos</button>
      </div>
      <label class="admin-label" style="margin-top:16px;">Escribí <code>BORRAR</code> para confirmar:</label>
      <input type="text" id="clean-ngs-confirm" placeholder="BORRAR" autocomplete="off" disabled>
    </div>
  `);

  activarListenersNGS();
}

// ============================================================
// NGS: ACTIVAR LISTENERS
// ============================================================
function activarListenersNGS() {

  // ---------- CARGAR EXCEL ----------
  $('clean-ngs-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    logNGSClear();
    matchKeysNGS = null;
    productosNoNGS = [];

    const btnAnalyze = $('btn-analyze-ngs');
    const btnDelete = $('btn-do-clean-ngs');
    const confirm = $('clean-ngs-confirm');
    if (btnAnalyze) btnAnalyze.disabled = true;
    if (btnDelete) btnDelete.disabled = true;
    if (confirm) { confirm.disabled = true; confirm.value = ''; }

    logNGS(`📄 Leyendo <b>${file.name}</b>...`);

    try {
      const { sheetName, rows } = await leerExcelSimple(file);

      let inicioIdx = 4;
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const fila = rows[i] || [];
        for (const celda of fila) {
          const txt = String(celda || '').toUpperCase();
          if (txt.includes('PRIMARIA PS4') || txt.includes('PRIMARIA PS5')) {
            inicioIdx = i + 1;
            break;
          }
        }
      }

      const set = new Set();
      let filasOk = 0, filasSkip = 0;

      for (let i = inicioIdx; i < rows.length; i++) {
        const titulo = String(rows[i][0] || '').trim();
        if (esFilaEncabezadoNGS(titulo)) { filasSkip++; continue; }
        if (titulo.length < 2) { filasSkip++; continue; }
        set.add(limpiarParaComparar(titulo));
        filasOk++;
      }

      matchKeysNGS = set;

      logNGS(`Hoja: <code>${sheetName}</code>`);
      logNGS(`Total de filas: <b>${rows.length}</b>`);
      logNGS(`✅ Títulos válidos en el Excel: <b>${filasOk}</b>`);
      logNGS(`📌 Títulos únicos (normalizados): <b>${set.size}</b>`);
      logNGS(`⏭️ Filas saltadas (encabezados): <b>${filasSkip}</b>`);

      if (set.size < 20) {
        logNGS('');
        logNGS('⚠️ <b>ATENCIÓN:</b> el Excel tiene muy pocos títulos válidos. Verificá que sea el archivo correcto.');
        return;
      }

      logNGS('');
      logNGS('Ahora hacé clic en <b>🔍 Analizar productos fuera del Excel</b>.');
      if (btnAnalyze) btnAnalyze.disabled = false;

    } catch (err) {
      logNGS(`❌ Error al leer el Excel: ${err.message}`);
      console.error(err);
    }
  });

  // ---------- ANALIZAR ----------
  $('btn-analyze-ngs')?.addEventListener('click', async () => {
    if (!matchKeysNGS || matchKeysNGS.size === 0) {
      alert('Primero cargá el Excel de NGS.');
      return;
    }

    const btn = $('btn-analyze-ngs');
    btn.disabled = true;
    btn.textContent = '⏳ Analizando...';

    try {
      logNGS('');
      logNGS('🔍 Leyendo todos los productos de Firestore...');

      const snap = await getDocs(collection(db, 'products'));
      productosNoNGS = [];
      let preservadosManuales = 0;
      let exactos = 0;
      let fuzzy = 0;

      snap.docs.forEach(d => {
        const data = d.data();

        if (data.manual === true) {
          preservadosManuales++;
          return;
        }

        const mk = data.matchKey || '';
        const base = mk || data.title || '';
        if (!base) {
          productosNoNGS.push({ id: d.id, title: data.title || '(sin título)', razon: 'sin datos' });
          return;
        }

        const tipo = matcheaConNGS(base, matchKeysNGS);

        if (tipo === 'exacto') {
          exactos++;
        } else if (tipo === 'fuzzy') {
          fuzzy++;
        } else {
          productosNoNGS.push({
            id: d.id,
            title: data.title || '(sin título)',
            razon: 'sin coincidencia'
          });
        }
      });

      logNGS(`📊 Total en Firestore: <b>${snap.size}</b>`);
      logNGS(`🔒 Manuales preservados: <b>${preservadosManuales}</b>`);
      logNGS(`✅ Match exacto con NGS: <b>${exactos}</b>`);
      logNGS(`🎯 Match fuzzy con NGS: <b>${fuzzy}</b> (NO se borran)`);
      logNGS(`🗑️  SIN coincidencia (a borrar): <b>${productosNoNGS.length}</b>`);

      if (productosNoNGS.length === 0) {
        logNGS('');
        logNGS('🎉 ¡Perfecto! No hay productos para borrar.');
        return;
      }

      logNGS('');
      logNGS('<strong>Primeros 40 a borrar:</strong>');
      productosNoNGS.slice(0, 40).forEach(p => {
        logNGS(`&nbsp;&nbsp;• ${p.title}`);
      });
      if (productosNoNGS.length > 40) {
        logNGS(`&nbsp;&nbsp;... y ${productosNoNGS.length - 40} más.`);
      }

      const confirm = $('clean-ngs-confirm');
      const btnDelete = $('btn-do-clean-ngs');
      if (confirm) { confirm.disabled = false; confirm.value = ''; }
      if (btnDelete) btnDelete.disabled = true;

      logNGS('');
      logNGS('✍️  Para borrarlos, escribí <b>BORRAR</b> en el campo de confirmación.');

    } catch (err) {
      console.error('[GamesUy] Error analizando NGS:', err);
      logNGS(`❌ Error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 Analizar productos fuera del Excel';
    }
  });

  // ---------- CONFIRMACIÓN ----------
  $('clean-ngs-confirm')?.addEventListener('input', (e) => {
    const val = e.target.value.trim().toUpperCase();
    const btn = $('btn-do-clean-ngs');
    if (btn) btn.disabled = val !== 'BORRAR';
  });

  // ---------- BORRAR ----------
  $('btn-do-clean-ngs')?.addEventListener('click', async () => {
    if (productosNoNGS.length === 0) return;

    const confirmacion = $('clean-ngs-confirm').value.trim().toUpperCase();
    if (confirmacion !== 'BORRAR') return;

    if (!confirm(`⚠️ Vas a borrar ${productosNoNGS.length} productos.\n\nEsta acción NO se puede deshacer.\n\n¿Continuar?`)) {
      return;
    }

    const btn = $('btn-do-clean-ngs');
    btn.disabled = true;
    btn.textContent = '⏳ Borrando...';

    try {
      logNGS('');
      logNGS('🗑️  Iniciando borrado...');

      const TAM = 400;
      let borrados = 0;

      for (let i = 0; i < productosNoNGS.length; i += TAM) {
        const lote = productosNoNGS.slice(i, i + TAM);
        const batch = writeBatch(db);
        lote.forEach(p => batch.delete(doc(db, 'products', p.id)));
        await batch.commit();
        borrados += lote.length;
        logNGS(`&nbsp;&nbsp;→ Borrados ${borrados} / ${productosNoNGS.length}`);
      }

      logNGS('');
      logNGS(`✅ <strong>Limpieza completada. ${borrados} productos eliminados.</strong>`);

      productosNoNGS = [];
      matchKeysNGS = null;
      const confirm = $('clean-ngs-confirm');
      if (confirm) { confirm.value = ''; confirm.disabled = true; }
      const fileInput = $('clean-ngs-file');
      if (fileInput) fileInput.value = '';

      alert(`✅ Limpieza completada.\n${borrados} productos eliminados.`);
    } catch (err) {
      console.error('[GamesUy] Error borrando:', err);
      logNGS(`❌ Error: ${err.message}`);
      btn.disabled = false;
    } finally {
      btn.textContent = '🗑️ Borrar productos';
    }
  });
}

// ============================================================
// INIT
// ============================================================
inyectarCardNGS();

console.log('[GamesUy] maintenance.js v8 cargado (con fuzzy match)');
