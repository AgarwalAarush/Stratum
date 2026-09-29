import styles from '@/components/markets/RecommendationsWorkspace.module.css'

export default function RecommendationsLoading() {
  return <div className={styles.page} aria-busy="true" aria-label="Loading recommendations">
    <p className={styles.breadcrumb}>Today / Recommendations</p>
    <header className={styles.header}><div><h1>Recommendations</h1><p className={styles.subtitle}>Loading your latest assessment…</p></div></header>
    <div className="markets-loading-line" />
    <div className="markets-loading-line" />
    {Array.from({ length: 6 }, (_, index) => <div key={index} className={styles.decisionRow}><div className={styles.rowButton}><span className="markets-loading-line" /><span className="markets-loading-line" /></div></div>)}
  </div>
}
