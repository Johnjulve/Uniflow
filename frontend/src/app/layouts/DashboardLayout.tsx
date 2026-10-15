import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Warehouse,
} from 'lucide-react'
import { SyncIndicator } from '@/components/feedback/SyncIndicator'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const navigationItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Catalog', href: '/catalog', icon: Package },
  { name: 'Inventory', href: '/inventory', icon: Boxes },
  { name: 'Purchasing', href: '/purchasing', icon: ShoppingCart },
  { name: 'Suppliers', href: '/suppliers', icon: Truck },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
            <Warehouse className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">Uniflow IMS</h1>
            <p className="text-xs text-slate-500 font-medium">Inventory Platform</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigationItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Version 0.1.0</span>
            <span className="font-mono">Offline-First</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-2xs">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-slate-300 font-mono text-xs">
              Single-Business Mode
            </Badge>
          </div>

          <div className="flex items-center gap-4">
            <SyncIndicator pendingCount={0} />
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 border border-slate-200">
                AD
              </div>
              <div className="text-xs">
                <p className="font-semibold text-slate-900">Administrator</p>
                <p className="text-slate-500">Local Admin</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page View Outlet */}
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
