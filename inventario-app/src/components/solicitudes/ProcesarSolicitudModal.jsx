import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Button from '../common/Button'
import Alert from '../common/Alert'
import LoadingSpinner from '../common/LoadingSpinner'
import { X, Package, ArrowRight, CheckCircle, AlertTriangle, MapPin, Trash2, Plus, Search } from 'lucide-react'
import dataService from '../../services/dataService'

export default function ProcesarSolicitudModal({ solicitud, onClose, onProcesar, isLoading = false }) {
  const [productosAprobados, setProductosAprobados] = useState([])
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState('')
  const [loadingDetalles, setLoadingDetalles] = useState(true)
  const [mostrarAgregar, setMostrarAgregar] = useState(false)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productosOriginales, setProductosOriginales] = useState([])
  // Map of productoId -> stock (loaded via calcularStockDisponible for accuracy)
  const [stockMap, setStockMap] = useState({})

  // Cargar productos para nombres
  const { data: productos = [] } = useQuery({
    queryKey: ['productos'],
    queryFn: () => dataService.getProductos()
  })

  // Cargar inventario de la ubicación origen (mantener como fallback de catálogo para agregar productos)
  const { data: inventarioOrigen = [] } = useQuery({
    queryKey: ['inventario', solicitud?.ubicacion_origen_id],
    queryFn: () => solicitud?.ubicacion_origen_id ? dataService.getInventario(solicitud.ubicacion_origen_id) : [],
    enabled: !!solicitud?.ubicacion_origen_id
  })

  // Cargar detalles de la solicitud y luego consultar stock real por producto
  useEffect(() => {
    const loadDetalles = async () => {
      if (!solicitud?.id) return
      setLoadingDetalles(true)
      try {
        const detalles = await dataService.getDetalleSolicitudes(solicitud.id)
        const productosIniciales = detalles.map(d => ({
          detalle_id: d.id,
          producto_id: d.producto_id,
          cantidad_solicitada: d.cantidad_solicitada,
          cantidad_aprobada: d.cantidad_solicitada,
          observaciones: '',
          es_original: true
        }))
        setProductosAprobados(productosIniciales)
        setProductosOriginales(productosIniciales)

        // Consultar stock disponible real por cada producto usando calcularStockDisponible
        if (solicitud.ubicacion_origen_id && productosIniciales.length > 0) {
          const stockEntries = await Promise.all(
            productosIniciales.map(async (p) => {
              const stock = await dataService.calcularStockDisponible(p.producto_id, solicitud.ubicacion_origen_id)
              return [p.producto_id, stock]
            })
          )
          setStockMap(Object.fromEntries(stockEntries))
        }
      } catch (err) {
        console.error('Error cargando detalles:', err)
        setError('Error cargando los detalles de la solicitud')
      } finally {
        setLoadingDetalles(false)
      }
    }
    loadDetalles()
  }, [solicitud?.id, solicitud?.ubicacion_origen_id])

  // Obtener stock usando calcularStockDisponible (cargado en stockMap) con fallback a inventarioOrigen
  const getStockOrigen = (productoId) => {
    if (productoId in stockMap) return stockMap[productoId]
    const inv = inventarioOrigen.find(i => i.producto_id === productoId)
    if (!inv) return 0
    return inv.stock_actual ?? inv.cantidad ?? 0
  }

  // Obtener nombre del producto
  const getProductoNombre = (productoId) => {
    const producto = productos.find(p => p.id === productoId)
    return producto?.concatenado || producto?.nombre || productoId
  }

  // Actualizar cantidad aprobada
  const handleCantidadChange = (productoId, cantidad) => {
    const cantidadNum = parseFloat(cantidad) || 0
    if (cantidadNum < 0) return

    setProductosAprobados(prev =>
      prev.map(p => p.producto_id === productoId ? { ...p, cantidad_aprobada: cantidadNum } : p)
    )
  }

  // Eliminar producto de la lista
  const handleEliminarProducto = (productoId) => {
    const producto = productosAprobados.find(p => p.producto_id === productoId)
    
    // Si es un producto original con cantidad solicitada, pedir confirmación
    if (producto?.es_original && producto.cantidad_solicitada > 0) {
      if (!window.confirm(`¿Eliminar ${getProductoNombre(productoId)} de la lista? Este producto fue solicitado originalmente.`)) {
        return
      }
    }
    
    setProductosAprobados(prev => prev.filter(p => p.producto_id !== productoId))
    setError('')
  }

  // Agregar nuevo producto
  const handleAgregarProducto = (producto) => {
    // Verificar si ya está en la lista
    if (productosAprobados.some(p => p.producto_id === producto.id)) {
      setError(`El producto "${producto.concatenado || producto.nombre}" ya está en la lista`)
      return
    }

    // Verificar que el producto esté disponible en la ubicación origen
    const ubicacionesPermitidas = producto.ubicaciones_asignadas || []
    if (ubicacionesPermitidas.length > 0 && !ubicacionesPermitidas.includes(solicitud.ubicacion_origen_id)) {
      setError(`El producto "${producto.concatenado || producto.nombre}" no está disponible en la ubicación origen`)
      return
    }

    // Cargar stock real para el nuevo producto y agregarlo a la lista
    dataService.calcularStockDisponible(producto.id, solicitud.ubicacion_origen_id)
      .then(stock => setStockMap(prev => ({ ...prev, [producto.id]: stock })))

    setProductosAprobados(prev => [...prev, {
      producto_id: producto.id,
      cantidad_solicitada: 0,
      cantidad_aprobada: 0,
      observaciones: '',
      es_original: false
    }])
    
    setMostrarAgregar(false)
    setBusquedaProducto('')
    setError('')
  }

  // Cancelar sin guardar cambios
  const handleCancelar = () => {
    // Restaurar productos originales
    setProductosAprobados(productosOriginales)
    setError('')
    onClose()
  }

  // Filtrar productos disponibles para agregar
  const productosDisponibles = productos.filter(p => {
    // No mostrar productos ya en la lista
    if (productosAprobados.some(pa => pa.producto_id === p.id)) return false
    
    // Filtrar por búsqueda
    if (busquedaProducto) {
      const searchLower = busquedaProducto.toLowerCase()
      const nombre = (p.concatenado || p.nombre || '').toLowerCase()
      if (!nombre.includes(searchLower)) return false
    }
    
    // Verificar ubicaciones permitidas
    const ubicacionesPermitidas = p.ubicaciones_asignadas || []
    if (ubicacionesPermitidas.length > 0 && !ubicacionesPermitidas.includes(solicitud.ubicacion_origen_id)) {
      return false
    }
    
    return true
  })

  // Validar y procesar
  const handleProcesar = () => {
    setError('')

    // Validar que al menos un producto tenga cantidad > 0
    const productosConCantidad = productosAprobados.filter(p => p.cantidad_aprobada > 0)
    if (productosConCantidad.length === 0) {
      setError('Debe aprobar al menos un producto con cantidad mayor a 0')
      return
    }

    // Validar stock disponible
    const sinStock = productosConCantidad.filter(p => {
      const stock = getStockOrigen(p.producto_id)
      return p.cantidad_aprobada > stock
    })

    if (sinStock.length > 0) {
      const nombres = sinStock.map(p => getProductoNombre(p.producto_id)).join(', ')
      setError(`Stock insuficiente para: ${nombres}`)
      return
    }

    onProcesar?.({
      solicitud_id: solicitud.id,
      productos_aprobados: productosConCantidad,
      observaciones
    })
  }

  if (!solicitud) return null

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <CheckCircle className="text-white" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Procesar Solicitud {solicitud.codigo_legible}
                </h2>
                <p className="text-white/70 text-sm">
                  Revisa y aprueba las cantidades a enviar
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X className="text-white" size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingDetalles ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="space-y-6">
              {error && <Alert type="error">{error}</Alert>}

              {/* Flujo de ubicaciones */}
              <div className="flex items-center justify-center gap-4 py-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <MapPin size={14} />
                    <span>Desde (Tu ubicación)</span>
                  </div>
                  <div className="font-medium text-slate-700 dark:text-slate-200">
                    {solicitud.origen_nombre || solicitud.ubicacion_origen_id}
                  </div>
                </div>
                <ArrowRight className="text-green-500" size={24} />
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <MapPin size={14} />
                    <span>Hacia (Solicitante)</span>
                  </div>
                  <div className="font-medium text-slate-700 dark:text-slate-200">
                    {solicitud.destino_nombre || solicitud.ubicacion_destino_id}
                  </div>
                </div>
              </div>

              {/* Info del solicitante */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Solicitado por:</strong> {solicitud.usuario_creacion_nombre || solicitud.usuario_creacion_id}
                </div>
                {solicitud.observaciones_creacion && (
                  <div className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                    <strong>Observaciones:</strong> {solicitud.observaciones_creacion}
                  </div>
                )}
              </div>

              {/* Tabla de productos */}
              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Productos solicitados
                </h3>
                <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Producto</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Stock Disponible</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Solicitado</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">A Enviar</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                      {productosAprobados.map(prod => {
                        const stock = getStockOrigen(prod.producto_id)
                        const insuficiente = prod.cantidad_aprobada > stock
                        return (
                          <tr key={prod.producto_id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${insuficiente ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Package className="text-slate-400" size={16} />
                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                  {getProductoNombre(prod.producto_id)}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`font-medium ${stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {stock}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                {prod.cantidad_solicitada > 0 ? prod.cantidad_solicitada : (
                                  <span className="text-slate-400 text-xs">N/A</span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  max={stock}
                                  value={prod.cantidad_aprobada}
                                  onChange={(e) => handleCantidadChange(prod.producto_id, e.target.value)}
                                  className={`w-20 px-3 py-2 border rounded-lg text-center ${
                                    insuficiente
                                      ? 'border-red-300 bg-red-50 dark:border-red-600 dark:bg-red-900/20'
                                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'
                                  } text-slate-900 dark:text-slate-100`}
                                />
                                {insuficiente && (
                                  <AlertTriangle className="text-red-500" size={16} />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center">
                                <button
                                  onClick={() => handleEliminarProducto(prod.producto_id)}
                                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                  title="Eliminar producto"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Agregar productos */}
              <div>
                {!mostrarAgregar ? (
                  <Button
                    variant="outline"
                    onClick={() => setMostrarAgregar(true)}
                    className="w-full border-dashed"
                  >
                    <Plus size={16} className="mr-2" />
                    Agregar Producto No Solicitado
                  </Button>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-600 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Buscar producto para agregar
                      </h4>
                      <button
                        onClick={() => {
                          setMostrarAgregar(false)
                          setBusquedaProducto('')
                        }}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        value={busquedaProducto}
                        onChange={(e) => setBusquedaProducto(e.target.value)}
                        placeholder="Buscar por nombre de producto..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg">
                      {productosDisponibles.length === 0 ? (
                        <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                          {busquedaProducto ? 'No se encontraron productos' : 'Escribe para buscar productos'}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-200 dark:divide-slate-600">
                          {productosDisponibles.slice(0, 10).map(producto => {
                            const stockDisponible = getStockOrigen(producto.id)
                            return (
                              <button
                                key={producto.id}
                                onClick={() => handleAgregarProducto(producto)}
                                className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <Package className="text-slate-400" size={16} />
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                    {producto.concatenado || producto.nombre}
                                  </span>
                                </div>
                                <span className={`text-xs font-medium ${stockDisponible > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  Stock: {stockDisponible}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    
                    {productosDisponibles.length > 10 && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                        Mostrando 10 de {productosDisponibles.length} productos. Refina tu búsqueda.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Observaciones del procesamiento (opcional)
                </label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Notas sobre el despacho..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Advertencia */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
                  <div className="text-sm text-yellow-700 dark:text-yellow-300">
                    <strong>Nota:</strong> Al procesar esta solicitud se creará automáticamente un movimiento de salida (transferencia) desde tu ubicación hacia el solicitante. El inventario se actualizará cuando la recepción sea confirmada.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={handleCancelar} disabled={isLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleProcesar}
              loading={isLoading}
              disabled={loadingDetalles || productosAprobados.every(p => p.cantidad_aprobada === 0)}
            >
              <CheckCircle size={16} className="mr-2" />
              Crear Salida y Procesar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
