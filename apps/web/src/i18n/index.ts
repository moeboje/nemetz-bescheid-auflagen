import de from "./de.json";

export type I18nKey = keyof typeof de;

export function t(key: I18nKey) {
  return de[key] ?? key;
}
