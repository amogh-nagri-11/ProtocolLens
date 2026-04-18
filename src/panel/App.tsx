import { useEffect, useRef, useState } from 'react'
import { addToBatch } from './batcher'
import { inferSchema, type FieldSchema, type InferredSchema } from './gemini'
import {
  clearRuntimeData,
  getDrift,
  getSchema,
  saveDrift,
  saveEntry,
  saveSchema,
} from './db'
import { generateCode } from './schema-generator'
import { CodeBlock } from './CodeBlock'
import { analyzeDrift, type DriftReport } from './drift'
import { DriftView } from './DriftView'
import { MockExporter } from './MockExporter'
import { SpecLoader } from './SpecLoader'
import type { OpenAPIV3 } from 'openapi-types'
import './app.css'

type HarEntry = {
  url: string
  method: string
  status: number
  timestamp: number
  payload: unknown
}

type Tab = 'payload' | 'schema' | 'drift'
type Theme = 'light' | 'dark'

const METHOD_COLORS: Record<string, string> = {
  GET: '#16a34a',
  POST: '#2563eb',
  PUT: '#d97706',
  DELETE: '#dc2626',
  PATCH: '#7c3aed',
}

const statusClass = (status: number) => {
  if (status < 300) return 'status-ok'
  if (status < 400) return 'status-warn'
  return 'status-error'
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 1000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

function semanticColor(type: string): string {
  if (type.includes('datetime') || type.includes('date')) return 'var(--semantic-date)'
  if (type === 'uuid') return 'var(--semantic-uuid)'
  if (type === 'email') return 'var(--semantic-email)'
  if (type === 'url') return 'var(--semantic-url)'
  if (type.includes('currency')) return 'var(--semantic-currency)'
  if (type === 'unknown') return 'var(--text-muted)'
  return 'var(--semantic-generic)'
}

function MethodBadge({ method }: { method: string }) {
  const color = METHOD_COLORS[method] ?? 'var(--text-muted)'
  return (
    <span
      className="method-badge"
      style={{
        color,
        background: `${color}12`,
        border: `1px solid ${color}28`,
      }}
    >
      {method}
    </span>
  )
}

function FieldRow({ name, field }: { name: string; field: FieldSchema }) {
  const semantic = semanticColor(field.semanticType)

  return (
    <div className="schema-row">
      <span className="schema-field">{name}</span>
      <span className="schema-type">{field.type}</span>
      <span
        className="schema-semantic"
        style={{
          color: semantic,
          background: `${semantic}14`,
          border: `1px solid ${semantic}22`,
        }}
      >
        {field.semanticType}
      </span>
      <span className={field.nullable ? 'schema-nullable nullable' : 'schema-nullable'}>
        {field.nullable ? 'nullable' : 'required'}
      </span>
      <span
        className={
          field.confidence > 0.8
            ? 'schema-confidence high'
            : field.confidence > 0.5
              ? 'schema-confidence medium'
              : 'schema-confidence low'
        }
      >
        {Math.round(field.confidence * 100)}%
      </span>
      <span className="schema-notes">{field.notes || 'No additional notes'}</span>
    </div>
  )
}

function SchemaView({ schema }: { schema: InferredSchema }) {
  const { zodSchema, tsInterface } = generateCode(schema)
  const [activeCode, setActiveCode] = useState<'ts' | 'zod'>('ts')

  return (
    <div className="schema-panel">
      <div className="schema-header">
        <span>Field</span>
        <span>Type</span>
        <span>Semantic</span>
        <span>Nullability</span>
        <span>Confidence</span>
        <span>Notes</span>
      </div>
      {Object.entries(schema.fields).map(([name, field]) => (
        <FieldRow key={name} name={name} field={field} />
      ))}

      <div className="code-section">
        <div className="section-heading-row">
          <div>
            <div className="section-title">Generated Artifacts</div>
            <div className="section-subtitle">Switch between the TypeScript interface and the Zod schema.</div>
          </div>
          <div className="code-toggle">
            {(['ts', 'zod'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setActiveCode(type)}
                className={`code-toggle-btn ${activeCode === type ? 'active' : 'inactive'}`}
              >
                {type === 'ts' ? 'TypeScript' : 'Zod'}
              </button>
            ))}
          </div>
        </div>

        <CodeBlock
          code={activeCode === 'ts' ? tsInterface : zodSchema}
          language={activeCode === 'ts' ? 'typescript' : 'zod'}
        />
      </div>
    </div>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-card">
        <div className="empty-state-title">{title}</div>
        <div className="empty-state-text">{detail}</div>
      </div>
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
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem('protocol-lens-theme')
    return saved === 'dark' ? 'dark' : 'light'
  })
  const [leftWidth, setLeftWidth] = useState(360)
  const [isDragging, setIsDragging] = useState(false)
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)
  const [isPayloadMinimized, setIsPayloadMinimized] = useState(false)

  const specRef = useRef<OpenAPIV3.Document | null>(null)

  useEffect(() => {
    specRef.current = spec
  }, [spec])

  useEffect(() => {
    window.localStorage.setItem('protocol-lens-theme', theme)
  }, [theme])

  useEffect(() => {
    clearRuntimeData().catch((err) => console.error('Failed to clear session data:', err))
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (event: MouseEvent) => {
      const nextWidth = Math.min(Math.max(event.clientX, 260), window.innerWidth * 0.65)
      setLeftWidth(nextWidth)
    }

    const handleUp = () => setIsDragging(false)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging])

  useEffect(() => {
    const listener = async (message: { type: string; data: HarEntry }) => {
      if (message.type !== 'HAR_ENTRY') return

      const entry = message.data
      setEntries((prev) => [entry, ...prev].slice(0, 200))
      await saveEntry(entry)

      const batch = addToBatch(entry)
      if (!batch) return

      const path = new URL(entry.url).pathname
      const existing = await getSchema(`${entry.method} ${path}`)
      const shouldInfer =
        (!existing && batch.samples.length >= 1) ||
        batch.samples.length === 5 ||
        batch.samples.length === 10

      if (shouldInfer && batch.samples.length > 0) {
        try {
          const inferred = await inferSchema(entry.method, path, batch.samples)
          await saveSchema(inferred)
          setAllSchemas((prev) => ({ ...prev, [inferred.endpoint]: inferred }))

          const currentSpec = specRef.current
          if (currentSpec != null) {
            const report = analyzeDrift(inferred, currentSpec, entry.method, path)
            await saveDrift(report)
            const errorCount = report.drifts.filter((drift) => drift.severity === 'error').length
            setDriftCounts((prev) => new Map(prev).set(`${entry.method} ${path}`, errorCount))
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
  }

  async function handleTabClick(nextTab: Tab) {
    setTab(nextTab)

    const currentSpec = specRef.current ?? spec

    if (nextTab === 'drift' && selected && currentSpec) {
      try {
        const path = new URL(selected.url).pathname
        const key = `${selected.method} ${path}`
        const cachedSchema = await getSchema(key)

        if (cachedSchema) {
          const report = analyzeDrift(cachedSchema, currentSpec, selected.method, path)
          await saveDrift(report)
          setDriftReport(report)
        } else {
          setDriftReport(null)
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
    setIsPayloadMinimized(false)
    setInferring(true)

    try {
      const path = new URL(entry.url).pathname
      const key = `${entry.method} ${path}`
      const currentSpec = specRef.current ?? spec

      const cached = await getSchema(key)
      if (cached) {
        setSchema(cached)

        if (currentSpec) {
          const cachedDrift = await getDrift(key)
          if (cachedDrift != null) {
            setDriftReport(cachedDrift)
          } else {
            const report = analyzeDrift(cached, currentSpec, entry.method, path)
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
      setAllSchemas((prev) => ({ ...prev, [inferred.endpoint]: inferred }))

      if (currentSpec) {
        const report = analyzeDrift(inferred, currentSpec, entry.method, path)
        await saveDrift(report)
        setDriftReport(report)
      }
    } catch (err) {
      console.error('Inference failed:', err)
    } finally {
      setInferring(false)
    }
  }

  const filteredEntries = entries.filter((entry) => {
    const path = (() => {
      try {
        return new URL(entry.url).pathname
      } catch {
        return entry.url
      }
    })()

    return (
      path.toLowerCase().includes(filter.toLowerCase()) ||
      entry.method.toLowerCase().includes(filter.toLowerCase())
    )
  })

  const selectedPath = selected
    ? (() => {
        try {
          return new URL(selected.url).pathname
        } catch {
          return selected.url
        }
      })()
    : ''

  const payloadSize = selected ? JSON.stringify(selected.payload, null, 2).length : 0

  return (
    <div className="app-shell" data-theme={theme}>
      <div className="app-frame">
        <div className="header">
          <div className="header-title">
            <div className="header-kicker">Protocol Lens</div>
            <div className="header-subtitle">Inspect payloads, generated schemas, and contract drift in one place.</div>
          </div>

          <div className="header-meta">
            <div className="header-stat">
              <span className="header-stat-label">Captured</span>
              <span className="header-stat-value">{entries.length}</span>
            </div>
            <div className="header-stat">
              <span className="header-stat-label">Spec</span>
              <span className="header-stat-value">{spec ? `${Object.keys(spec.paths || {}).length} paths` : 'Not loaded'}</span>
            </div>
            <button
              className="ui-btn ui-btn-secondary"
              onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>
          </div>
        </div>

        <SpecLoader onSpecLoaded={handleSpecLoaded} />

        <div className="workspace">
          <aside
            className={`left-panel ${isLeftCollapsed ? 'collapsed' : ''}`}
            style={isLeftCollapsed ? undefined : { width: leftWidth }}
          >
            <div className="pane-header">
              <div>
                <div className="pane-title">Requests</div>
                <div className="pane-subtitle">Filter, browse, and reopen captured traffic.</div>
              </div>
              <div className="pane-actions">
                <button
                  className="ui-btn ui-btn-ghost"
                  onClick={() => {
                    setEntries([])
                    setSelected(null)
                    setSchema(null)
                    setDriftReport(null)
                  }}
                >
                  Clear
                </button>
                <button
                  className="ui-btn ui-btn-ghost"
                  onClick={() => setIsLeftCollapsed((value) => !value)}
                >
                  {isLeftCollapsed ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>

            {!isLeftCollapsed && (
              <>
                <div className="filter-bar">
                  <input
                    type="text"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Filter by method or path"
                    className="filter-input"
                  />
                </div>

                <div className="request-list">
                  {filteredEntries.length === 0 ? (
                    <EmptyState
                      title="No requests yet"
                      detail="Open a page and trigger network traffic to start inspecting responses here."
                    />
                  ) : (
                    filteredEntries.map((entry, index) => {
                      const path = (() => {
                        try {
                          return new URL(entry.url).pathname
                        } catch {
                          return entry.url
                        }
                      })()
                      const driftCount = driftCounts.get(`${entry.method} ${path}`) ?? 0
                      const isSelected = selected === entry

                      return (
                        <button
                          key={index}
                          className={`entry-row ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelect(entry)}
                        >
                          <div className="entry-main">
                            <MethodBadge method={entry.method} />
                            <span className="entry-path">{path}</span>
                          </div>
                          <div className="entry-meta">
                            <span className={`status-pill ${statusClass(entry.status)}`}>{entry.status}</span>
                            {driftCount > 0 && <span className="drift-count-badge">{driftCount}</span>}
                            <span className="timestamp">{timeAgo(entry.timestamp)}</span>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>

                <MockExporter schemas={allSchemas} />
              </>
            )}
          </aside>

          <div
            className={`panel-resizer ${isLeftCollapsed ? 'hidden' : ''} ${isDragging ? 'dragging' : ''}`}
            onMouseDown={() => setIsDragging(true)}
            onDoubleClick={() => setLeftWidth(360)}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize request list"
          />

          <main className="right-panel">
            {selected ? (
              <>
                <div className="pane-header pane-header-main">
                  <div>
                    <div className="pane-title">Request Details</div>
                    <div className="pane-subtitle request-url">{selected.url}</div>
                  </div>
                  <div className="detail-summary">
                    <MethodBadge method={selected.method} />
                    <span className={`status-pill ${statusClass(selected.status)}`}>{selected.status}</span>
                    <span className="detail-chip">{timeAgo(selected.timestamp)}</span>
                    <span className="detail-chip">{selectedPath}</span>
                  </div>
                </div>

                <div className="tabs">
                  {(['payload', 'schema', 'drift'] as Tab[]).map((nextTab) => {
                    const driftErrors = nextTab === 'drift' && driftReport
                      ? driftReport.drifts.filter((drift) => drift.severity === 'error').length
                      : 0

                    return (
                      <button
                        key={nextTab}
                        onClick={() => handleTabClick(nextTab)}
                        className={`tab-btn ${tab === nextTab ? 'active' : 'inactive'}`}
                      >
                        {nextTab}
                        {driftErrors > 0 && <span className="tab-error-badge">{driftErrors}</span>}
                      </button>
                    )
                  })}

                  {inferring && (
                    <div className="inferring-indicator">
                      <div className="inferring-dot" />
                      Processing response
                    </div>
                  )}
                </div>

                <div className="content-area tab-content">
                  {tab === 'payload' && (
                    <div className="content-card payload-card">
                      <div className="section-heading-row">
                        <div>
                          <div className="section-title">Payload</div>
                          <div className="section-subtitle">Raw JSON captured from the selected response.</div>
                        </div>
                        <div className="payload-actions">
                          <button
                            className="ui-btn ui-btn-secondary"
                            onClick={() => setIsPayloadMinimized((value) => !value)}
                          >
                            {isPayloadMinimized ? 'Show body' : 'Hide body'}
                          </button>
                        </div>
                      </div>
                      {isPayloadMinimized ? (
                        <div className="payload-summary" role="button" onClick={() => setIsPayloadMinimized(false)}>
                          <div className="payload-summary-main">
                            <span className="payload-summary-title">Payload hidden</span>
                            <span className="payload-summary-text">
                              Click to reveal the captured JSON body.
                            </span>
                          </div>
                          <div className="payload-summary-meta">
                            <span className="detail-chip">{Math.max(1, Math.round(payloadSize / 1024))} KB</span>
                            <span className="detail-chip">JSON</span>
                          </div>
                        </div>
                      ) : (
                        <pre className="payload-view">{JSON.stringify(selected.payload, null, 2)}</pre>
                      )}
                    </div>
                  )}

                  {tab === 'schema' && (
                    schema
                      ? <SchemaView schema={schema} />
                      : <EmptyState
                          title="Schema not ready"
                          detail={inferring ? 'Schema inference is still running for this response.' : 'Select a captured response with a JSON payload to generate a schema.'}
                        />
                  )}

                  {tab === 'drift' && (
                    !spec
                      ? <EmptyState
                          title="OpenAPI spec required"
                          detail="Load a spec above to compare captured responses against the documented contract."
                        />
                      : driftReport
                        ? <DriftView report={driftReport} />
                        : <EmptyState
                            title="No drift report yet"
                            detail={inferring ? 'Drift analysis is being prepared for this request.' : 'Open a captured request with an inferred schema to see drift analysis here.'}
                          />
                  )}
                </div>
              </>
            ) : (
              <EmptyState
                title="Nothing selected"
                detail="Choose a request from the left panel to inspect the payload, generated schema, and drift report."
              />
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
