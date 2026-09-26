'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await fetch('/api/app/auth/logout', { method: 'POST' });
    } finally {
      // 会话在服务端已经作废了，这里只负责把人送回登录页
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <button type="button" onClick={handleLogout} disabled={busy}>
      {busy ? '退出中' : '退出登录'}
    </button>
  );
}
