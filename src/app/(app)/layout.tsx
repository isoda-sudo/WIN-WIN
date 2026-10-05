import { AppHeader } from "~/components/shell/app-header";
import { SidebarNav } from "~/components/shell/sidebar-nav";
import { requireSession } from "~/server/auth/require-session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();

  return (
    <div className="flex h-dvh">
      <aside className="flex w-48 shrink-0 flex-col border-r bg-muted/30">
        <div className="flex h-14 shrink-0 items-center border-b px-4 font-bold text-lg">
          construct-pro
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav role={user.role} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader email={user.email} role={user.role} />
        <main className="flex-1 overflow-y-auto bg-background px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
