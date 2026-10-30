import { createBrowserRouter } from 'react-router-dom'
import { DashboardLayout } from '@/app/layouts/DashboardLayout'
import { DashboardOverview } from '@/app/views/DashboardOverview'
import { LoginForm } from '@/modules/auth/LoginForm'
import { ProtectedRoute } from '@/modules/auth/ProtectedRoute'
import { CatalogView } from '@/modules/catalog/CatalogView'
import { InventoryView } from '@/modules/inventory/InventoryView'
import { PurchasingView } from '@/modules/purchasing/PurchasingView'
import { ReportsView } from '@/modules/reports/ReportsView'
import { SettingsView } from '@/modules/settings/SettingsView'
import { SupplierView } from '@/modules/suppliers/SupplierView'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginForm />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <DashboardOverview />,
      },
      {
        path: 'catalog',
        element: <CatalogView />,
      },
      {
        path: 'inventory',
        element: <InventoryView />,
      },
      {
        path: 'purchasing',
        element: <PurchasingView />,
      },
      {
        path: 'suppliers',
        element: <SupplierView />,
      },
      {
        path: 'reports',
        element: <ReportsView />,
      },
      {
        path: 'settings',
        element: <SettingsView />,
      },
    ],
  },
])
