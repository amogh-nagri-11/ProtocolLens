import { useState, type ChangeEvent } from 'react'
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
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const spec = await response.json()
      onSpecLoaded(spec)
    } catch (err) {
      setError(`Failed to load: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      try {
        const spec = JSON.parse(loadEvent.target?.result as string)
        onSpecLoaded(spec)
        setError(null)
      } catch {
        setError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="spec-loader">
      <div className="spec-loader-copy">
        <div className="pane-title">Contract Source</div>
        <div className="pane-subtitle">Load an OpenAPI document from a URL or local file.</div>
      </div>

      <div className="spec-loader-controls">
        <input
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleLoadUrl()}
          placeholder="https://example.com/openapi.json"
          className="spec-loader-input"
        />
        <button
          onClick={handleLoadUrl}
          disabled={loading}
          className="ui-btn ui-btn-primary"
        >
          {loading ? 'Loading...' : 'Load URL'}
        </button>
        <label className="ui-btn ui-btn-secondary spec-upload-btn">
          Upload file
          <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
        </label>
      </div>

      {error && <div className="spec-loader-error">{error}</div>}
    </div>
  )
}
