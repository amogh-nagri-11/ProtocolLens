// Represents one intercepted request
export type HarEntry = {
  url: string
  method: string
  status: number
  timestamp: number
  payload: unknown
}

// Groups multiple responses for the same endpoint
export type EndpointBatch = {
  method: string
  path: string
  samples: unknown[]  // up to 10 payloads
}

// Keyed by "METHOD /path"
const batchMap = new Map<string, EndpointBatch>()

const MAX_SAMPLES = 10

export function addToBatch(entry: HarEntry): EndpointBatch | null {
  let path: string
  try {
    path = new URL(entry.url).pathname
  } catch {
    return null
  }

  const key = `${entry.method} ${path}`

  if (!batchMap.has(key)) {
    batchMap.set(key, {
      method: entry.method,
      path,
      samples: [],
    })
  }

  const batch = batchMap.get(key)!

  // Don't store more than MAX_SAMPLES
  if (batch.samples.length < MAX_SAMPLES) {
    batch.samples.push(entry.payload)
  }

  return batch
}

export function getBatch(method: string, path: string): EndpointBatch | undefined {
  return batchMap.get(`${method} ${path}`)
}

export function getAllBatches(): EndpointBatch[] {
  return Array.from(batchMap.values())
}