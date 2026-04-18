import type { DriftReport, DriftSeverity } from './drift'

type Props = {
  report: DriftReport
}

function DriftBadge({ count, severity }: { count: number; severity: DriftSeverity }) {
  if (count === 0) return null

  return <span className={`drift-summary-badge ${severity}`}>{count} {severity}{count === 1 ? '' : 's'}</span>
}

export function DriftView({ report }: Props) {
  const errors = report.drifts.filter((drift) => drift.severity === 'error')
  const warnings = report.drifts.filter((drift) => drift.severity === 'warning')
  const infos = report.drifts.filter((drift) => drift.severity === 'info')

  if (report.drifts.length === 0) {
    return (
      <div className="content-card">
        <div className="empty-state compact">
          <div className="empty-state-card">
            <div className="empty-state-title">No drift detected</div>
            <div className="empty-state-text">The captured response aligns with the loaded contract for this endpoint.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="content-card drift-card">
      <div className="section-heading-row drift-heading">
        <div>
          <div className="section-title">Contract Drift</div>
          <div className="section-subtitle">Differences between the captured response and the OpenAPI contract.</div>
        </div>
        <div className="drift-summary">
          <DriftBadge count={errors.length} severity="error" />
          <DriftBadge count={warnings.length} severity="warning" />
          <DriftBadge count={infos.length} severity="info" />
        </div>
      </div>

      <div className="drift-list">
        {report.drifts.map((drift, index) => (
          <div key={index} className={`drift-item ${drift.severity}`}>
            <div className="drift-item-header">
              <span className={`drift-level ${drift.severity}`}>{drift.severity}</span>
              <span className="drift-field">{drift.field}</span>
            </div>
            <div className="drift-message">{drift.message}</div>
            {(drift.expected || drift.observed) && (
              <div className="drift-meta">
                {drift.expected && <span>Expected: <strong>{drift.expected}</strong></span>}
                {drift.observed && <span>Observed: <strong>{drift.observed}</strong></span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
