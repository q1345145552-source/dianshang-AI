import { NextResponse, type NextRequest } from 'next/server';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'session';
const AFTER_LOGIN = '/workspace';

// 这几个页面得先登录才能看
const PROTECTED_PATHS = ['/workspace', '/wallet'];

// 登录后要回的那一页，只认本站地址。
// 别人塞个站外网址进来一律换成工作台，不然就是拿我们这里当跳板。
function safeNext(raw: string | null): string {
  if (!raw) {
    return AFTER_LOGIN;
  }
  // 必须以单个斜杠开头，挡掉 //evil.com 这种协议相对地址
  if (!raw.startsWith('/') || raw.startsWith('//')) {
    return AFTER_LOGIN;
  }
  try {
    // 再解析一遍确认落点还在本站，顺带挡掉 /\evil.com 这类写法
    const parsed = new URL(raw, 'http://internal');
    if (parsed.origin !== 'http://internal') {
      return AFTER_LOGIN;
    }
    return parsed.pathname + parsed.search;
  } catch {
    return AFTER_LOGIN;
  }
}

// 光看 cookie 在不在不够，得问一下后端这个会话是不是真的有效
async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(`${API_INTERNAL_URL}/api/app/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const loggedIn = await hasValidSession(request);

  // 已经登录的人打开登录页或者注册页，直接回工作台，不用再登一次
  if (loggedIn && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL(AFTER_LOGIN, request.url));
  }

  // 没登录的人打开要登录才能看的页面，送去登录页，并且记住他本来想去哪
  if (!loggedIn && PROTECTED_PATHS.includes(pathname)) {
    const target = new URL('/login', request.url);
    target.searchParams.set('next', pathname);
    const response = NextResponse.redirect(target);
    // cookie 还在但会话已经作废的情况，顺手清掉，免得来回打转
    if (request.cookies.has(SESSION_COOKIE)) {
      response.cookies.delete(SESSION_COOKIE);
    }
    return response;
  }

  // 登录页上的 next 参数如果是站外地址，换成工作台
  if (pathname === '/login') {
    const raw = request.nextUrl.searchParams.get('next');
    if (raw !== null && safeNext(raw) !== raw) {
      const target = new URL('/login', request.url);
      target.searchParams.set('next', AFTER_LOGIN);
      return NextResponse.redirect(target);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/login', '/register', '/workspace', '/wallet'],
};
