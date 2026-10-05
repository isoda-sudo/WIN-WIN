import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useColorValues } from "~/hooks/use-color-values";

// Mock design-tokens
vi.mock("~/lib/design-tokens", () => ({
  getColorValues: vi.fn((variableName: string) => {
    if (variableName === "--error-test") {
      throw new Error("Failed to get color values");
    }
    return {
      light: "0.4341 0.0392 41.9938",
      dark: "0.5341 0.0492 42.9938",
    };
  }),
}));

describe("useColorValues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return color values with loading state", async () => {
    // Given: hook is initialized
    const { result } = renderHook(() => useColorValues("--primary"));

    // Wait for values to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Then: values should be loaded
    expect(result.current.light).toBe("0.4341 0.0392 41.9938");
    expect(result.current.dark).toBe("0.5341 0.0492 42.9938");
    expect(result.current.error).toBe(null);
  });

  it("should handle errors gracefully", async () => {
    // Given: hook is initialized with variable that throws error
    const { result } = renderHook(() => useColorValues("--error-test"));

    // Wait for error to be caught
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Then: error should be set
    expect(result.current.error).not.toBe(null);
    expect(result.current.error?.message).toBe("Failed to get color values");
    expect(result.current.light).toBe("");
    expect(result.current.dark).toBe("");
  });

  it("should update values when variableName changes", async () => {
    // Given: hook is initialized
    const { result, rerender } = renderHook(
      ({ varName }) => useColorValues(varName),
      {
        initialProps: { varName: "--primary" },
      }
    );

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // When: variableName changes
    rerender({ varName: "--secondary" });

    // Wait for new values to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Values should be updated
    expect(result.current.light).toBe("0.4341 0.0392 41.9938");
    expect(result.current.dark).toBe("0.5341 0.0492 42.9938");
  });
});
