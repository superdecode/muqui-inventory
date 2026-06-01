import { useState, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '../common/Button'
import Alert from '../common/Alert'
import LoadingSpinner from '../common/LoadingSpinner'
import { Search, Plus, X, User, ShoppingCart, ArrowRightLeft, AlertCircle, Package, Phone, MapPin, CreditCard, Factory, Maximize2, Minimize2 } from 'lucide-react'
import dataService from '../../services/dataService'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import ProduccionForm from './ProduccionForm'
import { buildEquivalenceMap, getCompatibleUnits } from '../../utils/unitConversion'
import UoMBadge from '../common/UoMBadge'

// ========== PROVEEDOR MODAL ==========
function ProveedorModal({ isOpen, onClose, onCreate }) {
  const [form, setForm] = useState({ nombre: '', identificacion: '', telefono: '', direccion: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      setError('El nombre del proveedor es obligatorio')
      return
    }
    if (!form.identificacion.trim()) {
      setError('La identificación es obligatoria')
      return
    }

    setSaving(true)
    setError('')
    try {
      const result = await dataService.createBeneficiario(form)
      onCreate(result)
      onClose()
      setForm({ nombre: '', identificacion: '', telefono: '', direccion: '' })
    } catch (err) {
      setError('Error al crear proveedor: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="text-white" size={20} />
              <h3 className="text-lg font-bold text-white">Nuevo Proveedor</h3>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
              <X className="text-white" size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1"><User size={14} /> Nombre *</span>
            </label>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre completo"
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1"><CreditCard size={14} /> Identificación *</span>
            </label>
            <input
              value={form.identificacion}
              onChange={(e) => setForm({ ...form, identificacion: e.target.value })}
              placeholder="DNI, RUC, etc."
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1"><Phone size={14} /> Teléfono</span>
            </label>
            <input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              placeholder="Opcional"
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1"><MapPin size={14} /> Dirección</span>
            </label>
            <input
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              placeholder="Opcional"
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving} className="flex-1">Crear Proveedor</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function EntradaForm({ onClose, onSave, isLoading = false }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { user } = useAuthStore()
  const toast = useToastStore()
  const queryClient = useQueryClient()
  const [tipoEntrada, setTipoEntrada] = useState('TRANSFERENCIA')
  const [formData, setFormData] = useState({
    origen_id: '',
    destino_id: '',
    proveedor_id: '', // Cambiado de proveedor a proveedor_id para consistencia
    numero_documento: '',
    observaciones: ''
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProductos, setSelectedProductos] = useState([])
  const [error, setError] = useState('')

  // Proveedor search & modal state (usando misma lógica que beneficiario)
  const [proveedorSearch, setProveedorSearch] = useState('')
  const [showProveedorDropdown, setShowProveedorDropdown] = useState(false)
  const [showProveedorModal, setShowProveedorModal] = useState(false)
  const [selectedProveedor, setSelectedProveedor] = useState(null)
  const proveedorInputRef = useRef(null)

  // Cargar ubicaciones desde la base de datos
  const { data: todasUbicaciones = [], isLoading: isLoadingUbicaciones } = useQuery({
    queryKey: ['ubicaciones'],
    queryFn: () => dataService.getUbicaciones()
  })

  // Cargar empresas para filtrar ubicaciones
  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => dataService.getEmpresas()
  })

  // Filtrar ubicaciones asignadas al usuario (para DESTINO en entradas)
  const ubicacionesDestino = todasUbicaciones.filter(ubicacion => {
    if (!user?.ubicaciones_asignadas) return false
    let ubicacionIds = []
    if (typeof user.ubicaciones_asignadas === 'string') {
      try { ubicacionIds = JSON.parse(user.ubicaciones_asignadas) } catch { ubicacionIds = user.ubicaciones_asignadas.split(',').map(id => id.trim().replace(/"/g, '')) }
    } else if (Array.isArray(user.ubicaciones_asignadas)) {
      ubicacionIds = user.ubicaciones_asignadas
    }
    return ubicacionIds.includes(ubicacion.id)
  })

  // Ubicaciones para ORIGEN: todas las sedes de las empresas autorizadas del usuario
  const ubicacionesOrigen = todasUbicaciones.filter(ubicacion => {
    if (!user?.empresas_asignadas) return false
    let empresaIds = []
    if (typeof user.empresas_asignadas === 'string') {
      try { empresaIds = JSON.parse(user.empresas_asignadas) } catch { empresaIds = user.empresas_asignadas.split(',').map(id => id.trim().replace(/"/g, '')) }
    } else if (Array.isArray(user.empresas_asignadas)) {
      empresaIds = user.empresas_asignadas
    }
    return empresaIds.includes(ubicacion.empresa_id)
  })

  // Cargar productos desde la base de datos
  const { data: productos = [], isLoading: isLoadingProductos } = useQuery({
    queryKey: ['productos'],
    queryFn: () => dataService.getProductos()
  })

  // Cargar proveedores (usando misma colección que beneficiarios)
  const { data: proveedores = [] } = useQuery({
    queryKey: ['beneficiarios'], // Usar misma clave que beneficiarios para caché compartido
    queryFn: () => dataService.getBeneficiarios(),
    enabled: tipoEntrada === 'COMPRA'
  })

  const activeProveedores = proveedores.filter(p => p.estado !== 'INACTIVO')

  // Cargar inventario de la ubicación destino para obtener stock
  const { data: inventarioDestino = [] } = useQuery({
    queryKey: ['inventario', formData.destino_id],
    queryFn: () => dataService.getInventario(formData.destino_id),
    enabled: !!formData.destino_id
  })

  // Cargar Unidades y Equivalencias
  const { data: unidadesDB = [] } = useQuery({ queryKey: ['config-unidades'], queryFn: () => dataService.getUnidadesMedida() })
  const { data: equivalencias = [] } = useQuery({ queryKey: ['config-equivalencias'], queryFn: () => dataService.getUnitEquivalences() })
  const eqMap = useMemo(() => buildEquivalenceMap(equivalencias), [equivalencias])

  // Filtrar productos por búsqueda
  const filteredProducts = productos
    .filter(product => {
      if (product.inventariable === false) return false
      if (!formData.destino_id) return false
      const ubicPermitidas = product.ubicaciones_permitidas || []
      const matchUbicacion = ubicPermitidas.length === 0 || ubicPermitidas.includes(formData.destino_id)
      if (!matchUbicacion) return false
      return product.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(product.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.especificacion && product.especificacion.toLowerCase().includes(searchTerm.toLowerCase()))
    })
    .map(product => {
      const inventarioItem = inventarioDestino.find(inv => String(inv.producto_id) === String(product.id))
      return { ...product, stock: inventarioItem?.stock_actual || 0 }
    })

  const handleAddProducto = (producto) => {
    if (selectedProductos.find(p => p.id === producto.id)) return
    
    const qQty = producto.purchase_unit_qty || 1
    const defaultUnit = qQty !== 1 ? '__presentation__' : (producto.purchase_unit_id || '')
    
    setSelectedProductos([...selectedProductos, { 
      ...producto, 
      cantidad: 1, 
      precio_unitario: 0,
      unidad_ingreso_id: defaultUnit 
    }])
    setError('')
    setSearchTerm('')
  }

  const handleRemoveProducto = (productoId) => {
    setSelectedProductos(selectedProductos.filter(p => p.id !== productoId))
  }

  const handleCantidadChange = (productoId, cantidad) => {
    setSelectedProductos(selectedProductos.map(p => {
      if (p.id === productoId) {
        return { ...p, cantidad: Math.max(0.01, cantidad) }
      }
      return p
    }))
  }

  const handlePrecioChange = (productoId, precio) => {
    setSelectedProductos(selectedProductos.map(p => {
      if (p.id === productoId) {
        return { ...p, precio_unitario: Math.max(0, precio) }
      }
      return p
    }))
  }

  const handleUnidadChange = (productoId, unidadId) => {
    setSelectedProductos(selectedProductos.map(p => {
      if (p.id === productoId) {
        return { ...p, unidad_ingreso_id: unidadId }
      }
      return p
    }))
  }

  const calcularTotal = () => {
    return selectedProductos.reduce((sum, p) => sum + (p.cantidad * (p.precio_unitario || 0)), 0)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.destino_id) {
      setError('Por favor selecciona una ubicación de destino')
      return
    }
    if (tipoEntrada === 'TRANSFERENCIA') {
      if (!formData.origen_id) {
        setError('Por favor selecciona una ubicación de origen')
        return
      }
      if (formData.origen_id === formData.destino_id) {
        setError('La ubicación de origen y destino no pueden ser la misma')
        return
      }
    }
    if (tipoEntrada === 'COMPRA' && !formData.proveedor_id) {
      setError('Por favor selecciona un proveedor')
      return
    }
    if (selectedProductos.length === 0) {
      setError('Por favor agrega al menos un producto')
      return
    }

    const confirmMsg = tipoEntrada === 'TRANSFERENCIA'
      ? '¿Confirmar entrada por transferencia? Se creará la salida en origen y la entrada en destino automáticamente.'
      : '¿Confirmar entrada por compra? Se incrementará el inventario en destino directamente.'

    if (!window.confirm(confirmMsg)) {
      return
    }

    const saveData = {
      ...formData,
      tipo_entrada: tipoEntrada,
      tipo_movimiento: tipoEntrada,
      usuario_creacion_id: user?.id || 'USR001',
      productos: selectedProductos.map(p => {
        let finalCantidad = p.cantidad
        if (p.unidad_ingreso_id && p.unidad_ingreso_id !== '__presentation__') {
          const factorToBase = p.unidad_ingreso_id === p.purchase_unit_id ? 1 : (convertUnits(1, p.unidad_ingreso_id, p.purchase_unit_id, eqMap) || 1)
          const qtyBase = p.cantidad * factorToBase
          finalCantidad = qtyBase / (p.purchase_unit_qty || 1)
        }
        let unidadNombre = ''
        if (p.unidad_ingreso_id === '__presentation__') {
          const unitTarget = unidadesDB.find(u => u.id === p.purchase_unit_id)
          const bSym = unitTarget?.abreviatura || unitTarget?.nombre || p.unidad_medida || ''
          unidadNombre = `Unidad (${p.purchase_unit_qty || 1} ${bSym})`.trim()
        } else {
          const u = unidadesDB.find(x => x.id === p.unidad_ingreso_id)
          unidadNombre = u ? (u.abreviatura || u.nombre) : ''
        }

        return {
          producto_id: p.id,
          cantidad: parseFloat(finalCantidad.toFixed(6)),
          precio_unitario: tipoEntrada === 'COMPRA' ? (p.precio_unitario || 0) : undefined,
          unidad_original_id: p.unidad_ingreso_id,
          unidad_original_nombre: unidadNombre,
          cantidad_original_ingresada: p.cantidad
        }
      })
    }

    // Agregar nombre del proveedor si es compra
    if (tipoEntrada === 'COMPRA') {
      const prov = activeProveedores.find(p => p.id === formData.proveedor_id)
      saveData.proveedor_nombre = prov?.nombre || ''
    }

    try {
      await onSave(saveData)
    } catch (err) {
      setError('Error al crear la entrada. Por favor intenta nuevamente.')
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 md:p-4">
      <div className={`bg-white dark:bg-slate-800 shadow-card-hover w-full overflow-hidden flex flex-col transition-all duration-300 ${
        isExpanded
          ? 'rounded-2xl max-w-[calc(100vw-1.5rem)] lg:max-w-[calc(100vw-7rem)] h-[calc(100vh-1.5rem)]'
          : 'rounded-3xl max-w-6xl max-h-[95vh]'
      }`}>
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-ocean p-6">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Nueva Entrada</h2>
                <p className="text-white/90">Selecciona el tipo de entrada</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpanded(v => !v)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                  title={isExpanded ? 'Minimizar vista' : 'Ampliar vista'}
                >
                  {isExpanded ? <Minimize2 className="text-white" size={20} /> : <Maximize2 className="text-white" size={20} />}
                </button>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X className="text-white" size={24} />
                </button>
              </div>
            </div>
            {/* Segmented Control */}
            <div className="flex gap-1 bg-white/20 rounded-xl p-1">
              {[
                { id: 'TRANSFERENCIA', label: 'Transferencia', icon: ArrowRightLeft },
                { id: 'COMPRA', label: 'Compra', icon: ShoppingCart },
                { id: 'PRODUCCION', label: 'Producción', icon: Factory }
              ].map(tipo => {
                const Icon = tipo.icon
                const isActive = tipoEntrada === tipo.id
                return (
                  <button
                    key={tipo.id}
                    type="button"
                    onClick={() => {
                      setTipoEntrada(tipo.id)
                      setFormData(prev => ({ ...prev, origen_id: '', proveedor_id: '', numero_documento: '' }))
                      setSelectedProveedor(null)
                      setProveedorSearch('')
                      setSelectedProductos([])
                      setError('')
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon size={16} />
                    {tipo.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Producción Form (separate component) */}
        {tipoEntrada === 'PRODUCCION' ? (
          <div className={`p-6 overflow-y-auto ${isExpanded ? 'flex-1 min-h-0' : 'max-h-[calc(95vh-200px)]'}`}>
            <ProduccionForm
              onClose={onClose}
              onSave={onSave}
              isLoading={isLoading}
            />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className={`p-6 overflow-y-auto space-y-6 ${isExpanded ? 'flex-1 min-h-0' : 'max-h-[calc(95vh-200px)]'}`}>
          {/* Error Alert */}
          {error && (
            <Alert type="error" className="mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} />
                {error}
              </div>
            </Alert>
          )}

          {/* Ubicaciones */}
          {isLoadingUbicaciones ? (
            <div className="py-8">
              <LoadingSpinner text="Cargando ubicaciones..." />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Ubicación Destino
                </label>
                <select
                  value={formData.destino_id}
                  onChange={(e) => {
                    setFormData({ ...formData, destino_id: e.target.value })
                    setSelectedProductos([])
                  }}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="">Seleccionar destino</option>
                  {ubicacionesDestino.map(ubicacion => (
                    <option key={ubicacion.id} value={ubicacion.id}>
                      {ubicacion.nombre} ({ubicacion.tipo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                {tipoEntrada === 'TRANSFERENCIA' && (
                  <>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Ubicación Origen
                    </label>
                    <select
                      value={formData.origen_id}
                      onChange={(e) => setFormData({ ...formData, origen_id: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      required
                    >
                      <option value="">Seleccionar origen</option>
                      {ubicacionesOrigen.map(ubicacion => (
                        <option key={ubicacion.id} value={ubicacion.id}>
                          {ubicacion.nombre} ({ubicacion.tipo})
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {tipoEntrada === 'COMPRA' && (
                  <>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Proveedor
                    </label>
                    <div className="relative">
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                          <input
                            ref={proveedorInputRef}
                            type="text"
                            value={proveedorSearch}
                            onChange={(e) => {
                              setProveedorSearch(e.target.value)
                              setShowProveedorDropdown(true)
                              if (!e.target.value) {
                                setFormData({ ...formData, proveedor_id: '' })
                                setSelectedProveedor(null)
                              }
                            }}
                            onFocus={() => setShowProveedorDropdown(true)}
                            placeholder={selectedProveedor ? selectedProveedor.nombre : "Buscar por nombre o identificación..."}
                            className={`w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${selectedProveedor ? 'border-green-500' : ''}`}
                          />
                          {selectedProveedor && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProveedor(null)
                                setProveedorSearch('')
                                setFormData({ ...formData, proveedor_id: '' })
                              }}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded"
                            >
                              <X size={16} className="text-slate-400" />
                            </button>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowProveedorModal(true)}
                          className="px-3"
                          title="Crear nuevo proveedor"
                        >
                          <Plus size={20} />
                        </Button>
                      </div>
                      {/* Dropdown de búsqueda */}
                      {showProveedorDropdown && proveedorSearch && (
                        <div className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl shadow-lg">
                          {activeProveedores
                            .filter(p =>
                              p.nombre?.toLowerCase().includes(proveedorSearch.toLowerCase()) ||
                              p.identificacion?.toLowerCase().includes(proveedorSearch.toLowerCase())
                            )
                            .slice(0, 10)
                            .map(p => (
                              <div
                                key={p.id}
                                onClick={() => {
                                  setSelectedProveedor(p)
                                  setFormData({ ...formData, proveedor_id: p.id })
                                  setProveedorSearch('')
                                  setShowProveedorDropdown(false)
                                }}
                                className="p-3 hover:bg-primary-50 dark:hover:bg-slate-600 cursor-pointer border-b border-slate-100 dark:border-slate-600 last:border-b-0"
                              >
                                <p className="font-medium text-slate-900 dark:text-slate-100">{p.nombre}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  ID: {p.identificacion} {p.telefono && `| Tel: ${p.telefono}`}
                                </p>
                              </div>
                            ))}
                          {activeProveedores.filter(p =>
                            p.nombre?.toLowerCase().includes(proveedorSearch.toLowerCase()) ||
                            p.identificacion?.toLowerCase().includes(proveedorSearch.toLowerCase())
                          ).length === 0 && (
                            <div className="p-4 text-center">
                              <p className="text-slate-500 dark:text-slate-400 mb-2">No se encontró "{proveedorSearch}"</p>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setShowProveedorDropdown(false)
                                  setShowProveedorModal(true)
                                }}
                              >
                                <Plus size={16} className="mr-1" /> Crear nuevo
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Selected indicator */}
                      {selectedProveedor && (
                        <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <p className="text-sm font-medium text-green-800 dark:text-green-300">
                            Seleccionado: {selectedProveedor.nombre}
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-400">
                            ID: {selectedProveedor.identificacion}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Número de documento (solo compra) */}
          {tipoEntrada === 'COMPRA' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Número de Documento (Opcional)
              </label>
              <input
                type="text"
                value={formData.numero_documento}
                onChange={(e) => setFormData({ ...formData, numero_documento: e.target.value })}
                placeholder="Factura, guía de remisión, etc."
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          )}

          {/* Productos con Buscador Integrado */}
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Productos de Entrada</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {selectedProductos.length} producto{selectedProductos.length !== 1 ? 's' : ''} seleccionado{selectedProductos.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Tabla de productos seleccionados */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gradient-ocean">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Producto</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">UoM de Compra</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Stock Actual</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Cantidad</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Unidad</th>
                    {tipoEntrada === 'COMPRA' && (
                      <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Precio Unit.</th>
                    )}
                    {tipoEntrada === 'COMPRA' && (
                      <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Subtotal</th>
                    )}
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {selectedProductos.map(producto => (
                    <tr key={producto.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-primary-100 rounded-lg">
                            <Package size={16} className="text-primary-600" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{producto.nombre}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{producto.especificacion || 'Sin especificación'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600 dark:text-slate-400">{producto.especificacion || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-semibold ${
                          producto.stock === 0
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {producto.stock}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={producto.cantidad}
                            onChange={(e) => handleCantidadChange(producto.id, parseFloat(e.target.value) || 0)}
                            className="w-24 px-3 py-2 border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-center font-bold focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={producto.unidad_ingreso_id || ''}
                          onChange={(e) => handleUnidadChange(producto.id, e.target.value)}
                          className="w-full px-2 py-2 border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-primary-500"
                        >
                          {(() => {
                            const unitTarget = unidadesDB.find(u => u.id === producto.purchase_unit_id)
                            const bSym = unitTarget?.abreviatura || unitTarget?.nombre || producto.unidad_medida || ''
                            const qQty = producto.purchase_unit_qty || 1
                            return (
                              <>
                                {qQty > 1 && (
                                  <option value="__presentation__">Unidad ({qQty} {bSym})</option>
                                )}
                                {getCompatibleUnits(producto.purchase_unit_id, eqMap).map(uId => {
                                  const u = unidadesDB.find(x => x.id === uId)
                                  if (!u) return null
                                  return <option key={u.id} value={u.id}>{u.nombre}</option>
                                })}
                              </>
                            )
                          })()}
                        </select>
                      </td>
                      {tipoEntrada === 'COMPRA' && (
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={producto.precio_unitario}
                            onChange={(e) => handlePrecioChange(producto.id, parseFloat(e.target.value))}
                            placeholder="0.00"
                            className="w-24 px-3 py-2 border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-center font-bold focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </td>
                      )}
                      {tipoEntrada === 'COMPRA' && (
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-semibold bg-green-100 text-green-800">
                            ${(producto.cantidad * (producto.precio_unitario || 0)).toFixed(2)}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveProducto(producto.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                          title="Eliminar producto"
                        >
                          <X size={18} className="text-red-600 group-hover:text-red-700" />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Fila del buscador integrado */}
                  <tr className="bg-blue-50/50 dark:bg-blue-900/10">
                    <td colSpan={tipoEntrada === 'COMPRA' ? '7' : '5'} className="px-4 py-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Search className="text-primary-600" size={20} />
                          <p className="font-semibold text-slate-900 dark:text-slate-100">Añadir Producto</p>
                        </div>
                        <div className="relative">
                          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                          <input
                            type="text"
                            placeholder="Buscar productos por nombre, ID o especificación..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            disabled={!formData.destino_id}
                            className="w-full pl-12 pr-4 py-2.5 border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-slate-100 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
                          />
                        </div>

                        {/* Dropdown de resultados */}
                        {searchTerm && (
                          <div className="max-h-48 overflow-y-auto border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 shadow-lg">
                            {!formData.destino_id ? (
                              <div className="p-4 text-center text-slate-600">
                                <AlertCircle size={20} className="mx-auto mb-2 text-yellow-600" />
                                <p className="text-sm font-medium">Selecciona una ubicación de destino primero</p>
                              </div>
                            ) : isLoadingProductos ? (
                              <div className="p-4">
                                <LoadingSpinner text="Buscando productos..." />
                              </div>
                            ) : filteredProducts.length === 0 ? (
                              <div className="p-4 text-center text-slate-600">
                                <Package size={20} className="mx-auto mb-2 text-slate-400" />
                                <p className="text-sm font-medium">No se encontraron productos</p>
                              </div>
                            ) : (
                              filteredProducts.map(product => (
                                <div
                                  key={product.id}
                                  className="flex items-center justify-between p-3 hover:bg-primary-50 cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors"
                                  onClick={() => handleAddProducto(product)}
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="p-2 bg-primary-100 rounded-lg">
                                      <Package size={18} className="text-primary-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{product.nombre}</p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 flex-wrap">
                                        <span>{product.codigo_legible || product.id}</span>
                                        <span className="text-slate-300">|</span>
                                        <UoMBadge
                                          qty={product.purchase_unit_qty}
                                          symbol={unidadesDB.find(u => u.id === product.purchase_unit_id)?.abreviatura}
                                          unitName={unidadesDB.find(u => u.id === product.purchase_unit_id)?.nombre || product.unidad_medida}
                                          size="sm"
                                        />
                                        <span className="text-slate-300">|</span>
                                        <span>Stock: {product.stock ?? 0}</span>
                                      </p>
                                    </div>
                                  </div>
                                  <Button size="sm" variant="primary" className="flex-shrink-0">
                                    + Agregar
                                  </Button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Estado vacío */}
              {selectedProductos.length === 0 && !searchTerm && (
                <div className="text-center py-12 bg-slate-50 dark:bg-slate-700/50">
                  <Package size={56} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-600 dark:text-slate-400 font-medium mb-1">No hay productos seleccionados</p>
                  <p className="text-sm text-slate-500 dark:text-slate-500">Usa el buscador de abajo para agregar productos</p>
                </div>
              )}
            </div>

            {/* Total compra */}
            {tipoEntrada === 'COMPRA' && selectedProductos.length > 0 && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Total de Compra:</span>
                  <span className="text-2xl font-bold text-green-600">${calcularTotal().toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Observaciones (Opcional)
            </label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
              placeholder="Notas adicionales sobre la entrada..."
              rows={3}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Botones */}
          <div className="flex gap-4 mt-8">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="flex-1"
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Registrando...' : tipoEntrada === 'COMPRA' ? 'Registrar Compra' : 'Registrar Transferencia'}
            </Button>
          </div>
        </form>
        )}
      </div>

      {/* Modal para crear nuevo proveedor */}
      <ProveedorModal
        isOpen={showProveedorModal}
        onClose={() => setShowProveedorModal(false)}
        onCreate={(newProveedor) => {
          // Refrescar la lista de proveedores
          queryClient.invalidateQueries({ queryKey: ['beneficiarios'] })
          // Seleccionar automáticamente el nuevo proveedor
          setSelectedProveedor(newProveedor)
          setFormData(prev => ({ ...prev, proveedor_id: newProveedor.id }))
          setProveedorSearch('')
          setShowProveedorDropdown(false)
          toast.success('Proveedor Creado', `${newProveedor.nombre} ha sido registrado`)
        }}
      />
    </div>
  )
}
