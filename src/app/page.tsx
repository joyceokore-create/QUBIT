import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <h1 className="text-3xl text-foreground">QUBIT</h1>
      <p className="max-w-md text-ink-2">
        Enterprise Portfolio &amp; Programme Management. Scaffold complete — the
        application shell lands in later milestones.
      </p>
      <Button>Get started</Button>
    </div>
  );
}
