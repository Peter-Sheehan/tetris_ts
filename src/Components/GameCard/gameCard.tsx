import styles from './gameCard.module.css'
import Rail from '../SideRail/rail'
import HoldPiece from '../HoldPiece/holdPiece'
import StatsCard from '../LevelStats/statsCard'
import type { Stat, TetrominoType } from '../../game/types'

const heldPiece: TetrominoType[] = ['T']
const nextPieces: TetrominoType[] = ['I', 'S']

const leftStats: Stat[] = [
  { name: 'LEVEL', value: 8 },
  { name: 'LINES', value: 74 },
  { name: 'TIME', value: new Date().toLocaleTimeString() },
]

const rightStats: Stat[] = [
  { name: 'SCORE', value: 128450 },
  { name: 'HIGH', value: 301900 },
]

export default function GameCard() {
  return (
    <div className={styles.gameCard}>
      <Rail>
        <HoldPiece label="HOLD" pieces={heldPiece} />
        <StatsCard stats={leftStats} />
      </Rail>
      <div className={styles.board} />
      <Rail>
        <StatsCard stats={rightStats} />
        <HoldPiece label="NEXT" pieces={nextPieces} />
      </Rail>
    </div>
  )
}
