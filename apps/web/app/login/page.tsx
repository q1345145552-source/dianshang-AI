import Link from 'next/link';
import { LoginForm } from './login-form';

const AFTER_LOGIN = '/workspace';

// 服务端再挡一道：只认本站路径，站外的一律换成工作台
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return AFTER_LOGIN;
  }
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main>
      <h1>登录</h1>
      <LoginForm next={safeNext(params.next)} />
      <p>
        还没有账号？<Link href="/register">去注册</Link>
      </p>
    </main>
  );
}
