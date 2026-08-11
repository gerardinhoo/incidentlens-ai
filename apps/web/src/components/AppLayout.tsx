import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import styles from './AppLayout.module.css';

export interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.headerBar}>
        <header className={styles.header}>
          <Link className={styles.brand} to="/">
            IncidentLens AI
          </Link>
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
        </header>
      </div>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
