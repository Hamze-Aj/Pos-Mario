import { v4 as uuidv4 } from 'uuid'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { getDeviceId, multiplyDecimals, subtractDecimals } from '@/lib/utils'
import type { CartItem } from '@/store/cartStore'
import type { LocalSale, LocalDraft, LocalTable } from '@/types/local'


export interface CreateSaleInput {
  businessId: string
  /** Fallback employee id (used offline / when PIN already resolved) */
  employeeId: string
  items: CartItem[]
  discountAmount: number
  paymentMethod: string
  paymentReference: string | null
  notes: string | null
  /** 4-digit PIN — sale is attributed to the matching employee */
  pin: string
  /** When finalizing a local draft, pass its id so it can be removed after success */
  draftId?: string | null
}



/**
 * Create a sale.
 *
 * This is the unified sale creation entry point.
 * Regardless of network status, the sale is ALWAYS saved locally first.
 * If online, an immediate sync attempt is made.
 *
 * PRICE SAFETY:
 * - Online: Postgres RPC reads prices from the database (authoritative)
 * - Offline: Locally cached prices (from last sync) are used for the local record
 *   The price_version_used is recorded so price drift can be detected on sync
 *
 * IDEMPOTENCY:
 * - A UUID is generated before saving. The same UUID is sent to the RPC.
 * - If the network request times out and is retried, the RPC's existence
 *   check prevents duplicate records.
 *
 * PIN ATTRIBUTION:
 * - Online: p_pin is sent to complete_sale which resolves the responsible employee
 * - Offline: PIN is validated via lookup_employee_by_pin when online is required for
 *   first attribution; if already resolved, employeeId is stored for later sync
 */
export async function createSale(input: CreateSaleInput): Promise<LocalSale> {
  const saleId = uuidv4()
  const deviceId = getDeviceId()
  const now = new Date().toISOString()

  if (!/^\d{4}$/.test(input.pin)) {
    throw new Error('PIN must be exactly 4 digits')
  }

  let responsibleEmployeeId = input.employeeId

  // Prefer online PIN lookup so local record stores the correct employee
  if (navigator.onLine) {
    const { data: emp, error: pinErr } = await supabase.rpc('lookup_employee_by_pin', {
      p_business_id: input.businessId,
      p_pin: input.pin,
    })
    if (pinErr) {
      const msg = pinErr.message || 'Invalid PIN'
      throw new Error(msg.includes('INVALID_PIN') ? 'Invalid PIN' : msg)
    }
    const resolved = emp as { id?: string } | null
    if (!resolved?.id) throw new Error('Invalid PIN')
    responsibleEmployeeId = resolved.id
  }

  const localItems = input.items.map((item) => ({
    product_id: item.product_id,
    product_name_snapshot: item.product_name,
    unit_price_snapshot: item.unit_price,
    price_version_used: item.price_version,
    quantity: item.quantity,
    discount_amount: item.discount_amount,
    subtotal: subtractDecimals(
      multiplyDecimals(item.unit_price, item.quantity),
      item.discount_amount
    ),
  }))

  const subtotal = localItems.reduce((sum, i) => sum + i.subtotal, 0)
  const total = subtractDecimals(subtotal, input.discountAmount)

  const localSale: LocalSale = {
    id: saleId,
    business_id: input.businessId,
    employee_id: responsibleEmployeeId,
    device_id: deviceId,
    items: localItems,
    subtotal,
    discount_amount: input.discountAmount,
    tax_amount: 0,
    total_amount: total,
    payment_method: input.paymentMethod,
    payment_reference: input.paymentReference,
    notes: input.notes,
    created_at: now,
    sync_status: 'PENDING',
    sync_attempts: 0,
    last_sync_attempt: null,
    sync_error: null,
    sale_number: null,
  }

  await db.sales.add(localSale)

  if (navigator.onLine) {
    try {
      const { data, error } = await supabase.rpc('complete_sale', {
        p_sale_id: saleId,
        p_employee_id: responsibleEmployeeId,
        p_business_id: input.businessId,
        p_device_id: deviceId,
        p_items: input.items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          discount_amount: item.discount_amount,
        })),
        p_payment_method: input.paymentMethod,
        p_payment_reference: input.paymentReference,
        p_sale_discount: input.discountAmount,
        p_notes: input.notes,
        p_pin: input.pin,
      })

      if (error) throw error

      await db.sales.update(saleId, {
        sync_status: 'SYNCED',
        sync_error: null,
        sale_number: (data as { sale_number: string })?.sale_number ?? null,
        employee_id: (data as { employee_id?: string })?.employee_id ?? responsibleEmployeeId,
      })

      if (input.draftId) {
        await db.drafts.delete(input.draftId)
      }

      const syncedSale = await db.sales.get(saleId)
      return syncedSale!
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed'
      // Surface PIN errors to the UI instead of silently queuing
      if (errorMessage.includes('INVALID_PIN') || errorMessage.toLowerCase().includes('invalid pin')) {
        await db.sales.delete(saleId)
        throw new Error('Invalid PIN')
      }
      await db.sales.update(saleId, {
        sync_status: 'FAILED',
        sync_attempts: 1,
        last_sync_attempt: now,
        sync_error: errorMessage,
      })

      if (input.draftId) {
        await db.drafts.delete(input.draftId)
      }

      const failedSale = await db.sales.get(saleId)
      return failedSale!
    }
  }

  // Offline path: PIN must be validated against Supabase
  await db.sales.delete(saleId)
  throw new Error('PIN validation requires an internet connection to confirm the sale.')
}

export async function voidSale(saleId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('void_sale', {
    p_sale_id: saleId,
    p_reason: reason ?? null,
  })
  if (error) throw error
}

export async function saveDraft(input: {
  businessId: string
  items: CartItem[]
  discountAmount: number
  notes?: string | null
  draftId?: string | null
  tableId?: string | null
  tableName?: string | null
}): Promise<LocalDraft> {
  if (input.items.length === 0) {
    throw new Error('Cannot save an empty draft')
  }

  const now = new Date().toISOString()
  const items = input.items.map((item) => ({
    product_id: item.product_id,
    product_name_snapshot: item.product_name,
    unit_price_snapshot: item.unit_price,
    price_version_used: item.price_version,
    quantity: item.quantity,
    discount_amount: item.discount_amount,
    subtotal: subtractDecimals(
      multiplyDecimals(item.unit_price, item.quantity),
      item.discount_amount
    ),
  }))

  if (input.draftId) {
    const existing = await db.drafts.get(input.draftId)
    if (existing) {
      const updated: LocalDraft = {
        ...existing,
        items,
        discount_amount: input.discountAmount,
        table_id: input.tableId ?? null,
        table_name_snapshot: input.tableName ?? null,
        notes: input.notes ?? existing.notes,
        updated_at: now,
      }
      await db.drafts.put(updated)
      return updated
    }
  }

  const draft: LocalDraft = {
    id: uuidv4(),
    business_id: input.businessId,
    items,
    discount_amount: input.discountAmount,
    table_id: input.tableId ?? null,
    table_name_snapshot: input.tableName ?? null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  }
  await db.drafts.add(draft)
  return draft
}

export async function listTables(businessId: string): Promise<LocalTable[]> {
  return db.tables.where('business_id').equals(businessId).sortBy('name')
}

export async function createTable(businessId: string, name: string): Promise<LocalTable> {
  const normalizedName = name.trim()
  if (!normalizedName) throw new Error('Enter a table name')
  const existing = await listTables(businessId)
  if (existing.some(table => table.name.toLowerCase() === normalizedName.toLowerCase())) {
    throw new Error('A table with this name already exists')
  }
  const table: LocalTable = { id: uuidv4(), business_id: businessId, name: normalizedName, created_at: new Date().toISOString() }
  await db.tables.add(table)
  return table
}

export async function deleteTable(tableId: string): Promise<void> {
  await db.tables.delete(tableId)
}

export async function listDrafts(businessId: string): Promise<LocalDraft[]> {
  return db.drafts
    .where('business_id')
    .equals(businessId)
    .reverse()
    .sortBy('updated_at')
}

export async function deleteDraft(draftId: string): Promise<void> {
  await db.drafts.delete(draftId)
}

export async function lookupEmployeeByPin(
  businessId: string,
  pin: string,
): Promise<{ id: string; full_name: string; role: string }> {
  const { data, error } = await supabase.rpc('lookup_employee_by_pin', {
    p_business_id: businessId,
    p_pin: pin,
  })
  if (error) {
    const msg = error.message || 'Invalid PIN'
    throw new Error(msg.includes('INVALID_PIN') ? 'Invalid PIN' : msg)
  }
  const emp = data as { id: string; full_name: string; role: string } | null
  if (!emp?.id) throw new Error('Invalid PIN')
  return emp
}
