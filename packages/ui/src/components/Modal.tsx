import React from "react";
import styles from "./Modal.module.css";
import { cx } from "../utils/cx";
import { IconButton } from "./IconButton";

export type ModalProps = {
  open: boolean;
  onClose?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  closeAriaLabel: string;
  className?: string;
};

export function Modal({
  open,
  onClose,
  header,
  footer,
  children,
  closeAriaLabel,
  className
}: ModalProps) {
  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation">
      <div className={cx(styles.modal, className)} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.headerContent}>{header}</div>
          {onClose ? (
            <IconButton
              ariaLabel={closeAriaLabel}
              onClick={onClose}
              size="sm"
            >
              <span className={styles.closeIcon} aria-hidden="true">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                  <path
                    d="M5 5l10 10M15 5L5 15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </IconButton>
          ) : null}
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}
