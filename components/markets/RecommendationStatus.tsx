import { recommendationStatus } from '@/lib/markets/recommendation-status'
import type { Recommendation } from '@/lib/markets/recommendations'
import styles from './RecommendationStatus.module.css'
export function RecommendationStatus({
  recommendations,
  viewedAt,
}: {
  recommendations: Recommendation[]
  viewedAt: string
}) {
  const status = recommendationStatus(recommendations, Date.parse(viewedAt))
  return (
    <section
      className={styles.panel}
      aria-labelledby="recommendation-status-title"
    >
      <div className={styles.heading}>
        <span
          className={styles.indicator}
          data-ready={status.approved > 0}
          aria-hidden="true"
        />
        <p className={styles.eyebrow}>
          {status.approved ? 'Ready for your review' : 'Latest assessment'}
        </p>
      </div>
      <h2 id="recommendation-status-title">{status.title}</h2>
      <p className={styles.description}>{status.description}</p>
      {!status.approved && status.reasons.length > 0 && (
        <div className={styles.reasons}>
          {status.reasons.map((reason) => (
            <div key={reason.key}>
              <div className={styles.reasonHead}>
                <h3>{reason.label}</h3>
                <span>{reason.count}</span>
              </div>
              <div
                className={styles.bar}
                role="img"
                aria-label={`${reason.count} of ${status.total} decisions: ${reason.label}`}
              >
                <i
                  style={{ width: `${(reason.count / status.total) * 100}%` }}
                />
              </div>
              <p>{reason.detail}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
