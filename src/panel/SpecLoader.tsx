import { useState } from 'react'
import type { OpenAPIV3 } from 'openapi-types'

type Props = {
  onSpecLoaded: (spec: OpenAPIV3.Document) => void
}

export function SpecLoader({ onSpecLoaded }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLoadUrl() {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const spec = await res.json()
      onSpecLoaded(spec)
    } catch (err) {
      setError(`Failed to load: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const spec = JSON.parse(ev.target?.result as string)
        onSpecLoaded(spec)
        setError(null)
      } catch {
        setError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, color: '#374151', letterSpacing: '0.05em', whiteSpace: 'nowrap' as const }}>
        SPEC
      </span>
      <input
        type="text"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleLoadUrl()}
        placeholder="openapi.json url or upload file →"
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid #ffffff0a',
          color: '#9ca3af',
          padding: '2px 0',
          fontSize: 11,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
      <button
        onClick={handleLoadUrl}
        disabled={loading}
        style={{
          background: 'transparent',
          border: '1px solid #ffffff10',
          color: '#4b5563',
          padding: '2px 10px',
          borderRadius: 3,
          fontSize: 10,
          cursor: 'pointer',
          fontFamily: 'inherit',
          letterSpacing: '0.05em',
        }}
      >
        {loading ? '...' : 'LOAD'}
      </button>
      <label style={{
        fontSize: 10,
        color: '#374151',
        cursor: 'pointer',
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap' as const,
      }}>
        UPLOAD
        <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
      </label>
      {error && (
        <span style={{ fontSize: 10, color: '#f87171' }}>{error}</span>
      )}
    </div>
  )
}