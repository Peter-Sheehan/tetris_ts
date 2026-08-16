import type { ReactNode } from 'react'
import styles from './rail.module.css'

export default function Rail({ children }: { children: ReactNode }) {
  return <div className={styles.rail}>{children}</div>
}
