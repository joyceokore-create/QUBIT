export function TrustBand() {
  return (
    <section id="security" className="mx-auto max-w-[1180px] px-6 py-16">
      <div
        className="rounded-2xl border border-[var(--w08)] px-8 py-12 text-center"
        style={{ background: "radial-gradient(800px 300px at 50% -100%, color-mix(in oklab, var(--pbrand) 12%, transparent), transparent 65%), var(--qcard)" }}
      >
        <div className="mb-3 text-[10.5px] font-bold uppercase tracking-[2.2px] text-[var(--pbrand)]">Built for the group</div>
        <h2 className="mb-8 text-[26px] font-bold tracking-[-.5px] text-[var(--qink)] md:text-[32px]">
          Built for Riverbank Group &amp; KCB Group
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {["Row-level security", "RBAC", "TOTP MFA", "Full audit trail"].map((chip) => (
            <span key={chip} className="rounded-full bg-[color-mix(in_oklab,var(--pbrand)_12%,transparent)] px-[14px] py-[7px] text-[12px] font-bold text-[var(--pbrand)]">
              {chip}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
