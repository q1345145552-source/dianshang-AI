import Link from 'next/link';

export default function LoginPage() {
  return (
    <main>
      <h1>登录</h1>
      <p>
        还没有账号？<Link href="/register">去注册</Link>
      </p>
    </main>
  );
}
