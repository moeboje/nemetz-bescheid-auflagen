import React from "react";
import styles from "./Input.module.css";
import { cx } from "../utils/cx";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

export function Input({ leading, trailing, className, disabled, ...rest }: InputProps) {
  return (
    <div className={cx(styles.wrapper, disabled && styles.disabled, className)}>
      {leading ? <span className={styles.leading}>{leading}</span> : null}
      <input className={styles.input} disabled={disabled} {...rest} />
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
    </div>
  );
}
