import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '../common/Button'
import LoadingSpinner from '../common/LoadingSpinner'
import { Package, MapPin, Calendar, FileText, CheckCircle, X, Download, Edit3, Ban, AlertTriangle, Factory, ArrowRight, Pencil, Maximize2, Minimize2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Timestamp } from 'firebase/firestore'
import dataService from '../../services/dataService'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { exportTransferenciaToExcel } from '../../utils/exportUtils'
import { formatDisplayId, safeFormatDate, formatCantidad } from '../../utils/formatters'
import { buildEquivalenceMap, convertUnits } from '../../utils/unitConversion'
import UoMBadge from '../common/UoMBadge'

// Función para normalizar estados (importada del hook useMovimientos)
const normalizeEstado = (estado) => {
  if (!estado) return ''
  const s = estado.toString().toUpperCase().trim()
  if (s === 'COMPLETADO' || s === 'COMPLETADA') return 'COMPLETADO'
  if (s === 'PARCIAL') return 'PARCIAL'
  if (s === 'RECIBIENDO') return 'RECIBIENDO'
  if (s === 'BORRADOR') return 'BORRADOR'
  if (s.startsWith('CONFIRM')) return 'COMPLETADO'
  if (s.startsWith('CANCEL')) return 'CANCELADA'
  if (s.startsWith('PENDIEN')) return 'PENDIENTE'
  return s
}

export default function TransferenciaDetail({
  transferencia,
  onClose,
  onConfirmar,
  onConfirmarParcial,
  isConfirmando,
  onCancelar,
  canCancel = false,
  canEdit = false,
  isEntradasView = false,
  onEditar,
  onConfirmarEnvio,
  isConfirmandoEnvio = false
}) {
  const toast = useToastStore()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  
  // Cargar equivalencias para conversiones
  const { data: equivalencias = [] } = useQuery({ 
    queryKey: ['config-equivalencias'], 
    queryFn: () => dataService.getUnitEquivalences() 
  })
  const eqMap = useMemo(() => buildEquivalenceMap(equivalencias), [equivalencias])

  const [modoRecepcion, setModoRecepcion] = useState(null) // null | 'total' | 'parcial' | 'editar'
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState({})
  const inputRefs = useRef({})
  const inputRefsById = useRef({})
  const [activeTab, setActiveTab] = useState('detalles') // 'detalles' | 'logs'

  // Local state to track the current transferencia (allows immediate updates)
  const [localTransferencia, setLocalTransferencia] = useState(transferencia)

  // Update local state when prop changes
  useEffect(() => {
    setLocalTransferencia(transferencia)
  }, [transferencia])

  // Fecha documento editing state
  const [editingFechaDoc, setEditingFechaDoc] = useState(false)
  const [fechaDocumentoEdit, setFechaDocumentoEdit] = useState('')
  const [isSavingFechaDoc, setIsSavingFechaDoc] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [motivoCancelacion, setMotivoCancelacion] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)

  // Edit confirmation modal state (for entradas completadas)
  const [showEditConfirmModal, setShowEditConfirmModal] = useState(false)

  // Observaciones de recepción
  const [observacionesRecepcion, setObservacionesRecepcion] = useState('')
  const estadoNormalizado = normalizeEstado(transferencia.estado)
  const isSalidaDraft = !isEntradasView && estadoNormalizado === 'BORRADOR'
  const isEntradaDraft = isEntradasView && estadoNormalizado === 'BORRADOR'

  // Effect to detect when estado changes to RECIBIENDO and activate edit mode
  useEffect(() => {
    if (transferencia.estado === 'RECIBIENDO' && modoRecepcion === null && isEntradasView) {
      setModoRecepcion('editar')
      // Initialize cantidadesRecibidas with current values from detalles
      if (detalles && detalles.length > 0) {
        const initialValues = {}
        detalles.forEach(d => {
          const detalleId = d.id ?? d.detalle_id
          if (detalleId === undefined || detalleId === null) return
          initialValues[detalleId] = d.cantidad_enviada ?? d.cantidad
        })
        setCantidadesRecibidas(initialValues)
      }
    }
  }, [transferencia.estado, modoRecepcion, isEntradasView]) // Removed detalles from dependencies

  // Validación inicial para evitar errores
  if (!transferencia) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl shadow-card-hover max-w-md w-full p-6 text-center">
          <p className="text-slate-600">Error: No se encontró información del movimiento</p>
          <Button onClick={onClose} className="mt-4">Cerrar</Button>
        </div>
      </div>
    )
  }

  // Cargar detalles del movimiento
  const { data: detalles = [], isLoading } = useQuery({
    queryKey: ['movimiento-detalle', transferencia.id],
    queryFn: () => {
      if (transferencia.tipo_movimiento === 'VENTA') {
        return dataService.getDetalleVentas(transferencia.id)
      } else {
        return dataService.getDetalleMovimientos(transferencia.id)
      }
    },
    enabled: !!transferencia?.id
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

  // Cargar insumos de producción (solo para PRODUCCION)
  const isProduccion = (transferencia.tipo_movimiento || '').toUpperCase() === 'PRODUCCION'
  const { data: insumosProduccion = [] } = useQuery({
    queryKey: ['insumos-produccion', transferencia.id],
    queryFn: () => dataService.getInsumosProduccion(transferencia.id),
    enabled: !!transferencia?.id && isProduccion
  })

  // Cargar unidades para mapear unidad_original_id
  const { data: unidadesDB = [] } = useQuery({
    queryKey: ['config-unidades'],
    queryFn: () => dataService.getUnidadesMedida()
  })

  // Fallback: when detalles subcollection is empty but transferencia.productos exists (e.g. VENTA COMPLETADO records)
  const embeddedProductos = !isLoading && detalles.length === 0 && Array.isArray(transferencia.productos) && transferencia.productos.length > 0
    ? transferencia.productos.map((p, i) => ({
        id: `embedded-${i}`,
        producto_id: p.producto_id || p.id || '',
        nombre: p.nombre || p.producto_nombre || '',
        cantidad_enviada: p.cantidad_enviada ?? p.cantidad ?? 0,
        cantidad: p.cantidad_enviada ?? p.cantidad ?? 0,
        cantidad_recibida: p.cantidad_recibida ?? null,
        unidad_medida: p.unidad_medida || '',
        costo_unitario: p.costo_unitario || 0,
      }))
    : null
  const detallesDisplay = embeddedProductos ?? detalles

  const handleExportExcel = () => {
    try {
      exportTransferenciaToExcel(transferencia, detalles, productos, ubicaciones)
      toast.success('Exportado', 'Transferencia exportada a Excel')
    } catch (err) {
      toast.error('Error', err.message || 'No se pudo exportar')
    }
  }

  // Obtener fecha_documento formateada
  const getFechaDocumento = () => {
    let fecha = localTransferencia.fecha_documento || localTransferencia.fecha_creacion
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
    const fecha = localTransferencia.fecha_documento || localTransferencia.fecha_creacion
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
        collection_name: 'movimientos',
        document_id: transferencia.id,
        nueva_fecha: fechaDocumentoEdit,
        fecha_anterior: fechaAnterior,
        usuario_id: user?.id || 'USR001'
      })
      if (result.success) {
        toast.success('Fecha Actualizada', 'La fecha del documento ha sido actualizada')
        
        // Update local state immediately to reflect the change in the modal
        const updatedTransferencia = {
          ...localTransferencia,
          // use parsedDate directly, no setHours
          fecha_documento: Timestamp.fromDate(parsedDate)
        }
        
        // Update local state FIRST for immediate visual feedback
        setLocalTransferencia(updatedTransferencia)
        
        // Update the transferencia in the query cache
        queryClient.setQueryData(['movimientos'], (oldData) => {
          if (!oldData) return oldData
          return oldData.map(m => m.id === transferencia.id ? updatedTransferencia : m)
        })
        
        // Update specific transferencia query cache
        queryClient.setQueryData(['movimiento', transferencia.id], updatedTransferencia)
        
        // Invalidate queries to refresh data and sorting
        queryClient.invalidateQueries({ queryKey: ['movimientos'] })
        queryClient.invalidateQueries({ queryKey: ['movimientos', undefined] })
        
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

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    try {
      // Manejar diferentes formatos de fecha
      let date

      // Si es un objeto Timestamp de Firestore (con segundos y nanosegundos)
      if (typeof dateString === 'object' && dateString !== null) {
        // Timestamp de Firestore { seconds: number, nanoseconds: number }
        if (dateString.seconds !== undefined && dateString.nanoseconds !== undefined) {
          date = new Date(dateString.seconds * 1000 + dateString.nanoseconds / 1000000)
        }
        // Otro tipo de objeto con toDate()
        else if (typeof dateString.toDate === 'function') {
          date = dateString.toDate()
        }
        // Objeto Date normal
        else if (dateString instanceof Date) {
          date = dateString
        }
        // Otro objeto, intentar convertir
        else {
          date = new Date(dateString)
        }
      }
      // Si es un timestamp de Firestore (segundos o milisegundos)
      else if (typeof dateString === 'number') {
        // Si parece estar en segundos (timestamp de Firestore), convertir a milisegundos
        if (dateString < 10000000000) {
          date = new Date(dateString * 1000)
        } else {
          date = new Date(dateString)
        }
      }
      // Si es string
      else if (typeof dateString === 'string') {
        // Si es string, intentar crear fecha directamente
        date = new Date(dateString)

        // Si falla, intentar con timestamp numérico
        if (isNaN(date.getTime()) && !isNaN(dateString)) {
          const timestamp = parseFloat(dateString)
          if (timestamp < 10000000000) {
            date = new Date(timestamp * 1000)
          } else {
            date = new Date(timestamp)
          }
        }
      } else {
        date = new Date(dateString)
      }

      // Validar fecha final
      if (isNaN(date.getTime())) {
        return '-'
      }

      return format(date, "dd-MM-yyyy HH:mm", { locale: es })
    } catch (error) {
      return '-'
    }
  }

  // Función para obtener la mejor fecha de creación disponible
  const getFechaCreacion = () => {
    // Intentar diferentes campos en orden de preferencia
    const posiblesFechas = [
      transferencia.fecha_creacion,
      transferencia.createdAt,
      transferencia.created_at,
      transferencia.fecha,
      transferencia.timestamp,
      transferencia.created,
      transferencia.creation_date,
      transferencia.date_created,
      // Timestamps de Firestore (pueden ser objetos con seconds)
      transferencia._documentCreateTime,
      transferencia._createTime,
      transferencia.createTime
    ].filter(fecha => fecha != null && fecha !== '' && fecha !== undefined)

    if (posiblesFechas.length > 0) {
      return formatDate(posiblesFechas[0])
    }

    return '-'
  }

  // Función para obtener la mejor fecha de confirmación disponible
  const getFechaConfirmacion = () => {
    // Intentar diferentes campos en orden de preferencia
    const posiblesFechas = [
      transferencia.fecha_confirmacion,
      transferencia.updatedAt,
      transferencia.updated_at,
      transferencia.fecha_ultima_actualizacion,
      transferencia.last_updated,
      transferencia.modified_at,
      transferencia.confirmation_date,
      transferencia.date_confirmed,
      // Timestamps de Firestore
      transferencia._documentUpdateTime,
      transferencia._updateTime,
      transferencia.updateTime
    ].filter(fecha => fecha != null && fecha !== '' && fecha !== undefined)

    if (posiblesFechas.length > 0) {
      return formatDate(posiblesFechas[0])
    }

    return null // Retornar null para no mostrar la sección si no hay fecha
  }

  // Check if any detalle already has cantidad_recibida set (already confirmed)
  const detalle_has_recibida = detalles.some(d => d.cantidad_recibida !== null && d.cantidad_recibida !== undefined)

  // Inicializar cantidades recibidas con los valores enviados cuando se activa el modo parcial
  useEffect(() => {
    if (modoRecepcion === 'parcial' && detalles.length > 0) {
      const cantidadesIniciales = {}
      detalles.forEach(d => {
        const detalleId = d.id ?? d.detalle_id
        if (detalleId === undefined || detalleId === null) return
        const cantEnviada = d.cantidad_enviada ?? d.cantidad
        cantidadesIniciales[detalleId] = cantEnviada
      })
      setCantidadesRecibidas(cantidadesIniciales)
    }
  }, [modoRecepcion]) // Remove detalles from dependencies to prevent overriding user changes

  const handleConfirmarTodo = () => {
    if (onConfirmar) onConfirmar(null, observacionesRecepcion)
  }

  const handleConfirmarParcial = () => {
    const productosRecibidos = detalles.map(d => {
      const detalleId = (d.id ?? d.detalle_id)
      const producto = productos.find(p => p.id === d.producto_id)
      const baseUnitId = producto?.purchase_unit_id
      
      let cantRec = cantidadesRecibidas[detalleId] !== undefined
        ? cantidadesRecibidas[detalleId]
        : (d.cantidad_original !== undefined ? d.cantidad_original : (d.cantidad_enviada !== undefined ? d.cantidad_enviada : d.cantidad))
      
      // Si la cantidad ingresada está en una unidad original, convertir a la unidad base para el stock
      let cantidad_base = cantRec
      if (d.unidad_original_id && baseUnitId && d.unidad_original_id !== baseUnitId) {
        // Necesitamos el ratio de conversión. Usamos convertUnits.
        // Como cantRec está en unidad_original_id, convertimos a baseUnitId (unidad base)
        const converted = convertUnits(cantRec, d.unidad_original_id, baseUnitId, eqMap)
        if (converted !== null) cantidad_base = parseFloat(converted.toFixed(6))
      }

      return {
        detalle_id: detalleId,
        producto_id: d.producto_id,
        cantidad_recibida: cantidad_base, // Siempre guardar en base en el campo principal
        cantidad_recibida_original: d.unidad_original_id ? cantRec : undefined,
        unidad_recibida_id: d.unidad_original_id || undefined
      }
    })
    if (onConfirmarParcial) {
      onConfirmarParcial(productosRecibidos, observacionesRecepcion)
    } else if (onConfirmar) {
      onConfirmar(productosRecibidos, observacionesRecepcion)
    }
  }

  const handleCancelarMovimiento = async () => {
    if (!motivoCancelacion.trim()) {
      toast.error('Motivo requerido', 'Por favor ingresa un motivo para la cancelación')
      return
    }
    setIsCancelling(true)
    try {
      if (onCancelar) {
        await onCancelar(motivoCancelacion)
      }
      setShowCancelModal(false)
      setMotivoCancelacion('')
      toast.success('Movimiento Cancelado', 'El movimiento ha sido cancelado exitosamente')
    } catch (err) {
      toast.error('Error', err.message || 'No se pudo cancelar el movimiento')
    } finally {
      setIsCancelling(false)
    }
  }

  const getEstadoBadge = (estado) => {
    const map = {
      PENDIENTE: 'bg-yellow-500 text-white',
      PARCIAL: 'bg-orange-500 text-white',
      COMPLETADO: 'bg-green-500 text-white',
      CANCELADA: 'bg-red-500 text-white'
    }
    return map[estado] || 'bg-slate-500 text-white'
  }

  // Mostrar estado de carga inicial
  if (isLoading && detalles.length === 0) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl shadow-card-hover max-w-md w-full p-6 text-center">
          <LoadingSpinner text="Cargando detalles del movimiento..." />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 md:p-4">
      <div className={`bg-white dark:bg-slate-800 shadow-card-hover w-full overflow-hidden flex flex-col transition-all duration-300 ${
        isExpanded
          ? 'rounded-2xl max-w-[calc(100vw-1.5rem)] lg:max-w-[calc(100vw-7rem)] h-[calc(100vh-1.5rem)]'
          : 'rounded-3xl max-w-6xl max-h-[90vh]'
      }`}>
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-ocean p-4 flex-shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{isProduccion ? 'Detalle de Producción' : 'Detalle de Movimiento'}</h2>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-white/90 text-sm">Código: {transferencia.codigo_legible || formatDisplayId(transferencia, isProduccion ? 'OP' : 'MV')}</p>
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
                      {canEdit && (
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
                {onConfirmar && normalizeEstado(transferencia.estado) === 'PENDIENTE' && (
                  <p className="text-white/80 text-sm mt-2 flex items-center gap-2">
                    <CheckCircle size={16} />
                    {isProduccion ? 'Listo para confirmar producción' : 'Listo para confirmar recepción'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-4 py-2 rounded-full text-sm font-semibold ${getEstadoBadge(transferencia.estado)}`}>
                  {transferencia.estado === 'PARCIAL' ? 'Parcial' : transferencia.estado}
                </span>
                {(transferencia.estado === 'COMPLETADO' || transferencia.estado === 'PARCIAL') && detalles.length > 0 && (
                  <button
                    onClick={handleExportExcel}
                    className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                    title="Exportar a Excel"
                  >
                    <Download className="text-white" size={20} />
                  </button>
                )}
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
                  transferencia.fecha_creacion,
                  transferencia.fecha_confirmacion || transferencia.updatedAt,
                  transferencia.fecha_ultima_edicion
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
          {/* Tarjeta Origen-Destino Visual */}
          {isProduccion ? (
            <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 bg-violet-100 dark:bg-violet-800 rounded-lg">
                    <Factory className="text-violet-600 dark:text-violet-300" size={20} />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">Ubicación de Producción</span>
                    <p className="font-bold text-lg text-slate-900 dark:text-slate-100">
                      {transferencia.destino_nombre || ubicaciones.find(u => u.id === transferencia.destino_id)?.nombre || transferencia.destino_id}
                    </p>
                  </div>
                </div>
                {transferencia.numero_documento && (
                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nro/Nota</span>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{transferencia.numero_documento}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
          <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-6">
            <div className="flex items-center justify-between gap-4">
              {/* Origen */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 bg-orange-100 dark:bg-orange-800 rounded-lg">
                    <MapPin className="text-orange-600 dark:text-orange-300" size={20} />
                  </div>
                  <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">Origen</span>
                </div>
                <p className="font-bold text-lg text-slate-900 dark:text-slate-100">
                  {transferencia.origen_nombre || ubicaciones.find(u => u.id === transferencia.origen_id)?.nombre || transferencia.origen_id}
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
                  <span className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                    {transferencia.tipo_movimiento === 'VENTA' ? 'Beneficiario' : 'Destino'}
                  </span>
                </div>
                <p className="font-bold text-lg text-slate-900 dark:text-slate-100">
                  {transferencia.tipo_movimiento === 'VENTA'
                    ? (transferencia.beneficiario_nombre || 'Beneficiario no especificado')
                    : (transferencia.destino_nombre || ubicaciones.find(u => u.id === transferencia.destino_id)?.nombre || transferencia.destino_id)
                  }
                </p>
              </div>
            </div>
          </div>
          )}

          {/* Productos */}
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Package size={24} className="text-primary-600" />
              {isProduccion ? 'Productos Producidos' : transferencia.tipo_movimiento === 'VENTA' ? 'Productos Vendidos' : 'Productos Transferidos'} {detalles.length > 0 && `(${detalles.length} items)`}
            </h3>

            {isLoading ? (
              <div className="py-12">
                <LoadingSpinner text="Cargando detalles..." />
              </div>
            ) : detallesDisplay.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <Package size={64} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-600 dark:text-slate-400 text-lg">No hay productos en este movimiento</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                {(modoRecepcion === 'parcial' || modoRecepcion === 'editar') && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700 px-4 py-3">
                    <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                      <span className="font-semibold">{modoRecepcion === 'editar' ? 'Modo de Edición:' : 'Modo de Recepción Parcial:'}</span>
                      <span className="text-orange-600 font-medium">Naranja = Recibido &gt; Enviado</span>
                      <span className="text-blue-600 font-medium">Azul = Recibido &lt; Enviado</span>
                    </p>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Producto</th>
                        <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">UoM de Compra</th>
                        <th className="px-4 py-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {transferencia.tipo_movimiento === 'VENTA' ? 'Cantidad' : 'Enviada'}
                      </th>
                        {(modoRecepcion === 'parcial' || modoRecepcion === 'editar' || detalle_has_recibida) && (
                          <th className="px-4 py-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {modoRecepcion === 'editar' ? 'Editar' : 'Recibida'}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {detallesDisplay.map((detalle, index) => {
                        const productoInfo = getProductoInfo(detalle.producto_id)
                        const cantEnviada = detalle.cantidad_enviada ?? detalle.cantidad
                        const cantOriginal = detalle.cantidad_original !== undefined ? detalle.cantidad_original : cantEnviada
                        const detalleId = detalle.id ?? detalle.detalle_id ?? `idx_${index}`
                        const currentValue = cantidadesRecibidas[detalleId] !== undefined ? cantidadesRecibidas[detalleId] : cantOriginal
                        const cantRecibida = detalle.cantidad_recibida ?? null
                        return (
                          <tr key={detalle.id || index} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-primary-100 rounded-lg">
                                  <Package size={14} className="text-primary-600" />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{productoInfo.nombre}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <UoMBadge
                                qty={productoInfo.purchase_unit_qty}
                                symbol={unidadesDB.find(u => u.id === productoInfo.purchase_unit_id)?.abreviatura}
                                unitName={unidadesDB.find(u => u.id === productoInfo.purchase_unit_id)?.nombre || productoInfo.unidad_medida}
                                size="sm"
                              />
                            </td>
                            <td className="px-4 py-4 text-center">
                              <div className="flex flex-col items-center">
                                <span className="text-lg font-bold text-primary-600">
                                  {detalle?.cantidad_original_ingresada !== undefined ? formatCantidad(detalle.cantidad_original_ingresada) : (cantOriginal !== undefined ? formatCantidad(cantOriginal) : '—')}
                                </span>
                                {detalle?.unidad_original_nombre ? (
                                  <span className="text-[10px] font-medium text-slate-500 uppercase">
                                    {detalle.unidad_original_nombre}
                                  </span>
                                ) : detalle?.unidad_original_id ? (
                                  <span className="text-[10px] font-medium text-slate-500 uppercase">
                                    {(unidadesDB || []).find(u => u?.id === detalle.unidad_original_id)?.abreviatura || 
                                     (unidadesDB || []).find(u => u?.id === detalle.unidad_original_id)?.nombre || 
                                     productoInfo?.unidad_medida || '—'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-slate-500 uppercase">
                                    {productoInfo?.unidad_medida || '—'}
                                  </span>
                                )}
                                {(detalle?.cantidad_original !== undefined || detalle?.cantidad_original_ingresada !== undefined) && (
                                  <span className="text-[10px] text-blue-500 mt-0.5" title="Impacto exacto en DB (Unidades Base)">
                                    ({formatCantidad(cantEnviada ?? 0)} {productoInfo?.unidad_medida || '—'})
                                  </span>
                                )}
                              </div>
                            </td>
                            {(modoRecepcion === 'parcial' || modoRecepcion === 'editar') && (
                              <td className="px-4 py-4 text-center">
                                <input
                                  ref={el => { inputRefs.current[index] = el; inputRefsById.current[detalleId] = el }}
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={currentValue}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0)
                                    setCantidadesRecibidas(prev => ({ ...prev, [detalleId]: val }))
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      const nextInput = inputRefs.current[index + 1]
                                      if (nextInput) nextInput.focus()
                                    }
                                  }}
                                  className={`w-24 px-2 py-1.5 text-center border rounded-lg text-sm font-bold focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                    currentValue > cantOriginal
                                      ? 'border-orange-300 bg-orange-50 text-orange-700'
                                      : currentValue < cantOriginal
                                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                                        : 'border-slate-300 bg-white text-slate-700'
                                  }`}
                                />
                                {(currentValue !== cantOriginal) && (
                                  <div className="text-xs mt-1">
                                    {(currentValue > cantOriginal) ? (
                                      <span className="text-orange-600 font-medium">+{formatCantidad(currentValue - cantOriginal)}</span>
                                    ) : (
                                      <span className="text-blue-600 font-medium">-{formatCantidad(cantOriginal - currentValue)}</span>
                                    )}
                                  </div>
                                )}
                              </td>
                            )}
                            {modoRecepcion !== 'parcial' && modoRecepcion !== 'editar' && detalle_has_recibida && (
                              <td className="px-4 py-4 text-center">
                                <span className={`text-lg font-bold ${cantRecibida !== null && cantRecibida < cantEnviada ? 'text-orange-600' : 'text-green-600'}`}>
                                  {cantRecibida !== null ? formatCantidad(cantRecibida) : '—'}
                                </span>
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


          {/* Insumos Consumidos (solo para PRODUCCION) */}
          {isProduccion && insumosProduccion.length > 0 && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <ArrowRight size={24} className="text-orange-600" />
                Insumos Consumidos ({insumosProduccion.length} items)
              </h3>
              <div className="bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-orange-50 dark:bg-orange-900/30 border-b border-orange-200 dark:border-orange-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-orange-800 dark:text-orange-300">Insumo</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-orange-800 dark:text-orange-300">UoM de Compra</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-orange-800 dark:text-orange-300">Cantidad Consumida</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {insumosProduccion.map((insumo, idx) => {
                        const info = getProductoInfo(insumo.producto_id)
                        return (
                          <tr key={insumo.id || idx} className="hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-orange-100 rounded-lg">
                                  <Package size={14} className="text-orange-600" />
                                </div>
                                <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{info.nombre}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <UoMBadge
                                qty={info.purchase_unit_qty}
                                symbol={unidadesDB.find(u => u.id === info.purchase_unit_id)?.abreviatura}
                                unitName={unidadesDB.find(u => u.id === info.purchase_unit_id)?.nombre || info.unidad_medida}
                                size="sm"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-lg font-bold text-orange-600">{formatCantidad(insumo.cantidad)}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Observaciones guardadas */}
          {(transferencia.observaciones_creacion || transferencia.observaciones_confirmacion) && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText size={20} className="text-primary-600" />
                Observaciones
              </h3>
              {transferencia.observaciones_creacion && (
                <div className="border-l-4 border-slate-400 pl-4 py-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Observaciones de Salida</p>
                  <p className="text-slate-700 dark:text-slate-300">{transferencia.observaciones_creacion}</p>
                </div>
              )}
              {transferencia.observaciones_confirmacion && (
                <div className="border-l-4 border-green-500 pl-4 py-2">
                  <p className="text-xs text-green-600 mb-1">Observaciones de Recepción</p>
                  <p className="text-slate-700 dark:text-slate-300">{transferencia.observaciones_confirmacion}</p>
                </div>
              )}
            </div>
          )}

          {/* Textarea observaciones de recepción al confirmar */}
          {onConfirmar && normalizeEstado(transferencia.estado) !== 'CANCELADA' && normalizeEstado(transferencia.estado) !== 'COMPLETADO' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Observaciones de Recepción (Opcional)
              </label>
              <textarea
                value={observacionesRecepcion}
                onChange={(e) => setObservacionesRecepcion(e.target.value)}
                placeholder="Notas sobre la recepción del producto..."
                rows={3}
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              />
            </div>
          )}
            </>
          )}

          {/* Tab: Logs de Actividad */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              {/* Creación */}
              {transferencia.fecha_creacion && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                  <h3 className="font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2 mb-3">
                    <Calendar size={20} />
                    Creación
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-blue-700/70 dark:text-blue-300/70 mb-1">Fecha de creación</p>
                      <p className="font-medium text-blue-900 dark:text-blue-100">
                        {getFechaCreacion()}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-700/70 dark:text-blue-300/70 mb-1">Creado por</p>
                      <p className="font-medium text-blue-900 dark:text-blue-100">
                        {getUsuarioNombre(transferencia.usuario_creacion_id)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmación */}
              {getFechaConfirmacion() && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                  <h3 className="font-semibold text-green-800 dark:text-green-200 flex items-center gap-2 mb-3">
                    <CheckCircle size={20} />
                    Confirmación
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-green-700/70 dark:text-green-300/70 mb-1">Fecha de confirmación</p>
                      <p className="font-medium text-green-900 dark:text-green-100">
                        {getFechaConfirmacion()}
                      </p>
                    </div>
                    <div>
                      <p className="text-green-700/70 dark:text-green-300/70 mb-1">Confirmado por</p>
                      <p className="font-medium text-green-900 dark:text-green-100">
                        {getUsuarioNombre(transferencia.usuario_confirmacion_id)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Edición */}
              {transferencia.fecha_ultima_edicion && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                  <h3 className="font-semibold text-purple-800 dark:text-purple-200 flex items-center gap-2 mb-3">
                    <Edit3 size={20} />
                    Edición
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-purple-700/70 dark:text-purple-300/70 mb-1">Última edición</p>
                      <p className="font-medium text-purple-900 dark:text-purple-100">
                        {formatDate(transferencia.fecha_ultima_edicion)}
                      </p>
                    </div>
                    <div>
                      <p className="text-purple-700/70 dark:text-purple-300/70 mb-1">Editado por</p>
                      <p className="font-medium text-purple-900 dark:text-purple-100">
                        {getUsuarioNombre(transferencia.usuario_editor_id)}
                      </p>
                    </div>
                    <div>
                      <p className="text-purple-700/70 dark:text-purple-300/70 mb-1">Total de ediciones</p>
                      <p className="font-medium text-purple-900 dark:text-purple-100">
                        {transferencia.ediciones_count || 1}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Sticky */}
        <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 flex-shrink-0 sticky bottom-0 space-y-3">
          {isEntradaDraft && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-amber-600 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Pendiente de confirmación de bodega origen</p>
                  <p className="text-sm text-amber-700 dark:text-amber-100">
                    Esta entrada se habilitará para recepción una vez la ubicacion origen confirme y envíe la salida vinculada.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center gap-4">
            {/* Cancel/Reject button - left side */}
            <div>
              {canCancel && normalizeEstado(transferencia.estado) !== 'CANCELADA' && normalizeEstado(transferencia.estado) !== 'COMPLETADO' && !modoRecepcion && (
                <Button
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => setShowCancelModal(true)}
                >
                  <Ban size={16} className="mr-1.5" />
                  Cancelar Movimiento
                </Button>
              )}
            </div>

            {/* Action buttons - right side */}
            <div className="flex gap-3">
              {/* View mode: Edit + Confirm buttons */}
              {!modoRecepcion && (
                <>
                  {/* Botón Editar para Salidas */}
                  {!isEntradasView && canEdit && (estadoNormalizado === 'PENDIENTE' || estadoNormalizado === 'BORRADOR') && (
                    <Button
                      variant="outline"
                      className="text-primary-600 border-primary-300 hover:bg-primary-50"
                      onClick={() => setModoRecepcion('editar')}
                    >
                      Editar
                    </Button>
                  )}

                  {/* Botón Editar para Producciones PENDIENTES */}
                  {isProduccion && normalizeEstado(transferencia.estado) === 'PENDIENTE' && canEdit && (
                    <Button
                      variant="outline"
                      className="text-amber-600 border-amber-300 hover:bg-amber-50"
                      onClick={() => {
                        if (onEditar) {
                          onEditar('edit_produccion')
                        }
                      }}
                    >
                      <Edit3 size={16} className="mr-1.5 text-amber-600" />
                      <span className="text-amber-600">Editar Producción</span>
                    </Button>
                  )}

                  {/* Botón Editar para Entradas completadas */}
                  {isEntradasView && canEdit && normalizeEstado(transferencia.estado) === 'COMPLETADO' && (
                    <Button
                      variant="outline"
                      className="text-primary-600 border-primary-300 hover:bg-primary-50"
                      onClick={() => setShowEditConfirmModal(true)}
                    >
                      <Edit3 size={16} className="mr-1.5" />
                      Editar
                    </Button>
                  )}

                  {/* Botones de recepción/confirmación */}
                  {onConfirmar && estadoNormalizado !== 'CANCELADA' && estadoNormalizado !== 'BORRADOR' && (
                    <>
                      {!isProduccion && (
                        <Button
                          variant="outline"
                          className="text-primary-600 border-primary-300 hover:bg-primary-50"
                          onClick={() => setModoRecepcion('parcial')}
                        >
                          <Edit3 size={16} className="mr-1.5" />
                          Ingresar Cantidades
                        </Button>
                      )}
                      <Button
                        variant="primary"
                        onClick={handleConfirmarTodo}
                        loading={isConfirmando}
                      >
                        <CheckCircle size={16} className="mr-1.5" />
                        {isConfirmando ? 'Procesando...' : isProduccion ? 'Confirmar Producción' : 'Confirmar Recepción Completa'}
                      </Button>
                    </>
                  )}
                </>
              )}

              {/* Edit/Partial mode: Back + Save buttons */}
              {(modoRecepcion === 'parcial' || modoRecepcion === 'editar') && (
                <>
                  <Button
                    variant="outline"
                    className="text-slate-600 border-slate-300 hover:bg-slate-50"
                    onClick={() => setModoRecepcion(null)}
                  >
                    Volver
                  </Button>
                  <Button
                    variant="primary"
                    onClick={modoRecepcion === 'editar' ? () => {
                      if (onEditar) {
                        const productosEditados = detalles.map(d => {
                          const detalleId = d.id ?? d.detalle_id

                          // Prefer latest typed value from DOM to avoid stale state when clicking "Guardar" quickly
                          const inputEl = inputRefsById.current[detalleId]
                          const raw = inputEl?.value
                          const parsedFromDom = raw !== undefined && raw !== '' ? parseFloat(raw) : undefined

                          const cantidadEditada = Number.isFinite(parsedFromDom)
                            ? Math.max(0, parsedFromDom)
                            : (cantidadesRecibidas[detalleId] !== undefined
                              ? cantidadesRecibidas[detalleId]
                              : (d.cantidad_enviada ?? d.cantidad))
                          
                          return {
                            detalle_id: detalleId,
                            producto_id: d.producto_id,
                            cantidad_enviada: cantidadEditada,
                            cantidad_recibida: cantidadEditada
                          }
                        })
                        
                        // Apply optimistic update immediately for visual feedback
                        const updatedDetalles = detalles.map(d => {
                          const editado = productosEditados.find(p => p.detalle_id === (d.id ?? d.detalle_id))
                          if (editado) {
                            return {
                              ...d,
                              cantidad_enviada: editado.cantidad_enviada,
                              cantidad_recibida: editado.cantidad_recibida
                            }
                          }
                          return d
                        })
                        
                        // Update the parent component
                        onEditar(productosEditados)
                        
                        // Clear edit mode
                        setModoRecepcion(null)
                        
                        // Reset cantidadesRecibidas to match new values
                        const newCantidadesRecibidas = {}
                        updatedDetalles.forEach(d => {
                          const detalleId = d.id ?? d.detalle_id
                          if (detalleId !== undefined && detalleId !== null) {
                            newCantidadesRecibidas[detalleId] = d.cantidad_enviada ?? d.cantidad
                          }
                        })
                        setCantidadesRecibidas(newCantidadesRecibidas)
                      }
                    } : handleConfirmarParcial}
                    loading={isConfirmando}
                  >
                    <CheckCircle size={16} className="mr-1.5" />
                    {isConfirmando ? 'Procesando...' : modoRecepcion === 'editar' ? 'Guardar Cambios' : 'Confirmar Recepción Parcial'}
                  </Button>
                </>
              )}

              {isSalidaDraft && onConfirmarEnvio && (
                <Button
                  variant="primary"
                  loading={isConfirmandoEnvio}
                  onClick={onConfirmarEnvio}
                >
                  {isConfirmandoEnvio ? 'Enviando...' : 'Confirmar Envío'}
                </Button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Modal de Confirmación de Edición (para Entradas completadas) */}
      {showEditConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <AlertTriangle className="text-white" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Confirmar Edición</h3>
                  <p className="text-white/80 text-sm">Esta acción cambiará el estado</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>⚠️ Confirmar Edición:</strong><br />
                  Al confirmar, el estado cambiará de <strong>'Completado'</strong> a <strong>'Recibiendo'</strong> para permitir editar cantidades.
                  Una vez terminado, deberá marcar nuevamente como recibido manualmente.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowEditConfirmModal(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  variant="warning"
                  onClick={() => {
                    setShowEditConfirmModal(false)
                    setModoRecepcion('editar') // Fix: set to 'editar' instead of 'parcial' to enable save logic
                    if (onEditar) {
                      onEditar('change_to_recibiendo') // Signal to change state to recibiendo
                    }
                  }}
                  className="flex-1"
                >
                  <Edit3 size={16} className="mr-1.5" />
                  Confirmar Edición
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelación */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-red-700 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <AlertTriangle className="text-white" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Cancelar Movimiento</h3>
                  <p className="text-white/80 text-sm">Esta acción no se puede deshacer</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Importante:</strong> Al cancelar este movimiento, no se realizará ninguna afectación al inventario.
                  El registro permanecerá visible solo para trazabilidad.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Motivo de cancelación *
                </label>
                <textarea
                  value={motivoCancelacion}
                  onChange={(e) => setMotivoCancelacion(e.target.value)}
                  placeholder="Ingresa el motivo de la cancelación..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCancelModal(false)
                    setMotivoCancelacion('')
                  }}
                  className="flex-1"
                  disabled={isCancelling}
                >
                  Volver
                </Button>
                <Button
                  variant="danger"
                  onClick={handleCancelarMovimiento}
                  loading={isCancelling}
                  className="flex-1"
                >
                  <Ban size={16} className="mr-1.5" />
                  {isCancelling ? 'Cancelando...' : 'Confirmar Cancelación'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
