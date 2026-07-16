import { ComingSoon } from "@/components/coming-soon";

// Placeholder so the topbar's "My Tasks" pill resolves. The full AI-ranked task
// screen lands in Phase 4 of the design handoff.
export default function TasksPage() {
  return (
    <div className="flex flex-1 flex-col p-[26px]">
      <ComingSoon
        title="My Tasks"
        description="Your AI-ranked task list with per-task “Why this rank?” breakdowns is on its way."
        milestone={4}
      />
    </div>
  );
}
