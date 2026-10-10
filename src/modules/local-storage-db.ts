// --- INTERFACES PARA TABELAS OFFLINE ---

export interface OfflineProduct {
  id: string
  sku: string
  name: string
  costPrice: number
  active: boolean
}

export interface OfflineLocation {
  id: string
  name: string
  city: string
  state: string
  active: boolean
}

export interface OfflineBasePrice {
  id: string
  productId: string
  locationId: string
  price: number
}

export interface OfflineSellerProfile {
  sellerId: string
  defaultMarginPercent: number
  minMarginPercent: number
  maxMarginPercent: number
  allowOrderMarginChange: boolean
}

export interface OfflineVolumeDiscount {
  id: string
  productId?: string | null
  minQuantity: number
  discountPercent: number
}

export interface OfflineOrderItem {
  productId: string
  productName: string
  quantity: number
  enteredUnit?: string
  finalUnitPrice: number
}

export interface OfflineDraftOrder {
  localId?: number
  serverId?: string
  syncId?: string
  syncStartedAt?: string
  customerId: string
  notes?: string
  sellerId?: string
  total: number
  items: OfflineOrderItem[]
  createdAt: string
  syncStatus: 'PENDING_SYNC' | 'SYNCING' | 'SYNCED' | 'SYNC_ERROR'
  syncError?: string | null
}

export interface OfflinePageSnapshot {
  id: string
  userId: string
  role: string
  route: string
  savedAt: string
  data: unknown
}

type Selector<T> = keyof T | Partial<T>

const STORAGE_PREFIX = 'sistema-vendas:offline:'

function readTable<T>(name: string): T[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${name}`)
  return raw ? JSON.parse(raw) as T[] : []
}

function writeTable<T>(name: string, records: T[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`${STORAGE_PREFIX}${name}`, JSON.stringify(records))
}

class LocalStorageCollection<T extends object> {
  private predicates: Array<(record: T) => boolean> = []
  private field?: keyof T

  constructor(private table: LocalStorageTable<T>, selector: Selector<T>) {
    if (typeof selector === 'object') {
      this.predicates.push((record) =>
        Object.entries(selector).every(([key, value]) =>
          (record as Record<string, unknown>)[key] === value,
        ),
      )
    } else {
      this.field = selector
    }
  }

  equals(value: unknown) {
    if (this.field === undefined) throw new Error('equals requer um campo selecionado.')
    this.predicates.push((record) => record[this.field!] === value)
    return this
  }

  anyOf(...values: unknown[]) {
    if (this.field === undefined) throw new Error('anyOf requer um campo selecionado.')
    this.predicates.push((record) => values.includes(record[this.field!]))
    return this
  }

  and(predicate: (record: T) => boolean) {
    this.predicates.push(predicate)
    return this
  }

  filter(predicate: (record: T) => boolean) {
    return this.and(predicate)
  }

  async toArray(): Promise<T[]> {
    return (await this.table.toArray()).filter((record) => this.matches(record))
  }

  async first(): Promise<T | undefined> {
    return (await this.toArray())[0]
  }

  async count(): Promise<number> {
    return (await this.toArray()).length
  }

  async delete(): Promise<number> {
    const records = await this.table.toArray()
    const kept = records.filter((record) => !this.matches(record))
    writeTable(this.table.name, kept)
    return records.length - kept.length
  }

  private matches(record: T) {
    return this.predicates.every((predicate) => predicate(record))
  }
}

class LocalStorageTable<T extends object> {
  constructor(
    readonly name: string,
    private keyField: keyof T,
    private autoIncrement = false,
  ) {}

  async toArray(): Promise<T[]> {
    return readTable<T>(this.name)
  }

  async get(key: unknown): Promise<T | undefined> {
    return (await this.toArray()).find((record) => record[this.keyField] === key)
  }

  async add(record: T): Promise<T[keyof T]> {
    const records = await this.toArray()
    const value = { ...record }
    if (this.autoIncrement && value[this.keyField] === undefined) {
      const highestId = records.reduce((max, item) => Math.max(max, Number(item[this.keyField]) || 0), 0)
      Object.assign(value, { [this.keyField]: highestId + 1 })
    }
    if (records.some((item) => item[this.keyField] === value[this.keyField])) {
      throw new Error(`Registro duplicado na tabela ${this.name}.`)
    }
    writeTable(this.name, [...records, value])
    return value[this.keyField]
  }

  async put(record: T): Promise<T[keyof T]> {
    const records = await this.toArray()
    const index = records.findIndex((item) => item[this.keyField] === record[this.keyField])
    if (index < 0) records.push(record)
    else records[index] = record
    writeTable(this.name, records)
    return record[this.keyField]
  }

  async bulkPut(records: T[]): Promise<T[keyof T][]> {
    for (const record of records) await this.put(record)
    return records.map((record) => record[this.keyField])
  }

  async update(key: unknown, changes: Partial<T>): Promise<number> {
    const records = await this.toArray()
    const index = records.findIndex((record) => record[this.keyField] === key)
    if (index < 0) return 0
    records[index] = { ...records[index], ...changes }
    writeTable(this.name, records)
    return 1
  }

  async clear() {
    writeTable(this.name, [])
  }

  where(selector: Selector<T>) {
    return new LocalStorageCollection(this, selector)
  }
}

export class LocalSalesDB {
  products = new LocalStorageTable<OfflineProduct>('products', 'id')
  locations = new LocalStorageTable<OfflineLocation>('locations', 'id')
  basePrices = new LocalStorageTable<OfflineBasePrice>('basePrices', 'id')
  sellerProfiles = new LocalStorageTable<OfflineSellerProfile>('sellerProfiles', 'sellerId')
  volumeDiscounts = new LocalStorageTable<OfflineVolumeDiscount>('volumeDiscounts', 'id')
  draftOrders = new LocalStorageTable<OfflineDraftOrder>('draftOrders', 'localId', true)
  offlinePageSnapshots = new LocalStorageTable<OfflinePageSnapshot>('offlinePageSnapshots', 'id')

  async transaction<T>(_mode: string, _tables: unknown, operation: () => Promise<T>): Promise<T> {
    return operation()
  }

  async delete() {
    await Promise.all([
      this.products.clear(), this.locations.clear(), this.basePrices.clear(),
      this.sellerProfiles.clear(), this.volumeDiscounts.clear(), this.draftOrders.clear(),
      this.offlinePageSnapshots.clear(),
    ])
  }

  async open() {}
}

export const db = new LocalSalesDB()

// --- CALCULO OFFLINE DO PREÇO FINAL ---
// Fórmula: FinalPrice = BasePrice * (1 + Margin / 100) * (1 - Discount / 100)
export function calculateOfflinePrice(
  basePrice: number,
  marginPercent: number,
  discountPercent: number = 0
): number {
  if (basePrice <= 0) return 0
  const priceWithMargin = basePrice * (1 + marginPercent / 100)
  const finalPrice = priceWithMargin * (1 - discountPercent / 100)
  return Math.max(0, finalPrice)
}