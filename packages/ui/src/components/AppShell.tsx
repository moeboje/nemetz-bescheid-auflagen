import React from "react";
import styles from "./AppShell.module.css";
import { cx } from "../utils/cx";

export type AppShellProps = {
  sidebar: React.ReactNode;
  topbar?: React.ReactNode;
  children: React.ReactNode;
  sidebarCollapsed?: boolean;
  className?: string;
};

export function AppShell({
  sidebar,
  topbar,
  children,
  sidebarCollapsed = false,
  className
}: AppShellProps) {
  return (
    <div className={cx(styles.shell, sidebarCollapsed && styles.collapsed, className)}>
      <aside className={styles.sidebar}>{sidebar}</aside>
      <div className={styles.main}>
        {topbar ? <div className={styles.topbar}>{topbar}</div> : null}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
