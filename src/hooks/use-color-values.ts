import { useEffect, useState } from "react";
import { getColorValues } from "~/lib/design-tokens";

interface ColorValuesState {
  dark: string;
  error: Error | null;
  light: string;
  loading: boolean;
}

/**
 * Custom hook for loading color values with error handling
 * @param variableName - CSS variable name (e.g., "--primary")
 * @returns Color values state with loading and error states
 */
export function useColorValues(variableName: string): ColorValuesState {
  const [state, setState] = useState<ColorValuesState>({
    light: "",
    dark: "",
    loading: true,
    error: null,
  });

  useEffect(() => {
    try {
      const colorValues = getColorValues(variableName);
      setState({
        ...colorValues,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState({
        light: "",
        dark: "",
        loading: false,
        error: error instanceof Error ? error : new Error("Unknown error"),
      });
    }
  }, [variableName]);

  return state;
}
