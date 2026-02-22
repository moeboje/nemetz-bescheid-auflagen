import React from "react";
import styles from "./Pagination.module.css";
import { cx } from "../utils/cx";

export type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabelPrev: string;
  ariaLabelNext: string;
  getPageAriaLabel: (page: number, isCurrent: boolean) => string;
  className?: string;
};

export function Pagination({
  page,
  totalPages,
  onPageChange,
  ariaLabelPrev,
  ariaLabelNext,
  getPageAriaLabel,
  className
}: PaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div className={cx(styles.pagination, className)}>
      <button
        type="button"
        className={styles.nav}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        aria-label={ariaLabelPrev}
      >
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
            <path
              d="M12.5 4.5L7.5 10l5 5.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      <div className={styles.pages}>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={cx(styles.page, p === page && styles.active)}
            onClick={() => onPageChange(p)}
            aria-label={getPageAriaLabel(p, p === page)}
          >
            {p}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.nav}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        aria-label={ariaLabelNext}
      >
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
            <path
              d="M7.5 4.5l5 5.5-5 5.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
    </div>
  );
}
