export function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-[18px]">
      <div className="mb-[3px] px-2 text-[9px] font-bold tracking-[1.2px] text-ink-4 uppercase">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
