/**
 * Servicio de Firestore
 * Maneja todas las operaciones CRUD con Firestore
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  Timestamp,
  increment
} from 'firebase/firestore'
import { getDB } from '../config/firebase.config'
import { triggerTransferenciaRecibida, triggerStockBajo, verificarStockBajo } from './notificationService'

/**
 * Genera un ID único personalizado
 */
const generateId = (prefix = 'ITEM') => {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  return `${prefix}${timestamp}${random}`
}

/**
 * Genera un código secuencial legible (MV0001, CT0001, PROD00001, etc.)
 * Usa una colección 'contadores' en Firestore para mantener la secuencia
 */
const getNextSequentialCode = async (prefix) => {
  const db = getDB()
  const counterRef = doc(db, 'contadores', prefix)
  try {
    const counterDoc = await getDoc(counterRef)
    let nextVal = 1
    if (counterDoc.exists()) {
      const currentVal = Number(counterDoc.data().valor || 0)
      nextVal = isNaN(currentVal) ? 1 : currentVal + 1
    }
    await setDoc(counterRef, { 
      valor: nextVal, 
      updated_at: serverTimestamp()
    })
    // Use 5 digits for PROD, 4 for others
    return `${prefix}${nextVal}`
  } catch (error) {
    console.warn('Error getting sequential code, using timestamp fallback:', error)
    return `${prefix}${Date.now()}`
  }
}

/**
 * Obtener referencia a una colección
 */
const getCollection = (collectionName) => {
  const db = getDB()
  return collection(db, collectionName)
}

/**
 * Servicio de Firestore
 */
const firestoreService = {
  // ========== OPERACIONES GENERALES ==========

  /**
   * Obtener todos los documentos de una colección
   */
  getAll: async (collectionName) => {
    try {
      const querySnapshot = await getDocs(getCollection(collectionName))
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    } catch (error) {
      console.error(`Error obteniendo ${collectionName}:`, error)
      throw error
    }
  },

  /**
   * Obtener un documento por ID
   */
  getById: async (collectionName, docId) => {
    try {
      const db = getDB()
      const docRef = doc(db, collectionName, docId)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() }
      }
      return null
    } catch (error) {
      console.error(`Error obteniendo documento ${docId} de ${collectionName}:`, error)
      throw error
    }
  },

  /**
   * Crear un documento con ID personalizado
   */
  create: async (collectionName, data, customId = null) => {
    try {
      const db = getDB()
      if (customId) {
        const docRef = doc(db, collectionName, customId)
        await setDoc(docRef, {
          ...data,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        })
        return { id: customId, ...data }
      } else {
        const collectionRef = collection(db, collectionName)
        const docRef = await addDoc(collectionRef, {
          ...data,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        })
        return { id: docRef.id, ...data }
      }
    } catch (error) {
      console.error(`Error creando documento en ${collectionName}:`, error)
      throw error
    }
  },

  /**
   * Consulta con filtros
   */
  queryWithFilters: async (collectionName, filters = []) => {
    try {
      const collectionRef = getCollection(collectionName)
      const q = query(collectionRef, ...filters)
      const querySnapshot = await getDocs(q)

      return querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }))
    } catch (error) {
      console.error(`Error en query de ${collectionName}:`, error)
      throw error
    }
  },

  // ========== EMPRESAS ==========

  getEmpresas: async () => {
    return await firestoreService.getAll('empresas')
  },

  // ========== USUARIOS ==========

  getUsuarios: async () => {
    return await firestoreService.getAll('usuarios')
  },

  getUsuarioByEmail: async (email) => {
    const usuarios = await firestoreService.queryWithFilters('usuarios', [
      where('email', '==', email)
    ])
    return usuarios.length > 0 ? usuarios[0] : null
  },

  createUsuario: async (data) => {
    try {
      const db = getDB()
      const ref = collection(db, 'usuarios')

      // Look up role permisos if user has a rol assigned
      let permisos = data.permisos || null
      let rol_id = data.rol_id || null
      if (data.rol && !permisos) {
        try {
          // First try by nombre (expected path)
          let roles = await firestoreService.queryWithFilters('roles', [
            where('nombre', '==', data.rol)
          ])
          // Fallback: if rol looks like a Firestore ID, look up by doc ID
          if (roles.length === 0 && data.rol.length > 15) {
            try {
              const roleSnap = await getDoc(doc(getDB(), 'roles', data.rol))
              if (roleSnap.exists()) roles = [{ id: roleSnap.id, ...roleSnap.data() }]
            } catch (_) { /* ignore */ }
          }
          if (roles.length > 0) {
            permisos = roles[0].permisos || null
            rol_id = roles[0].id
          }
        } catch (e) {
          console.warn('Could not look up role permisos for new user:', e)
        }
      }

      // Generate a readable user code
      const codigo = await getNextSequentialCode('USR')

      const nuevo = {
        ...data,
        codigo,
        permisos: permisos || {},
        rol_id: rol_id || '',
        estado: data.estado || 'ACTIVO',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      }
      const docRef = await addDoc(ref, nuevo)
      return { success: true, message: 'Usuario creado exitosamente', data: { id: docRef.id, ...nuevo } }
    } catch (error) {
      console.error('Error creando usuario:', error)
      return { success: false, message: error.message }
    }
  },

  updateUsuario: async (id, data) => {
    try {
      const db = getDB()
      const ref = doc(db, 'usuarios', id)

      // If role changed, look up and sync permisos from the new role
      const updateData = { ...data, updated_at: serverTimestamp() }
      if (data.rol && !data.permisos) {
        try {
          // First try by nombre (expected path)
          let roles = await firestoreService.queryWithFilters('roles', [
            where('nombre', '==', data.rol)
          ])
          // Fallback: if rol looks like a Firestore ID, look up by doc ID
          if (roles.length === 0 && data.rol.length > 15) {
            try {
              const roleSnap = await getDoc(doc(getDB(), 'roles', data.rol))
              if (roleSnap.exists()) roles = [{ id: roleSnap.id, ...roleSnap.data() }]
            } catch (_) { /* ignore */ }
          }
          if (roles.length > 0) {
            updateData.permisos = roles[0].permisos || {}
            updateData.rol_id = roles[0].id
          }
        } catch (e) {
          console.warn('Could not look up role permisos for user update:', e)
        }
      }

      await updateDoc(ref, updateData)
      return { success: true, message: 'Usuario actualizado exitosamente', data: { id, ...updateData } }
    } catch (error) {
      console.error('Error actualizando usuario:', error)
      return { success: false, message: error.message }
    }
  },

  deleteUsuario: async (id) => {
    try {
      const db = getDB()
      const ref = doc(db, 'usuarios', id)
      await updateDoc(ref, { estado: 'INACTIVO', updated_at: serverTimestamp() })
      return { success: true, message: 'Usuario desactivado exitosamente' }
    } catch (error) {
      console.error('Error eliminando usuario:', error)
      return { success: false, message: error.message }
    }
  },

  // Hard delete: permanently removes user document from Firestore (Admin Global only)
  hardDeleteUsuario: async (id) => {
    try {
      const db = getDB()
      const ref = doc(db, 'usuarios', id)
      await deleteDoc(ref)
      return { success: true, message: 'Usuario eliminado permanentemente' }
    } catch (error) {
      console.error('Error eliminando usuario permanentemente:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== EMPRESAS CRUD ==========

  createEmpresa: async (data) => {
    try {
      const db = getDB()
      const ref = collection(db, 'empresas')
      const nuevo = { ...data, estado: data.estado || 'ACTIVO', created_at: serverTimestamp(), updated_at: serverTimestamp() }
      const docRef = await addDoc(ref, nuevo)
      return { success: true, message: 'Sede creada exitosamente', data: { id: docRef.id, ...nuevo } }
    } catch (error) {
      console.error('Error creando empresa:', error)
      return { success: false, message: error.message }
    }
  },

  updateEmpresa: async (id, data) => {
    try {
      const db = getDB()
      const ref = doc(db, 'empresas', id)
      await updateDoc(ref, { ...data, updated_at: serverTimestamp() })
      return { success: true, message: 'Sede actualizada exitosamente', data: { id, ...data } }
    } catch (error) {
      console.error('Error actualizando empresa:', error)
      return { success: false, message: error.message }
    }
  },

  deleteEmpresa: async (id) => {
    try {
      const db = getDB()
      const ref = doc(db, 'empresas', id)
      await updateDoc(ref, { estado: 'INACTIVO', updated_at: serverTimestamp() })
      return { success: true, message: 'Sede desactivada exitosamente' }
    } catch (error) {
      console.error('Error eliminando empresa:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== UBICACIONES CRUD ==========

  createUbicacion: async (data) => {
    try {
      const db = getDB()
      const ref = collection(db, 'ubicaciones')
      const nuevo = { ...data, estado: data.estado || 'ACTIVO', created_at: serverTimestamp(), updated_at: serverTimestamp() }
      const docRef = await addDoc(ref, nuevo)
      return { success: true, message: 'Ubicación creada exitosamente', data: { id: docRef.id, ...nuevo } }
    } catch (error) {
      console.error('Error creando ubicación:', error)
      return { success: false, message: error.message }
    }
  },

  updateUbicacion: async (id, data) => {
    try {
      const db = getDB()
      const ref = doc(db, 'ubicaciones', id)
      await updateDoc(ref, { ...data, updated_at: serverTimestamp() })
      return { success: true, message: 'Ubicación actualizada exitosamente', data: { id, ...data } }
    } catch (error) {
      console.error('Error actualizando ubicación:', error)
      return { success: false, message: error.message }
    }
  },

  deleteUbicacion: async (id) => {
    try {
      const db = getDB()
      const ref = doc(db, 'ubicaciones', id)
      await updateDoc(ref, { estado: 'INACTIVO', updated_at: serverTimestamp() })
      return { success: true, message: 'Ubicación desactivada exitosamente' }
    } catch (error) {
      console.error('Error eliminando ubicación:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== CATEGORÍAS ==========

  getCategorias: async () => {
    return await firestoreService.getAll('categorias')
  },

  createCategoria: async (data) => {
    try {
      const db = getDB()
      const ref = collection(db, 'categorias')
      const nuevo = { ...data, estado: data.estado || 'ACTIVO', created_at: serverTimestamp(), updated_at: serverTimestamp() }
      const docRef = await addDoc(ref, nuevo)
      return { success: true, message: 'Categoría creada exitosamente', data: { id: docRef.id, ...nuevo } }
    } catch (error) {
      console.error('Error creando categoría:', error)
      return { success: false, message: error.message }
    }
  },

  updateCategoria: async (id, data) => {
    try {
      const db = getDB()
      const ref = doc(db, 'categorias', id)
      await updateDoc(ref, { ...data, updated_at: serverTimestamp() })
      return { success: true, message: 'Categoría actualizada exitosamente', data: { id, ...data } }
    } catch (error) {
      console.error('Error actualizando categoría:', error)
      return { success: false, message: error.message }
    }
  },

  deleteCategoria: async (id) => {
    try {
      const db = getDB()
      const ref = doc(db, 'categorias', id)
      await updateDoc(ref, { estado: 'INACTIVO', updated_at: serverTimestamp() })
      return { success: true, message: 'Categoría desactivada exitosamente' }
    } catch (error) {
      console.error('Error eliminando categoría:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== ESPECIFICACIONES ==========

  getEspecificaciones: async () => {
    return await firestoreService.getAll('especificaciones')
  },

  createEspecificacion: async (data) => {
    try {
      const db = getDB()
      const ref = collection(db, 'especificaciones')
      const nuevo = { ...data, estado: data.estado || 'ACTIVO', created_at: serverTimestamp(), updated_at: serverTimestamp() }
      const docRef = await addDoc(ref, nuevo)
      return { success: true, message: 'Especificación creada exitosamente', data: { id: docRef.id, ...nuevo } }
    } catch (error) {
      console.error('Error creando especificación:', error)
      return { success: false, message: error.message }
    }
  },

  updateEspecificacion: async (id, data) => {
    try {
      const db = getDB()
      const ref = doc(db, 'especificaciones', id)
      await updateDoc(ref, { ...data, updated_at: serverTimestamp() })
      return { success: true, message: 'Especificación actualizada', data: { id, ...data } }
    } catch (error) {
      console.error('Error actualizando especificación:', error)
      return { success: false, message: error.message }
    }
  },

  deleteEspecificacion: async (id) => {
    try {
      const db = getDB()
      const ref = doc(db, 'especificaciones', id)
      await updateDoc(ref, { estado: 'INACTIVO', updated_at: serverTimestamp() })
      return { success: true, message: 'Especificación desactivada' }
    } catch (error) {
      console.error('Error eliminando especificación:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== UNIDADES DE MEDIDA ==========

  getUnidadesMedida: async () => {
    return await firestoreService.getAll('unidades_medida')
  },

  createUnidadMedida: async (data) => {
    try {
      const db = getDB()
      const ref = collection(db, 'unidades_medida')
      const nuevo = { ...data, estado: data.estado || 'ACTIVO', created_at: serverTimestamp(), updated_at: serverTimestamp() }
      const docRef = await addDoc(ref, nuevo)
      return { success: true, message: 'Unidad de medida creada', data: { id: docRef.id, ...nuevo } }
    } catch (error) {
      console.error('Error creando unidad de medida:', error)
      return { success: false, message: error.message }
    }
  },

  updateUnidadMedida: async (id, data) => {
    try {
      const db = getDB()
      const ref = doc(db, 'unidades_medida', id)
      await updateDoc(ref, { ...data, updated_at: serverTimestamp() })
      return { success: true, message: 'Unidad de medida actualizada', data: { id, ...data } }
    } catch (error) {
      console.error('Error actualizando unidad de medida:', error)
      return { success: false, message: error.message }
    }
  },

  deleteUnidadMedida: async (id) => {
    try {
      const db = getDB()
      const ref = doc(db, 'unidades_medida', id)
      await updateDoc(ref, { estado: 'INACTIVO', updated_at: serverTimestamp() })
      return { success: true, message: 'Unidad de medida desactivada' }
    } catch (error) {
      console.error('Error eliminando unidad de medida:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== EQUIVALENCIAS DE UNIDADES ==========

  getUnitEquivalences: async () => {
    try {
      const db = getDB()
      const snap = await getDocs(
        query(collection(db, 'unit_equivalences'), orderBy('created_at', 'desc'))
      )
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (error) {
      console.error('Error obteniendo equivalencias:', error)
      return []
    }
  },

  createUnitEquivalence: async (data) => {
    try {
      const db = getDB()
      const ref = collection(db, 'unit_equivalences')
      const nuevo = {
        from_unit_id: data.from_unit_id,
        to_unit_id: data.to_unit_id,
        factor: parseFloat(data.factor),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      }
      const docRef = await addDoc(ref, nuevo)
      return { success: true, data: { id: docRef.id, ...nuevo } }
    } catch (error) {
      console.error('Error creando equivalencia:', error)
      return { success: false, message: error.message }
    }
  },

  updateUnitEquivalence: async (id, data) => {
    try {
      const db = getDB()
      const ref = doc(db, 'unit_equivalences', id)
      await updateDoc(ref, {
        from_unit_id: data.from_unit_id,
        to_unit_id: data.to_unit_id,
        factor: parseFloat(data.factor),
        updated_at: serverTimestamp()
      })
      return { success: true }
    } catch (error) {
      console.error('Error actualizando equivalencia:', error)
      return { success: false, message: error.message }
    }
  },

  deleteUnitEquivalence: async (id) => {
    try {
      const db = getDB()
      await deleteDoc(doc(db, 'unit_equivalences', id))
      return { success: true }
    } catch (error) {
      console.error('Error eliminando equivalencia:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== ROLES ==========

  getRoles: async () => {
    return await firestoreService.getAll('roles')
  },

  createRol: async (data) => {
    try {
      const db = getDB()
      const ref = collection(db, 'roles')
      const nuevo = { ...data, estado: data.estado || 'ACTIVO', created_at: serverTimestamp(), updated_at: serverTimestamp() }
      const docRef = await addDoc(ref, nuevo)
      return { success: true, message: 'Rol creado exitosamente', data: { id: docRef.id, ...nuevo } }
    } catch (error) {
      console.error('Error creando rol:', error)
      return { success: false, message: error.message }
    }
  },

  updateRol: async (id, data) => {
    try {
      const db = getDB()
      const ref = doc(db, 'roles', id)
      await updateDoc(ref, { ...data, updated_at: serverTimestamp() })

      // Propagate permisos to all users with this role
      if (data.permisos && data.nombre) {
        try {
          const usersWithRole = await firestoreService.queryWithFilters('usuarios', [
            where('rol', '==', data.nombre)
          ])
          const batch = writeBatch(db)
          for (const usuario of usersWithRole) {
            const userRef = doc(db, 'usuarios', usuario.id)
            batch.update(userRef, {
              permisos: data.permisos,
              rol_id: id,
              updated_at: serverTimestamp()
            })
          }
          if (usersWithRole.length > 0) {
            await batch.commit()
          }
        } catch (propError) {
          console.error('Error propagando permisos a usuarios:', propError)
        }
      }

      return { success: true, message: 'Rol actualizado exitosamente', data: { id, ...data } }
    } catch (error) {
      console.error('Error actualizando rol:', error)
      return { success: false, message: error.message }
    }
  },

  deleteRol: async (id) => {
    try {
      const db = getDB()
      const ref = doc(db, 'roles', id)
      await deleteDoc(ref)
      return { success: true, message: 'Rol eliminado exitosamente' }
    } catch (error) {
      console.error('Error eliminando rol:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== PRODUCTOS ==========

  getProductos: async () => {
    const productos = await firestoreService.queryWithFilters('productos', [
      where('estado', '!=', 'ELIMINADO')
    ])
    return productos
  },

  createProducto: async (productoData) => {
    try {
      const db = getDB()
      const productosRef = collection(db, 'productos')

      // Generar código legible secuencial PROD00001
      const codigoLegible = await getNextSequentialCode('PROD')

      const nuevoProducto = {
        ...productoData,
        frecuencia_inventario: Array.isArray(productoData.frecuencia_inventario)
          ? productoData.frecuencia_inventario.map(t => String(t).toUpperCase())
          : (productoData.frecuencia_inventario ? String(productoData.frecuencia_inventario).toUpperCase() : []),
        codigo_legible: codigoLegible,
        concatenado: `${productoData.nombre} ${productoData.especificacion || ''}`.trim(),
        estado: productoData.estado || 'ACTIVO',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      }

      const docRef = await addDoc(productosRef, nuevoProducto)

      return {
        success: true,
        message: 'Producto creado exitosamente',
        data: { id: docRef.id, ...nuevoProducto }
      }
    } catch (error) {
      console.error('Error creando producto:', error)
      return { success: false, message: error.message }
    }
  },

  updateProducto: async (productoId, productoData) => {
    try {
      
      const db = getDB()
      const productoRef = doc(db, 'productos', productoId)
      

      const datosActualizados = {
        ...productoData,
        frecuencia_inventario: Array.isArray(productoData.frecuencia_inventario)
          ? productoData.frecuencia_inventario.map(t => String(t).toUpperCase())
          : (productoData.frecuencia_inventario ? String(productoData.frecuencia_inventario).toUpperCase() : []),
        concatenado: `${productoData.nombre} ${productoData.especificacion || ''}`.trim(),
        updated_at: serverTimestamp()
      }


      await updateDoc(productoRef, datosActualizados)

      return {
        success: true,
        message: 'Producto actualizado exitosamente',
        data: { id: productoId, ...datosActualizados }
      }
    } catch (error) {
      console.error('❌ Error actualizando producto:', error)
      console.error('❌ Código de error:', error.code)
      console.error('❌ Mensaje de error:', error.message)
      console.error('❌ Stack trace:', error.stack)
      return { success: false, message: error.message }
    }
  },

  deleteProducto: async (productoId) => {
    try {
      const db = getDB()
      const productoRef = doc(db, 'productos', productoId)

      // Soft delete: marcar como eliminado
      await updateDoc(productoRef, {
        estado: 'ELIMINADO',
        updated_at: serverTimestamp()
      })

      return { success: true, message: 'Producto eliminado exitosamente' }
    } catch (error) {
      console.error('Error eliminando producto:', error)
      return { success: false, message: error.message }
    }
  },

  // Actualizar todos los productos para establecer tipo de conteo por defecto
  actualizarTodosLosProductosTipoConteo: async (tipoConteoPorDefecto = 'diario') => {
    try {
      
      const db = getDB()
      const productosRef = collection(db, 'productos')
      const snapshot = await getDocs(productosRef)
      
      let actualizados = 0
      let omitidos = 0
      const batch = writeBatch(db)
      
      for (const docSnapshot of snapshot.docs) {
        const producto = docSnapshot.data()
        const productoRef = doc(db, 'productos', docSnapshot.id)
        
        // Solo actualizar si no tiene frecuencia_inventario o está vacía
        if (!producto.frecuencia_inventario || producto.frecuencia_inventario === '') {
          batch.update(productoRef, {
            frecuencia_inventario: tipoConteoPorDefecto,
            updated_at: serverTimestamp()
          })
          actualizados++
        } else {
          omitidos++
        }
      }
      
      // Ejecutar el batch
      await batch.commit()
      
      
      return {
        success: true,
        message: `Se actualizaron ${actualizados} productos con tipo de conteo "${tipoConteoPorDefecto}"`,
        actualizados,
        omitidos,
        total: snapshot.size
      }
    } catch (error) {
      console.error('❌ Error en actualización masiva:', error)
      return { success: false, message: error.message }
    }
  },

  // Limpiar empresas asignadas de todos los productos
  limpiarEmpresasAsignadasProductos: async () => {
    try {
      
      const db = getDB()
      const productosRef = collection(db, 'productos')
      const snapshot = await getDocs(productosRef)
      
      let actualizados = 0
      const batch = writeBatch(db)
      
      for (const docSnapshot of snapshot.docs) {
        const productoRef = doc(db, 'productos', docSnapshot.id)
        const producto = docSnapshot.data()
        
        // Limpiar empresas_permitidas (dejar array vacío)
        batch.update(productoRef, {
          empresas_permitidas: [],
          updated_at: serverTimestamp()
        })
        actualizados++
      }
      
      // Ejecutar el batch
      await batch.commit()
      
      
      return {
        success: true,
        message: `Se limpiaron las empresas asignadas de ${actualizados} productos. Ahora estarán disponibles en todas las ubicaciones.`,
        actualizados,
        total: snapshot.size
      }
    } catch (error) {
      console.error('❌ Error en limpieza de empresas:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== UBICACIONES ==========

  getUbicaciones: async () => {
    return await firestoreService.getAll('ubicaciones')
  },

  // ========== INVENTARIO ==========

  getInventario: async (ubicacionId = null, tipoUbicacion = null) => {
    try {
      const filters = []

      if (ubicacionId) {
        filters.push(where('ubicacion_id', '==', ubicacionId))
      }

      if (tipoUbicacion) {
        filters.push(where('tipo_ubicacion', '==', tipoUbicacion))
      }

      return await firestoreService.queryWithFilters('inventario', filters)
    } catch (error) {
      console.error('Error obteniendo inventario:', error)
      throw error
    }
  },

  ajustarInventario: async (data) => {
    try {
      const db = getDB()

      // Validar que el producto esté permitido en la ubicación
      const producto = await firestoreService.getById('productos', data.producto_id)
      const ubicacion = await firestoreService.getById('ubicaciones', data.ubicacion_id)
      
      if (!producto) {
        return { success: false, message: 'Producto no encontrado' }
      }
      
      if (!ubicacion) {
        return { success: false, message: 'Ubicación no encontrada' }
      }

      // Importar utilidad de validación (evitar circular dependency)
      const { esProductoPermitidoEnUbicacion } = await import('../utils/productosPorUbicacion')
      
      // Cargar todas las ubicaciones para validación
      const todasUbicaciones = await firestoreService.getAll('ubicaciones')
      const esPermitido = esProductoPermitidoEnUbicacion(producto, data.ubicacion_id, todasUbicaciones)
      
      if (!esPermitido) {
        return { 
          success: false, 
          message: `El producto "${producto.nombre}" no está permitido en la ubicación "${ubicacion.nombre}"` 
        }
      }

      // Buscar si existe el inventario para ese producto en esa ubicación
      const inventarioExistente = await firestoreService.queryWithFilters('inventario', [
        where('producto_id', '==', data.producto_id),
        where('ubicacion_id', '==', data.ubicacion_id)
      ])

      if (inventarioExistente.length > 0) {
        // Actualizar existente
        const inventarioRef = doc(db, 'inventario', inventarioExistente[0].id)
        await updateDoc(inventarioRef, {
          stock_actual: data.nuevo_stock,
          ultima_actualizacion: serverTimestamp()
        })
      } else {
        // Crear nuevo
        const inventarioRef = collection(db, 'inventario')
        await addDoc(inventarioRef, {
          producto_id: data.producto_id,
          ubicacion_id: data.ubicacion_id,
          stock_actual: data.nuevo_stock,
          ultima_actualizacion: serverTimestamp()
        })
      }

      return { success: true, message: 'Inventario ajustado exitosamente' }
    } catch (error) {
      console.error('Error ajustando inventario:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== MOVIMIENTOS ==========

  getMovimientos: async (ubicacionId = null) => {
    try {
      // Primero intentar obtener sin orderBy para evitar problemas de índice
      let movimientos = await firestoreService.getAll('movimientos')

      // Filtrar por ubicación si es necesario
      if (ubicacionId) {
        movimientos = movimientos.filter(m => m.origen_id === ubicacionId || m.destino_id === ubicacionId)
      }

      // Ordenar en memoria por fecha_creacion descendente
      movimientos.sort((a, b) => {
        const fechaA = a.fecha_creacion ? new Date(a.fecha_creacion) : new Date(0)
        const fechaB = b.fecha_creacion ? new Date(b.fecha_creacion) : new Date(0)
        return fechaB - fechaA
      })

      return movimientos
    } catch (error) {
      console.error('Error obteniendo movimientos:', error)
      // Devolver array vacío en caso de error para no romper la UI
      return []
    }
  },

  getDetalleMovimientos: async (movimientoId = null) => {
    try {
      const filters = []

      if (movimientoId) {
        filters.push(where('movimiento_id', '==', movimientoId))
      }

      return await firestoreService.queryWithFilters('detalle_movimientos', filters)
    } catch (error) {
      console.error('Error obteniendo detalle movimientos:', error)
      throw error
    }
  },

  getDetalleVentas: async (ventaId = null) => {
    try {
      const filters = []

      if (ventaId) {
        filters.push(where('venta_id', '==', ventaId))
      }

      return await firestoreService.queryWithFilters('detalle_ventas', filters)
    } catch (error) {
      console.error('Error obteniendo detalle ventas:', error)
      throw error
    }
  },

  createTransferencia: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      // Generar código legible secuencial
      const codigoLegible = await getNextSequentialCode('MV')

      // Determinar estado inicial: BORRADOR si es solicitud desde destino, PENDIENTE si es envío desde origen
      const estadoInicial = data.estado || 'PENDIENTE'

      // Fecha documento: por defecto es la fecha de creación (solo fecha, sin hora)
      const ahora = new Date()
      const fechaDocumento = data.fecha_documento 
        ? Timestamp.fromDate(new Date(data.fecha_documento))
        : Timestamp.fromDate(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()))

      // Crear movimiento
      const movimientoRef = doc(collection(db, 'movimientos'))
      const nuevoMovimiento = {
        codigo_legible: codigoLegible,
        tipo_movimiento: data.tipo_movimiento || 'TRANSFERENCIA',
        origen_id: data.origen_id,
        destino_id: data.destino_id,
        estado: estadoInicial,
        usuario_creacion_id: data.usuario_creacion_id,
        usuario_confirmacion_id: null,
        fecha_creacion: Timestamp.now(),
        fecha_documento: fechaDocumento,
        fecha_confirmacion: null,
        fecha_envio: null,
        usuario_envio_id: null,
        fecha_limite_edicion: data.fecha_limite_edicion || null,
        observaciones_creacion: data.observaciones || '',
        observaciones_confirmacion: ''
      }

      batch.set(movimientoRef, nuevoMovimiento)

      // Crear detalles del movimiento con cantidad_enviada
      if (data.productos && data.productos.length > 0) {
        data.productos.forEach(prod => {
          const detalleRef = doc(collection(db, 'detalle_movimientos'))
          batch.set(detalleRef, {
            movimiento_id: movimientoRef.id,
            producto_id: prod.producto_id,
            cantidad: prod.cantidad,
            cantidad_enviada: prod.cantidad,
            cantidad_recibida: null,
            cantidad_original: prod.cantidad_original || null,
            unidad_original_id: prod.unidad_original_id || null,
            observaciones: prod.observaciones || ''
          })
        })
      }

      await batch.commit()

      // ========== NOTIFICACIONES ==========
      // Disparar notificación SOLO para TRANSFERENCIAS (no ventas ni mermas)
            
      if (data.tipo_movimiento === 'TRANSFERENCIA' || !data.tipo_movimiento) {
        try {
          // Obtener ubicaciones para nombres
          const ubicaciones = await firestoreService.getAll('ubicaciones')
          
          const origen = ubicaciones.find(u => u.id === data.origen_id)
          const destino = ubicaciones.find(u => u.id === data.destino_id)
          // Obtener TODOS los usuarios activos
          const todosUsuarios = await firestoreService.getAll('usuarios')
                    
          // Filtrar usuarios destino: asignados a ubicación destino
          const usuariosDestino = todosUsuarios.filter(u => {
            if (u.estado && u.estado !== 'ACTIVO') return false
            
            let ubicacionesAsignadas = []
            if (Array.isArray(u.ubicaciones_asignadas)) {
              ubicacionesAsignadas = u.ubicaciones_asignadas
            } else if (typeof u.ubicaciones_asignadas === 'string') {
              try {
                ubicacionesAsignadas = JSON.parse(u.ubicaciones_asignadas)
              } catch {
                ubicacionesAsignadas = []
              }
            }
            
            return ubicacionesAsignadas.includes(data.destino_id)
          })

          // Filtrar admins globales (que NO estén ya en destino)
          const usuariosDestinoIds = usuariosDestino.map(u => u.id)
          const adminsGlobales = todosUsuarios.filter(u => {
            if (u.estado && u.estado !== 'ACTIVO') return false
            if (usuariosDestinoIds.includes(u.id)) return false // Ya está en destino
            
            const rolNorm = String(u.rol || '').toUpperCase()
            return rolNorm === 'ADMIN_GLOBAL' || 
                   rolNorm === 'ADMIN GLOBAL' || 
                   rolNorm === 'ADMINISTRADOR' ||
                   rolNorm === 'ADMIN_EMPRESA' ||
                   rolNorm === 'ADMIN EMPRESA'
          })

          // Combinar destinatarios (usar user.id que es el codigo)
          const todosDestinatarios = [
            ...usuariosDestino.map(u => u.id),
            ...adminsGlobales.map(u => u.id)
          ]

          // Obtener usuario creador
          const usuarioCreador = todosUsuarios.find(u => u.id === data.usuario_creacion_id)

          if (todosDestinatarios.length > 0) {
            
            // Obtener productos completos con nombres
            const productosCompletos = await Promise.all(
              (data.productos || []).map(async (p) => {
                try {
                  const producto = await firestoreService.getById('productos', p.producto_id)
                  return {
                    producto_id: p.producto_id,
                    nombre: producto?.nombre || 'Producto',
                    cantidad: p.cantidad || 0
                  }
                } catch (err) {
                  console.warn('Error obteniendo producto:', p.producto_id, err)
                  return {
                    producto_id: p.producto_id,
                    nombre: 'Producto',
                    cantidad: p.cantidad || 0
                  }
                }
              })
            )
            
            const notifId = await triggerTransferenciaRecibida({
              transferencia: { 
                id: movimientoRef.id, 
                codigo_legible: codigoLegible 
              },
              productos: productosCompletos,
              origen: {
                id: origen?.id || data.origen_id,
                nombre: origen?.nombre || 'Origen'
              },
              destino: {
                id: destino?.id || data.destino_id,
                nombre: destino?.nombre || 'Destino'
              },
              usuarioCreador: { 
                nombre: usuarioCreador?.nombre || 'Sistema' 
              },
              usuariosDestino: todosDestinatarios
            })
          } else {
            console.warn('⚠️ ===== NO HAY DESTINATARIOS PARA NOTIFICACIÓN =====')
            console.warn('⚠️ Verifica que haya usuarios asignados a la ubicación destino')
          }
        } catch (notifError) {
          console.error('❌ ===== ERROR CREANDO NOTIFICACIÓN =====')
          console.error('❌ Error completo:', notifError)
          console.error('❌ Stack:', notifError.stack)
          // No fallar la transferencia si falla la notificación
        }
      } else {
      }

      return {
        success: true,
        message: 'Transferencia creada exitosamente',
        data: { id: movimientoRef.id, ...nuevoMovimiento }
      }
    } catch (error) {
      console.error('Error creando transferencia:', error)
      return { success: false, message: error.message }
    }
  },

  /**
   * Crear entrada directa por compra (sin salida de origen)
   */
  createEntradaCompra: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      // Generar código legible secuencial
      const codigoLegible = await getNextSequentialCode('CM')

      // Fecha documento: por defecto es la fecha de creación (solo fecha, sin hora)
      const ahora = new Date()
      const fechaDocumento = data.fecha_documento 
        ? Timestamp.fromDate(new Date(data.fecha_documento))
        : Timestamp.fromDate(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()))

      // Crear movimiento de entrada
      const movimientoRef = doc(collection(db, 'movimientos'))
      const nuevoMovimiento = {
        codigo_legible: codigoLegible,
        tipo_movimiento: 'COMPRA',
        origen_id: null, // No hay origen en compras
        destino_id: data.destino_id,
        proveedor_id: data.proveedor_id || '',
        proveedor: data.proveedor_nombre || data.proveedor || '',
        numero_documento: data.numero_documento || '',
        estado: 'COMPLETADO', // Las compras se completan inmediatamente
        usuario_creacion_id: data.usuario_creacion_id,
        usuario_confirmacion_id: data.usuario_creacion_id,
        fecha_creacion: Timestamp.now(),
        fecha_documento: fechaDocumento,
        fecha_confirmacion: Timestamp.now(),
        observaciones_creacion: data.observaciones || '',
        observaciones_confirmacion: ''
      }

      batch.set(movimientoRef, nuevoMovimiento)

      // Crear detalles del movimiento
      if (data.productos && data.productos.length > 0) {
        for (const prod of data.productos) {
          const detalleRef = doc(collection(db, 'detalle_movimientos'))
          batch.set(detalleRef, {
            movimiento_id: movimientoRef.id,
            producto_id: prod.producto_id,
            cantidad: prod.cantidad,
            cantidad_enviada: prod.cantidad,
            cantidad_recibida: prod.cantidad,
            precio_unitario: prod.precio_unitario || 0,
            observaciones: prod.observaciones || ''
          })

          // Actualizar inventario en destino
          const inventarioQuery = query(
            collection(db, 'inventario'),
            where('ubicacion_id', '==', data.destino_id),
            where('producto_id', '==', prod.producto_id)
          )
          const inventarioSnapshot = await getDocs(inventarioQuery)

          if (!inventarioSnapshot.empty) {
            // Actualizar inventario existente
            const inventarioDoc = inventarioSnapshot.docs[0]
            const inventarioActual = inventarioDoc.data()
            const stockBase = inventarioActual.stock_actual ?? inventarioActual.cantidad ?? 0
            const nuevoStock = stockBase + parseFloat(prod.cantidad)
            const inventarioRef = doc(db, 'inventario', inventarioDoc.id)
            batch.update(inventarioRef, {
              stock_actual: nuevoStock,
              cantidad: nuevoStock,
              fecha_actualizacion: Timestamp.now()
            })
          } else {
            // Crear nuevo registro de inventario
            const inventarioRef = doc(collection(db, 'inventario'))
            batch.set(inventarioRef, {
              ubicacion_id: data.destino_id,
              producto_id: prod.producto_id,
              stock_actual: parseFloat(prod.cantidad),
              cantidad: parseFloat(prod.cantidad),
              fecha_actualizacion: Timestamp.now()
            })
          }
        }
      }

      await batch.commit()

      return {
        success: true,
        message: 'Entrada por compra registrada exitosamente',
        data: { id: movimientoRef.id, ...nuevoMovimiento }
      }
    } catch (error) {
      console.error('Error creando entrada por compra:', error)
      return { success: false, message: error.message }
    }
  },

  /**
   * Crear orden de producción (estado PENDIENTE, no afecta inventario hasta confirmar)
   * data.ubicacion_id: ubicación de producción
   * data.numero_documento: campo opcional de texto/número
   * data.observaciones: observaciones opcionales
   * data.usuario_creacion_id: usuario que crea
   * data.lineas: [{ producto_id, cantidad, insumos: [{ producto_id, cantidad }] }]
   */
  createProduccion: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      const codigoLegible = await getNextSequentialCode('OP')

      // Fecha documento: por defecto es la fecha de creación (solo fecha, sin hora)
      const ahora = new Date()
      const fechaDocumento = data.fecha_documento 
        ? Timestamp.fromDate(new Date(data.fecha_documento))
        : Timestamp.fromDate(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()))

      // Crear movimiento de producción
      const movimientoRef = doc(collection(db, 'movimientos'))
      const nuevoMovimiento = {
        codigo_legible: codigoLegible,
        tipo_movimiento: 'PRODUCCION',
        origen_id: data.ubicacion_id, // misma ubicación (consumo)
        destino_id: data.ubicacion_id, // misma ubicación (producción)
        estado: 'PENDIENTE',
        usuario_creacion_id: data.usuario_creacion_id,
        usuario_confirmacion_id: null,
        fecha_creacion: Timestamp.now(),
        fecha_documento: fechaDocumento,
        fecha_confirmacion: null,
        numero_documento: data.numero_documento || '',
        observaciones_creacion: data.observaciones || '',
        observaciones_confirmacion: ''
      }

      batch.set(movimientoRef, nuevoMovimiento)

      // Crear detalles: productos producidos
      if (data.lineas && data.lineas.length > 0) {
        for (const linea of data.lineas) {
          const detalleRef = doc(collection(db, 'detalle_movimientos'))
          batch.set(detalleRef, {
            movimiento_id: movimientoRef.id,
            producto_id: linea.producto_id,
            cantidad: linea.cantidad,
            cantidad_enviada: linea.cantidad,
            cantidad_recibida: null,
            tipo: 'PRODUCIDO',
            observaciones: ''
          })

          // Crear detalles de insumos consumidos para esta línea
          if (linea.insumos && linea.insumos.length > 0) {
            for (const insumo of linea.insumos) {
              const insumoRef = doc(collection(db, 'detalle_insumos_produccion'))
              batch.set(insumoRef, {
                movimiento_id: movimientoRef.id,
                detalle_producido_id: detalleRef.id,
                producto_id: insumo.producto_id,
                cantidad: insumo.cantidad
              })
            }
          }
        }
      }

      await batch.commit()

      return {
        success: true,
        message: 'Orden de producción creada exitosamente',
        data: { id: movimientoRef.id, ...nuevoMovimiento }
      }
    } catch (error) {
      console.error('Error creando orden de producción:', error)
      return { success: false, message: error.message }
    }
  },

  /**
   * Confirmar orden de producción (PENDIENTE -> COMPLETADO)
   * - Incrementa inventario de productos producidos
   * - Descuenta inventario de insumos consumidos
   * - Todo atómico en un batch
   */
  confirmarProduccion: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      const movimientoRef = doc(db, 'movimientos', data.movimiento_id)
      const movimientoDoc = await getDoc(movimientoRef)
      if (!movimientoDoc.exists()) throw new Error('Orden de producción no encontrada')
      const movimiento = movimientoDoc.data()
      const ubicacionId = movimiento.destino_id

      // Obtener detalles producidos
      const detallesProducidos = await firestoreService.getDetalleMovimientos(data.movimiento_id)

      // Obtener insumos consumidos
      const insumosQuery = query(
        collection(db, 'detalle_insumos_produccion'),
        where('movimiento_id', '==', data.movimiento_id)
      )
      const insumosSnapshot = await getDocs(insumosQuery)
      const insumos = insumosSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))

      // Validate sufficient stock for all insumos before modifying anything
      for (const insumo of insumos) {
        const invQuery = query(
          collection(db, 'inventario'),
          where('ubicacion_id', '==', ubicacionId),
          where('producto_id', '==', insumo.producto_id)
        )
        const invSnapshot = await getDocs(invQuery)
        const stockActual = invSnapshot.empty
          ? 0
          : (() => {
              const d = invSnapshot.docs[0].data()
              return d.stock_actual ?? d.cantidad ?? 0
            })()
        if (stockActual < parseFloat(insumo.cantidad)) {
          throw new Error(`Stock insuficiente para insumo ${insumo.producto_id}: disponible ${stockActual}, requerido ${insumo.cantidad}`)
        }
      }

      // 1. Incrementar inventario de productos producidos
      for (const detalle of detallesProducidos) {
        const cantidadProducida = detalle.cantidad_enviada ?? detalle.cantidad

        // Actualizar cantidad_recibida en detalle
        const detalleRef = doc(db, 'detalle_movimientos', detalle.id)
        batch.update(detalleRef, { cantidad_recibida: cantidadProducida })

        // Actualizar inventario
        const invQuery = query(
          collection(db, 'inventario'),
          where('ubicacion_id', '==', ubicacionId),
          where('producto_id', '==', detalle.producto_id)
        )
        const invSnapshot = await getDocs(invQuery)

        if (!invSnapshot.empty) {
          const invDoc = invSnapshot.docs[0]
          const invActual = invDoc.data()
          const stockBase = invActual.stock_actual ?? invActual.cantidad ?? 0
          const nuevoStock = stockBase + parseFloat(cantidadProducida)
          batch.update(doc(db, 'inventario', invDoc.id), {
            stock_actual: nuevoStock,
            cantidad: nuevoStock,
            fecha_actualizacion: Timestamp.now()
          })
        } else {
          const invRef = doc(collection(db, 'inventario'))
          batch.set(invRef, {
            ubicacion_id: ubicacionId,
            producto_id: detalle.producto_id,
            stock_actual: parseFloat(cantidadProducida),
            cantidad: parseFloat(cantidadProducida),
            fecha_actualizacion: Timestamp.now()
          })
        }
      }

      // 2. Descontar inventario de insumos consumidos
      for (const insumo of insumos) {
        const invQuery = query(
          collection(db, 'inventario'),
          where('ubicacion_id', '==', ubicacionId),
          where('producto_id', '==', insumo.producto_id)
        )
        const invSnapshot = await getDocs(invQuery)

        if (!invSnapshot.empty) {
          const invDoc = invSnapshot.docs[0]
          const invActual = invDoc.data()
          const stockBase = invActual.stock_actual ?? invActual.cantidad ?? 0
          const nuevoStock = Math.max(0, stockBase - parseFloat(insumo.cantidad))
          batch.update(doc(db, 'inventario', invDoc.id), {
            stock_actual: nuevoStock,
            cantidad: nuevoStock,
            fecha_actualizacion: Timestamp.now()
          })
        }
        // If no inventory record exists, skip (can't deduct from nothing)
      }

      // 3. Actualizar estado del movimiento
      batch.update(movimientoRef, {
        estado: 'COMPLETADO',
        usuario_confirmacion_id: data.usuario_confirmacion_id,
        fecha_confirmacion: Timestamp.now()
      })

      await batch.commit()

      return {
        success: true,
        message: 'Producción confirmada. Inventario actualizado.'
      }
    } catch (error) {
      console.error('Error confirmando producción:', error)
      return { success: false, message: error.message }
    }
  },

  /**
   * Actualizar una orden de producción (solo si está PENDIENTE)
   */
  updateProduccion: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      // Verificar que el movimiento existe y está PENDIENTE
      const movimientoRef = doc(db, 'movimientos', data.movimiento_id)
      const movimientoDoc = await getDoc(movimientoRef)
      if (!movimientoDoc.exists()) {
        throw new Error('Orden de producción no encontrada')
      }
      const movimiento = movimientoDoc.data()
      if (movimiento.estado !== 'PENDIENTE') {
        throw new Error('Solo se pueden editar órdenes de producción pendientes')
      }

      // Actualizar datos básicos del movimiento (si se proporcionan)
      const updateData = {
        updated_at: serverTimestamp(),
        fecha_ultima_edicion: Timestamp.now()
      }
      
      if (data.usuario_editor_id) updateData.usuario_editor_id = data.usuario_editor_id
      if (data.numero_documento !== undefined) updateData.numero_documento = data.numero_documento
      if (data.observaciones !== undefined) updateData.observaciones_creacion = data.observaciones
      
      batch.update(movimientoRef, updateData)

      // Si se proporcionan líneas, actualizar detalles y insumos
      if (data.lineas && data.lineas.length > 0) {
                
        // Eliminar detalles e insumos existentes
        const detallesQuery = query(
          collection(db, 'detalle_movimientos'),
          where('movimiento_id', '==', data.movimiento_id)
        )
        const detallesSnapshot = await getDocs(detallesQuery)
                detallesSnapshot.docs.forEach(d => batch.delete(d.ref))

        const insumosQuery = query(
          collection(db, 'detalle_insumos_produccion'),
          where('movimiento_id', '==', data.movimiento_id)
        )
        const insumosSnapshot = await getDocs(insumosQuery)
                insumosSnapshot.docs.forEach(d => batch.delete(d.ref))

        // Crear nuevos detalles y sus insumos
        for (const linea of data.lineas) {
          const detalleRef = doc(collection(db, 'detalle_movimientos'))
          const nuevoDetalle = {
            movimiento_id: data.movimiento_id,
            producto_id: linea.producto_id,
            cantidad: linea.cantidad,
            cantidad_enviada: linea.cantidad,
            cantidad_recibida: null,
            tipo: 'PRODUCIDO',
            observaciones: ''
          }
          batch.set(detalleRef, nuevoDetalle)

          // Crear insumos para esta línea
          if (linea.insumos && linea.insumos.length > 0) {
            for (const insumo of linea.insumos) {
              const insumoRef = doc(collection(db, 'detalle_insumos_produccion'))
              batch.set(insumoRef, {
                movimiento_id: data.movimiento_id,
                detalle_producido_id: detalleRef.id,
                producto_id: insumo.producto_id,
                cantidad: insumo.cantidad
              })
            }
          }
        }
      }

      await batch.commit()

      return {
        success: true,
        message: 'Orden de producción actualizada exitosamente'
      }
    } catch (error) {
      console.error('Error actualizando producción:', error)
      return { success: false, message: error.message }
    }
  },

  /**
   * Obtener insumos de producción para un movimiento
   */
  getInsumosProduccion: async (movimientoId) => {
    try {
      const q = query(
        collection(getDB(), 'detalle_insumos_produccion'),
        where('movimiento_id', '==', movimientoId)
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (error) {
      console.error('Error obteniendo insumos de producción:', error)
      return []
    }
  },

  /**
   * Confirmar transferencia con soporte para recepción parcial.
   * data.productos_recibidos: [{ detalle_id, producto_id, cantidad_recibida }]
   * If productos_recibidos is not provided, assumes full reception (cantidad_recibida = cantidad_enviada).
   * Estado: COMPLETADO if all items fully received, PARCIAL if any item has partial qty.
   */
  confirmarTransferencia: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      const detalles = await firestoreService.getDetalleMovimientos(data.movimiento_id)
      const movimiento = await firestoreService.getById('movimientos', data.movimiento_id)

      // Build a map of received quantities
      const recibidosMap = {}
      if (data.productos_recibidos && data.productos_recibidos.length > 0) {
        data.productos_recibidos.forEach(pr => {
          recibidosMap[pr.detalle_id || pr.producto_id] = pr.cantidad_recibida
        })
      }

      let allComplete = true

      for (const detalle of detalles) {
        const cantidadEnviada = detalle.cantidad_enviada ?? detalle.cantidad
        // Determine cantidad_recibida: from map, or full if confirming all
        let cantidadRecibida
        if (recibidosMap[detalle.id] !== undefined) {
          cantidadRecibida = recibidosMap[detalle.id]
        } else if (recibidosMap[detalle.producto_id] !== undefined) {
          cantidadRecibida = recibidosMap[detalle.producto_id]
        } else {
          cantidadRecibida = cantidadEnviada // Full reception
        }

        if (cantidadRecibida < cantidadEnviada) allComplete = false

        // Update detalle with cantidad_recibida
        const detalleRef = doc(db, 'detalle_movimientos', detalle.id)
        batch.update(detalleRef, {
          cantidad_recibida: cantidadRecibida
        })

        // Reduce stock at origin by cantidad_enviada
        const inventarioOrigen = await firestoreService.queryWithFilters('inventario', [
          where('producto_id', '==', detalle.producto_id),
          where('ubicacion_id', '==', movimiento.origen_id)
        ])

        if (inventarioOrigen.length > 0) {
          const invOrigenData = inventarioOrigen[0]
          const stockOrigenActual = invOrigenData.stock_actual ?? invOrigenData.cantidad ?? 0
          const nuevoStockOrigen = Math.max(0, stockOrigenActual - cantidadEnviada)
          const invOrigenRef = doc(db, 'inventario', invOrigenData.id)
          batch.update(invOrigenRef, {
            stock_actual: nuevoStockOrigen,
            cantidad: nuevoStockOrigen,
            ultima_actualizacion: serverTimestamp()
          })
        }

        // Increase stock at destination by cantidad_recibida
        const inventarioDestino = await firestoreService.queryWithFilters('inventario', [
          where('producto_id', '==', detalle.producto_id),
          where('ubicacion_id', '==', movimiento.destino_id)
        ])

        if (inventarioDestino.length > 0) {
          const invDestinoData = inventarioDestino[0]
          const stockDestinoActual = invDestinoData.stock_actual ?? invDestinoData.cantidad ?? 0
          const nuevoStockDestino = stockDestinoActual + cantidadRecibida
          const invDestinoRef = doc(db, 'inventario', invDestinoData.id)
          batch.update(invDestinoRef, {
            stock_actual: nuevoStockDestino,
            cantidad: nuevoStockDestino,
            ultima_actualizacion: serverTimestamp()
          })
        } else {
          const nuevoInvRef = doc(collection(db, 'inventario'))
          batch.set(nuevoInvRef, {
            producto_id: detalle.producto_id,
            ubicacion_id: movimiento.destino_id,
            stock_actual: cantidadRecibida,
            cantidad: cantidadRecibida,
            ultima_actualizacion: serverTimestamp()
          })
        }
      }

      // Update movimiento status
      const nuevoEstado = allComplete ? 'COMPLETADO' : 'PARCIAL'
      const movimientoRef = doc(db, 'movimientos', data.movimiento_id)
      batch.update(movimientoRef, {
        estado: nuevoEstado,
        fecha_confirmacion: Timestamp.now(),
        usuario_confirmacion_id: data.usuario_confirmacion_id,
        observaciones_confirmacion: data.observaciones || ''
      })

      await batch.commit()

      // ========== VERIFICAR STOCK BAJO DESPUÉS DE TRANSFERENCIA ==========
      try {
                
        for (const detalle of detalles) {
          // Verificar origen
          await verificarStockBajo(detalle.producto_id, movimiento.origen_id)
          // Verificar destino
          await verificarStockBajo(detalle.producto_id, movimiento.destino_id)
        }
        
              } catch (stockError) {
        console.error('❌ Error verificando stock bajo (no afecta transferencia):', stockError)
      }

      return {
        success: true,
        message: allComplete
          ? 'Transferencia confirmada exitosamente'
          : 'Recepción parcial registrada exitosamente'
      }
    } catch (error) {
      console.error('Error confirmando transferencia:', error)
      return { success: false, message: error.message }
    }
  },

  // Confirmar envío (BORRADOR -> PENDIENTE) - Bodega origen confirma la salida
  confirmarEnvio: async (data) => {
    try {
      const db = getDB()
      const movimientoRef = doc(db, 'movimientos', data.movimiento_id)
      
      // Verificar que el movimiento esté en BORRADOR
      const movDoc = await getDoc(movimientoRef)
      if (!movDoc.exists()) {
        return { success: false, message: 'Movimiento no encontrado' }
      }
      
      const movimiento = movDoc.data()
      if (movimiento.estado !== 'BORRADOR') {
        return { success: false, message: 'El movimiento no está en estado Borrador' }
      }

      await updateDoc(movimientoRef, {
        estado: 'PENDIENTE',
        fecha_envio: Timestamp.now(),
        usuario_envio_id: data.usuario_envio_id,
        observaciones_envio: data.observaciones || ''
      })
      
      return { success: true, message: 'Envío confirmado. La bodega destino puede proceder a recibir.' }
    } catch (error) {
      console.error('Error confirmando envío:', error)
      return { success: false, message: error.message }
    }
  },

  // Iniciar recepción (PENDIENTE -> EN_PROCESO)
  iniciarRecepcion: async (data) => {
    try {
      const db = getDB()
      const movimientoRef = doc(db, 'movimientos', data.movimiento_id)
      await updateDoc(movimientoRef, {
        estado: 'EN_PROCESO',
        fecha_inicio_recepcion: Timestamp.now(),
        usuario_recepcion_id: data.usuario_recepcion_id
      })
      return { success: true, message: 'Recepción iniciada - verificando productos' }
    } catch (error) {
      console.error('Error iniciando recepción:', error)
      return { success: false, message: error.message }
    }
  },

  // Actualizar fecha_documento con logging
  updateFechaDocumento: async (data) => {
    try {
      const db = getDB()
      const { collection_name, document_id, nueva_fecha, fecha_anterior, usuario_id } = data
      
      const docRef = doc(db, collection_name, document_id)
      const docSnap = await getDoc(docRef)
      
      if (!docSnap.exists()) {
        return { success: false, message: 'Documento no encontrado' }
      }

      // Parse "YYYY-MM-DD" safely as local date
      const [year, month, day] = nueva_fecha.split('-').map(Number)
      const fechaDocumentoDate = new Date(year, month - 1, day) // local date, no time
      const timestamp = Timestamp.fromDate(fechaDocumentoDate)
      
      // Obtener historial de ediciones existente o crear nuevo array
      const docData = docSnap.data()
      const historialEdiciones = docData.historial_ediciones || []
      
      // Agregar entrada al log de ediciones
      historialEdiciones.push({
        campo: 'fecha_documento',
        valor_anterior: fecha_anterior,
        valor_nuevo: nueva_fecha,
        usuario_id: usuario_id,
        fecha_edicion: Timestamp.now()
      })

      await updateDoc(docRef, {
        fecha_documento: timestamp,
        historial_ediciones: historialEdiciones,
        updated_at: Timestamp.now()
      })

      return { success: true, message: 'Fecha de documento actualizada' }
    } catch (error) {
      console.error('Error actualizando fecha_documento:', error)
      return { success: false, message: error.message }
    }
  },

  // Cancelar movimiento (cualquier estado -> CANCELADA)
  cancelarMovimiento: async (data) => {
    try {
      const db = getDB()
      const movimientoRef = doc(db, 'movimientos', data.movimiento_id)
      await updateDoc(movimientoRef, {
        estado: 'CANCELADA',
        fecha_cancelacion: Timestamp.now(),
        usuario_cancelacion_id: data.usuario_cancelacion_id,
        motivo_cancelacion: data.motivo || ''
      })
      return { success: true, message: 'Movimiento cancelado' }
    } catch (error) {
      console.error('Error cancelando movimiento:', error)
      return { success: false, message: error.message }
    }
  },

  deleteMovimiento: async (movimientoId) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      // Eliminar movimiento
      const movimientoRef = doc(db, 'movimientos', movimientoId)
      batch.delete(movimientoRef)

      // Eliminar detalles
      const detalles = await firestoreService.getDetalleMovimientos(movimientoId)
      detalles.forEach(detalle => {
        const detalleRef = doc(db, 'detalle_movimientos', detalle.id)
        batch.delete(detalleRef)
      })

      await batch.commit()

      return { success: true, message: 'Movimiento eliminado exitosamente' }
    } catch (error) {
      console.error('Error eliminando movimiento:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== CONTEOS ==========

  getConteos: async (ubicacionId = null) => {
    try {
      const filters = [orderBy('fecha_creacion', 'desc')]

      if (ubicacionId) {
        filters.unshift(where('ubicacion_id', '==', ubicacionId))
      }

      return await firestoreService.queryWithFilters('conteos', filters)
    } catch (error) {
      console.error('Error obteniendo conteos:', error)
      throw error
    }
  },

  getDetalleConteos: async (conteoId = null) => {
    try {
      const filters = []

      if (conteoId) {
        filters.push(where('conteo_id', '==', conteoId))
      }

      return await firestoreService.queryWithFilters('detalle_conteos', filters)
    } catch (error) {
      console.error('Error obteniendo detalle conteos:', error)
      throw error
    }
  },

  createConteo: async (data) => {
    try {
      const db = getDB()
      const conteosRef = collection(db, 'conteos')

      // Generar código legible secuencial
      const codigoLegible = await getNextSequentialCode('CT')

      // Fecha documento: por defecto es la fecha de creación (solo fecha, sin hora)
      const ahora = new Date()
      const fechaDocumento = data.fecha_documento 
        ? Timestamp.fromDate(new Date(data.fecha_documento))
        : Timestamp.fromDate(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()))

      const nuevoConteo = {
        codigo_legible: codigoLegible,
        ubicacion_id: data.ubicacion_id,
        tipo_ubicacion: data.tipo_ubicacion,
        tipo_conteo: data.tipo_conteo,
        estado: 'PENDIENTE',
        usuario_responsable_id: data.usuario_responsable_id,
        usuario_ejecutor_id: null,
        fecha_creacion: serverTimestamp(),
        fecha_documento: fechaDocumento,
        fecha_inicio: null,
        fecha_completado: null,
        observaciones: data.observaciones || '',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      }

      const docRef = await addDoc(conteosRef, nuevoConteo)

      return {
        success: true,
        message: 'Conteo programado exitosamente',
        data: { id: docRef.id, ...nuevoConteo }
      }
    } catch (error) {
      console.error('Error creando conteo:', error)
      return { success: false, message: error.message }
    }
  },

  // Iniciar conteo (pasar de PENDIENTE a EN_PROGRESO)
  iniciarConteo: async (conteoId, usuarioId) => {
    try {
      const db = getDB()
      const conteoRef = doc(db, 'conteos', conteoId)
      await updateDoc(conteoRef, {
        estado: 'EN_PROGRESO',
        fecha_inicio: Timestamp.now(),
        usuario_ejecutor_id: usuarioId
      })
      return { success: true, message: 'Conteo iniciado' }
    } catch (error) {
      console.error('Error iniciando conteo:', error)
      return { success: false, message: error.message }
    }
  },

  ejecutarConteo: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      const conteoRef = doc(db, 'conteos', data.conteo_id)
      const conteoDoc = await getDoc(conteoRef)

      // ========== MODO EDICIÓN ==========
      if (data.es_edicion) {
        // Obtener el conteo actual para incrementar el contador de ediciones
        const conteoData = conteoDoc.exists() ? conteoDoc.data() : {}
        const edicionesActuales = conteoData.ediciones_count || 0

        // Verificar límite de 3 ediciones
        if (edicionesActuales >= 3) {
          return { success: false, message: 'Este conteo ya alcanzó el límite máximo de 3 ediciones' }
        }

        // Actualizar conteo con datos de edición (mantener estado original)
        const updateData = {
          fecha_edicion: serverTimestamp(),
          usuario_editor_id: data.usuario_ejecutor_id,
          ediciones_count: edicionesActuales + 1
        }
        batch.update(conteoRef, updateData)

        // Actualizar detalles existentes
        if (data.productos && data.productos.length > 0) {
          // Obtener detalles existentes
          const detallesExistentes = await firestoreService.getDetalleConteos(data.conteo_id)

          for (const prod of data.productos) {
            // Buscar el detalle existente para este producto
            const detalleExistente = detallesExistentes.find(d => d.producto_id === prod.producto_id)

            if (detalleExistente) {
              // Actualizar detalle existente
              const detalleRef = doc(db, 'detalle_conteos', detalleExistente.id)
              batch.update(detalleRef, {
                cantidad_fisica: prod.cantidad_fisica,
                diferencia: prod.cantidad_fisica - prod.cantidad_sistema,
                editado: true,
                fecha_edicion: serverTimestamp()
              })
            }

            // Actualizar inventario con las nuevas cantidades
            const inventarioExistente = await firestoreService.queryWithFilters('inventario', [
              where('producto_id', '==', prod.producto_id),
              where('ubicacion_id', '==', data.ubicacion_id)
            ])

            if (inventarioExistente.length > 0) {
              const invRef = doc(db, 'inventario', inventarioExistente[0].id)
              batch.update(invRef, {
                stock_actual: prod.cantidad_fisica,
                ultima_actualizacion: serverTimestamp()
              })
            }
          }
        }

        await batch.commit()

        // Verificar stock bajo después de edición
        try {
          if (data.productos && data.productos.length > 0) {
            for (const prod of data.productos) {
              await verificarStockBajo(prod.producto_id, data.ubicacion_id)
            }
          }
        } catch (stockError) {
          console.error('❌ Error verificando stock bajo (no afecta edición):', stockError)
        }

        return { success: true, message: 'Conteo editado exitosamente' }
      }

      // ========== MODO NORMAL (Completar conteo) ==========
      const estadoFinal = data.estado || 'COMPLETADO'

      const updateData = {
        estado: estadoFinal,
        fecha_completado: serverTimestamp(),
        usuario_ejecutor_id: data.usuario_ejecutor_id
      }
      // Si no tenía fecha_inicio, ponerla ahora
      if (conteoDoc.exists() && !conteoDoc.data().fecha_inicio) {
        updateData.fecha_inicio = serverTimestamp()
      }

      batch.update(conteoRef, updateData)

      // Guardar detalles del conteo
      if (data.productos && data.productos.length > 0) {
        data.productos.forEach(prod => {
          const detalleRef = doc(collection(db, 'detalle_conteos'))
          batch.set(detalleRef, {
            conteo_id: data.conteo_id,
            producto_id: prod.producto_id,
            cantidad_sistema: prod.cantidad_sistema,
            cantidad_fisica: prod.cantidad_fisica,
            diferencia: prod.cantidad_fisica - prod.cantidad_sistema,
            observaciones: prod.observaciones || '',
            contado: true
          })
        })

        // Actualizar inventario con los resultados del conteo
        for (const prod of data.productos) {
          const inventarioExistente = await firestoreService.queryWithFilters('inventario', [
            where('producto_id', '==', prod.producto_id),
            where('ubicacion_id', '==', data.ubicacion_id)
          ])

          if (inventarioExistente.length > 0) {
            const invRef = doc(db, 'inventario', inventarioExistente[0].id)
            batch.update(invRef, {
              stock_actual: prod.cantidad_fisica,
              ultima_actualizacion: serverTimestamp()
            })
          }
        }
      }

      await batch.commit()

      // ========== VERIFICAR STOCK BAJO DESPUÉS DE CONTEO ==========
      try {
        if (data.productos && data.productos.length > 0) {
          for (const prod of data.productos) {
            await verificarStockBajo(prod.producto_id, data.ubicacion_id)
          }
        }
      } catch (stockError) {
        console.error('❌ Error verificando stock bajo (no afecta conteo):', stockError)
      }

      return { success: true, message: 'Conteo ejecutado exitosamente' }
    } catch (error) {
      console.error('Error ejecutando conteo:', error)
      return { success: false, message: error.message }
    }
  },

  deleteDetalleConteo: async (detalleId) => {
    try {
      const db = getDB()
      const detalleRef = doc(db, 'detalle_conteos', detalleId)
      await deleteDoc(detalleRef)
      return { success: true, message: 'Producto eliminado del conteo' }
    } catch (error) {
      console.error('Error eliminando detalle conteo:', error)
      return { success: false, message: error.message }
    }
  },

  cancelarConteo: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      const conteoRef = doc(db, 'conteos', data.conteo_id)
      const conteoDoc = await getDoc(conteoRef)

      if (!conteoDoc.exists()) {
        return { success: false, message: 'Conteo no encontrado' }
      }

      const conteoData = conteoDoc.data()

      // Verificar que el conteo esté en estado PENDIENTE o EN_PROGRESO
      if (conteoData.estado !== 'PENDIENTE' && conteoData.estado !== 'EN_PROGRESO') {
        return { success: false, message: 'Solo se pueden cancelar conteos en estado PENDIENTE o EN_PROGRESO' }
      }

      // Actualizar el conteo a estado CANCELADO
      batch.update(conteoRef, {
        estado: 'CANCELADO',
        fecha_cancelacion: serverTimestamp(),
        usuario_cancelacion_id: data.usuario_cancelacion_id,
        motivo_cancelacion: data.motivo_cancelacion
      })

      // Si el conteo tiene detalles registrados, marcarlos como cancelados
      // pero NO afectar el inventario (según requerimiento)
      const detalles = await firestoreService.getDetalleConteos(data.conteo_id)
      if (detalles.length > 0) {
        detalles.forEach(detalle => {
          const detalleRef = doc(db, 'detalle_conteos', detalle.id)
          batch.update(detalleRef, {
            cancelado: true,
            fecha_cancelacion: serverTimestamp()
          })
        })
      }

      await batch.commit()

      return { success: true, message: 'Conteo cancelado exitosamente' }
    } catch (error) {
      console.error('❌ Error cancelando conteo:', error)
      throw new Error(error.message || 'Error al cancelar el conteo')
    }
  },

  deleteConteo: async (conteoId) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      // Eliminar conteo
      const conteoRef = doc(db, 'conteos', conteoId)
      batch.delete(conteoRef)

      // Eliminar detalles
      const detalles = await firestoreService.getDetalleConteos(conteoId)
      detalles.forEach(detalle => {
        const detalleRef = doc(db, 'detalle_conteos', detalle.id)
        batch.delete(detalleRef)
      })

      await batch.commit()

      return { success: true, message: 'Conteo eliminado exitosamente' }
    } catch (error) {
      console.error('Error eliminando conteo:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== ALERTAS ==========

  getAlertas: async (usuarioId = null) => {
    try {
      // Intentar query con filtros compuestos
      const filters = [orderBy('fecha_creacion', 'desc')]

      if (usuarioId) {
        filters.unshift(where('usuarios_notificados', 'array-contains', usuarioId))
      }

      return await firestoreService.queryWithFilters('alertas', filters)
    } catch (error) {
      // Si falta un índice compuesto, hacer fallback a getAll + filtro en memoria
      if (error?.message?.includes('index') || error?.code === 'failed-precondition') {
        console.warn('Alertas: Índice compuesto no disponible, usando fallback en memoria. Crea el índice en Firebase Console para mejor rendimiento.')
        try {
          let alertas = await firestoreService.getAll('alertas')

          if (usuarioId) {
            alertas = alertas.filter(a =>
              Array.isArray(a.usuarios_notificados) && a.usuarios_notificados.includes(usuarioId)
            )
          }

          // Ordenar en memoria por fecha_creacion descendente
          alertas.sort((a, b) => {
            const fechaA = a.fecha_creacion?.seconds ? a.fecha_creacion.seconds : (a.fecha_creacion ? new Date(a.fecha_creacion).getTime() / 1000 : 0)
            const fechaB = b.fecha_creacion?.seconds ? b.fecha_creacion.seconds : (b.fecha_creacion ? new Date(b.fecha_creacion).getTime() / 1000 : 0)
            return fechaB - fechaA
          })

          return alertas
        } catch (fallbackError) {
          console.error('Error en fallback de alertas:', fallbackError)
          return []
        }
      }
      console.error('Error obteniendo alertas:', error)
      return []
    }
  },

  // ========== AUDIT LOGS (Logs de Auditoría) ==========

  createAuditLog: async (data) => {
    try {
      const db = getDB()
      const auditLogRef = collection(db, 'audit_logs')

      const nuevoLog = {
        usuario_id: data.usuario_id,
        accion: data.accion, // CREATE, UPDATE, DELETE, LOGIN, LOGOUT
        entidad: data.entidad, // PRODUCTO, MOVIMIENTO, CONTEO, etc.
        entidad_id: data.entidad_id,
        valores_anteriores: data.valores_anteriores || null,
        valores_nuevos: data.valores_nuevos || null,
        ip_address: data.ip_address || null,
        dispositivo: data.dispositivo || navigator.userAgent,
        resultado: data.resultado || 'SUCCESS', // SUCCESS, ERROR, BLOCKED
        timestamp: serverTimestamp()
      }

      const docRef = await addDoc(auditLogRef, nuevoLog)

      return {
        success: true,
        message: 'Log de auditoría creado',
        data: { id: docRef.id, ...nuevoLog }
      }
    } catch (error) {
      console.error('Error creando audit log:', error)
      return { success: false, message: error.message }
    }
  },

  getAuditLogs: async (filters = {}) => {
    try {
      const queryFilters = [orderBy('timestamp', 'desc')]

      if (filters.usuario_id) {
        queryFilters.unshift(where('usuario_id', '==', filters.usuario_id))
      }
      if (filters.entidad) {
        queryFilters.unshift(where('entidad', '==', filters.entidad))
      }
      if (filters.entidad_id) {
        queryFilters.unshift(where('entidad_id', '==', filters.entidad_id))
      }

      return await firestoreService.queryWithFilters('audit_logs', queryFilters)
    } catch (error) {
      console.error('Error obteniendo audit logs:', error)
      throw error
    }
  },

  // ========== AJUSTES DE INVENTARIO ==========

  createAjusteInventario: async (data) => {
    try {
      const db = getDB()
      const ajustesRef = collection(db, 'ajustes_inventario')

      const nuevoAjuste = {
        producto_id: data.producto_id,
        ubicacion_id: data.ubicacion_id,
        cantidad_anterior: data.cantidad_anterior,
        cantidad_nueva: data.cantidad_nueva,
        diferencia: data.cantidad_nueva - data.cantidad_anterior,
        tipo_ajuste: data.tipo_ajuste, // MERMA, ROBO, CORRECCION, DEVOLUCION, DAÑADO
        motivo: data.motivo,
        usuario_id: data.usuario_id,
        aprobado_por: null,
        requiere_aprobacion: data.requiere_aprobacion || false,
        estado: data.requiere_aprobacion ? 'PENDIENTE' : 'APROBADO',
        fecha_ajuste: serverTimestamp(),
        fecha_aprobacion: null,
        observaciones: data.observaciones || '',
        archivos_adjuntos: data.archivos_adjuntos || []
      }

      const docRef = await addDoc(ajustesRef, nuevoAjuste)

      // Si no requiere aprobación, actualizar inventario inmediatamente
      if (!data.requiere_aprobacion) {
        await firestoreService.ajustarInventario(
          data.ubicacion_id,
          data.producto_id,
          data.cantidad_nueva
        )
      }

      return {
        success: true,
        message: 'Ajuste de inventario registrado',
        data: { id: docRef.id, ...nuevoAjuste }
      }
    } catch (error) {
      console.error('Error creando ajuste de inventario:', error)
      return { success: false, message: error.message }
    }
  },

  aprobarAjusteInventario: async (ajusteId, aprobadorId) => {
    try {
      const db = getDB()
      const ajusteRef = doc(db, 'ajustes_inventario', ajusteId)

      // Obtener datos del ajuste
      const ajusteDoc = await getDoc(ajusteRef)
      if (!ajusteDoc.exists()) {
        return { success: false, message: 'Ajuste no encontrado' }
      }

      const ajuste = ajusteDoc.data()

      // Actualizar estado del ajuste
      await updateDoc(ajusteRef, {
        estado: 'APROBADO',
        aprobado_por: aprobadorId,
        fecha_aprobacion: serverTimestamp()
      })

      // Actualizar inventario
      await firestoreService.ajustarInventario(
        ajuste.ubicacion_id,
        ajuste.producto_id,
        ajuste.cantidad_nueva
      )

      return { success: true, message: 'Ajuste aprobado y aplicado al inventario' }
    } catch (error) {
      console.error('Error aprobando ajuste:', error)
      return { success: false, message: error.message }
    }
  },

  rechazarAjusteInventario: async (ajusteId, aprobadorId, motivo) => {
    try {
      const db = getDB()
      const ajusteRef = doc(db, 'ajustes_inventario', ajusteId)

      await updateDoc(ajusteRef, {
        estado: 'RECHAZADO',
        aprobado_por: aprobadorId,
        fecha_aprobacion: serverTimestamp(),
        observaciones_rechazo: motivo
      })

      return { success: true, message: 'Ajuste rechazado' }
    } catch (error) {
      console.error('Error rechazando ajuste:', error)
      return { success: false, message: error.message }
    }
  },

  getAjustesInventario: async (filters = {}) => {
    try {
      const queryFilters = [orderBy('fecha_ajuste', 'desc')]

      if (filters.producto_id) {
        queryFilters.unshift(where('producto_id', '==', filters.producto_id))
      }
      if (filters.ubicacion_id) {
        queryFilters.unshift(where('ubicacion_id', '==', filters.ubicacion_id))
      }
      if (filters.estado) {
        queryFilters.unshift(where('estado', '==', filters.estado))
      }

      return await firestoreService.queryWithFilters('ajustes_inventario', queryFilters)
    } catch (error) {
      console.error('Error obteniendo ajustes de inventario:', error)
      throw error
    }
  },

  // ========== CONFIGURACIONES DE USUARIO ==========

  getConfiguracionUsuario: async (usuarioId) => {
    try {
      const config = await firestoreService.getById('configuraciones_usuario', usuarioId)

      // Si no existe configuración, devolver valores por defecto
      if (!config) {
        return {
          usuario_id: usuarioId,
          tema: 'light',
          idioma: 'es',
          notificaciones_email: true,
          notificaciones_push: true,
          notificaciones_sonido: false,
          vista_predeterminada: 'dashboard',
          items_por_pagina: 25,
          formato_fecha: 'DD/MM/YYYY',
          formato_hora: '24h',
          zona_horaria: 'America/Bogota',
          ubicacion_favorita: null
        }
      }

      return config
    } catch (error) {
      console.error('Error obteniendo configuración de usuario:', error)
      throw error
    }
  },

  updateConfiguracionUsuario: async (usuarioId, configuraciones) => {
    try {
      const db = getDB()
      const configRef = doc(db, 'configuraciones_usuario', usuarioId)

      // Verificar si existe
      const configDoc = await getDoc(configRef)

      const datosConfiguracion = {
        ...configuraciones,
        usuario_id: usuarioId,
        updated_at: serverTimestamp()
      }

      if (configDoc.exists()) {
        // Actualizar
        await updateDoc(configRef, datosConfiguracion)
      } else {
        // Crear nuevo documento con ID personalizado
        const batch = writeBatch(db)
        batch.set(configRef, datosConfiguracion)
        await batch.commit()
      }

      return {
        success: true,
        message: 'Configuración actualizada exitosamente',
        data: datosConfiguracion
      }
    } catch (error) {
      console.error('Error actualizando configuración de usuario:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== CONFIGURACIONES DEL SISTEMA ==========

  getConfiguracionSistema: async (configId) => {
    try {
      return await firestoreService.getById('configuraciones_sistema', configId)
    } catch (error) {
      console.error('Error obteniendo configuración del sistema:', error)
      throw error
    }
  },

  getAllConfiguracionesSistema: async () => {
    try {
      return await firestoreService.getAll('configuraciones_sistema')
    } catch (error) {
      console.error('Error obteniendo todas las configuraciones del sistema:', error)
      throw error
    }
  },

  updateConfiguracionSistema: async (configId, valor, usuarioId) => {
    try {
      const db = getDB()
      const configRef = doc(db, 'configuraciones_sistema', configId)

      await updateDoc(configRef, {
        valor: valor,
        updated_at: serverTimestamp(),
        updated_by: usuarioId
      })

      return {
        success: true,
        message: 'Configuración del sistema actualizada'
      }
    } catch (error) {
      console.error('Error actualizando configuración del sistema:', error)
      return { success: false, message: error.message }
    }
  },

  createConfiguracionSistema: async (data) => {
    try {
      const db = getDB()
      const configRef = doc(db, 'configuraciones_sistema', data.id)

      const nuevaConfig = {
        categoria: data.categoria,
        nombre: data.nombre,
        valor: data.valor,
        tipo_dato: data.tipo_dato,
        descripcion: data.descripcion || '',
        editable_por_admin: data.editable_por_admin !== false,
        requiere_reinicio: data.requiere_reinicio || false,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        updated_by: data.usuario_id
      }

      const batch = writeBatch(db)
      batch.set(configRef, nuevaConfig)
      await batch.commit()

      return {
        success: true,
        message: 'Configuración creada exitosamente',
        data: { id: data.id, ...nuevaConfig }
      }
    } catch (error) {
      console.error('Error creando configuración del sistema:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== TICKETS DE SOPORTE ==========

  getTicketsSoporte: async (usuarioId = null) => {
    try {
      const queryFilters = [orderBy('fecha_creacion', 'desc')]

      if (usuarioId) {
        queryFilters.unshift(where('usuario_id', '==', usuarioId))
      }

      return await firestoreService.queryWithFilters('tickets_soporte', queryFilters)
    } catch (error) {
      console.error('Error obteniendo tickets de soporte:', error)
      throw error
    }
  },

  createTicketSoporte: async (data) => {
    try {
      const db = getDB()
      const ticketsRef = collection(db, 'tickets_soporte')

      // Generar número de ticket
      const allTickets = await getDocs(ticketsRef)
      const ticketNumero = `TKT-${String(allTickets.size + 1).padStart(4, '0')}`

      const nuevoTicket = {
        ticket_numero: ticketNumero,
        usuario_id: data.usuario_id,
        asunto: data.asunto,
        descripcion: data.descripcion,
        categoria: data.categoria || 'CONSULTA', // TECNICO, FUNCIONAL, CONSULTA, ERROR
        prioridad: data.prioridad || 'MEDIA', // BAJA, MEDIA, ALTA, CRITICA
        estado: 'ABIERTO', // ABIERTO, EN_PROGRESO, RESUELTO, CERRADO
        asignado_a: null,
        archivos_adjuntos: data.archivos_adjuntos || [],
        fecha_creacion: serverTimestamp(),
        fecha_actualizacion: serverTimestamp(),
        fecha_resolucion: null,
        resolucion: '',
        satisfaccion: null
      }

      const docRef = await addDoc(ticketsRef, nuevoTicket)

      return {
        success: true,
        message: `Ticket ${ticketNumero} creado exitosamente`,
        data: { id: docRef.id, ...nuevoTicket }
      }
    } catch (error) {
      console.error('Error creando ticket de soporte:', error)
      return { success: false, message: error.message }
    }
  },

  updateTicketSoporte: async (ticketId, data) => {
    try {
      const db = getDB()
      const ticketRef = doc(db, 'tickets_soporte', ticketId)

      const actualizacion = {
        ...data,
        fecha_actualizacion: serverTimestamp()
      }

      // Si se está resolviendo, agregar fecha de resolución
      if (data.estado === 'RESUELTO' || data.estado === 'CERRADO') {
        actualizacion.fecha_resolucion = serverTimestamp()
      }

      await updateDoc(ticketRef, actualizacion)

      return {
        success: true,
        message: 'Ticket actualizado exitosamente'
      }
    } catch (error) {
      console.error('Error actualizando ticket de soporte:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== BENEFICIARIOS ==========

  getBeneficiarios: async () => {
    return await firestoreService.getAll('beneficiarios')
  },

  createBeneficiario: async (data) => {
    try {
      const db = getDB()
      const ref = collection(db, 'beneficiarios')
      const docRef = await addDoc(ref, {
        ...data,
        estado: data.estado || 'ACTIVO',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      })
      return { id: docRef.id, ...data }
    } catch (error) {
      console.error('Error creando beneficiario:', error)
      throw error
    }
  },

  updateBeneficiario: async (id, data) => {
    try {
      const db = getDB()
      await updateDoc(doc(db, 'beneficiarios', id), { ...data, updated_at: serverTimestamp() })
      return { id, ...data }
    } catch (error) {
      console.error('Error actualizando beneficiario:', error)
      throw error
    }
  },

  deleteBeneficiario: async (id) => {
    try {
      const db = getDB()
      await updateDoc(doc(db, 'beneficiarios', id), { estado: 'INACTIVO', updated_at: serverTimestamp() })
      return { success: true }
    } catch (error) {
      console.error('Error desactivando beneficiario:', error)
      throw error
    }
  },

  // ========== CAUSAS DE MERMA ==========

  getCausasMerma: async () => {
    return await firestoreService.getAll('causas_merma')
  },

  createCausaMerma: async (data) => {
    try {
      const db = getDB()
      const ref = collection(db, 'causas_merma')
      const docRef = await addDoc(ref, {
        ...data,
        estado: data.estado || 'ACTIVO',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      })
      return { id: docRef.id, ...data }
    } catch (error) {
      console.error('Error creando causa de merma:', error)
      throw error
    }
  },

  updateCausaMerma: async (id, data) => {
    try {
      const db = getDB()
      await updateDoc(doc(db, 'causas_merma', id), { ...data, updated_at: serverTimestamp() })
      return { id, ...data }
    } catch (error) {
      console.error('Error actualizando causa de merma:', error)
      throw error
    }
  },

  deleteCausaMerma: async (id) => {
    try {
      const db = getDB()
      await updateDoc(doc(db, 'causas_merma', id), { estado: 'INACTIVO', updated_at: serverTimestamp() })
      return { success: true }
    } catch (error) {
      console.error('Error desactivando causa de merma:', error)
      throw error
    }
  },

  // ========== VENTAS ==========

  getVentas: async () => {
    try {
      return await firestoreService.queryWithFilters('ventas', [orderBy('fecha_creacion', 'desc')])
    } catch (error) {
      console.error('Error obteniendo ventas:', error)
      return await firestoreService.getAll('ventas')
    }
  },

  createVenta: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)
      const codigoLegible = await getNextSequentialCode('VT')

      // Fecha documento: por defecto es la fecha de creación (solo fecha, sin hora)
      const ahora = new Date()
      const fechaDocumento = data.fecha_documento 
        ? Timestamp.fromDate(new Date(data.fecha_documento))
        : Timestamp.fromDate(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()))

      const ventaRef = doc(collection(db, 'ventas'))
      const nuevaVenta = {
        codigo_legible: codigoLegible,
        tipo_movimiento: 'VENTA',
        origen_id: data.origen_id,
        beneficiario_id: data.beneficiario_id,
        beneficiario_nombre: data.beneficiario_nombre || '',
        estado: 'COMPLETADO',
        usuario_creacion_id: data.usuario_creacion_id,
        fecha_creacion: Timestamp.now(),
        fecha_documento: fechaDocumento,
        observaciones: data.observaciones || ''
      }
      batch.set(ventaRef, nuevaVenta)

      // Crear detalles y actualizar inventario
      if (data.productos && data.productos.length > 0) {
        for (const prod of data.productos) {
          const detalleRef = doc(collection(db, 'detalle_ventas'))
          batch.set(detalleRef, {
            venta_id: ventaRef.id,
            producto_id: prod.producto_id,
            cantidad: prod.cantidad,
            cantidad_original: prod.cantidad_original || null,
            unidad_original_id: prod.unidad_original_id || null,
            observaciones: prod.observaciones || ''
          })

          // Reducir stock en origen
          const inventarioOrigen = await firestoreService.queryWithFilters('inventario', [
            where('producto_id', '==', prod.producto_id),
            where('ubicacion_id', '==', data.origen_id)
          ])
          if (inventarioOrigen.length > 0) {
            const invRef = doc(db, 'inventario', inventarioOrigen[0].id)
            batch.update(invRef, {
              stock_actual: inventarioOrigen[0].stock_actual - prod.cantidad,
              ultima_actualizacion: serverTimestamp()
            })
          }
        }
      }

      await batch.commit()
      return { success: true, message: 'Venta registrada exitosamente', data: { id: ventaRef.id, ...nuevaVenta } }
    } catch (error) {
      console.error('Error creando venta:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== MERMAS ==========

  getMermas: async () => {
    try {
      return await firestoreService.queryWithFilters('mermas', [orderBy('fecha_creacion', 'desc')])
    } catch (error) {
      console.error('Error obteniendo mermas:', error)
      return await firestoreService.getAll('mermas')
    }
  },

  createMerma: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)
      const codigoLegible = await getNextSequentialCode('MR')

      // Fecha documento: por defecto es la fecha de creación (solo fecha, sin hora)
      const ahora = new Date()
      const fechaDocumento = data.fecha_documento 
        ? Timestamp.fromDate(new Date(data.fecha_documento))
        : Timestamp.fromDate(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()))

      const mermaRef = doc(collection(db, 'mermas'))
      const nuevaMerma = {
        codigo_legible: codigoLegible,
        tipo_movimiento: 'MERMA',
        origen_id: data.origen_id,
        causa_merma_id: data.causa_merma_id,
        causa_merma_nombre: data.causa_merma_nombre || '',
        estado: 'COMPLETADO',
        usuario_creacion_id: data.usuario_creacion_id,
        fecha_creacion: Timestamp.now(),
        fecha_documento: fechaDocumento,
        observaciones: data.observaciones || ''
      }
      batch.set(mermaRef, nuevaMerma)

      // Crear detalles y actualizar inventario
      if (data.productos && data.productos.length > 0) {
        for (const prod of data.productos) {
          const detalleRef = doc(collection(db, 'detalle_mermas'))
          batch.set(detalleRef, {
            merma_id: mermaRef.id,
            producto_id: prod.producto_id,
            cantidad: prod.cantidad,
            cantidad_original: prod.cantidad_original || null,
            unidad_original_id: prod.unidad_original_id || null,
            observaciones: prod.observaciones || ''
          })

          // Reducir stock en origen
          const inventarioOrigen = await firestoreService.queryWithFilters('inventario', [
            where('producto_id', '==', prod.producto_id),
            where('ubicacion_id', '==', data.origen_id)
          ])
          if (inventarioOrigen.length > 0) {
            const invRef = doc(db, 'inventario', inventarioOrigen[0].id)
            batch.update(invRef, {
              stock_actual: inventarioOrigen[0].stock_actual - prod.cantidad,
              ultima_actualizacion: serverTimestamp()
            })
          }
        }
      }

      await batch.commit()
      return { success: true, message: 'Merma registrada exitosamente', data: { id: mermaRef.id, ...nuevaMerma } }
    } catch (error) {
      console.error('Error creando merma:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== BENEFICIARIOS ==========
  getBeneficiarios: async () => {
    try {
      return await firestoreService.queryWithFilters('beneficiarios', [orderBy('nombre', 'asc')])
    } catch (error) {
      console.error('Error obteniendo beneficiarios:', error)
      return await firestoreService.getAll('beneficiarios')
    }
  },

  createBeneficiario: async (data) => {
    const db = getDB()
    const beneficiarioRef = doc(collection(db, 'beneficiarios'))
    const nuevoBeneficiario = {
      nombre: data.nombre,
      identificacion: data.identificacion,
      telefono: data.telefono || '',
      direccion: data.direccion || '',
      poblado: data.poblado || '',
      fecha_creacion: serverTimestamp(),
      estado: 'ACTIVO'
    }
    await setDoc(beneficiarioRef, nuevoBeneficiario)
    return { id: beneficiarioRef.id, ...nuevoBeneficiario }
  },

  updateBeneficiario: async (id, data) => {
    const db = getDB()
    const beneficiarioRef = doc(db, 'beneficiarios', id)
    await updateDoc(beneficiarioRef, {
      ...data,
      ultima_actualizacion: serverTimestamp()
    })
    return { id, ...data }
  },

  deleteBeneficiario: async (id) => {
    const db = getDB()
    const beneficiarioRef = doc(db, 'beneficiarios', id)
    await updateDoc(beneficiarioRef, { estado: 'INACTIVO' })
    return { id }
  },

  // ========== RAZONES DE MERMA ==========
  getRazonesMerma: async () => {
    try {
      return await firestoreService.queryWithFilters('razones_merma', [orderBy('nombre', 'asc')])
    } catch (error) {
      console.error('Error obteniendo razones de merma:', error)
      return await firestoreService.getAll('razones_merma')
    }
  },

  createRazonMerma: async (data) => {
    const db = getDB()
    const razonRef = doc(collection(db, 'razones_merma'))
    const nuevaRazon = {
      nombre: data.nombre,
      descripcion: data.descripcion || '',
      fecha_creacion: serverTimestamp(),
      estado: 'ACTIVO'
    }
    await setDoc(razonRef, nuevaRazon)
    return { id: razonRef.id, ...nuevaRazon }
  },

  updateRazonMerma: async (id, data) => {
    const db = getDB()
    const razonRef = doc(db, 'razones_merma', id)
    await updateDoc(razonRef, {
      ...data,
      ultima_actualizacion: serverTimestamp()
    })
    return { id, ...data }
  },

  deleteRazonMerma: async (id) => {
    const db = getDB()
    const razonRef = doc(db, 'razones_merma', id)
    await updateDoc(razonRef, { estado: 'INACTIVO' })
    return { id }
  },

  // ========== SOLICITUDES DE TRANSFERENCIA ==========

  getSolicitudes: async (filtros = {}) => {
    try {
      let solicitudes = await firestoreService.getAll('solicitudes')

      // Filtrar por usuario creador si se especifica
      if (filtros.usuario_creacion_id) {
        solicitudes = solicitudes.filter(s => s.usuario_creacion_id === filtros.usuario_creacion_id)
      }

      // Filtrar por ubicación origen (para recepciones)
      if (filtros.ubicacion_origen_id) {
        solicitudes = solicitudes.filter(s => s.ubicacion_origen_id === filtros.ubicacion_origen_id)
      }

      // Filtrar por estado
      if (filtros.estado) {
        solicitudes = solicitudes.filter(s => s.estado === filtros.estado)
      }

      // Ordenar por fecha de creación descendente
      solicitudes.sort((a, b) => {
        const fechaA = a.fecha_creacion?.seconds || a.fecha_creacion || 0
        const fechaB = b.fecha_creacion?.seconds || b.fecha_creacion || 0
        return fechaB - fechaA
      })

      return solicitudes
    } catch (error) {
      console.error('Error obteniendo solicitudes:', error)
      return []
    }
  },

  getDetalleSolicitudes: async (solicitudId) => {
    try {
      if (!solicitudId) {
        return await firestoreService.getAll('detalle_solicitudes')
      }
      return await firestoreService.queryWithFilters('detalle_solicitudes', [
        where('solicitud_id', '==', solicitudId)
      ])
    } catch (error) {
      console.error('Error obteniendo detalle solicitudes:', error)
      return []
    }
  },

  createSolicitud: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      // Generar código legible secuencial RM0001
      const codigoLegible = await getNextSequentialCode('RM')

      // Crear solicitud
      const solicitudRef = doc(collection(db, 'solicitudes'))
      const nuevaSolicitud = {
        codigo_legible: codigoLegible,
        ubicacion_origen_id: data.ubicacion_origen_id,
        ubicacion_destino_id: data.ubicacion_destino_id,
        estado: 'iniciada',
        usuario_creacion_id: data.usuario_creacion_id,
        usuario_confirmacion_id: null,
        fecha_creacion: Timestamp.now(),
        fecha_envio: null,
        fecha_procesamiento: null,
        observaciones_creacion: data.observaciones || '',
        observaciones_procesamiento: '',
        salida_id: null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      }

      batch.set(solicitudRef, nuevaSolicitud)

      // Crear detalles de la solicitud
      if (data.productos && data.productos.length > 0) {
        data.productos.forEach(prod => {
          const detalleRef = doc(collection(db, 'detalle_solicitudes'))
          batch.set(detalleRef, {
            solicitud_id: solicitudRef.id,
            producto_id: prod.producto_id,
            cantidad_solicitada: prod.cantidad,
            cantidad_aprobada: null,
            observaciones: prod.observaciones || ''
          })
        })
      }

      await batch.commit()

      return {
        success: true,
        message: 'Solicitud creada exitosamente',
        data: { id: solicitudRef.id, ...nuevaSolicitud }
      }
    } catch (error) {
      console.error('Error creando solicitud:', error)
      return { success: false, message: error.message }
    }
  },

  updateSolicitud: async (solicitudId, data) => {
    try {
      const db = getDB()

      // Verificar que la solicitud esté en estado 'iniciada'
      const solicitudActual = await firestoreService.getById('solicitudes', solicitudId)
      if (!solicitudActual) {
        return { success: false, message: 'Solicitud no encontrada' }
      }
      if (solicitudActual.estado !== 'iniciada') {
        return { success: false, message: 'Solo se pueden editar solicitudes en estado iniciada' }
      }

      const batch = writeBatch(db)

      // Actualizar solicitud
      const solicitudRef = doc(db, 'solicitudes', solicitudId)
      batch.update(solicitudRef, {
        ubicacion_origen_id: data.ubicacion_origen_id,
        ubicacion_destino_id: data.ubicacion_destino_id,
        observaciones_creacion: data.observaciones || '',
        updated_at: serverTimestamp()
      })

      // Eliminar detalles existentes
      const detallesActuales = await firestoreService.getDetalleSolicitudes(solicitudId)
      detallesActuales.forEach(detalle => {
        const detalleRef = doc(db, 'detalle_solicitudes', detalle.id)
        batch.delete(detalleRef)
      })

      // Crear nuevos detalles
      if (data.productos && data.productos.length > 0) {
        data.productos.forEach(prod => {
          const detalleRef = doc(collection(db, 'detalle_solicitudes'))
          batch.set(detalleRef, {
            solicitud_id: solicitudId,
            producto_id: prod.producto_id,
            cantidad_solicitada: prod.cantidad,
            cantidad_aprobada: null,
            observaciones: prod.observaciones || ''
          })
        })
      }

      await batch.commit()

      return {
        success: true,
        message: 'Solicitud actualizada exitosamente'
      }
    } catch (error) {
      console.error('Error actualizando solicitud:', error)
      return { success: false, message: error.message }
    }
  },

  enviarSolicitud: async (solicitudId, usuarioId) => {
    try {
      const db = getDB()

      // Verificar que la solicitud esté en estado 'iniciada'
      const solicitud = await firestoreService.getById('solicitudes', solicitudId)
      if (!solicitud) {
        return { success: false, message: 'Solicitud no encontrada' }
      }
      if (solicitud.estado !== 'iniciada') {
        return { success: false, message: 'Solo se pueden enviar solicitudes en estado iniciada' }
      }

      // Verificar que tenga productos
      const detalles = await firestoreService.getDetalleSolicitudes(solicitudId)
      if (detalles.length === 0) {
        return { success: false, message: 'La solicitud debe tener al menos un producto' }
      }

      const solicitudRef = doc(db, 'solicitudes', solicitudId)
      await updateDoc(solicitudRef, {
        estado: 'enviada',
        fecha_envio: Timestamp.now(),
        updated_at: serverTimestamp()
      })

      return {
        success: true,
        message: 'Solicitud enviada exitosamente',
        data: { ...solicitud, estado: 'enviada' }
      }
    } catch (error) {
      console.error('Error enviando solicitud:', error)
      return { success: false, message: error.message }
    }
  },

  procesarSolicitud: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      // Validar datos requeridos
      
      if (!data.solicitud_id) {
        return { success: false, message: 'ID de solicitud es requerido' }
      }
      if (!data.usuario_procesamiento_id) {
        console.error('🔄 Error: usuario_procesamiento_id es undefined o null')
        return { success: false, message: 'ID de usuario que procesa es requerido' }
      }

      // Obtener la solicitud
      const solicitud = await firestoreService.getById('solicitudes', data.solicitud_id)
      if (!solicitud) {
        return { success: false, message: 'Solicitud no encontrada' }
      }
      if (solicitud.estado !== 'enviada' && solicitud.estado !== 'recibida') {
        return { success: false, message: 'Solo se pueden procesar solicitudes enviadas o recibidas' }
      }

      // Generar código legible para el movimiento
      const codigoMovimiento = await getNextSequentialCode('MV')

      // Crear movimiento de TRANSFERENCIA (invirtiendo origen/destino según lógica de solicitud)
      // En solicitud: ubicacion_origen = desde donde despachan, ubicacion_destino = donde llega
      // En movimiento: origen = ubicacion_origen de solicitud, destino = ubicacion_destino de solicitud
      const movimientoRef = doc(collection(db, 'movimientos'))
      const nuevoMovimiento = {
        codigo_legible: codigoMovimiento,
        tipo_movimiento: 'TRANSFERENCIA',
        origen_id: solicitud.ubicacion_origen_id,
        destino_id: solicitud.ubicacion_destino_id,
        estado: 'PENDIENTE',
        usuario_creacion_id: data.usuario_procesamiento_id,
        usuario_confirmacion_id: null,
        fecha_creacion: Timestamp.now(),
        fecha_confirmacion: null,
        observaciones_creacion: data.observaciones || `Generado desde solicitud ${solicitud.codigo_legible}`,
        observaciones_confirmacion: '',
        solicitud_id: data.solicitud_id // Referencia a la solicitud original
      }

      batch.set(movimientoRef, nuevoMovimiento)

      // Crear detalles del movimiento con las cantidades aprobadas
      if (data.productos_aprobados && data.productos_aprobados.length > 0) {
        data.productos_aprobados.forEach(prod => {
          const detalleRef = doc(collection(db, 'detalle_movimientos'))
          batch.set(detalleRef, {
            movimiento_id: movimientoRef.id,
            producto_id: prod.producto_id,
            cantidad: prod.cantidad_aprobada,
            cantidad_enviada: prod.cantidad_aprobada,
            cantidad_recibida: null,
            observaciones: prod.observaciones || ''
          })
        })
      }

      // Actualizar detalles de la solicitud con cantidades aprobadas
      if (data.productos_aprobados && data.productos_aprobados.length > 0) {
        for (const prod of data.productos_aprobados) {
          if (prod.detalle_id) {
            const detalleRef = doc(db, 'detalle_solicitudes', prod.detalle_id)
            batch.update(detalleRef, {
              cantidad_aprobada: prod.cantidad_aprobada
            })
          }
        }
      }

      // Actualizar solicitud como procesada
      const solicitudRefForBatch = doc(db, 'solicitudes', data.solicitud_id)
      const updateData = {
        estado: 'procesada',
        fecha_procesamiento: Timestamp.now(),
        usuario_confirmacion_id: data.usuario_procesamiento_id,
        observaciones_procesamiento: data.observaciones || '',
        salida_id: movimientoRef.id,
        codigo_salida: codigoMovimiento, // Agregar código del movimiento
        updated_at: serverTimestamp()
      }
      
            
      batch.update(solicitudRefForBatch, updateData)

      await batch.commit()

            
      // Obtener el documento del movimiento recién creado para obtener su código
      const movimientoCreado = await getDoc(movimientoRef)
      const movimientoData = movimientoCreado.data()
      const codigoMovimientoReal = movimientoData?.codigo_legible || codigoMovimiento
      
            
      // Actualizar solicitud con el código real del movimiento
      const solicitudRefForUpdate = doc(db, 'solicitudes', data.solicitud_id)
      await updateDoc(solicitudRefForUpdate, {
        codigo_salida: codigoMovimientoReal
      })
      
      // Verificación final
      const solicitudActualizada = await firestoreService.getById('solicitudes', data.solicitud_id)
      
      return {
        success: true,
        message: 'Solicitud procesada y salida creada exitosamente',
        data: {
          solicitud_id: data.solicitud_id,
          movimiento_id: movimientoRef.id,
          codigo_movimiento: codigoMovimiento
        }
      }
    } catch (error) {
      console.error('Error procesando solicitud:', error)
      return { success: false, message: error.message }
    }
  },

  cancelarSolicitud: async (solicitudId, usuarioId, motivo) => {
    try {
      const db = getDB()

      const solicitud = await firestoreService.getById('solicitudes', solicitudId)
      if (!solicitud) {
        return { success: false, message: 'Solicitud no encontrada' }
      }
      if (solicitud.estado === 'procesada') {
        return { success: false, message: 'No se pueden cancelar solicitudes ya procesadas' }
      }

      const solicitudRef = doc(db, 'solicitudes', solicitudId)
      await updateDoc(solicitudRef, {
        estado: 'cancelada',
        fecha_cancelacion: Timestamp.now(),
        usuario_cancelacion_id: usuarioId,
        motivo_cancelacion: motivo || '',
        updated_at: serverTimestamp()
      })

      return {
        success: true,
        message: 'Solicitud cancelada exitosamente'
      }
    } catch (error) {
      console.error('Error cancelando solicitud:', error)
      return { success: false, message: error.message }
    }
  },

  deleteSolicitud: async (solicitudId) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      // Eliminar solicitud
      const solicitudRef = doc(db, 'solicitudes', solicitudId)
      batch.delete(solicitudRef)

      // Eliminar detalles
      const detalles = await firestoreService.getDetalleSolicitudes(solicitudId)
      detalles.forEach(detalle => {
        const detalleRef = doc(db, 'detalle_solicitudes', detalle.id)
        batch.delete(detalleRef)
      })

      await batch.commit()

      return { success: true, message: 'Solicitud eliminada exitosamente' }
    } catch (error) {
      console.error('Error eliminando solicitud:', error)
      return { success: false, message: error.message }
    }
  },

  // Función para actualizar solicitudes procesadas que no tienen codigo_salida
  actualizarSolicitudesProcesadasSinCodigo: async () => {
    try {
      const db = getDB()
      
      // Obtener todas las solicitudes procesadas
      const solicitudesRef = collection(db, 'solicitudes')
      const q = query(solicitudesRef, where('estado', '==', 'procesada'))
      const snapshot = await getDocs(q)
      
      const solicitudesParaActualizar = []
      
      for (const docSnap of snapshot.docs) {
        const solicitud = docSnap.data()
        if (solicitud.salida_id && !solicitud.codigo_salida) {
          
          // Obtener el movimiento para obtener su código
          try {
            const movimientoRef = doc(db, 'movimientos', solicitud.salida_id)
            const movimientoSnap = await getDoc(movimientoRef)
            const movimiento = movimientoSnap.data()
            
            if (movimiento && movimiento.codigo_legible) {
              solicitudesParaActualizar.push({
                solicitudId: docSnap.id,
                codigo_salida: movimiento.codigo_legible
              })
                          }
          } catch (error) {
            console.error('Error obteniendo movimiento:', error)
          }
        }
      }
      
      // Actualizar las solicitudes encontradas
      if (solicitudesParaActualizar.length > 0) {
                
        for (const { solicitudId, codigo_salida } of solicitudesParaActualizar) {
          const solicitudRef = doc(db, 'solicitudes', solicitudId)
          await updateDoc(solicitudRef, { codigo_salida })
        }
        
      } else {
      }
      
      return {
        success: true,
        actualizadas: solicitudesParaActualizar.length
      }
      
    } catch (error) {
      console.error('Error actualizando solicitudes:', error)
      return {
        success: false,
        error: error.message
      }
    }
  },

  cancelarSolicitud: async (solicitudId, usuarioId, motivo) => {
    try {
      const db = getDB()

      const solicitud = await firestoreService.getById('solicitudes', solicitudId)
      if (!solicitud) {
        return { success: false, message: 'Solicitud no encontrada' }
      }
      if (solicitud.estado === 'procesada') {
        return { success: false, message: 'No se pueden cancelar solicitudes ya procesadas' }
      }

      const solicitudRef = doc(db, 'solicitudes', solicitudId)
      await updateDoc(solicitudRef, {
        estado: 'cancelada',
        fecha_cancelacion: Timestamp.now(),
        usuario_cancelacion_id: usuarioId,
        motivo_cancelacion: motivo || '',
        updated_at: serverTimestamp()
      })

      return {
        success: true,
        message: 'Solicitud cancelada exitosamente'
      }
    } catch (error) {
      console.error('Error cancelando solicitud:', error)
      return { success: false, message: error.message }
    }
  },

  deleteSolicitud: async (solicitudId) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      // Eliminar solicitud
      const solicitudRef = doc(db, 'solicitudes', solicitudId)
      batch.delete(solicitudRef)

      // Eliminar detalles
      const detalles = await firestoreService.getDetalleSolicitudes(solicitudId)
      detalles.forEach(detalle => {
        const detalleRef = doc(db, 'detalle_solicitudes', detalle.id)
        batch.delete(detalleRef)
      })

      await batch.commit()

      return { success: true, message: 'Solicitud eliminada exitosamente' }
    } catch (error) {
      console.error('Error eliminando solicitud:', error)
      return { success: false, message: error.message }
    }
  },

  // Función para actualizar solicitudes procesadas que no tienen codigo_salida
  actualizarSolicitudesProcesadasSinCodigo: async () => {
    try {
      const db = getDB()
      
      // Obtener todas las solicitudes procesadas
      const solicitudesRef = collection(db, 'solicitudes')
      const q = query(solicitudesRef, where('estado', '==', 'procesada'))
      const snapshot = await getDocs(q)
      
      const solicitudesParaActualizar = []
      
      for (const docSnap of snapshot.docs) {
        const solicitud = docSnap.data()
        if (solicitud.salida_id && !solicitud.codigo_salida) {
          
          // Obtener el movimiento para obtener su código
          try {
            const movimientoRef = doc(db, 'movimientos', solicitud.salida_id)
            const movimientoSnap = await getDoc(movimientoRef)
            const movimiento = movimientoSnap.data()
            
            if (movimiento && movimiento.codigo_legible) {
              solicitudesParaActualizar.push({
                solicitudId: docSnap.id,
                codigo_salida: movimiento.codigo_legible
              })
                          }
          } catch (error) {
            console.error('Error obteniendo movimiento:', error)
          }
        }
      }
      
      // Actualizar las solicitudes encontradas
      if (solicitudesParaActualizar.length > 0) {
                
        for (const { solicitudId, codigo_salida } of solicitudesParaActualizar) {
          const solicitudRef = doc(db, 'solicitudes', solicitudId)
          await updateDoc(solicitudRef, { codigo_salida })
        }
        
      } else {
      }
      
      return {
        success: true,
        actualizadas: solicitudesParaActualizar.length
      }
      
    } catch (error) {
      console.error('Error actualizando solicitudes:', error)
      return {
        success: false,
        error: error.message
      }
    }
  },

  // Función para actualizar URLs de notificaciones existentes
  actualizarUrlsNotificacionesSolicitudes: async () => {
    try {
      const db = getDB()
      
      const notificacionesRef = collection(db, 'notificaciones')
      const snapshot = await getDocs(notificacionesRef)
      
      let actualizadas = 0
      
      for (const docSnap of snapshot.docs) {
        const notificacion = docSnap.data()
        const accionUrlActual = notificacion.datos_adicionales?.accionUrl
        
        // Verificar si tiene la URL incorrecta
        if (accionUrlActual && accionUrlActual.startsWith('/solicitudes?')) {
          const nuevaUrl = accionUrlActual.replace('/solicitudes?', '/movimientos/solicitudes?')
          
          // Actualizar la URL en datos_adicionales
          const datosActualizados = {
            ...notificacion.datos_adicionales,
            accionUrl: nuevaUrl
          }
          
          const notificacionRef = doc(db, 'notificaciones', docSnap.id)
          await updateDoc(notificacionRef, {
            datos_adicionales: datosActualizados
          })
          
          actualizadas++
        }
      }
      
      
      return {
        success: true,
        actualizadas
      }
      
    } catch (error) {
      console.error('Error actualizando URLs de notificaciones:', error)
      return {
        success: false,
        error: error.message
      }
    }
  },

  /**
   * Update movimiento estado (e.g., from COMPLETADO to RECIBIENDO for editing)
   */
  updateMovimientoEstado: async (data) => {
    try {
      const db = getDB()
      const movimientoRef = doc(db, 'movimientos', data.movimiento_id)

      await updateDoc(movimientoRef, {
        estado: data.estado,
        fecha_ultima_edicion: Timestamp.now(),
        usuario_editor_id: data.editado_por,
        ediciones_count: increment(data.ediciones_count_increment || 1)
      })

      return { success: true, message: 'Estado actualizado exitosamente' }
    } catch (error) {
      console.error('Error actualizando estado del movimiento:', error)
      return { success: false, message: error.message }
    }
  },

  /**
   * Update movimiento detalles (product quantities)
   * Updates detalle_movimientos and adjusts inventory accordingly
   */
  updateMovimientoDetalles: async (data) => {
    try {
      const db = getDB()
      const batch = writeBatch(db)

      // Get movimiento to know tipo and destino
      const movimientoRef = doc(db, 'movimientos', data.movimiento_id)
      const movimientoDoc = await getDoc(movimientoRef)
      if (!movimientoDoc.exists()) {
        throw new Error('Movimiento no encontrado')
      }
      const movimiento = movimientoDoc.data()

      // Get current ediciones log or create new array
      const edicionesActuales = movimiento.registro_ediciones || []
      const numeroEdicion = edicionesActuales.length + 1
      
      // Create new edition log entry
      const nuevaEdicion = {
        numero_edicion: numeroEdicion,
        fecha_edicion: Timestamp.now(),
        usuario_editor_id: data.editado_por,
        productos_modificados: data.productos.map(p => ({
          detalle_id: p.detalle_id,
          producto_id: p.producto_id,
          cantidad_anterior: null, // Will be filled below
          cantidad_nueva: p.cantidad_enviada
        }))
      }
      
      // Update movimiento metadata with historical log
      const updateData = {
        fecha_ultima_edicion: Timestamp.now(),
        usuario_editor_id: data.editado_por,
        registro_ediciones: [...edicionesActuales, nuevaEdicion]
      }
      
      // If estado is RECIBIENDO, change it back to COMPLETADO after editing
      if (movimiento.estado === 'RECIBIENDO') {
        updateData.estado = 'COMPLETADO'
        updateData.fecha_confirmacion = Timestamp.now()
      }
      
      batch.update(movimientoRef, updateData)

      // For each product, update detalle and adjust inventory
      for (const prod of data.productos) {
        const detalleRef = doc(db, 'detalle_movimientos', prod.detalle_id)
        const detalleDoc = await getDoc(detalleRef)

        if (detalleDoc.exists()) {
          const detalleActual = detalleDoc.data()
          const cantidadAnterior = detalleActual.cantidad_enviada || detalleActual.cantidad || 0
          const cantidadNueva = prod.cantidad_enviada
          const diferencia = cantidadNueva - cantidadAnterior

          // Update detalle - preserve cantidad_recibida if it exists, otherwise set to cantidad_enviada for COMPRA
          const updateData = {
            cantidad_enviada: cantidadNueva
          }
          
          // Only update cantidad_recibida if it's a COMPRA or if explicitly provided
          if (movimiento.tipo_movimiento === 'COMPRA' || prod.cantidad_recibida !== undefined) {
            updateData.cantidad_recibida = prod.cantidad_recibida !== undefined ? prod.cantidad_recibida : cantidadNueva
          }
          
          batch.update(detalleRef, updateData)

          // Adjust inventory in destino
          if (movimiento.destino_id && diferencia !== 0) {
            const inventarioQuery = query(
              collection(db, 'inventario'),
              where('ubicacion_id', '==', movimiento.destino_id),
              where('producto_id', '==', prod.producto_id)
            )
            const inventarioSnapshot = await getDocs(inventarioQuery)

            if (!inventarioSnapshot.empty) {
              const inventarioDoc = inventarioSnapshot.docs[0]
              const inventarioActual = inventarioDoc.data()
              const inventarioRef = doc(db, 'inventario', inventarioDoc.id)

              batch.update(inventarioRef, {
                cantidad: (inventarioActual.cantidad || 0) + diferencia,
                fecha_actualizacion: Timestamp.now()
              })
            }
          }
        }
      }

      await batch.commit()

      return { success: true, message: 'Cantidades actualizadas exitosamente' }
    } catch (error) {
      console.error('Error actualizando detalles del movimiento:', error)
      return { success: false, message: error.message }
    }
  },

  // ========== SALIDAS ODOO — RECETAS (BOM) ==========

  getRecetas: async () => {
    const db = getDB()
    const snap = await getDocs(
      query(collection(db, 'salidas_odoo_recetas'), orderBy('nombre'))
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  },

  createReceta: async (data) => {
    const db = getDB()
    // Validate SKU uniqueness for active recipes
    if (data.sku_odoo && data.activo !== false) {
      const snap = await getDocs(query(collection(db, 'salidas_odoo_recetas'), where('sku_odoo', '==', data.sku_odoo), where('activo', '==', true)))
      if (!snap.empty) {
        const conflict = snap.docs[0].data()
        throw new Error(`Ya existe una receta activa para el SKU ${data.sku_odoo}: "${conflict.nombre}"`)
      }
    }
    const id = await getNextSequentialCode('REC')
    const costoTotal = calcularCostoTotal(data.ingredientes)
    await setDoc(doc(db, 'salidas_odoo_recetas', id), {
      ...data,
      costo_total: costoTotal,
      activo: data.activo !== false,
      fecha_creacion: serverTimestamp(),
      ultima_actualizacion: serverTimestamp()
    })
    return id
  },

  updateReceta: async (id, data) => {
    const db = getDB()
    // Validate SKU uniqueness when activating
    if (data.sku_odoo && data.activo !== false) {
      const snap = await getDocs(query(collection(db, 'salidas_odoo_recetas'), where('sku_odoo', '==', data.sku_odoo), where('activo', '==', true)))
      const conflict = snap.docs.find(d => d.id !== id)
      if (conflict) {
        throw new Error(`Ya existe una receta activa para el SKU ${data.sku_odoo}: "${conflict.data().nombre}"`)
      }
    }
    const costoTotal = calcularCostoTotal(data.ingredientes)
    await updateDoc(doc(db, 'salidas_odoo_recetas', id), {
      ...data,
      costo_total: costoTotal,
      ultima_actualizacion: serverTimestamp()
    })
  },

  duplicateReceta: async (id) => {
    const db = getDB()
    const original = await getDoc(doc(db, 'salidas_odoo_recetas', id))
    if (!original.exists()) throw new Error('Receta no encontrada')
    const data = original.data()
    const newId = await getNextSequentialCode('REC')
    await setDoc(doc(db, 'salidas_odoo_recetas', newId), {
      ...data,
      nombre: `${data.nombre} (Copia)`,
      activo: false,
      fecha_creacion: serverTimestamp(),
      ultima_actualizacion: serverTimestamp()
    })
    return { id: newId, ...data, nombre: `${data.nombre} (Copia)`, activo: false }
  },

  deleteReceta: async (id) => {
    const db = getDB()
    await deleteDoc(doc(db, 'salidas_odoo_recetas', id))
  },

  batchCreateRecetas: async (recetas) => {
    const db = getDB()
    const batch = writeBatch(db)
    const creados = []

    for (const receta of recetas) {
      const id = await getNextSequentialCode('REC')
      const costoTotal = calcularCostoTotal(receta.ingredientes)
      const ref = doc(db, 'salidas_odoo_recetas', id)
      batch.set(ref, {
        ...receta,
        costo_total: costoTotal,
        activo: true,
        fecha_creacion: serverTimestamp(),
        ultima_actualizacion: serverTimestamp()
      })
      creados.push(id)
    }

    await batch.commit()
    return creados
  },

  // ========== MAPEO POS (Odoo POS ↔ App Ubicación) ==========

  getMapeoPOS: async () => {
    const db = getDB()
    const snap = await getDocs(collection(db, 'mapeo_pos'))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  },

  createMapeoPOS: async (data) => {
    const db = getDB()
    const ref = await addDoc(collection(db, 'mapeo_pos'), {
      ...data,
      activo: true,
      fecha_creacion: serverTimestamp(),
      ultima_actualizacion: serverTimestamp()
    })
    return { id: ref.id, ...data }
  },

  updateMapeoPOS: async (id, data) => {
    const db = getDB()
    await updateDoc(doc(db, 'mapeo_pos', id), {
      ...data,
      ultima_actualizacion: serverTimestamp()
    })
  },

  upsertMapeoPOSDefault: async (ubicacionId) => {
    const db = getDB()
    await setDoc(doc(db, 'mapeo_pos', '__default__'), {
      odoo_pos_id: '__default__',
      odoo_pos_name: '(Fallback global)',
      ubicacion_id: ubicacionId,
      activo: true,
      es_default: true,
      notas: 'Ubicación por defecto cuando no se encuentra mapeo POS',
      ultima_actualizacion: serverTimestamp()
    }, { merge: true })
  },


  deleteMapeoPOS: async (id) => {
    const db = getDB()
    await deleteDoc(doc(db, 'mapeo_pos', id))
  },

  // ========== SALIDAS ODOO ==========

  getSalidasOdoo: async () => {
    try {
      const db = getDB()
      const snap = await getDocs(
        query(
          collection(db, 'movimientos'),
          where('origen', '==', 'ODOO_VENTA'),
          orderBy('fecha_creacion', 'desc')
        )
      )
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (error) {
      console.error('Error obteniendo salidas odoo:', error)
      return []
    }
  },

  syncSalidasOdoo: async () => {
    try {
      const db = getDB()
      const snap = await getDocs(
        query(
          collection(db, 'movimientos'),
          where('origen', '==', 'ODOO_VENTA'),
          orderBy('fecha_creacion', 'desc')
        )
      )
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (error) {
      console.error('Error sincronizando salidas odoo:', error)
      return []
    }
  },

  createSalidaOdooManual: async (data) => {
    try {
      const db = getDB()
      const cantidadSalida = parseFloat(data.cantidad) || 0
      const cantidadStock = parseFloat(data.cantidad_stock) || cantidadSalida

      const ref = await addDoc(collection(db, 'movimientos'), {
        tipo: 'SALIDA',
        origen: 'ODOO_VENTA',
        tipo_orden: 'manual',
        order_id: data.orden_odoo || 'manual',
        producto_id: data.producto_id || null,
        nombre_producto: data.nombre_producto || '',
        producto_odoo_nombre: data.producto_odoo_nombre || data.descripcion || 'Manual',
        producto_odoo_sku: null,
        recetario_nombre: null,
        cantidad: cantidadSalida,
        cantidad_stock: cantidadStock,
        unidad_medida: data.unidad_medida || '',
        unidad_medida_id: data.unidad_medida_id || null,
        costo_unitario: parseFloat(data.costo_unitario) || 0,
        costo_total: (parseFloat(data.costo_unitario) || 0) * cantidadSalida,
        ubicacion_id: data.ubicacion_id || '',
        descripcion: data.descripcion || 'Salida manual Odoo',
        estado: 'COMPLETADO',
        exit_type: 'VENTA_ODOO',
        fecha_creacion: serverTimestamp(),
      })

      // Descontar stock del inventario
      if (data.producto_id && data.ubicacion_id && cantidadStock > 0) {
        const inventarioSnap = await firestoreService.queryWithFilters('inventario', [
          where('producto_id', '==', data.producto_id),
          where('ubicacion_id', '==', data.ubicacion_id)
        ])
        if (inventarioSnap.length > 0) {
          const invRef = doc(db, 'inventario', inventarioSnap[0].id)
          await updateDoc(invRef, {
            stock_actual: (inventarioSnap[0].stock_actual || 0) - cantidadStock,
            ultima_actualizacion: serverTimestamp()
          })
        }
      }

      return { id: ref.id }
    } catch (error) {
      console.error('Error creando salida manual:', error)
      throw error
    }
  },

  deleteSalidaOdoo: async (id) => {
    try {
      const db = getDB()
      await deleteDoc(doc(db, 'movimientos', id))
    } catch (error) {
      console.error('Error eliminando salida odoo:', error)
      throw error
    }
  },
}

/**
 * Calcula el costo total de un recetario sumando cantidad * costo_unitario de cada ingrediente
 */
function calcularCostoTotal(ingredientes = []) {
  return ingredientes.reduce((sum, ing) => {
    const costo = (ing.costo_unitario || 0) * (ing.cantidad || 0)
    return sum + costo
  }, 0)
}

export default firestoreService
