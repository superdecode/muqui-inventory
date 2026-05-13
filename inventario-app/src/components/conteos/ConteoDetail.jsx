import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '../common/Button'
import LoadingSpinner from '../common/LoadingSpinner'
import { Package, MapPin, Calendar, User, CheckCircle, AlertCircle, X, Download, Trash2, Pencil, Edit3, Ban } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Timestamp } from 'firebase/firestore'
import dataService from '../../services/dataService'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { exportConteoToExcel } from '../../utils/exportUtils'
import { formatDisplayId, safeFormatDate } from '../../utils/formatters'
import { usePermissions } from '../../hooks/usePermissions'

export default function ConteoDetail({ conteo, onClose, onEdit, onCancelar, isCancelando }) {
  const toast = useToastStore()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const { canEdit, getPermissionLevel, isAdmin } = usePermissions()
  const [eliminandoId, setEliminandoId] = useState(null)
  const [confirmDetalle, setConfirmDetalle] = useState(null)
  const [activeTab, setActiveTab] = useState('detalles') // 'detalles' | 'logs'

  // Local state to track the current conteo (allows immediate updates)
  const [localConteo, setLocalConteo] = useState(conteo)

  // Update local state when prop changes
  useEffect(() => {
    setLocalConteo(conteo)
  }, [conteo])

  // Fecha documento editing state
  const [editingFechaDoc, setEditingFechaDoc] = useState(false)
  const [fechaDocumentoEdit, setFechaDocumentoEdit] = useState('')
  const [isSavingFechaDoc, setIsSavingFechaDoc] = useState(false)

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [motivoCancelacion, setMotivoCancelacion] = useState('')

  // Verificar si el usuario puede editar conteos completados (permiso Total + ubicación asignada + máximo 3 ediciones + máximo 1 mes desde creación)
  const canEditCompletedConteo = (conteo) => {
    // Solo conteos COMPLETADO o PARCIALMENTE_COMPLETADO pueden editarse
    if (conteo.estado !== 'COMPLETADO' && conteo.estado !== 'PARCIALMENTE_COMPLETADO') {
      return false
    }

    // Verificar límite de 3 ediciones
    const edicionesCount = conteo.ediciones_count || 0
    if (edicionesCount >= 3) {
      return false
    }

    // Verificar que no haya pasado más de 1 mes desde la fecha de completado
    if (conteo.fecha_completado) {
      const fechaCompletado = conteo.fecha_completado?.toDate ? conteo.fecha_completado.toDate() : new Date(conteo.fecha_completado.seconds * 1000)
      const unMesDespues = new Date(fechaCompletado)
      unMesDespues.setMonth(unMesDespues.getMonth() + 1)
      const ahora = new Date()

      if (ahora > unMesDespues) {
        return false
      }
    }

    // Admin Global siempre puede editar (si no excede el límite de ediciones y tiempo)
    if (isAdmin()) {
      return true
    }

    // Verificar permiso Total en conteos
    const level = getPermissionLevel('conteos')
    if (level !== 'total') {
      return false
    }

    return true
  }

  const eliminarDetalleMutation = useMutation({
    mutationFn: (detalleId) => dataService.deleteDetalleConteo(detalleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conteo-detalle', conteo.id] })
      toast.success('Eliminado', 'El producto fue eliminado del conteo')
      setEliminandoId(null)
    },
    onError: (error) => {
      toast.error('Error', error.message || 'No se pudo eliminar el producto')
      setEliminandoId(null)
    }
  })

  const handleEliminarProducto = (detalle) => {
    setConfirmDetalle(detalle)
  }

  const confirmarEliminar = () => {
    if (!confirmDetalle) return
    setEliminandoId(confirmDetalle.id)
    eliminarDetalleMutation.mutate(confirmDetalle.id)
    setConfirmDetalle(null)
  }

  // Cargar detalles del conteo
  const { data: detalles = [], isLoading } = useQuery({
    queryKey: ['conteo-detalle', conteo.id],
    queryFn: () => dataService.getDetalleConteos(conteo.id)
  })

  // Cargar productos para obtener información completa
  const { data: productos = [] } = useQuery({
    queryKey: ['productos'],
    queryFn: () => dataService.getProductos()
  })

  // Cargar usuarios para mostrar nombres reales
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => dataService.getUsuarios()
  })

  // Cargar ubicaciones para export
  const { data: ubicaciones = [] } = useQuery({
    queryKey: ['ubicaciones'],
    queryFn: () => dataService.getUbicaciones()
  })

  const handleExportExcel = () => {
    try {
      exportConteoToExcel(conteo, detalles, productos, ubicaciones)
      toast.success('Exportado', 'Conteo exportado a Excel')
    } catch (err) {
      toast.error('Error', err.message || 'No se pudo exportar')
    }
  }

  // Función para obtener información completa del producto
  const getProductoInfo = (productoId) => {
    if (!productoId) {
      return {
        id: 'N/A',
        nombre: 'Producto no especificado',
        especificacion: '',
        unidad_medida: ''
      }
    }
    
    // Convertir ambos IDs a string para comparación (pueden ser numéricos o strings)
    const productoIdStr = String(productoId)
    const producto = productos.find(p => String(p.id) === productoIdStr)
    
    return producto || {
      id: productoId,
      nombre: `Producto ${productoId}`,
      especificacion: 'No disponible',
      unidad_medida: 'N/A'
    }
  }

  // Función para obtener nombre del usuario
  const getUsuarioNombre = (usuarioId) => {
    if (!usuarioId) return '-'
    // First try to find by doc.id (Firestore ID)
    let usuario = usuarios.find(u => u.id === usuarioId)
    // If not found, try to find by codigo field
    if (!usuario) {
      usuario = usuarios.find(u => u.codigo === usuarioId)
    }
    return usuario ? usuario.nombre : usuarioId
  }

  // Función para obtener nombre de la ubicación
  const getUbicacionNombre = (ubicacionId) => {
    if (!ubicacionId) return '-'
    const ubicacion = ubicaciones.find(u => u.id === ubicacionId)
    return ubicacion ? ubicacion.nombre : ubicacionId
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    try {
      return format(new Date(dateString), "dd-MM-yyyy HH:mm", { locale: es })
    } catch {
      return '-'
    }
  }

  const getDiferencia = (cantidad_fisica, cantidad_sistema) => {
    if (cantidad_fisica === null || cantidad_fisica === undefined) return null
    return cantidad_fisica - cantidad_sistema
  }

  // Obtener fecha_documento formateada
  const getFechaDocumento = () => {
    let fecha = localConteo.fecha_documento || localConteo.fecha_creacion
    if (!fecha) return '-'
    
    // Handle different date formats
    let dateObj
    if (typeof fecha?.toDate === 'function') {
      dateObj = fecha.toDate()
    } else if (fecha?.seconds !== undefined) {
      dateObj = new Date(fecha.seconds * 1000)
    } else if (fecha instanceof Date) {
      dateObj = fecha
    } else {
      dateObj = new Date(fecha)
    }
    
    if (isNaN(dateObj.getTime())) return '-'
    
    return format(dateObj, 'dd/MM/yyyy', { locale: es })
  }

  // Iniciar edición de fecha_documento
  const handleEditFechaDoc = () => {
    const fecha = localConteo.fecha_documento || localConteo.fecha_creacion
    const dateObj = fecha?.toDate ? fecha.toDate() : new Date(fecha)
    setFechaDocumentoEdit(format(dateObj, 'yyyy-MM-dd'))
    setEditingFechaDoc(true)
  }

  // Guardar fecha_documento
  const handleSaveFechaDocumento = async () => {
    if (!fechaDocumentoEdit) return
    
    // Parse "YYYY-MM-DD" safely as local date
    const [year, month, day] = fechaDocumentoEdit.split('-').map(Number)
    const parsedDate = new Date(year, month - 1, day) // local date, no time
    
    if (isNaN(parsedDate.getTime())) {
      toast.error('Error', 'Por favor selecciona una fecha válida del calendario')
      return
    }
    
    // Ensure the date is within reasonable bounds (not too far in past or future)
    const now = new Date()
    const tenYearsAgo = new Date(now.getFullYear() - 10, 0, 1)
    const tenYearsFromNow = new Date(now.getFullYear() + 10, 11, 31)
    
    if (parsedDate < tenYearsAgo || parsedDate > tenYearsFromNow) {
      toast.error('Error', 'Por favor selecciona una fecha dentro de un rango razonable')
      return
    }
    
    setIsSavingFechaDoc(true)
    try {
      const fechaAnterior = getFechaDocumento()
      
      const result = await dataService.updateFechaDocumento({
        collection_name: 'conteos',
        document_id: conteo.id,
        nueva_fecha: fechaDocumentoEdit,
        fecha_anterior: fechaAnterior,
        usuario_id: user?.id || 'USR001'
      })
      if (result.success) {
        toast.success('Fecha Actualizada', 'La fecha del documento ha sido actualizada')
        
        // Update local state immediately to reflect the change in the modal
        const updatedConteo = {
          ...localConteo,
          // use parsedDate directly, no setHours
          fecha_documento: Timestamp.fromDate(parsedDate)
        }
        
        // Update local state FIRST for immediate visual feedback
        setLocalConteo(updatedConteo)
        
        // Update the conteo in the query cache
        queryClient.setQueryData(['conteos'], (oldData) => {
          if (!oldData) return oldData
          return oldData.map(c => c.id === conteo.id ? updatedConteo : c)
        })
        
        // Update specific conteo query cache
        queryClient.setQueryData(['conteo', conteo.id], updatedConteo)
        
        // Invalidate queries to refresh data and sorting
        queryClient.invalidateQueries({ queryKey: ['conteos'] })
        queryClient.invalidateQueries({ queryKey: ['conteos', undefined] })
        
        setEditingFechaDoc(false)
      } else {
        toast.error('Error', result.message || 'No se pudo actualizar la fecha')
      }
    } catch (err) {
      toast.error('Error', err.message || 'No se pudo actualizar la fecha')
    } finally {
      setIsSavingFechaDoc(false)
    }
  }

  // Cancelar conteo
  const handleCancelarConteo = async () => {
    if (!motivoCancelacion.trim()) {
      toast.error('Motivo requerido', 'Por favor ingresa un motivo para la cancelación')
      return
    }
    
    try {
      if (onCancelar) {
        await onCancelar(motivoCancelacion)
      }
      setShowCancelModal(false)
      setMotivoCancelacion('')
    } catch (err) {
      toast.error('Error', err.message || 'No se pudo cancelar el conteo')
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-card-hover max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-ocean p-4 flex-shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Detalle de Conteo</h2>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-white/90 text-sm">Código: {formatDisplayId(conteo, 'CT')}</p>
                  <span className="text-white/50">|</span>
                  {editingFechaDoc ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={fechaDocumentoEdit}
                        onChange={(e) => setFechaDocumentoEdit(e.target.value)}
                        className="px-2 py-1 text-sm rounded-lg bg-white/20 text-white border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
                      />
                      <button
                        onClick={handleSaveFechaDocumento}
                        disabled={isSavingFechaDoc}
                        className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
                      >
                        {isSavingFechaDoc ? '...' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => setEditingFechaDoc(false)}
                        className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white/80 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-white/70" />
                      <span className="text-white/90 text-sm">{getFechaDocumento()}</span>
                      {canEdit('conteos') && (
                        <button
                          onClick={handleEditFechaDoc}
                          className="p-1 hover:bg-white/20 rounded transition-colors"
                          title="Editar fecha del documento"
                        >
                          <Pencil size={12} className="text-white/70 hover:text-white" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-4 py-2 rounded-full text-sm font-semibold ${
                  conteo.estado === 'PROGRAMADO'
                    ? 'bg-blue-500 text-white'
                    : conteo.estado === 'COMPLETADO'
                    ? 'bg-green-500 text-white'
                    : conteo.estado === 'PARCIALMENTE_COMPLETADO'
                    ? 'bg-green-400 text-white'
                    : conteo.estado === 'CANCELADO'
                    ? 'bg-red-500 text-white'
                    : 'bg-yellow-500 text-white'
                }`}>
                  {conteo.estado === 'PARCIALMENTE_COMPLETADO' ? 'PARCIAL COMPLETADO' : conteo.estado}
                </span>
                {(conteo.estado === 'COMPLETADO' || conteo.estado === 'PARCIALMENTE_COMPLETADO') && detalles.length > 0 && (
                  <button
                    onClick={handleExportExcel}
                    className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                    title="Exportar a Excel"
                  >
                    <Download className="text-white" size={20} />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X className="text-white" size={24} />
                </button>
              </div>
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
                  conteo.fecha_creacion,
                  conteo.fecha_completado,
                  conteo.fecha_edicion
                ].filter(Boolean).length}
              </span>
              {activeTab === 'logs' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400"></div>
              )}
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Tab: Detalles */}
          {activeTab === 'detalles' && (
            <>
          {/* Tarjeta de Ubicación y Tipo */}
          <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Ubicación */}
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-800 rounded-lg">
                  <MapPin className="text-red-600 dark:text-red-300" size={20} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">Ubicación</span>
                  <p className="font-bold text-lg text-slate-900 dark:text-slate-100 mt-1">
                    {getUbicacionNombre(conteo.ubicacion_id)}
                  </p>
                </div>
              </div>

              {/* Tipo de Conteo */}
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                  <Package className="text-blue-600 dark:text-blue-300" size={20} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Tipo de Conteo</span>
                  <p className="font-bold text-lg text-slate-900 dark:text-slate-100 mt-1">
                    {conteo.tipo_conteo?.charAt(0).toUpperCase() + conteo.tipo_conteo?.slice(1)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Productos */}
          <div className="max-h-[24rem] overflow-hidden">
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Package size={24} className="text-primary-600" />
              Productos Contados {detalles.length > 0 && `(${detalles.length} items)`}
            </h3>

            {isLoading ? (
              <div className="py-12">
                <LoadingSpinner text="Cargando detalles..." />
              </div>
            ) : detalles.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <Package size={64} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-600 dark:text-slate-400 text-lg">No hay productos contados en este conteo</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="overflow-y-auto max-h-[20rem]">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Producto</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">UoM de Compra</th>
                        <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Stock Sistema</th>
                        <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Stock Físico</th>
                        <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Diferencia</th>
                        {conteo.estado === 'EN_PROGRESO' && canEdit('conteos') && (
                          <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Acciones</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {detalles.map((detalle, index) => {
                        const productoInfo = getProductoInfo(detalle.producto_id)
                        const diferencia = getDiferencia(detalle.cantidad_fisica, detalle.cantidad_sistema)
                        return (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="p-2 bg-primary-100 rounded-lg">
                                  <Package size={16} className="text-primary-600" />
                                </div>
                                <p className="font-semibold text-slate-900 dark:text-slate-100">{productoInfo.nombre}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-slate-700 dark:text-slate-300">
                                {productoInfo.especificacion || <span className="text-slate-400 italic">Sin especificación</span>}
                                {productoInfo.unidad_medida && (
                                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {productoInfo.unidad_medida}
                                  </span>
                                )}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                {detalle.cantidad_sistema || 0}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                {detalle.cantidad_fisica !== null && detalle.cantidad_fisica !== undefined
                                  ? detalle.cantidad_fisica
                                  : '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {diferencia !== null ? (
                                <div className="flex items-center justify-center gap-2">
                                  {diferencia === 0 ? (
                                    <CheckCircle className="text-green-600" size={20} />
                                  ) : (
                                    <AlertCircle className="text-yellow-600" size={20} />
                                  )}
                                  <span className={`text-lg font-bold ${
                                    diferencia === 0 ? 'text-green-600' :
                                    diferencia > 0 ? 'text-blue-600' : 'text-red-600'
                                  }`}>
                                    {diferencia > 0 ? '+' : ''}{diferencia}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            {conteo.estado === 'EN_PROGRESO' && canEdit('conteos') && (
                              <td className="px-6 py-4 text-center">
                                <button
                                  onClick={() => handleEliminarProducto(detalle)}
                                  disabled={eliminandoId === detalle.id}
                                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                  title="Eliminar del conteo"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Observaciones */}
          {conteo.observaciones && (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Observaciones</h4>
              <p className="text-slate-700 dark:text-slate-300">{conteo.observaciones}</p>
            </div>
          )}
            </>
          )}

          {/* Tab: Logs de Actividad */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              {/* Creación */}
              {conteo.fecha_creacion && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                  <h3 className="font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2 mb-3">
                    <Calendar size={20} />
                    Creación
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-blue-700/70 dark:text-blue-300/70 mb-1">Fecha de creación</p>
                      <p className="font-medium text-blue-900 dark:text-blue-100">
                        {formatDate(conteo.fecha_creacion.toDate ? conteo.fecha_creacion.toDate() : new Date(conteo.fecha_creacion))}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-700/70 dark:text-blue-300/70 mb-1">Responsable</p>
                      <p className="font-medium text-blue-900 dark:text-blue-100">
                        {getUsuarioNombre(conteo.usuario_responsable_id)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Completado */}
              {conteo.fecha_completado && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                  <h3 className="font-semibold text-green-800 dark:text-green-200 flex items-center gap-2 mb-3">
                    <CheckCircle size={20} />
                    Completado
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-green-700/70 dark:text-green-300/70 mb-1">Fecha de completado</p>
                      <p className="font-medium text-green-900 dark:text-green-100">
                        {safeFormatDate(conteo.fecha_completado, "dd-MM-yyyy HH:mm", 'Fecha no disponible')}
                      </p>
                    </div>
                    <div>
                      <p className="text-green-700/70 dark:text-green-300/70 mb-1">Ejecutado por</p>
                      <p className="font-medium text-green-900 dark:text-green-100">
                        {getUsuarioNombre(conteo.usuario_ejecutor_id)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Edición */}
              {conteo.fecha_edicion && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                  <h3 className="font-semibold text-purple-800 dark:text-purple-200 flex items-center gap-2 mb-3">
                    <Edit3 size={20} />
                    Edición
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-purple-700/70 dark:text-purple-300/70 mb-1">Última edición</p>
                      <p className="font-medium text-purple-900 dark:text-purple-100">
                        {safeFormatDate(conteo.fecha_edicion, "dd-MM-yyyy HH:mm", 'Fecha no disponible')}
                      </p>
                    </div>
                    <div>
                      <p className="text-purple-700/70 dark:text-purple-300/70 mb-1">Editado por</p>
                      <p className="font-medium text-purple-900 dark:text-purple-100">
                        {getUsuarioNombre(conteo.usuario_editor_id)}
                      </p>
                    </div>
                    <div>
                      <p className="text-purple-700/70 dark:text-purple-300/70 mb-1">Total de ediciones</p>
                      <p className="font-medium text-purple-900 dark:text-purple-100">
                        {conteo.ediciones_count || 0}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Sticky */}
        <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 flex-shrink-0 sticky bottom-0">
          <div className="flex justify-end gap-3">
            {(conteo.estado === 'PENDIENTE' || conteo.estado === 'EN_PROGRESO') && onCancelar && canEdit('conteos') && (
              <Button
                variant="danger"
                onClick={() => setShowCancelModal(true)}
                disabled={isCancelando}
              >
                <Ban size={16} className="mr-1.5" />
                Cancelar Conteo
              </Button>
            )}
            {canEditCompletedConteo(conteo) && onEdit && (
              <Button
                variant="outline"
                onClick={() => onEdit(conteo)}
                className={(conteo.ediciones_count || 0) === 2 ? 'text-red-600 border-red-300 hover:bg-red-50' : ''}
              >
                <Edit3 size={16} className="mr-1.5" />
                Editar
                {(conteo.ediciones_count || 0) > 0 && (
                  <span className="ml-2 text-xs">
                    ({conteo.ediciones_count || 0}/3 ediciones)
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Modal de confirmación para eliminar producto */}
      {confirmDetalle && (
        <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-10 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full flex-shrink-0">
                <Trash2 className="text-red-600" size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                  Eliminar producto del conteo
                </h3>
                <p className="text-slate-700 dark:text-slate-300 font-medium mb-2">
                  {getProductoInfo(confirmDetalle.producto_id).nombre}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Elimina este producto si no corresponde a la frecuencia de conteo configurada o a la empresa. Puedes ajustar su configuración en el módulo <strong>Productos</strong>.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => setConfirmDetalle(null)}
                className="flex-1"
                disabled={eliminandoId !== null}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={confirmarEliminar}
                loading={eliminandoId !== null}
                className="flex-1"
              >
                {eliminandoId !== null ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cancelación de conteo */}
      {showCancelModal && (
        <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-10 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full flex-shrink-0">
                <Ban className="text-red-600" size={22} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                  Cancelar Conteo
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Esta acción no se puede revertir. Si el conteo tiene valores registrados, estos no afectarán el inventario.
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Motivo de cancelación *
                  </label>
                  <textarea
                    value={motivoCancelacion}
                    onChange={(e) => setMotivoCancelacion(e.target.value)}
                    placeholder="Ingresa el motivo de la cancelación..."
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 dark:text-slate-100 resize-none"
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCancelModal(false)
                  setMotivoCancelacion('')
                }}
                className="flex-1"
                disabled={isCancelando}
              >
                Volver
              </Button>
              <Button
                variant="danger"
                onClick={handleCancelarConteo}
                loading={isCancelando}
                className="flex-1"
              >
                {isCancelando ? 'Cancelando...' : 'Cancelar Conteo'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
