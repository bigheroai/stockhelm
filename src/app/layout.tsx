import type { Metadata } from 'next';
import './globals.css';
import { config } from '@/lib/config';

export const metadata: Metadata = {
  title: `${config.companyName} · Inventory`,
  description: 'Warehouse inventory and counter sales',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
