import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { X, Plus, Trash2, Loader2 } from 'lucide-react'

interface RecipeProduct { id: string; name: string }
interface StockItem { id: string; name: string; unit: string; active: boolean }
interface RecipeLine { id?: string; inventory_item_id: string; quantity_per_product: string; name?: string; unit?: string }
interface RecipeRow {
  id: string
  inventory_item_id: string
  quantity_per_product: number
  inventory_items: { name: string; unit: string } | null
}

export function RecipeEditor({ product, onClose }: { product: RecipeProduct; onClose: () => void }) {
  const { business } = useAuthStore()
  const [stock, setStock] = useState<StockItem[]>([])
  const [lines, setLines] = useState<RecipeLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!business) return
    void (async () => {
      const [stockRes, recipeRes] = await Promise.all([
        supabase.from('inventory_items').select('id,name,unit,active').eq('business_id', business.id).order('name'),
        supabase.from('product_recipes').select('id,inventory_item_id,quantity_per_product,inventory_items(name,unit)').eq('product_id', product.id),
      ])
      if (stockRes.error || recipeRes.error) setError(stockRes.error?.message ?? recipeRes.error?.message ?? 'Could not load recipe')
      setStock(stockRes.data ?? [])
      setLines(((recipeRes.data ?? []) as unknown as RecipeRow[]).map((row) => ({
        id: row.id, inventory_item_id: row.inventory_item_id, quantity_per_product: String(row.quantity_per_product),
        name: row.inventory_items?.name, unit: row.inventory_items?.unit,
      })))
      setLoading(false)
    })()
  }, [business, product.id])

  async function save() {
    if (!business) return
    setSaving(true); setError('')
    if (lines.some(line => !line.inventory_item_id || !Number.isFinite(Number(line.quantity_per_product)) || Number(line.quantity_per_product) <= 0)) {
      setError('Choose an ingredient and enter a quantity greater than zero, or remove the empty row.')
      setSaving(false); return
    }
    const valid = lines
    if (new Set(valid.map(line => line.inventory_item_id)).size !== valid.length) {
      setError('Choose each ingredient only once.'); setSaving(false); return
    }
    const result = await supabase.rpc('save_product_recipe', {
      p_product_id: product.id,
      p_items: valid.map(line => ({ inventory_item_id: line.inventory_item_id, quantity_per_product: Number(line.quantity_per_product) })),
    })
    if (result.error) { setError(result.error.message); setSaving(false); return }
    setSaving(false); onClose()
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={`Recipe for ${product.name}`}>
    <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-xl">
      <header className="flex items-start justify-between border-b border-border p-5">
        <div><h2 className="text-lg font-semibold">Recipe: {product.name}</h2><p className="mt-1 text-sm text-muted-foreground">Amounts are consumed for one sale unit, in each ingredient’s inventory unit. Selling 50 units multiplies every recipe amount by 50.</p></div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </header>
      <div className="space-y-3 p-5">
        {loading ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : <>
          {!stock.length && <p className="rounded-lg bg-muted p-3 text-sm">Add ingredient stock items on the Inventory page first.</p>}
          {lines.map((line, index) => <div key={line.id ?? index} className="flex items-center gap-2">
            <select value={line.inventory_item_id} onChange={e => setLines(prev => prev.map((item, i) => i === index ? { ...item, inventory_item_id: e.target.value } : item))} className="min-w-0 flex-1 rounded-md border border-input bg-background p-2 text-sm">
              <option value="">Choose ingredient</option>{stock.map(item => <option key={item.id} value={item.id} disabled={!item.active}>{item.name} ({item.unit}){item.active ? '' : ' — inactive'}</option>)}
            </select>
            <input type="number" min="0.001" step="0.001" value={line.quantity_per_product} onChange={e => setLines(prev => prev.map((item, i) => i === index ? { ...item, quantity_per_product: e.target.value } : item))} placeholder="Amount" className="w-28 rounded-md border border-input bg-background p-2 text-sm" />
            <span className="w-10 text-sm text-muted-foreground">{stock.find(item => item.id === line.inventory_item_id)?.unit ?? line.unit ?? ''}</span>
            <button onClick={() => setLines(prev => prev.filter((_, i) => i !== index))} className="rounded p-2 text-muted-foreground hover:bg-muted" aria-label="Remove ingredient"><Trash2 className="h-4 w-4" /></button>
          </div>)}
          <button onClick={() => setLines(prev => [...prev, { inventory_item_id: '', quantity_per_product: '' }])} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"><Plus className="h-4 w-4" /> Add ingredient</button>
        </>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-border p-4">
        <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">Cancel</button>
        <button disabled={saving || loading} onClick={() => void save()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Saving…' : 'Save recipe'}</button>
      </footer>
    </div>
  </div>
}
