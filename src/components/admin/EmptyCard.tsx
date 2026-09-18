/** Dashed placeholder used wherever an admin list comes back empty. */
export function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
