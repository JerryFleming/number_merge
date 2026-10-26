import { COLS, ROWS, type Pos } from "../core/types";

/** Side gutter in pixels (also the minimum top gutter). */
export const GUTTER = 16;
/** Height reserved at the bottom for the power-up bar. */
export const POWER_BAR_H = 96;
/** Space above the board for the score display. */
export const SCORE_H = 72;
/**
 * Extra clearance always kept below the power bar, on top of any reported
 * safe-area inset. Mobile browsers' dynamic bottom URL bar is NOT reported by
 * `env(safe-area-inset-bottom)`, so without this the bar can sit under it.
 */
export const BOTTOM_MARGIN = 28;

export interface Point {
  x: number;
  y: number;
}

/**
 * Bottom safe-area inset in CSS pixels (iOS home indicator / Safari toolbar).
 * Read from a probe element using `env(safe-area-inset-bottom)`; 0 where the
 * browser doesn't expose it or in a non-DOM context.
 */
export function safeBottom(): number {
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;";
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return Number.isFinite(h) ? h : 0;
  } catch {
    return 0;
  }
}

/**
 * Total bottom clearance to keep below the power bar: the reported safe-area
 * inset plus a fixed margin for the mobile browser's dynamic URL bar.
 */
export function bottomInset(): number {
  return safeBottom() + BOTTOM_MARGIN;
}

/**
 * The largest square cell size that fits COLS across (with side gutters) and
 * ROWS down (with the score strip and power bar reserved).
 */
export function cellSize(viewportW: number, viewportH: number): number {
  const byWidth = (viewportW - GUTTER * 2) / COLS;
  const byHeight =
    (viewportH - SCORE_H - POWER_BAR_H - GUTTER - bottomInset()) / ROWS;
  return Math.max(1, Math.floor(Math.min(byWidth, byHeight)));
}

/** Top-left pixel of cell (0,0): the grid is centered horizontally. */
export function gridOrigin(
  viewportW: number,
  _viewportH: number,
  size: number,
): Point {
  const boardW = size * COLS;
  return {
    x: Math.floor((viewportW - boardW) / 2),
    y: SCORE_H,
  };
}

/** Pixel center of a cell. */
export function cellCenter(pos: Pos, origin: Point, size: number): Point {
  return {
    x: origin.x + pos.col * size + size / 2,
    y: origin.y + pos.row * size + size / 2,
  };
}

/** The cell a pixel falls in, or null if outside the grid. */
export function posFromPixel(
  x: number,
  y: number,
  origin: Point,
  size: number,
): Pos | null {
  const col = Math.floor((x - origin.x) / size);
  const row = Math.floor((y - origin.y) / size);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { col, row };
}
