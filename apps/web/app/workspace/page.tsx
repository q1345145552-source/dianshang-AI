import { cookies } from 'next/headers';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

export default async function WorkspacePage() {
  const cookieStore = await cookies();

  const response = await fetch(`${API_INTERNAL_URL}/api/app/me`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  if (!response.ok) {
    return (
      <main>
        <h1>工作台</h1>
        <p>还没有登录，先去注册。</p>
      </main>
    );
  }

  const user = (await response.json()) as { email: string };

  return (
    <main>
      <h1>工作台</h1>
      <p>当前账号：{user.email}</p>
    </main>
  );
}
