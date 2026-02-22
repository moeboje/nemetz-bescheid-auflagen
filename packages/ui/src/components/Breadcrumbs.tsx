import React from "react";
import styles from "./Breadcrumbs.module.css";
import { cx } from "../utils/cx";

export type BreadcrumbItem = {
  key: string;
  label: React.ReactNode;
  href?: string;
  onClick?: () => void;
};

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  ariaLabel: string;
  className?: string;
};

export function Breadcrumbs({ items, ariaLabel, className }: BreadcrumbsProps) {
  return (
    <nav className={cx(styles.breadcrumbs, className)} aria-label={ariaLabel}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const content = isLast ? (
            <span className={styles.current}>{item.label}</span>
          ) : item.href ? (
            <a className={styles.link} href={item.href}>
              {item.label}
            </a>
          ) : (
            <button
              type="button"
              className={styles.linkButton}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          );

          return (
            <li key={item.key} className={styles.item}>
              {content}
              {!isLast ? <span className={styles.separator}>/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
