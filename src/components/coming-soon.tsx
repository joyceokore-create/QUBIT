interface ComingSoonProps {
  title: string;
  description: string;
  milestone: number;
}

export function ComingSoon({ title, description, milestone }: ComingSoonProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[10px] border border-ink-4 bg-card p-16 text-center">
      <h2 className="font-heading text-lg text-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-ink-2">{description}</p>
      <p className="text-xs text-ink-3">
        Lands in Milestone {milestone} — see docs/10-build-plan.md.
      </p>
    </div>
  );
}
