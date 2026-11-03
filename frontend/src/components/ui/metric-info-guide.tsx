import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MetricInfoGuideProps {
  title: string
  formula?: string
  description: string
  note?: string
  className?: string
  align?: 'left' | 'center' | 'right'
  side?: 'bottom' | 'top'
}

export function MetricInfoGuide({
  title,
  formula,
  description,
  note,
  className,
  align = 'center',
  side = 'bottom',
}: MetricInfoGuideProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const showTooltip = isOpen || isHovered

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    if (!showTooltip) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setIsHovered(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showTooltip])

  return (
    <div
      ref={containerRef}
      className={cn('relative inline-flex items-center', showTooltip ? 'z-50' : 'z-10', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        aria-label={`Calculation guide for ${title}`}
        aria-expanded={showTooltip}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        className={cn(
          'inline-flex items-center justify-center h-4 w-4 rounded-full transition-all cursor-pointer',
          showTooltip
            ? 'text-blue-600 bg-blue-50 ring-2 ring-blue-100'
            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
        )}
      >
        <Info className="h-3.5 w-3.5 shrink-0" />
      </button>

      {showTooltip && (
        <div
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'absolute z-50 w-76 rounded-xl bg-white p-3.5 text-left text-xs shadow-xl border border-slate-200/90 transition-all duration-150 animate-in fade-in-0 zoom-in-95',
            side === 'bottom'
              ? 'top-full mt-2.5 before:absolute before:-top-2.5 before:left-0 before:w-full before:h-2.5'
              : 'bottom-full mb-2.5 before:absolute before:-bottom-2.5 before:left-0 before:w-full before:h-2.5',
            align === 'left' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
            align === 'right' && 'right-0'
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
            <h4 className="font-semibold text-slate-900 text-xs tracking-tight">{title}</h4>
          </div>

          {/* Formula pill */}
          {formula && (
            <div className="mt-2.5 rounded-md bg-slate-50 border border-slate-200/70 px-2.5 py-1.5">
              <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                Formula
              </span>
              <p className="font-mono text-2xs font-semibold text-slate-800 leading-snug break-words">
                {formula}
              </p>
            </div>
          )}

          {/* Description */}
          <p className="mt-2 text-2xs text-slate-600 leading-relaxed font-normal">
            {description}
          </p>

          {/* Optional context note */}
          {note && (
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-start gap-1 text-3xs text-slate-400">
              <span className="font-medium text-slate-500">Note:</span>
              <span className="leading-snug">{note}</span>
            </div>
          )}

          {/* Arrow */}
          <div
            className={cn(
              'absolute h-2 w-2 rotate-45 bg-white',
              side === 'bottom'
                ? '-top-1 border-l border-t border-slate-200/90'
                : '-bottom-1 border-r border-b border-slate-200/90',
              align === 'left' && 'left-3',
              align === 'center' && 'left-1/2 -translate-x-1/2',
              align === 'right' && 'right-3'
            )}
          />
        </div>
      )}
    </div>
  )
}
