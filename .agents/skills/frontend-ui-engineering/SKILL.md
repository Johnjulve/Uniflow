---
name: frontend-ui-engineering
description: Guides modular frontend architecture and unified component design for Uniflow across React 19, Vite, Tailwind CSS, and shadcn/ui. Use when building or modifying UI components, layouts, forms, tables, and domain modules.
---

# Frontend UI Engineering — Project: Uniflow

## Overview

Build clean, production-grade business interfaces for Uniflow IMS that prioritize speed, clarity, and predictable behavior. Uniflow's interface must look and feel like an engineered business management platform—not generic AI-generated prototypes. Every screen must follow a unified component design system, strict domain modularity, and explicit container/presentation separation.

---

## 1. Directory Structure & Modular Layout

All frontend code in `frontend/src/` strictly follows the modular monolithic layout from `Plan/Master_plan.md`:

```
frontend/src/
├── app/                  # Application-wide shell, routes, and providers
│   ├── router.tsx        # React Router 7 route definitions
│   ├── providers.tsx     # TanStack Query, Theme, Auth providers
│   └── layouts/          # DashboardLayout, AuthLayout, RootLayout
├── components/           # Reusable component library
│   ├── ui/               # Unified design primitives (Button, Card, Badge, Input, Dialog, Table)
│   ├── forms/            # Form wrappers (FormField, InputGroup, FormError)
│   ├── tables/           # Reusable data table wrappers, pagination bars
│   └── feedback/         # StatusBadge, SyncIndicator, EmptyState, Toast
├── modules/              # Domain-specific feature modules
│   ├── auth/             # Login, profile, password reset
│   ├── dashboard/        # KPI summary cards, quick action panels
│   ├── catalog/          # Product list, product form, category manager
│   ├── inventory/        # Stock overview, adjustment modals, movement history
│   ├── suppliers/        # Vendor directory, contact details
│   ├── purchasing/       # Purchase orders, intake receipt workflows
│   ├── reports/          # Valuation, movement audit, export tools
│   └── settings/         # App settings, user management, offline outbox inspector
├── services/             # HTTP API client and typed endpoint handlers
│   └── api-client.ts     # Axios or fetch client with standard interceptors
├── offline/              # Offline storage and synchronization engine
│   ├── database.ts       # Dexie.js IndexedDB schema
│   ├── outbox.ts         # Outbox queue management (enqueue, dequeue, retry)
│   └── sync-engine.ts    # Background push/pull synchronizer
├── hooks/                # Cross-cutting utility hooks (useOnlineStatus, useDebounce)
├── lib/                  # Shared utilities (formatters, cn utility from @/lib/utils)
└── types/                # Domain entity interfaces and API contract types
```

---

## 2. The Unified Component System (`src/components/ui/`)

### Rule 1: Zero One-Off Styled Elements
All domain views in `src/modules/` **MUST** consume primitives from `src/components/ui/`:
- `<Button>` with variants: `default`, `secondary`, `outline`, `ghost`, `destructive`.
- `<Badge>` with variants: `default`, `success`, `warning`, `destructive`, `outline`.
- `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>`.
- `<Input>`, `<Select>`, `<Checkbox>`.

**Never write ad-hoc raw HTML elements with custom inline tailwind styles inside domain views:**
```tsx
// ❌ WRONG (Fragmented, hard to maintain):
<button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm">
  Save Product
</button>

// ✅ CORRECT (Unified, design-token driven, easy to modify project-wide):
<Button variant="default" size="md">
  Save Product
</Button>
```

### Rule 2: Composition Over Configuration
Build composable components using the `cn()` utility from `@/lib/utils`:
```tsx
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border bg-white p-6 shadow-sm", className)}
      {...props}
    />
  )
}
```

---

## 3. Container vs. Presentation Separation in Domain Modules

Every feature module in `src/modules/<domain>/` must separate data orchestration from visual presentation:

1. **Containers (`*Container.tsx` or Feature Page)**:
   - Handle server state via TanStack Query (`useQuery`, `useMutation`).
   - Coordinate local offline writes to Dexie if offline.
   - Pass clean, typed data and callbacks to presentation components.
2. **Presentational Components**:
   - Pure React components receiving typed props.
   - Zero direct `fetch` or Dexie calls.
   - Render loading skeletons, empty states, and error states gracefully.

```tsx
// Example: src/modules/catalog/ProductListContainer.tsx
export function ProductListContainer() {
  const { data: products, isLoading, error } = useProductsQuery()

  if (isLoading) return <ProductListSkeleton />
  if (error) return <ErrorState message="Failed to load products" />
  if (!products?.length) return <EmptyState title="No products found" />

  return <ProductTable products={products} />
}
```

---

## 4. UI States & Feedback Standards

Every interactive view must handle the four core UI states:
1. **Loading State**: Subtle skeleton placeholders (avoid disruptive fullscreen spinners).
2. **Empty State**: Clear, actionable messaging with a prominent call-to-action button (e.g. "No products found. Add your first product").
3. **Error State**: Non-blocking banner with an explicit retry action and exact error messages.
4. **Offline / Sync State**: Display the `<SyncIndicator />` badge showing whether data is server-confirmed, cached, or queued in the outbox.
