import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { record } from '../lib/feedback/breadcrumbs'
import VehicleSelector from './VehicleSelector'

const NAV_ITEMS = [
  { path: '/',            label: 'Dashboard', short: 'Home',     icon: '◈' },
  { path: '/fleet',       label: 'Fleet',     short: 'Fleet',    icon: '🚗' },
  { path: '/fuel',        label: 'Fuel Log',  short: 'Fuel',     icon: '⛽' },
  { path: '/service',     label: 'Service',   short: 'Service',  icon: '🔧' },
  { path: '/parts',       label: 'Parts',     short: 'Parts',    icon: '📦' },
  { path: '/maintenance', label: 'Schedule',  short: 'Schedule', icon: '📅' },
  { path: '/templates',   label: 'Templates', short: 'Tpl',      icon: '📋', desktopOnly: true },
  { path: '/work-orders', label: 'Work Orders', short: 'Jobs',   icon: '🛠️', desktopOnly: true },
  { path: '/snags',       label: 'Snags',     short: 'Snags',    icon: '⚠️'  },
  { path: '/dtc',         label: 'DTC Log',   short: 'DTC',      icon: '🩺', desktopOnly: true },
  { path: '/analysis',    label: 'Analysis',  short: 'Stats',    icon: '📊' },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    record({ kind: 'nav', route: location.pathname })
  }, [location.pathname])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            {!collapsed && <span className="logo-text">STALLION <span className="logo-accent">PIT</span></span>}
            {collapsed && <span className="logo-icon">S</span>}
          </div>
          <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {!collapsed && <VehicleSelector />}

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink key={item.path} to={item.path} end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              title={collapsed ? item.label : ''}>
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && <div className="sidebar-user">{user?.email}</div>}
          <button className="btn-signout" onClick={handleSignOut} title="Sign out">
            {collapsed ? '⏻' : 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="mobile-topbar">
        <span className="logo-text">STALLION <span className="logo-accent">PIT</span></span>
        <div className="mobile-topbar-right">
          <VehicleSelector />
          <button className="btn-signout mobile-signout" onClick={handleSignOut} title="Sign out">⏻</button>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-bottomnav">
        {NAV_ITEMS.filter(item => !item.desktopOnly).map(item => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
