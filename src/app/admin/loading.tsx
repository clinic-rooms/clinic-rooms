export default function Loading() {
  return (
    <div className="space-y-3">
      <div className="mx-auto h-7 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="h-1.5 animate-pulse rounded-full bg-muted" />
      <div className="h-[60vh] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
