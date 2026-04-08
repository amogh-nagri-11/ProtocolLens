import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { InferredSchema } from './gemini'
import type { DriftReport } from './drift'

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
  drifts: {
    key: string
    value: DriftReport
  }
  spec: {
    key: string 
    value: unknown
  }
}

let db: IDBPDatabase<ProtocolLensDB>

export async function getDB() {
  if (!db) {
    db = await openDB<ProtocolLensDB>('protocol-lens', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('schemas')
          db.createObjectStore('entries', { autoIncrement: true })
        }
        if (oldVersion < 2) {
          db.createObjectStore('drifts') 
          db.createObjectStore('spec')
        }
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

export async function saveDrift(report: DriftReport) {
  const db = await getDB() 
  await db.put('drifts', report, report.endpoint) 
}

export async function getDrift(endpoint: string) { 
  const db = await getDB() 
  return (await db.get('drifts', endpoint)) ?? null
}

export async function saveSpec(spec: unknown) {
  const db = await getDB() 
  await db.put('spec', spec, 'current') 
}

export async function getSpec() {
  const db = await getDB() 
  return (await db.get('spec', 'current')) ?? null
}