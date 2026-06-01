import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import Button from '../common/Button'
import Alert from '../common/Alert'
import LoadingSpinner from '../common/LoadingSpinner'
import { MapPin, AlertCircle, X, Package, Maximize2, Minimize2 } from 'lucide-react'
import dataService from '../../services/dataService'
import { useAuthStore } from '../../stores/authStore'

export default function ConteoForm({ onClose, onSave, isLoading = false }) {
  const { user } = useAuthStore()
  const [formData, setFormData] = useState({
    ubicacion_id: '',
    tipo_conteo: 'diario',
    observaciones: ''
  })
  const [error, setError] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)

  // Cargar ubicaciones desde la base de datos
  const { data: todasUbicaciones = [], isLoading: isLoadingUbicaciones } = useQuery({
    queryKey: ['ubicaciones'],
    queryFn: () => dataService.getUbicaciones()
  })

  // Cargar productos para calcular contador
  const { data: todosProductos = [] } = useQuery({
    queryKey: ['productos'],
    queryFn: () => dataService.getProductos()
  })

  const { data: categorias = [] } = useQuery({
    queryKey: ['config-categorias'],
    queryFn: () => dataService.getCategorias()
  })

  // Calcular productos que aplican para este conteo
  const productosParaConteo = useMemo(() => {
    if (!formData.ubicacion_id || !formData.tipo_conteo) return []

    return todosProductos.filter(producto => {
      if (producto.estado === 'INACTIVO' || producto.estado === 'ELIMINADO') return false
      if (producto.inventariable === false) return false

      // Location filter
      const ubicPermitidas = producto.ubicaciones_permitidas || []
      if (ubicPermitidas.length > 0 && !ubicPermitidas.includes(formData.ubicacion_id)) return false

      // Tipo conteo filter
      const tipoConteo = (formData.tipo_conteo || '').toLowerCase()
      if (tipoConteo !== 'todos') {
        // frecuencia_inventario can be array or comma-string or single string
        const rawFrecuencia = producto.frecuencia_inventario
        let frecuencias = []
        if (Array.isArray(rawFrecuencia)) {
          frecuencias = rawFrecuencia.map(s => s.toLowerCase())
        } else if (typeof rawFrecuencia === 'string' && rawFrecuencia.trim()) {
          frecuencias = rawFrecuencia.split(',').map(s => s.trim().toLowerCase())
        }
        // Include if product has 'todos' or the specific tipoConteo, or has no frecuencia set
        const matchFrecuencia = frecuencias.length === 0 || frecuencias.includes('todos') || frecuencias.includes(tipoConteo)
        if (!matchFrecuencia) return false
      }

      // Category filter (optional)
      if (filterCategoria && producto.categoria !== filterCategoria) return false

      return true
    })
  }, [todosProductos, formData.ubicacion_id, formData.tipo_conteo, filterCategoria])

  // Filtrar ubicaciones asignadas al usuario
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.ubicacion_id) {
      setError('Por favor selecciona una ubicación')
      return
    }

    if (!formData.tipo_conteo) {
      setError('Por favor selecciona un tipo de conteo')
      return
    }

    // Verificar que haya productos para contar
    if (productosParaConteo.length === 0) {
      setError(`No hay productos disponibles para un conteo de tipo "${formData.tipo_conteo}" en esta ubicación. Por favor, selecciona otro tipo de conteo o verifica los productos.`)
      return
    }

    try {
      await onSave({
        ...formData,
        tipo_ubicacion: 'BODEGA'
      })
    } catch (err) {
      setError('Error al programar el conteo. Por favor intenta nuevamente.')
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 md:p-4">
      <div className={`bg-white dark:bg-slate-800 shadow-card-hover w-full overflow-hidden flex flex-col transition-all duration-300 ${
        isExpanded
          ? 'rounded-2xl max-w-[calc(100vw-1.5rem)] lg:max-w-[calc(100vw-7rem)] h-[calc(100vh-1.5rem)]'
          : 'rounded-3xl max-w-2xl max-h-[90vh]'
      }`}>
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-ocean p-6">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Programar Conteo</h2>
              <p className="text-white/90">Crea un nuevo conteo de inventario</p>
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

        <form onSubmit={handleSubmit} className={`p-6 overflow-y-auto space-y-6 ${isExpanded ? 'flex-1 min-h-0' : 'max-h-[calc(90vh-200px)]'}`}>
          {/* Error Alert */}
          {error && (
            <Alert type="error" className="mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} />
                {error}
              </div>
            </Alert>
          )}

          {/* Ubicación */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <MapPin size={16} className="inline mr-2" />
              Ubicación
            </label>
            {isLoadingUbicaciones ? (
              <div className="py-4">
                <LoadingSpinner text="Cargando ubicaciones..." />
              </div>
            ) : (
              <select
                value={formData.ubicacion_id}
                onChange={(e) => setFormData({ ...formData, ubicacion_id: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              >
                <option value="">Seleccionar ubicación</option>
                {ubicaciones.map(ubicacion => (
                  <option key={ubicacion.id} value={ubicacion.id}>
                    {ubicacion.nombre} ({ubicacion.tipo})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tipo de Conteo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tipo de Conteo
            </label>
            <select
              value={formData.tipo_conteo}
              onChange={(e) => setFormData({ ...formData, tipo_conteo: e.target.value })}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="diario">Diario</option>
              <option value="semanal">Semanal</option>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
              <option value="todos">Todos los productos</option>
            </select>
          </div>

          {/* Filtro por categoría (opcional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Filtrar por Categoría <span className="text-slate-400 text-xs font-normal">(opcional)</span>
            </label>
            <select
              value={filterCategoria}
              onChange={(e) => setFilterCategoria(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Todas las categorías</option>
              {categorias.map(cat => (
                <option key={cat.id || cat} value={cat.nombre || cat}>{cat.nombre || cat}</option>
              ))}
            </select>
            {filterCategoria && (
              <p className="text-xs text-primary-600 mt-1">
                Solo se incluirán productos de la categoría &quot;{filterCategoria}&quot;
              </p>
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
              placeholder="Notas adicionales..."
              rows={3}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Contador de productos */}
          {formData.ubicacion_id && formData.tipo_conteo && (
            <div className={`rounded-xl p-4 shadow-sm ${
              productosParaConteo.length === 0 
                ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800'
                : 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  productosParaConteo.length === 0 
                    ? 'bg-amber-100 dark:bg-amber-900/30'
                    : 'bg-blue-100 dark:bg-blue-900/30'
                }`}>
                  <Package className={productosParaConteo.length === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'} size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-lg font-bold ${
                      productosParaConteo.length === 0 
                        ? 'text-amber-900 dark:text-amber-100'
                        : 'text-blue-900 dark:text-blue-100'
                    }`}>
                      {productosParaConteo.length}
                    </span>
                    <span className={`text-sm font-medium ${
                      productosParaConteo.length === 0 
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-blue-700 dark:text-blue-300'
                    }`}>
                      producto{productosParaConteo.length !== 1 ? 's' : ''} se incluirán en este conteo
                    </span>
                  </div>
                  <div className={`text-xs ${
                    productosParaConteo.length === 0 
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}>
                    Tipo: <span className="font-semibold">{formData.tipo_conteo}</span>
                    {productosParaConteo.length === 0 && (
                      <div className="mt-1">
                        ⚠️ No se puede crear el conteo. No hay productos para este tipo.
                        <div className="mt-1 text-xs">
                          💡 Intenta con otro tipo de conteo o verifica los productos de esta ubicación.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

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
              disabled={!formData.ubicacion_id || !formData.tipo_conteo || productosParaConteo.length === 0}
              className="flex-1"
            >
              {isLoading ? 'Programando...' : 'Programar Conteo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
