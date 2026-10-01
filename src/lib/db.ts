import Dexie, { Table } from 'dexie'
import type { LocalProduct, LocalCategory, LocalSale, LocalDraft, LocalTable } from '@/types/local'

/**
 * POS local database using Dexie (IndexedDB abstraction).
 *
 * This database is the primary data source for the POS screen.
 * It operates independently of network connectivity.
 *
 * Design principles:
 * - Products and categories are synced FROM Supabase on login / Realtime update
 * - Sales are created locally first, then synced TO Supabase when online
 * - Drafts stay local until finalized with PIN + payment
 * - Sync state (PENDING/SYNCING/SYNCED/FAILED) lives ONLY here, never in Supabase
 * - UUIDs are the authoritative identity — never use local auto-increment IDs
 */
export class PosDatabase extends Dexie {
  products!: Table<LocalProduct>
  categories!: Table<LocalCategory>
  sales!: Table<LocalSale>
  drafts!: Table<LocalDraft>
  diningTables!: Table<LocalTable>

  constructor() {
    super('pos_mario_db')

    this.version(1).stores({
      products:   'id, business_id, category_id, active',
      categories: 'id, business_id, active',
      sales:      'id, business_id, sync_status, employee_id, created_at',
    })

    this.version(2).stores({
      products:   'id, business_id, category_id, active',
      categories: 'id, business_id, active',
      sales:      'id, business_id, sync_status, employee_id, created_at',
      drafts:     'id, business_id, updated_at',
    })

    this.version(3).stores({
      products:   'id, business_id, category_id, active',
      categories: 'id, business_id, active',
      sales:      'id, business_id, sync_status, employee_id, created_at',
      drafts:     'id, business_id, updated_at, table_id',
      tables:     'id, business_id, name',
    })
  }
}

export const db = new PosDatabase()
