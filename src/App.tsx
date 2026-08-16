import Header from './Components/Header/header'
import GameCard from './Components/GameCard/gameCard'
import styles from './App.module.css'

function App() {
  return (
    <div className={styles.mainLayout}>
      <div className={styles.headerContainer}>
        <Header />
      </div>
      <div className={styles.mainContent}>
        <GameCard />
      </div>
    </div>
  )
}

export default App
