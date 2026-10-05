import type React from "react";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { cn } from "~/lib/utils";
import type { BasePageComponentProps, StandardGridProps } from "~/types";

import { ThemeToggle } from "../theme-toggle";
import { BackButton } from "./back-button";

interface PageTemplateProps {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: string;
  onBackClick?: () => void;
  showBackButton?: boolean;
  title?: string;
}

export function PageTemplate({
  children,
  className,
  title,
  description,
  action,
  showBackButton = false,
  onBackClick,
}: PageTemplateProps) {
  return (
    <main className="flex flex-1 flex-col">
      <div className={cn("min-h-full bg-background", className)}>
        {/* Page Header Section */}
        <div className="border-border/40 border-b bg-background">
          <div className="container mx-auto px-4 py-5 sm:px-8 sm:py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                {title || description ? (
                  <div className="flex items-center gap-3">
                    {showBackButton ? (
                      <BackButton
                        className="size-8 shrink-0 rounded-lg border bg-card p-0 text-muted-foreground shadow-sm transition-all hover:bg-accent hover:text-foreground hover:shadow"
                        onClick={onBackClick}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {title ? (
                        <h1 className="truncate font-bold text-3xl text-foreground tracking-tight">
                          {title}
                        </h1>
                      ) : null}
                      {description ? (
                        <p className="text-balance text-muted-foreground text-sm leading-relaxed">
                          {description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {action}
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="container mx-auto space-y-12 px-4 py-8 sm:px-8 sm:py-12">
          {children}
        </div>
      </div>
    </main>
  );
}

interface PageHeroProps {
  actions?: React.ReactNode;
  badges?: Array<{
    label: string;
    icon?: React.ReactNode;
    variant?: "default" | "secondary" | "outline" | "destructive";
    className?: string;
  }>;
  className?: string;
  description?: string | React.ReactNode;
  gradient?: "primary" | "secondary" | "accent" | "muted";
  title: string | React.ReactNode;
}

export function PageHero({
  title,
  description,
  badges,
  actions,
  gradient = "primary",
  className,
}: PageHeroProps) {
  const gradientClasses = {
    primary: "bg-gradient-to-br from-primary/10 via-primary/5 to-background",
    secondary:
      "bg-gradient-to-br from-secondary/15 via-secondary/5 to-background",
    accent: "bg-gradient-to-br from-accent/20 via-accent/5 to-background",
    muted: "bg-gradient-to-br from-muted/30 via-muted/10 to-background",
  };

  const blurColors = {
    primary: "bg-primary/20",
    secondary: "bg-secondary/20",
    accent: "bg-accent/25",
    muted: "bg-muted/30",
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/50 p-10 shadow-xl transition-shadow duration-300 hover:shadow-2xl md:p-16",
        gradientClasses[gradient],
        className
      )}
    >
      <div className="relative z-10 space-y-8">
        {badges?.length ? (
          <div className="flex flex-wrap items-center gap-2.5">
            {badges.map((badge) => (
              <Badge
                className={cn("px-3 py-1.5 text-xs shadow-sm", badge.className)}
                key={badge.label}
                variant={badge.variant || "secondary"}
              >
                {badge.icon ? (
                  <span className="mr-1.5">{badge.icon}</span>
                ) : null}
                {badge.label}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="max-w-4xl space-y-6">
          <h2 className="font-bold text-4xl text-foreground leading-tight tracking-tight md:text-6xl">
            {title}
          </h2>
          {description ? (
            <p className="text-balance text-lg text-muted-foreground leading-relaxed md:text-xl">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap gap-3 pt-2">{actions}</div>
        ) : null}
      </div>
      <div
        className={cn(
          "pointer-events-none absolute -top-24 -right-24 size-80 rounded-full opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-80",
          blurColors[gradient]
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-80",
          blurColors[gradient === "primary" ? "secondary" : "primary"]
        )}
      />
    </div>
  );
}

interface PageSectionProps extends BasePageComponentProps {
  action?: React.ReactNode;
  spacing?: "sm" | "md" | "lg" | "xl";
}

export function PageSection({
  children,
  className,
  title,
  description,
  action,
  spacing = "md",
}: PageSectionProps) {
  const spacingClasses = {
    sm: "space-y-5",
    md: "space-y-7",
    lg: "space-y-10",
    xl: "space-y-12",
  };

  const contentSpacingClasses = {
    sm: "space-y-4",
    md: "space-y-6",
    lg: "space-y-8",
    xl: "space-y-10",
  };

  return (
    <section className={cn(spacingClasses[spacing], className)}>
      {title || description || action ? (
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            {title ? (
              <h2 className="font-bold text-2xl text-foreground tracking-tight md:text-3xl">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="max-w-3xl text-balance text-base text-muted-foreground leading-relaxed">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="mt-1 flex-shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={contentSpacingClasses[spacing]}>{children}</div>
    </section>
  );
}

interface PageCardProps extends BasePageComponentProps {
  action?: React.ReactNode;
  hover?: boolean;
  icon?: React.ReactNode;
  variant?: "default" | "elevated" | "outlined" | "ghost";
}

export function PageCard({
  children,
  className,
  title,
  description,
  action,
  variant = "default",
  hover = false,
  icon,
}: PageCardProps) {
  const variantClasses = {
    default: "bg-card text-card-foreground border border-border/60 shadow-md",
    elevated: "bg-card text-card-foreground border border-border/50 shadow-xl",
    outlined: "bg-card text-card-foreground border-2 border-border shadow-sm",
    ghost: "bg-transparent text-card-foreground border-0 shadow-none",
  };

  const hoverClasses = hover
    ? "transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] hover:border-border"
    : "transition-all duration-200 hover:shadow-lg";

  return (
    <Card
      className={cn(
        variantClasses[variant],
        hoverClasses,
        "rounded-xl",
        className
      )}
    >
      {title || description || action || icon ? (
        <CardHeader className="flex items-start space-y-3 pb-5">
          <div className="flex w-full items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 gap-4">
              {icon ? (
                <div className="shrink-0 rounded-xl bg-primary/10 p-3.5 text-primary shadow-sm">
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0 flex-1 space-y-2.5">
                {title ? (
                  <CardTitle className="font-bold text-foreground text-xl leading-tight">
                    {title}
                  </CardTitle>
                ) : null}
                {description ? (
                  <CardDescription className="text-balance text-muted-foreground text-sm leading-relaxed">
                    {description}
                  </CardDescription>
                ) : null}
              </div>
            </div>
            {action ? <div className="mt-1 flex-shrink-0">{action}</div> : null}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

interface PageFeatureCardProps {
  children?: React.ReactNode;
  className?: string;
  description: string;
  href?: string;
  icon: React.ReactNode;
  iconColor?: string;
  title: string;
}

export function PageFeatureCard({
  title,
  description,
  icon,
  iconColor = "text-primary",
  children,
  className,
}: PageFeatureCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/50 bg-card p-7 shadow-md transition-all duration-300 hover:border-border hover:shadow-2xl",
        className
      )}
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "rounded-xl bg-primary/10 p-4 shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md",
              iconColor
            )}
          >
            {icon}
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="font-bold text-foreground text-xl leading-tight">
            {title}
          </h3>
          <p className="text-balance text-muted-foreground text-sm leading-relaxed">
            {description}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

interface PageStepCardProps {
  className?: string;
  description: string | React.ReactNode;
  step: number;
  title: string;
  variant?: "primary" | "secondary" | "accent";
}

export function PageStepCard({
  step,
  title,
  description,
  variant = "primary",
  className,
}: PageStepCardProps) {
  const variantClasses = {
    primary: {
      bg: "bg-primary/5 border border-primary/20",
      badge: "bg-primary/15 text-primary shadow-sm",
    },
    secondary: {
      bg: "bg-secondary/5 border border-secondary/20",
      badge: "bg-secondary/15 text-secondary-foreground shadow-sm",
    },
    accent: {
      bg: "bg-accent/5 border border-accent/20",
      badge: "bg-accent/15 text-accent-foreground shadow-sm",
    },
  };

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-xl p-5 transition-colors hover:bg-opacity-80",
        variantClasses[variant].bg,
        className
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full font-bold text-base",
          variantClasses[variant].badge
        )}
      >
        {step}
      </div>
      <div className="flex-1 space-y-1.5">
        <h4 className="font-bold text-base text-foreground">{title}</h4>
        <p className="text-balance text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

interface PageGridProps extends StandardGridProps {}

export function PageGrid({
  children,
  className,
  cols = 3,
  gap = "md",
}: PageGridProps) {
  const gridClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    5: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
    6: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
  };

  const gapClasses = {
    sm: "gap-4",
    md: "gap-6",
    lg: "gap-8",
  };

  return (
    <div
      className={cn(
        "grid auto-rows-fr",
        gridClasses[cols],
        gapClasses[gap],
        className
      )}
    >
      {children}
    </div>
  );
}

interface PageEmptyStateProps {
  action?: React.ReactNode;
  className?: string;
  description?: string;
  icon?: React.ReactNode;
  title: string;
}

export function PageEmptyState({
  title,
  description,
  icon,
  action,
  className,
}: PageEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-border border-dashed bg-muted/20 px-6 py-20 text-center",
        className
      )}
    >
      {icon ? (
        <div className="mb-6 rounded-full bg-muted p-4 text-muted-foreground/60">
          {icon}
        </div>
      ) : null}
      <h3 className="mb-3 font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mb-8 max-w-lg text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
