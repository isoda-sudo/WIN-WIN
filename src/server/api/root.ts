import { auditLogsRouter } from "~/server/api/routers/audit-logs";
import { categoriesRouter } from "~/server/api/routers/categories";
import { companyRouter } from "~/server/api/routers/company";
import { customersRouter } from "~/server/api/routers/customers";
import { dashboardRouter } from "~/server/api/routers/dashboard";
import { invitationsRouter } from "~/server/api/routers/invitations";
import { invoicesRouter } from "~/server/api/routers/invoices";
import { ordersRouter } from "~/server/api/routers/orders";
import { paymentsRouter } from "~/server/api/routers/payments";
import { projectsRouter } from "~/server/api/routers/projects";
import { receiptsRouter } from "~/server/api/routers/receipts";
import { usersRouter } from "~/server/api/routers/users";
import { vendorsRouter } from "~/server/api/routers/vendors";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  auditLogs: auditLogsRouter,
  categories: categoriesRouter,
  company: companyRouter,
  customers: customersRouter,
  dashboard: dashboardRouter,
  invitations: invitationsRouter,
  invoices: invoicesRouter,
  orders: ordersRouter,
  payments: paymentsRouter,
  projects: projectsRouter,
  receipts: receiptsRouter,
  users: usersRouter,
  vendors: vendorsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.projects.list();
 *       ^? Project[]
 */
export const createCaller = createCallerFactory(appRouter);
