import * as XLSX from 'xlsx'

// ─── Internal helpers ────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0]

const autoColWidths = (data) => {
  if (!data.length) return []
  return Object.keys(data[0]).map(key => {
    const max = data.reduce((w, row) => {
      const v = row[key]
      return Math.max(w, v == null ? 0 : String(v).length)
    }, key.length)
    return { wch: Math.min(max + 2, 60) }
  })
}

const writeXLSX = (wb, filename) => {
  XLSX.writeFile(wb, filename)
}

const sheetFromData = (rows) => {
  const ws = XLSX.utils.json_to_sheet(rows)
  if (rows.length) ws['!cols'] = autoColWidths(rows)
  return ws
}

// ─── Generic export (replaces old exportToCSV) ───────────────────────────────

export const exportToXLSX = (data, filename) => {
  if (!data || data.length === 0) throw new Error('No hay datos para exportar')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromData(data), 'Datos')
  writeXLSX(wb, `${filename}.xlsx`)
}

// Keep old name as alias so existing callers keep working
export const exportToCSV = exportToXLSX

// ─── Inventario ──────────────────────────────────────────────────────────────

export const exportInventarioToXLSX = (inventario) => {
  const fecha = today()
  const rows = inventario.map(item => ({
    'Producto': item.producto,
    'Especificación': item.especificacion || '',
    'Ubicación': item.ubicacion,
    'Stock Actual': typeof item.stock_actual === 'number' ? item.stock_actual : (Number(item.stock_actual) || 0),
    'Unidad': item.unidad_medida,
    'Categoría': item.categoria,
    'Última Actualización': item.ultima_actualizacion || ''
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromData(rows), 'Inventario')
  writeXLSX(wb, `inventario_${fecha}.xlsx`)
}

export const exportInventarioToCSV = exportInventarioToXLSX

// ─── Productos ───────────────────────────────────────────────────────────────

export const exportProductosToXLSX = (productos) => {
  const fecha = today()
  const rows = productos.map(item => ({
    'ID': item.id,
    'Nombre': item.nombre,
    'Especificación': item.especificacion || '',
    'Unidad': item.unidad_medida,
    'Costo': typeof item.costo_unidad === 'number' ? item.costo_unidad : (Number(item.costo_unidad) || 0),
    'Stock Mínimo': typeof item.stock_minimo === 'number' ? item.stock_minimo : (Number(item.stock_minimo) || 0),
    'Categoría': item.categoria,
    'Frecuencia': Array.isArray(item.frecuencia_inventario)
      ? item.frecuencia_inventario.join(', ')
      : (item.frecuencia_inventario || ''),
    'Etiquetas': Array.isArray(item.etiquetas) ? item.etiquetas.join(', ') : (item.etiquetas || ''),
    'Estado': item.estado
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromData(rows), 'Productos')
  writeXLSX(wb, `productos_${fecha}.xlsx`)
}

export const exportProductosToCSV = exportProductosToXLSX

// ─── Movimientos ─────────────────────────────────────────────────────────────

const formatFirestoreDate = (val) => {
  if (!val) return ''
  try {
    if (typeof val?.toDate === 'function') return val.toDate().toLocaleDateString('es-MX')
    if (val?.seconds !== undefined) return new Date(val.seconds * 1000).toLocaleDateString('es-MX')
    return new Date(val).toLocaleDateString('es-MX')
  } catch { return '' }
}

export const exportMovimientosToXLSX = (movimientos) => {
  const fecha = today()
  const rows = movimientos.map(item => ({
    'ID': item.id,
    'Tipo': item.tipo_movimiento,
    'Código': item.codigo_legible || '',
    'Origen': item.origen_nombre || item.origen_id,
    'Destino': item.destino_nombre || item.destino_id,
    'Estado': item.estado,
    'Fecha Creación': formatFirestoreDate(item.fecha_creacion),
    'Fecha Confirmación': formatFirestoreDate(item.fecha_confirmacion),
    'Observaciones': item.observaciones_creacion || ''
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromData(rows), 'Movimientos')
  writeXLSX(wb, `movimientos_${fecha}.xlsx`)
}

export const exportMovimientosToCSV = exportMovimientosToXLSX

// ─── Conteos (lista) ─────────────────────────────────────────────────────────

export const exportConteosToXLSX = (conteos) => {
  const fecha = today()
  const rows = conteos.map(item => ({
    'ID': item.id,
    'Código': item.codigo_legible || '',
    'Ubicación': item.ubicacion_nombre || item.ubicacion_id,
    'Tipo Conteo': item.tipo_conteo,
    'Estado': item.estado === 'PARCIALMENTE_COMPLETADO' ? 'Parcial Completado' : item.estado,
    'Fecha Programada': formatFirestoreDate(item.fecha_programada),
    'Fecha Completado': formatFirestoreDate(item.fecha_completado),
    'Responsable': item.usuario_responsable_id,
    'Observaciones': item.observaciones || ''
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromData(rows), 'Conteos')
  writeXLSX(wb, `conteos_${fecha}.xlsx`)
}

export const exportConteosToCSV = exportConteosToXLSX

// ─── Stock bajo ──────────────────────────────────────────────────────────────

export const exportReporteStockBajoToXLSX = (productos) => {
  const fecha = today()
  const rows = productos.map(item => ({
    'Producto': item.producto,
    'Ubicación': item.ubicacion,
    'Stock Actual': typeof item.stock_actual === 'number' ? item.stock_actual : (Number(item.stock_actual) || 0),
    'Stock Mínimo': typeof item.stock_minimo === 'number' ? item.stock_minimo : (Number(item.stock_minimo) || 0),
    'Diferencia': (Number(item.stock_actual) || 0) - (Number(item.stock_minimo) || 0),
    'Unidad': item.unidad_medida,
    'Categoría': item.categoria
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromData(rows), 'Stock Bajo')
  writeXLSX(wb, `reporte_stock_bajo_${fecha}.xlsx`)
}

export const exportReporteStockBajoToCSV = exportReporteStockBajoToXLSX

// ─── Conteo detalle ──────────────────────────────────────────────────────────

export const exportConteoToExcel = (conteo, detalles, productos, ubicaciones) => {
  const fecha = today()
  const ubicacion = (ubicaciones || []).find(u => u.id === conteo.ubicacion_id)
  const wb = XLSX.utils.book_new()

  // Info sheet
  const infoRows = [
    { 'Campo': 'Código', 'Valor': conteo.codigo_legible || conteo.id },
    { 'Campo': 'Ubicación', 'Valor': ubicacion?.nombre || conteo.ubicacion_id },
    { 'Campo': 'Tipo', 'Valor': conteo.tipo_conteo || '' },
    { 'Campo': 'Estado', 'Valor': conteo.estado === 'PARCIALMENTE_COMPLETADO' ? 'Parcial Completado' : conteo.estado },
    { 'Campo': 'Fecha Creación', 'Valor': formatFirestoreDate(conteo.fecha_creacion) },
    { 'Campo': 'Fecha Completado', 'Valor': formatFirestoreDate(conteo.fecha_completado) }
  ]
  XLSX.utils.book_append_sheet(wb, sheetFromData(infoRows), 'Info')

  // Detalle sheet
  const detalleRows = (detalles || []).map(d => {
    const prod = (productos || []).find(p => p.id === d.producto_id)
    const cantFisica = d.cantidad_fisica ?? null
    const cantSistema = d.cantidad_sistema ?? null
    return {
      'Producto': prod?.nombre || d.producto_id,
      'Especificación': prod?.especificacion || '',
      'Cant. Sistema': cantSistema !== null ? Number(cantSistema) : '',
      'Cant. Física': cantFisica !== null ? Number(cantFisica) : '',
      'Diferencia': cantFisica !== null && cantSistema !== null ? Number(cantFisica) - Number(cantSistema) : '',
      'Observaciones': d.observaciones || ''
    }
  })
  XLSX.utils.book_append_sheet(wb, sheetFromData(detalleRows), 'Detalle')

  writeXLSX(wb, `conteo_${conteo.codigo_legible || conteo.id}_${fecha}.xlsx`)
}

// ─── Transferencia detalle ───────────────────────────────────────────────────

export const exportTransferenciaToExcel = (movimiento, detalles, productos, ubicaciones) => {
  const fecha = today()
  const origen = (ubicaciones || []).find(u => u.id === movimiento.origen_id)
  const destino = (ubicaciones || []).find(u => u.id === movimiento.destino_id)
  const wb = XLSX.utils.book_new()

  // Info sheet
  const infoRows = [
    { 'Campo': 'Código', 'Valor': movimiento.codigo_legible || movimiento.id },
    { 'Campo': 'Tipo', 'Valor': movimiento.tipo_movimiento || 'TRANSFERENCIA' },
    { 'Campo': 'Origen', 'Valor': origen?.nombre || movimiento.origen_id },
    { 'Campo': 'Destino', 'Valor': destino?.nombre || movimiento.destino_id },
    { 'Campo': 'Estado', 'Valor': movimiento.estado },
    { 'Campo': 'Fecha Creación', 'Valor': formatFirestoreDate(movimiento.fecha_creacion) },
    { 'Campo': 'Fecha Confirmación', 'Valor': formatFirestoreDate(movimiento.fecha_confirmacion) }
  ]
  XLSX.utils.book_append_sheet(wb, sheetFromData(infoRows), 'Info')

  // Detalle sheet
  const detalleRows = (detalles || []).map(d => {
    const prod = (productos || []).find(p => p.id === d.producto_id)
    return {
      'Producto': prod?.nombre || d.producto_id,
      'Especificación': prod?.especificacion || '',
      'Cant. Enviada': d.cantidad_enviada != null ? Number(d.cantidad_enviada) : (d.cantidad != null ? Number(d.cantidad) : ''),
      'Cant. Recibida': d.cantidad_recibida != null ? Number(d.cantidad_recibida) : '',
      'Observaciones': d.observaciones || ''
    }
  })
  XLSX.utils.book_append_sheet(wb, sheetFromData(detalleRows), 'Detalle')

  writeXLSX(wb, `transferencia_${movimiento.codigo_legible || movimiento.id}_${fecha}.xlsx`)
}

// ─── Print helper (unchanged) ─────────────────────────────────────────────────

export const createPrintableTable = (data, columns, title) => {
  const html = `<!DOCTYPE html><html><head><title>${title}</title>
<style>body{font-family:Arial,sans-serif;padding:20px}h1{color:#334155;margin-bottom:20px}
table{width:100%;border-collapse:collapse;margin-top:20px}
th{background-color:#0ea5e9;color:white;padding:12px;text-align:left;font-weight:600}
td{padding:10px;border-bottom:1px solid #e2e8f0}tr:nth-child(even){background-color:#f8fafc}
.fecha{color:#64748b;font-size:14px;margin-top:10px}
@media print{button{display:none}}</style></head>
<body><h1>${title}</h1>
<p class="fecha">Generado el: ${new Date().toLocaleString('es-ES')}</p>
<table><thead><tr>${columns.map(col => `<th>${col.header}</th>`).join('')}</tr></thead>
<tbody>${data.map(row => `<tr>${columns.map(col => `<td>${row[col.key] || ''}</td>`).join('')}</tr>`).join('')}</tbody>
</table>
<div style="margin-top:30px">
<button onclick="window.print()" style="padding:10px 20px;background-color:#0ea5e9;color:white;border:none;border-radius:6px;cursor:pointer">Imprimir</button>
<button onclick="window.close()" style="padding:10px 20px;background-color:#64748b;color:white;border:none;border-radius:6px;cursor:pointer;margin-left:10px">Cerrar</button>
</div></body></html>`
  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
}

export default {
  exportToXLSX,
  exportToCSV,
  exportInventarioToXLSX,
  exportInventarioToCSV,
  exportProductosToXLSX,
  exportProductosToCSV,
  exportMovimientosToXLSX,
  exportMovimientosToCSV,
  exportConteosToXLSX,
  exportConteosToCSV,
  exportReporteStockBajoToXLSX,
  exportReporteStockBajoToCSV,
  exportConteoToExcel,
  exportTransferenciaToExcel,
  createPrintableTable
}
