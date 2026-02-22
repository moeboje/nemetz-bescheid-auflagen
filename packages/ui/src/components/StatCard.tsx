import React from "react";
import styles from "./StatCard.module.css";
import { cx } from "../utils/cx";

export type StatCardProps = {
  icon?: React.ReactNode;
  label?: React.ReactNode;
  value?: React.ReactNode;
  highlight?: boolean;
  className?: string;
};

export function StatCard({ icon, label, value, highlight, className }: StatCardProps) {
  return (
    <div className={cx(styles.card, className)}>
      {icon ? <div className={styles.icon}>{icon}</div> : null}
      <div className={styles.label}>{label}</div>
      <div className={cx(styles.value, highlight && styles.highlight)}>{value}</div>
    </div>
  );
}
