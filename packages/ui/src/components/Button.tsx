import React from "react";
import styles from "./Button.module.css";
import { cx } from "../utils/cx";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], styles[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      <span className={cx(styles.content, loading && styles.loading)}>{children}</span>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
    </button>
  );
}
