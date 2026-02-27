export const ROWS_FIRST_PAGE = 14;
export const ROWS_OTHER_PAGES = 22;

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items];
  }

  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function buildPages<T>(items: T[]): T[][] {
  if (items.length === 0) {
    return [[]];
  }

  const firstPage = items.slice(0, ROWS_FIRST_PAGE);
  const rest = items.slice(ROWS_FIRST_PAGE);
  return [firstPage, ...chunk(rest, ROWS_OTHER_PAGES)];
}
