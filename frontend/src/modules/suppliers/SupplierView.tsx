import React, { useState } from 'react'
import {
  CheckCircle2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Truck,
  X,
  XCircle,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createSupplier, fetchSuppliers, updateSupplier } from '@/modules/purchasing/api'
import type { Supplier, SupplierCreatePayload } from '@/modules/purchasing/types'

export function SupplierView() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'true' | 'false'>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)

  // Supplier Form State
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', { search, activeFilter }],
    queryFn: () =>
      fetchSuppliers({
        search: search.trim() || undefined,
        is_active: activeFilter === 'all' ? undefined : activeFilter === 'true',
      }),
  })

  const suppliers = data?.results || []

  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      setIsModalOpen(false)
      resetForm()
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to create supplier')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<SupplierCreatePayload> }) =>
      updateSupplier(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      setIsModalOpen(false)
      resetForm()
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to update supplier')
    },
  })

  const resetForm = () => {
    setName('')
    setContactName('')
    setEmail('')
    setPhone('')
    setAddress('')
    setIsActive(true)
    setEditingSupplier(null)
    setFormError(null)
  }

  const openCreateModal = () => {
    resetForm()
    setIsModalOpen(true)
  }

  const openEditModal = (s: Supplier) => {
    setEditingSupplier(s)
    setName(s.name)
    setContactName(s.contact_name || '')
    setEmail(s.email || '')
    setPhone(s.phone || '')
    setAddress(s.address || '')
    setIsActive(s.is_active)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!name.trim()) {
      setFormError('Supplier name is required.')
      return
    }

    const payload: SupplierCreatePayload = {
      name: name.trim(),
      contact_name: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      is_active: isActive,
    }

    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Suppliers & Vendors</h2>
          <p className="text-sm text-slate-500">
            Maintain authorized supplier registry, contacts, and procurement availability.
          </p>
        </div>
        <Button onClick={openCreateModal} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Supplier
        </Button>
      </div>

      {/* Filters & Search Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by vendor name, contact person, or email..."
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
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as 'all' | 'true' | 'false')}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-2xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Vendors</option>
                <option value="true">Active Only</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-6 py-3">Vendor / Company</th>
                <th className="px-6 py-3">Contact Person</th>
                <th className="px-6 py-3">Email & Phone</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Address</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading suppliers...
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Truck className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                    <p className="text-sm font-semibold text-slate-900">No suppliers found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {search
                        ? 'Try clearing your search query.'
                        : 'Register your first supplier to begin creating purchase orders.'}
                    </p>
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{s.name}</div>
                      <div className="text-xs text-slate-400">ID: {s.id.slice(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">
                      {s.contact_name || <span className="text-slate-400 italic">None listed</span>}
                    </td>
                    <td className="px-6 py-4 text-xs space-y-1">
                      {s.email && (
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          <span>{s.email}</span>
                        </div>
                      )}
                      {s.phone && (
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          <span>{s.phone}</span>
                        </div>
                      )}
                      {!s.email && !s.phone && (
                        <span className="text-slate-400 italic">No contact details</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {s.is_active ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-emerald-300 text-emerald-700 bg-emerald-50"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 text-slate-500">
                          <XCircle className="h-3 w-3" />
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                      {s.address ? (
                        <div className="flex items-center gap-1.5" title={s.address}>
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{s.address}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No address</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-600 hover:text-blue-700 gap-1 h-8"
                        onClick={() => openEditModal(s)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add / Edit Supplier Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-lg shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
              <CardTitle className="text-lg font-bold text-slate-900">
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                onClick={() => {
                  setIsModalOpen(false)
                  resetForm()
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <form onSubmit={handleSaveSupplier}>
              <CardContent className="space-y-4 pt-4">
                {formError && (
                  <div className="rounded-md bg-rose-50 p-3 text-xs font-medium text-rose-700">
                    {formError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Company / Vendor Name *
                  </label>
                  <Input
                    placeholder="e.g. Acme Industrial Supplies"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contact Person
                    </label>
                    <Input
                      placeholder="e.g. John Doe"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <Input
                      placeholder="e.g. +1 555-0199"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="e.g. orders@acme.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Billing / Physical Address
                  </label>
                  <Input
                    placeholder="e.g. 123 Warehouse Way, Industrial Park"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="is_active_checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label
                    htmlFor="is_active_checkbox"
                    className="text-xs font-medium text-slate-700 cursor-pointer"
                  >
                    Active vendor (available for purchase orders)
                  </label>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false)
                    resetForm()
                  }}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving
                    ? 'Saving...'
                    : editingSupplier
                      ? 'Update Supplier'
                      : 'Save Supplier'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
