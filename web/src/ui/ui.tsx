import { Link } from "react-router-dom";

import styles from "./ui.module.css";

export function Header({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }): React.JSX.Element {
  return (
    <header className={styles.header}>
      <div>
        {eyebrow === undefined ? null : <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function Surface({ children, className = "" }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  return <section className={`${styles.surface} ${className}`}>{children}</section>;
}

export function PrimaryLink({ children, to }: { children: React.ReactNode; to: string }): React.JSX.Element {
  return <Link className={styles.primary} to={to}>{children}</Link>;
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return <button {...props} className={`${styles.primary} ${props.className ?? ""}`} />;
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return <button {...props} className={`${styles.secondary} ${props.className ?? ""}`} />;
}

export function ErrorNotice({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className={styles.error} role="alert">{children}</p>;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }): React.JSX.Element {
  return <div className={styles.empty}><strong>{title}</strong><p>{detail}</p>{action}</div>;
}
