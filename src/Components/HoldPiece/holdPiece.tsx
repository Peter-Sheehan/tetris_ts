import styles from './holdPiece.module.css'
import type { TetrominoType } from '../../game/types'

const PAL: Record<TetrominoType, string> = {
  I: '#18b9dd',
  O: '#f5c518',
  T: '#a341e8',
  S: '#3fc23a',
  Z: '#e83a3a',
  J: '#3a5ee8',
  L: '#f57c1f',
}

export default function HoldPiece({
  label,
  pieces,
}: {
  label: string
  pieces: TetrominoType[]
}) {
  return (
    <div className={styles.holdPiece}>
      <p className={styles.label}>{label}</p>
      <div className={styles.pieces}>
        {pieces.map((piece, i) => (
          <div
            className={styles.piece}
            key={i}
            style={{ background: PAL[piece] }}
          >
            {piece}
          </div>
        ))}
      </div>
    </div>
  )
}
