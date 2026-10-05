import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "~/components/ui/button";

// Regex constants for performance optimization
const CLICK_ME_REGEX = /click me/i;
const DESTRUCTIVE_REGEX = /destructive/i;
const SMALL_REGEX = /small/i;
const LINK_REGEX = /link/i;
const DISABLED_REGEX = /disabled/i;

describe("Button Component", () => {
  it("renders correctly with default props", () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole("button", { name: CLICK_ME_REGEX });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("bg-primary");
  });

  it("applies the correct variant class", () => {
    render(<Button variant="destructive">Destructive</Button>);

    const button = screen.getByRole("button", { name: DESTRUCTIVE_REGEX });
    expect(button).toHaveClass("bg-destructive");
  });

  it("applies the correct size class", () => {
    render(<Button size="sm">Small</Button>);

    const button = screen.getByRole("button", { name: SMALL_REGEX });
    expect(button).toHaveClass("h-8");
  });

  it("renders as a child component when asChild is true", () => {
    render(
      <Button asChild>
        <a href="https://example.com">Link</a>
      </Button>
    );

    const link = screen.getByRole("link", { name: LINK_REGEX });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveClass("inline-flex items-center justify-center gap-2");
  });

  it("handles click events", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click me</Button>);

    const button = screen.getByRole("button", { name: CLICK_ME_REGEX });
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when disabled prop is provided", () => {
    render(<Button disabled>Disabled</Button>);

    const button = screen.getByRole("button", { name: DISABLED_REGEX });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("disabled:opacity-50");
  });
});
