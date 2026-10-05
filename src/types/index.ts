/**
 * Type definitions for the application
 */

import type React from "react";

/**
 * Base props for page components (sections, cards, etc.)
 */
export interface BasePageComponentProps {
  children: React.ReactNode;
  className?: string;
  description?: string;
  title?: string;
}

/**
 * Base props for grid layout components
 */
export interface BaseGridProps {
  children: React.ReactNode;
  className?: string;
  gap?: "sm" | "md" | "lg";
}

/**
 * Grid props for standard layouts (supports up to 6 columns)
 */
export interface StandardGridProps extends BaseGridProps {
  cols?: 1 | 2 | 3 | 4 | 5 | 6;
}
