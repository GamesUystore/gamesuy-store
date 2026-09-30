// ============================================================
// GAMESUY STORE — Contador de visitas
// Fase 16: Cuenta 1 visita por persona por día. Admin no cuenta.
// ============================================================

import { db, auth } from './firebase-config.js';
import {
  doc, getDoc, setDoc, collection, getDocs, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);

const LS_KEY = 'gamesuy_ultima_visita';
const TZ_OFFSET = -3; // Uruguay: UTC-3

// ============================================================
// HELPERS DE FECHA
// ============================================================
function fechaUY(date = new Date()) {
  // Ajustamos a zona horaria Uruguay (UTC-3) y devolvemos YYYY-MM-DD
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const uy = new Date(utc + (TZ_OFFSET * 3600000));
  const y = uy.getFullYear();
  const m = String(uy.getMonth() + 1).padStart(2, '0');
  const d = String(uy.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatearFechaCorta(isoFecha) {
  // isoFecha: "2026-09-30" → "30/09"
  if (!isoFecha) return '';
  const p = isoFecha.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : isoFecha;
}

function nombreDia(isoFecha) {
  try {
    const [y, m, d] = isoFecha.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[fecha.getDay()];
  } catch (e) { return ''; }
}

function sumarDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  fecha.setDate(fecha.getDate() + dias);
  const yy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// ============================================================
// REGISTRAR VISITA
// ============================================================
let visitaYaRegistrada = false;

async function registrarVisita() {
  if (visitaYaRegistrada) return;

  // Si está logueado como admin, no contamos
  if (auth.currentUser) {
    console.log('[GamesUy] Visita no contada (admin logueado)');
    return;
  }

  const hoy = fechaUY();
  const ultimaVisita = localStorage.getItem(LS_KEY);

  // Si ya visitó hoy, no contamos
  if (ultimaVisita === hoy) {
    console.log('[GamesUy] Visita no contada (ya visitó hoy)');
    visitaYaRegistrada = true;
    return;
  }

  try {
    const ref = doc(db, 'visitas', hoy);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const actual = Number(snap.data().total) || 0;
      await setDoc(ref, {
        total: actual + 1,
        fecha: hoy,
        ultimaActualizacion: new Date().toISOString()
      }, { merge: true });
    } else {
      await setDoc(ref, {
        total: 1,
        fecha: hoy,
        ultimaActualizacion: new Date().toISOString()
      });
    }

    localStorage.setItem(LS_KEY, hoy);
    visitaYaRegistrada = true;
    console.log('[GamesUy] ✅ Visita registrada:', hoy);
  } catch (err) {
    console.error('[GamesUy] Error al registrar visita:', err);
  }
}

// Cuando cambie el estado de auth, revisamos si corresponde registrar
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Si no hay usuario logueado, contamos la visita
    registrarVisita();
  } else {
    console.log('[GamesUy] Admin logueado, no se cuenta la visita');
  }
});

// ============================================================
// FOOTER — Mostrar contador en la web pública
// ============================================================
const hoyISO = fechaUY();

onSnapshot(doc(db, 'visitas', hoyISO), (snap) => {
  const el = $('footer-visitas');
  if (!el) return;

  const total = snap.exists() ? (Number(snap.data().total) || 0) : 0;

  if (total === 0) {
    el.textContent = '👁️ Sé el primero en visitar hoy';
  } else if (total === 1) {
    el.textContent = '👁️ 1 visita hoy';
  } else {
    el.textContent = `👁️ ${total.toLocaleString('es-UY')} visitas hoy`;
  }
});

// ============================================================
// ADMIN — Estadísticas completas
// ============================================================
async function calcularEstadisticas() {
  const snap = await getDocs(collection(db, 'visitas'));
  const visitas = {};
  let total = 0;

  snap.docs.forEach(d => {
    const data = d.data();
    const cant = Number(data.total) || 0;
    visitas[d.id] = cant;
    total += cant;
  });

  const hoy = fechaUY();

  // Visitas hoy
  const hoyCant = visitas[hoy] || 0;

  // Visitas últimos 7 días (incluyendo hoy)
  let semana = 0;
  const ultimos7 = [];
  for (let i = 6; i >= 0; i--) {
    const dia = sumarDias(hoy, -i);
    const cant = visitas[dia] || 0;
    semana += cant;
    ultimos7.push({ fecha: dia, total: cant });
  }

  // Visitas este mes (1ro del mes hasta hoy)
  const [y, m] = hoy.split('-');
  let mes = 0;
  Object.entries(visitas).forEach(([fecha, cant]) => {
    if (fecha.startsWith(`${y}-${m}-`)) mes += cant;
  });

  return {
    hoy: hoyCant,
    semana,
    mes,
    total,
    ultimos7
  };
}

async function renderEstadisticas() {
  try {
    const stats = await calcularEstadisticas();

    const eHoy = $('visita-hoy');
    const eSem = $('visita-semana');
    const eMes = $('visita-mes');
    const eTot = $('visita-total');

    if (eHoy) eHoy.textContent = stats.hoy.toLocaleString('es-UY');
    if (eSem) eSem.textContent = stats.semana.toLocaleString('es-UY');
    if (eMes) eMes.textContent = stats.mes.toLocaleString('es-UY');
    if (eTot) eTot.textContent = stats.total.toLocaleString('es-UY');

    const cont = $('visitas-ultimos');
    if (cont) {
      const max = Math.max(...stats.ultimos7.map(d => d.total), 1);
      cont.innerHTML = stats.ultimos7.map(d => {
        const porcentaje = max > 0 ? Math.round((d.total / max) * 100) : 0;
        const esHoy = d.fecha === fechaUY();
        return `
          <div class="visita-dia ${esHoy ? 'visita-dia-hoy' : ''}">
            <div class="visita-dia-info">
              <span class="visita-dia-nombre">${nombreDia(d.fecha)}</span>
              <span class="visita-dia-fecha">${formatearFechaCorta(d.fecha)}</span>
            </div>
            <div class="visita-dia-barra-wrap">
              <div class="visita-dia-barra" style="width:${porcentaje}%"></div>
            </div>
            <span class="visita-dia-cantidad">${d.total}</span>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('[GamesUy] Error al calcular estadísticas:', err);
  }
}

// Recalcular cuando el admin abra el tab Visitas
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'visitas') {
      // Pequeño delay para que se muestre el tab primero
      setTimeout(renderEstadisticas, 100);
    }
  });
});

// Intentar renderizar al cargar (por si ya está en el tab)
renderEstadisticas();

console.log('[GamesUy] visitas.js cargado');
