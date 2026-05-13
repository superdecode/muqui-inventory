import { NavLink, useLocation } from 'react-router-dom'
import {
  Home,
  Package,
  ArrowRightLeft,
  ClipboardCheck,
  FileBarChart,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Shield,
  Settings,
  Circle,
  PackageCheck,
  ArrowUpRight,
  ArrowDownLeft,
  BookOpen
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { formatLabel } from '../../utils/formatters'
import { useState, useEffect } from 'react'

// Helper function to get role label with proper priority
const getRoleLabel = (rol, cachedRole, user) => {
  // Priority: cached role name from Firestore > user.roleData > legacy constant map
  if (cachedRole?.nombre) return cachedRole.nombre
  if (user?.roleData?.nombre) return user.roleData.nombre
  const legacyMap = {
    'ADMIN_GLOBAL': 'Administrador Global',
    'ADMIN_EMPRESA': 'Administrador de Empresa',
    'GERENTE_OPERATIVO': 'Gerente Operativo',
    'JEFE_PUNTO': 'Jefe de Punto',
    'OPERADOR': 'Operador'
  }
  return legacyMap[rol] || rol || '-'
}

export default function Sidebar() {
  const location = useLocation()
  const { user, logout, cachedRole } = useAuthStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState({})

  const { hasPermission } = useAuthStore()

  // Auto-expand menus based on current route
  useEffect(() => {
    if (location.pathname.startsWith('/movimientos')) {
      setExpandedMenus(prev => ({ ...prev, movimientos: true }))
    }
  }, [location.pathname])

  const allMenuItems = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/productos', icon: Package, label: 'Productos', permission: 'productos.ver' },
    { to: '/stock', icon: PackageCheck, label: 'Stock', permission: 'productos.ver' },
    {
      to: '/movimientos',
      icon: ArrowRightLeft,
      label: 'Movimientos',
      permission: 'movimientos.ver',
      submenu: [
        { to: '/movimientos/solicitudes', label: 'Solicitudes', icon: Circle },
        { to: '/movimientos/salidas', label: 'Salidas', icon: ArrowUpRight },
        { to: '/movimientos/entradas', label: 'Entradas', icon: ArrowDownLeft }
      ]
    },
    { to: '/conteos', icon: ClipboardCheck, label: 'Conteos', permission: 'conteos.ver' },
    { to: '/reportes', icon: FileBarChart, label: 'Reportes', permission: 'reportes.ver' },
    { to: '/salidas-odoo', icon: BookOpen, label: 'Salidas Odoo', permission: 'salidas_odoo.ver' },
    { to: '/configuraciones', icon: Settings, label: 'Configuraciones', permission: 'configuracion.ver' },
    { to: '/admin', icon: Shield, label: 'Administración', permission: 'administracion.ver' }
  ]

  const menuItems = allMenuItems.filter(item => !item.permission || hasPermission(item.permission))

  const toggleSubmenu = (menuKey) => {
    setExpandedMenus(prev => ({ ...prev, [menuKey]: !prev[menuKey] }))
  }

  const handleLogout = () => {
    logout()
  }

  const toggleSidebar = () => {
    setIsOpen(!isOpen)
  }

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-primary-600 text-white"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          bg-gradient-to-b from-[#004AFF] to-[#002980] text-white
          transform transition-all duration-300 ease-in-out overflow-hidden
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}
          w-64 h-screen lg:h-full
        `}
      >
        <div className="flex flex-col h-full relative overflow-hidden">
          {/* Collapse button for large screens */}
          <button
            onClick={toggleCollapse}
            className="hidden lg:flex absolute -right-3 top-6 z-50 w-6 h-6 items-center justify-center bg-white text-primary-600 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110"
            title={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Logo */}
          <div className="p-6 border-b border-white/20">
            <h1 className={`text-xl font-bold transition-opacity duration-300 ${isCollapsed ? 'lg:opacity-0 lg:hidden' : 'opacity-100'}`}>
              Sistema Inventario
            </h1>
            {isCollapsed && (
              <div className="hidden lg:flex items-center justify-center">
                <Package size={28} className="text-white" />
              </div>
            )}
            {user && !isCollapsed && (
              <p className="text-sm text-white/60 mt-1">{user.nombre_completo}</p>
            )}
          </div>

          {/* Menu items */}
          <nav className="sidebar-nav flex-1 p-4 space-y-2 overflow-y-auto">
            {menuItems.map((item) => {
              const hasSubmenu = item.submenu && item.submenu.length > 0
              const menuKey = item.to.replace('/', '') || 'home'
              const isExpanded = expandedMenus[menuKey]
              const isInSubmenu = hasSubmenu && location.pathname.startsWith(item.to)

              if (hasSubmenu) {
                return (
                  <div key={item.to}>
                    {/* Parent menu item with submenu */}
                    <button
                      onClick={() => toggleSubmenu(menuKey)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors w-full ${
                        isInSubmenu
                          ? 'bg-white/20 text-white'
                          : 'text-white/80 hover:bg-white/10 hover:text-white'
                      } ${isCollapsed ? 'lg:justify-center' : ''}`}
                      title={isCollapsed ? item.label : ''}
                    >
                      <item.icon size={20} />
                      <span className={`flex-1 text-left transition-opacity duration-300 ${isCollapsed ? 'lg:hidden' : 'opacity-100'}`}>
                        {item.label}
                      </span>
                      {!isCollapsed && (
                        <ChevronDown
                          size={16}
                          className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      )}
                    </button>
                    {/* Submenu items */}
                    <div className={`mt-1 space-y-1 ${isCollapsed ? 'lg:flex lg:flex-col lg:items-center lg:space-y-2 lg:px-2' : 'ml-4'}`}>
                      {item.submenu.map((subitem) => (
                        <NavLink
                          key={subitem.to}
                          to={subitem.to}
                          onClick={() => setIsOpen(false)}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-sm ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : 'text-white/60 hover:bg-white/10 hover:text-white/80'
                            } ${isCollapsed ? 'lg:justify-center lg:px-2 lg:py-2' : ''}`
                          }
                          title={isCollapsed ? subitem.label : ''}
                        >
                          <subitem.icon size={isCollapsed ? 18 : 16} />
                          <span className={`${isCollapsed ? 'lg:hidden' : 'block'}`}>{subitem.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  </div>
                )
              }

              // Regular menu item without submenu
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    } ${isCollapsed ? 'lg:justify-center' : ''}`
                  }
                  title={isCollapsed ? item.label : ''}
                >
                  <item.icon size={20} />
                  <span className={`transition-opacity duration-300 ${isCollapsed ? 'lg:hidden' : 'opacity-100'}`}>
                    {item.label}
                  </span>
                </NavLink>
              )
            })}
          </nav>

          {/* User info and logout */}
          <div className="p-4 border-t border-white/20">
            {user && !isCollapsed && (
              <div className="mb-3 px-4">
                <p className="text-xs text-white/60">Rol</p>
                <p className="text-sm font-medium">{getRoleLabel(user.rol, cachedRole, user)}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={`flex items-center gap-3 px-4 py-3 w-full text-white/80 hover:bg-white/10 hover:text-white rounded-lg transition-colors ${isCollapsed ? 'lg:justify-center' : ''}`}
              title={isCollapsed ? 'Cerrar Sesión' : ''}
            >
              <LogOut size={20} />
              <span className={`transition-opacity duration-300 ${isCollapsed ? 'lg:hidden' : 'opacity-100'}`}>
                Cerrar Sesión
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
