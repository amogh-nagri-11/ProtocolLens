
import type { InferredSchema } from "./gemini"
import { useState } from "react";

type Props = {
    schemas: Record<string, InferredSchema>
}

function generateMSWHandler(endpoint: string, schema: InferredSchema): string {
    const [method, path] = endpoint.split(' ') 
    const lowerMethod = method.toLowerCase(); 

    // Generate a realistic mock response from the schema
    const mockResponse: Record<string, unknown> = {}
    for (const [field, info] of Object.entries(schema.fields)) {
        if (field.includes('.')) continue // skip nested for now
        switch (info.semanticType) {
        case 'uuid': mockResponse[field] = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; break
        case 'email': mockResponse[field] = 'user@example.com'; break
        case 'url': mockResponse[field] = 'https://example.com'; break
        case 'ISO-8601-datetime': mockResponse[field] = '2024-01-15T10:30:00Z'; break
        case 'currency-amount': mockResponse[field] = 9.99; break
        default:
            switch (info.type) {
            case 'string': mockResponse[field] = info.nullable ? null : 'example'; break
            case 'number': mockResponse[field] = 42; break
            case 'boolean': mockResponse[field] = true; break
            case 'array': mockResponse[field] = []; break
            case 'object': mockResponse[field] = {}; break
            default: mockResponse[field] = null
            }
        }
    }

    const msw2Handler = `http.${lowerMethod}('${path}', () => {
        return HttpResponse.json(${JSON.stringify(mockResponse, null, 4)})
        })`

    return msw2Handler; 
}

function generateFullMswFile(schemas: Record<string, InferredSchema>): string {
    const handlers = Object.entries(schemas) 
        .map(([endpoint, schema]) => generateMSWHandler(endpoint, schema))
        .join(',\n\n ')

    return `import { http, HttpResponse } from 'msw'
        export const Handlers = [
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
        <div style={{ padding: '12px 16px', borderTop: '1px solid #333', fontSize: 11, color: '#555' }}>
            No schemas captured yet — browse your app to generate mocks
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
        const a = document.createElement('a')
        a.href = url
        a.download = 'handlers.ts'
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div style={{ borderTop: '1px solid #333' }}>
        <div
            onClick={() => setExpanded(!expanded)}
            style={{
            padding: '8px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#888',
            }}
        >
            <span>msw mock exporter — {schemaCount} endpoint{schemaCount !== 1 ? 's' : ''}</span>
            <span>{expanded ? '▲' : '▼'}</span>
        </div>

        {expanded && (
            <div style={{ padding: '0 16px 16px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                onClick={handleCopy}
                style={{
                    background: copied ? '#1a2a1a' : '#2d2d2d',
                    border: `1px solid ${copied ? '#6a9955' : '#444'}`,
                    color: copied ? '#6a9955' : '#aaa',
                    padding: '4px 12px',
                    borderRadius: 4,
                    fontSize: 11,
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                }}
                >
                {copied ? 'copied!' : 'copy handlers.ts'}
                </button>
                <button
                onClick={handleDownload}
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
                download handlers.ts
                </button>
            </div>

            <pre style={{
                fontSize: 11,
                color: '#ce9178',
                background: '#1e1e1e',
                padding: 12,
                borderRadius: 6,
                border: '1px solid #333',
                overflowX: 'auto',
                maxHeight: 200,
                margin: 0,
            }}>
                {fullFile}
            </pre>

            <div style={{ marginTop: 8, fontSize: 11, color: '#555' }}>
                install: <span style={{ color: '#4ec9b0' }}>npm install msw --save-dev</span>
            </div>
            </div>
        )}
        </div>
    )
}
