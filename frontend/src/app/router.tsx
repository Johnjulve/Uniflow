import { createBrowserRouter } from 'react-router-dom'
import { DashboardLayout } from '@/app/layouts/DashboardLayout'
import { DashboardOverview } from '@/app/views/DashboardOverview'
import { PlaceholderView } from '@/app/views/PlaceholderView'
import { LoginForm } from '@/modules/auth/LoginForm'
import { ProtectedRoute } from '@/modules/auth/ProtectedRoute'
import { CatalogView } from '@/modules/catalog/CatalogView'
import { InventoryView } from '@/modules/inventory/InventoryView'

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
        element: (
          <PlaceholderView
            title="Purchasing & Orders"
            description="Manage purchase orders, supplier fulfillment, and goods received notes."
          />
        ),
      },
      {
        path: 'suppliers',
        element: (
          <PlaceholderView
            title="Suppliers & Vendors"
            description="Maintain vendor directories, contact details, and fulfillment lead times."
          />
        ),
      },
      {
        path: 'reports',
        element: (
          <PlaceholderView
            title="Reports & Analytics"
            description="Inventory turnover, valuation summaries, and discrepancy audits."
          />
        ),
      },
      {
        path: 'settings',
        element: (
          <PlaceholderView
            title="System Settings"
            description="Organization profile, sync preferences, and user role management."
          />
        ),
      },
    ],
  },
])
