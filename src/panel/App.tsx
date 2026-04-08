import { useEffect, useState } from 'react'
import { addToBatch } from './batcher'
import { inferSchema, type InferredSchema, type FieldSchema } from './gemini'
import { saveSchema, getSchema, saveEntry, saveDrift, getDrift, saveSpec, getSpec } from './db'
import { generateCode } from './schema-generator'
import { CodeBlock } from './CodeBlock'
import { analyzeDrift } from './drift'
import { DriftView } from './DriftView'
import { SpecLoader } from './SpecLoader'
import type { OpenAPIV3 } from 'openapi-types'
import type { DriftReport } from './drift'

type HarEntry = {
  url: string
  method: string
  status: number
  timestamp: number
  payload: unknown
}

type Tab = 'payload' | 'schema' | 'drift'

function semanticColor(semanticType: string): string {
  if (semanticType.includes('datetime') || semanticType.includes('date')) return '#4ec9b0'
  if (semanticType === 'uuid') return '#c586c0'
  if (semanticType === 'email') return '#9cdcfe'
  if (semanticType === 'url') return '#569cd6'
  if (semanticType.includes('currency')) return '#6a9955'
  if (semanticType === 'unknown') return '#888'
  return '#ce9178'
}

function FieldRow({ name, field }: { name: string; field: FieldSchema }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 80px 160px 60px 60px 1fr',
      gap: 8,
      padding: '6px 12px',
      borderBottom: '1px solid #1e1e1e',
      fontSize: 12,
      alignItems: 'center',
    }}>
      <span style={{ color: '#9cdcfe', fontFamily: 'monospace' }}>{name}</span>
      <span style={{ color: '#4ec9b0' }}>{field.type}</span>
      <span style={{
        color: semanticColor(field.semanticType),
        background: '#1e1e1e',
        padding: '1px 6px',
        borderRadius: 4,
        fontSize: 11,
      }}>
        {field.semanticType}
      </span>
      <span style={{ color: field.nullable ? '#f44747' : '#6a9955', fontSize: 11 }}>
        {field.nullable ? 'nullable' : ''}
      </span>
      <span style={{ color: '#888', fontSize: 11 }}>
        {Math.round(field.confidence * 100)}%
      </span>
      <span style={{ color: '#666', fontSize: 11 }}>{field.notes}</span>
    </div>
  )
}

function SchemaView({ schema }: { schema: InferredSchema }) {
  const { zodSchema, tsInterface } = generateCode(schema)

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '200px 80px 160px 60px 60px 1fr',
        gap: 8,
        padding: '6px 12px',
        borderBottom: '1px solid #333',
        fontSize: 11,
        color: '#555',
      }}>
        <span>field</span>
        <span>type</span>
        <span>semantic type</span>
        <span>nullable</span>
        <span>confidence</span>
        <span>notes</span>
      </div>
      {Object.entries(schema.fields).map(([name, field]) => (
        <FieldRow key={name} name={name} field={field} />
      ))}

      <div style={{ padding: 16, borderTop: '1px solid #333', marginTop: 8 }}>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>
          TypeScript interface
        </div>
        <CodeBlock code={tsInterface} language="typescript" />

        <div style={{ fontSize: 11, color: '#555', marginBottom: 8, marginTop: 16 }}>
          Zod schema
        </div>
        <CodeBlock code={zodSchema} language="zod" />
      </div>
    </div>
  )
}

// Badge showing drift count on the request list
function DriftBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span style={{
      background: '#2a1a1a',
      color: '#f44747',
      border: '1px solid #f4474733',
      borderRadius: 4,
      padding: '1px 5px',
      fontSize: 10,
      marginLeft: 6,
    }}>
      {count}
    </span>
  )
}

export default function App() {
  const [entries, setEntries] = useState<HarEntry[]>([])
  const [selected, setSelected] = useState<HarEntry | null>(null)
  const [tab, setTab] = useState<Tab>('payload')
  const [schema, setSchema] = useState<InferredSchema | null>(null)
  const [inferring, setInferring] = useState(false)
  const [spec, setSpec] = useState<OpenAPIV3.Document | null>(null)
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null)
  const [driftCounts, setDriftCounts] = useState<Map<string, number>>(new Map())

  // Load persisted spec on mount
  useEffect(() => {
    getSpec().then(saved => {
      if (saved != null) setSpec(saved as OpenAPIV3.Document)
    })
  }, [])

  useEffect(() => {
    const listener = async (message: { type: string; data: HarEntry }) => {
      if (message.type !== 'HAR_ENTRY') return

      const entry = message.data
      setEntries((prev) => [entry, ...prev])
      await saveEntry(entry)

      const batch = addToBatch(entry)
      if (!batch) return

      const path = new URL(entry.url).pathname
      const existing = await getSchema(`${entry.method} ${path}`)
      const shouldInfer = !existing || batch.samples.length % 3 === 0

      if (shouldInfer && batch.samples.length > 0) {
        const inferred = await inferSchema(entry.method, path, batch.samples)
        await saveSchema(inferred)

        // Auto-run drift if spec is loaded
        const currentSpec = await getSpec()
        if (currentSpec != null) {
          const report = analyzeDrift(
            inferred,
            currentSpec as OpenAPIV3.Document,
            entry.method,
            path
          )
          await saveDrift(report)

          // Update drift count badge
          const errorCount = report.drifts.filter(d => d.severity === 'error').length
          setDriftCounts(prev => new Map(prev).set(`${entry.method} ${path}`, errorCount))
        }
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  async function handleSpecLoaded(newSpec: OpenAPIV3.Document) {
    setSpec(newSpec)
    await saveSpec(newSpec)
  }

  async function handleSelect(entry: HarEntry) {
    setSelected(entry)
    setSchema(null)
    setDriftReport(null)
    setInferring(true)

    try {
      const path = new URL(entry.url).pathname
      const key = `${entry.method} ${path}`

      const cached = await getSchema(key)
      if (cached) {
        setSchema(cached)

        // Load or generate drift report
        if (spec) {
          const cachedDrift = await getDrift(key)
          if (cachedDrift != null) {
            setDriftReport(cachedDrift)
          } else {
            const report = analyzeDrift(cached, spec, entry.method, path)
            await saveDrift(report)
            setDriftReport(report)
          }
        }

        setInferring(false)
        return
      }

      const inferred = await inferSchema(entry.method, path, [entry.payload])
      await saveSchema(inferred)
      setSchema(inferred)

      if (spec) {
        const report = analyzeDrift(inferred, spec, entry.method, path)
        await saveDrift(report)
        setDriftReport(report)
      }
    } catch (err) {
      console.error('Inference failed:', err)
    } finally {
      setInferring(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'monospace', flexDirection: 'column' }}>
      {/* Spec loader at top */}
      <SpecLoader onSpecLoaded={handleSpecLoaded} />
      {spec && (
        <div style={{ padding: '4px 16px', background: '#1a2a1a', fontSize: 11, color: '#6a9955', borderBottom: '1px solid #2a4a2a' }}>
          ✓ spec loaded — {Object.keys(spec.paths || {}).length} paths
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel */}
        <div style={{ width: '38%', borderRight: '1px solid #333', overflowY: 'auto', background: '#0f0f0f' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', fontSize: 11, color: '#555' }}>
            {entries.length} requests intercepted
          </div>
          {entries.map((entry, i) => {
            const path = (() => { try { return new URL(entry.url).pathname } catch { return entry.url } })()
            const driftCount = driftCounts.get(`${entry.method} ${path}`) ?? 0
            return (
              <div
                key={i}
                onClick={() => handleSelect(entry)}
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid #1a1a1a',
                  cursor: 'pointer',
                  background: selected === entry ? '#1e1e1e' : 'transparent',
                  fontSize: 12,
                }}
              >
                <span style={{ color: entry.method === 'GET' ? '#4ec9b0' : '#ce9178', marginRight: 8 }}>
                  {entry.method}
                </span>
                <span style={{ color: '#ddd' }}>{path}</span>
                <span style={{ float: 'right', color: entry.status < 400 ? '#6a9955' : '#f44747' }}>
                  {entry.status}
                </span>
                <DriftBadge count={driftCount} />
              </div>
            )
          })}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f0f0f' }}>
          {selected ? (
            <>
              <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
                {(['payload', 'schema', 'drift'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      padding: '8px 16px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: tab === t ? '2px solid #4ec9b0' : '2px solid transparent',
                      color: tab === t ? '#4ec9b0' : '#666',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'monospace',
                    }}
                  >
                    {t}
                    {t === 'drift' && driftReport && driftReport.drifts.filter(d => d.severity === 'error').length > 0 && (
                      <span style={{ color: '#f44747', marginLeft: 4 }}>
                        ({driftReport.drifts.filter(d => d.severity === 'error').length})
                      </span>
                    )}
                  </button>
                ))}
                {inferring && (
                  <span style={{ padding: '8px 16px', fontSize: 11, color: '#555' }}>
                    inferring...
                  </span>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: tab === 'schema' || tab === 'drift' ? 0 : 16 }}>
                {tab === 'payload' && (
                  <>
                    <div style={{ fontSize: 11, color: '#555', marginBottom: 12 }}>
                      {selected.url}
                    </div>
                    <pre style={{ fontSize: 12, color: '#ce9178', margin: 0 }}>
                      {JSON.stringify(selected.payload, null, 2)}
                    </pre>
                  </>
                )}
                {tab === 'schema' && (
                  schema
                    ? <SchemaView schema={schema} />
                    : <div style={{ padding: 16, color: '#555', fontSize: 12 }}>
                        {inferring ? 'Running AI inference...' : 'No schema yet'}
                      </div>
                )}
                {tab === 'drift' && (
                  !spec
                    ? <div style={{ padding: 16, color: '#555', fontSize: 12 }}>
                        Load an OpenAPI spec above to detect contract drifts
                      </div>
                    : driftReport
                      ? <DriftView report={driftReport} />
                      : <div style={{ padding: 16, color: '#555', fontSize: 12 }}>
                          {inferring ? 'Analyzing drift...' : 'Click a request to analyze'}
                        </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: '#555', fontSize: 13, margin: 'auto', textAlign: 'center' }}>
              Click a request to inspect
            </div>
          )}
        </div>
      </div>
    </div>
  )
}