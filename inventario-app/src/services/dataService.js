/**
 * Servicio unificado de datos
 * Maneja automáticamente la fuente de datos según la configuración
 */

import firestoreService from './firestoreService'
import { uppercaseStrings } from '../utils/formatters'

/**
 * Servicio de datos unificado
 */
const dataService = {
  // ========== LECTURA DE DATOS ==========

  // Empresas
  getEmpresas: async () => {
    return await firestoreService.getEmpresas()
  },

  // Usuarios
  getUsuarios: async () => {
    return await firestoreService.getUsuarios()
  },

  // Productos
  getProductos: async () => {
    return await firestoreService.getProductos()
  },

  // Ubicaciones
  getUbicaciones: async () => {
    return await firestoreService.getUbicaciones()
  },

  // Inventario
  getInventario: async (ubicacionId, tipoUbicacion) => {
    return await firestoreService.getInventario(ubicacionId, tipoUbicacion)
  },

  // Stock disponible centralizado (fuente única de verdad, con diagnóstico)
  calcularStockDisponible: async (productoId, ubicacionId) => {
    return await firestoreService.calcularStockDisponible(productoId, ubicacionId)
  },

  // Movimientos
  getMovimientos: async (ubicacionId) => {
    return await firestoreService.getMovimientos(ubicacionId)
  },

  // Detalle de movimientos
  getDetalleMovimientos: async (movimientoId) => {
    return await firestoreService.getDetalleMovimientos(movimientoId)
  },

  // Detalle de ventas
  getDetalleVentas: async (ventaId) => {
    return await firestoreService.getDetalleVentas(ventaId)
  },

  // Conteos
  getConteos: async (ubicacionId) => {
    return await firestoreService.getConteos(ubicacionId)
  },

  // Detalle de conteos
  getDetalleConteos: async (conteoId) => {
    return await firestoreService.getDetalleConteos(conteoId)
  },

  // Alertas
  getAlertas: async (usuarioId) => {
    return await firestoreService.getAlertas(usuarioId)
  },

  // ========== OPERACIONES DE ESCRITURA ==========

  // PRODUCTOS
  createProducto: async (productoData) => {
    return await firestoreService.createProducto(uppercaseStrings(productoData))
  },

  updateProducto: async (productoId, productoData) => {
    return await firestoreService.updateProducto(productoId, uppercaseStrings(productoData))
  },

  deleteProducto: async (productoId) => {
    return await firestoreService.deleteProducto(productoId)
  },

  actualizarTodosLosProductosTipoConteo: async (tipoConteoPorDefecto = 'diario') => {
    return await firestoreService.actualizarTodosLosProductosTipoConteo(tipoConteoPorDefecto)
  },

  limpiarEmpresasAsignadasProductos: async () => {
    return await firestoreService.limpiarEmpresasAsignadasProductos()
  },

  // TRANSFERENCIAS/MOVIMIENTOS
  createTransferencia: async (data) => {
    return await firestoreService.createTransferencia(uppercaseStrings(data))
  },

  confirmarTransferencia: async (data) => {
    return await firestoreService.confirmarTransferencia(uppercaseStrings(data))
  },

  confirmarEnvio: async (data) => {
    return await firestoreService.confirmarEnvio(data)
  },

  iniciarRecepcion: async (data) => {
    return await firestoreService.iniciarRecepcion(data)
  },

  updateFechaDocumento: async (data) => {
    return await firestoreService.updateFechaDocumento(data)
  },

  createMovimiento: async (data) => {
    return await firestoreService.createTransferencia(uppercaseStrings(data))
  },

  createEntradaCompra: async (data) => {
    return await firestoreService.createEntradaCompra(uppercaseStrings(data))
  },

  // PRODUCCION
  createProduccion: async (data) => {
    return await firestoreService.createProduccion(data)
  },
  confirmarProduccion: async (data) => {
    return await firestoreService.confirmarProduccion(data)
  },
  updateProduccion: async (data) => {
    return await firestoreService.updateProduccion(data)
  },
  getInsumosProduccion: async (movimientoId) => {
    return await firestoreService.getInsumosProduccion(movimientoId)
  },

  cancelarMovimiento: async (data) => {
    return await firestoreService.cancelarMovimiento(data)
  },

  updateMovimientoEstado: async (data) => {
    return await firestoreService.updateMovimientoEstado(data)
  },

  updateMovimientoDetalles: async (data) => {
    return await firestoreService.updateMovimientoDetalles(data)
  },

  deleteMovimiento: async (movimientoId) => {
    return await firestoreService.deleteMovimiento(movimientoId)
  },

  deleteConteo: async (conteoId) => {
    return await firestoreService.deleteConteo(conteoId)
  },

  deleteDetalleConteo: async (detalleId) => {
    return await firestoreService.deleteDetalleConteo(detalleId)
  },

  // CONTEOS
  createConteo: async (data) => {
    return await firestoreService.createConteo(uppercaseStrings(data))
  },

  iniciarConteo: async (conteoId, usuarioId) => {
    return await firestoreService.iniciarConteo(conteoId, usuarioId)
  },

  ejecutarConteo: async (data) => {
    return await firestoreService.ejecutarConteo(data)
  },

  cancelarConteo: async (data) => {
    return await firestoreService.cancelarConteo(data)
  },

  // INVENTARIO
  ajustarInventario: async (data) => {
    return await firestoreService.ajustarInventario(data)
  },

  // ========== ADMIN CRUD ==========

  // Usuarios CRUD
  createUsuario: async (data) => {
    return await firestoreService.createUsuario(uppercaseStrings(data))
  },
  updateUsuario: async (id, data) => {
    return await firestoreService.updateUsuario(id, uppercaseStrings(data))
  },
  deleteUsuario: async (id) => {
    return await firestoreService.deleteUsuario(id)
  },
  hardDeleteUsuario: async (id) => {
    return await firestoreService.hardDeleteUsuario(id)
  },

  // Empresas CRUD
  createEmpresa: async (data) => {
    return await firestoreService.createEmpresa(uppercaseStrings(data))
  },
  updateEmpresa: async (id, data) => {
    return await firestoreService.updateEmpresa(id, uppercaseStrings(data))
  },
  deleteEmpresa: async (id) => {
    return await firestoreService.deleteEmpresa(id)
  },

  // Ubicaciones CRUD
  createUbicacion: async (data) => {
    return await firestoreService.createUbicacion(uppercaseStrings(data))
  },
  updateUbicacion: async (id, data) => {
    return await firestoreService.updateUbicacion(id, uppercaseStrings(data))
  },
  deleteUbicacion: async (id) => {
    return await firestoreService.deleteUbicacion(id)
  },

  // Categorías CRUD
  getCategorias: async () => {
    return await firestoreService.getCategorias()
  },
  createCategoria: async (data) => {
    return await firestoreService.createCategoria(uppercaseStrings(data))
  },
  updateCategoria: async (id, data) => {
    return await firestoreService.updateCategoria(id, uppercaseStrings(data))
  },
  deleteCategoria: async (id) => {
    return await firestoreService.deleteCategoria(id)
  },

  // Especificaciones CRUD
  getEspecificaciones: async () => {
    return await firestoreService.getEspecificaciones()
  },
  createEspecificacion: async (data) => {
    return await firestoreService.createEspecificacion(data)
  },
  updateEspecificacion: async (id, data) => {
    return await firestoreService.updateEspecificacion(id, data)
  },
  deleteEspecificacion: async (id) => {
    return await firestoreService.deleteEspecificacion(id)
  },

  // Unidades de Medida CRUD
  getUnidadesMedida: async () => {
    return await firestoreService.getUnidadesMedida()
  },
  createUnidadMedida: async (data) => {
    return await firestoreService.createUnidadMedida(uppercaseStrings(data))
  },
  updateUnidadMedida: async (id, data) => {
    return await firestoreService.updateUnidadMedida(id, uppercaseStrings(data))
  },
  deleteUnidadMedida: async (id) => {
    return await firestoreService.deleteUnidadMedida(id)
  },

  // Unit Equivalences
  getUnitEquivalences: async () => firestoreService.getUnitEquivalences(),
  createUnitEquivalence: async (data) => firestoreService.createUnitEquivalence(data),
  updateUnitEquivalence: async (id, data) => firestoreService.updateUnitEquivalence(id, data),
  deleteUnitEquivalence: async (id) => firestoreService.deleteUnitEquivalence(id),

  // Beneficiarios CRUD
  getBeneficiarios: async () => {
    return await firestoreService.getBeneficiarios()
  },
  createBeneficiario: async (data) => {
    return await firestoreService.createBeneficiario(uppercaseStrings(data))
  },
  updateBeneficiario: async (id, data) => {
    return await firestoreService.updateBeneficiario(id, uppercaseStrings(data))
  },
  deleteBeneficiario: async (id) => {
    return await firestoreService.deleteBeneficiario(id)
  },

  // Razones de Merma CRUD
  getRazonesMerma: async () => {
    return await firestoreService.getRazonesMerma()
  },
  createRazonMerma: async (data) => {
    return await firestoreService.createRazonMerma(uppercaseStrings(data))
  },
  updateRazonMerma: async (id, data) => {
    return await firestoreService.updateRazonMerma(id, uppercaseStrings(data))
  },
  deleteRazonMerma: async (id) => {
    return await firestoreService.deleteRazonMerma(id)
  },

  // Ventas
  getVentas: async () => {
    return await firestoreService.getVentas()
  },
  createVenta: async (data) => {
    return await firestoreService.createVenta(uppercaseStrings(data))
  },

  // Mermas
  getMermas: async () => {
    return await firestoreService.getMermas()
  },
  createMerma: async (data) => {
    return await firestoreService.createMerma(uppercaseStrings(data))
  },

  // Roles CRUD
  getRoles: async () => {
    return await firestoreService.getRoles()
  },
  createRol: async (data) => {
    return await firestoreService.createRol(uppercaseStrings(data))
  },
  updateRol: async (id, data) => {
    return await firestoreService.updateRol(id, uppercaseStrings(data))
  },
  deleteRol: async (id) => {
    return await firestoreService.deleteRol(id)
  },

  // ========== SOLICITUDES DE TRANSFERENCIA ==========
  getSolicitudes: async (filtros) => {
    return await firestoreService.getSolicitudes(filtros)
  },
  getDetalleSolicitudes: async (solicitudId) => {
    return await firestoreService.getDetalleSolicitudes(solicitudId)
  },
  createSolicitud: async (data) => {
    return await firestoreService.createSolicitud(data)
  },
  updateSolicitud: async (solicitudId, data) => {
    return await firestoreService.updateSolicitud(solicitudId, data)
  },
  enviarSolicitud: async (solicitudId, usuarioId) => {
    return await firestoreService.enviarSolicitud(solicitudId, usuarioId)
  },
  procesarSolicitud: async (data) => {
    return await firestoreService.procesarSolicitud(data)
  },
  cancelarSolicitud: async (solicitudId, usuarioId, motivo) => {
    return await firestoreService.cancelarSolicitud(solicitudId, usuarioId, motivo)
  },
  deleteSolicitud: async (solicitudId) => {
    return await firestoreService.deleteSolicitud(solicitudId)
  },
  actualizarSolicitudesProcesadasSinCodigo: async () => {
    return await firestoreService.actualizarSolicitudesProcesadasSinCodigo()
  },

  // SALIDAS ODOO — RECETAS (BOM)
  getRecetas: async () => firestoreService.getRecetas(),
  createReceta: async (data) => firestoreService.createReceta(data),
  updateReceta: async (id, data) => firestoreService.updateReceta(id, data),
  duplicateReceta: async (id) => firestoreService.duplicateReceta(id),
  deleteReceta: async (id) => firestoreService.deleteReceta(id),
  batchCreateRecetas: async (recetas) => firestoreService.batchCreateRecetas(recetas),

  // MAPEO POS (Odoo POS ↔ App Ubicación)
  getMapeoPOS: async () => firestoreService.getMapeoPOS(),
  createMapeoPOS: async (data) => firestoreService.createMapeoPOS(data),
  updateMapeoPOS: async (id, data) => firestoreService.updateMapeoPOS(id, data),
  deleteMapeoPOS: async (id) => firestoreService.deleteMapeoPOS(id),
  upsertMapeoPOSDefault: async (ubicacionId) => firestoreService.upsertMapeoPOSDefault(ubicacionId),

  // SALIDAS ODOO
  getSalidasOdoo: async () => firestoreService.getSalidasOdoo(),
  syncSalidasOdoo: async () => firestoreService.syncSalidasOdoo(),

  // Obtener puntos de venta directamente desde Odoo mediante Cloud Function
  getOdooPOS: async () => {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const getPOS = httpsCallable(functions, 'getOdooPOS');
    const result = await getPOS();
    return result.data;
  },

  // Obtener productos (variantes) directamente desde Odoo mediante Cloud Function
  getOdooProducts: async () => {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const getProducts = httpsCallable(functions, 'getOdooProducts');
    const result = await getProducts();
    return result.data;
  },

  createSalidaOdooManual: async (data) => firestoreService.createSalidaOdooManual(data),
  deleteSalidaOdoo: async (id) => firestoreService.deleteSalidaOdoo(id),

  // Sincronizar ventas POS del día desde Odoo (pull manual)
  sincronizarVentasHoy: async (ubicacionId = 'tienda_principal') => {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const fns = getFunctions();
    const fn = httpsCallable(fns, 'sincronizarVentasHoy', { timeout: 540000 });
    const result = await fn({ ubicacion_id: ubicacionId });
    return result.data;
  }
}

export default dataService
