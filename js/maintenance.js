// ============================================================
// GAMESUY STORE — Mantenimiento
// Limpieza de productos viejos (sin matchKey)
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

// ============================================================
// ANALIZAR
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
      // Un producto es "viejo" si NO tiene matchKey
      if (!data.matchKey || !String(data.matchKey).trim()) {
        productosABorrar.push({
          id: d.id,
          title: data.title || '(sin título)'
        });
      }
    });

    logClean('');
    logClean(`📊 Total en Firestore: <b>${snap.size}</b>`);
    logClean(`✅ Productos nuevos (con matchKey): <b>${snap.size - productosABorrar.length}</b>`);
    logClean(`🗑️  Productos viejos (SIN matchKey): <b>${productosABorrar.length}</b>`);

    if (productosABorrar.length === 0) {
      logClean('');
      logClean('🎉 No hay nada para borrar.');
      $('btn-do-clean').disabled = true;
      $('clean-confirm').disabled = true;
      return;
    }

    // Preview de los primeros 20
    logClean('');
    logClean('<strong>Primeros 20 a borrar:</strong>');
    productosABorrar.slice(0, 20).forEach(p => {
      logClean(`&nbsp;&nbsp;• ${p.title}`);
    });

    if (productosABorrar.length > 20) {
      logClean(`&nbsp;&nbsp;... y ${productosABorrar.length - 20} más.`);
    }

    analizado = true;
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
// CONFIRMACIÓN
// ============================================================

$('clean-confirm')?.addEventListener('input', (e) => {
  const val = e.target.value.trim().toUpperCase();
  $('btn-do-clean').disabled = val !== 'BORRAR';
});

// ============================================================
// BORRAR
// ============================================================

$('btn-do-clean')?.addEventListener('click', async () => {
  if (!analizado || productosABorrar.length === 0) return;

  const confirmacion = $('clean-confirm').value.trim().toUpperCase();
  if (confirmacion !== 'BORRAR') return;

  if (!confirm(`⚠️ Vas a borrar ${productosABorrar.length} productos.\n\nEsta acción NO se puede deshacer.\n\n¿Continuar?`)) {
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
      lote.forEach(p => {
        batch.delete(doc(db, 'products', p.id));
      });
      await batch.commit();
      borrados += lote.length;
      logClean(`&nbsp;&nbsp;→ Borrados ${borrados} / ${productosABorrar.length}`);
    }

    logClean('');
    logClean(`✅ <strong>Limpieza completada. ${borrados} productos eliminados.</strong>`);

    // Reset
    productosABorrar = [];
    analizado = false;
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

console.log('[GamesUy] maintenance.js cargado');
