import type { DriftReport, DriftSeverity } from './drift'

type Props = {
  report: DriftReport
}

function severityColor(severity: DriftSeverity): string {
  switch (severity) {
    case 'error': return '#f44747'
    case 'warning': return '#ce9178'
    case 'info': return '#888'
  }
}

function severityBg(severity: DriftSeverity): string {
  switch (severity) {
    case 'error': return '#2a1a1a'
    case 'warning': return '#2a1f1a'
    case 'info': return '#1a1a1a'
  }
}

function DriftBadge({ count, severity }: { count: number; severity: DriftSeverity }) {
  if (count === 0) return null
  return (
    <span style={{
      background: severityBg(severity),
      color: severityColor(severity),
      border: `1px solid ${severityColor(severity)}`,
      borderRadius: 4,
      padding: '1px 6px',
      fontSize: 10,
      marginLeft: 6,
    }}>
      {count} {severity}
    </span>
  )
}

export function DriftView({ report }: Props) {
  const errors = report.drifts.filter(d => d.severity === 'error')
  const warnings = report.drifts.filter(d => d.severity === 'warning')
  const infos = report.drifts.filter(d => d.severity === 'info')

  if (report.drifts.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{
          color: '#6a9955',
          fontSize: 12,
          padding: '8px 12px',
          background: '#1a2a1a',
          borderRadius: 6,
          border: '1px solid #2a4a2a',
        }}>
          ✓ No contract drifts detected for this endpoint
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Summary badges */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#555' }}>contract drifts:</span>
        <DriftBadge count={errors.length} severity="error" />
        <DriftBadge count={warnings.length} severity="warning" />
        <DriftBadge count={infos.length} severity="info" />
      </div>

      {/* Drift list */}
      {report.drifts.map((drift, i) => (
        <div
          key={i}
          style={{
            marginBottom: 8,
            padding: '10px 12px',
            background: severityBg(drift.severity),
            border: `1px solid ${severityColor(drift.severity)}22`,
            borderLeft: `3px solid ${severityColor(drift.severity)}`,
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 10,
              color: severityColor(drift.severity),
              textTransform: 'uppercase',
              fontWeight: 500,
            }}>
              {drift.severity}
            </span>
            <span style={{ fontSize: 12, color: '#9cdcfe', fontFamily: 'monospace' }}>
              {drift.field}
            </span>
          </div>

          <div style={{ fontSize: 12, color: '#bbb', marginBottom: drift.expected ? 6 : 0 }}>
            {drift.message}
          </div>

          {(drift.expected || drift.observed) && (
            <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
              {drift.expected && (
                <span style={{ color: '#888' }}>
                  expected: <span style={{ color: '#4ec9b0' }}>{drift.expected}</span>
                </span>
              )}
              {drift.observed && (
                <span style={{ color: '#888' }}>
                  observed: <span style={{ color: '#ce9178' }}>{drift.observed}</span>
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}