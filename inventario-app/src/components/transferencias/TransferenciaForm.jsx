import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, onSnapshot, orderBy, query as fbQuery } from 'firebase/firestore'
import { getDB } from '../../config/firebase.config'
import Button from '../common/Button'
import Input from '../common/Input'
import Alert from '../common/Alert'
import LoadingSpinner from '../common/LoadingSpinner'
import { Search, Package, ArrowRight, AlertCircle, X, ArrowRightLeft, ShoppingCart, TrendingDown, Plus, User, Phone, MapPin, CreditCard, Maximize2, Minimize2 } from 'lucide-react'
import dataService from '../../services/dataService'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { buildEquivalenceMap, getCompatibleUnits, convertUnits } from '../../utils/unitConversion'

// ========== BENEFICIARIO MODAL ==========
function BeneficiarioModal({ isOpen, onClose, onCreate }) {
  const [form, setForm] = useState({ nombre: '', identificacion: '', telefono: '', direccion: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.identificacion.trim()) { setError('La identificación es obligatoria'); return }
    setSaving(true)
    setError('')
    try {
      const result = await dataService.createBeneficiario(form)
      onCreate(result)
      onClose()
      setForm({ nombre: '', identificacion: '', telefono: '', direccion: '' })
    } catch (err) {
      setError('Error al crear beneficiario: ' + err.message)
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
              <h3 className="text-lg font-bold text-white">Nuevo Beneficiario</h3>
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
            <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre completo" className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1"><CreditCard size={14} /> Identificación *</span>
            </label>
            <input value={form.identificacion} onChange={e => setForm({ ...form, identificacion: e.target.value })}
              placeholder="DNI, RUC, etc." className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1"><Phone size={14} /> Teléfono</span>
            </label>
            <input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })}
              placeholder="Opcional" className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1"><MapPin size={14} /> Dirección</span>
            </label>
            <input value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })}
              placeholder="Opcional" className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving} className="flex-1">Crear Beneficiario</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TransferenciaForm({ onClose, onSave, isLoading = false }) {
  const { user } = useAuthStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const toast = useToastStore()
  const queryClient = useQueryClient()
  const [tipoMovimiento, setTipoMovimiento] = useState('TRANSFERENCIA')
  const [formData, setFormData] = useState({
    origen_id: '',
    destino_id: '',
    beneficiario_id: '',
    causa_merma_id: '',
    observaciones: ''
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProductos, setSelectedProductos] = useState([])
  const [error, setError] = useState('')
  const [warningProductosSinStock, setWarningProductosSinStock] = useState([])

  // Beneficiario search & modal state
  const [beneficiarioSearch, setBeneficiarioSearch] = useState('')
  const [showBeneficiarioDropdown, setShowBeneficiarioDropdown] = useState(false)
  const [showBeneficiarioModal, setShowBeneficiarioModal] = useState(false)
  const [selectedBeneficiario, setSelectedBeneficiario] = useState(null)
  const beneficiarioInputRef = useRef(null)

  // Razones merma real-time state
  const [razonesMermaRT, setRazonesMermaRT] = useState([])
  const [loadingRazonesMerma, setLoadingRazonesMerma] = useState(true)

  // Real-time subscription for razones_merma
  useEffect(() => {
    if (tipoMovimiento !== 'MERMA') return

    setLoadingRazonesMerma(true)
    const db = getDB()
    const q = fbQuery(collection(db, 'razones_merma'), orderBy('nombre', 'asc'))

    const unsub = onSnapshot(q, (snapshot) => {
      const razones = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(r => r.estado !== 'INACTIVO')
      setRazonesMermaRT(razones)
      setLoadingRazonesMerma(false)
    }, (error) => {
      console.error('Error in razones_merma snapshot:', error)
      setLoadingRazonesMerma(false)
    })

    return () => unsub()
  }, [tipoMovimiento])

  // Cargar ubicaciones desde la base de datos
  const { data: todasUbicaciones = [], isLoading: isLoadingUbicaciones } = useQuery({
    queryKey: ['ubicaciones'],
    queryFn: () => dataService.getUbicaciones()
  })

  // Cargar empresas para filtrar ubicaciones destino
  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => dataService.getEmpresas()
  })

  // Filtrar ubicaciones asignadas al usuario (para ORIGEN)
  const ubicaciones = todasUbicaciones.filter(ubicacion => {
    if (!user?.ubicaciones_asignadas) return false
    
    let ubicacionIds = []
    if (typeof user.ubicaciones_asignadas === 'string') {
      try {
        ubicacionIds = JSON.parse(user.ubicaciones_asignadas)
      } catch {
        ubicacionIds = user.ubicaciones_asignadas.split(',').map(id => id.trim().replace(/"/g, ''))
      }
    } else if (Array.isArray(user.ubicaciones_asignadas)) {
      ubicacionIds = user.ubicaciones_asignadas
    }
    
    return ubicacionIds.includes(ubicacion.id)
  })

  // Ubicaciones para DESTINO: todas las sedes de las empresas autorizadas del usuario
  const ubicacionesDestino = todasUbicaciones.filter(ubicacion => {
    if (!user?.empresas_asignadas) return false
    
    let empresaIds = []
    if (typeof user.empresas_asignadas === 'string') {
      try {
        empresaIds = JSON.parse(user.empresas_asignadas)
      } catch {
        empresaIds = user.empresas_asignadas.split(',').map(id => id.trim().replace(/"/g, ''))
      }
    } else if (Array.isArray(user.empresas_asignadas)) {
      empresaIds = user.empresas_asignadas
    }
    
    // Incluir ubicaciones de las empresas autorizadas
    return empresaIds.includes(ubicacion.empresa_id)
  })

  // Cargar productos desde la base de datos
  const { data: productos = [], isLoading: isLoadingProductos } = useQuery({
    queryKey: ['productos'],
    queryFn: () => dataService.getProductos()
  })

  // Cargar beneficiarios para Ventas
  const { data: beneficiarios = [] } = useQuery({
    queryKey: ['beneficiarios'],
    queryFn: () => dataService.getBeneficiarios(),
    enabled: tipoMovimiento === 'VENTA'
  })

  // Razones de merma now loaded via real-time subscription (razonesMermaRT)

  const activeBeneficiarios = beneficiarios.filter(b => b.estado !== 'INACTIVO')

  // Cargar inventario de la ubicación origen para obtener stock disponible
  const { data: inventarioOrigen = [] } = useQuery({
    queryKey: ['inventario', formData.origen_id],
    queryFn: () => dataService.getInventario(formData.origen_id),
    enabled: !!formData.origen_id
  })

  const { data: unidadesDB = [] } = useQuery({ queryKey: ['config-unidades'], queryFn: () => dataService.getUnidadesMedida() })
  const { data: equivalencias = [] } = useQuery({ queryKey: ['config-equivalencias'], queryFn: () => dataService.getUnitEquivalences() })
  const eqMap = useMemo(() => buildEquivalenceMap(equivalencias), [equivalencias])

  // Filtrar productos por búsqueda y agregar stock disponible
  const filteredProducts = productos
    .filter(product => {
      if (product.inventariable === false) return false
      // Verificar que el producto esté asignado a la ubicación de origen
      if (!formData.origen_id) return false

      // Filtrar por ubicaciones_permitidas (igual que en conteos)
      const ubicPermitidas = product.ubicaciones_permitidas || []
      const matchUbicacion = ubicPermitidas.length === 0 || ubicPermitidas.includes(formData.origen_id)

      if (!matchUbicacion) return false

      // Filtrar por búsqueda
      return product.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(product.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.especificacion && product.especificacion.toLowerCase().includes(searchTerm.toLowerCase()))
    })
    .map(product => {
      // Convertir IDs a string para comparación
      const inventarioItem = inventarioOrigen.find(inv => String(inv.producto_id) === String(product.id))
      return {
        ...product,
        stock: inventarioItem?.stock_actual || 0
      }
    })
    // No filtrar por stock - permitir productos sin stock con advertencia

  const handleAddProducto = (producto) => {
    // Verificar que no esté ya agregado
    if (selectedProductos.find(p => p.id === producto.id)) {
      return
    }

    // Si no tiene stock, agregar a la lista de advertencias
    if (producto.stock <= 0) {
      setWarningProductosSinStock([...warningProductosSinStock, producto.id])
    }

    // Agregar producto con cantidad inicial según stock disponible
    const cantidadInicial = producto.stock > 0 ? 1 : 0
    const qQty = producto.purchase_unit_qty || 1
    const defaultUnit = qQty !== 1 ? '__presentation__' : (producto.purchase_unit_id || '')
    
    setSelectedProductos([...selectedProductos, { 
      ...producto, 
      cantidad: cantidadInicial, 
      exit_unit_id: defaultUnit 
    }])
    setError('') // Limpiar error si había
    setSearchTerm('') // Limpiar búsqueda después de agregar
  }

  const handleRemoveProducto = (productoId) => {
    setSelectedProductos(selectedProductos.filter(p => p.id !== productoId))
    // Remover también de la lista de advertencias
    setWarningProductosSinStock(warningProductosSinStock.filter(id => id !== productoId))
  }

  const handleCantidadChange = (productoId, cantidad) => {
    setSelectedProductos(selectedProductos.map(p => {
      if (p.id === productoId) {
        // Calcular el stock máximo disponible en la UNIDAD SELECCIONADA
        let maxAvailable = p.stock || 0
        if (p.stock > 0 && p.exit_unit_id && p.exit_unit_id !== '__presentation__') {
          // Stock total en unidad base (ej: 10 bolsas * 3 kg = 30 Kg)
          const stockBase = p.stock * (p.purchase_unit_qty || 1)
          
          // Convertir a la unidad seleccionada (ej: Kg -> gr)
          const factorToSelected = (p.exit_unit_id === p.purchase_unit_id) ? 1 : convertUnits(1, p.purchase_unit_id, p.exit_unit_id, eqMap)
          if (factorToSelected !== null) maxAvailable = stockBase * factorToSelected
        }

        const minCantidad = p.stock > 0 ? 0.01 : 0
        // Permitir un pequeño margen de error por redondeo (0.000001)
        const cantidadValida = Math.max(minCantidad, Math.min(cantidad, p.stock > 0 ? maxAvailable + 0.000001 : 9999))
        
        return { ...p, cantidad: cantidadValida }
      }
      return p
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validaciones
    if (!formData.origen_id) {
      setError('Por favor selecciona una ubicación de origen')
      return
    }
    if (tipoMovimiento === 'TRANSFERENCIA') {
      if (!formData.destino_id) {
        setError('Por favor selecciona una ubicación de destino')
        return
      }
      if (formData.origen_id === formData.destino_id) {
        setError('La ubicación de origen y destino no pueden ser la misma')
        return
      }
    }
    if (tipoMovimiento === 'VENTA' && !formData.beneficiario_id) {
      setError('Por favor selecciona un beneficiario')
      return
    }
    if (tipoMovimiento === 'MERMA' && !formData.causa_merma_id) {
      setError('Por favor selecciona una causa de merma')
      return
    }
    if (selectedProductos.length === 0) {
      setError('Por favor agrega al menos un producto a la transferencia')
      return
    }

    // Validar que las cantidades no excedan el stock disponible (solo para productos con stock)
    const productosConStockInsuficiente = selectedProductos.filter(p => p.stock > 0 && p.cantidad > p.stock)
    if (productosConStockInsuficiente.length > 0) {
      const nombresProductos = productosConStockInsuficiente.map(p =>
        `${p.nombre} (solicitado: ${p.cantidad}, disponible: ${p.stock})`
      ).join(', ')
      setError(`Stock insuficiente para: ${nombresProductos}`)
      return
    }

    // Advertencia para productos sin stock
    const productosSinStock = selectedProductos.filter(p => p.stock === 0)
    if (productosSinStock.length > 0) {
      const nombresProductos = productosSinStock.map(p => p.nombre).join(', ')
      const confirmar = window.confirm(
        `⚠️ ATENCIÓN: Los siguientes productos NO tienen stock disponible en la ubicación de origen:\n\n` +
        `${nombresProductos}\n\n` +
        `Esta transferencia creará un saldo negativo en el origen.\n\n` +
        `¿Deseas continuar con la transferencia de todas formas?`
      )
      if (!confirmar) {
        return
      }
    }

    // Validar que los productos estén asignados a la ubicación destino (solo para transferencias)
    if (tipoMovimiento === 'TRANSFERENCIA') {
      const productosNoAsignados = selectedProductos.filter(producto => {
        const productoCompleto = productos.find(p => p.id === producto.id)
        if (!productoCompleto) return true
        
        // Filtrar por ubicaciones_permitidas (igual que en conteos)
        const ubicPermitidas = productoCompleto.ubicaciones_permitidas || []
        const matchUbicacion = ubicPermitidas.length === 0 || ubicPermitidas.includes(formData.destino_id)
        
        return !matchUbicacion
      })

      if (productosNoAsignados.length > 0) {
        const nombresProductos = productosNoAsignados.map(p => p.nombre).join(', ')
        setError(`ALERTA: Los siguientes productos no están asignados a la ubicación destino: ${nombresProductos}. No se puede completar la transferencia.`)
        return
      }
    }

    try {
      const saveData = {
        ...formData,
        tipo_movimiento: tipoMovimiento,
        productos: selectedProductos.map(p => {
          let cantidad = p.cantidad
          if (p.exit_unit_id && p.exit_unit_id !== '__presentation__') {
            const factorToBase = (p.exit_unit_id === p.purchase_unit_id) ? 1 : (convertUnits(1, p.exit_unit_id, p.purchase_unit_id, eqMap) || 1)
            const qtyBase = p.cantidad * factorToBase
            cantidad = qtyBase / (p.purchase_unit_qty || 1)
          }
          let unidadNombre = ''
          if (p.exit_unit_id === '__presentation__') {
            const unitTarget = unidadesDB.find(u => u.id === p.purchase_unit_id)
            const bSym = unitTarget?.abreviatura || unitTarget?.nombre || p.unidad_medida || ''
            unidadNombre = `Unidad (${p.purchase_unit_qty || 1} ${bSym})`.trim()
          } else {
            const u = unidadesDB.find(x => x.id === p.exit_unit_id)
            unidadNombre = u ? (u.abreviatura || u.nombre) : ''
          }
          
          return {
            producto_id: p.id,
            cantidad: parseFloat(cantidad.toFixed(6)),
            unidad_original_id: p.exit_unit_id,
            unidad_original_nombre: unidadNombre,
            cantidad_original_ingresada: p.cantidad
          }
        })
      }
      if (tipoMovimiento === 'VENTA') {
        const benef = activeBeneficiarios.find(b => b.id === formData.beneficiario_id)
        saveData.beneficiario_nombre = benef?.nombre || ''
      }
      if (tipoMovimiento === 'MERMA') {
        const causa = razonesMermaRT.find(c => c.id === formData.causa_merma_id)
        saveData.causa_merma_nombre = causa?.nombre || ''
      }
      await onSave(saveData)
    } catch (err) {
      setError('Error al crear el movimiento. Por favor intenta nuevamente.')
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
                <h2 className="text-2xl font-bold text-white">Nuevo Movimiento</h2>
                <p className="text-white/90">Selecciona el tipo de movimiento</p>
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
                { id: 'VENTA', label: 'Venta', icon: ShoppingCart },
                { id: 'MERMA', label: 'Merma', icon: TrendingDown }
              ].map(tipo => {
                const Icon = tipo.icon
                const isActive = tipoMovimiento === tipo.id
                return (
                  <button
                    key={tipo.id}
                    type="button"
                    onClick={() => {
                      setTipoMovimiento(tipo.id)
                      setFormData(prev => ({ ...prev, destino_id: '', beneficiario_id: '', causa_merma_id: '' }))
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

          {/* Warning Alert for products without stock */}
          {warningProductosSinStock.length > 0 && (
            <Alert type="warning" className="mb-4" autoClose={false}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle size={18} />
                  <p className="font-bold">⚠️ ATENCIÓN: Productos sin stock en origen</p>
                </div>
                <p className="text-sm">
                  Los siguientes productos NO tienen stock disponible en la ubicación de origen:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                  {warningProductosSinStock.map(id => {
                    const producto = selectedProductos.find(p => p.id === id)
                    return (
                      <li key={id} className="font-medium">
                        {producto?.nombre} (ID: {producto?.id})
                      </li>
                    )
                  })}
                </ul>
                <p className="text-sm font-medium">
                  Esta transferencia creará un <span className="text-red-700 font-bold">saldo negativo</span> en la ubicación de origen.
                </p>
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
                  Ubicación Origen
                </label>
                <select
                  value={formData.origen_id}
                  onChange={(e) => {
                    setFormData({ ...formData, origen_id: e.target.value })
                    setSelectedProductos([]) // Limpiar productos seleccionados al cambiar origen
                  }}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="">Seleccionar origen</option>
                  {ubicaciones.map(ubicacion => (
                    <option key={ubicacion.id} value={ubicacion.id}>
                      {ubicacion.nombre} ({ubicacion.tipo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                {tipoMovimiento === 'TRANSFERENCIA' && (
                  <>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Ubicación Destino
                    </label>
                    <select
                      value={formData.destino_id}
                      onChange={(e) => setFormData({ ...formData, destino_id: e.target.value })}
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
                  </>
                )}
                {tipoMovimiento === 'VENTA' && (
                  <>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Beneficiario
                    </label>
                    <div className="relative">
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                          <input
                            ref={beneficiarioInputRef}
                            type="text"
                            value={beneficiarioSearch}
                            onChange={(e) => {
                              setBeneficiarioSearch(e.target.value)
                              setShowBeneficiarioDropdown(true)
                              if (!e.target.value) {
                                setFormData({ ...formData, beneficiario_id: '' })
                                setSelectedBeneficiario(null)
                              }
                            }}
                            onFocus={() => setShowBeneficiarioDropdown(true)}
                            placeholder={selectedBeneficiario ? selectedBeneficiario.nombre : "Buscar por nombre o identificación..."}
                            className={`w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${selectedBeneficiario ? 'border-green-500' : ''}`}
                          />
                          {selectedBeneficiario && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBeneficiario(null)
                                setBeneficiarioSearch('')
                                setFormData({ ...formData, beneficiario_id: '' })
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
                          onClick={() => setShowBeneficiarioModal(true)}
                          className="px-3"
                          title="Crear nuevo beneficiario"
                        >
                          <Plus size={20} />
                        </Button>
                      </div>
                      {/* Dropdown de búsqueda */}
                      {showBeneficiarioDropdown && beneficiarioSearch && (
                        <div className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl shadow-lg">
                          {activeBeneficiarios
                            .filter(b =>
                              b.nombre?.toLowerCase().includes(beneficiarioSearch.toLowerCase()) ||
                              b.identificacion?.toLowerCase().includes(beneficiarioSearch.toLowerCase())
                            )
                            .slice(0, 10)
                            .map(b => (
                              <div
                                key={b.id}
                                onClick={() => {
                                  setSelectedBeneficiario(b)
                                  setFormData({ ...formData, beneficiario_id: b.id })
                                  setBeneficiarioSearch('')
                                  setShowBeneficiarioDropdown(false)
                                }}
                                className="p-3 hover:bg-primary-50 dark:hover:bg-slate-600 cursor-pointer border-b border-slate-100 dark:border-slate-600 last:border-b-0"
                              >
                                <p className="font-medium text-slate-900 dark:text-slate-100">{b.nombre}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  ID: {b.identificacion} {b.telefono && `| Tel: ${b.telefono}`}
                                </p>
                              </div>
                            ))}
                          {activeBeneficiarios.filter(b =>
                            b.nombre?.toLowerCase().includes(beneficiarioSearch.toLowerCase()) ||
                            b.identificacion?.toLowerCase().includes(beneficiarioSearch.toLowerCase())
                          ).length === 0 && (
                            <div className="p-4 text-center">
                              <p className="text-slate-500 dark:text-slate-400 mb-2">No se encontró "{beneficiarioSearch}"</p>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setShowBeneficiarioDropdown(false)
                                  setShowBeneficiarioModal(true)
                                }}
                              >
                                <Plus size={16} className="mr-1" /> Crear nuevo
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Selected indicator */}
                      {selectedBeneficiario && (
                        <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <p className="text-sm font-medium text-green-800 dark:text-green-300">
                            Seleccionado: {selectedBeneficiario.nombre}
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-400">
                            ID: {selectedBeneficiario.identificacion}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {tipoMovimiento === 'MERMA' && (
                  <>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Causa de Merma
                    </label>
                    {loadingRazonesMerma ? (
                      <div className="py-3"><LoadingSpinner text="Cargando razones..." /></div>
                    ) : (
                      <select
                        value={formData.causa_merma_id}
                        onChange={(e) => setFormData({ ...formData, causa_merma_id: e.target.value })}
                        className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        title="Causa de Merma"
                        required
                      >
                        <option value="">Seleccionar causa</option>
                        {razonesMermaRT.map(c => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </select>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Las razones de merma se actualizan en tiempo real
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Productos a Transferir con Buscador Integrado */}
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Productos a Transferir</h3>
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
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Stock Disp.</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Cantidad</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Unidad</th>
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
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{producto.nombre}</p>
                              {producto.stock === 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-bold">
                                  <AlertCircle size={12} />
                                  SIN STOCK
                                </span>
                              )}
                            </div>
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
                          min="0.01"
                          step="any"
                          max={producto.stock > 0 ? producto.stock : undefined}
                          value={producto.cantidad}
                          onChange={(e) => handleCantidadChange(producto.id, parseFloat(e.target.value) || 0)}
                          className="w-24 px-3 py-2 border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-center font-bold focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {producto.purchase_unit_id ? (
                          <select
                            value={producto.exit_unit_id || ''}
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
                        ) : (
                          <span className="text-sm text-slate-500">{producto.unidad_medida || '-'}</span>
                        )}
                      </td>
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
                    <td colSpan="5" className="px-4 py-3">
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
                            disabled={!formData.origen_id}
                            className="w-full pl-12 pr-4 py-2.5 border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-slate-100 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
                          />
                        </div>

                        {/* Dropdown de resultados */}
                        {searchTerm && (
                          <div className="max-h-48 overflow-y-auto border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 shadow-lg">
                            {!formData.origen_id ? (
                              <div className="p-4 text-center text-slate-600">
                                <AlertCircle size={20} className="mx-auto mb-2 text-yellow-600" />
                                <p className="text-sm font-medium">Selecciona una ubicación de origen primero</p>
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
                                      <div className="flex items-center gap-2">
                                        <p className="font-semibold text-slate-900 truncate">{product.nombre}</p>
                                        {product.stock === 0 && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-bold">
                                            <AlertCircle size={10} />
                                            SIN STOCK
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-500 truncate">
                                        ID: {product.id} | {product.especificacion || 'Sin especificación'}
                                      </p>
                                      <p className={`text-sm font-medium ${product.stock === 0 ? 'text-red-700' : 'text-green-700'}`}>
                                        Stock: {product.stock}
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
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Observaciones de Salida (Opcional)
            </label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
              placeholder="Notas adicionales sobre la salida..."
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
              {isLoading ? 'Creando...' : tipoMovimiento === 'VENTA' ? 'Registrar Venta' : tipoMovimiento === 'MERMA' ? 'Registrar Merma' : 'Crear Transferencia'}
            </Button>
          </div>
        </form>
      </div>

      {/* Modal para crear nuevo beneficiario */}
      <BeneficiarioModal
        isOpen={showBeneficiarioModal}
        onClose={() => setShowBeneficiarioModal(false)}
        onCreate={(newBeneficiario) => {
          // Refresh beneficiarios list
          queryClient.invalidateQueries({ queryKey: ['beneficiarios'] })
          // Auto-select the new beneficiario
          setSelectedBeneficiario(newBeneficiario)
          setFormData(prev => ({ ...prev, beneficiario_id: newBeneficiario.id }))
          toast.success('Beneficiario Creado', `${newBeneficiario.nombre} ha sido registrado`)
        }}
      />
    </div>
  )
}
