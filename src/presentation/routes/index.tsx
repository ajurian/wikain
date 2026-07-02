import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Wikain</h1>
      <p className="text-muted-foreground">
        Active-vocabulary trainer. The review loop lives at{" "}
        <code className="rounded bg-muted px-1 py-0.5">/review</code>.
      </p>
      <a
        href="/review"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Start reviewing
      </a>
    </main>
  );
}
