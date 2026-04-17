import { useState } from 'react'
import type { OpenAPIV3 } from 'openapi-types'

type Props = {
  onSpecLoaded: (spec: OpenAPIV3.Document) => void
}

export function SpecLoader({ onSpecLoaded }: Props) {
  console.log("specloader called")
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
      setError(`Failed to load spec: ${err instanceof Error ? err.message : 'unknown error'}`)
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
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #333' }}>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>
        load openapi spec
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLoadUrl()}
          placeholder="https://api.example.com/openapi.json"
          style={{
            flex: 1,
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#ddd',
            padding: '4px 8px',
            fontSize: 12,
            fontFamily: 'monospace',
          }}
        />
        <button
          onClick={handleLoadUrl}
          disabled={loading}
          style={{
            background: '#2d2d2d',
            border: '1px solid #444',
            color: '#aaa',
            padding: '4px 12px',
            borderRadius: 4,
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {loading ? 'loading...' : 'load'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 11, color: '#555', cursor: 'pointer' }}>
          or upload file →
          <input
            type="file"
            accept=".json,.yaml,.yml"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#f44747', marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  )
}