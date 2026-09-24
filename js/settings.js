// ============================================================
// GAMESUY STORE — Carga de configuración desde Firestore
// ============================================================

import { db } from './firebase-config.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ---------------------------------------------
// LOGO
// ---------------------------------------------
function aplicarLogo(logoUrl) {
  const img = document.getElementById('store-logo');
  const fallback = document.querySelector('.brand-logo-fallback');
  if (!img || !fallback) return;

  if (logoUrl && logoUrl.trim()) {
    img.src = logoUrl.trim();
    img.style.display = 'block';
    fallback.style.display = 'none';
  } else {
    img.style.display = 'none';
    fallback.style.display = 'flex';
  }
}

onSnapshot(doc(db, 'settings', 'site'), (snap) => {
  if (!snap.exists()) return;
  aplicarLogo(snap.data().logoUrl || '');
});

// ---------------------------------------------
// REDES SOCIALES
// ---------------------------------------------
const REDES_DEFAULT = [
  { key: 'wa', emoji: '💬', label: 'WhatsApp' },
  { key: 'ig', emoji: '📸', label: 'Instagram' },
  { key: 'fb', emoji: '📘', label: 'Facebook' },
  { key: 'tt', emoji: '🎵', label: 'TikTok' }
];

function aplicarRedes(redes) {
  const bar = document.getElementById('social-bar');
  if (!bar) return;

  const links = REDES_DEFAULT
    .filter(r => redes && redes[r.key] && String(redes[r.key]).trim())
    .map(r => {
      const url = String(redes[r.key]).trim();
      return `<a href="${url}" class="social-link" target="_blank" rel="noopener" data-net="${r.key}">${r.emoji} ${r.label}</a>`;
    });

  bar.innerHTML = links.length
    ? links.join('')
    : '<span class="social-link" style="opacity:.5;cursor:default;">Sin redes configuradas</span>';
}

onSnapshot(doc(db, 'settings', 'social'), (snap) => {
  if (!snap.exists()) return;
  aplicarRedes(snap.data());
});

// ---------------------------------------------
// BANNER DE ANUNCIO
// ---------------------------------------------
function aplicarBanner(data) {
  const banner = document.getElementById('announcement-banner');
  if (!banner) return;

  const label = (data.label || '📢 NOVEDAD').trim();
  const title = (data.title || '').trim();
  const text  = (data.text  || '').trim();
  const img   = (data.imageUrl || '').trim();
  const link  = (data.link || '').trim();

  if (!title && !text && !img) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = '';

  const labelEl = banner.querySelector('.announcement-label');
  const titleEl = banner.querySelector('.announcement-title');
  const textEl  = banner.querySelector('.announcement-text');

  if (labelEl) labelEl.textContent = label;
  if (titleEl) titleEl.textContent = title || '';
  if (textEl)  textEl.textContent  = text || '';

  if (titleEl) titleEl.style.display = title ? '' : 'none';
  if (textEl)  textEl.style.display  = text  ? '' : 'none';

  let imgEl = banner.querySelector('.announcement-image');
  if (img) {
    if (!imgEl) {
      imgEl = document.createElement('img');
      imgEl.className = 'announcement-image';
      imgEl.style.cssText = 'width:100%;max-height:280px;object-fit:cover;border-radius:12px;margin-bottom:16px;border:1px solid rgba(0,240,255,.3);';
      banner.querySelector('.announcement-content').prepend(imgEl);
    }
    imgEl.src = img;
    imgEl.style.display = '';
  } else if (imgEl) {
    imgEl.style.display = 'none';
  }

  if (link) {
    banner.style.cursor = 'pointer';
    banner.onclick = () => window.open(link, '_blank', 'noopener');
  } else {
    banner.style.cursor = '';
    banner.onclick = null;
  }
}

onSnapshot(doc(db, 'settings', 'homeAnnouncement'), (snap) => {
  if (!snap.exists()) return;
  aplicarBanner(snap.data());
});

console.log('[GamesUy] settings.js cargado');
