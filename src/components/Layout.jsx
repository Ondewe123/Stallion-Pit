import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { path: '/',            label: 'Dashboard',  icon: '◈' },
  { path: '/fleet',       label: 'Fleet',      icon: '🚗' },
  { path: '/fuel',        label: 'Fuel Log',   icon: '⛽' },
  { path: '/service',     label: 'Service',    icon: '🔧' },
  { path: '/parts',       label: 'Parts',      icon: '📦' },
  { path: '/maintenance', label: 'Schedule',   icon: '📅' },
  { path: '/snags',       label: 'Snags',      icon: '⚠️'  },
  { path: '/analysis',    label: 'Analysis',   icon: '📊' },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            {!collapsed && (
              <span className="logo-text">STALLION <span className="logo-accent">PIT</span></span>
            )}
            {collapsed && <span className="logo-icon">S</span>}
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }
              title={collapsed ? item.label : ''}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && (
            <div className="sidebar-user">{user?.email}</div>
          )}
          <button className="btn-signout" onClick={handleSignOut} title="Sign out">
            {collapsed ? '⏻' : 'Sign Out'}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
