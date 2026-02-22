import React from "react";
import styles from "./DateInput.module.css";
import { cx } from "../utils/cx";

export type DateInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  range?: false;
};

export type DateRangeInputProps = {
  range: true;
  startProps?: React.InputHTMLAttributes<HTMLInputElement>;
  endProps?: React.InputHTMLAttributes<HTMLInputElement>;
  className?: string;
};

export function DateInput(props: DateInputProps | DateRangeInputProps) {
  if ("range" in props && props.range) {
    const { startProps, endProps, className } = props;
    return (
      <div className={cx(styles.range, className)}>
        <input className={styles.input} type="date" {...startProps} />
        <input className={styles.input} type="date" {...endProps} />
      </div>
    );
  }

  const { className, ...rest } = props;
  return <input className={cx(styles.input, className)} type="date" {...rest} />;
}
