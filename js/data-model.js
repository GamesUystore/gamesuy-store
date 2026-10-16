// ============================================================
// GAMESUY STORE — Modelo de datos y motor de precios
// ============================================================

// ---------------------------------------------
// PARSEO DE NÚMEROS (soporta formato argentino)
// ---------------------------------------------

/**
 * Convierte un valor a número soportando formato argentino y US.
 *   "20.000"     → 20000   (argentino: punto = miles)
 *   "20.000,50"  → 20000.5 (argentino)
 *   "20,000.50"  → 20000.5 (US)
 *   "20000"      → 20000
 *   "20,50"      → 20.5    (argentino: coma = decimal)
 *   "20.50"      → 20.5    (US: punto = decimal)
 *   20000        → 20000   (ya es número)
 */
export function parseNumeroFlexible(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;

  let s = String(raw).trim();
  if (!s) return 0;

  // Dejar solo dígitos, puntos y comas
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return 0;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot > -1 && lastComma > -1) {
    // Ambos presentes: el último es el separador decimal
    if (lastComma > lastDot) {
      // Argentino: 20.000,50 → 20000.50
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 20,000.50 → 20000.50
      s = s.replace(/,/g, '');
    }
  } else if (lastDot > -1) {
    // Solo puntos
    const partes = s.split('.');
    if (partes.length > 2) {
      // Múltiples puntos → todos separadores de miles
      // "1.234.567" → 1234567
      s = partes.join('');
    } else if (partes.length === 2 && partes[1].length === 3 && partes[0].length <= 3) {
      // Un punto con 3 dígitos después → separador de miles
      // "20.000" → 20000
      s = partes[0] + partes[1];
    }
    // Si no cumple, se deja el punto como decimal (20.50 → 20.5)
  } else if (lastComma > -1) {
    // Solo comas
    const partes = s.split(',');
    if (partes.length > 2) {
      // Múltiples comas → separadores de miles
      s = partes.join('');
    } else if (partes.length === 2 && partes[1].length === 3 && partes[0].length <= 3) {
      // "20,000" → 20000
      s = partes[0] + partes[1];
    } else {
      // Decimal: "20,50" → 20.50
      s = partes[0] + '.' + partes[1];
    }
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

// ---------------------------------------------
// REDONDEO
// ---------------------------------------------

/**
 * Redondeo hacia arriba al peso entero.
 * Ej: 108.33 → 109, 100.00 → 100
 */
export function roundUYU(n) {
  return Math.ceil(n);
}

/**
 * Redondeo hacia arriba al siguiente múltiplo de 0.05.
 * Ej: 1.21 → 1.25, 1.26 → 1.30, 1.25 → 1.25
 */
export function roundUSD(n) {
  return Math.ceil(n * 20) / 20;
}

// ---------------------------------------------
// COSTOS Y PRECIOS
// ---------------------------------------------

export function getCostoUYU(costoARS, cotizacionARSaUYU) {
  if (!costoARS || !cotizacionARSaUYU) return 0;
  return costoARS * cotizacionARSaUYU;
}

export function calcPrecioUYU(costoARS, cotizacionARSaUYU, gananciaPct) {
  const costoUYU = getCostoUYU(costoARS, cotizacionARSaUYU);
  if (costoUYU <= 0) return 0;
  return roundUYU(costoUYU * (1 + gananciaPct));
}

export function calcPrecioUSD(precioUYU, cotizacionUSDaUYU) {
  if (!precioUYU || !cotizacionUSDaUYU) return 0;
  return roundUSD(precioUYU / cotizacionUSDaUYU);
}

export function calcGananciaPct(precioUYU, costoARS, cotizacionARSaUYU) {
  const costoUYU = getCostoUYU(costoARS, cotizacionARSaUYU);
  if (costoUYU <= 0) return 0;
  return (precioUYU / costoUYU) - 1;
}

export function aplicarVariacion(precioActual, variacionPct) {
  if (!precioActual) return 0;
  return roundUYU(precioActual * (1 + variacionPct));
}

export function calcVariacion(valorAnterior, valorNuevo) {
  if (!valorAnterior || valorAnterior === 0) return 0;
  return (valorNuevo / valorAnterior) - 1;
}

// ---------------------------------------------
// FORMATEO
// ---------------------------------------------

export function formatUYU(n) {
  if (!n) return '$ 0';
  return '$ ' + Math.round(n).toLocaleString('es-UY');
}

export function formatUSD(n) {
  if (!n) return 'US$ 0.00';
  return 'US$ ' + Number(n).toFixed(2);
}

// ---------------------------------------------
// VALIDACIÓN
// ---------------------------------------------

export function esCostoValido(costo) {
  if (costo === null || costo === undefined) return false;
  if (typeof costo === 'number') return costo > 0;
  const limpio = String(costo).trim();
  if (!limpio) return false;
  if (/sin\s*stock|no\s*disponible/i.test(limpio)) return false;
  return parseNumeroFlexible(limpio) > 0;
}

export function parseCosto(costo) {
  if (!esCostoValido(costo)) return 0;
  if (typeof costo === 'number') return costo;
  return parseNumeroFlexible(costo);
}

console.log('[GamesUy] data-model.js cargado');
