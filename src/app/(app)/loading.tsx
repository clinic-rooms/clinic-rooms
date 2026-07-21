export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-52 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
