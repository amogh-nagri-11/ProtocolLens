import { useState } from 'react'

type Props = {
  code: string
  language: 'typescript' | 'zod'
}

export function CodeBlock({ code, language }: Props) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function highlight(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(
        /\b(interface|const|type|string|number|boolean|unknown|null|Record)\b/g,
        '<span style="color: var(--code-keyword)">$1</span>'
      )
      .replace(
        /\.(string|number|boolean|object|array|unknown|nullable|optional|uuid|email|url|datetime|passthrough)\(\)/g,
        '.<span style="color: var(--code-function)">$1</span>()'
      )
      .replace(
        /"([^"]*)"/g,
        '"<span style="color: var(--code-string)">$1</span>"'
      )
      .replace(
        /^(\s+)(\w+)(\??:)/gm,
        '$1<span style="color: var(--code-field)">$2</span>$3'
      )
  }

  return (
    <div className="code-block">
      <div className="code-block-toolbar">
        <span className="code-block-label">{language}</span>
        <button
          onClick={handleCopy}
          className={`ui-btn ${copied ? 'ui-btn-success' : 'ui-btn-secondary'}`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className="code-block-pre"
        dangerouslySetInnerHTML={{ __html: highlight(code) }}
      />
    </div>
  )
}
