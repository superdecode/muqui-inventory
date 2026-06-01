import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Maximize2, Minimize2 } from 'lucide-react'
import ProduccionForm from './ProduccionForm'
import LoadingSpinner from '../common/LoadingSpinner'
import dataService from '../../services/dataService'

export default function ProduccionEditModal({ movimiento, onClose, onSave }) {
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // Cargar los detalles y datos del movimiento
  const { data: detalles = [], isLoading: isLoadingDetalles } = useQuery({
    queryKey: ['movimiento-detalle', movimiento.id],
    queryFn: () => dataService.getDetalleMovimientos(movimiento.id)
  })

  // Cargar insumos de producción
  const { data: insumosData = [], isLoading: isLoadingInsumos } = useQuery({
    queryKey: ['insumos-produccion', movimiento.id],
    queryFn: () => dataService.getInsumosProduccion(movimiento.id)
  })

  // Cargar productos para obtener nombres completos
  const { data: productos = [] } = useQuery({
    queryKey: ['productos'],
    queryFn: () => dataService.getProductos()
  })

  const loading = isLoadingDetalles || isLoadingInsumos || (productos.length === 0)

  // Construir las líneas a partir de los detalles e insumos
  const buildLineas = () => {
    if (!detalles || detalles.length === 0) return []

    return detalles.map((detalle, index) => {
      const producto = productos.find(p => p.id === detalle.producto_id)
      // Filtrar insumos para este detalle
      const insumosDeLinea = insumosData.filter(i =>
        i.detalle_producido_id === detalle.id ||
        // Si no hay detalle_producido_id, asociar por orden (fallback)
        (!i.detalle_producido_id && insumosData.indexOf(i) === index)
      )

      return {
        id: `linea-${detalle.id || index}-${Date.now()}`,
        producto_id: detalle.producto_id,
        producto_nombre: producto?.nombre || '',
        cantidad: detalle.cantidad || detalle.cantidad_enviada || 1,
        searchTerm: '',
        showDropdown: false,
        insumos: insumosDeLinea.map(insumo => {
          const insumoProducto = productos.find(p => p.id === insumo.producto_id)
          return {
            producto_id: insumo.producto_id,
            producto_nombre: insumoProducto?.nombre || '',
            cantidad: insumo.cantidad || 1,
            unidad_medida: insumoProducto?.unidad_medida || ''
          }
        }),
        insumoSearch: '',
        showInsumoDropdown: false
      }
    })
  }

  const handleSave = async (data) => {
    setIsLoading(true)
    try {
      await onSave(data)
    } finally {
      setIsLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-card-hover max-w-4xl w-full p-12">
          <LoadingSpinner text="Cargando datos de producción..." />
        </div>
      </div>
    )
  }

  // Generar una key única para el formulario basada en el contenido de los datos
  // Esto asegura que si los datos cambian (aunque sea una cantidad), el formulario se remonte
  const dataHash = useMemo(() => {
    const dStr = detalles.map(d => `${d.producto_id}-${d.cantidad}`).join('|')
    const iStr = insumosData.map(i => `${i.producto_id}-${i.cantidad}`).join('|')
    return `${dStr}#${iStr}`
  }, [detalles, insumosData])

  const formKey = `form-${movimiento.id}-${dataHash}`

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 md:p-4">
      <div className={`bg-white dark:bg-slate-800 shadow-card-hover w-full overflow-hidden flex flex-col my-4 transition-all duration-300 ${
        isExpanded
          ? 'rounded-2xl max-w-[calc(100vw-1.5rem)] lg:max-w-[calc(100vw-7rem)] h-[calc(100vh-1.5rem)]'
          : 'rounded-3xl max-w-4xl max-h-[95vh]'
      }`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-6 rounded-t-3xl flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Editar Orden de Producción</h2>
              <p className="text-white/90 text-sm mt-1">
                Código: {movimiento.codigo_legible || `OP-${movimiento.id?.substring(0, 8)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsExpanded(v => !v)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                title={isExpanded ? 'Minimizar vista' : 'Ampliar vista'}
              >
                {isExpanded ? <Minimize2 className="text-white" size={20} /> : <Maximize2 className="text-white" size={20} />}
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="text-white" size={24} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          <ProduccionForm
            key={formKey}
            onClose={onClose}
            onSave={handleSave}
            isLoading={isLoading}
            editMode={true}
            initialData={{
              ubicacion_id: movimiento.destino_id || movimiento.origen_id,
              numero_documento: movimiento.numero_documento || '',
              observaciones: movimiento.observaciones_creacion || '',
              lineas: buildLineas()
            }}
          />
        </div>
      </div>
    </div>
  )
}
