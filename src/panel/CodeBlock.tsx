import { useState } from 'react'

type Props = {
  code: string
  language: 'typescript' | 'zod'
}

export function CodeBlock({ code }: Props) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Very basic syntax highlighting via regex replacements
  function highlight(code: string): string {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // keywords
      .replace(
        /\b(interface|const|type|string|number|boolean|unknown|null|Record)\b/g,
        '<span style="color:#569cd6">$1</span>'
      )
      // zod methods
      .replace(
        /\.(string|number|boolean|object|array|unknown|nullable|optional|uuid|email|url|datetime|passthrough)\(\)/g,
        '.<span style="color:#4ec9b0">$1</span>()'
      )
      // strings
      .replace(
        /"([^"]*)"/g,
        '"<span style="color:#ce9178">$1</span>"'
      )
      // field names
      .replace(
        /^(\s+)(\w+)(\??:)/gm,
        '$1<span style="color:#9cdcfe">$2</span>$3'
      )
  }

  return (
    <div style={{ position: 'relative', marginBottom: 16 }}>
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: copied ? '#6a9955' : '#2d2d2d',
          border: '1px solid #444',
          color: copied ? '#fff' : '#aaa',
          padding: '3px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          transition: 'all 0.2s',
        }}
      >
        {copied ? 'copied!' : 'copy'}
      </button>
      <pre
        style={{
          margin: 0,
          padding: '16px',
          background: '#1e1e1e',
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.6,
          overflowX: 'auto',
          border: '1px solid #333',
        }}
        dangerouslySetInnerHTML={{ __html: highlight(code) }}
      />
    </div>
  )
}