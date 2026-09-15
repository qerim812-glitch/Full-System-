import type { ReactNode } from "react";

/** Shared shell for the signed-out screens (login, register, reset). */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
            NewPop · Tirana
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
