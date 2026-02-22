import React from "react";
import styles from "./Select.module.css";
import { cx } from "../utils/cx";

export type SelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: SelectOption[];
};

export function Select({ options, className, disabled, ...rest }: SelectProps) {
  return (
    <div className={cx(styles.wrapper, disabled && styles.disabled, className)}>
      <select className={styles.select} disabled={disabled} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
