import { cookies } from 'next/headers';
import Link from 'next/link';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

type Entry = {
  id: string;
  type: string;
  reason: string;
  businessRef: string | null;
  deltaUnits: number;
  createdAt: string;
};

export default async function WalletPage() {
  const cookieStore = await cookies();

  const response = await fetch(`${API_INTERNAL_URL}/api/app/wallet/ledger`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  // 没登录的人一般已经被中间件送去登录页了，这里兜一下
  if (!response.ok) {
    return (
      <main>
        <h1>余额明细</h1>
        <p>还没有登录。</p>
      </main>
    );
  }

  const data = (await response.json()) as { balanceUnits: number; entries: Entry[] };

  return (
    <main>
      <h1>余额明细</h1>
      <p>当前余额：{data.balanceUnits}</p>

      {data.entries.length === 0 ? (
        <p>还没有任何记录。</p>
      ) : (
        <ul>
          {data.entries.map((entry) => (
            <li key={entry.id}>
              {new Date(entry.createdAt).toLocaleString('zh-CN')}
              {'　'}
              {entry.deltaUnits > 0 ? `+${entry.deltaUnits}` : entry.deltaUnits}
              {'　'}
              {entry.reason}
            </li>
          ))}
        </ul>
      )}

      <p>
        <Link href="/workspace">返回工作台</Link>
      </p>
    </main>
  );
}
