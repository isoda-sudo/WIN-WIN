import { describe, expect, it } from "vitest";
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  COMPRESS_STEPS,
  fitToA4,
  moveItem,
  PAGE_MARGIN_PT,
  scaleToMaxEdge,
} from "~/lib/scan-pdf";

describe("scaleToMaxEdge", () => {
  it("shrinks the long edge keeping ratio", () => {
    expect(scaleToMaxEdge({ width: 4000, height: 3000 }, 1600)).toEqual({
      width: 1600,
      height: 1200,
    });
  });
  it("never enlarges", () => {
    expect(scaleToMaxEdge({ width: 800, height: 600 }, 1600)).toEqual({
      width: 800,
      height: 600,
    });
  });
});

describe("fitToA4", () => {
  it("fits a landscape image by width and centers it", () => {
    const l = fitToA4({ width: 2000, height: 1000 });
    expect(l.width).toBeCloseTo(A4_WIDTH_PT - PAGE_MARGIN_PT * 2);
    expect(l.height).toBeCloseTo(l.width / 2);
    expect(l.x).toBeCloseTo(PAGE_MARGIN_PT);
    expect(l.y).toBeCloseTo((A4_HEIGHT_PT - l.height) / 2);
  });
  it("fits a tall image by height", () => {
    const l = fitToA4({ width: 500, height: 4000 });
    expect(l.height).toBeCloseTo(A4_HEIGHT_PT - PAGE_MARGIN_PT * 2);
    expect(l.width / l.height).toBeCloseTo(500 / 4000);
  });
});

describe("COMPRESS_STEPS", () => {
  it("starts at 1600/0.75, bottoms at 0.4 then 1200", () => {
    expect(COMPRESS_STEPS[0]).toEqual({ maxEdge: 1600, quality: 0.75 });
    expect(COMPRESS_STEPS.at(-1)).toEqual({ maxEdge: 1200, quality: 0.4 });
    const q = COMPRESS_STEPS.map((s) => s.quality);
    expect([...q].sort((a, b) => b - a)).toEqual(q);
  });
});

describe("moveItem", () => {
  it("moves and ignores out of range", () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});
