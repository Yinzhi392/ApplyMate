import { NavLink, useLocation } from "react-router-dom";

import styles from "./PageFrame.module.css";

const tabRoutes = ["/", "/records", "/account"];

export function PageFrame({ children }: { children: React.ReactNode }): React.JSX.Element {
  const location = useLocation();
  const showTabs = tabRoutes.includes(location.pathname);
  return (
    <div className={styles.viewport}>
      <main className={`${styles.page} ${showTabs ? styles.withTabs : ""}`}>{children}</main>
      {showTabs ? (
        <nav aria-label="主要导航" className={styles.tabs}>
          <NavLink className={({ isActive }) => isActive ? styles.activeTab : styles.tab} end to="/">首页</NavLink>
          <NavLink className={({ isActive }) => isActive ? styles.activeTab : styles.tab} to="/records">记录</NavLink>
          <NavLink className={({ isActive }) => isActive ? styles.activeTab : styles.tab} to="/account">我的</NavLink>
        </nav>
      ) : null}
    </div>
  );
}

export function LoadingScreen({ label, action }: { label: string; action?: () => Promise<unknown> }): React.JSX.Element {
  return (
    <div className={styles.loading}>
      <span aria-hidden="true" className={styles.mark}>◔</span>
      <p>{label}</p>
      {action === undefined ? null : <button className={styles.retry} onClick={() => void action()} type="button">重试</button>}
    </div>
  );
}
