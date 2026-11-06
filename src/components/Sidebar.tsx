'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';

type IconName = 'grid' | 'box' | 'inbox' | 'swap' | 'clipboard' | 'history' | 'cart' | 'receipt' | 'pin';

const ICONS: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></>,
  inbox: <><path d="M4 13h4l2 3h4l2-3h4" /><path d="M5 4h14l2 9v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2-9Z" /></>,
  swap: <><path d="M7 4v13" /><path d="m3 8 4-4 4 4" /><path d="M17 20V7" /><path d="m13 16 4 4 4-4" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9 11h6" /><path d="M9 16h4" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" /></>,
  cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z" /><path d="M9 8h6" /><path d="M9 12h6" /></>,
  pin: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>,
};

function NavLink({ href, label, icon, exact }: { href: string; label: string; icon: IconName; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={active ? 'active' : undefined} title={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[icon]}
      </svg>
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({ user }: { user: { name: string; role: string } }) {
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">SR</div>
        <div>
          <div className="brand-name">Stockroom</div>
          <span className="brand-sub">Inventory</span>
        </div>
      </div>

      <nav className="nav">
        <NavLink href="/" label="Overview" icon="grid" exact />
        <div className="nav-label">Stock</div>
        <NavLink href="/items" label="Items" icon="box" />
        <NavLink href="/receive" label="Receive" icon="inbox" />
        <NavLink href="/transfer" label="Transfer" icon="swap" />
        <NavLink href="/count" label="Cycle count" icon="clipboard" />
        <NavLink href="/movements" label="Ledger" icon="history" />
        <div className="nav-label">Sell</div>
        <NavLink href="/pos" label="Counter" icon="cart" />
        <NavLink href="/sales" label="Sales" icon="receipt" />
        <div className="nav-label">Setup</div>
        <NavLink href="/settings" label="Locations" icon="pin" />
      </nav>

      <div className="sidebar-foot">
        <div className="who">
          <div className="who-avatar">{initials || '?'}</div>
          <div>
            <div className="who-name">{user.name}</div>
            <div className="who-role">{user.role}</div>
          </div>
        </div>
        <form action={logout}>
          <button type="submit" className="signout">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
