import { useState, useRef, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import {
  BookOpen, Plus, Search, Download, Upload, Edit2, Trash2, Eye,
  ChevronDown, ChevronUp, X, Save, Package, DollarSign,
  FileSpreadsheet, CheckCircle, ArrowDownLeft, ArrowRightLeft,
  MapPin, Clock, CheckCircle2, XCircle, Store, SlidersHorizontal, RefreshCw, Copy, AlertCircle, GripVertical, Maximize2, Minimize2
} from 'lucide-react'
import { useSalidasOdoo } from '../hooks/useSalidasOdoo'
import { useToastStore } from '../stores/toastStore'
import { usePermissions } from '../hooks/usePermissions'
import dataService from '../services/dataService'
import { buildEquivalenceMap, getCompatibleUnits, calcCostInConsumptionUnit, convertUnits } from '../utils/unitConversion'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Button from '../components/common/Button'
import ConfirmModal from '../components/common/ConfirmModal'

// ─── Utils ────────────────────────────────────────────────────────────────────

const normalizeHeader = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '')

const parseBool = (value, defaultValue = true) => {
  if (value === '' || value == null) return defaultValue
  const normalized = String(value).trim().toLowerCase()
  if (['si', 'sí', 'true', '1', 'activo', 'activa', 'yes'].includes(normalized)) return true
  if (['no', 'false', '0', 'inactivo', 'inactiva'].includes(normalized)) return false
  return defaultValue
}

const parseNumberOrNull = (value) => {
  if (value === '' || value == null) return null
  const parsed = parseFloat(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

const unitDisplayName = (unit) => unit ? (unit.abreviatura || unit.simbolo || unit.nombre || unit.id) : ''

function resolveUnit(unidadesDB, value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const normalized = raw.toLowerCase()
  return unidadesDB.find(u =>
    String(u.id || '').toLowerCase() === normalized ||
    String(u.nombre || '').toLowerCase() === normalized ||
    String(u.abreviatura || '').toLowerCase() === normalized ||
    String(u.simbolo || '').toLowerCase() === normalized
  ) || null
}

function compareValues(a, b) {
  const emptyA = a == null || a === ''
  const emptyB = b == null || b === ''
  if (emptyA && emptyB) return 0
  if (emptyA) return 1
  if (emptyB) return -1
  if (a instanceof Date || b instanceof Date) return new Date(a) - new Date(b)
  const numA = typeof a === 'number' ? a : parseFloat(a)
  const numB = typeof b === 'number' ? b : parseFloat(b)
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && String(a).trim?.() !== '' && String(b).trim?.() !== '') return numA - numB
  return String(a).localeCompare(String(b), 'es', { sensitivity: 'base', numeric: true })
}

function SortableHeader({ label, column, sortConfig, onSort, align = 'left', className = '' }) {
  const active = sortConfig?.column === column
  const direction = active ? sortConfig.direction : null
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  const justifyClass = align === 'right' ? 'justify-end w-full' : align === 'center' ? 'justify-center w-full' : ''
  return (
    <th
      onClick={() => onSort(column)}
      className={`${className} px-4 py-3 ${alignClass} text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer hover:text-primary-600 select-none`}
    >
      <span className={`inline-flex items-center gap-1 ${justifyClass}`}>
        {label}
        <span className="flex flex-col -space-y-1">
          <ChevronUp size={10} className={active && direction === 'asc' ? 'text-primary-600' : 'text-slate-300'} />
          <ChevronDown size={10} className={active && direction === 'desc' ? 'text-primary-600' : 'text-slate-300'} />
        </span>
      </span>
    </th>
  )
}

function calcularCostoTotal(ingredientes = []) {
  return ingredientes.reduce((s, i) => s + (i.costo_unitario || 0) * (i.cantidad || 0), 0)
}

function fmtCosto(n) {
  return typeof n === 'number' ? `$${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'
}

function createIngredienteUiKey() {
  return `ing-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function exportarRecetarios(recetarios) {
  if (!recetarios || recetarios.length === 0) return 0

  const dataToExport = recetarios.flatMap(rec => {
    const ingredientes = rec.ingredientes?.length ? rec.ingredientes : [null]
    return ingredientes.map((ing, idx) => ({
    'ID Interno': rec.id || '',
    'Nombre': rec.nombre || '',
    'SKU Odoo': rec.sku_odoo || '',
    'SKU Template': rec.sku_template || '',
      'Activo': rec.activo !== false ? 'Sí' : 'No',
      'Ingrediente #': ing ? idx + 1 : '',
      'Ingrediente': ing?.nombre || '',
      'SKU Ing': ing?.sku || '',
      'Producto ID': ing?.producto_id || '',
      'Cantidad Uso': ing?.cantidad || '',
      'Unidad Uso': ing?.unidad_medida || '',
      'Unidad Uso ID': ing?.consumption_unit_id || '',
      'UoM Compra': ing?.especificacion || '',
      'UoM Compra ID': ing?.purchase_unit_id || '',
      'Cant x Compra': ing?.purchase_unit_qty || '',
      'Costo Unitario': ing?.costo_unitario || '',
      'Subtotal': ing ? ((ing.subtotal_efectivo ?? (ing.costo_unitario || 0) * (ing.cantidad || 0))) : '',
    'Costo Total': rec.costo_total || 0,
    }))
  })

  const ws = XLSX.utils.json_to_sheet(dataToExport)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Recetas')
  XLSX.writeFile(wb, `recetas_${new Date().toISOString().split('T')[0]}.xlsx`)
  return recetarios.length
}

function parseExcelRecetarios(buffer, productos = [], unidadesDB = []) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const headerRow = rows[0] || []
  const headerMap = new Map(headerRow.map((h, idx) => [normalizeHeader(h), idx]))
  const dataRows = rows.slice(1).filter(r => r.some(cell => String(cell || '').trim()))

  const col = (aliases, fallbackIndex) => {
    for (const alias of aliases) {
      const idx = headerMap.get(normalizeHeader(alias))
      if (idx !== undefined) return idx
    }
    return fallbackIndex
  }

  const idxNombre = col(['Producto', 'Nombre'], 0)
  const idxSkuOdoo = col(['SKU_Odoo', 'SKU Odoo'], 1)
  const idxIngNombre = col(['Ingrediente'], 2)
  const idxIngSku = col(['SKU_Ing (codigo_legible)', 'SKU_Ing', 'SKU Ing'], 3)
  const idxCantidad = col(['Cantidad Uso', 'Cantidad'], 4)
  const idxUnidadUso = col(['Unidad Uso', 'Unidad'], 5)
  const idxPurchaseQty = col(['Cant x Compra', 'Cant. por Unidad', 'Cant Compra'], 6)
  const idxCosto = col(['Costo Unitario', 'Costo_Unit', 'Costo Unit'], 7)
  const idxSkuTemplate = col(['SKU Template', 'SKU_Template'], -1)
  const idxActivo = col(['Activo'], -1)
  const idxProductoId = col(['Producto ID', 'ID Producto'], -1)
  const idxUnidadUsoId = col(['Unidad Uso ID', 'Consumption Unit ID'], -1)
  const idxPurchaseUnit = col(['UoM Compra', 'Unidad Compra'], -1)
  const idxPurchaseUnitId = col(['UoM Compra ID', 'Purchase Unit ID'], -1)

  const prodByKey = new Map()
  for (const p of productos) {
    const keys = [p.id, p.codigo_legible, p.sku, p.nombre].filter(Boolean)
    keys.forEach(k => prodByKey.set(String(k).trim().toUpperCase(), p))
  }

  const get = (row, idx) => idx >= 0 ? row[idx] : ''
  const map = new Map()
  for (const row of dataRows) {
    const nombre = String(get(row, idxNombre) || '').trim()
    const skuOdoo = String(get(row, idxSkuOdoo) || '').trim().toUpperCase()
    const skuTemplate = String(get(row, idxSkuTemplate) || '').trim().toUpperCase()
    const ingNombre = String(get(row, idxIngNombre) || '').trim()
    const ingSku = String(get(row, idxIngSku) || '').trim().toUpperCase()
    const productoId = String(get(row, idxProductoId) || '').trim()
    const cantidad = parseNumberOrNull(get(row, idxCantidad)) || 0
    const unidadUso = String(get(row, idxUnidadUso) || '').trim()
    const unidadUsoId = String(get(row, idxUnidadUsoId) || '').trim()
    const purchaseUnitRaw = String(get(row, idxPurchaseUnit) || '').trim()
    const purchaseUnitIdRaw = String(get(row, idxPurchaseUnitId) || '').trim()
    const purchaseUnitQtyRaw = parseNumberOrNull(get(row, idxPurchaseQty))
    const costoRaw = parseNumberOrNull(get(row, idxCosto)) || 0
    const activo = parseBool(get(row, idxActivo), true)

    if (!skuOdoo || !ingNombre) continue
    if (!map.has(skuOdoo)) map.set(skuOdoo, { nombre, sku_odoo: skuOdoo, sku_template: skuTemplate, activo, ingredientes: [] })
    const receta = map.get(skuOdoo)
    if (nombre && !receta.nombre) receta.nombre = nombre
    if (skuTemplate && !receta.sku_template) receta.sku_template = skuTemplate
    receta.activo = activo

    const matchedProd = prodByKey.get(productoId.toUpperCase()) || prodByKey.get(ingSku) || prodByKey.get(ingNombre.toUpperCase()) || null
    const purchaseUnit = resolveUnit(unidadesDB, purchaseUnitIdRaw) || resolveUnit(unidadesDB, purchaseUnitRaw)
    const consumptionUnit = resolveUnit(unidadesDB, unidadUsoId) || resolveUnit(unidadesDB, unidadUso)
    const purchaseUnitId = purchaseUnit?.id || matchedProd?.purchase_unit_id || ''
    const consumptionUnitId = consumptionUnit?.id || (unidadUsoId === '__presentation__' ? '__presentation__' : '') || purchaseUnitId
    const purchaseUnitQty = purchaseUnitQtyRaw ?? matchedProd?.purchase_unit_qty ?? null
    const unitError = (unidadUso && !consumptionUnit && unidadUsoId !== '__presentation__')
      ? `Unidad de uso "${unidadUso}" no encontrada`
      : null
    const purchaseUnitError = ((purchaseUnitRaw || purchaseUnitIdRaw) && !purchaseUnit)
      ? `UoM compra "${purchaseUnitRaw || purchaseUnitIdRaw}" no encontrada`
      : null

    receta.ingredientes.push({
      nombre: matchedProd ? matchedProd.nombre : ingNombre,
      sku: ingSku || matchedProd?.codigo_legible || matchedProd?.id || null,
      producto_id: matchedProd ? matchedProd.id : null,
      especificacion: matchedProd?.especificacion || (purchaseUnitQty && purchaseUnit ? `${purchaseUnitQty} ${unitDisplayName(purchaseUnit)}`.trim() : purchaseUnitRaw),
      cantidad,
      unidad_medida: consumptionUnitId === '__presentation__'
        ? `Unidad (${purchaseUnitQty || matchedProd?.purchase_unit_qty || 1} ${unitDisplayName(purchaseUnit) || matchedProd?.unidad_medida || ''})`.trim()
        : (consumptionUnit?.nombre || matchedProd?.unidad_medida || unidadUso),
      costo_unitario: matchedProd ? (parseFloat(matchedProd.costo_unidad) || costoRaw) : costoRaw,
      purchase_unit_id: purchaseUnitId,
      purchase_unit_qty: purchaseUnitQty,
      consumption_unit_id: consumptionUnitId,
      unit_error: unitError || purchaseUnitError,
    })
  }
  return Array.from(map.values())
}

const TABS = [
  { id: 'recetas', label: 'Recetas (BOM)', icon: BookOpen },
  { id: 'mapeo_pos', label: 'Mapeo POS', icon: MapPin },
  { id: 'salidas', label: 'Salidas', icon: ArrowDownLeft }
]

// ─── Componente principal: Salidas Odoo (módulo unificado) ────────────────────

export default function SalidasOdoo() {
  const [activeTab, setActiveTab] = useState('recetas')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-ocean p-6 shadow-card">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Store className="text-white" size={28} />
            <h1 className="text-3xl font-bold text-white">Salidas Odoo</h1>
          </div>
          <p className="text-white/90">Recetas BOM, mapeo de puntos de venta y salidas automáticas de inventario</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-card border border-slate-100 dark:border-slate-700">
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${
                  isActive
                    ? 'border-primary-600 text-primary-700 dark:text-primary-400 bg-primary-50/50 dark:bg-primary-900/10'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                }`}>
                <Icon size={18} />{tab.label}
              </button>
            )
          })}
        </div>
        <div className="p-6">
          {activeTab === 'recetas' && <TabRecetas />}
          {activeTab === 'mapeo_pos' && <TabMapeoPOS />}
          {activeTab === 'salidas' && <TabSalidas />}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: RECETAS (BOM)
// ═══════════════════════════════════════════════════════════════════════════════

function TabRecetas() {
  const { recetas: recetarios, isLoading, crearReceta: crearRecetario, actualizarReceta: actualizarRecetario, eliminarReceta: eliminarRecetario, duplicarReceta, importarRecetas: importarRecetarios } = useSalidasOdoo()
  const toast = useToastStore()
  const { canEdit, canDelete: canDeletePerm, isReadOnly } = usePermissions()
  const { data: productosParaImport = [] } = useQuery({ queryKey: ['productos'], queryFn: () => dataService.getProductos() })
  const { data: unidadesDB = [] } = useQuery({ queryKey: ['config-unidades'], queryFn: () => dataService.getUnidadesMedida() })
  const { data: equivalencias = [] } = useQuery({ queryKey: ['config-equivalencias'], queryFn: () => dataService.getUnitEquivalences() })
  const eqMap = useMemo(() => buildEquivalenceMap(equivalencias), [equivalencias])
  const canWrite = canEdit('salidas_odoo')
  const canDel   = canDeletePerm('salidas_odoo')
  const readOnly = isReadOnly('recetarios')

  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todas') // 'todas', 'con_receta', 'sin_receta'
  const [odooProducts, setOdooProducts] = useState([])
  const [sincronizando, setSincronizando] = useState(false)
  const [expandidos, setExpandidos] = useState(() => new Set())
  const [modalForm, setModalForm] = useState(false)
  const [modalImport, setModalImport] = useState(false)
  const [editando, setEditando] = useState(null)
  const [filtroActivo, setFiltroActivo] = useState('activas') // 'todas', 'activas', 'inactivas'
  const [preview, setPreview] = useState(null)
  const [importando, setImportando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, nombre }
  const [confirmDuplicate, setConfirmDuplicate] = useState(null) // { id, nombre }
  const [sortRecetas, setSortRecetas] = useState({ column: 'nombre', direction: 'asc' })
  const fileRef = useRef()

  const handleEliminar = async () => {
    if (!confirmDelete) return
    const { id, nombre } = confirmDelete
    try { 
      await eliminarRecetario.mutateAsync(id)
      toast.success('Eliminada', `Receta "${nombre}" eliminada exitosamente`) 
      setConfirmDelete(null)
    }
    catch (e) { 
      toast.error('Error', e.message || 'Error al eliminar') 
    }
  }

  const handleDuplicar = async () => {
    if (!confirmDuplicate) return
    const { id, nombre } = confirmDuplicate
    try {
      const result = await duplicarReceta.mutateAsync(id)
      toast.success('Duplicada', `Receta "${nombre}" duplicada como inactiva`)
      setEditando(result)
      setModalForm(true)
      setConfirmDuplicate(null)
    } catch (e) {
      toast.error('Error', e.message || 'Error al duplicar')
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try { setPreview(parseExcelRecetarios(await file.arrayBuffer(), productosParaImport, unidadesDB)) }
    catch (err) { toast.error('Error', `Error al leer Excel: ${err.message}`) }
  }

  const handleConfirmarImport = async () => {
    if (!preview?.length) return
    setImportando(true)
    try { await importarRecetarios.mutateAsync(preview); toast.success('Importadas', `${preview.length} recetas importadas`); setModalImport(false); setPreview(null) }
    catch { toast.error('Error', 'Error al importar') }
    finally { setImportando(false) }
  }

  const handleSincronizarProductos = async () => {
    setSincronizando(true)
    try {
      const response = await dataService.getOdooProducts()
      setOdooProducts(response.products || [])
      toast.success('Sincronizado', `${response.products?.length || 0} productos de Odoo cargados`)
    } catch (error) {
      console.error('Error sincronizando productos Odoo:', error)
      toast.error('Error', 'No se pudieron traer los productos de Odoo')
    } finally {
      setSincronizando(false)
    }
  }

  const handleSortRecetas = (column) => {
    setSortRecetas(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const toggleExpandido = (recetaId) => {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(recetaId)) next.delete(recetaId)
      else next.add(recetaId)
      return next
    })
  }

  // Lógica de filtrado y comparación
  const displayData = useMemo(() => {
    const list = recetarios || []
    const b = busqueda.toLowerCase()
    
    // 1. Calcular los 'Con Receta' (Emparejados) primero y recalcular sus costos dinámicamente
    const listConReceta = list.filter(r => {
      const matchesActivo = filtroActivo === 'todas' ||
        (filtroActivo === 'activas' && r.activo !== false) ||
        (filtroActivo === 'inactivas' && r.activo === false)
      const matchesSearch = !busqueda || r.nombre?.toLowerCase().includes(b) || r.sku_odoo?.toLowerCase().includes(b)
      return matchesActivo && matchesSearch
    }).map(r => {
      let nuevoCostoTotal = 0
      const ingredientesActualizados = (r.ingredientes || []).map(ing => {
        const prodMatch = productosParaImport.find(p => p.id === ing.producto_id)
        const costoActual = prodMatch ? (parseFloat(prodMatch.costo_unidad) || 0) : (parseFloat(ing.costo_unitario) || 0)
        const purchaseQty = prodMatch?.purchase_unit_qty || 1
        const purchaseUnitId = ing.purchase_unit_id || ''
        const consumptionUnitId = ing.consumption_unit_id || purchaseUnitId
        const costoEfectivo = (purchaseUnitId && consumptionUnitId)
          ? calcCostInConsumptionUnit(costoActual, purchaseQty, purchaseUnitId, consumptionUnitId, eqMap)
          : costoActual
        const subtotalEfectivo = costoEfectivo * (parseFloat(ing.cantidad) || 0)
        nuevoCostoTotal += subtotalEfectivo
        return { ...ing, costo_unitario: costoActual, costo_efectivo: costoEfectivo, subtotal_efectivo: subtotalEfectivo }
      })
      return { ...r, ingredientes: ingredientesActualizados, costo_total: nuevoCostoTotal }
    })

    // 2. Calcular los 'Sin Receta' (Pendientes virtuales desde Odoo)
    const skusConfigurados = new Set(list.filter(r => r.activo !== false).map(r => r.sku_odoo?.toUpperCase()))
    const listSinReceta = odooProducts.filter(p => {
      const sku = (p.default_code || '').toUpperCase()
      const matchesSearch = !busqueda || p.name?.toLowerCase().includes(b) || sku.includes(b)
      return matchesSearch && !skusConfigurados.has(sku)
    }).map(p => ({
      id: `odoo-${p.id}`,
      nombre: p.display_name || p.name,
      sku_odoo: p.default_code || `ID:${p.id}`,
      id_odoo: p.id,
      esVirtual: true,
      ingredientes: []
    }))

    // 3. Retornar según el filtro seleccionado
    let result
    if (filtroEstado === 'con_receta') result = listConReceta
    else if (filtroEstado === 'sin_receta') result = listSinReceta
    else result = [...listConReceta, ...listSinReceta]
    
    const getters = {
      nombre: r => r.nombre || '',
      sku_odoo: r => r.sku_odoo || '',
      estado: r => r.esVirtual ? 'pendiente' : (r.activo === false ? 'inactiva' : 'activa'),
      ingredientes: r => r.ingredientes?.length || 0,
      costo_total: r => r.costo_total || 0,
    }
    const getter = getters[sortRecetas.column] || getters.nombre
    return [...result].sort((a, b) => {
      const cmp = compareValues(getter(a), getter(b))
      return sortRecetas.direction === 'asc' ? cmp : -cmp
    })
  }, [recetarios, busqueda, filtroEstado, filtroActivo, odooProducts, productosParaImport, eqMap, sortRecetas])

  const handleDescargarPlantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Producto', 'SKU_Odoo', 'SKU_Template', 'Activo', 'Ingrediente', 'SKU_Ing', 'Producto ID', 'Cantidad Uso', 'Unidad Uso', 'Unidad Uso ID', 'UoM Compra', 'UoM Compra ID', 'Cant x Compra', 'Costo Unitario'],
      ['Bubble Tea', 'BB-TEA-M', 'BB-TEA', 'Sí', 'Té Negro Base', 'PROD00001', '', 200, 'ml', '', 'Litro', '', 1, 0.012],
      ['Bubble Tea', 'BB-TEA-M', 'BB-TEA', 'Sí', 'Perlas de Tapioca', 'PROD00003', '', 50, 'g', '', 'Kilogramo', '', 1, 0.08],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Recetas')
    XLSX.writeFile(wb, 'plantilla_recetas.xlsx')
  }

  return (
    <div className="space-y-5">
      {/* Actions bar */}
      <div className="flex flex-col gap-4">
        {/* Filtros de Sincronización (Tabs superiores) */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 ml-1">Estatus Sincronización Odoo</label>
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-2xl w-fit border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
            <button onClick={() => setFiltroEstado('todas')} className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${filtroEstado === 'todas' ? 'bg-white dark:bg-slate-700 text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Todas
            </button>
            <button onClick={() => setFiltroEstado('sin_receta')} className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${filtroEstado === 'sin_receta' ? 'bg-white dark:bg-slate-700 text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <RefreshCw size={12} className={filtroEstado === 'sin_receta' ? 'animate-spin' : ''} /> Pendientes
            </button>
            <button onClick={() => setFiltroEstado('con_receta')} className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${filtroEstado === 'con_receta' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <CheckCircle size={12} /> Completados
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="flex flex-1 flex-col sm:flex-row items-center gap-3 w-full sm:max-w-3xl">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="Buscar por nombre o SKU..."
                value={busqueda} onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all shadow-sm" />
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex flex-col">
                <select 
                  value={filtroActivo} 
                  onChange={e => setFiltroActivo(e.target.value)}
                  className="w-full sm:w-44 px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary-500 transition-all outline-none"
                >
                  <option value="activas">Solo Recetas Activas</option>
                  <option value="todas">Todas las Recetas</option>
                  <option value="inactivas">Solo Recetas Inactivas</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button 
              variant="outline"
              size="sm"
              onClick={handleSincronizarProductos}
              loading={sincronizando}
              disabled={sincronizando}
              className="bg-white dark:bg-slate-800"
            >
              <ArrowRightLeft size={15} className={`mr-1.5 ${sincronizando ? 'animate-spin' : ''}`} /> Sincronizar
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => { const c = exportarRecetarios(displayData); if (c) toast.success('Exportado', `${c} recetas exportadas`) }}
              className="bg-white dark:bg-slate-800"
            >
              <Download size={15} className="mr-1.5" /> Exportar
            </Button>
            {canWrite && (
              <>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => { setModalImport(true); setPreview(null) }}
                  className="bg-white dark:bg-slate-800"
                >
                  <Upload size={15} className="mr-1.5" /> Importar
                </Button>
                <Button size="sm" onClick={() => { setEditando(null); setModalForm(true) }} className="bg-primary-600 hover:bg-primary-700 shadow-sm">
                  <Plus size={15} className="mr-1.5" /> Nueva Receta
                </Button>
              </>
            )}
          </div>
        </div>

      </div>
      <p className="text-xs text-slate-500">{displayData.length} item{displayData.length !== 1 ? 's' : ''} {filtroEstado === 'sin_receta' ? 'pendientes de configuración' : 'en total'}</p>

      {/* Table */}
      {isLoading ? <LoadingSpinner text="Cargando recetas..." /> : displayData.length === 0 ? (
        <div className="py-12 text-center">
          <BookOpen size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">
            {busqueda ? 'Sin resultados para esta búsqueda.' : 
             filtroEstado === 'sin_receta' ? '¡Increíble! Todos tus productos de Odoo están completados.' :
             'No hay recetas. Crea una nueva o importa desde Excel.'}
          </p>
          {canWrite && !busqueda && (
            <Button variant="primary" className="mt-4" onClick={() => { setEditando(null); setModalForm(true) }}>
              <Plus size={16} className="mr-1.5" /> Nueva Receta
            </Button>
          )}
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <SortableHeader label="Producto Odoo" column="nombre" sortConfig={sortRecetas} onSort={handleSortRecetas} />
                <SortableHeader label="SKU" column="sku_odoo" sortConfig={sortRecetas} onSort={handleSortRecetas} />
                <SortableHeader label="Estatus Receta" column="estado" sortConfig={sortRecetas} onSort={handleSortRecetas} align="center" />
                <SortableHeader label="Ingredientes" column="ingredientes" sortConfig={sortRecetas} onSort={handleSortRecetas} align="center" />

                <SortableHeader label="Costo Total" column="costo_total" sortConfig={sortRecetas} onSort={handleSortRecetas} align="right" />
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {displayData.map(rec => (
                <RecetaRow key={rec.id} rec={rec} expandidos={expandidos} onToggleExpand={toggleExpandido}
                  canWrite={canWrite} canDel={canDel} unidadesDB={unidadesDB}
                  onEdit={() => { setEditando(rec); setModalForm(true) }}
                  onDelete={() => setConfirmDelete({ id: rec.id, nombre: rec.nombre })}
                  onCrear={() => { setEditando({ nombre: rec.nombre, sku_odoo: rec.sku_odoo }); setModalForm(true) }}
                  onDuplicate={() => setConfirmDuplicate({ id: rec.id, nombre: rec.nombre })} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modales de Confirmación */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleEliminar}
        title="¿Eliminar Receta?"
        message={`¿Estás seguro que deseas eliminar permanentemente la receta de "${confirmDelete?.nombre}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar permanentemente"
        variant="danger"
        icon={Trash2}
        loading={eliminarRecetario.isPending}
      />

      <ConfirmModal
        isOpen={!!confirmDuplicate}
        onClose={() => setConfirmDuplicate(null)}
        onConfirm={handleDuplicar}
        title="¿Duplicar Receta?"
        message={`Se creará una copia de "${confirmDuplicate?.nombre}" en estado inactivo para que puedas editarla.`}
        confirmText="Duplicar ahora"
        variant="info"
        icon={Copy}
        loading={duplicarReceta.isPending}
      />

      {modalForm && (
        <ModalReceta receta={editando} readOnly={readOnly}
          onClose={() => { setModalForm(false); setEditando(null) }}
          onCreate={async (data) => { await crearRecetario.mutateAsync(data); toast.success('Creada', 'Receta creada'); setModalForm(false) }}
          onUpdate={async (id, data) => { await actualizarRecetario.mutateAsync({ id, data }); toast.success('Actualizada', 'Receta actualizada'); setModalForm(false); setEditando(null) }}
        />
      )}

      {modalImport && (
        <ModalImportExcel fileRef={fileRef} preview={preview} importando={importando}
          onFileChange={handleFileChange} onDescargar={handleDescargarPlantilla}
          onConfirmar={handleConfirmarImport} onClose={() => { setModalImport(false); setPreview(null) }} />
      )}
    </div>
  )
}

// ─── Receta Row (expandable) ──────────────────────────────────────────────────

function RecetaRow({ rec, expandidos, onToggleExpand, canWrite, canDel, onEdit, onDelete, onCrear, onDuplicate, unidadesDB = [] }) {
  const isOpen = expandidos.has(rec.id)
  return (
    <>
      <tr className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors ${rec.activo === false ? 'opacity-50' : ''}`}
        onClick={() => onToggleExpand(rec.id)}>
        <td className="px-4 py-3">{isOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-blue-500 shrink-0" />
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{rec.nombre}</span>
          </div>
        </td>
        <td className="px-4 py-3"><span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold truncate max-w-[120px] inline-block">{rec.sku_odoo}</span></td>
        <td className="px-4 py-3 text-center">
          {rec.esVirtual ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/40">
              Pendiente
            </span>
          ) : (
            rec.activo !== false ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/40">
                <CheckCircle size={10} /> Activa
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400">
                <XCircle size={10} /> Inactiva
              </span>
            )
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${(rec.ingredientes?.length || 0) > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
            {rec.ingredientes?.length || 0}
          </span>
        </td>
        <td className="px-4 py-3 text-right font-bold text-sm text-slate-900 dark:text-slate-100">{fmtCosto(rec.costo_total)}</td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex justify-end gap-1">
            {rec.esVirtual ? (
              <button 
                onClick={onCrear} 
                title="Configurar Receta"
                disabled={!canWrite}
                className={`p-1.5 rounded-lg transition-colors ${canWrite ? 'text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30' : 'text-slate-300 cursor-not-allowed'}`}
              >
                <SlidersHorizontal size={15} strokeWidth={2.5} />
              </button>
            ) : (
              <>
                <button onClick={onDuplicate} disabled={!canWrite} title="Duplicar receta" className={`p-1.5 rounded-lg transition-colors ${canWrite ? 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700' : 'text-slate-300 cursor-not-allowed'}`}><Copy size={14} /></button>
                <button onClick={onEdit} disabled={!canWrite} className={`p-1.5 rounded-lg transition-colors ${canWrite ? 'text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30' : 'text-slate-300 cursor-not-allowed'}`}><Edit2 size={14} /></button>
                {canDel && <button onClick={onDelete} className="p-1.5 text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-lg transition-colors"><Trash2 size={14} /></button>}
              </>
            )}
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={7} className="px-4 pb-3 bg-slate-50 dark:bg-slate-700/20">
            <div className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-100 dark:bg-slate-600/50">
                  {['Ingrediente', 'SKU', 'UoM Compra', 'Costo/u', 'Cantidad Uso', 'Unidad Uso', 'Subtotal'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-600 bg-white dark:bg-slate-800">
                  {(rec.ingredientes || []).map((ing, j) => (
                    <tr key={j}>
                      <td className="px-3 py-2"><div className="flex items-center gap-1.5"><Package size={13} className="text-slate-400" /><span className="font-medium text-slate-800 dark:text-slate-200">{ing.nombre}</span></div></td>
                      <td className="px-3 py-2 text-xs text-slate-500 font-mono">{ing.sku || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{ing.especificacion || '—'}</td>
                      <td className="px-3 py-2 text-right">{fmtCosto(ing.costo_unitario)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{ing.cantidad}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                        {ing.consumption_unit_id === '__presentation__'
                          ? `Unidad (${unidadesDB.find(u => u.id === ing.purchase_unit_id)?.abreviatura || ing.unidad_medida})`
                          : (unidadesDB.find(u => u.id === ing.consumption_unit_id)?.nombre || ing.unidad_medida || '—')}
                      </td>
                      <td className="px-3 py-2 text-right font-bold">{fmtCosto(ing.subtotal_efectivo ?? (ing.costo_unitario || 0) * (ing.cantidad || 0))}</td>
                    </tr>
                  ))}
                  <tr className="bg-primary-50 dark:bg-primary-900/20">
                    <td colSpan={6} className="px-3 py-2 text-right text-xs font-bold text-primary-700 dark:text-primary-300">Costo total:</td>
                    <td className="px-3 py-2 text-right font-bold text-primary-700 dark:text-primary-300">{fmtCosto(rec.costo_total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Modal: Nueva / Editar Receta ─────────────────────────────────────────────

function ModalReceta({ receta, readOnly, onClose, onCreate, onUpdate }) {
  const initial = receta || { nombre: '', sku_odoo: '', sku_template: '', ingredientes: [] }
  const [form, setForm] = useState({
    nombre: initial.nombre || '', sku_odoo: initial.sku_odoo || '', sku_template: initial.sku_template || '',
    ingredientes: initial.ingredientes?.length ? initial.ingredientes.map(ing => ({ ...ing, _uiKey: ing._uiKey || createIngredienteUiKey() })) : []
  })
  const [activo, setActivo] = useState(receta ? (receta.activo !== false) : true)
  const toast = useToastStore()
  const [guardando, setGuardando] = useState(false)
  const [activeSearchRow, setActiveSearchRow] = useState(null)
  const [prodSearchTerm, setProdSearchTerm] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [draggedIngredienteIndex, setDraggedIngredienteIndex] = useState(null)
  const [dragOverIngredienteIndex, setDragOverIngredienteIndex] = useState(null)

  const { data: productos = [], isLoading: loadingProductos } = useQuery({ queryKey: ['productos'], queryFn: () => dataService.getProductos() })
  const { data: unidadesDB = [] } = useQuery({ queryKey: ['config-unidades'], queryFn: () => dataService.getUnidadesMedida() })
  const { data: equivalencias = [] } = useQuery({ queryKey: ['config-equivalencias'], queryFn: () => dataService.getUnitEquivalences() })
  const eqMap = useMemo(() => buildEquivalenceMap(equivalencias), [equivalencias])
  const productosActivos = productos.filter(p => p.estado !== 'INACTIVO' && p.estado !== 'ELIMINADO')
  const productosFiltrados = prodSearchTerm.length > 1
    ? productosActivos.filter(p =>
        p.nombre?.toLowerCase().includes(prodSearchTerm.toLowerCase()) ||
        String(p.codigo_legible || p.id).toLowerCase().includes(prodSearchTerm.toLowerCase()) ||
        (p.especificacion || '').toLowerCase().includes(prodSearchTerm.toLowerCase())
      ).slice(0, 15)
    : []

  const costoTotal = useMemo(() =>
    form.ingredientes.reduce((s, ing) => {
      const prod = productosActivos.find(p => p.id === ing.producto_id) || {}
      const purchaseQty = prod.purchase_unit_qty || 1
      const purchaseUnitId = ing.purchase_unit_id || ''
      const consumptionUnitId = ing.consumption_unit_id || purchaseUnitId
      const costPerConsUnit = (purchaseUnitId && consumptionUnitId)
        ? calcCostInConsumptionUnit(ing.costo_unitario || 0, purchaseQty, purchaseUnitId, consumptionUnitId, eqMap)
        : (ing.costo_unitario || 0)
      return s + costPerConsUnit * (parseFloat(ing.cantidad) || 0)
    }, 0)
  , [form.ingredientes, productosActivos, eqMap])
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addIngrediente = () => {
    setForm(f => ({ ...f, ingredientes: [...f.ingredientes, { _uiKey: createIngredienteUiKey(), nombre: '', sku: '', producto_id: null, especificacion: '', cantidad: 0, unidad_medida: '', costo_unitario: 0, consumption_unit_id: '', purchase_unit_id: '' }] }))
    setTimeout(() => { setActiveSearchRow(form.ingredientes.length); setProdSearchTerm('') }, 50)
  }

  const moveIngrediente = (fromIndex, toIndex) => {
    setForm(f => {
      if (fromIndex === toIndex || fromIndex == null || toIndex == null || fromIndex < 0 || toIndex < 0 || fromIndex >= f.ingredientes.length || toIndex >= f.ingredientes.length) return f
      const ingredientes = [...f.ingredientes]
      const [moved] = ingredientes.splice(fromIndex, 1)
      ingredientes.splice(toIndex, 0, moved)
      return { ...f, ingredientes }
    })
  }

  const resetDragState = () => {
    setDraggedIngredienteIndex(null)
    setDragOverIngredienteIndex(null)
  }

  const handleDragStartIngrediente = (index, event) => {
    if (readOnly) return
    setDraggedIngredienteIndex(index)
    setDragOverIngredienteIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  const handleDragOverIngrediente = (index, event) => {
    if (readOnly || draggedIngredienteIndex == null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragOverIngredienteIndex !== index) setDragOverIngredienteIndex(index)
  }

  const handleDropIngrediente = (index, event) => {
    if (readOnly || draggedIngredienteIndex == null) return
    event.preventDefault()
    const fromIndex = draggedIngredienteIndex
    resetDragState()
    if (fromIndex === index) return
    moveIngrediente(fromIndex, index)
    toast.success('Orden actualizado', 'Los componentes de la receta se reordenaron correctamente')
  }

  const selectProductForIngrediente = (i, prod) => {
    setForm(f => ({ ...f, ingredientes: f.ingredientes.map((ing, idx) => idx === i ? {
      ...ing, nombre: prod.nombre, sku: prod.codigo_legible || prod.id, producto_id: prod.id,
      especificacion: prod.especificacion || '', unidad_medida: prod.unidad_medida || '', costo_unitario: prod.costo_unidad || 0,
      purchase_unit_id: prod.purchase_unit_id || '', consumption_unit_id: prod.purchase_unit_id || ''
    } : ing) }))
    setActiveSearchRow(null); setProdSearchTerm('')
  }

  const clearProduct = (i) => {
    setForm(f => ({ ...f, ingredientes: f.ingredientes.map((ing, idx) => idx === i ? { ...ing, nombre: '', sku: '', producto_id: null, especificacion: '', unidad_medida: '', costo_unitario: 0 } : ing) }))
    setActiveSearchRow(i); setProdSearchTerm('')
  }

  const updateConsumptionUnit = (i, unitId) => {
    setForm(f => ({ ...f, ingredientes: f.ingredientes.map((ing, idx) => {
      if (idx !== i) return ing
      let unidad_medida = ing.unidad_medida
      if (unitId === '__presentation__') {
        const prod = productosActivos.find(p => p.id === ing.producto_id) || {}
        const unitTarget = unidadesDB.find(u => u.id === ing.purchase_unit_id)
        const bSym = unitTarget?.abreviatura || unitTarget?.nombre || prod.unidad_medida || ing.unidad_medida || ''
        const qQty = prod.purchase_unit_qty || 1
        unidad_medida = `Unidad (${qQty} ${bSym})`.trim()
      } else {
        const unit = unidadesDB.find(u => u.id === unitId)
        if (unit) unidad_medida = unit.nombre
      }
      return { ...ing, consumption_unit_id: unitId, unidad_medida }
    }) }))
  }

  const updateCantidad = (i, v) => {
    // Al guardar la cantidad como string temporal logramos que permita ingresar decimales ej: '0.01'
    setForm(f => ({ ...f, ingredientes: f.ingredientes.map((ing, idx) => idx === i ? { ...ing, cantidad: v } : ing) }))
  }

  const removeIngrediente = (i) => {
    setForm(f => ({ ...f, ingredientes: f.ingredientes.filter((_, idx) => idx !== i) }))
    if (activeSearchRow === i) setActiveSearchRow(null)
  }

  const handleSubmit = async () => {
    if (!form.nombre || !form.sku_odoo) {
      toast.error('Campos incompletos', 'El nombre y SKU de Odoo son obligatorios')
      return
    }
    setGuardando(true)
    
    // Parsear cantidades de string a números formales antes de subirlos a Firebase
    const formPreparado = {
      ...form,
      activo,
      ingredientes: form.ingredientes.map(({ _uiKey, ...ing }) => ({
        ...ing,
        cantidad: parseFloat(parseFloat(ing.cantidad).toFixed(3)) || 0
      }))
    }

    try { 
      if (receta && receta.id) {
        await onUpdate(receta.id, formPreparado) 
      } else {
        await onCreate(formPreparado) 
      }
    } catch (error) {
      console.error('Error guardando receta:', error)
      toast.error('Error', error.message || 'Hubo un problema al guardar la receta')
    } finally { 
      setGuardando(false) 
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 md:p-4">
      <div className={`bg-white dark:bg-slate-800 shadow-2xl w-full flex flex-col transition-all duration-300 ${
        isExpanded
          ? 'rounded-2xl max-w-[calc(100vw-1.5rem)] lg:max-w-[calc(100vw-7rem)] h-[calc(100vh-1.5rem)]'
          : 'rounded-2xl max-w-5xl max-h-[85vh]'
      }`}>
        <div className="relative overflow-hidden bg-gradient-ocean p-5 shrink-0 rounded-t-2xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3"><BookOpen className="text-white" size={22} /><h2 className="text-xl font-bold text-white">{receta ? 'Editar Receta' : 'Nueva Receta'}</h2></div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsExpanded(v => !v)}
                className="p-1.5 hover:bg-white/20 rounded-xl"
                title={isExpanded ? 'Minimizar vista' : 'Ampliar vista'}
              >
                {isExpanded ? <Minimize2 className="text-white" size={18} /> : <Maximize2 className="text-white" size={18} />}
              </button>
              <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-xl"><X className="text-white" size={20} /></button>
            </div>
          </div>
        </div>
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nombre del producto Odoo</label>
                <input value={form.nombre} onChange={e => setField('nombre', e.target.value)} disabled={readOnly} placeholder="ej: Bubble Tea Taro"
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 disabled:opacity-60" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">SKU Odoo</label>
                <input value={form.sku_odoo} onChange={e => setField('sku_odoo', e.target.value.toUpperCase())} disabled={readOnly} placeholder="ej: BB-TARO-M"
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 font-mono disabled:opacity-60" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">SKU Template <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input value={form.sku_template} onChange={e => setField('sku_template', e.target.value.toUpperCase())} disabled={readOnly} placeholder="ej: BB-TARO"
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 font-mono disabled:opacity-60" />
              </div>
            </div>
            <div className="flex flex-col" style={{ minHeight: '300px', maxHeight: '500px' }}>
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Package size={18} className="text-primary-600" /> Ingredientes (Materiales)
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full text-xs font-semibold">{form.ingredientes.length}</span>
                </h4>
                {!readOnly && <Button size="sm" onClick={addIngrediente}><Plus size={15} className="mr-1.5" /> Agregar</Button>}
              </div>
              <div className="border border-slate-200 dark:border-slate-600 rounded-xl flex-1 flex flex-col overflow-hidden">
                {form.ingredientes.length === 0 ? (
                  <div className="py-10 text-center"><Package size={36} className="mx-auto text-slate-300 mb-2" /><p className="text-sm text-slate-500">Sin ingredientes. Busca y agrega productos del inventario.</p></div>
                ) : (
                  <div className="overflow-y-auto overflow-x-visible flex-1">
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col className="w-[5%]" />
                      <col className="w-[30%]" />
                      <col className="w-[12%]" />
                      <col className="w-[12%]" />
                      <col className="w-[13%]" />
                      <col className="w-[12%]" />
                      <col className="w-[10%]" />
                      <col className="w-[6%]" />
                    </colgroup>
                    <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0 z-10">
                      <tr>
                        <th className="px-2 py-3"></th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">Producto</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">UoM Compra</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">Costo/u</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">Unidad Uso</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">Cantidad Uso</th>
                        <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">Subtotal</th>
                        <th className="px-2 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                      {form.ingredientes.map((ing, i) => (
                        <tr
                          key={ing._uiKey || i}
                          onDragOver={e => handleDragOverIngrediente(i, e)}
                          onDrop={e => handleDropIngrediente(i, e)}
                          onDragEnd={resetDragState}
                          className={dragOverIngredienteIndex === i && draggedIngredienteIndex !== i ? 'bg-primary-50/80 dark:bg-primary-900/10' : ''}
                        >
                          <td className="px-2 py-2.5 text-center">
                            {!readOnly && (
                              <button
                                type="button"
                                draggable
                                onDragStart={e => handleDragStartIngrediente(i, e)}
                                onDragEnd={resetDragState}
                                className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-grab active:cursor-grabbing dark:hover:bg-slate-700"
                                title="Reordenar componente"
                              >
                                <GripVertical size={14} />
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="relative">
                              {ing.producto_id && activeSearchRow !== i ? (
                                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                                  <Package size={13} className="text-blue-600 shrink-0" />
                                  <span className="text-sm font-medium text-blue-800 dark:text-blue-300 truncate flex-1">{ing.nombre}</span>
                                  {!readOnly && <button type="button" onClick={() => clearProduct(i)} className="shrink-0 p-0.5 hover:bg-blue-200 rounded"><X size={11} className="text-blue-600" /></button>}
                                </div>
                              ) : (
                                <div>
                                  <div className="relative">
                                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input type="text" placeholder={loadingProductos ? 'Cargando...' : 'Buscar producto...'}
                                      value={activeSearchRow === i ? prodSearchTerm : (ing.nombre || '')}
                                      onFocus={() => { setActiveSearchRow(i); setProdSearchTerm(ing.nombre || '') }}
                                      onChange={e => { setActiveSearchRow(i); setProdSearchTerm(e.target.value) }}
                                      onBlur={() => setTimeout(() => setActiveSearchRow(prev => prev === i ? null : prev), 200)}
                                      disabled={readOnly}
                                      className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 disabled:opacity-60" />
                                  </div>
                                  {activeSearchRow === i && prodSearchTerm.length > 1 && (
                                    <div className="absolute z-[100] left-0 right-0 mt-1 max-h-[500px] overflow-y-auto bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl shadow-xl">
                                      {productosFiltrados.length === 0 ? (
                                        <div className="p-3 text-center text-sm text-slate-500">No se encontraron productos</div>
                                      ) : productosFiltrados.map(prod => (
                                        <button key={prod.id} type="button" onMouseDown={() => selectProductForIngrediente(i, prod)}
                                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-primary-50 dark:hover:bg-slate-600 text-left border-b border-slate-100 dark:border-slate-600 last:border-0">
                                          <Package size={14} className="text-primary-600 shrink-0" />
                                          <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{prod.nombre}</p>
                                            <p className="text-xs text-slate-400">{prod.codigo_legible || prod.id}{prod.especificacion ? ` · ${prod.especificacion}` : ''}{prod.unidad_medida ? ` · ${prod.unidad_medida}` : ''}{prod.costo_unidad ? ` · $${Number(prod.costo_unidad).toLocaleString()}` : ''}</p>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400 truncate">{ing.especificacion || '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{fmtCosto(ing.costo_unitario)}</span>
                            {ing.purchase_unit_id && ing.consumption_unit_id && ing.consumption_unit_id !== ing.purchase_unit_id && ing.consumption_unit_id !== '__presentation__' && (
                              <p className="text-[10px] text-blue-500 mt-0.5">
                                {(() => {
                                  const prod = productosActivos.find(p => p.id === ing.producto_id)
                                  const qty = prod?.purchase_unit_qty || 1
                                  const cost = calcCostInConsumptionUnit(ing.costo_unitario, qty, ing.purchase_unit_id, ing.consumption_unit_id, eqMap)
                                  const u = unidadesDB.find(u => u.id === ing.consumption_unit_id)
                                  return cost > 0 ? `${fmtCosto(cost)}/${u?.abreviatura || ''}` : ''
                                })()}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {ing.purchase_unit_id ? (
                              <select
                                value={ing.consumption_unit_id || ing.purchase_unit_id || ''}
                                onChange={e => updateConsumptionUnit(i, e.target.value)}
                                disabled={readOnly}
                                className="w-full px-1.5 py-1 text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-1 focus:ring-primary-500 disabled:opacity-60"
                              >
                                {(() => {
                                  const prod = productosActivos.find(p => p.id === ing.producto_id) || {}
                                  const unitTarget = unidadesDB.find(u => u.id === ing.purchase_unit_id)
                                  const bSym = unitTarget?.abreviatura || unitTarget?.nombre || prod.unidad_medida || ing.unidad_medida || ''
                                  const qQty = prod.purchase_unit_qty || 1
                                  return (
                                    <>
                                      {qQty > 1 && (
                                        <option value="__presentation__">Unidad ({qQty} {bSym})</option>
                                      )}
                                      {getCompatibleUnits(ing.purchase_unit_id, eqMap).map(uid => {
                                        const u = unidadesDB.find(x => x.id === uid)
                                        return u ? <option key={uid} value={uid}>{u.abreviatura || u.nombre}</option> : null
                                      })}
                                    </>
                                  )
                                })()}
                              </select>
                            ) : (
                              <select
                                disabled
                                className="w-full px-1.5 py-1 text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg opacity-60 cursor-not-allowed"
                              >
                                <option>{ing.unidad_medida || 'Sin UoM'}</option>
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <input type="number" value={ing.cantidad || ''} onChange={e => updateCantidad(i, e.target.value)}
                              disabled={readOnly} min={0} step="0.001" placeholder="0.000"
                              className="w-full px-2.5 py-2 text-sm text-center font-bold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 disabled:opacity-60" />
                          </td>
                          <td className="px-3 py-2.5 text-right text-sm font-bold text-slate-900 dark:text-slate-100">{(() => {
                            const prod = productosActivos.find(p => p.id === ing.producto_id) || {}
                            const purchaseQty = prod.purchase_unit_qty || 1
                            const purchaseUnitId = ing.purchase_unit_id || ''
                            const consumptionUnitId = ing.consumption_unit_id || purchaseUnitId
                            const costPerConsUnit = (purchaseUnitId && consumptionUnitId)
                              ? calcCostInConsumptionUnit(ing.costo_unitario || 0, purchaseQty, purchaseUnitId, consumptionUnitId, eqMap)
                              : (ing.costo_unitario || 0)
                            return fmtCosto(costPerConsUnit * (parseFloat(ing.cantidad) || 0))
                          })()}</td>
                          <td className="px-2 py-2.5 text-center">
                            {!readOnly && <button type="button" onClick={() => removeIngrediente(i)} className="p-1.5 text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-lg transition-colors"><Trash2 size={14} /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between px-6 py-3 mx-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl shrink-0">
            <span className="text-sm font-semibold text-green-800 dark:text-green-300 flex items-center gap-2"><DollarSign size={16} /> Costo total de la receta</span>
            <span className="text-lg font-bold text-green-800 dark:text-green-300">{fmtCosto(costoTotal)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between p-5 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            {receta && receta.id && (
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-2xl border border-slate-200 dark:border-slate-600">
                <span className={`text-xs font-bold uppercase tracking-wider ${activo ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {activo ? 'Receta Activa' : 'Receta Inactiva'}
                </span>
                <button 
                  type="button" 
                  onClick={() => {
                    if (activo) {
                      if (window.confirm('¿Desactivar receta? Las ventas podrían generar errores de inventario hasta que otra receta sea activada.')) setActivo(false)
                    } else setActivo(true)
                  }} 
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 shadow-sm ${activo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ${activo ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={guardando}>{readOnly ? 'Cerrar' : 'Cancelar'}</Button>
            {!readOnly && <Button onClick={handleSubmit} disabled={!form.nombre || !form.sku_odoo || guardando} loading={guardando}><Save size={16} className="mr-2" /> {receta ? 'Actualizar' : 'Crear Receta'}</Button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Importar Excel ────────────────────────────────────────────────────

function ModalImportExcel({ fileRef, preview, importando, onFileChange, onDescargar, onConfirmar, onClose }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3"><FileSpreadsheet size={22} className="text-green-600" /><h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Importar Recetas desde Excel</h3></div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={20} className="text-slate-500" /></button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[calc(90vh-80px)] space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">Columnas: <span className="font-semibold">Producto | SKU_Odoo | SKU_Template | Activo | Ingrediente | SKU_Ing | Producto ID | Cantidad Uso | Unidad Uso | Unidad Uso ID | UoM Compra | UoM Compra ID | Cant x Compra | Costo Unitario</span></p>
          <button onClick={onDescargar} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl"><Download size={16} /> Descargar plantilla</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} className="block text-sm text-slate-600" />
          {preview && (
            <div>
              <div className="flex items-center gap-2 mb-2"><CheckCircle size={18} className="text-green-600" /><p className="font-semibold text-slate-800 dark:text-slate-200">{preview.length} recetas detectadas</p></div>
              <div className="max-h-52 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0"><tr>
                    {['Nombre', 'SKU Odoo', 'Ing.', 'Costo', 'Alertas'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-600">
                    {preview.map((r, i) => {
                      const unitErrors = r.ingredientes.filter(ing => ing.unit_error)
                      return (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium">{r.nombre}</td>
                          <td className="px-3 py-2"><span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">{r.sku_odoo}</span></td>
                          <td className="px-3 py-2 text-center">{r.ingredientes.length}</td>
                          <td className="px-3 py-2 font-semibold">{fmtCosto(calcularCostoTotal(r.ingredientes))}</td>
                          <td className="px-3 py-2">
                            {unitErrors.map((ing, j) => (
                              <span key={j} className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded">
                                {ing.unit_error}
                              </span>
                            ))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={onConfirmar} disabled={!preview?.length || importando} loading={importando}><Upload size={16} className="mr-2" /> Confirmar ({preview?.length || 0})</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: MAPEO POS (Odoo POS ↔ App Ubicación)
// ═══════════════════════════════════════════════════════════════════════════════

function TabMapeoPOS() {
  const queryClient = useQueryClient()
  const toast = useToastStore()
  const { canEdit } = usePermissions()
  const canWrite = canEdit('salidas_odoo')

  const { data: mapeos = [], isLoading } = useQuery({ queryKey: ['mapeo-pos'], queryFn: () => dataService.getMapeoPOS() })
  const { data: ubicaciones = [] } = useQuery({ queryKey: ['ubicaciones'], queryFn: () => dataService.getUbicaciones() })
  const { data: empresas = [] } = useQuery({ queryKey: ['empresas'], queryFn: () => dataService.getEmpresas() })
  const { data: salidas = [] } = useQuery({ queryKey: ['salidas-odoo'], queryFn: () => dataService.getSalidasOdoo() })

  const [showForm, setShowForm] = useState(false)
  const [defaultUbicacion, setDefaultUbicacion] = useState('')
  const [savingDefault, setSavingDefault] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({ odoo_pos_name: '', odoo_pos_id: '', ubicacion_id: '', notas: '' })
  const [sincronizando, setSincronizando] = useState(false)

  const ubicacionesActivas = ubicaciones.filter(u => u.estado !== 'INACTIVO' && u.estado !== 'ELIMINADO')

  const crearMapeo = useMutation({
    mutationFn: (data) => dataService.createMapeoPOS(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mapeo-pos'] }); toast.success('Creado', 'Mapeo POS creado'); resetForm() },
    onError: () => toast.error('Error', 'Error al crear mapeo')
  })

  const actualizarMapeo = useMutation({
    mutationFn: ({ id, data }) => dataService.updateMapeoPOS(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mapeo-pos'] }); toast.success('Actualizado', 'Mapeo actualizado'); resetForm() },
    onError: () => toast.error('Error', 'Error al actualizar')
  })

  const eliminarMapeo = useMutation({
    mutationFn: (id) => dataService.deleteMapeoPOS(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mapeo-pos'] }); toast.success('Eliminado', 'Mapeo eliminado') },
    onError: () => toast.error('Error', 'Error al eliminar')
  })

  const resetForm = () => { setShowForm(false); setEditando(null); setForm({ odoo_pos_name: '', odoo_pos_id: '', ubicacion_id: '', notas: '' }) }

  const handleEdit = (mapeo) => {
    setEditando(mapeo)
    setForm({ odoo_pos_name: mapeo.odoo_pos_name || '', odoo_pos_id: mapeo.odoo_pos_id || '', ubicacion_id: mapeo.ubicacion_id || '', notas: mapeo.notas || '' })
    setShowForm(true)
  }

  const handleSubmit = () => {
    if (!form.odoo_pos_name || !form.ubicacion_id) return
    editando ? actualizarMapeo.mutate({ id: editando.id, data: form }) : crearMapeo.mutate(form)
  }

  const getUbicacionNombre = (id) => {
    const ub = ubicaciones.find(u => u.id === id)
    const emp = ub ? empresas.find(e => e.id === ub.empresa_id) : null
    return ub ? `${ub.nombre}${emp ? ` (${emp.nombre})` : ''}` : id
  }

  const handleSincronizarOdoo = async () => {
    setSincronizando(true)
    try {
      const response = await dataService.getOdooPOS()
      const posList = response.posList || []
      
      if (posList.length === 0) {
        toast.info('Sin datos', 'No se encontraron puntos de venta en Odoo')
        return
      }

      let creados = 0
      for (const pos of posList) {
        const existe = mapeos.find(m => 
          m.odoo_pos_name === pos.name || 
          String(m.odoo_pos_id) === String(pos.id)
        )
        
        if (!existe) {
          await dataService.createMapeoPOS({
            odoo_pos_name: pos.name,
            odoo_pos_id: String(pos.id),
            ubicacion_id: '',
            notas: 'Importado automáticamente desde Odoo'
          })
          creados++
        }
      }
      
      if (creados > 0) {
        queryClient.invalidateQueries({ queryKey: ['mapeo-pos'] })
        toast.success('Sincronizado', `Se importaron ${creados} nuevos puntos de venta`)
      } else {
        toast.info('Ya sincronizado', 'Todos los puntos de venta ya están configurados')
      }
    } catch (error) {
      console.error('Error sincronizando POS:', error)
      toast.error('Error', 'No se pudo conectar con Odoo. Verifica las credenciales.')
    } finally {
      setSincronizando(false)
    }
  }

  // Diagnostic calculations
  const mapeosActivos = mapeos.filter(m => m.activo !== false)
  const sinUbicacion = mapeosActivos.filter(m => !m.ubicacion_id)
  const stuckIds = new Set(
    salidas
      .filter(s => s.ubicacion_id === 'tienda_principal' || !s.ubicacion_id)
      .map(s => String(s.order_id))
  )
  const stuckCount = stuckIds.size

  // Unique config_ids seen in recent salidas (from order_id prefix matching — best effort)
  const ubicacionesUsadasEnSalidas = [...new Set(salidas.map(s => s.ubicacion_id).filter(Boolean))]
  const ubicacionesSinMapeo = ubicacionesUsadasEnSalidas.filter(uid =>
    uid !== 'tienda_principal' && !mapeosActivos.some(m => m.ubicacion_id === uid)
  )

  const handleSaveDefault = async () => {
    if (!defaultUbicacion) return
    setSavingDefault(true)
    try {
      await dataService.upsertMapeoPOSDefault(defaultUbicacion)
      toast.success('Guardado', 'Ubicación por defecto actualizada')
    } catch {
      toast.error('Error', 'No se pudo guardar')
    } finally {
      setSavingDefault(false)
    }
  }

  const defaultMapeo = mapeos.find(m => m.odoo_pos_id === '__default__' || m.es_default)

  return (
    <div className="space-y-5">
      {/* Diagnostic banner */}
      {(stuckCount > 0 || sinUbicacion.length > 0) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
            <AlertCircle size={13} /> Diagnóstico de mapeo
          </p>
          {stuckCount > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              ⚠️ <strong>{stuckCount}</strong> orden(es) registradas con ubicación <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">tienda_principal</code> — el mapeo no resolvió la ubicación correcta en esas ventas. Verifica que cada POS tenga su <strong>ID de Odoo</strong> configurado y que las funciones estén desplegadas.
            </p>
          )}
          {sinUbicacion.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              ⚠️ <strong>{sinUbicacion.length}</strong> mapeo(s) sin ubicación asignada: {sinUbicacion.map(m => <code key={m.id} className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded mx-0.5">{m.odoo_pos_name}</code>)}
            </p>
          )}
          <p className="text-[10px] text-amber-600 dark:text-amber-500">
            Después de corregir los mapeos, ejecuta <strong>firebase deploy --only functions</strong> para aplicar los cambios en la nube.
          </p>
        </div>
      )}

      {/* Global default fallback */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 p-4">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Ubicación por defecto (fallback global)</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Si una venta llega y no se encuentra mapeo POS, se usará esta ubicación en lugar de <code className="bg-slate-200 dark:bg-slate-600 px-1 rounded">tienda_principal</code>.</p>
        <div className="flex items-center gap-2">
          <select
            value={defaultUbicacion || defaultMapeo?.ubicacion_id || ''}
            onChange={e => setDefaultUbicacion(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500">
            <option value="">Sin fallback (mantener tienda_principal)</option>
            {ubicacionesActivas.map(ub => {
              const emp = empresas.find(e => e.id === ub.empresa_id)
              return <option key={ub.id} value={ub.id}>{ub.nombre}{emp ? ` (${emp.nombre})` : ''}</option>
            })}
          </select>
          <Button size="sm" onClick={handleSaveDefault} disabled={savingDefault || !defaultUbicacion}>
            {savingDefault ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
          </Button>
        </div>
        {defaultMapeo?.ubicacion_id && (
          <p className="text-[10px] text-slate-400 mt-1.5">Actual: <strong>{getUbicacionNombre(defaultMapeo.ubicacion_id)}</strong></p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Configura qué Punto de Venta de Odoo corresponde a cada ubicación en la app.</p>
          <p className="text-xs text-slate-400 mt-1">El <strong>ID Odoo</strong> es el número que identifica el POS en Odoo (campo <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">pos.config.id</code>).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSincronizarOdoo} loading={sincronizando} disabled={sincronizando}>
            <Download size={15} className="mr-1.5" /> Sincronizar con Odoo
          </Button>
          {canWrite && <Button size="sm" onClick={() => { resetForm(); setShowForm(true) }}><Plus size={15} className="mr-1.5" /> Nuevo Mapeo</Button>}
        </div>
      </div>

      {showForm && (
        <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-5 border border-slate-200 dark:border-slate-600 space-y-4">
          <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{editando ? 'Editar Mapeo' : 'Nuevo Mapeo POS'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nombre del POS en Odoo</label>
              <input value={form.odoo_pos_name} onChange={e => setForm(f => ({ ...f, odoo_pos_name: e.target.value }))} placeholder="ej: Tienda Centro"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                ID del POS en Odoo <span className="text-slate-400 font-normal">(número, ej: 3)</span>
              </label>
              <input value={form.odoo_pos_id} onChange={e => setForm(f => ({ ...f, odoo_pos_id: e.target.value }))} placeholder="ej: 5"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Ubicación en la App <span className="text-danger-500">*</span></label>
              <select value={form.ubicacion_id} onChange={e => setForm(f => ({ ...f, ubicacion_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="">Seleccionar ubicación...</option>
                {ubicacionesActivas.map(ub => {
                  const emp = empresas.find(e => e.id === ub.empresa_id)
                  return <option key={ub.id} value={ub.id}>{ub.nombre}{emp ? ` (${emp.nombre})` : ''}</option>
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Notas</label>
              <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Notas opcionales"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!form.odoo_pos_name || !form.ubicacion_id}><Save size={14} className="mr-1.5" /> {editando ? 'Actualizar' : 'Guardar'}</Button>
          </div>
        </div>
      )}

      {isLoading ? <LoadingSpinner text="Cargando mapeos..." /> : mapeosActivos.filter(m => m.odoo_pos_id !== '__default__').length === 0 ? (
        <div className="py-12 text-center"><MapPin size={48} className="mx-auto text-slate-300 mb-3" /><p className="text-slate-500">No hay mapeos POS configurados.</p></div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50"><tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">POS Odoo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">ID Odoo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">Ubicación App</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">Estado</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {mapeosActivos.filter(m => m.odoo_pos_id !== '__default__').map(m => {
                const sinUb = !m.ubicacion_id
                const sinId = !m.odoo_pos_id
                return (
                  <tr key={m.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 ${sinUb ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><Store size={16} className="text-purple-500" /><span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{m.odoo_pos_name}</span></div></td>
                    <td className="px-4 py-3">
                      {sinId
                        ? <span className="text-xs text-amber-600 italic">Sin ID — mapeo por nombre</span>
                        : <span className="text-sm font-mono text-slate-500">{m.odoo_pos_id}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {sinUb
                        ? <span className="text-xs text-red-600 font-semibold">⚠ Sin ubicación asignada</span>
                        : <div className="flex items-center gap-2"><MapPin size={14} className="text-green-500" /><span className="text-sm text-slate-700 dark:text-slate-300">{getUbicacionNombre(m.ubicacion_id)}</span></div>}
                    </td>
                    <td className="px-4 py-3">
                      {sinUb
                        ? <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700">Sin asignar</span>
                        : sinId
                          ? <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700">Solo nombre</span>
                          : <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700">✓ Listo</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canWrite && <button onClick={() => handleEdit(m)} className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-lg"><Edit2 size={14} /></button>}
                        {canWrite && <button onClick={() => { if (window.confirm('¿Eliminar este mapeo?')) eliminarMapeo.mutate(m.id) }} className="p-1.5 text-danger-600 hover:bg-danger-50 rounded-lg"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALIDAS ODOO — Helpers, Modals & Tab
// ═══════════════════════════════════════════════════════════════════════════════

const ITEMS_PER_PAGE = 15

function fmtFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtMXN(n) {
  return `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getUnitSymbol(unidadesDB, unitId, fallback) {
  if (!unitId) return (fallback || '').split(/\s+/)[0]
  const u = unidadesDB.find(x => x.id === unitId)
  const raw = u?.abreviatura || u?.simbolo || u?.nombre || fallback || ''
  return raw.split(/\s+/)[0]
}

function agruparPorOrden(movimientos) {
  const map = new Map()
  for (const m of movimientos) {
    const key = String(m.order_id || 'sin-orden')
    if (!map.has(key)) {
      map.set(key, {
        order_id: key,
        order_name: m.order_name || null,
        tipo_orden: m.tipo_orden,
        ubicacion_id: m.ubicacion_id,
        fecha_creacion: m.fecha_creacion,
        estado: m.estado,
        items: []
      })
    }
    const g = map.get(key)
    // Keep first non-null order_name found
    if (!g.order_name && m.order_name) g.order_name = m.order_name
    g.items.push(m)
  }
  for (const [, grupo] of map) {
    const hasError = grupo.items.some(i => i.estado === 'ERROR')
    grupo.estado = hasError ? 'ERROR' : 'COMPLETADO'
    grupo.costo_total = grupo.items.reduce((s, i) => s + (i.costo_total || 0), 0)
    grupo.num_ingredientes = grupo.items.length
    // Aggregate sold products with total qty
    const prodMap = new Map()
    for (const i of grupo.items) {
      const nombre = i.producto_odoo_nombre || 'Sin producto'
      if (!prodMap.has(nombre)) prodMap.set(nombre, { nombre, qty: 0 })
      prodMap.get(nombre).qty = i.odoo_qty_line || prodMap.get(nombre).qty
    }
    grupo.productos_vendidos = Array.from(prodMap.values())
    grupo.productos_odoo = grupo.productos_vendidos.map(p => p.nombre)
    grupo.ingredientes_nombres = [...new Set(grupo.items.map(i => i.nombre_producto).filter(Boolean))]
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.fecha_creacion?.toDate ? a.fecha_creacion.toDate() : new Date(a.fecha_creacion || 0)
    const tb = b.fecha_creacion?.toDate ? b.fecha_creacion.toDate() : new Date(b.fecha_creacion || 0)
    return tb - ta
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: Detalle de orden Odoo
// ═══════════════════════════════════════════════════════════════════════════════

function ModalOrdenDetalle({ grupo, ubicaciones, unidadesDB, onClose, eliminando, onRequestDeleteItem }) {
  const [expandidos, setExpandidos] = useState({})

  const porProducto = {}
  for (const item of grupo.items) {
    const key = item.producto_odoo_nombre || 'Sin producto'
    if (!porProducto[key]) porProducto[key] = []
    porProducto[key].push(item)
  }

  const toggleProducto = (nombre) => setExpandidos(prev => ({ ...prev, [nombre]: !prev[nombre] }))

  const ubicacionNombre = ubicaciones.find(u => u.id === grupo.ubicacion_id)?.nombre || grupo.ubicacion_id || '—'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] min-h-[480px] border border-slate-200 dark:border-slate-700">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-base font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-lg">
                {grupo.order_name || `#${grupo.order_id}`}
              </span>
              {grupo.estado === 'ERROR' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  <XCircle size={10} /> ERROR
                </span>
              )}
              {grupo.tipo_orden === 'manual' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Manual</span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1"><Clock size={10} />{fmtFecha(grupo.fecha_creacion)}</span>
              <span className="flex items-center gap-1"><MapPin size={10} />{ubicacionNombre}</span>
              <span className="text-slate-400">{grupo.productos_vendidos?.length ?? grupo.productos_odoo.length} producto(s) · {grupo.num_ingredientes} ingrediente(s) · <span className="font-semibold text-slate-600 dark:text-slate-300">{fmtMXN(grupo.costo_total)}</span></span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors shrink-0"><X size={18} /></button>
        </div>

        {/* Body: collapsible table */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0 z-10">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase w-8"></th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase">Producto / Ingrediente</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase hidden sm:table-cell">Receta</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase">Cantidad</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase">Costo</th>
                <th className="px-4 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(porProducto).map(([productoNombre, items]) => {
                const isOpen = !!expandidos[productoNombre]
                const subtotal = items.reduce((s, i) => s + (i.costo_total || 0), 0)
                const qty = items[0]?.odoo_qty_line
                const hasError = items.some(i => i.estado === 'ERROR')
                return (
                  <>
                    {/* Product header row */}
                    <tr
                      key={`hdr-${productoNombre}`}
                      onClick={() => toggleProducto(productoNombre)}
                      className="cursor-pointer border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors select-none"
                    >
                      <td className="px-4 py-3 text-slate-400">
                        {isOpen
                          ? <ChevronUp size={14} className="text-indigo-500" />
                          : <ChevronDown size={14} className="text-slate-400" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Package size={13} className="text-indigo-400 shrink-0" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{productoNombre}</span>
                          {qty != null && qty > 0 && (
                            <span className="text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-600 px-1.5 py-0.5 rounded">×{qty}</span>
                          )}
                          {items[0]?.producto_odoo_sku && (
                            <span className="text-xs text-slate-400 font-mono">{items[0].producto_odoo_sku}</span>
                          )}
                          {hasError && <span className="text-[10px] text-red-600 font-semibold">⚠ error</span>}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 ml-5">{items.length} ingrediente{items.length !== 1 ? 's' : ''}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-slate-400 italic">{items[0]?.recetario_nombre || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-400">—</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
                        {fmtMXN(subtotal)}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>

                    {/* Ingredient detail rows */}
                    {isOpen && items.map(item => {
                      const sym = getUnitSymbol(unidadesDB, item.unidad_medida_id, item.unidad_medida)
                      return (
                        <tr key={item.id}
                          className="border-b border-slate-50 dark:border-slate-700/40 bg-white dark:bg-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                          <td className="px-4 py-2.5 text-center">
                            <div className="w-px h-4 bg-slate-200 dark:bg-slate-600 mx-auto"></div>
                          </td>
                          <td className="px-4 py-2.5 pl-10">
                            <p className="font-medium text-slate-700 dark:text-slate-300 text-sm">{item.nombre_producto || '—'}</p>
                            {item.sku && <p className="text-[10px] text-slate-400 font-mono">{item.sku}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-400 hidden sm:table-cell max-w-[120px] truncate">
                            {item.recetario_nombre || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                              {typeof item.cantidad === 'number' ? item.cantidad.toFixed(2) : item.cantidad || 0}
                            </span>
                            {sym && <span className="text-xs text-slate-400 ml-1">{sym}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {item.estado === 'ERROR'
                              ? <span className="text-red-500 font-semibold text-[10px]">ERROR</span>
                              : fmtMXN(item.costo_total)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button onClick={() => onRequestDeleteItem(item)} disabled={eliminando === item.id} title="Eliminar"
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40">
                              {eliminando === item.id ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Total: <span className="text-indigo-600 dark:text-indigo-400">{fmtMXN(grupo.costo_total)}</span>
          </p>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: Nueva Salida Manual — multi-ingrediente con descuento de stock
// ═══════════════════════════════════════════════════════════════════════════════

function ModalSalidaManual({ onClose, onSuccess, ubicaciones, productos, unidadesDB, equivalenceMap }) {
  const toast = useToastStore()

  const [ordenRef, setOrdenRef] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [productoOdoo, setProductoOdoo] = useState('')
  const [ingredientes, setIngredientes] = useState([{ producto_id: '', cantidad: '', unidad_medida_id: '' }])
  const [saving, setSaving] = useState(false)

  const addIngrediente = () => setIngredientes(prev => [...prev, { producto_id: '', cantidad: '', unidad_medida_id: '' }])
  const removeIngrediente = (i) => setIngredientes(prev => prev.filter((_, idx) => idx !== i))
  const updateIngrediente = (i, field, value) => setIngredientes(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))

  const handleSave = async () => {
    if (!ubicacionId) { toast.error('Campo requerido', 'Selecciona la ubicación'); return }
    const validos = ingredientes.filter(i => i.producto_id && i.cantidad)
    if (!validos.length) { toast.error('Campo requerido', 'Agrega al menos un ingrediente con producto y cantidad'); return }

    setSaving(true)
    try {
      for (const ing of validos) {
        const prod = productos.find(p => p.id === ing.producto_id)
        const cantidadIngreso = parseFloat(ing.cantidad)
        const unitSym = getUnitSymbol(unidadesDB, ing.unidad_medida_id, '')

        // Calculate stock quantity: convert from recipe unit to product's stock unit if needed
        let cantidadStock = cantidadIngreso
        const prodStockUnitId = prod?.unidad_medida_id || null
        if (ing.unidad_medida_id && prodStockUnitId && ing.unidad_medida_id !== prodStockUnitId && equivalenceMap) {
          const converted = convertUnits(cantidadIngreso, ing.unidad_medida_id, prodStockUnitId, equivalenceMap)
          if (converted !== null) cantidadStock = converted
        }

        await dataService.createSalidaOdooManual({
          orden_odoo: ordenRef || `manual-${Date.now()}`,
          ubicacion_id: ubicacionId,
          producto_id: ing.producto_id,
          nombre_producto: prod?.nombre || ing.producto_id,
          producto_odoo_nombre: productoOdoo || 'Salida manual',
          cantidad: cantidadIngreso,
          cantidad_stock: cantidadStock,
          unidad_medida: unitSym,
          unidad_medida_id: ing.unidad_medida_id || null,
          costo_unitario: prod?.costo_unitario || 0,
          descripcion: productoOdoo || 'Salida manual',
        })
      }
      toast.success('Salida creada', `${validos.length} movimiento(s) registrados y stock actualizado`)
      onSuccess()
    } catch (e) {
      toast.error('Error', e.message || 'No se pudo crear la salida')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ArrowDownLeft size={20} className="text-emerald-500" /> Nueva Salida Manual
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Datos de la orden */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Datos de la orden</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Referencia <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input type="text" placeholder="Ej: POS/2024/001" value={ordenRef}
                  onChange={e => setOrdenRef(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Ubicación <span className="text-red-500">*</span></label>
                <select value={ubicacionId} onChange={e => setUbicacionId(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Seleccionar...</option>
                  {ubicaciones.filter(u => u.estado === 'ACTIVO').map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Producto Odoo <span className="text-slate-400 font-normal">(descripción)</span></label>
                <input type="text" placeholder="Ej: Mango Fusion × 2" value={productoOdoo}
                  onChange={e => setProductoOdoo(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>

          {/* Ingredientes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ingredientes a descontar</p>
              <button onClick={addIngrediente}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 transition-colors">
                <Plus size={13} /> Agregar
              </button>
            </div>
            <div className="space-y-2">
              {ingredientes.map((ing, i) => {
                const selProd = productos.find(p => p.id === ing.producto_id)
                return (
                  <div key={i} className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
                    <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-12 sm:col-span-5">
                        <select value={ing.producto_id} onChange={e => {
                          updateIngrediente(i, 'producto_id', e.target.value)
                          const p = productos.find(x => x.id === e.target.value)
                          if (p?.unidad_medida_id) updateIngrediente(i, 'unidad_medida_id', p.unidad_medida_id)
                        }}
                          className="w-full px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="">Seleccionar producto...</option>
                          {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.especificacion ? ` - ${p.especificacion}` : ''}</option>)}
                        </select>
                      </div>
                      <div className="col-span-5 sm:col-span-3">
                        <input type="number" min="0" step="0.01" placeholder="Cantidad" value={ing.cantidad}
                          onChange={e => updateIngrediente(i, 'cantidad', e.target.value)}
                          className="w-full px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="col-span-5 sm:col-span-3">
                        <select value={ing.unidad_medida_id} onChange={e => updateIngrediente(i, 'unidad_medida_id', e.target.value)}
                          className="w-full px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="">Unidad</option>
                          {unidadesDB.map(u => <option key={u.id} value={u.id}>{u.abreviatura || u.simbolo || u.nombre}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-1 text-center">
                        {ingredientes.length > 1 && (
                          <button onClick={() => removeIngrediente(i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Guardando...' : `Crear ${ingredientes.filter(i => i.producto_id && i.cantidad).length || ''} salida(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: SALIDAS — consolidado por orden Odoo
// ═══════════════════════════════════════════════════════════════════════════════

function TabSalidas() {
  const { data: salidas = [], isLoading } = useQuery({
    queryKey: ['salidas-odoo'],
    queryFn: () => dataService.getSalidasOdoo(),
    staleTime: 30000
  })
  const { data: ubicaciones = [] } = useQuery({ queryKey: ['ubicaciones'], queryFn: () => dataService.getUbicaciones() })
  const { data: productos = [] } = useQuery({ queryKey: ['productos'], queryFn: () => dataService.getProductos() })
  const { data: unidadesDB = [] } = useQuery({ queryKey: ['unidades-medida'], queryFn: () => dataService.getUnidadesMedida() })
  const { data: equivalences = [] } = useQuery({ queryKey: ['unit-equivalences'], queryFn: () => dataService.getUnitEquivalences() })

  const equivalenceMap = useMemo(() => buildEquivalenceMap(equivalences), [equivalences])

  const queryClient = useQueryClient()
  const toast = useToastStore()

  const [searchTerm, setSearchTerm] = useState('')
  const [sincronizando, setSincronizando] = useState(false)
  const [resultadoSync, setResultadoSync] = useState(null)
  const [errorSync, setErrorSync] = useState(null)
  const [modalNueva, setModalNueva] = useState(false)
  const [grupoDetalle, setGrupoDetalle] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedOrders, setSelectedOrders] = useState(new Set())
  const [deletingBulk, setDeletingBulk] = useState(false)
  const [sortSalidas, setSortSalidas] = useState({ column: 'fecha', direction: 'desc' })

  // Filters
  const [filterEstado, setFilterEstado] = useState('')
  const [filterUbicacion, setFilterUbicacion] = useState('')
  const [filterTipo, setFilterTipo] = useState('')

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', onConfirm: null })

  const ordenes = useMemo(() => agruparPorOrden(salidas), [salidas])

  // Build ubicacion lookup
  const ubicacionMap = useMemo(() => {
    const m = new Map()
    for (const u of ubicaciones) m.set(u.id, u.nombre)
    return m
  }, [ubicaciones])

  // Distinct ubicaciones used in orders
  const ubicacionesUsadas = useMemo(() => {
    const ids = [...new Set(ordenes.map(o => o.ubicacion_id).filter(Boolean))]
    return ids.map(id => ({ id, nombre: ubicacionMap.get(id) || id }))
  }, [ordenes, ubicacionMap])

  const handleSync = async () => {
    setSincronizando(true); setResultadoSync(null); setErrorSync(null)
    try {
      const result = await dataService.sincronizarVentasHoy()
      queryClient.invalidateQueries({ queryKey: ['salidas-odoo'] })
      setResultadoSync(result)
      if (result.procesadas > 0) toast.success('Sincronizado', `${result.procesadas} órdenes procesadas`)
      else if (result.omitidas > 0) toast.success('Al día', `${result.omitidas} órdenes ya existían`)
      else if (result.errores > 0) toast.error('Con errores', `${result.errores} fallaron`)
      else toast.success('Sin ventas', 'No hay órdenes POS pagadas hoy')
    } catch (e) {
      const msg = e?.message || 'Error al conectar con Odoo'
      setErrorSync(msg); toast.error('Error', msg)
    } finally { setSincronizando(false) }
  }

  const executeDeleteItem = async (item) => {
    setEliminando(item.id)
    try {
      await dataService.deleteSalidaOdoo(item.id)
      queryClient.invalidateQueries({ queryKey: ['salidas-odoo'] })
      toast.success('Eliminado', 'Movimiento eliminado')
      if (grupoDetalle && grupoDetalle.items.length === 1) setGrupoDetalle(null)
    } catch (e) {
      toast.error('Error', e.message || 'No se pudo eliminar')
    } finally { setEliminando(null) }
  }

  const requestDeleteItem = (item) => {
    setConfirmModal({
      open: true,
      title: 'Eliminar movimiento',
      message: `¿Eliminar el movimiento de "${item.nombre_producto || 'producto'}"? Esta acción no se puede deshacer.`,
      onConfirm: () => { setConfirmModal(p => ({ ...p, open: false })); executeDeleteItem(item) }
    })
  }

  const requestDeleteOrden = (grupo) => {
    setConfirmModal({
      open: true,
      title: 'Eliminar orden completa',
      message: `¿Eliminar todos los ${grupo.num_ingredientes} movimientos de la orden ${grupo.order_name || `#${grupo.order_id}`}? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        setConfirmModal(p => ({ ...p, open: false }))
        setEliminando(grupo.order_id)
        try {
          for (const item of grupo.items) await dataService.deleteSalidaOdoo(item.id)
          queryClient.invalidateQueries({ queryKey: ['salidas-odoo'] })
          toast.success('Eliminado', `Orden ${grupo.order_name || `#${grupo.order_id}`} eliminada`)
          setGrupoDetalle(null)
        } catch (e) {
          toast.error('Error', e.message || 'No se pudo eliminar')
        } finally { setEliminando(null) }
      }
    })
  }

  // Filtered orders
  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter(o => {
      if (filterEstado === 'COMPLETADO' && o.estado !== 'COMPLETADO') return false
      if (filterEstado === 'ERROR' && o.estado !== 'ERROR') return false
      if (filterEstado === 'manual' && o.tipo_orden !== 'manual') return false
      if (filterUbicacion && o.ubicacion_id !== filterUbicacion) return false
      if (filterTipo === 'pos_order' && o.tipo_orden !== 'pos_order') return false
      if (filterTipo === 'manual' && o.tipo_orden !== 'manual') return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        return (
          String(o.order_id).toLowerCase().includes(q) ||
          (o.order_name || '').toLowerCase().includes(q) ||
          o.productos_odoo.some(p => p.toLowerCase().includes(q)) ||
          o.ingredientes_nombres.some(n => n.toLowerCase().includes(q)) ||
          o.items.some(i => (i.recetario_nombre || '').toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [ordenes, filterEstado, filterUbicacion, filterTipo, searchTerm])

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [filterEstado, filterUbicacion, filterTipo, searchTerm])

  const hasActiveFilters = filterEstado || filterUbicacion || filterTipo
  const clearFilters = () => { setFilterEstado(''); setFilterUbicacion(''); setFilterTipo(''); setSearchTerm('') }

  // Bulk selection helpers
  const allFilteredIds = ordenesFiltradas.map(o => o.order_id)
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedOrders.has(id))
  const someSelected = allFilteredIds.some(id => selectedOrders.has(id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedOrders(new Set())
    } else {
      setSelectedOrders(new Set(allFilteredIds))
    }
  }

  const toggleSelectOrder = (orderId) => {
    setSelectedOrders(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  const requestDeleteBulk = () => {
    const ordenesSeleccionadas = ordenesFiltradas.filter(o => selectedOrders.has(o.order_id))
    const totalMovimientos = ordenesSeleccionadas.reduce((s, o) => s + o.items.length, 0)
    setConfirmModal({
      open: true,
      title: `Eliminar ${ordenesSeleccionadas.length} orden(es)`,
      message: `¿Eliminar ${ordenesSeleccionadas.length} orden(es) seleccionada(s) con un total de ${totalMovimientos} movimiento(s)? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        setConfirmModal(p => ({ ...p, open: false }))
        setDeletingBulk(true)
        try {
          for (const orden of ordenesSeleccionadas) {
            for (const item of orden.items) await dataService.deleteSalidaOdoo(item.id)
          }
          queryClient.invalidateQueries({ queryKey: ['salidas-odoo'] })
          setSelectedOrders(new Set())
          toast.success('Eliminado', `${ordenesSeleccionadas.length} orden(es) eliminada(s)`)
        } catch (e) {
          toast.error('Error', e.message || 'No se pudo eliminar')
        } finally { setDeletingBulk(false) }
      }
    })
  }

  const handleSortSalidas = (column) => {
    setSortSalidas(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const ordenesOrdenadas = useMemo(() => {
    const getters = {
      orden: o => o.order_name || o.order_id || '',
      productos: o => o.productos_odoo?.join(' ') || '',
      ubicacion: o => ubicacionMap.get(o.ubicacion_id) || o.ubicacion_id || '',
      ingredientes: o => o.num_ingredientes || 0,
      costo: o => o.costo_total || 0,
      fecha: o => o.fecha_creacion?.toDate ? o.fecha_creacion.toDate() : new Date(o.fecha_creacion || 0),
      estado: o => o.estado || '',
    }
    const getter = getters[sortSalidas.column] || getters.fecha
    return [...ordenesFiltradas].sort((a, b) => {
      const cmp = compareValues(getter(a), getter(b))
      return sortSalidas.direction === 'asc' ? cmp : -cmp
    })
  }, [ordenesFiltradas, sortSalidas, ubicacionMap])

  const totalPages = Math.ceil(ordenesOrdenadas.length / ITEMS_PER_PAGE)
  const paginatedOrdenes = ordenesOrdenadas.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Salidas Odoo</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {ordenes.length} orden(es) · {salidas.length} movimiento(s) · {fmtMXN(ordenes.reduce((s, o) => s + o.costo_total, 0))} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleSync} disabled={sincronizando}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={sincronizando ? 'animate-spin' : ''} />
            {sincronizando ? 'Importando...' : 'Sincronizar hoy'}
          </button>
          <button onClick={() => setModalNueva(true)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors">
            <Plus size={14} /> Nueva salida
          </button>
        </div>
      </div>

      {/* Error sync */}
      {errorSync && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-3">
          <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">No se pudo sincronizar</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 break-words">{errorSync}</p>
          </div>
          <button onClick={() => setErrorSync(null)} className="text-red-400 hover:text-red-600 shrink-0"><X size={14} /></button>
        </div>
      )}

      {/* Sync result */}
      {resultadoSync && (
        <div className={`rounded-xl border p-3 space-y-2 ${resultadoSync.procesadas > 0 ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Resultado sincronización</p>
            <button onClick={() => setResultadoSync(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>
          <div className="flex gap-6">
            <div className="text-center"><p className="text-xl font-bold text-emerald-600">{resultadoSync.procesadas}</p><p className="text-[10px] text-slate-500 uppercase">Procesadas</p></div>
            <div className="text-center"><p className="text-xl font-bold text-slate-400">{resultadoSync.omitidas}</p><p className="text-[10px] text-slate-500 uppercase">Ya existían</p></div>
            <div className="text-center"><p className="text-xl font-bold text-red-500">{resultadoSync.errores}</p><p className="text-[10px] text-slate-500 uppercase">Errores</p></div>
          </div>
          {resultadoSync.detalle?.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {resultadoSync.detalle.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-200 dark:border-slate-700 last:border-0 gap-2">
                  <span className="font-mono text-slate-700 dark:text-slate-300 truncate">{d.nombre || `#${d.id}`}</span>
                  <span className={`px-2 py-0.5 rounded-full font-semibold shrink-0 ${d.estado === 'procesada' ? 'bg-emerald-100 text-emerald-700' : d.estado === 'omitida' ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-700'}`}>
                    {d.estado === 'procesada' ? `${d.movimientos ?? 0} mov.` : d.estado === 'omitida' ? 'existía' : d.razon}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Buscar orden, producto, ingrediente, receta..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Estado: Todos</option>
            <option value="COMPLETADO">Completadas</option>
            <option value="ERROR">Con errores</option>
            <option value="manual">Manuales</option>
          </select>
          <select value={filterUbicacion} onChange={e => setFilterUbicacion(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Ubicación: Todas</option>
            {ubicacionesUsadas.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Tipo: Todos</option>
            <option value="pos_order">POS Odoo</option>
            <option value="manual">Manual</option>
          </select>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:text-indigo-800 transition-colors flex items-center gap-1">
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedOrders.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700">
          <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            {selectedOrders.size} orden(es) seleccionada(s) · {ordenesFiltradas.filter(o => selectedOrders.has(o.order_id)).reduce((s, o) => s + o.items.length, 0)} movimiento(s)
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedOrders(new Set())}
              className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold transition-colors flex items-center gap-1">
              <X size={12} /> Deseleccionar
            </button>
            <button onClick={requestDeleteBulk} disabled={deletingBulk}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors">
              {deletingBulk ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Eliminar seleccionadas
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? <LoadingSpinner text="Cargando salidas..." /> : ordenesFiltradas.length === 0 ? (
        <div className="py-16 text-center">
          <ArrowDownLeft size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">{salidas.length === 0 ? 'No hay salidas registradas aún.' : 'No hay órdenes con esos filtros.'}</p>
          <p className="text-slate-400 text-sm mt-1">{salidas.length === 0 ? 'Usa "Sincronizar hoy" para importar ventas del día desde Odoo.' : ''}</p>
        </div>
      ) : (
        <>
          <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
                  <tr>
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                    </th>
                    <SortableHeader label="Orden" column="orden" sortConfig={sortSalidas} onSort={handleSortSalidas} />
                    <SortableHeader label="Productos vendidos" column="productos" sortConfig={sortSalidas} onSort={handleSortSalidas} />
                    <SortableHeader label="Ubicación" column="ubicacion" sortConfig={sortSalidas} onSort={handleSortSalidas} />
                    <SortableHeader label="Ing." column="ingredientes" sortConfig={sortSalidas} onSort={handleSortSalidas} align="center" />
                    <SortableHeader label="Costo" column="costo" sortConfig={sortSalidas} onSort={handleSortSalidas} align="right" />
                    <SortableHeader label="Fecha" column="fecha" sortConfig={sortSalidas} onSort={handleSortSalidas} />
                    <SortableHeader label="Estado" column="estado" sortConfig={sortSalidas} onSort={handleSortSalidas} align="center" />
                    <th className="px-4 py-3 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {paginatedOrdenes.map(orden => (
                    <tr key={orden.order_id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer ${selectedOrders.has(orden.order_id) ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : ''}`}
                      onClick={() => setGrupoDetalle(orden)}>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedOrders.has(orden.order_id)}
                          onChange={() => toggleSelectOrder(orden.order_id)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setGrupoDetalle(orden)}
                          className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-lg hover:bg-indigo-100 transition-colors">
                          {orden.order_name || `#${orden.order_id}`}
                        </button>
                        {orden.tipo_orden === 'manual' && (
                          <span className="ml-1.5 text-[10px] text-blue-500 font-semibold">M</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        {orden.productos_vendidos?.length === 0
                          ? <span className="text-slate-400 italic text-xs">—</span>
                          : <div className="text-xs space-y-0.5">
                              {(orden.productos_vendidos || []).slice(0, 2).map((p, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{p.nombre}</span>
                                  {p.qty > 0 && <span className="text-slate-400 shrink-0">×{p.qty}</span>}
                                </div>
                              ))}
                              {(orden.productos_vendidos?.length || 0) > 2 && (
                                <span className="text-slate-400">+{orden.productos_vendidos.length - 2} más</span>
                              )}
                            </div>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <MapPin size={11} className="text-slate-400 shrink-0" />
                          {ubicacionMap.get(orden.ubicacion_id) || orden.ubicacion_id || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {orden.num_ingredientes}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap text-xs">
                        {fmtMXN(orden.costo_total)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtFecha(orden.fecha_creacion)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          orden.estado === 'COMPLETADO' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                          'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                          {orden.estado === 'COMPLETADO' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                          {orden.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setGrupoDetalle(orden)} title="Ver detalle"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors">
                            <Eye size={15} />
                          </button>
                          <button onClick={() => requestDeleteOrden(orden)} disabled={eliminando === orden.order_id} title="Eliminar orden"
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40">
                            {eliminando === orden.order_id ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, ordenesFiltradas.length)} de {ordenesFiltradas.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40">
                  Anterior
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let page
                  if (totalPages <= 7) page = i + 1
                  else if (currentPage <= 4) page = i + 1
                  else if (currentPage >= totalPages - 3) page = totalPages - 6 + i
                  else page = currentPage - 3 + i
                  return (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${currentPage === page
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                      {page}
                    </button>
                  )
                })}
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40">
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {modalNueva && (
        <ModalSalidaManual
          onClose={() => setModalNueva(false)}
          onSuccess={() => { setModalNueva(false); queryClient.invalidateQueries({ queryKey: ['salidas-odoo'] }) }}
          ubicaciones={ubicaciones}
          productos={productos}
          unidadesDB={unidadesDB}
          equivalenceMap={equivalenceMap}
        />
      )}
      {grupoDetalle && (
        <ModalOrdenDetalle
          grupo={grupoDetalle}
          ubicaciones={ubicaciones}
          unidadesDB={unidadesDB}
          onClose={() => setGrupoDetalle(null)}
          onRequestDeleteItem={requestDeleteItem}
          eliminando={eliminando}
        />
      )}
      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal(p => ({ ...p, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Eliminar"
        variant="danger"
      />
    </div>
  )
}
