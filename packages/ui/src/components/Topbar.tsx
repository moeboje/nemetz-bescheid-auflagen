import React from "react";
import styles from "./Topbar.module.css";
import { cx } from "../utils/cx";

export type TopbarProps = {
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function Topbar({ left, right, children, className }: TopbarProps) {
  return (
    <div className={cx(styles.topbar, className)}>
      {children ? (
        children
      ) : (
        <>
          <div className={styles.left}>{left}</div>
          <div className={styles.right}>{right}</div>
        </>
      )}
    </div>
  );
}
