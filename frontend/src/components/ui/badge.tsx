import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const baseStyles = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors'

  const variantStyles = {
    default: 'bg-blue-100 text-blue-800',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    destructive: 'bg-rose-100 text-rose-800',
    outline: 'border border-slate-300 text-slate-700 bg-white',
  }

  return (
    <div className={cn(baseStyles, variantStyles[variant], className)} {...props} />
  )
}
