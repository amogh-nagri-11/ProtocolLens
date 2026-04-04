import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { InferredSchema } from './gemini'

// Tells TypeScript the shape of our database
interface ProtocolLensDB extends DBSchema {
  schemas: {
    key: string           // endpoint string e.g. "GET /api/users"
    value: InferredSchema
  }
  entries: {
    key: number           // auto-incremented
    value: {
      url: string
      method: string
      status: number
      timestamp: number
      payload: unknown
    }
  }
}

let db: IDBPDatabase<ProtocolLensDB>

export async function getDB() {
  if (!db) {
    db = await openDB<ProtocolLensDB>('protocol-lens', 1, {
      upgrade(db) {
        db.createObjectStore('schemas')
        db.createObjectStore('entries', { autoIncrement: true })
      },
    })
  }
  return db
}

export async function saveSchema(schema: InferredSchema) {
  const db = await getDB()
  await db.put('schemas', schema, schema.endpoint)
}

export async function getSchema(endpoint: string) {
  const db = await getDB()
  return db.get('schemas', endpoint)
}

export async function getAllSchemas() {
  const db = await getDB()
  return db.getAll('schemas')
}

export async function saveEntry(entry: ProtocolLensDB['entries']['value']) {
  const db = await getDB()
  await db.add('entries', entry)
}