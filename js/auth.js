// ============================================================
// GAMESUY STORE — Autenticación del administrador
// ============================================================

import { auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);

// Helper robusto: forzar mostrar/ocultar aunque haya conflictos de CSS
function setVisible(el, visible) {
  if (!el) return;
  if (visible) {
    el.classList.remove('hidden');
    el.style.removeProperty('display');
  } else {
    el.classList.add('hidden');
    el.style.setProperty('display', 'none', 'important');
  }
}

function openLoginModal() {
  const modal = $('login-modal');
  if (!modal) return;
  setVisible(modal, true);
  setVisible($('login-error'), false);
  setTimeout(() => $('admin-email')?.focus(), 50);
}

function closeLoginModal() {
  const modal = $('login-modal');
  if (!modal) return;
  setVisible(modal, false);
  setVisible($('login-error'), false);
  const pass = $('admin-pass');
  if (pass) pass.value = '';
}

// ---------------------------------------------
// Botón [ Admin ] del nav
// ---------------------------------------------
const adminBtn = document.querySelector('.nav-btn-admin');
if (adminBtn) {
  adminBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (auth.currentUser) {
      window.switchPage('admin');
    } else {
      openLoginModal();
    }
  }, true); // captura → se ejecuta antes que otros listeners
}

// ---------------------------------------------
// Botones de abrir/cerrar modal
// ---------------------------------------------
const openLoginBtn = $('btn-open-login');
const loginClose   = $('login-close');

if (openLoginBtn) openLoginBtn.addEventListener('click', openLoginModal);
if (loginClose)   loginClose.addEventListener('click', closeLoginModal);

const loginModal = $('login-modal');
if (loginModal) {
  loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) closeLoginModal();
  });
}

// ---------------------------------------------
// Login
// ---------------------------------------------
async function doLogin() {
  const email = $('admin-email').value.trim();
  const pass  = $('admin-pass').value;
  const btn   = $('btn-login');
  const errEl = $('login-error');

  setVisible(errEl, false);

  if (!email || !pass) {
    errEl.textContent = 'Completá email y contraseña.';
    setVisible(errEl, true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Ingresando...';

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    closeLoginModal();
    window.switchPage('admin');
  } catch (err) {
    const msgs = {
      'auth/invalid-email':           'Email inválido.',
      'auth/user-not-found':          'Usuario no encontrado.',
      'auth/wrong-password':          'Contraseña incorrecta.',
      'auth/invalid-credential':      'Email o contraseña incorrectos.',
      'auth/too-many-requests':       'Demasiados intentos. Esperá un momento.',
      'auth/network-request-failed':  'Sin conexión. Verificá tu internet.',
      'auth/unauthorized-domain':     'Este dominio no está autorizado en Firebase Auth.'
    };
    errEl.textContent = msgs[err.code] || ('Error: ' + err.message);
    setVisible(errEl, true);
    console.error('[GamesUy] Error login:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

const loginBtn = $('btn-login');
if (loginBtn) loginBtn.addEventListener('click', doLogin);

$('admin-pass')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') doLogin();
});

// ---------------------------------------------
// Logout
// ---------------------------------------------
const logoutBtn = $('btn-logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    if (confirm('¿Cerrar sesión de administrador?')) {
      await signOut(auth);
      window.switchPage('catalogo');
    }
  });
}

// ---------------------------------------------
// Observer de sesión
// ---------------------------------------------
onAuthStateChanged(auth, (user) => {
  const adminNotLogged = $('admin-not-logged');
  const adminLogged    = $('admin-logged');
  const adminEmailEl   = $('admin-user-email');

  if (user) {
    if (adminBtn) {
      adminBtn.textContent = '[ Panel ]';
      adminBtn.style.color = '#00ff9d';
    }
    setVisible(adminNotLogged, false);
    setVisible(adminLogged, true);
    if (adminEmailEl) adminEmailEl.textContent = user.email;
    closeLoginModal(); // por si quedó abierto
    console.log('[GamesUy] Admin logueado:', user.email);
  } else {
    if (adminBtn) {
      adminBtn.textContent = '[ Admin ]';
      adminBtn.style.color = '';
    }
    setVisible(adminNotLogged, true);
    setVisible(adminLogged, false);
    console.log('[GamesUy] Admin deslogueado');
  }
});

console.log('[GamesUy] auth.js cargado');
