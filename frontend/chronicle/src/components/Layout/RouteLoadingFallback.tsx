export function RouteLoadingFallback() {
  return (
    <div
      className="flex min-h-[calc(100vh-8rem)] items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden="true"
        />
        <span>Loading page...</span>
      </div>
    </div>
  );
}
