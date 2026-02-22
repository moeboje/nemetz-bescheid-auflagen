import React from "react";
import styles from "./Card.module.css";
import { cx } from "../utils/cx";

export type CardProps = {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  flat?: boolean;
};

export function Card({ children, className, padding = "md", flat }: CardProps) {
  return (
    <div
      className={cx(
        styles.card,
        styles[`pad-${padding}`],
        flat && styles.flat,
        className
      )}
    >
      {children}
    </div>
  );
}
