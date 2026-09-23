'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 提交之前先在本地查一遍，不合格就不发请求，把问题说清楚。
// 后端那边还会独立再查一次，不指望浏览器。
function findProblem(email: string, password: string, confirmPassword: string): string {
  if (!EMAIL_PATTERN.test(email.trim())) {
    return '这个邮箱看着不像邮箱，检查一下再填。';
  }
  if (password.length < 8) {
    return '密码太短了，至少要 8 位。';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return '密码太简单了，字母和数字都要有。';
  }
  if (password !== confirmPassword) {
    return '两次输入的密码不一样。';
  }
  return '';
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const problem = findProblem(email, password, confirmPassword);
    if (problem) {
      setError(problem);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/app/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirmPassword }),
      });

      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? '注册没成功，再试一次。');
        return;
      }

      router.push('/workspace');
    } catch {
      setError('网络出问题了，再试一次。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>注册</h1>
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            邮箱
            <input
              type="text"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            密码
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            再输一遍密码
            <input
              type="password"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
        </p>

        {error ? <p role="alert">{error}</p> : null}

        <button type="submit" disabled={submitting}>
          {submitting ? '提交中' : '注册'}
        </button>
      </form>

      <p>
        <Link href="/login">返回登录页</Link>
      </p>
    </main>
  );
}
