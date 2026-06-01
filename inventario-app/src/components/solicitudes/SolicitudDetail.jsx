import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Button from '../common/Button'
import LoadingSpinner from '../common/LoadingSpinner'
import { X, Circle, Package, Calendar, MapPin, ExternalLink, XCircle, Send, Edit, CheckCircle, Trash2, Maximize2, Minimize2 } from 'lucide-react'
import dataService from '../../services/dataService'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const estadoConfig = {
  iniciada: { label: 'Iniciada', color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  enviada: { label: 'Enviada', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  recibida: { label: 'Recibida', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  procesada: { label: 'Procesada', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
}

export default function SolicitudDetail({
  solicitud,
  onClose,
  onEditar,
  onEnviar,
  onCancelar,
  onProcesar,
  onEliminar,
  isOwner = false,
  canProcess = false,
  canEdit = false,
  canDelete = false,
  isLoading = false
}) {
  const navigate = useNavigate()
  const [detalles, setDetalles] = useState([])
  const [loadingDetalles, setLoadingDetalles] = useState(true)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [motivoCancelacion, setMotivoCancelacion] = useState('')
  const [activeTab, setActiveTab] = useState('detalles') // 'detalles' | 'logs'
  const [isExpanded, setIsExpanded] = useState(false)

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false)
  const [editedDetalles, setEditedDetalles] = useState([])
  const [editedObservaciones, setEditedObservaciones] = useState('')
  
  
  
  // Cargar productos para nombres
  const { data: productos = [] } = useQuery({
    queryKey: ['productos'],
    queryFn: () => dataService.getProductos()
  })

  // Cargar detalles de la solicitud
  useEffect(() => {
    const loadDetalles = async () => {
      if (!solicitud?.id) return
      setLoadingDetalles(true)
      try {
        const data = await dataService.getDetalleSolicitudes(solicitud.id)
        setDetalles(data)
      } catch (error) {
        console.error('Error cargando detalles:', error)
        // No cerrar el modal por errores de Firebase
        setDetalles([])
      } finally {
        setLoadingDetalles(false)
      }
    }
    loadDetalles()
  }, [solicitud?.id])

  if (!solicitud) return null

  const estadoNorm = solicitud.estado?.toLowerCase() || 'iniciada'
  const config = estadoConfig[estadoNorm] || estadoConfig.iniciada

  const formatFecha = (fecha) => {
    if (!fecha) return '-'
    try {
      const date = fecha.toDate ? fecha.toDate() : new Date(fecha.seconds ? fecha.seconds * 1000 : fecha)
      return format(date, "dd-MM-yyyy HH:mm", { locale: es })
    } catch {
      return '-'
    }
  }

  // Initialize edit mode with current data
  useEffect(() => {
    if (isEditMode && detalles.length > 0) {
      setEditedDetalles(detalles.map(d => ({
        ...d,
        cantidad_solicitada: d.cantidad_solicitada
      })))
      setEditedObservaciones(solicitud.observaciones_creacion || '')
    }
  }, [isEditMode, detalles, solicitud.observaciones_creacion])

  const handleSaveEdit = () => {
    if (onEditar) {
      onEditar({
        detalles: editedDetalles,
        observaciones: editedObservaciones
      })
      setIsEditMode(false)
    }
  }

  const handleCantidadChange = (detalleId, newCantidad) => {
    setEditedDetalles(prev =>
      prev.map(d => d.id === detalleId ? { ...d, cantidad_solicitada: Math.max(0, newCantidad) } : d)
    )
  }

  const handleCancelar = () => {
    if (!motivoCancelacion.trim()) return
    onCancelar?.(motivoCancelacion)
    setShowCancelModal(false)
  }

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 md:p-4">
      <div className={`bg-white dark:bg-slate-800 shadow-xl w-full overflow-hidden flex flex-col transition-all duration-300 ${
        isExpanded
          ? 'rounded-2xl max-w-[calc(100vw-1.5rem)] lg:max-w-[calc(100vw-7rem)] h-[calc(100vh-1.5rem)]'
          : 'rounded-2xl max-w-3xl max-h-[90vh]'
      }`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-[#004AFF] to-[#002980] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <Circle className="text-white" size={18} />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-white">
                    {solicitud.codigo_legible || 'Solicitud'}
                  </h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
                    {config.label}
                  </span>
                  {/* Link a salida si está procesada - misma fila */}
                  {solicitud.salida_id && (
                    <div className="flex items-center gap-1">
                      <span className="text-white/50 text-sm">→</span>
                      <button
                        onClick={() => {
                          navigate(`/movimientos/salidas?id=${solicitud.salida_id}`)
                        }}
                        className="text-green-400 font-medium hover:text-green-300 underline decoration-2 underline-offset-2 transition-colors flex items-center gap-1"
                        title="Ver movimiento de salida"
                      >
                        <ExternalLink size={14} className="text-green-400" />
                        {solicitud.codigo_salida || 'MV...'}
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-white/70 text-sm">
                  Detalle de solicitud de transferencia
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

        {/* Tabs Navigation */}
        <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-5 flex-shrink-0">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('detalles')}
              className={`px-6 py-3 font-semibold text-sm transition-all relative ${
                activeTab === 'detalles'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              DETALLES
              {activeTab === 'detalles' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-6 py-3 font-semibold text-sm transition-all relative flex items-center gap-2 ${
                activeTab === 'logs'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              LOGS
              <span className={`inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full ${
                activeTab === 'logs'
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-300 text-slate-700'
              }`}>
                {[
                  solicitud.fecha_creacion,
                  solicitud.fecha_envio,
                  solicitud.fecha_procesamiento,
                  solicitud.fecha_ultima_edicion
                ].filter(Boolean).length}
              </span>
              {activeTab === 'logs' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400"></div>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loadingDetalles ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tab: Detalles */}
              {activeTab === 'detalles' && (
                <>
              {/* Tarjeta Origen-Destino Visual */}
              <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-6">
                <div className="flex items-center justify-between gap-4">
                  {/* Origen */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-2 bg-orange-100 dark:bg-orange-800 rounded-lg">
                        <MapPin className="text-orange-600 dark:text-orange-300" size={20} />
                      </div>
                      <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">Desde (Origen)</span>
                    </div>
                    <p className="font-bold text-lg text-slate-900 dark:text-slate-100">
                      {solicitud.origen_nombre || solicitud.ubicacion_origen_id}
                    </p>
                  </div>

                  {/* Flecha */}
                  <div className="flex-shrink-0 px-4">
                    <div className="relative">
                      <div className="w-16 h-0.5 bg-primary-400 dark:bg-primary-600"></div>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-8 border-l-primary-400 dark:border-l-primary-600"></div>
                    </div>
                  </div>

                  {/* Destino */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-2 bg-green-100 dark:bg-green-800 rounded-lg">
                        <MapPin className="text-green-600 dark:text-green-300" size={20} />
                      </div>
                      <span className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">Hacia (Destino)</span>
                    </div>
                    <p className="font-bold text-lg text-slate-900 dark:text-slate-100">
                      {solicitud.destino_nombre || solicitud.ubicacion_destino_id}
                    </p>
                  </div>
                </div>
              </div>

              {/* Productos */}
              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Productos solicitados ({isEditMode ? editedDetalles.length : detalles.length})
                </h3>
                {isEditMode && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 mb-3">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Modo de Edición:</strong> Modifica las cantidades según sea necesario.
                    </p>
                  </div>
                )}
                <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Producto</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Cantidad Solicitada</th>
                        {estadoNorm === 'procesada' && (
                          <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Cantidad Aprobada</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                      {(isEditMode ? editedDetalles : detalles).map(detalle => {
                        const producto = productos.find(p => p.id === detalle.producto_id)
                        return (
                          <tr key={detalle.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Package className="text-slate-400" size={16} />
                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                  {producto?.concatenado || producto?.nombre || detalle.producto_id}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center font-medium text-slate-700 dark:text-slate-200">
                              {isEditMode ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={detalle.cantidad_solicitada}
                                  onChange={(e) => handleCantidadChange(detalle.id, parseFloat(e.target.value) || 0)}
                                  className="w-24 px-3 py-2 text-center border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                              ) : (
                                detalle.cantidad_solicitada
                              )}
                            </td>
                            {estadoNorm === 'procesada' && (
                              <td className="px-4 py-3 text-center font-medium text-green-600">
                                {detalle.cantidad_aprobada ?? detalle.cantidad_solicitada}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Observaciones */}
              {(isEditMode || solicitud.observaciones_creacion || solicitud.observaciones_procesamiento) && (
                <div className="space-y-3">
                  {(isEditMode || solicitud.observaciones_creacion) && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-2">
                        Observaciones del solicitante
                      </div>
                      {isEditMode ? (
                        <textarea
                          value={editedObservaciones}
                          onChange={(e) => setEditedObservaciones(e.target.value)}
                          placeholder="Observaciones de la solicitud..."
                          rows={3}
                          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                        />
                      ) : (
                        <div className="text-slate-700 dark:text-slate-200">
                          {solicitud.observaciones_creacion}
                        </div>
                      )}
                    </div>
                  )}
                  {solicitud.observaciones_procesamiento && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                        Observaciones del procesamiento
                      </div>
                      <div className="text-slate-700 dark:text-slate-200">
                        {solicitud.observaciones_procesamiento}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Motivo de cancelación */}
              {estadoNorm === 'cancelada' && solicitud.motivo_cancelacion && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1">
                    <XCircle size={16} />
                    <span className="text-xs font-medium uppercase">Motivo de cancelación</span>
                  </div>
                  <div className="text-red-700 dark:text-red-300">
                    {solicitud.motivo_cancelacion}
                  </div>
                </div>
              )}
                </>
              )}

              {/* Tab: Logs de Actividad */}
              {activeTab === 'logs' && (
                <div className="space-y-4">
                  {/* Creación */}
                  {solicitud.fecha_creacion && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                      <h3 className="font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2 mb-3">
                        <Calendar size={20} />
                        Creación
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-blue-700/70 dark:text-blue-300/70 mb-1">Fecha de creación</p>
                          <p className="font-medium text-blue-900 dark:text-blue-100">
                            {formatFecha(solicitud.fecha_creacion)}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-700/70 dark:text-blue-300/70 mb-1">Solicitado por</p>
                          <p className="font-medium text-blue-900 dark:text-blue-100">
                            {solicitud.usuario_creacion_nombre || solicitud.usuario_creacion_id || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Envío */}
                  {solicitud.fecha_envio && (
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
                      <h3 className="font-semibold text-indigo-800 dark:text-indigo-200 flex items-center gap-2 mb-3">
                        <Send size={20} />
                        Envío
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-indigo-700/70 dark:text-indigo-300/70 mb-1">Fecha de envío</p>
                          <p className="font-medium text-indigo-900 dark:text-indigo-100">
                            {formatFecha(solicitud.fecha_envio)}
                          </p>
                        </div>
                        <div>
                          <p className="text-indigo-700/70 dark:text-indigo-300/70 mb-1">Enviado por</p>
                          <p className="font-medium text-indigo-900 dark:text-indigo-100">
                            {solicitud.usuario_envio_nombre || solicitud.usuario_envio_id || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Procesamiento */}
                  {solicitud.fecha_procesamiento && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                      <h3 className="font-semibold text-green-800 dark:text-green-200 flex items-center gap-2 mb-3">
                        <CheckCircle size={20} />
                        Procesamiento
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-green-700/70 dark:text-green-300/70 mb-1">Fecha de procesamiento</p>
                          <p className="font-medium text-green-900 dark:text-green-100">
                            {formatFecha(solicitud.fecha_procesamiento)}
                          </p>
                        </div>
                        <div>
                          <p className="text-green-700/70 dark:text-green-300/70 mb-1">Procesado por</p>
                          <p className="font-medium text-green-900 dark:text-green-100">
                            {solicitud.usuario_procesamiento_nombre || solicitud.usuario_procesamiento_id || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Edición */}
                  {solicitud.fecha_ultima_edicion && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                      <h3 className="font-semibold text-purple-800 dark:text-purple-200 flex items-center gap-2 mb-3">
                        <Edit size={20} />
                        Edición
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-purple-700/70 dark:text-purple-300/70 mb-1">Última edición</p>
                          <p className="font-medium text-purple-900 dark:text-purple-100">
                            {formatFecha(solicitud.fecha_ultima_edicion)}
                          </p>
                        </div>
                        <div>
                          <p className="text-purple-700/70 dark:text-purple-300/70 mb-1">Editado por</p>
                          <p className="font-medium text-purple-900 dark:text-purple-100">
                            {solicitud.editado_por_nombre || solicitud.editado_por || '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-purple-700/70 dark:text-purple-300/70 mb-1">Total de ediciones</p>
                          <p className="font-medium text-purple-900 dark:text-purple-100">
                            {solicitud.ediciones_count || 1}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cancelación */}
                  {estadoNorm === 'cancelada' && solicitud.motivo_cancelacion && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                      <h3 className="font-semibold text-red-800 dark:text-red-200 flex items-center gap-2 mb-3">
                        <XCircle size={20} />
                        Cancelación
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <p className="text-red-700/70 dark:text-red-300/70 mb-1">Motivo de cancelación</p>
                          <p className="font-medium text-red-900 dark:text-red-100">
                            {solicitud.motivo_cancelacion}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer con acciones */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50 sticky bottom-0">
          <div className="flex justify-between items-center gap-4">
            {/* Cancel/Reject button - left side */}
            <div className="flex gap-3">
              {!isEditMode && (
                <>
                  {/* Botón Cancelar para el creador */}
                  {isOwner && estadoNorm === 'iniciada' && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => setShowCancelModal(true)}
                      disabled={isLoading}
                    >
                      <XCircle size={16} className="mr-2" />
                      Cancelar
                    </Button>
                  )}

                  {/* Botón Rechazar para quien procesa */}
                  {canProcess && (estadoNorm === 'enviada' || estadoNorm === 'recibida') && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => setShowCancelModal(true)}
                      disabled={isLoading}
                    >
                      <XCircle size={16} className="mr-2" />
                      Rechazar
                    </Button>
                  )}

                  {/* Botón Eliminar para usuarios con permiso 'total' */}
                  {canDelete && onEliminar && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => onEliminar(solicitud)}
                      disabled={isLoading}
                    >
                      <Trash2 size={16} className="mr-2" />
                      Eliminar
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Action buttons - right side */}
            <div className="flex gap-3">
              {isEditMode ? (
                <>
                  <Button
                    variant="outline"
                    className="text-slate-600 border-slate-300 hover:bg-slate-50"
                    onClick={() => setIsEditMode(false)}
                  >
                    Volver
                  </Button>
                  <Button variant="primary" onClick={handleSaveEdit} loading={isLoading}>
                    <Edit size={16} className="mr-2" />
                    Guardar Cambios
                  </Button>
                </>
              ) : (
                <>
                  {/* Acciones para el creador (owner) */}
                  {isOwner && estadoNorm === 'iniciada' && (
                    <>
                      <Button
                        variant="outline"
                        className="text-primary-600 border-primary-300 hover:bg-primary-50"
                        onClick={onEditar}
                        disabled={isLoading}
                      >
                        <Edit size={16} className="mr-2" />
                        Editar
                      </Button>
                      <Button variant="primary" onClick={onEnviar} loading={isLoading}>
                        <Send size={16} className="mr-2" />
                        Enviar Solicitud
                      </Button>
                    </>
                  )}

                  {/* Botón Editar para solicitudes en proceso (creada o enviada) */}
                  {canEdit && (estadoNorm === 'creada' || estadoNorm === 'enviada') && !isOwner && (
                    <Button
                      variant="outline"
                      className="text-primary-600 border-primary-300 hover:bg-primary-50"
                      onClick={() => setIsEditMode(true)}
                      disabled={isLoading}
                    >
                      <Edit size={16} className="mr-2" />
                      Editar
                    </Button>
                  )}

                  {/* Acciones para quien procesa */}
                  {canProcess && (estadoNorm === 'enviada' || estadoNorm === 'recibida') && (
                    <Button variant="primary" onClick={onProcesar} loading={isLoading}>
                      Procesar Solicitud
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de cancelación */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-red-600 p-4">
              <div className="flex items-center gap-2">
                <XCircle className="text-white" size={20} />
                <h3 className="text-lg font-bold text-white">
                  {isOwner ? 'Cancelar Solicitud' : 'Rechazar Solicitud'}
                </h3>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-slate-600 dark:text-slate-300">
                Por favor indica el motivo de {isOwner ? 'cancelación' : 'rechazo'}.
              </p>
              <textarea
                value={motivoCancelacion}
                onChange={(e) => setMotivoCancelacion(e.target.value)}
                placeholder={`Motivo de ${isOwner ? 'cancelación' : 'rechazo'}...`}
                rows={3}
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              />
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowCancelModal(false)} className="flex-1">
                  Volver
                </Button>
                <Button
                  variant="danger"
                  onClick={handleCancelar}
                  disabled={!motivoCancelacion.trim()}
                  className="flex-1"
                >
                  {isOwner ? 'Confirmar Cancelación' : 'Confirmar Rechazo'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
