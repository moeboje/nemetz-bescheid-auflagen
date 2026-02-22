import React from "react";
import styles from "./IconButton.module.css";
import { cx } from "../utils/cx";

export type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "neutral" | "danger";
  size?: "sm" | "md";
  ariaLabel: string;
};

export function IconButton({
  variant = "neutral",
  size = "md",
  ariaLabel,
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], styles[size], className)}
      aria-label={ariaLabel}
      {...rest}
    >
      {children}
    </button>
  );
}
