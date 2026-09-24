// ============================================================
// GAMESUY STORE — Importador de Excel del proveedor
// FASE 3.1: solo lectura + preview (sin procesar)
// ============================================================

const $ = (id) => document.getElementById(id);

// ============================================================
// LECTURA DE ARCHIVOS EXCEL
// ============================================================

/**
 * Lee un archivo Excel y devuelve un array de filas (arrays de celdas).
 * @param {File} file
 * @returns {Promise<{sheetName: string, rows: any[][]}>}
 */
async function leerExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        resolve({ sheetName, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ============================================================
// PREVIEW EN EL LOG DEL ADMIN
// ============================================================

function mostrarPreview(nombre, sheetName, rows) {
  const log = $('import-log');
  if (!log) return;

  const totalFilas = rows.length;
  const primerasFilas = rows.slice(0, 6);

  let html = `
    <div class="import-block">
      <strong>📄 ${nombre}</strong><br>
      Hoja: <code>${sheetName}</code><br>
      Total de filas leídas: <b>${totalFilas}</b><br>
      <br>
      <em>Primeras 6 filas (primeras 6 columnas):</em><br>
      <table class="import-preview-table">
  `;

  primerasFilas.forEach((fila, i) => {
    html += '<tr>';
    for (let j = 0; j < 6; j++) {
      const celda = fila[j] !== undefined && fila[j] !== null ? String(fila[j]) : '';
      const texto = celda.length > 35 ? celda.slice(0, 35) + '…' : celda;
      html += `<td>${i === 0 ? '<b>' + texto + '</b>' : texto}</td>`;
    }
    html += '</tr>';
  });

  html += '</table></div>';
  log.innerHTML += html;
  log.scrollTop = log.scrollHeight;
}

// ============================================================
// LISTENERS DE LOS FILE INPUTS
// ============================================================

function attachListener(inputId, tipo) {
  const input = $(inputId);
  if (!input) return;

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];

    const log = $('import-log');
    if (log) log.innerHTML = '';

    if (!file) return;

    try {
      const { sheetName, rows } = await leerExcel(file);
      mostrarPreview(file.name, sheetName, rows);

      // Habilitar el botón procesar
      const btn = $('btn-import-process');
      if (btn) btn.disabled = false;

      console.log(`[GamesUy] Excel "${file.name}" leído:`, {
        tipo,
        sheetName,
        totalFilas: rows.length
      });
    } catch (err) {
      console.error('[GamesUy] Error leyendo Excel:', err);
      if (log) log.innerHTML = `<div class="import-error">❌ Error al leer: ${err.message}</div>`;
    }
  });
}

attachListener('excel-stock',    'stock');
attachListener('excel-ofertas',  'ofertas');
attachListener('excel-preventas','preventas');

// ============================================================
// BOTÓN PROCESAR (placeholder)
// ============================================================

$('btn-import-process')?.addEventListener('click', () => {
  alert('El procesamiento real vendrá en el próximo sub-paso (3.2).');
});

console.log('[GamesUy] excel-importer.js cargado (solo lectura)');
