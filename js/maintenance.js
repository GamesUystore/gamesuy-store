// ============================================================
// GAMESUY STORE — Mantenimiento
// Fase 3.12: Buscador de duplicados (TM/TR/Romanos super agresivo)
// ============================================================

import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  doc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let productosABorrar = [];
let analizado = false;
let tipoAnalisis = null;

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

function logDup(html) {
  const el = $('dup-log');
  if (!el) return;
  el.innerHTML += `<div>${html}</div>`;
  el.scrollTop = el.scrollHeight;
}
function logDupClear() { const el = $('dup-log'); if (el) el.innerHTML = ''; }

// ============================================================
// NORMALIZACIÓN AVANZADA (Para detectar duplicados)
// ============================================================
function limpiarParaDedupe(str) {
  let limpio = String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quita acentos
    .replace(/[\uFE0E\uFE0F]/g, '')
    
    // 1. Quita símbolos de marca y sus variantes rotas de Excel
    .replace(/[™®©]/g, '')
    .replace(/â„¢|Â®|Â©/g, '') // Encoding roto común de Excel
    
    // 2. Quita TM, TR, R, C (con o sin paréntesis) que estén como texto
    .replace(/\((tm|tr|r|c)\)/gi, '')
    .replace(/\b(tm|tr)\b/gi, '') 
    
    // 3. Quita puntuación y comillas
    .replace(/[“”«»"'‘’]/g, '')
    .replace(/[:\-–—.,;!?()\[\]{}]/g, ' ') 
    
    // 4. Limpia espacios extra y pasa a minúsculas
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // 5. Reemplazos de números romanos a arábigos (para el final de la cadena)
  const romanoAArábigo = {
    ' ii': ' 2',
    ' iii': ' 3',
    ' iv': ' 4',
    ' vi': ' 6',
    ' vii': ' 7',
    ' viii': ' 8'
  };

  for (const [romano, arabigo] of Object.entries(romanoAArábigo)) {
    const regex = new RegExp(romano + '\\b', 'g');
    limpio = limpio.replace(regex, arabigo);
  }

  return limpio;
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
// NUEVO: BUSCAR DUPLICADOS (Números romanos + TM/TR)
// ============================================================
function inyectarCardDuplicados() {
  const grid = document.querySelector('[data-tab-content="mantenimiento"] .admin-grid');
  if (!grid) return;
  if (document.getElementById('dup-card')) return;

  grid.insertAdjacentHTML('beforeend', `
    <div class="admin-card admin-card-wide admin-card-danger" id="dup-card" style="border-color: #ffb800;">
      <h3 style="color: #ffb800;">👯 Buscar Duplicados (Ignora TM, TR, II, 2)</h3>
      <p class="admin-help">
        Detecta juegos que parecen iguales ignorando símbolos de marca y números romanos.<br>
        Muestra las coincidencias para que elijas cuál borrar.
      </p>
      <div id="dup-log" class="import-log"><em>Click en "Buscar duplicados".</em></div>
      <div class="admin-actions">
        <button id="btn-find-dups" class="btn btn-warning">🔍 Buscar duplicados</button>
        <button id="btn-do-clean-dups" class="btn btn-danger" disabled>🗑️ Borrar los seleccionados</button>
      </div>
    </div>
  `);

  activarListenersDuplicados();
}

function activarListenersDuplicados() {
  let duplicadosAEncontrados = []; // Guarda los IDs que el usuario tilda para borrar

  $('btn-find-dups')?.addEventListener('click', async () => {
    const btn = $('btn-find-dups');
    btn.disabled = true; btn.textContent = '⏳ Analizando...';
    logDupClear();
    logDup('🔍 Buscando juegos duplicados en la base de datos...');

    try {
      const snap = await getDocs(collection(db, 'products'));
      const mapa = {}; // Agrupa por título normalizado

      snap.docs.forEach(d => {
        const data = d.data();
        const key = limpiarParaDedupe(data.title);
        
        if (!mapa[key]) mapa[key] = [];
        mapa[key].push({
          id: d.id,
          title: data.title,
          hasPrice: (data.variants || []).some(v => Number(v.precioFinalUYU) > 0),
          createdAt: data.createdAt || ''
        });
      });

      // Filtrar los que tengan más de 1 resultado
      const grupos = Object.values(mapa).filter(g => g.length > 1);
      
      duplicadosAEncontrados = [];

      if (grupos.length === 0) {
        logDup('<br>🎉 ¡No se encontraron más duplicados!');
        return;
      }

      logDup(`<br>🚨 Se encontraron <b>${grupos.length}</b> grupos de juegos duplicados:`);
      logDup('<hr style="border-color:#333; margin: 10px 0;">');

      grupos.forEach((grupo, index) => {
        logDup(`<div style="margin-bottom:15px; padding:10px; background:#111; border-radius:8px; border:1px solid #333;">`);
        logDup(`<strong style="color:#00f0ff;">Grupo ${index + 1}:</strong><br>`);

        // Ordenar para que el que tiene precio aparezca primero
        grupo.sort((a, b) => (b.hasPrice === true) - (a.hasPrice === true));

        grupo.forEach((juego, i) => {
          const isSugeridoBorrar = i > 0; // Mantenemos el primero (el que tiene precio)
          const checked = isSugeridoBorrar ? 'checked' : '';
          const labelColor = isSugeridoBorrar ? '#ff8aa8' : '#00ff9d';
          const badge = juego.hasPrice ? ' <span style="color:#00ff9d; font-size:0.8rem;">(Tiene Precio)</span>' : ' <span style="color:#ffb800; font-size:0.8rem;">(Sin Precio)</span>';
          
          if (isSugeridoBorrar) {
            duplicadosAEncontrados.push(juego.id);
          }

          logDup(`
            <label style="display:flex; align-items:center; gap:8px; color:${labelColor}; margin-top:6px; cursor:pointer;">
              <input type="checkbox" class="dup-check" data-id="${juego.id}" ${checked}>
              ${juego.title} ${badge}
            </label>
          `);
        });
        logDup(`</div>`);
      });

      // Actualizar estado del botón según los checkboxes
      const updateBtnState = () => {
        const checks = document.querySelectorAll('.dup-check:checked');
        duplicadosAEncontrados = Array.from(checks).map(c => c.dataset.id);
        $('btn-do-clean-dups').disabled = duplicadosAEncontrados.length === 0;
        $('btn-do-clean-dups').textContent = `🗑️ Borrar ${duplicadosAEncontrados.length} duplicados`;
      };

      document.querySelectorAll('.dup-check').forEach(chk => {
        chk.addEventListener('change', updateBtnState);
      });

      logDup('<br><span style="color:#ffb800;">⚠️ Revisá las casillas. Las que están tildadas se van a borrar. Después tocá el botón rojo.</span>');
      updateBtnState();

    } catch (err) {
      logDup(`❌ Error: ${err.message}`);
    } finally {
      btn.disabled = false; btn.textContent = '🔍 Buscar duplicados';
    }
  });

  $('btn-do-clean-dups')?.addEventListener('click', async () => {
    if (duplicadosAEncontrados.length === 0) return;
    
    if (!confirm(`¿Seguro que querés borrar ${duplicadosAEncontrados.length} juegos duplicados?`)) return;
    
    const btn = $('btn-do-clean-dups');
    btn.disabled = true; btn.textContent = '⏳ Borrando...';

    try {
      const batch = writeBatch(db);
      duplicadosAEncontrados.forEach(id => batch.delete(doc(db, 'products', id)));
      await batch.commit();
      
      alert(`✅ Se eliminaron ${duplicadosAEncontrados.length} duplicados.`);
      logDupClear();
      logDup('✅ Limpieza de duplicados completada.');
      
    } catch (err) {
      alert('❌ Error: ' + err.message);
      btn.disabled = false;
    }
  });
}

// ============================================================
// INIT
// ============================================================
inyectarCardDuplicados();

console.log('[GamesUy] maintenance.js v13 cargado (filtro super agresivo)');
