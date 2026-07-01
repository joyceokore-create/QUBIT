import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] text-ink-3">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-ink-4">/</span>}
          {item.href ? (
            <Link href={item.href} className="font-medium text-brand hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-ink-2">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
