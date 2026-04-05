import { useEffect, useState } from 'react'
import { addToBatch } from './batcher'
import { inferSchema, type InferredSchema, type FieldSchema } from './gemini'
import { saveSchema, getSchema, saveEntry } from './db'
import { generateCode } from './schema-generator'
import { CodeBlock } from './CodeBlock'

type HarEntry = {
  url: string
  method: string
  status: number
  timestamp: number
  payload: unknown
}

type Tab = 'payload' | 'schema' | 'code'

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
      {/* Field table */}
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

      {/* Generated code */}
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

export default function App() {
  const [entries, setEntries] = useState<HarEntry[]>([])
  const [selected, setSelected] = useState<HarEntry | null>(null)
  const [schema, setSchema] = useState<InferredSchema | null>(null)
  const [inferring, setInferring] = useState(false)

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
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  async function handleSelect(entry: HarEntry) {
    setSelected(entry)
    setSchema(null)
    setInferring(true)

    try {
      const path = new URL(entry.url).pathname
      const key = `${entry.method} ${path}`

      const cached = await getSchema(key)
      if (cached) {
        setSchema(cached)
        setInferring(false)
        return
      }

      const inferred = await inferSchema(entry.method, path, [entry.payload])
      await saveSchema(inferred)
      setSchema(inferred)
    } catch (err) {
      console.error('Inference failed:', err)
    } finally {
      setInferring(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'monospace' }}>
      {/* Left panel */}
      <div style={{ width: '38%', borderRight: '1px solid #333', overflowY: 'auto', background: '#0f0f0f' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', fontSize: 11, color: '#555' }}>
          {entries.length} requests intercepted
        </div>
        {entries.map((entry, i) => (
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
            <span style={{ color: '#ddd' }}>
              {new URL(entry.url).pathname}
            </span>
            <span style={{ float: 'right', color: entry.status < 400 ? '#6a9955' : '#f44747' }}>
              {entry.status}
            </span>
          </div>
        ))}
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f0f0f' }}>
        {selected ? (
          <>
            <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
              {(['payload', 'schema'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {}}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '2px solid transparent',
                    color: '#666',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                >
                  {t}
                </button>
              ))}
              {inferring && (
                <span style={{ padding: '8px 16px', fontSize: 11, color: '#555' }}>
                  inferring schema...
                </span>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 12 }}>
                {selected.url}
              </div>
              <pre style={{ fontSize: 12, color: '#ce9178', margin: 0 }}>
                {JSON.stringify(selected.payload, null, 2)}
              </pre>

              {schema && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 12, borderTop: '1px solid #333', paddingTop: 16 }}>
                    inferred schema
                  </div>
                  <SchemaView schema={schema} />
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
  )
}