import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Button from '../common/Button'
import Alert from '../common/Alert'
import UoMBadge from '../common/UoMBadge'
import LoadingSpinner from '../common/LoadingSpinner'
import { Search, Package, ArrowRight, AlertCircle, X, Triangle, Trash2, Maximize2, Minimize2 } from 'lucide-react'
import dataService from '../../services/dataService'
import { useAuthStore } from '../../stores/authStore'

export default function SolicitudForm({ onClose, onSave, onEnviar, isLoading = false, editData = null }) {
  const { user } = useAuthStore()
  const [formData, setFormData] = useState({
    ubicacion_origen_id: '',
    ubicacion_destino_id: '',
    observaciones: ''
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProductos, setSelectedProductos] = useState([])
  const [error, setError] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)

  // Cargar ubicaciones
  const { data: todasUbicaciones = [], isLoading: isLoadingUbicaciones } = useQuery({
    queryKey: ['ubicaciones'],
    queryFn: () => dataService.getUbicaciones()
  })

  // Cargar empresas
  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => dataService.getEmpresas()
  })

  // Cargar productos
  const { data: productos = [], isLoading: isLoadingProductos } = useQuery({
    queryKey: ['productos'],
    queryFn: () => dataService.getProductos()
  })

  const { data: unidadesDB = [] } = useQuery({
    queryKey: ['config-unidades'],
    queryFn: () => dataService.getUnidadesMedida()
  })

  // Cargar inventario de la ubicación origen seleccionada
  const { data: inventarioOrigen = [] } = useQuery({
    queryKey: ['inventario', formData.ubicacion_origen_id],
    queryFn: () => formData.ubicacion_origen_id ? dataService.getInventario(formData.ubicacion_origen_id) : [],
    enabled: !!formData.ubicacion_origen_id
  })

  // Ubicaciones DESTINO: las ubicaciones asignadas al usuario (donde llegará el producto)
  const ubicacionesDestino = todasUbicaciones.filter(ubicacion => {
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

  // Ubicaciones ORIGEN: todas las ubicaciones de las empresas asignadas (desde donde despacharán)
  const ubicacionesOrigen = todasUbicaciones.filter(ubicacion => {
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

    // Excluir la ubicación destino seleccionada
    if (ubicacion.id === formData.ubicacion_destino_id) return false

    return empresaIds.includes(ubicacion.empresa_id)
  })

  // Pre-seleccionar ubicación destino si el usuario solo tiene una
  useEffect(() => {
    if (ubicacionesDestino.length === 1 && !formData.ubicacion_destino_id) {
      setFormData(prev => ({ ...prev, ubicacion_destino_id: ubicacionesDestino[0].id }))
    }
  }, [ubicacionesDestino])

  // Cargar datos si es edición
  useEffect(() => {
    if (editData) {
      setFormData({
        ubicacion_origen_id: editData.ubicacion_origen_id || '',
        ubicacion_destino_id: editData.ubicacion_destino_id || '',
        observaciones: editData.observaciones_creacion || ''
      })
      // Cargar productos si hay detalles
      if (editData.detalles) {
        setSelectedProductos(editData.detalles.map(d => ({
          producto_id: d.producto_id,
          nombre: d.producto_nombre || productos.find(p => p.id === d.producto_id)?.nombre || 'Producto',
          cantidad: d.cantidad_solicitada
        })))
      }
    }
  }, [editData, productos])

  // Obtener stock de un producto en la ubicación origen
  const getStockOrigen = (productoId) => {
    const inv = inventarioOrigen.find(i => i.producto_id === productoId)
    return inv?.stock_actual || 0
  }

  // Filtrar productos para búsqueda
  const productosFiltrados = productos.filter(p => {
    if (!searchTerm) return false
    const term = searchTerm.toLowerCase()
    const matchNombre = p.nombre?.toLowerCase().includes(term)
    const matchId = p.codigo_legible?.toLowerCase().includes(term)
    const matchEspec = p.especificacion?.toLowerCase().includes(term)
    // No mostrar productos ya seleccionados
    const yaSeleccionado = selectedProductos.some(sp => sp.producto_id === p.id)
    return (matchNombre || matchId || matchEspec) && !yaSeleccionado
  }).slice(0, 10)

  // Agregar producto a la lista
  const handleAddProducto = (producto) => {
    setSelectedProductos(prev => [...prev, {
      producto_id: producto.id,
      nombre: producto.concatenado || producto.nombre,
      cantidad: 1
    }])
    setSearchTerm('')
  }

  // Actualizar cantidad de producto
  const handleCantidadChange = (productoId, cantidad) => {
    const cantidadNum = parseFloat(cantidad) || 0
    if (cantidadNum < 0) return

    setSelectedProductos(prev =>
      prev.map(p => p.producto_id === productoId ? { ...p, cantidad: cantidadNum } : p)
    )
  }

  // Eliminar producto de la lista
  const handleRemoveProducto = (productoId) => {
    setSelectedProductos(prev => prev.filter(p => p.producto_id !== productoId))
  }

  // Validar y guardar
  const handleSave = (enviar = false) => {
    console.log('🔘 handleSave called with enviar:', enviar)
    console.log('🔘 Form data:', formData)
    console.log('🔘 Selected productos:', selectedProductos)
    console.log('🔘 onEnviar function:', typeof onEnviar)
    console.log('🔘 onSave function:', typeof onSave)

    setError('')

    if (!formData.ubicacion_destino_id) {
      setError('Selecciona la ubicación de destino (donde llegarán los productos)')
      return
    }

    if (!formData.ubicacion_origen_id) {
      setError('Selecciona la ubicación de origen (desde donde se enviarán)')
      return
    }

    if (selectedProductos.length === 0) {
      setError('Agrega al menos un producto a la solicitud')
      return
    }

    const productosInvalidos = selectedProductos.filter(p => p.cantidad <= 0)
    if (productosInvalidos.length > 0) {
      setError('Todos los productos deben tener cantidad mayor a 0')
      return
    }

    const data = {
      ubicacion_origen_id: formData.ubicacion_origen_id,
      ubicacion_destino_id: formData.ubicacion_destino_id,
      observaciones: formData.observaciones,
      usuario_creacion_id: user?.id || user?.codigo,
      productos: selectedProductos.map(p => ({
        producto_id: p.producto_id,
        cantidad: p.cantidad
      }))
    }

    console.log('🔘 Data prepared:', data)

    if (enviar) {
      console.log('🔘 Calling onEnviar with data...')
      onEnviar?.(data, true)
    } else {
      console.log('🔘 Calling onSave with data...')
      onSave?.(data, false)
    }
  }

  const isLoadingData = isLoadingUbicaciones || isLoadingProductos

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 md:p-4">
      <div className={`bg-white dark:bg-slate-800 shadow-xl w-full overflow-hidden flex flex-col transition-all duration-300 ${
        isExpanded
          ? 'rounded-2xl max-w-[calc(100vw-1.5rem)] lg:max-w-[calc(100vw-7rem)] h-[calc(100vh-1.5rem)]'
          : 'rounded-2xl max-w-4xl max-h-[90vh]'
      }`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-[#004AFF] to-[#002980] p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <Triangle className="text-white" size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {editData ? 'Editar Solicitud' : 'Nueva Solicitud de Transferencia'}
                </h2>
                <p className="text-white/70 text-sm">
                  Solicita productos desde otra ubicación
                </p>
              </div>
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoadingData ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="space-y-6">
              {error && <Alert type="error">{error}</Alert>}

              {/* Ubicaciones */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ubicación Destino (donde llegará - ubicación del usuario) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Mi Ubicación (donde llegarán los productos) *
                  </label>
                  <select
                    value={formData.ubicacion_destino_id}
                    onChange={(e) => setFormData({ ...formData, ubicacion_destino_id: e.target.value, ubicacion_origen_id: '' })}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar ubicación</option>
                    {ubicacionesDestino.map(u => (
                      <option key={u.id} value={u.id}>{u.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Ubicación Origen (desde donde despacharán) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Solicitar desde (ubicación origen) *
                  </label>
                  <select
                    value={formData.ubicacion_origen_id}
                    onChange={(e) => setFormData({ ...formData, ubicacion_origen_id: e.target.value })}
                    disabled={!formData.ubicacion_destino_id}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="">Seleccionar ubicación origen</option>
                    {ubicacionesOrigen.map(u => {
                      const empresa = empresas.find(e => e.id === u.empresa_id)
                      return (
                        <option key={u.id} value={u.id}>
                          {u.nombre} {empresa ? `(${empresa.nombre})` : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>

              {/* Indicador de flujo */}
              {formData.ubicacion_origen_id && formData.ubicacion_destino_id && (
                <div className="flex items-center justify-center gap-4 py-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <div className="text-center">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Desde</div>
                    <div className="font-medium text-slate-700 dark:text-slate-200">
                      {ubicacionesOrigen.find(u => u.id === formData.ubicacion_origen_id)?.nombre}
                    </div>
                  </div>
                  <ArrowRight className="text-primary-500" size={24} />
                  <div className="text-center">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Hacia</div>
                    <div className="font-medium text-slate-700 dark:text-slate-200">
                      {ubicacionesDestino.find(u => u.id === formData.ubicacion_destino_id)?.nombre}
                    </div>
                  </div>
                </div>
              )}

              {/* Tabla de productos seleccionados con buscador integrado */}
              {formData.ubicacion_origen_id && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Productos a Solicitar</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {selectedProductos.length} producto{selectedProductos.length !== 1 ? 's' : ''} seleccionado{selectedProductos.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gradient-ocean">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">Producto</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">ID</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Stock Origen</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">Cantidad</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider w-20"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {selectedProductos.map(producto => {
                          const stock = getStockOrigen(producto.producto_id)
                          return (
                            <tr key={producto.producto_id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-primary-100 rounded-lg">
                                    <Package size={16} className="text-primary-600" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{producto.nombre}</p>
                                      {stock === 0 && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-bold">
                                          <AlertCircle size={12} />
                                          SIN STOCK
                                        </span>
                                      )}
                                    </div>
                                    <UoMBadge
                                      qty={producto.purchase_unit_qty}
                                      symbol={unidadesDB.find(u => u.id === producto.purchase_unit_id)?.abreviatura}
                                      unitName={unidadesDB.find(u => u.id === producto.purchase_unit_id)?.nombre || producto.unidad_medida}
                                      size="md"
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono text-sm text-slate-700 dark:text-slate-300">{producto.producto_id}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-semibold ${
                                  stock === 0
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {stock} {selectedProductos.find(p => p.producto_id === producto.producto_id)?.unidad_medida || 'unidades'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min="0.01"
                                  step="any"
                                  value={producto.cantidad}
                                  onChange={(e) => handleCantidadChange(producto.producto_id, e.target.value)}
                                  className="w-24 px-3 py-2 border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg text-center font-bold focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProducto(producto.producto_id)}
                                  className="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                                  title="Eliminar producto"
                                >
                                  <Trash2 size={18} className="text-red-600 group-hover:text-red-700" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}

                        {/* Fila del buscador integrado */}
                        <tr className="bg-blue-50/50 dark:bg-blue-900/10">
                          <td colSpan="5" className="px-4 py-3">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Search className="text-primary-600" size={20} />
                                <p className="font-semibold text-slate-900 dark:text-slate-100">Añadir Producto</p>
                              </div>
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                  type="text"
                                  value={searchTerm}
                                  onChange={(e) => setSearchTerm(e.target.value)}
                                  placeholder="Buscar por nombre, código o especificación..."
                                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                              </div>

                              {/* Resultados de búsqueda */}
                              {searchTerm && productosFiltrados.length > 0 && (
                                <div className="mt-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                  {productosFiltrados.map(producto => {
                                    const stock = getStockOrigen(producto.id)
                                    return (
                                      <button
                                        key={producto.id}
                                        onClick={() => handleAddProducto(producto)}
                                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors border-b border-slate-100 dark:border-slate-600 last:border-b-0"
                                      >
                                        <div className="flex items-center gap-3">
                                          <Package className="text-slate-400" size={18} />
                                          <div className="text-left">
                                            <div className="font-medium text-slate-700 dark:text-slate-200">
                                              {producto.concatenado || producto.nombre}
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                              {producto.codigo_legible}
                                            </div>
                                          </div>
                                        </div>
                                        <div className={`text-sm font-medium ${stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                          Stock: {stock}
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              )}

                              {searchTerm && productosFiltrados.length === 0 && (
                                <div className="mt-2 p-3 text-center">
                                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                                    No se encontraron productos para "{searchTerm}"
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Observaciones */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Observaciones (opcional)
                </label>
                <textarea
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  placeholder="Notas adicionales para la solicitud..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 sm:flex-initial"
            >
              Cancelar
            </Button>
            <div className="flex-1" />
            <Button
              variant="secondary"
              onClick={() => handleSave(false)}
              disabled={isLoading || selectedProductos.length === 0}
              loading={isLoading}
              className="flex-1 sm:flex-initial"
            >
              Guardar Borrador
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={isLoading || selectedProductos.length === 0}
              loading={isLoading}
              className="flex-1 sm:flex-initial"
            >
              Enviar Solicitud
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
