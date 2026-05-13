import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Plus, Play, Download, CheckCircle, Clock, AlertCircle, Trash2, Printer, Search, Building2, Filter, Edit3, Eye, XCircle, Pencil } from 'lucide-react'
import Card from '../components/common/Card'
import DataTable from '../components/common/DataTable'
import Button from '../components/common/Button'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ConteoForm from '../components/conteos/ConteoForm'
import ConteoExecute from '../components/conteos/ConteoExecute'
import ConteoDetail from '../components/conteos/ConteoDetail'
import useConteos from '../hooks/useConteos'
import { useAuthStore } from '../stores/authStore'
import { usePermissions } from '../hooks/usePermissions'
import { useToastStore } from '../stores/toastStore'
import { exportConteosToCSV } from '../utils/exportUtils'
import dataService from '../services/dataService'
import { formatLabel, formatDisplayId } from '../utils/formatters'
import { getUserAllowedUbicacionIds } from '../utils/userFilters'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function Conteos() {
  const [activeTab, setActiveTab] = useState('todos')
  const [showForm, setShowForm] = useState(false)
  const [showExecute, setShowExecute] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [selectedConteo, setSelectedConteo] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sedeFilter, setSedeFilter] = useState('')
  const [editMode, setEditMode] = useState(false) // Modo edición para conteos completados

  const { user, canWrite: canWriteModule } = useAuthStore()
  const { isReadOnly, getPermissionLevel, isAdmin } = usePermissions()
  const isReadOnlyConteos = isReadOnly('conteos')
  const toast = useToastStore()

  // Cargar usuarios para mostrar nombres
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => dataService.getUsuarios()
  })

  // Cargar empresas y ubicaciones para filtrado
  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => dataService.getEmpresas()
  })

  const { data: ubicaciones = [] } = useQuery({
    queryKey: ['ubicaciones'],
    queryFn: () => dataService.getUbicaciones()
  })

  const {
    conteos,
    isLoading,
    crearConteo,
    isCreando,
    iniciarConteo,
    isIniciando,
    ejecutarConteo,
    isEjecutando,
    eliminarConteo,
    isEliminando,
    cancelarConteo,
    isCancelando,
    estadisticas
  } = useConteos()

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

  // Función para imprimir conteo
  const handleImprimir = (conteo) => {
    const detalles = conteos.find(c => c.id === conteo.id)
    const usuarioNombre = getUsuarioNombre(conteo.usuario_responsable_id)

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reporte de Conteo</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            padding: 20px;
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #0ea5e9;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #1e293b;
            font-size: 28px;
            margin-bottom: 5px;
          }
          .header p {
            color: #64748b;
            font-size: 14px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 30px;
          }
          .info-item {
            border-left: 4px solid #0ea5e9;
            padding-left: 15px;
          }
          .info-label {
            color: #64748b;
            font-size: 12px;
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 5px;
          }
          .info-value {
            color: #1e293b;
            font-size: 16px;
            font-weight: 500;
          }
          .status {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
          }
          .status.completado {
            background: #dcfce7;
            color: #166534;
          }
          .status.en-progreso {
            background: #dbeafe;
            color: #1e40af;
          }
          .status.pendiente {
            background: #fef3c7;
            color: #92400e;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            color: #94a3b8;
            font-size: 12px;
          }
          @media print {
            body { background: white; }
            .container { box-shadow: none; }
            .print-btn { display: none; }
          }
          .print-btn {
            margin-top: 20px;
            padding: 10px 20px;
            background: #0ea5e9;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
          }
          .print-btn:hover {
            background: #0284c7;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 Reporte de Conteo de Inventario</h1>
            <p>Generado el ${format(new Date(), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}</p>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">ID de Conteo</div>
              <div class="info-value">${conteo.id}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Estado</div>
              <div class="info-value">
                <span class="status ${conteo.estado === 'COMPLETADO' ? 'completado' : conteo.estado === 'EN_PROGRESO' ? 'en-progreso' : 'pendiente'}">
                  ${conteo.estado}
                </span>
              </div>
            </div>
            <div class="info-item">
              <div class="info-label">Ubicación</div>
              <div class="info-value">${conteo.ubicacion_id}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Tipo de Conteo</div>
              <div class="info-value">${conteo.tipo_conteo}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Fecha Creación</div>
              <div class="info-value">${conteo.fecha_creacion ? format(conteo.fecha_creacion.toDate ? conteo.fecha_creacion.toDate() : new Date(conteo.fecha_creacion), "d 'de' MMMM 'de' yyyy HH:mm", { locale: es }) : '-'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Responsable</div>
              <div class="info-value">${usuarioNombre}</div>
            </div>
          </div>

          <div class="footer">
            <p>Sistema de Control de Inventario Muqui</p>
            <p>© 2026 Todos los derechos reservados</p>
          </div>

          <button class="print-btn" onclick="window.print()">🖨️ Imprimir</button>
        </div>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    printWindow.document.write(htmlContent)
    printWindow.document.close()
  }

  // Obtener ubicaciones únicas para el filtro de sede
  const ubicacionesConteos = [...new Map(conteos.map(c => [c.ubicacion_id, { id: c.ubicacion_id, nombre: c.ubicacion_nombre }]).filter(([k]) => k)).values()]

  // Get user's allowed locations based on both ubicaciones_asignadas and empresas_asignadas
  const allowedUbicacionIds = getUserAllowedUbicacionIds(user, ubicaciones, empresas)

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

    // Verificar que la ubicación esté asignada al usuario
    // Si allowedUbicacionIds está vacío, significa sin restricciones de ubicación
    // (típicamente para admins o usuarios sin asignaciones específicas)
    if (allowedUbicacionIds.length === 0) {
      // Si el usuario tiene ubicaciones asignadas pero el array está vacío,
      // hay un problema con getUserAllowedUbicacionIds
      if (user?.ubicaciones_asignadas && Array.isArray(user.ubicaciones_asignadas) && user.ubicaciones_asignadas.length > 0) {
        // Usar directamente las ubicaciones del usuario como fallback
        if (user.ubicaciones_asignadas.includes(conteo.ubicacion_id)) {
          return true
        } else {
          return false
        }
      }

      // Si genuinamente no hay restricciones, permitir
      return true
    }

    // Si hay restricciones específicas, verificar que la ubicación esté incluida
    if (!allowedUbicacionIds.includes(conteo.ubicacion_id)) {
      return false
    }

    return true
  }

  // Auto-set sede filter for single-location users
  const effectiveSedeFilter = (Array.isArray(allowedUbicacionIds) && allowedUbicacionIds.length === 1 && !sedeFilter) ? allowedUbicacionIds[0] : sedeFilter

  // Filter for user permissions (applies to both stats and table data)
  const conteosAccessibles = conteos.filter(c => {
    const matchUserAssignments = user?.rol === 'ADMIN_GLOBAL' ||
      allowedUbicacionIds.length === 0 ||
      (c.ubicacion_id && allowedUbicacionIds.includes(c.ubicacion_id))
    return matchUserAssignments
  })

  // Estadísticas basadas en conteos accesibles (antes de otros filtros)
  const estadisticasCalculadas = {
    total: conteosAccessibles.length,
    pendientes: conteosAccessibles.filter(c => c.estado === 'PENDIENTE').length,
    enProgreso: conteosAccessibles.filter(c => c.estado === 'EN_PROGRESO').length,
    completados: conteosAccessibles.filter(c => c.estado === 'COMPLETADO' || c.estado === 'PARCIALMENTE_COMPLETADO').length,
    cancelados: conteosAccessibles.filter(c => c.estado === 'CANCELADO').length
  }

  // Filtrar conteos según el tab activo, búsqueda, sede y asignaciones de usuario
  const conteosFiltrados = conteosAccessibles.filter(c => {
    // Filtro por tab/estado
    let matchTab = true
    if (activeTab === 'pendientes') matchTab = c.estado === 'PENDIENTE'
    else if (activeTab === 'enProgreso') matchTab = c.estado === 'EN_PROGRESO'
    else if (activeTab === 'completados') matchTab = c.estado === 'COMPLETADO' || c.estado === 'PARCIALMENTE_COMPLETADO'
    else if (activeTab === 'cancelados') matchTab = c.estado === 'CANCELADO'
    
    // Filtro por búsqueda
    const matchSearch = !searchTerm || 
      (c.codigo_legible || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.ubicacion_nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.tipo || '').toLowerCase().includes(searchTerm.toLowerCase())
    
    // Filtro por sede
    const matchSede = !effectiveSedeFilter || c.ubicacion_id === effectiveSedeFilter
    
    return matchTab && matchSearch && matchSede
  })

  
  const columns = [
    {
      header: 'Código',
      accessor: 'codigo_legible',
      sortKey: 'codigo_legible',
      render: (value, row) => (
        <span className="font-mono text-sm font-semibold text-primary-600">{value || formatDisplayId(row, 'CT')}</span>
      )
    },
    {
      header: 'Fecha',
      accessor: 'fecha_documento',
      sortKey: 'fecha_documento',
      // Agregar sortValue para manejar conteos sin fecha_documento
      sortValue: (row) => {
        // Prioridad 1: fecha_documento (nuevo campo)
        if (row.fecha_documento) {
          return row.fecha_documento.toDate ? row.fecha_documento.toDate().getTime() : new Date(row.fecha_documento).getTime()
        }
        // Prioridad 2: fecha_creacion (conteos nuevos)
        if (row.fecha_creacion) {
          return row.fecha_creacion.toDate ? row.fecha_creacion.toDate().getTime() : new Date(row.fecha_creacion).getTime()
        }
        // Prioridad 3: fecha_programada (conteos antiguos - equivalente a fecha_creacion)
        if (row.fecha_programada) {
          return row.fecha_programada.toDate ? row.fecha_programada.toDate().getTime() : new Date(row.fecha_programada).getTime()
        }
        // Prioridad 4: created_at (fallback adicional)
        if (row.created_at) {
          return row.created_at.toDate ? row.created_at.toDate().getTime() : new Date(row.created_at).getTime()
        }
        // Prioridad 5: fecha actual (último recurso)
        return new Date().getTime()
      },
      render: (value, row) => {
        // Usar la misma lógica que sortValue para consistencia
        let fechaParaMostrar
        if (row.fecha_documento) {
          fechaParaMostrar = row.fecha_documento.toDate ? row.fecha_documento.toDate() : new Date(row.fecha_documento)
        } else if (row.fecha_creacion) {
          fechaParaMostrar = row.fecha_creacion.toDate ? row.fecha_creacion.toDate() : new Date(row.fecha_creacion)
        } else if (row.fecha_programada) {
          fechaParaMostrar = row.fecha_programada.toDate ? row.fecha_programada.toDate() : new Date(row.fecha_programada)
        } else if (row.created_at) {
          fechaParaMostrar = row.created_at.toDate ? row.created_at.toDate() : new Date(row.created_at)
        } else {
          fechaParaMostrar = new Date()
        }
        
        try {
          const esEstimada = !row.fecha_documento && !row.fecha_creacion && !row.fecha_programada && !row.created_at
          return format(fechaParaMostrar, "d MMM yyyy", { locale: es }) + (esEstimada ? ' (estimada)' : '')
        } catch (error) {
          console.error('Error formateando fecha:', error, { value, row })
          return 'Fecha no disponible'
        }
      }
    },
    {
      header: 'Ubicación',
      accessor: 'ubicacion_nombre',
      sortKey: 'ubicacion_nombre',
      render: (value) => (
        <span className="text-sm font-medium">{value}</span>
      )
    },
    {
      header: 'Tipo',
      accessor: 'tipo_conteo',
      sortKey: 'tipo_conteo',
      render: (value) => (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
          {formatLabel(value)}
        </span>
      )
    },
    {
      header: 'Responsable',
      accessor: 'usuario_responsable_id',
      sortKey: 'usuario_responsable_id',
      render: (_value, row) => (
        <span className="text-sm font-medium">{getUsuarioNombre(row.usuario_responsable_id)}</span>
      )
    },
    {
      header: 'Estado',
      accessor: 'estado',
      sortKey: 'estado',
      render: (value) => {
        const estados = {
          PENDIENTE: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
          EN_PROGRESO: { color: 'bg-blue-100 text-blue-800', icon: AlertCircle },
          PARCIALMENTE_COMPLETADO: { color: 'bg-green-100 text-green-700', icon: AlertCircle },
          COMPLETADO: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
          CANCELADO: { color: 'bg-red-100 text-red-800', icon: XCircle }
        }
        const estado = estados[value] || estados.PENDIENTE
        const Icon = estado.icon
        return (
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${estado.color}`}>
            <Icon size={14} />
            {value === 'PARCIALMENTE_COMPLETADO' ? 'Parcial Completado' : formatLabel(value)}
          </span>
        )
      }
    },
    {
      header: 'Acciones',
      accessor: 'id',
      render: (value, row) => (
        <div className="flex gap-2">
          {row.estado === 'PENDIENTE' && canWriteModule('conteos') && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleIniciar(row)}
              disabled={isIniciando}
            >
              <Play size={14} className="mr-1" />
              {isIniciando ? 'Iniciando...' : 'Empezar Conteo'}
            </Button>
          )}
          {row.estado === 'EN_PROGRESO' && canWriteModule('conteos') && (
            <Button
              size="sm"
              variant="success"
              onClick={() => handleEjecutar(row)}
              disabled={isEjecutando}
            >
              <CheckCircle size={14} className="mr-1" />
              {isEjecutando ? 'Completando...' : 'Completar'}
            </Button>
          )}
          <button
            onClick={() => handleVer(row)}
            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            title="Ver detalles"
          >
            <Eye size={18} />
          </button>
          {(row.estado === 'COMPLETADO' || row.estado === 'PARCIALMENTE_COMPLETADO') && (
            <button
              onClick={() => handleImprimir(row)}
              className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
              title="Imprimir conteo"
            >
              <Printer size={18} />
            </button>
          )}
          {/* ACCESO TOTAL: Solo usuarios con permiso Total pueden eliminar permanentemente */}
          {getPermissionLevel('conteos') === 'total' && (
            <button
              onClick={() => handleEliminar(row)}
              className="p-2 text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
              title="Eliminar conteo permanentemente"
              disabled={isEliminando}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )
    }
  ]

  const handleNuevoConteo = () => {
    setShowForm(true)
  }

  const handleSaveConteo = async (conteoData) => {
    const dataToSave = {
      ...conteoData,
      usuario_responsable_id: user?.id || 'USR001'
    }

    crearConteo(dataToSave, {
      onSuccess: () => {
        setShowForm(false)
      }
    })
  }

  const handleIniciar = (conteo) => {
    if (!window.confirm('¿Iniciar este conteo? El estado cambiará a "En Progreso".')) return
    iniciarConteo(
      { conteoId: conteo.id, usuarioId: user?.id },
      {
        onSuccess: () => {
          setSelectedConteo(conteo)
          setShowExecute(true)
        }
      }
    )
  }

  const handleEjecutar = (conteo) => {
    setSelectedConteo(conteo)
    setShowExecute(true)
  }

  const handleEliminar = async (conteo) => {
    if (!window.confirm('¿Estás seguro de eliminar este conteo? Esta acción no se puede deshacer.')) {
      return
    }

    eliminarConteo(conteo.id)
  }

  const handleSaveEjecucion = async (datosConteo) => {
    const dataToSave = {
      ...datosConteo,
      conteo_id: selectedConteo.id,
      ubicacion_id: selectedConteo.ubicacion_id,
      usuario_ejecutor_id: user?.id || 'USR001'
    }

    ejecutarConteo(dataToSave, {
      onSuccess: () => {
        setShowExecute(false)
        setSelectedConteo(null)
      }
    })
  }

  const handleVer = (conteo) => {
    setSelectedConteo(conteo)
    setShowDetail(true)
  }

  // Manejador para editar conteo completado
  const handleEditar = (conteo) => {
    const edicionesActuales = conteo.ediciones_count || 0
    const esUltimaEdicion = edicionesActuales === 2

    if (esUltimaEdicion) {
      // Mostrar advertencia si es la última edición
      const confirmar = window.confirm(
        '⚠️ ADVERTENCIA: Esta es tu ÚLTIMA oportunidad de edición\n\n' +
        'Este conteo ya ha sido editado 2 veces. Después de esta edición, ' +
        'no podrás realizar más cambios.\n\n' +
        '¿Estás seguro de que deseas continuar?'
      )

      if (!confirmar) {
        return
      }
    }

    setSelectedConteo(conteo)
    setEditMode(true)
    setShowExecute(true)
  }

  const handleCancelar = async (motivoCancelacion) => {
    if (!selectedConteo) return

    const dataCancelacion = {
      conteo_id: selectedConteo.id,
      motivo_cancelacion: motivoCancelacion,
      usuario_cancelacion_id: user?.id || 'USR001'
    }

    cancelarConteo(dataCancelacion, {
      onSuccess: () => {
        setShowDetail(false)
        setSelectedConteo(null)
      }
    })
  }

  const handleCloseForm = () => {
    setShowForm(false)
  }

  const handleCloseExecute = () => {
    setShowExecute(false)
    setSelectedConteo(null)
    setEditMode(false)
  }

  const handleCloseDetail = () => {
    setShowDetail(false)
    setSelectedConteo(null)
  }

  // Handler para editar desde el modal de detalle
  const handleEditarDesdeDetalle = (conteo) => {
    handleEditar(conteo)
    setShowDetail(false)
  }

  const handleExportar = () => {
    try {
      exportConteosToCSV(conteosFiltrados)
      toast.success('Exportación Exitosa', 'Los conteos se han exportado a CSV')
    } catch (error) {
      toast.error('Error al Exportar', error.message || 'No se pudo exportar los conteos')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-light-blue p-6 shadow-card">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <ClipboardCheck className="text-white" size={28} />
                <h1 className="text-3xl font-bold text-white">Conteos de Inventario</h1>
              </div>
              <p className="text-white/90">Programa y ejecuta conteos físicos de inventario</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="white"
                onClick={handleExportar}
                disabled={conteosFiltrados.length === 0 || isReadOnlyConteos}
              >
                <Download size={20} className="mr-2" />
                Exportar
              </Button>
              {canWriteModule('conteos') && (
                <Button variant="white" onClick={handleNuevoConteo}>
                  <Plus size={20} className="mr-2" />
                  Empezar Conteo
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-slate-800 border-purple-100 dark:border-purple-900/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Conteos</p>
              <p className="text-3xl font-bold text-purple-600">{estadisticasCalculadas.total}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <ClipboardCheck className="text-purple-600" size={24} />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50 to-white dark:from-yellow-900/20 dark:to-slate-800 border-yellow-100 dark:border-yellow-900/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Pendientes</p>
              <p className="text-3xl font-bold text-yellow-600">{estadisticasCalculadas.pendientes}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
              <Clock className="text-yellow-600" size={24} />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-slate-800 border-blue-100 dark:border-blue-900/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">En Progreso</p>
              <p className="text-3xl font-bold text-blue-600">{estadisticasCalculadas.enProgreso}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <AlertCircle className="text-blue-600" size={24} />
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-white dark:from-green-900/20 dark:to-slate-800 border-green-100 dark:border-green-900/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Completados</p>
              <p className="text-3xl font-bold text-green-600">{estadisticasCalculadas.completados}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="text-green-600" size={24} />
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Sede Filter */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-card p-4 border border-slate-100 dark:border-slate-700">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar conteos por código, ubicación o tipo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
          <div className="w-full md:w-64">
            <select
              value={effectiveSedeFilter}
              onChange={(e) => setSedeFilter(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm"
              disabled={Array.isArray(allowedUbicacionIds) && allowedUbicacionIds.length === 1}
            >
              <option value="">Todas las ubicaciones</option>
              {ubicacionesConteos.map(ub => (
                <option key={ub.id} value={ub.id}>{ub.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Card>
        <div className="border-b border-slate-200 dark:border-slate-700">
          <nav className="flex gap-8 px-6">
            {[
              { id: 'todos', label: 'Todos', count: estadisticasCalculadas.total },
              { id: 'pendientes', label: 'Pendientes', count: estadisticasCalculadas.pendientes },
              { id: 'enProgreso', label: 'En Progreso', count: estadisticasCalculadas.enProgreso },
              { id: 'completados', label: 'Completados', count: estadisticasCalculadas.completados },
              { id: 'cancelados', label: 'Cancelados', count: estadisticasCalculadas.cancelados }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300'
                }`}
              >
                {tab.label}
                <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs">
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tabla de Conteos */}
        <div className="p-6">
          {conteosFiltrados.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardCheck className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-600 dark:text-slate-400 font-medium">No hay conteos {activeTab !== 'todos' ? activeTab : ''}</p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                {activeTab === 'pendientes'
                  ? 'Todos los conteos han sido completados'
                  : 'Programa un nuevo conteo para comenzar'}
              </p>
            </div>
          ) : (
            <DataTable
              key={JSON.stringify(conteosFiltrados.map(c => ({ id: c.id, fecha_documento: c.fecha_documento, fecha_creacion: c.fecha_creacion })))}
              columns={columns}
              data={conteosFiltrados}
              defaultSortKey="fecha_documento"
              defaultSortDir="desc"
            />
          )}
        </div>
      </Card>

      {/* Modal Formulario */}
      {showForm && (
        <ConteoForm
          onSave={handleSaveConteo}
          onClose={handleCloseForm}
          isLoading={isCreando}
        />
      )}

      {/* Modal Ejecutar / Editar */}
      {showExecute && selectedConteo && (
        <ConteoExecute
          conteo={selectedConteo}
          onSave={handleSaveEjecucion}
          onClose={handleCloseExecute}
          isLoading={isEjecutando}
          editMode={editMode}
        />
      )}

      {/* Modal Detalle */}
      {showDetail && selectedConteo && (
        <ConteoDetail
          conteo={selectedConteo}
          onClose={handleCloseDetail}
          onEdit={handleEditarDesdeDetalle}
          onCancelar={handleCancelar}
          isCancelando={isCancelando}
        />
      )}
    </div>
  )
}
