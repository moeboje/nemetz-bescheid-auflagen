import React from "react";
import styles from "./AppShell.module.css";
import { cx } from "../utils/cx";

export type AppShellProps = {
  sidebar: React.ReactNode;
  topbar?: React.ReactNode;
  children: React.ReactNode;
  sidebarCollapsed?: boolean;
  mobileSidebarOpen?: boolean;
  onMobileSidebarClose?: () => void;
  mobileOverlayAriaLabel?: string;
  className?: string;
};

export function AppShell({
  sidebar,
  topbar,
  children,
  sidebarCollapsed = false,
  mobileSidebarOpen = false,
  onMobileSidebarClose,
  mobileOverlayAriaLabel = "Close navigation",
  className
}: AppShellProps) {
  React.useEffect(() => {
    if (!mobileSidebarOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  return (
    <div
      className={cx(
        styles.shell,
        sidebarCollapsed && styles.collapsed,
        mobileSidebarOpen && styles.mobileOpen,
        className
      )}
    >
      <button
        type="button"
        className={styles.overlay}
        aria-label={mobileOverlayAriaLabel}
        onClick={onMobileSidebarClose}
      />
      <aside className={styles.sidebar}>{sidebar}</aside>
      <div className={styles.main}>
        {topbar ? <div className={styles.topbar}>{topbar}</div> : null}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
