import React from "react";
import styles from "./Badge.module.css";
import { cx } from "../utils/cx";

export type BadgeProps = {
  variant?: "success" | "warning" | "danger" | "neutral";
  size?: "sm" | "md";
  children?: React.ReactNode;
  className?: string;
};

export function Badge({ variant = "neutral", size = "md", children, className }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[variant], styles[size], className)}>
      {children}
    </span>
  );
}

export type StatusDotProps = {
  variant?: "success" | "warning" | "danger" | "neutral";
  size?: "sm" | "md";
  className?: string;
};

export function StatusDot({ variant = "neutral", size = "md", className }: StatusDotProps) {
  return <span className={cx(styles.dot, styles[variant], styles[size], className)} />;
}
