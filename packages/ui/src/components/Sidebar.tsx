import React from "react";
import styles from "./Sidebar.module.css";
import { cx } from "../utils/cx";

export type SidebarProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function Sidebar({ children, footer, className }: SidebarProps) {
  return (
    <div className={cx(styles.sidebar, className)}>
      <div className={styles.content}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  );
}

export type SidebarNavItemProps = {
  icon?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  collapsed?: boolean;
  tooltip?: string;
  children: React.ReactNode;
  className?: string;
};

export function SidebarNavItem({
  icon,
  active,
  onClick,
  href,
  collapsed,
  tooltip,
  children,
  className
}: SidebarNavItemProps) {
  const title = collapsed ? tooltip : undefined;
  const ariaLabel = collapsed ? tooltip : undefined;
  const content = (
    <>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <span className={cx(styles.label, collapsed && styles.labelCollapsed)}>{children}</span>
    </>
  );

  if (href) {
    return (
      <a
        className={cx(styles.navItem, collapsed && styles.navItemCollapsed, active && styles.active, className)}
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={ariaLabel}
        title={title}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(styles.navItem, collapsed && styles.navItemCollapsed, active && styles.active, className)}
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      title={title}
    >
      {content}
    </button>
  );
}
