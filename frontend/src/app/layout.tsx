import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AppShell } from './app-shell';

export const metadata: Metadata = {
  title: 'AITOP Monitor — AI Service Monitoring',
  description: 'OpenTelemetry-based AI Service Performance Monitoring Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-theme="dark" className="h-full">
      <body className="h-full overflow-hidden">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
