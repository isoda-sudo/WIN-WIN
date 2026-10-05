import "@testing-library/jest-dom/vitest";
import { vi as vitestVi } from "vitest";

// Jest DOM matchers are already extended by the import above

// Make vi available globally
declare global {
  // eslint-disable-next-line no-var
  var vi: typeof import("vitest")["vi"];
}
globalThis.vi = vitestVi;

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vitestVi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vitestVi.fn(),
    removeListener: vitestVi.fn(),
    addEventListener: vitestVi.fn(),
    removeEventListener: vitestVi.fn(),
    dispatchEvent: vitestVi.fn(),
  })),
});
