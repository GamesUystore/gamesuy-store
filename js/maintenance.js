// ============================================================
// GAMESUY STORE — Mantenimiento (v14)
// Incluye: Limpieza NGS + Buscador de Duplicados (TM/TR/Romanos)
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, getDocs, doc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

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
function logCleanClear() { const el = $('clean-log'); if (el) el.innerHTML = ''; }

function logNGS(html) {
  const el = $('clean-ngs-log');
  if (!el) return;
  el.innerHTML += `<div>${html}</div>`;
  el.scrollTop = el.scrollHeight;
}
function logNGSClear() { const el = $('clean-ngs-log'); if (el) el.innerHTML = ''; }

function logDup(html) {
  const el = $('dup-log');
  if (!el) return;
  el.innerHTML += `<div>${html}</div>`;
  el.scrollTop = el.scrollHeight;
}
function logDupClear() { const el = $('dup-log'); if (el) el.innerHTML = ''; }

// ============================================================
// NORMALIZACIÓN PARA DUPLICADOS (Super Agresiva)
// ============================================================
function limpiarParaDedupe(str) {
  let limpio = String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/â„¢|Â®|Â©/g, '')
    .replace(/\((tm|tr|r|c)\)/gi, '')
    .replace(/\b(tm|tr)\b/gi, '') 
    .replace(/[“”«»"'‘’]/g, '')
    .replace(/[:\-–—.,;!?()\[\]{}]/g, ' ') 
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const romanoAArábigo = {
    ' ii': ' 2', ' iii': ' 3', ' iv': ' 4', ' vi': ' 6', ' vii': ' 7', ' viii': ' 8'
  };
  for (const [romano, arabigo] of Object.entries(romanoAArábigo)) {
    const regex = new RegExp(romano + '\\b', 'g');
    limpio = limpio.replace(regex, arabigo);
  }
  return limpio;
}

// ============================================================
// NORMALIZACIÓN PARA NGS
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
  if (tokensFS.size < 1) return null;
  let mejorScore = 0;
  for (const mkNGS of matchKeysNGS) {
    const tokensNGS = tokensDe(mkNGS);
    if (tokensNGS.size < 1) continue;
    let comunes = 0;
    for (const t of tokensFS) if (tokensNGS.has(t)) comunes++;
    const maxTokens = Math.max(tokensFS.size, tokensNGS.size);
    const score = comunes / maxTokens;
    if (score > mejorScore) mejorScore = score;
    if (mejorScore >= 0.9) return 'fuzzy';
  }
  return null;
}
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
        const workbook = XLSX.read(data, { type: 'array', cellText: true, cellDates: false, raw: false, codepage: 65001 });
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
  btn.disabled = true; btn.textContent = '⏳ Analizando...';
  logCleanClear(); logClean('🔍 Leyendo productos...');
  try {
    const snap = await getDocs(collection(db, 'products'));
    productosABorrar = [];
    snap.docs.forEach(d => {
      const data = d.data();
      if (!data.matchKey || !String(data.matchKey).trim()) {
        productosABorrar.push({ id: d.id, title: data.title || '(sin título)' });
      }
    });
    logClean(`📊 Total: ${snap.size} | 🗑️ A borrar: <b>${productosABorrar.length}</b>`);
    if (productosABorrar.length > 0) {
      analizado = true; tipoAnalisis = 'sin-matchkey';
      $('clean-confirm').disabled = false; $('clean-confirm').value = ''; $('btn-do-clean').disabled = true;
      logClean('✍️ Escribí BORRAR para habilitar.');
    }
  } catch (err) { logClean(`❌ Error: ${err.message}`); }
  finally { btn.disabled = false; btn.textContent = '🔍 Analizar sin matchKey'; }
});

$('clean-confirm')?.addEventListener('input', (e) => {
  $('btn-do-clean').disabled = e.target.value.trim().toUpperCase() !== 'BORRAR';
});

$('btn-do-clean')?.addEventListener('click', async () => {
  if (!analizado || productosABorrar.length === 0) return;
  const btn = $('btn-do-clean');
  btn.disabled = true; btn.textContent = '⏳ Borrando...';
  try {
    const batch = writeBatch(db);
    productosABorrar.forEach(p => batch.delete(doc(db, 'products', p.id)));
    await batch.commit();
    alert(`✅ ${productosABorrar.length} productos eliminados.`);
    productosABorrar = []; analizado = false;
    $('clean-confirm').value = ''; $('clean-confirm').disabled = true; $('btn-do-clean').disabled = true;
    logCleanClear();
  } catch (err) { alert('❌ Error: ' + err.message); btn.disabled = false; }
  finally { btn.textContent = '🗑️ Borrar productos'; }
});

// ============================================================
// INYECTAR: CARD NGS
// ============================================================
function inyectarCardNGS() {
  const grid = document.querySelector('[data-tab-content="mantenimiento"] .admin-grid');
  if (!grid || document.getElementById('clean-ngs-card')) return;

  grid.insertAdjacentHTML('beforeend', `
    <div class="admin-card admin-card-wide admin-card-danger" id="clean-ngs-card">
      <h3>🗑️ Eliminar productos que NO están en el Excel de NGS actual</h3>
      <p class="admin-help">Subí el Excel de STOCK de NGS. Solo se conservarán los productos que coincidan EXACTAMENTE con el Excel.</p>
      <input type="file" id="clean-ngs-file" accept=".xlsx,.xls" class="admin-file">
      <div id="clean-ngs-log" class="import-log"><em>Esperando Excel de NGS...</em></div>
      <div class="admin-actions">
        <button id="btn-analyze-ngs" class="btn btn-warning" disabled>🔍 Analizar productos fuera del Excel</button>
        <button id="btn-download-ngs" class="btn btn-secondary" disabled>📥 Descargar lista completa (.txt)</button>
        <button id="btn-do-clean-ngs" class="btn btn-danger" disabled>🗑️ Borrar productos</button>
      </div>
      <label class="admin-label" style="margin-top:16px;">Escribí <code>BORRAR</code> para confirmar:</label>
      <input type="text" id="clean-ngs-confirm" placeholder="BORRAR" autocomplete="off" disabled>
    </div>
  `);
  activarListenersNGS();
}

// ============================================================
// LISTENERS NGS
// ============================================================
function activarListenersNGS() {
  $('clean-ngs-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    logNGSClear(); matchKeysNGS = null; productosNoNGS = [];
    $('btn-analyze-ngs').disabled = true; $('btn-do-clean-ngs').disabled = true; $('btn-download-ngs').disabled = true;
    $('clean-ngs-confirm').disabled = true; $('clean-ngs-confirm').value = '';
    logNGS(`📄 Leyendo <b>${file.name}</b>...`);
    try {
      const { sheetName, rows } = await leerExcelSimple(file);
      let inicioIdx = 4;
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const fila = rows[i] || [];
        for (const celda of fila) {
          const txt = String(celda || '').toUpperCase();
          if (txt.includes('PRIMARIA PS4') || txt.includes('PRIMARIA PS5')) { inicioIdx = i + 1; break; }
        }
      }
      const set = new Set();
      let filasOk = 0, filasSkip = 0;
      for (let i = inicioIdx; i < rows.length; i++) {
        const titulo = String(rows[i][0] || '').trim();
        if (esFilaEncabezadoNGS(titulo)) { filasSkip++; continue; }
        if (titulo.length < 2) { filasSkip++; continue; }
        set.add(limpiarParaComparar(titulo)); filasOk++;
      }
      matchKeysNGS = set;
      logNGS(`Hoja: <code>${sheetName}</code> | Total filas: <b>${rows.length}</b>`);
      logNGS(`✅ Válidos: <b>${filasOk}</b> | 📌 Únicos: <b>${set.size}</b> | ⏭️ Saltados: <b>${filasSkip}</b>`);
      if (set.size < 20) { logNGS('⚠️ Muy pocos títulos válidos.'); return; }
      logNGS('Ahora clic en <b>🔍 Analizar</b>.');
      $('btn-analyze-ngs').disabled = false;
    } catch (err) { logNGS(`❌ Error: ${err.message}`); }
  });

  $('btn-analyze-ngs')?.addEventListener('click', async () => {
    if (!matchKeysNGS || matchKeysNGS.size === 0) return;
    const btn = $('btn-analyze-ngs'); btn.disabled = true; btn.textContent = '⏳...';
    try {
      logNGS('<br>🔍 Leyendo Firestore...');
      const snap = await getDocs(collection(db, 'products'));
      productosNoNGS = [];
      let pres = 0, exactos = 0, fuzzy = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.manual === true) { pres++; return; }
        const base = data.matchKey || data.title || '';
        const tipo = matcheaConNGS(base, matchKeysNGS);
        if (tipo === 'exacto') exactos++;
        else if (tipo === 'fuzzy') fuzzy++;
        else productosNoNGS.push({ id: d.id, title: data.title || '(sin título)' });
      });
      logNGS(`📊 Total: <b>${snap.size}</b> | 🔒 Manuales: <b>${pres}</b> | ✅ Exactos: <b>${exactos}</b> | 🎯 Fuzzy: <b>${fuzzy}</b> | 🗑️ A borrar: <b>${productosNoNGS.length}</b>`);
      if (productosNoNGS.length > 0) {
        $('clean-ngs-confirm').disabled = false; $('clean-ngs-confirm').value = '';
        $('btn-download-ngs').disabled = false;
        logNGS('📥 <b>Recomendado:</b> Descargá la lista antes de borrar.');
      }
    } catch (err) { logNGS(`❌ Error: ${err.message}`); }
    finally { btn.disabled = false; btn.textContent = '🔍 Analizar productos fuera del Excel'; }
  });

  $('btn-download-ngs')?.addEventListener('click', () => {
    if (productosNoNGS.length === 0) return;
    const hoy = new Date().toISOString().split('T')[0];
    let txt = `GAMESUY - FUERA DE NGS\nTotal: ${productosNoNGS.length}\n${'='.repeat(40)}\n\n`;
    productosNoNGS.forEach((p, i) => txt += `${String(i + 1).padStart(4, '0')}. ${p.title}\n`);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `fuera-NGS-${hoy}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });

  $('clean-ngs-confirm')?.addEventListener('input', (e) => {
    $('btn-do-clean-ngs').disabled = e.target.value.trim().toUpperCase() !== 'BORRAR';
  });

  $('btn-do-clean-ngs')?.addEventListener('click', async () => {
    if (productosNoNGS.length === 0) return;
    if (!confirm(`¿Borrar ${productosNoNGS.length} productos?`)) return;
    const btn = $('btn-do-clean-ngs'); btn.disabled = true; btn.textContent = '⏳...';
    try {
      const batch = writeBatch(db);
      productosNoNGS.forEach(p => batch.delete(doc(db, 'products', p.id)));
      await batch.commit();
      alert(`✅ ${productosNoNGS.length} eliminados.`);
      productosNoNGS = []; matchKeysNGS = null; logNGSClear(); $('clean-ngs-file').value = '';
      $('clean-ngs-confirm').value = ''; $('clean-ngs-confirm').disabled = true;
    } catch (err) { alert('❌ Error: ' + err.message); btn.disabled = false; }
    finally { btn.textContent = '🗑️ Borrar productos'; }
  });
}

// ============================================================
// INYECTAR: CARD DUPLICADOS
// ============================================================
function inyectarCardDuplicados() {
  const grid = document.querySelector('[data-tab-content="mantenimiento"] .admin-grid');
  if (!grid || document.getElementById('dup-card')) return;

  grid.insertAdjacentHTML('beforeend', `
    <div class="admin-card admin-card-wide admin-card-danger" id="dup-card" style="border-color: #ffb800;">
      <h3 style="color: #ffb800;">👯 Buscar Duplicados (Ignora TM, TR, II, 2)</h3>
      <p class="admin-help">Detecta juegos que parecen iguales ignorando símbolos de marca y números romanos.</p>
      <div id="dup-log" class="import-log"><em>Click en "Buscar duplicados".</em></div>
      <div class="admin-actions">
        <button id="btn-find-dups" class="btn btn-warning">🔍 Buscar duplicados</button>
        <button id="btn-do-clean-dups" class="btn btn-danger" disabled>🗑️ Borrar seleccionados</button>
      </div>
    </div>
  `);
  activarListenersDuplicados();
}

// ============================================================
// LISTENERS DUPLICADOS
// ============================================================
function activarListenersDuplicados() {
  let duplicadosAEncontrados = [];

  $('btn-find-dups')?.addEventListener('click', async () => {
    const btn = $('btn-find-dups'); btn.disabled = true; btn.textContent = '⏳...';
    logDupClear(); logDup('🔍 Buscando duplicados...');
    try {
      const snap = await getDocs(collection(db, 'products'));
      const mapa = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const key = limpiarParaDedupe(data.title);
        if (!mapa[key]) mapa[key] = [];
        mapa[key].push({
          id: d.id, title: data.title,
          hasPrice: (data.variants || []).some(v => Number(v.precioFinalUYU) > 0)
        });
      });

      const grupos = Object.values(mapa).filter(g => g.length > 1);
      duplicadosAEncontrados = [];

      if (grupos.length === 0) { logDup('<br>🎉 ¡No hay duplicados!'); return; }

      logDup(`<br>🚨 Se encontraron <b>${grupos.length}</b> grupos:`);
      logDup('<hr style="border-color:#333; margin: 10px 0;">');

      grupos.forEach((grupo, index) => {
        logDup(`<div style="margin-bottom:15px; padding:10px; background:#111; border-radius:8px; border:1px solid #333;">`);
        logDup(`<strong style="color:#00f0ff;">Grupo ${index + 1}:</strong><br>`);
        
        grupo.sort((a, b) => (b.hasPrice === true) - (a.hasPrice === true));
        
        grupo.forEach((juego, i) => {
          const isSugerido = i > 0;
          const checked = isSugerido ? 'checked' : '';
          const labelColor = isSugerido ? '#ff8aa8' : '#00ff9d';
          const badge = juego.hasPrice ? ' <span style="color:#00ff9d; font-size:0.8rem;">(Tiene Precio)</span>' : ' <span style="color:#ffb800; font-size:0.8rem;">(Sin Precio)</span>';
          
          if (isSugerido) duplicadosAEncontrados.push(juego.id);

          logDup(`
            <label style="display:flex; align-items:center; gap:8px; color:${labelColor}; margin-top:6px; cursor:pointer;">
              <input type="checkbox" class="dup-check" data-id="${juego.id}" ${checked}>
              ${juego.title} ${badge}
            </label>
          `);
        });
        logDup(`</div>`);
      });

      const updateBtnState = () => {
        const checks = document.querySelectorAll('.dup-check:checked');
        duplicadosAEncontrados = Array.from(checks).map(c => c.dataset.id);
        $('btn-do-clean-dups').disabled = duplicadosAEncontrados.length === 0;
        $('btn-do-clean-dups').textContent = `🗑️ Borrar ${duplicadosAEncontrados.length} duplicados`;
      };

      document.querySelectorAll('.dup-check').forEach(chk => chk.addEventListener('change', updateBtnState));
      logDup('<br><span style="color:#ffb800;">⚠️ Revisá las casillas tildadas y luego tocá el botón rojo.</span>');
      updateBtnState();

    } catch (err) { logDup(`❌ Error: ${err.message}`); }
    finally { btn.disabled = false; btn.textContent = '🔍 Buscar duplicados'; }
  });

  $('btn-do-clean-dups')?.addEventListener('click', async () => {
    if (duplicadosAEncontrados.length === 0) return;
    if (!confirm(`¿Borrar ${duplicadosAEncontrados.length} duplicados?`)) return;
    const btn = $('btn-do-clean-dups'); btn.disabled = true; btn.textContent = '⏳...';
    try {
      const batch = writeBatch(db);
      duplicadosAEncontrados.forEach(id => batch.delete(doc(db, 'products', id)));
      await batch.commit();
      alert(`✅ ${duplicadosAEncontrados.length} duplicados eliminados.`);
      logDupClear(); logDup('✅ Limpieza completada.');
    } catch (err) { alert('❌ Error: ' + err.message); btn.disabled = false; }
  });
}

// ============================================================
// INIT
// ============================================================
inyectarCardNGS();
inyectarCardDuplicados();

console.log('[GamesUy] maintenance.js v14 cargado (NGS + Duplicados)');
