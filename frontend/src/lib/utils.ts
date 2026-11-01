import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Standard utility function to merge Tailwind CSS classes cleanly.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Primary currency symbol across Uniflow IMS platform (Philippine Peso).
 */
export const CURRENCY_SYMBOL = '₱'

/**
 * Standard currency formatter adhering to Philippine Peso (PHP / ₱) formatting.
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options?: { showSymbol?: boolean; decimals?: number }
): string {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount || '0')) || 0
  const decimals = options?.decimals ?? 2
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return options?.showSymbol === false ? formatted : `${CURRENCY_SYMBOL}${formatted}`
}
