import Link from "next/link";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/people", label: "People" },
  { href: "/historical", label: "Historical" },
  { href: "/girls", label: "Girls" },
  { href: "/groups", label: "Groups" },
] as const;

export function TopNav({ active }: { active: string }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-8 border-b border-border bg-panel px-5">
      <Link href="/" className="text-[15px] font-semibold tracking-tight text-text">
        Message Vault
      </Link>
      <nav className="flex items-center gap-5">
        {LINKS.map((link) => {
          const isActive = active === link.href || active === link.label.toLowerCase();
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
                <span className="absolute inset-x-0 -bottom-[13px] h-0.5 bg-accent" />
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
