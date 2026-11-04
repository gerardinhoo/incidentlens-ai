import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import styles from './AppLayout.module.css';

export interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { status, signOut } = useAuth();
  const location = useLocation();
  const isLogin = location.pathname === '/login';

  return (
    <div className={styles.shell}>
      <div className={styles.headerBar}>
        <header className={styles.header}>
          <Link className={styles.brand} to="/">
            IncidentLens AI
          </Link>
          <div className={styles.headerActions}>
            {status === 'signed-in' ? (
              <>
                <nav className={styles.nav} aria-label="Primary">
                  <NavLink
                    to="/incidents"
                    className={({ isActive }) =>
                      isActive
                        ? `${styles.navLink} ${styles.navLinkActive}`
                        : styles.navLink
                    }
                  >
                    Incidents
                  </NavLink>
                </nav>
                <button
                  type="button"
                  className={styles.signOut}
                  onClick={() => {
                    void signOut();
                  }}
                >
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </header>
      </div>
      <main
        className={isLogin ? `${styles.main} ${styles.mainLogin}` : styles.main}
      >
        {children}
      </main>
    </div>
  );
}
