import React from "react";
import styles from "./DataTable.module.css";
import { cx } from "../utils/cx";

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  mobileLabel?: string;
};

export type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>;
  data: T[];
  getRowKey: (row: T, index: number) => string;
  rowActions?: (row: T) => React.ReactNode;
  rowActionsLabel?: string;
  className?: string;
};

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  rowActions,
  rowActionsLabel,
  className
}: DataTableProps<T>) {
  return (
    <div className={cx(styles.wrapper, className)}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={cx(styles.th, styles[col.align ?? "left"])}>
                {col.header}
              </th>
            ))}
            {rowActions ? <th className={styles.th} /> : null}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={getRowKey(row, index)} className={styles.row}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cx(styles.td, styles[col.align ?? "left"])}
                  data-label={col.mobileLabel ?? (typeof col.header === "string" ? col.header : "")}
                >
                  {col.render ? col.render(row) : (row as Record<string, React.ReactNode>)[col.key]}
                </td>
              ))}
              {rowActions ? (
                <td className={styles.actions} data-label={rowActionsLabel ?? ""}>
                  {rowActions(row)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
