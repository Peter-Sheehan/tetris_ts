import styles from './statsCard.module.css'
import type { Stat } from '../../game/types'

export default function StatsCard({ stats }: { stats: Stat[] }) {
  return (
    <div className={styles.statsCard}>
      {stats.map((stat) => (
        <div className={styles.stat} key={stat.name}>
          <p className={styles.name}>{stat.name}</p>
          <p className={styles.value}>{stat.value}</p>
        </div>
      ))}
    </div>
  )
}
