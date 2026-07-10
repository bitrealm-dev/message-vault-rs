import { tagSlug } from "@/lib/db";
import Link from "next/link";

const FIXED_BEFORE = [
  { href: "/", label: "Home" },
  { href: "/all", label: "All" },
  { href: "/current", label: "Current" },
  { href: "/historical", label: "Historical" },
] as const;

const FIXED_AFTER = [{ href: "/groups", label: "Groups" }] as const;

export function TopNav({
  active,
  tags = [],
}: {
  active: string;
  tags?: string[];
}) {
  const links = [
    ...FIXED_BEFORE,
    ...tags.map((name) => ({
      href: `/tag/${tagSlug(name)}`,
      label: name,
    })),
    ...FIXED_AFTER,
  ];

  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-panel px-5 py-2">
      <Link href="/" className="text-[15px] font-semibold tracking-tight text-text">
        Message Vault
      </Link>
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {links.map((link) => {
          const isActive = active === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative pb-0.5 text-[13px] transition-colors ${
                isActive ? "text-text" : "text-muted hover:text-text"
              }`}
            >
              {link.label}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-2 h-0.5 bg-accent" />
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
