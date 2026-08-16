import styles from './header.module.css'
import logo from '../../assets/tetris.png'
export default function Header() {
  return (
    <header className={styles.appHeader}>
      <div className ={styles.innerAppHeader}>
        <div className={styles.outerLayer}>
          <div className={styles.mainLayer}>
           <div className={styles.outerInnerLayer}>
            <div className={styles.innerLayer}>
              <img src={logo} alt="Tetris Logo"/>
            </div>
            </div>
          </div>
        </div>
      </div>
  </header>
  )
}
