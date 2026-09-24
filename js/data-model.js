// ============================================================
// GAMESUY STORE — Modelo de datos y motor de precios
// ============================================================

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

/**
 * Convierte un costo en ARS a UYU usando la cotización.
 * @param {number} costoARS
 * @param {number} cotizacionARSaUYU
 * @returns {number} Costo en UYU (sin redondear)
 */
export function getCostoUYU(costoARS, cotizacionARSaUYU) {
  if (!costoARS || !cotizacionARSaUYU) return 0;
  return costoARS * cotizacionARSaUYU;
}

/**
 * Calcula el precio final en UYU a partir del costo ARS + ganancia %.
 * @param {number} costoARS
 * @param {number} cotizacionARSaUYU
 * @param {number} gananciaPct  (ej: 0.515 para 51.5%)
 * @returns {number} precio final UYU (redondeado hacia arriba)
 */
export function calcPrecioUYU(costoARS, cotizacionARSaUYU, gananciaPct) {
  const costoUYU = getCostoUYU(costoARS, cotizacionARSaUYU);
  if (costoUYU <= 0) return 0;
  return roundUYU(costoUYU * (1 + gananciaPct));
}

/**
 * Calcula el precio de venta en USD a partir del precio final en UYU.
 * @param {number} precioUYU
 * @param {number} cotizacionUSDaUYU
 * @returns {number} precio en USD (redondeado hacia arriba al siguiente 0.05)
 */
export function calcPrecioUSD(precioUYU, cotizacionUSDaUYU) {
  if (!precioUYU || !cotizacionUSDaUYU) return 0;
  return roundUSD(precioUYU / cotizacionUSDaUYU);
}

/**
 * Calcula la ganancia % a partir de un precio final que el admin define a mano.
 * @param {number} precioUYU
 * @param {number} costoARS
 * @param {number} cotizacionARSaUYU
 * @returns {number} ganancia como decimal (0.515 = 51.5%)
 */
export function calcGananciaPct(precioUYU, costoARS, cotizacionARSaUYU) {
  const costoUYU = getCostoUYU(costoARS, cotizacionARSaUYU);
  if (costoUYU <= 0) return 0;
  return (precioUYU / costoUYU) - 1;
}

/**
 * Aplica una variación % a un precio.
 * @param {number} precioActual
 * @param {number} variacionPct  (0.0833 = +8.33%)
 * @returns {number} nuevo precio (redondeado)
 */
export function aplicarVariacion(precioActual, variacionPct) {
  if (!precioActual) return 0;
  return roundUYU(precioActual * (1 + variacionPct));
}

/**
 * Calcula la variación % entre dos valores.
 * @param {number} valorAnterior
 * @param {number} valorNuevo
 * @returns {number} variación decimal (0.0833 = +8.33%)
 */
export function calcVariacion(valorAnterior, valorNuevo) {
  if (!valorAnterior || valorAnterior === 0) return 0;
  return (valorNuevo / valorAnterior) - 1;
}

// ---------------------------------------------
// FORMATEO
// ---------------------------------------------

/**
 * Formatea un precio en UYU.
 * Ej: 3550 → "$ 3.550"
 */
export function formatUYU(n) {
  if (!n) return '$ 0';
  return '$ ' + Math.round(n).toLocaleString('es-UY');
}

/**
 * Formatea un precio en USD.
 * Ej: 89.75 → "US$ 89.75"
 */
export function formatUSD(n) {
  if (!n) return 'US$ 0.00';
  return 'US$ ' + Number(n).toFixed(2);
}

// ---------------------------------------------
// VALIDACIÓN
// ---------------------------------------------

/**
 * Valida si un costo ARS del Excel es "válido" (número > 0).
 * Los strings "SIN STOCK" / "NO DISPONIBLE" / vacíos devuelven false.
 */
export function esCostoValido(costo) {
  if (costo === null || costo === undefined) return false;
  if (typeof costo === 'number') return costo > 0;
  const limpio = String(costo).trim();
  if (!limpio) return false;
  if (/sin\s*stock|no\s*disponible/i.test(limpio)) return false;
  const num = parseFloat(limpio.replace(/[^0-9.]/g, ''));
  return !isNaN(num) && num > 0;
}

/**
 * Convierte un valor de costo (string o número) a número.
 * Devuelve 0 si no es válido.
 */
export function parseCosto(costo) {
  if (!esCostoValido(costo)) return 0;
  if (typeof costo === 'number') return costo;
  return parseFloat(String(costo).replace(/[^0-9.]/g, '')) || 0;
}

console.log('[GamesUy] data-model.js cargado');
