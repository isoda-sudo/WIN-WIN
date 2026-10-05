import { beforeEach, describe, expect, it } from "vitest";
import { getColorValues, getCSSVariable } from "~/lib/design-tokens";

describe("getCSSVariable", () => {
  beforeEach(() => {
    // Reset DOM
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
  });

  it("should return empty string when called on server side", () => {
    // Given: window is undefined (server-side)
    const originalWindow = global.window;
    // @ts-expect-error - intentionally setting to undefined for test
    global.window = undefined;

    // When: getCSSVariable is called
    const result = getCSSVariable("--primary");

    // Then: it should return empty string
    expect(result).toBe("");

    // Cleanup
    global.window = originalWindow;
  });

  it("should return CSS variable value from document", () => {
    // Given: CSS variable is set on document
    document.documentElement.style.setProperty("--primary", "210 100% 50%");

    // When: getCSSVariable is called
    const result = getCSSVariable("--primary");

    // Then: it should return the trimmed value
    expect(result).toBe("210 100% 50%");
  });

  it("should trim whitespace from CSS variable value", () => {
    // Given: CSS variable has extra whitespace
    document.documentElement.style.setProperty("--background", "  0 0% 100%  ");

    // When: getCSSVariable is called
    const result = getCSSVariable("--background");

    // Then: it should return trimmed value
    expect(result).toBe("0 0% 100%");
  });

  it("should return empty string for non-existent CSS variable", () => {
    // Given: CSS variable does not exist
    // When: getCSSVariable is called
    const result = getCSSVariable("--non-existent");

    // Then: it should return empty string
    expect(result).toBe("");
  });
});

describe("getColorValues", () => {
  beforeEach(() => {
    // Reset DOM
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
  });

  it("should return empty strings when called on server side", () => {
    // Given: window is undefined (server-side)
    const originalWindow = global.window;
    // @ts-expect-error - intentionally setting to undefined for test
    global.window = undefined;

    // When: getColorValues is called
    const result = getColorValues("--primary");

    // Then: it should return empty strings
    expect(result).toEqual({ light: "", dark: "" });

    // Cleanup
    global.window = originalWindow;
  });

  it("should return light and dark mode values for CSS variable", () => {
    // Given: CSS variable is set for both light and dark modes
    const style = document.createElement("style");
    style.textContent = `
      :root {
        --primary: 210 100% 50%;
      }
      .dark {
        --primary: 210 80% 40%;
      }
    `;
    document.head.appendChild(style);

    // When: getColorValues is called
    const result = getColorValues("--primary");

    // Then: it should return both light and dark values
    expect(result.light).toBe("210 100% 50%");
    expect(result.dark).toBe("210 80% 40%");

    // Cleanup
    document.head.removeChild(style);
  });

  it("should restore original theme state after reading both values", () => {
    // Given: document starts without dark class
    document.documentElement.classList.remove("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    const style = document.createElement("style");
    style.textContent = `
      :root { --primary: 210 100% 50%; }
      .dark { --primary: 210 80% 40%; }
    `;
    document.head.appendChild(style);

    // When: getColorValues is called
    const result = getColorValues("--primary");

    // Then: both values should be returned
    expect(result.light).toBe("210 100% 50%");
    expect(result.dark).toBe("210 80% 40%");
    // And original theme state (light) should be restored
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Cleanup
    document.head.removeChild(style);
  });

  it("should return different values for light and dark modes", () => {
    // Given: CSS variables with different light/dark values
    document.documentElement.classList.remove("dark");
    const style = document.createElement("style");
    style.textContent = `
      :root { --background: 0 0% 100%; }
      .dark { --background: 0 0% 10%; }
    `;
    document.head.appendChild(style);

    // When: getColorValues is called
    const result = getColorValues("--background");

    // Then: light and dark values should be different
    expect(result.light).toBe("0 0% 100%");
    expect(result.dark).toBe("0 0% 10%");

    // Cleanup
    document.head.removeChild(style);
    document.documentElement.classList.remove("dark");
  });
});
