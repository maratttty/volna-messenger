import type { ReactNode } from 'react';
import { APP_NAME } from '../config';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-bg">
            {APP_NAME.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-semibold text-text">{title}</h1>
        </div>
        <div className="rounded-2xl border border-border bg-surface/40 p-6">{children}</div>
      </div>
    </div>
  );
}
