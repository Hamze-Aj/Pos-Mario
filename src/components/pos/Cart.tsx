import { useState } from 'react'
import { useCartStore } from '@/store/cartStore'
import { CartItem } from './CartItem'
import { formatCurrency } from '@/lib/utils'
import { ShoppingCart, Trash2, Tag, FileText, Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import type { LocalTable } from '@/types/local'

interface CartProps {
  onCheckout: () => void
  onSaveDraft: () => Promise<void> | void
  activeDraftId?: string | null
  tables: LocalTable[]
  selectedTableId: string
  onTableChange: (tableId: string) => void
}

export function Cart({ onCheckout, onSaveDraft, activeDraftId, tables, selectedTableId, onTableChange }: CartProps) {
  const { items, subtotal, discountTotal, taxTotal, grandTotal, clearCart, setDiscount } = useCartStore()
  const [discountInput, setDiscountInput] = useState('')
  const [discountMode, setDiscountMode] = useState<'percent' | 'fixed'>('fixed')
  const [savingDraft, setSavingDraft] = useState(false)

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  function applyDiscount() {
    const val = parseFloat(discountInput)
    if (isNaN(val) || val < 0) return
    if (discountMode === 'percent') {
      const pct = Math.min(val, 100) / 100
      setDiscount(pct * subtotal)
    } else {
      setDiscount(Math.min(val, subtotal))
    }
  }

  async function handleSaveDraft() {
    setSavingDraft(true)
    try {
      await onSaveDraft()
    } finally {
      setSavingDraft(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">
            {activeDraftId ? 'Editing draft' : 'Cart'}
            {itemCount > 0 && (
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {itemCount}
              </span>
            )}
          </h2>
        </div>
        {items.length > 0 && (
          <button
            id="cart-clear"
            onClick={clearCart}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4">
        {items.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Cart is empty"
            description="Tap a product to add it"
            className="py-8"
          />
        ) : (
          items.map(item => <CartItem key={item.product_id} item={item} />)
        )}
      </div>

      {/* Discount + Totals */}
      {items.length > 0 && (
        <div className="border-t border-border p-4 space-y-3 bg-muted/30">
          <div>
            <label htmlFor="cart-table" className="mb-1.5 block text-xs font-medium text-muted-foreground">Order table</label>
            <select id="cart-table" value={selectedTableId} onChange={e => onTableChange(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">No table selected</option>
              {tables.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}
            </select>
            {tables.length === 0 && <p className="mt-1 text-[11px] text-muted-foreground">Add tables in Settings to assign orders.</p>}
          </div>
          {/* Discount row */}
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="flex flex-1 rounded-lg border border-input overflow-hidden bg-background">
              <input
                id="cart-discount-input"
                type="number"
                min="0"
                placeholder="Discount"
                value={discountInput}
                onChange={e => setDiscountInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyDiscount()}
                className="flex-1 px-3 py-1.5 text-sm bg-transparent focus:outline-none min-w-0"
              />
              <button
                id="cart-discount-mode"
                onClick={() => setDiscountMode(m => m === 'fixed' ? 'percent' : 'fixed')}
                className="px-3 border-l border-input text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                {discountMode === 'fixed' ? 'ETB' : '%'}
              </button>
            </div>
            <button
              id="cart-discount-apply"
              onClick={applyDiscount}
              className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
            >
              Apply
            </button>
          </div>

          {/* Totals */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span className="tabular-nums">−{formatCurrency(discountTotal)}</span>
              </div>
            )}
            {taxTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">{formatCurrency(taxTotal)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
              <span>Total</span>
              <span className="tabular-nums text-primary">{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              id="cart-save-draft"
              onClick={handleSaveDraft}
              disabled={items.length === 0 || savingDraft}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background py-3 text-sm font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {activeDraftId ? 'Update draft' : 'Save draft'}
            </button>
            <button
              id="cart-checkout"
              onClick={onCheckout}
              disabled={items.length === 0}
              className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              Charge
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
