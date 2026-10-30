import React, { useState } from 'react'
import {
  CheckCircle2,
  Clock,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  X,
  XCircle,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchLocations } from '@/modules/inventory/api'
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  createReceipt,
  fetchPurchaseOrders,
  fetchSuppliers,
  submitPurchaseOrder,
} from './api'
import type {
  PurchaseOrder,
  PurchaseOrderCreateItem,
  PurchaseOrderCreatePayload,
  ReceiptCreateItemPayload,
} from './types'

interface ProductOption {
  id: string
  sku: string
  name: string
  purchase_cost: string
  unit_of_measure: string
}

export function PurchasingView() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedOrderForReceiving, setSelectedOrderForReceiving] = useState<PurchaseOrder | null>(null)

  // Create PO Form state
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [lineItems, setLineItems] = useState<
    { product_id: string; ordered_quantity: string; unit_cost: string }[]
  >([{ product_id: '', ordered_quantity: '1.00', unit_cost: '0.00' }])
  const [createError, setCreateError] = useState<string | null>(null)

  // Receiving Modal state
  const [receivingLocationId, setReceivingLocationId] = useState('')
  const [deliveryRef, setDeliveryRef] = useState('')
  const [receivingItems, setReceivingItems] = useState<
    { po_item_id: string; accepted_quantity: string; rejected_quantity: string; notes: string }[]
  >([])
  const [receiveError, setReceiveError] = useState<string | null>(null)

  // Query: Purchase Orders
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['purchase-orders', { search, statusFilter }],
    queryFn: () =>
      fetchPurchaseOrders({
        search: search.trim() || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      }),
  })
  const orders = ordersData?.results || []

  // Query: Suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', { is_active: true }],
    queryFn: () => fetchSuppliers({ is_active: true }),
  })
  const suppliers = suppliersData?.results || []

  // Query: Locations
  const { data: locations = [] } = useQuery({
    queryKey: ['inventory', 'locations'],
    queryFn: fetchLocations,
  })

  // Query: Active Products for PO item builder
  const { data: products = [] } = useQuery<ProductOption[]>({
    queryKey: ['catalog', 'products', { is_active: true }],
    queryFn: async () => {
      const token = localStorage.getItem('uniflow_auth_token')
      const res = await fetch('/api/v1/catalog/products/?is_active=true', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Token ${token}` } : {}),
        },
      })
      if (!res.ok) throw new Error('Failed to load products')
      const data = await res.json()
      return data.results || []
    },
  })

  // Mutations
  const createOrderMutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      setIsCreateModalOpen(false)
      setSelectedSupplierId('')
      setExpectedDate('')
      setOrderNotes('')
      setLineItems([{ product_id: '', ordered_quantity: '1.00', unit_cost: '0.00' }])
    },
    onError: (err: Error) => {
      setCreateError(err.message || 'Failed to create purchase order')
    },
  })

  const submitOrderMutation = useMutation({
    mutationFn: submitPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: (err: Error) => {
      alert(err.message || 'Failed to submit order')
    },
  })

  const cancelOrderMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelPurchaseOrder(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
    onError: (err: Error) => {
      alert(err.message || 'Failed to cancel order')
    },
  })

  const receiveMutation = useMutation({
    mutationFn: createReceipt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['inventory', 'balances'] })
      queryClient.invalidateQueries({ queryKey: ['inventory', 'movements'] })
      setSelectedOrderForReceiving(null)
    },
    onError: (err: Error) => {
      setReceiveError(err.message || 'Failed to record delivery intake')
    },
  })

  // Line item helpers for Create PO
  const handleAddLineItem = () => {
    setLineItems([...lineItems, { product_id: '', ordered_quantity: '1.00', unit_cost: '0.00' }])
  }

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length <= 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const handleProductSelect = (index: number, productId: string) => {
    const prod = products.find((p) => p.id === productId)
    const updated = [...lineItems]
    updated[index].product_id = productId
    if (prod) {
      updated[index].unit_cost = prod.purchase_cost
    }
    setLineItems(updated)
  }

  const handleItemChange = (index: number, field: 'ordered_quantity' | 'unit_cost', val: string) => {
    const updated = [...lineItems]
    updated[index][field] = val
    setLineItems(updated)
  }

  const calculateCreateTotal = () => {
    return lineItems.reduce((acc, item) => {
      const q = parseFloat(item.ordered_quantity) || 0
      const c = parseFloat(item.unit_cost) || 0
      return acc + q * c
    }, 0)
  }

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!selectedSupplierId) {
      setCreateError('Please select a supplier.')
      return
    }

    const validItems: PurchaseOrderCreateItem[] = []
    for (const it of lineItems) {
      if (!it.product_id) {
        setCreateError('All line items must have a product selected.')
        return
      }
      const q = parseFloat(it.ordered_quantity)
      if (isNaN(q) || q <= 0) {
        setCreateError('Ordered quantity must be greater than zero.')
        return
      }
      const c = parseFloat(it.unit_cost)
      if (isNaN(c) || c < 0) {
        setCreateError('Unit cost cannot be negative.')
        return
      }
      validItems.push({
        product_id: it.product_id,
        ordered_quantity: it.ordered_quantity,
        unit_cost: it.unit_cost,
      })
    }

    const payload: PurchaseOrderCreatePayload = {
      supplier_id: selectedSupplierId,
      expected_date: expectedDate || null,
      notes: orderNotes.trim(),
      items: validItems,
    }
    createOrderMutation.mutate(payload)
  }

  // Open receiving intake modal
  const openReceivingModal = (po: PurchaseOrder) => {
    setSelectedOrderForReceiving(po)
    setReceiveError(null)
    setDeliveryRef('')
    if (locations.length > 0 && !receivingLocationId) {
      setReceivingLocationId(locations[0].id)
    }
    const items = po.items.map((it) => {
      const ordered = parseFloat(it.ordered_quantity) || 0
      const received = parseFloat(it.received_quantity) || 0
      const remaining = Math.max(0, ordered - received)
      return {
        po_item_id: it.id,
        accepted_quantity: String(remaining),
        rejected_quantity: '0',
        notes: '',
      }
    })
    setReceivingItems(items)
  }

  const handlePostReceipt = (e: React.FormEvent) => {
    e.preventDefault()
    setReceiveError(null)

    if (!selectedOrderForReceiving) return

    const targetLoc = receivingLocationId || locations[0]?.id
    if (!targetLoc) {
      setReceiveError('Please select a target warehouse location.')
      return
    }

    const payloadItems: ReceiptCreateItemPayload[] = []
    for (const it of receivingItems) {
      const acc = parseFloat(it.accepted_quantity) || 0
      const rej = parseFloat(it.rejected_quantity) || 0
      if (acc < 0 || rej < 0) {
        setReceiveError('Quantities cannot be negative.')
        return
      }
      if (acc > 0 || rej > 0) {
        payloadItems.push({
          po_item_id: it.po_item_id,
          accepted_quantity: it.accepted_quantity,
          rejected_quantity: it.rejected_quantity,
          notes: it.notes.trim(),
        })
      }
    }

    if (payloadItems.length === 0) {
      setReceiveError('Please enter accepted or rejected quantities for at least one item.')
      return
    }

    receiveMutation.mutate({
      purchase_order_id: selectedOrderForReceiving.id,
      location_id: targetLoc,
      supplier_delivery_ref: deliveryRef.trim(),
      items: payloadItems,
    })
  }

  const getStatusBadge = (status: string, display: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <Badge variant="outline" className="gap-1 border-slate-300 text-slate-700 bg-slate-50">
            <Clock className="h-3 w-3" />
            {display}
          </Badge>
        )
      case 'SUBMITTED':
        return (
          <Badge variant="outline" className="gap-1 border-blue-300 text-blue-700 bg-blue-50">
            <Truck className="h-3 w-3" />
            {display}
          </Badge>
        )
      case 'PARTIALLY_RECEIVED':
        return (
          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 bg-amber-50">
            <Clock className="h-3 w-3" />
            {display}
          </Badge>
        )
      case 'FULLY_RECEIVED':
        return (
          <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 bg-emerald-50">
            <CheckCircle2 className="h-3 w-3" />
            {display}
          </Badge>
        )
      case 'CANCELLED':
        return (
          <Badge variant="secondary" className="gap-1 text-rose-700 bg-rose-50 border-rose-200">
            <XCircle className="h-3 w-3" />
            {display}
          </Badge>
        )
      default:
        return <Badge variant="secondary">{display}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Purchase Orders</h2>
          <p className="text-sm text-slate-500">
            Create procurement orders, track supplier fulfillments, and accept delivery receipts into stock.
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Purchase Order
        </Button>
      </div>

      {/* Toolbar Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by order reference (e.g. PO-...), vendor, notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
                Status:
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-2xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="PARTIALLY_RECEIVED">Partially Received</option>
                <option value="FULLY_RECEIVED">Fully Received</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-6 py-3">Order Reference</th>
                <th className="px-6 py-3">Vendor / Supplier</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Received / Ordered</th>
                <th className="px-6 py-3">Order Total</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading purchase orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <ShoppingCart className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                    <p className="text-sm font-semibold text-slate-900">No purchase orders found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {search ? 'Try adjusting your filters.' : 'Draft a new purchase order to start replenishing inventory.'}
                    </p>
                  </td>
                </tr>
              ) : (
                orders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-slate-900">
                      <div>{po.order_reference}</div>
                      <div className="text-xs text-slate-400 font-sans">{po.order_date}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">
                      <div>{po.supplier_name}</div>
                      {po.expected_date && (
                        <div className="text-xs text-slate-400">Exp: {po.expected_date}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(po.status, po.status_display)}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium">
                      <div>
                        {po.total_received_quantity} / {po.total_ordered_quantity} units
                      </div>
                      <div className="text-slate-400">{po.items?.length || 0} line item(s)</div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      ${parseFloat(po.total_cost).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {po.status === 'DRAFT' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8 text-blue-700 border-blue-300 hover:bg-blue-50"
                            onClick={() => {
                              if (window.confirm('Submit this purchase order to the vendor? Items will be locked.')) {
                                submitOrderMutation.mutate(po.id)
                              }
                            }}
                            disabled={submitOrderMutation.isPending}
                          >
                            Submit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-8 text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              if (window.confirm('Discard this draft purchase order? It will not be kept in the logs.')) {
                                cancelOrderMutation.mutate({ id: po.id })
                              }
                            }}
                            disabled={cancelOrderMutation.isPending}
                          >
                            Discard Draft
                          </Button>
                        </>
                      )}

                      {(po.status === 'SUBMITTED' || po.status === 'PARTIALLY_RECEIVED') && (
                        <>
                          <Button
                            size="sm"
                            className="text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => openReceivingModal(po)}
                          >
                            <PackageCheck className="h-3.5 w-3.5" />
                            Receive Delivery
                          </Button>
                          {po.can_cancel && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-8 text-rose-600 hover:bg-rose-50"
                              onClick={() => {
                                const reason = window.prompt('Provide a cancellation reason (optional):')
                                if (reason !== null) {
                                cancelOrderMutation.mutate({ id: po.id, reason })
                              }
                            }}
                            disabled={cancelOrderMutation.isPending}
                          >
                            Cancel
                          </Button>
                        )}
                      </>
                    )}

                      {po.status === 'FULLY_RECEIVED' && (
                        <span className="text-xs font-medium text-emerald-700">Fulfilled</span>
                      )}
                      {po.status === 'CANCELLED' && (
                        <span className="text-xs font-medium text-slate-400">Cancelled</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New Purchase Order Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-3xl shadow-xl max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <CardTitle className="text-lg font-bold text-slate-900">Create Purchase Order</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                onClick={() => setIsCreateModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <form onSubmit={handleCreateOrder} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto p-6 space-y-4 flex-1">
                {createError && (
                  <div className="rounded-md bg-rose-50 p-3 text-xs font-medium text-rose-700">
                    {createError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Supplier / Vendor *
                    </label>
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => setSelectedSupplierId(e.target.value)}
                      className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select an active supplier...</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Expected Delivery Date
                    </label>
                    <Input
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Internal Order Notes
                  </label>
                  <Input
                    placeholder="e.g. Workshop inventory replenishment, priority shipment"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                  />
                </div>

                {/* Dynamic Line Items Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Line Items
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddLineItem}
                      className="h-7 text-xs gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Item
                    </Button>
                  </div>

                  {lineItems.map((item, index) => {
                    const lineTotal =
                      (parseFloat(item.ordered_quantity) || 0) * (parseFloat(item.unit_cost) || 0)

                    return (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                      >
                        <div className="flex-1 w-full sm:w-auto">
                          <select
                            value={item.product_id}
                            onChange={(e) => handleProductSelect(index, e.target.value)}
                            className="w-full h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800"
                            required
                          >
                            <option value="">Select product SKU...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku} - {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center rounded-md border border-slate-300 bg-white">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => {
                              const curr = parseFloat(item.ordered_quantity) || 1
                              const next = Math.max(1, curr - 1)
                              handleItemChange(index, 'ordered_quantity', String(next))
                            }}
                            className="flex h-8 w-7 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                            disabled={(parseFloat(item.ordered_quantity) || 1) <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={item.ordered_quantity}
                            onChange={(e) => handleItemChange(index, 'ordered_quantity', e.target.value)}
                            className="h-8 w-14 border-x border-slate-200 text-center text-xs text-slate-800 focus:outline-hidden [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            required
                          />
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => {
                              const curr = parseFloat(item.ordered_quantity) || 0
                              handleItemChange(index, 'ordered_quantity', String(curr + 1))
                            }}
                            className="flex h-8 w-7 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="w-32">
                          <Input
                            type="number"
                            step="0.0001"
                            min="0"
                            placeholder="Unit Cost"
                            value={item.unit_cost}
                            onChange={(e) => handleItemChange(index, 'unit_cost', e.target.value)}
                            className="h-8 text-xs text-right"
                            required
                          />
                        </div>
                        <div className="w-24 text-right font-semibold text-slate-800">
                          ${lineTotal.toFixed(2)}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 shrink-0"
                          onClick={() => handleRemoveLineItem(index)}
                          disabled={lineItems.length <= 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}

                  <div className="flex justify-end pt-2 font-bold text-sm text-slate-900">
                    <span>Estimated Total: ${calculateCreateTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <CardFooter className="flex justify-end gap-2 border-t border-slate-100 p-4 shrink-0 bg-slate-50">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={createOrderMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createOrderMutation.isPending}>
                  {createOrderMutation.isPending ? 'Saving...' : 'Create Draft Order'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* Receiving Delivery Intake Modal */}
      {selectedOrderForReceiving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-3xl shadow-xl max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  Receive Delivery: {selectedOrderForReceiving.order_reference}
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Vendor: {selectedOrderForReceiving.supplier_name}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                onClick={() => setSelectedOrderForReceiving(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <form onSubmit={handlePostReceipt} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto p-6 space-y-4 flex-1">
                {receiveError && (
                  <div className="rounded-md bg-rose-50 p-3 text-xs font-medium text-rose-700">
                    {receiveError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Shelving Warehouse Location *
                    </label>
                    <select
                      value={receivingLocationId || locations[0]?.id || ''}
                      onChange={(e) => setReceivingLocationId(e.target.value)}
                      className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      required
                    >
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.code} - {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Supplier Waybill / Delivery Reference
                    </label>
                    <Input
                      placeholder="e.g. WAYBILL-98741 or BOL-1049"
                      value={deliveryRef}
                      onChange={(e) => setDeliveryRef(e.target.value)}
                    />
                  </div>
                </div>

                {/* Items to receive table */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Delivery Item Quantities
                  </span>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                        <tr>
                          <th className="p-2.5">Item / SKU</th>
                          <th className="p-2.5 text-right">Ordered</th>
                          <th className="p-2.5 text-right">Received</th>
                          <th className="p-2.5 text-right">Remaining</th>
                          <th className="p-2.5 text-right w-36">Accept Now</th>
                          <th className="p-2.5 text-right w-36">Damaged</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedOrderForReceiving.items.map((poItem, idx) => {
                          const ordered = parseFloat(poItem.ordered_quantity) || 0
                          const prevReceived = parseFloat(poItem.received_quantity) || 0
                          const remaining = Math.max(0, ordered - prevReceived)

                          return (
                            <tr key={poItem.id} className="hover:bg-slate-50/50">
                              <td className="p-2.5">
                                <div className="font-semibold text-slate-900">{poItem.product_sku}</div>
                                <div className="text-slate-500">{poItem.product_name}</div>
                              </td>
                              <td className="p-2.5 text-right font-medium text-slate-700">
                                {ordered.toFixed(2)}
                              </td>
                              <td className="p-2.5 text-right font-medium text-slate-500">
                                {prevReceived.toFixed(2)}
                              </td>
                              <td className="p-2.5 text-right font-semibold text-blue-700">
                                {remaining.toFixed(2)}
                              </td>
                              <td className="p-2.5 text-right w-36">
                                <div className="flex items-center justify-end">
                                  <div className="flex items-center rounded-md border border-slate-300 bg-white">
                                    <button
                                      type="button"
                                      aria-label="Decrease accepted quantity"
                                      onClick={() => {
                                        const curr = parseFloat(receivingItems[idx]?.accepted_quantity) || 0
                                        const next = Math.max(0, curr - 1)
                                        const updated = [...receivingItems]
                                        updated[idx].accepted_quantity = String(next)
                                        setReceivingItems(updated)
                                      }}
                                      className="flex h-8 w-7 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                                      disabled={(parseFloat(receivingItems[idx]?.accepted_quantity) || 0) <= 0}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <input
                                      type="number"
                                      step="1"
                                      min="0"
                                      max={remaining}
                                      value={receivingItems[idx]?.accepted_quantity || '0'}
                                      onChange={(e) => {
                                        const updated = [...receivingItems]
                                        updated[idx].accepted_quantity = e.target.value
                                        setReceivingItems(updated)
                                      }}
                                      className="h-8 w-14 border-x border-slate-200 text-center text-xs font-semibold text-emerald-700 focus:outline-hidden [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                    <button
                                      type="button"
                                      aria-label="Increase accepted quantity"
                                      onClick={() => {
                                        const curr = parseFloat(receivingItems[idx]?.accepted_quantity) || 0
                                        const next = Math.min(remaining, curr + 1)
                                        const updated = [...receivingItems]
                                        updated[idx].accepted_quantity = String(next)
                                        setReceivingItems(updated)
                                      }}
                                      className="flex h-8 w-7 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                                      disabled={(parseFloat(receivingItems[idx]?.accepted_quantity) || 0) >= remaining}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5 text-right w-36">
                                <div className="flex items-center justify-end">
                                  <div className="flex items-center rounded-md border border-slate-300 bg-white">
                                    <button
                                      type="button"
                                      aria-label="Decrease damaged quantity"
                                      onClick={() => {
                                        const curr = parseFloat(receivingItems[idx]?.rejected_quantity) || 0
                                        const next = Math.max(0, curr - 1)
                                        const updated = [...receivingItems]
                                        updated[idx].rejected_quantity = String(next)
                                        setReceivingItems(updated)
                                      }}
                                      className="flex h-8 w-7 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                                      disabled={(parseFloat(receivingItems[idx]?.rejected_quantity) || 0) <= 0}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <input
                                      type="number"
                                      step="1"
                                      min="0"
                                      value={receivingItems[idx]?.rejected_quantity || '0'}
                                      onChange={(e) => {
                                        const updated = [...receivingItems]
                                        updated[idx].rejected_quantity = e.target.value
                                        setReceivingItems(updated)
                                      }}
                                      className="h-8 w-14 border-x border-slate-200 text-center text-xs font-semibold text-rose-700 focus:outline-hidden [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                    <button
                                      type="button"
                                      aria-label="Increase damaged quantity"
                                      onClick={() => {
                                        const curr = parseFloat(receivingItems[idx]?.rejected_quantity) || 0
                                        const updated = [...receivingItems]
                                        updated[idx].rejected_quantity = String(curr + 1)
                                        setReceivingItems(updated)
                                      }}
                                      className="flex h-8 w-7 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <CardFooter className="flex justify-end gap-2 border-t border-slate-100 p-4 shrink-0 bg-slate-50">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedOrderForReceiving(null)}
                  disabled={receiveMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={receiveMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <PackageCheck className="h-4 w-4" />
                  {receiveMutation.isPending ? 'Posting Intake...' : 'Accept into Stock'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
