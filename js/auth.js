// ============================================================
// GAMESUY STORE — Autenticación del administrador
// ============================================================

import { auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const loginModal     = document.getElementById('login-modal');
const loginClose     = document.getElementById('login-close');
const loginBtn       = document.getElementById('btn-login');
const loginError     = document.getElementById('login-error');
const adminBtn       = document.querySelector('.nav-btn-admin');
const adminNotLogged = document.getElementById('admin-not-logged');
const adminLogged    = document.getElementById('admin-logged');
const adminEmailEl   = document.getElementById('admin-user-email');
const logoutBtn      = document.getElementById('btn-logout');
const openLoginBtn   = document.getElementById('btn-open-login');

function openLoginModal() {
  if (!loginModal) return;
  loginModal.classList.remove('hidden');
  loginError.classList.add('hidden');
  setTimeout(() => document.getElementById('admin-email')?.focus(), 50);
}

function closeLoginModal() {
  if (!loginModal) return;
  loginModal.classList.add('hidden');
  loginError.classList.add('hidden');
  const pass = document.getElementById('admin-pass');
  if (pass) pass.value = '';
}

if (adminBtn) {
  adminBtn.addEventListener('click', () => {
    if (auth.currentUser) {
      window.switchPage('admin');
    } else {
      openLoginModal();
    }
  });
}

if (openLoginBtn) openLoginBtn.addEventListener('click', openLoginModal);
if (loginClose)   loginClose.addEventListener('click', closeLoginModal);

if (loginModal) {
  loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) closeLoginModal();
  });
}

async function doLogin() {
  const email = document.getElementById('admin-email').value.trim();
  const pass  = document.getElementById('admin-pass').value;

  loginError.classList.add('hidden');

  if (!email || !pass) {
    loginError.textContent = 'Completá email y contraseña.';
    loginError.classList.remove('hidden');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Ingresando...';

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
    loginError.textContent = msgs[err.code] || ('Error: ' + err.message);
    loginError.classList.remove('hidden');
    console.error('[GamesUy] Error login:', err);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Ingresar';
  }
}

if (loginBtn) loginBtn.addEventListener('click', doLogin);

document.getElementById('admin-pass')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') doLogin();
});

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    if (confirm('¿Cerrar sesión de administrador?')) {
      await signOut(auth);
      window.switchPage('catalogo');
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (adminBtn) {
      adminBtn.textContent = '[ Panel ]';
      adminBtn.style.color = '#00ff9d';
    }
    if (adminNotLogged) adminNotLogged.classList.add('hidden');
    if (adminLogged)    adminLogged.classList.remove('hidden');
    if (adminEmailEl)   adminEmailEl.textContent = user.email;
    console.log('[GamesUy] Admin logueado:', user.email);
  } else {
    if (adminBtn) {
      adminBtn.textContent = '[ Admin ]';
      adminBtn.style.color = '';
    }
    if (adminNotLogged) adminNotLogged.classList.remove('hidden');
    if (adminLogged)    adminLogged.classList.add('hidden');
    console.log('[GamesUy] Admin deslogueado');
  }
});

console.log('[GamesUy] auth.js cargado');
