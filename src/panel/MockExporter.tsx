import { useState } from 'react'
import type { InferredSchema } from './gemini'

type Props = {
  schemas: Record<string, InferredSchema>
}

function generateMSWHandler(endpoint: string, schema: InferredSchema): string {
  const [method, path] = endpoint.split(' ')
  const lowerMethod = method.toLowerCase()

  const mockResponse: Record<string, unknown> = {}
  for (const [field, info] of Object.entries(schema.fields)) {
    if (field.includes('.')) continue

    switch (info.semanticType) {
      case 'uuid':
        mockResponse[field] = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        break
      case 'email':
        mockResponse[field] = 'user@example.com'
        break
      case 'url':
        mockResponse[field] = 'https://example.com'
        break
      case 'ISO-8601-datetime':
        mockResponse[field] = '2024-01-15T10:30:00Z'
        break
      case 'currency-amount':
        mockResponse[field] = 9.99
        break
      default:
        switch (info.type) {
          case 'string':
            mockResponse[field] = info.nullable ? null : 'example'
            break
          case 'number':
            mockResponse[field] = 42
            break
          case 'boolean':
            mockResponse[field] = true
            break
          case 'array':
            mockResponse[field] = []
            break
          case 'object':
            mockResponse[field] = {}
            break
          default:
            mockResponse[field] = null
        }
    }
  }

  return `http.${lowerMethod}('${path}', () => {
  return HttpResponse.json(${JSON.stringify(mockResponse, null, 2)})
})`
}

function generateFullMswFile(schemas: Record<string, InferredSchema>): string {
  const handlers = Object.entries(schemas)
    .map(([endpoint, schema]) => generateMSWHandler(endpoint, schema))
    .join(',\n\n')

  return `import { http, HttpResponse } from 'msw'

export const handlers = [
${handlers}
]
`
}

export function MockExporter({ schemas }: Props) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const schemaCount = Object.keys(schemas).length

  if (schemaCount === 0) {
    return (
      <div className="mock-exporter mock-exporter-empty">
        <div className="mock-exporter-note">Capture a few schemas to enable mock export.</div>
      </div>
    )
  }

  const fullFile = generateFullMswFile(schemas)

  function handleCopy() {
    navigator.clipboard.writeText(fullFile)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const blob = new Blob([fullFile], { type: 'text/typescript' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'handlers.ts'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mock-exporter">
      <button className="mock-exporter-header" onClick={() => setExpanded((value) => !value)}>
        <div>
          <div className="pane-title">Mock Exporter</div>
          <div className="pane-subtitle">{schemaCount} endpoint{schemaCount === 1 ? '' : 's'} ready for MSW export.</div>
        </div>
        <span className="mock-exporter-toggle">{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded && (
        <div className="mock-exporter-body">
          <div className="mock-exporter-actions">
            <button className={`ui-btn ${copied ? 'ui-btn-success' : 'ui-btn-secondary'}`} onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy handlers.ts'}
            </button>
            <button className="ui-btn ui-btn-secondary" onClick={handleDownload}>
              Download handlers.ts
            </button>
          </div>

          <pre className="mock-exporter-pre">{fullFile}</pre>
          <div className="mock-exporter-note">Install MSW in your app to start using these generated handlers.</div>
        </div>
      )}
    </div>
  )
}
