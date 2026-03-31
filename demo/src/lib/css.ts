import type { CSSProperties } from "react";

type StyleMap = Record<string, CSSProperties>;

export function css<T extends StyleMap>(styles: T): T {
  return styles;
}
