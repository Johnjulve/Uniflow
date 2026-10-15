import { createBrowserRouter } from 'react-router-dom'
import { DashboardLayout } from '@/app/layouts/DashboardLayout'
import { DashboardOverview } from '@/app/views/DashboardOverview'
import { PlaceholderView } from '@/app/views/PlaceholderView'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      {
        index: true,
        element: <DashboardOverview />,
      },
      {
        path: 'catalog',
        element: (
          <PlaceholderView
            title="Product Catalog"
            description="Manage products, categories, SKU definitions, and pricing."
          />
        ),
      },
      {
        path: 'inventory',
        element: (
          <PlaceholderView
            title="Inventory Operations"
            description="Track real-time stock balances, warehouse adjustments, and movement ledgers."
          />
        ),
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
