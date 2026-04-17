import { useEffect, useState, useRef } from 'react'
import { addToBatch } from './batcher'
import { inferSchema, type InferredSchema, type FieldSchema } from './gemini'
import { saveSchema, getSchema, saveEntry, saveDrift, getDrift, saveSpec, getSpec, getAllSchemas } from './db'
import { generateCode } from './schema-generator'
import { CodeBlock } from './CodeBlock'
import { analyzeDrift } from './drift'
import { DriftView } from './DriftView'
import { SpecLoader } from './SpecLoader'
import { MockExporter } from './MockExporter'
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

const METHOD_COLORS: Record<string, string> = {
  GET: '#3dd68c',
  POST: '#60a5fa',
  PUT: '#f59e0b',
  DELETE: '#f87171',
  PATCH: '#a78bfa',
}

const STATUS_COLOR = (s: number) =>
  s < 300 ? '#3dd68c' : s < 400 ? '#f59e0b' : '#f87171'

function semanticColor(t: string): string {
  if (t.includes('datetime') || t.includes('date')) return '#34d399'
  if (t === 'uuid') return '#a78bfa'
  if (t === 'email') return '#60a5fa'
  if (t === 'url') return '#38bdf8'
  if (t.includes('currency')) return '#3dd68c'
  if (t === 'unknown') return '#6b7280'
  return '#fb923c'
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.05em',
      color: METHOD_COLORS[method] ?? '#9ca3af',
      background: `${METHOD_COLORS[method] ?? '#9ca3af'}15`,
      border: `1px solid ${METHOD_COLORS[method] ?? '#9ca3af'}30`,
      borderRadius: 3,
      padding: '1px 5px',
      minWidth: 36,
      textAlign: 'center' as const,
      display: 'inline-block',
    }}>
      {method}
    </span>
  )
}

function FieldRow({ name, field }: { name: string; field: FieldSchema }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '180px 70px 150px 70px 50px 1fr',
      gap: 6,
      padding: '5px 16px',
      borderBottom: '1px solid #ffffff08',
      fontSize: 11,
      alignItems: 'center',
      transition: 'background 0.1s',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = '#ffffff05')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: '#93c5fd', fontFamily: 'monospace', fontSize: 11 }}>{name}</span>
      <span style={{ color: '#6b7280', fontSize: 10 }}>{field.type}</span>
      <span style={{
        color: semanticColor(field.semanticType),
        background: `${semanticColor(field.semanticType)}15`,
        padding: '1px 6px',
        borderRadius: 3,
        fontSize: 10,
        fontFamily: 'monospace',
        display: 'inline-block',
      }}>
        {field.semanticType}
      </span>
      <span style={{
        color: field.nullable ? '#f87171' : '#374151',
        fontSize: 10,
        fontFamily: 'monospace',
      }}>
        {field.nullable ? 'nullable' : '—'}
      </span>
      <span style={{
        color: field.confidence > 0.8 ? '#3dd68c' : field.confidence > 0.5 ? '#f59e0b' : '#f87171',
        fontSize: 10,
      }}>
        {Math.round(field.confidence * 100)}%
      </span>
      <span style={{ color: '#4b5563', fontSize: 10, fontStyle: 'italic' }}>{field.notes}</span>
    </div>
  )
}

function SchemaView({ schema }: { schema: InferredSchema }) {
  const { zodSchema, tsInterface } = generateCode(schema)
  const [activeCode, setActiveCode] = useState<'ts' | 'zod'>('ts')

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '180px 70px 150px 70px 50px 1fr',
        gap: 6,
        padding: '6px 16px',
        borderBottom: '1px solid #ffffff08',
        fontSize: 10,
        color: '#374151',
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
      }}>
        <span>field</span><span>type</span><span>semantic</span>
        <span>nullable</span><span>conf.</span><span>notes</span>
      </div>

      {Object.entries(schema.fields).map(([name, field]) => (
        <FieldRow key={name} name={name} field={field} />
      ))}

      <div style={{ padding: '16px', borderTop: '1px solid #ffffff08', marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {(['ts', 'zod'] as const).map(type => (
            <button
              key={type}
              onClick={() => setActiveCode(type)}
              style={{
                padding: '3px 10px',
                fontSize: 10,
                fontFamily: 'monospace',
                background: activeCode === type ? '#ffffff10' : 'transparent',
                border: `1px solid ${activeCode === type ? '#ffffff20' : '#ffffff08'}`,
                color: activeCode === type ? '#e5e7eb' : '#6b7280',
                borderRadius: 4,
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {type === 'ts' ? 'TypeScript' : 'Zod'}
            </button>
          ))}
        </div>
        <CodeBlock
          code={activeCode === 'ts' ? tsInterface : zodSchema}
          language={activeCode === 'ts' ? 'typescript' : 'zod'}
        />
      </div>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 12,
      color: '#374151',
    }}>
      <span style={{ fontSize: 28 }}>{icon}</span>
      <span style={{ fontSize: 12, textAlign: 'center' as const, maxWidth: 200, lineHeight: 1.6 }}>{text}</span>
    </div>
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
  const [allSchemas, setAllSchemas] = useState<Record<string, InferredSchema>>({})
  const [filter, setFilter] = useState('')
  const specRef = useRef<OpenAPIV3.Document | null>(null)

  useEffect(() => { specRef.current = spec }, [spec])

  useEffect(() => {
    getSpec().then(saved => {
      if (saved != null) setSpec(saved as OpenAPIV3.Document)
    })
    getAllSchemas().then(schemas => {
      const map: Record<string, InferredSchema> = {}
      for (const s of schemas) map[s.endpoint] = s
      setAllSchemas(map)
    })
  }, [])

  useEffect(() => {
    const listener = async (message: { type: string; data: HarEntry }) => {
      if (message.type !== 'HAR_ENTRY') return
      const entry = message.data
      setEntries(prev => [entry, ...prev])
      await saveEntry(entry)

      const batch = addToBatch(entry)
      if (!batch) return

      const path = new URL(entry.url).pathname
      const existing = await getSchema(`${entry.method} ${path}`)
      const shouldInfer = !existing && batch.samples.length >= 1 ||
        batch.samples.length === 5 || batch.samples.length === 10

      if (shouldInfer && batch.samples.length > 0) {
        try {
          const inferred = await inferSchema(entry.method, path, batch.samples)
          await saveSchema(inferred)
          setAllSchemas(prev => ({ ...prev, [inferred.endpoint]: inferred }))

          const currentSpec = specRef.current ?? (await getSpec() as OpenAPIV3.Document | null)
          if (currentSpec != null) {
            const report = analyzeDrift(inferred, currentSpec, entry.method, path)
            await saveDrift(report)
            const errorCount = report.drifts.filter(d => d.severity === 'error').length
            setDriftCounts(prev => new Map(prev).set(`${entry.method} ${path}`, errorCount))
          }
        } catch (err) {
          console.error('Inference error:', err)
        }
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  async function handleSpecLoaded(newSpec: OpenAPIV3.Document) {
    setSpec(newSpec)
    specRef.current = newSpec
    await saveSpec(newSpec)
  }

  async function handleTabClick(t: Tab) {
    setTab(t)
    if (t === 'drift' && selected && specRef.current && !driftReport) {
      try {
        const path = new URL(selected.url).pathname
        const key = `${selected.method} ${path}`
        const cachedSchema = await getSchema(key)
        if (cachedSchema) {
          const report = analyzeDrift(cachedSchema, specRef.current, selected.method, path)
          await saveDrift(report)
          setDriftReport(report)
        }
      } catch (err) {
        console.error('Drift analysis failed:', err)
      }
    }
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
        if (specRef.current) {
          const cachedDrift = await getDrift(key)
          if (cachedDrift != null) {
            setDriftReport(cachedDrift)
          } else {
            const report = analyzeDrift(cached, specRef.current, entry.method, path)
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
      setAllSchemas(prev => ({ ...prev, [inferred.endpoint]: inferred }))

      if (specRef.current) {
        const report = analyzeDrift(inferred, specRef.current, entry.method, path)
        await saveDrift(report)
        setDriftReport(report)
      }
    } catch (err) {
      console.error('Inference failed:', err)
    } finally {
      setInferring(false)
    }
  }

  const filteredEntries = entries.filter(e => {
    const path = (() => { try { return new URL(e.url).pathname } catch { return e.url } })()
    return path.toLowerCase().includes(filter.toLowerCase()) ||
      e.method.toLowerCase().includes(filter.toLowerCase())
  })

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: '"Berkeley Mono", "Fira Code", "Cascadia Code", monospace',
      background: '#080b10',
      color: '#e2e8f0',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #ffffff0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#0d1117',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#3dd68c',
            boxShadow: '0 0 6px #3dd68c',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#e2e8f0' }}>
            PROTOCOL-LENS
          </span>
          <span style={{ fontSize: 10, color: '#374151', letterSpacing: '0.05em' }}>
            v0.1.0
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {spec && (
            <span style={{ fontSize: 10, color: '#3dd68c' }}>
              ✓ {Object.keys(spec.paths || {}).length} paths
            </span>
          )}
          <span style={{ fontSize: 10, color: '#374151' }}>
            {entries.length} captured
          </span>
        </div>
      </div>

      {/* Spec loader */}
      <div style={{ flexShrink: 0, background: '#0d1117', borderBottom: '1px solid #ffffff08' }}>
        <SpecLoader onSpecLoaded={handleSpecLoaded} />
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel */}
        <div style={{
          width: '36%',
          borderRight: '1px solid #ffffff08',
          display: 'flex',
          flexDirection: 'column',
          background: '#0d1117',
        }}>
          {/* Search/filter */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #ffffff08' }}>
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="filter requests..."
              style={{
                width: '100%',
                background: '#080b10',
                border: '1px solid #ffffff0a',
                borderRadius: 4,
                color: '#9ca3af',
                padding: '4px 8px',
                fontSize: 11,
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>

          {/* Request list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredEntries.length === 0 ? (
              <EmptyState icon="📡" text="Waiting for network requests..." />
            ) : (
              filteredEntries.map((entry, i) => {
                const path = (() => { try { return new URL(entry.url).pathname } catch { return entry.url } })()
                const driftCount = driftCounts.get(`${entry.method} ${path}`) ?? 0
                const isSelected = selected === entry

                return (
                  <div
                    key={i}
                    onClick={() => handleSelect(entry)}
                    style={{
                      padding: '7px 12px',
                      borderBottom: '1px solid #ffffff05',
                      cursor: 'pointer',
                      background: isSelected ? '#ffffff08' : 'transparent',
                      borderLeft: isSelected ? '2px solid #3dd68c' : '2px solid transparent',
                      transition: 'all 0.1s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#ffffff04' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <MethodBadge method={entry.method} />
                    <span style={{
                      flex: 1,
                      color: isSelected ? '#e2e8f0' : '#9ca3af',
                      fontSize: 11,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' as const,
                    }}>
                      {path}
                    </span>
                    <span style={{ fontSize: 10, color: STATUS_COLOR(entry.status) }}>
                      {entry.status}
                    </span>
                    {driftCount > 0 && (
                      <span style={{
                        background: '#f8717115',
                        color: '#f87171',
                        border: '1px solid #f8717130',
                        borderRadius: 3,
                        padding: '0px 4px',
                        fontSize: 9,
                        fontWeight: 700,
                      }}>
                        {driftCount}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Mock exporter */}
          <MockExporter schemas={allSchemas} />
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#080b10', overflow: 'hidden' }}>
          {selected ? (
            <>
              {/* URL bar */}
              <div style={{
                padding: '6px 16px',
                borderBottom: '1px solid #ffffff08',
                fontSize: 10,
                color: '#4b5563',
                background: '#0d1117',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' as const,
                flexShrink: 0,
              }}>
                {selected.url}
              </div>

              {/* Tabs */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid #ffffff08',
                background: '#0d1117',
                flexShrink: 0,
              }}>
                {(['payload', 'schema', 'drift'] as Tab[]).map((t) => {
                  const driftErrors = t === 'drift' && driftReport
                    ? driftReport.drifts.filter(d => d.severity === 'error').length
                    : 0
                  return (
                    <button
                      key={t}
                      onClick={() => handleTabClick(t)}
                      style={{
                        padding: '8px 16px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: tab === t ? '2px solid #3dd68c' : '2px solid transparent',
                        color: tab === t ? '#3dd68c' : '#4b5563',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontFamily: 'inherit',
                        letterSpacing: '0.05em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'color 0.1s',
                      }}
                    >
                      {t.toUpperCase()}
                      {driftErrors > 0 && (
                        <span style={{
                          background: '#f8717120',
                          color: '#f87171',
                          borderRadius: 3,
                          padding: '0 4px',
                          fontSize: 9,
                          fontWeight: 700,
                        }}>
                          {driftErrors}
                        </span>
                      )}
                    </button>
                  )
                })}
                {inferring && (
                  <div style={{
                    marginLeft: 'auto',
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 10,
                    color: '#374151',
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: '#3dd68c',
                      animation: 'pulse 1s infinite',
                    }} />
                    inferring...
                  </div>
                )}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {tab === 'payload' && (
                  <pre style={{
                    fontSize: 11,
                    color: '#fb923c',
                    margin: 0,
                    padding: 16,
                    lineHeight: 1.6,
                  }}>
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                )}
                {tab === 'schema' && (
                  schema
                    ? <SchemaView schema={schema} />
                    : <EmptyState icon="🔍" text={inferring ? 'Running AI inference...' : 'No schema captured yet'} />
                )}
                {tab === 'drift' && (
                  !spec
                    ? <EmptyState icon="📄" text="Load an OpenAPI spec to detect contract drifts" />
                    : driftReport
                      ? <DriftView report={driftReport} />
                      : <EmptyState icon="⚡" text={inferring ? 'Analyzing drift...' : 'No drift data yet'} />
                )}
              </div>
            </>
          ) : (
            <EmptyState icon="←" text="Select a request from the left panel to inspect" />
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ffffff10; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #ffffff20; }
        input::placeholder { color: #374151; }
        input:focus { border-color: #ffffff15 !important; }
        button:hover { opacity: 0.8; }
      `}</style>
    </div>
  )
}