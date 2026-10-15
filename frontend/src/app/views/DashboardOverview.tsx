import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Boxes,
  Package,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  Database,
  Activity,
} from 'lucide-react'

export function DashboardOverview() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">System Overview</h2>
        <p className="text-sm text-slate-500">
          Uniflow Inventory Management platform status and operational metrics.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Products</CardTitle>
            <Package className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">0</div>
            <p className="text-xs text-slate-500 mt-1">Catalog initial state</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Stock Units</CardTitle>
            <Boxes className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">0</div>
            <p className="text-xs text-slate-500 mt-1">Across primary warehouse</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Open Purchase Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">0</div>
            <p className="text-xs text-slate-500 mt-1">Awaiting receiving</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Low Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">0</div>
            <p className="text-xs text-slate-500 mt-1">Below minimum threshold</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Launch & Architecture Status */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Architecture Status</CardTitle>
              <Badge variant="success">Phase 1 Foundation</Badge>
            </div>
            <CardDescription>
              Modular Monolith Core (DRF + React 19 + IndexedDB Outbox)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">REST API Gateway</p>
                  <p className="text-xs text-slate-500">Django REST Framework /api/v1/</p>
                </div>
              </div>
              <Badge variant="outline">Connected</Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Offline Outbox Engine</p>
                  <p className="text-xs text-slate-500">Dexie IndexedDB Client Storage</p>
                </div>
              </div>
              <Badge variant="outline">Active</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Shortcuts to primary inventory operations</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button variant="default" className="justify-between">
              <span>View Product Catalog</span>
              <ArrowUpRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="justify-between">
              <span>Record Stock Adjustment</span>
              <Boxes className="h-4 w-4" />
            </Button>
            <Button variant="ghost" className="justify-between text-slate-700">
              <span>Generate Inventory Valuation Report</span>
              <TrendingUp className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
