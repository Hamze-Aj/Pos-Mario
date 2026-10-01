// ─── Local (Dexie/IndexedDB) Types ───────────────────────────────────────────
// These types live only in the browser's local database.
// Sync metadata fields are never sent to Supabase.

export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED'

export interface LocalProduct {
  /** UUID — matches Supabase products.id exactly */
  id: string
  business_id: string
  category_id: string | null
  name: string
  /** Trusted price from the last successful Supabase sync */
  price: number
  /** Incremented in Supabase on every price change */
  price_version: number
  active: boolean
  image_url: string | null
  /** ISO timestamp of when this record was last pulled from Supabase */
  last_synced_at: string
}

export interface LocalCategory {
  id: string
  business_id: string
  name: string
  color: string | null
  sort_order: number
  active: boolean
}

export interface LocalSaleItem {
  product_id: string
  /** Captured from LocalProduct.name at sale creation time — immutable */
  product_name_snapshot: string
  /** Captured from LocalProduct.price at sale creation time — immutable */
  unit_price_snapshot: number
  /** Captured from LocalProduct.price_version at sale creation time */
  price_version_used: number
  quantity: number
  discount_amount: number
  /** (unit_price_snapshot * quantity) - discount_amount */
  subtotal: number
}

export interface LocalSale {
  /** Pre-generated UUID v4 — this is the authoritative sync identity */
  id: string
  business_id: string
  employee_id: string
  /** Identifies which physical POS device created the sale */
  device_id: string
  /** Embedded array — avoids a second IndexedDB lookup for receipts */
  items: LocalSaleItem[]
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  payment_method: string
  payment_reference: string | null
  notes: string | null
  /** ISO timestamp — set at creation time and never mutated */
  created_at: string

  // ─── Sync metadata (local-only, never sent to Supabase) ───────────────────
  /** Current synchronization state */
  sync_status: SyncStatus
  /** Number of sync attempts made */
  sync_attempts: number
  /** ISO timestamp of last sync attempt */
  last_sync_attempt: string | null
  /** Last error message if sync_status = 'FAILED' */
  sync_error: string | null
  /** Human-readable sale number — populated after successful sync */
  sale_number: string | null
}


export interface LocalDraftItem {
  product_id: string
  product_name_snapshot: string
  unit_price_snapshot: number
  price_version_used: number
  quantity: number
  discount_amount: number
  subtotal: number
}

/** Local-only editable draft order (not synced until finalized via complete_sale) */
export interface LocalDraft {
  id: string
  business_id: string
  items: LocalDraftItem[]
  discount_amount: number
  table_id: string | null
  table_name_snapshot: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** A dining table registered for this business on this POS device. */
export interface LocalTable {
  id: string
  business_id: string
  name: string
  created_at: string
}
