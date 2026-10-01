import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProducts } from '@/hooks/useProducts'
import { useCartStore } from '@/store/cartStore'
import { useAuthStore } from '@/store/authStore'
import { CategoryFilter } from '@/components/pos/CategoryFilter'
import { ProductGrid } from '@/components/pos/ProductGrid'
import { Cart } from '@/components/pos/Cart'
import { PaymentModal } from '@/components/pos/PaymentModal'
import { ReceiptModal } from '@/components/pos/ReceiptModal'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { deleteDraft, listDrafts, listTables, saveDraft } from '@/lib/saleService'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { FileText, Search, Trash2 } from 'lucide-react'
import type { LocalDraft, LocalSale, LocalTable } from '@/types/local'
import type { CartItem } from '@/store/cartStore'

export function POSPage() {
  const { products, categories } = useProducts()
  const { clearCart, loadFromDraft, discountTotal } = useCartStore()
  const { business } = useAuthStore()

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [completedSale, setCompletedSale] = useState<LocalSale | null>(null)
  const [drafts, setDrafts] = useState<LocalDraft[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [draftMsg, setDraftMsg] = useState<string | null>(null)
  const [tables, setTables] = useState<LocalTable[]>([])
  const [selectedTableId, setSelectedTableId] = useState('')

  const refreshDrafts = useCallback(async () => {
    if (!business) return
    const rows = await listDrafts(business.id)
    setDrafts(rows)
    setTables(await listTables(business.id))
  }, [business])

  useEffect(() => {
    refreshDrafts()
  }, [refreshDrafts])

  const filteredProducts = useMemo(() => {
    let result = products ?? []
    if (activeCategory) result = result.filter(p => p.category_id === activeCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p => p.name.toLowerCase().includes(q))
    }
    return result
  }, [products, activeCategory, search])

  function handleSaleComplete(sale: LocalSale) {
    clearCart()
    setSelectedTableId('')
    setPaymentOpen(false)
    setActiveDraftId(null)
    setCompletedSale(sale)
    refreshDrafts()
  }

  async function handleSaveDraft() {
    if (!business) return
    const { items } = useCartStore.getState()
    const draft = await saveDraft({
      businessId: business.id,
      items,
      discountAmount: discountTotal,
      draftId: activeDraftId,
      tableId: selectedTableId || null,
      tableName: tables.find(table => table.id === selectedTableId)?.name ?? null,
    })
    setActiveDraftId(draft.id)
    setDraftMsg(activeDraftId ? 'Draft updated' : 'Draft saved')
    clearCart()
    setSelectedTableId('')
    setActiveDraftId(null)
    await refreshDrafts()
    setTimeout(() => setDraftMsg(null), 2500)
  }

  function handleLoadDraft(draft: LocalDraft) {
    const items: CartItem[] = draft.items.map(i => ({
      product_id: i.product_id,
      product_name: i.product_name_snapshot,
      unit_price: i.unit_price_snapshot,
      price_version: i.price_version_used,
      quantity: i.quantity,
      discount_amount: i.discount_amount,
      subtotal: i.subtotal,
    }))
    loadFromDraft(items, draft.discount_amount)
    setActiveDraftId(draft.id)
    setSelectedTableId(draft.table_id ?? '')
  }

  async function handleDeleteDraft(id: string) {
    await deleteDraft(id)
    if (activeDraftId === id) {
      setActiveDraftId(null)
      clearCart()
    }
    await refreshDrafts()
  }

  return (
    <div className="flex h-full flex-col md:flex-row overflow-hidden">
      {/* Left: Product Browser */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
        {/* Search */}
        <div className="px-4 pt-4 pb-3 bg-background sticky top-0 z-10 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="pos-search"
              type="text"
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-input bg-muted/30 pl-9 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
            />
          </div>

          <div className="mt-3">
            <CategoryFilter
              categories={categories ?? []}
              activeCategory={activeCategory}
              onSelect={setActiveCategory}
            />
          </div>

          {draftMsg && (
            <p className="mt-2 text-xs text-emerald-600 font-medium">{draftMsg}</p>
          )}

          {drafts.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-3.5 w-3.5 text-amber-700" />
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                  Draft orders ({drafts.length})
                </p>
                <StatusBadge status="DRAFT" className="ml-auto" />
              </div>
              <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                {drafts.map(draft => {
                  const total = draft.items.reduce((s, i) => s + i.subtotal, 0) - draft.discount_amount
                  const label = draft.items.map(i => `${i.quantity}× ${i.product_name_snapshot}`).slice(0, 2).join(', ')
                  return (
                    <li
                      key={draft.id}
                      className={`flex items-center gap-2 rounded-lg bg-background/70 px-2.5 py-2 text-xs border ${
                        activeDraftId === draft.id ? 'border-primary' : 'border-transparent'
                      }`}
                    >
                      <button
                        id={`draft-load-${draft.id}`}
                        onClick={() => handleLoadDraft(draft)}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="font-medium truncate">{label || 'Empty draft'}</p>
                        <p className="text-muted-foreground">
                          {draft.table_name_snapshot ? `${draft.table_name_snapshot} · ` : ''}{formatDateTime(draft.updated_at)} · {formatCurrency(Math.max(total, 0))}
                        </p>
                      </button>
                      <button
                        id={`draft-delete-${draft.id}`}
                        onClick={() => handleDeleteDraft(draft.id)}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title="Delete draft"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <ProductGrid products={filteredProducts} />
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-full md:w-96 flex-shrink-0 flex flex-col border-t md:border-t-0 border-border max-h-96 md:max-h-full">
        <Cart
          onCheckout={() => setPaymentOpen(true)}
          onSaveDraft={handleSaveDraft}
          activeDraftId={activeDraftId}
          tables={tables}
          selectedTableId={selectedTableId}
          onTableChange={setSelectedTableId}
        />
      </div>

      <PaymentModal
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        onComplete={handleSaleComplete}
        draftId={activeDraftId}
      />

      {completedSale && (
        <ReceiptModal
          sale={completedSale}
          open={!!completedSale}
          onOpenChange={open => !open && setCompletedSale(null)}
        />
      )}
    </div>
  )
}
