import { Body, Controller, Get, Headers, HttpException, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { readCookie, clearSessionCookie, serializeSessionCookie } from './cookie';
import { SESSION_COOKIE } from './session';

@Controller('api/app')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/register')
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ id: string; email: string }> {
    const result = await this.auth.register((body ?? {}) as Record<string, unknown>);

    if (!result.ok) {
      throw new HttpException({ code: result.code, message: result.message }, result.status);
    }

    res.setHeader('Set-Cookie', serializeSessionCookie(result.token, result.maxAgeSeconds));

    return { id: result.user.id, email: result.user.email };
  }

  @Get('me')
  async me(@Headers('cookie') cookieHeader: string | undefined): Promise<{ id: string; email: string }> {
    const token = readCookie(cookieHeader, SESSION_COOKIE);
    const user = await this.auth.currentUser(token);

    if (!user) {
      throw new HttpException({ code: 'UNAUTHENTICATED', message: '还没有登录。' }, 401);
    }

    return { id: user.id, email: user.email };
  }

  @Post('auth/login')
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ id: string; email: string }> {
    const result = await this.auth.login((body ?? {}) as Record<string, unknown>);

    if (!result.ok) {
      throw new HttpException({ code: result.code, message: result.message }, result.status);
    }

    res.setHeader('Set-Cookie', serializeSessionCookie(result.token, result.maxAgeSeconds));

    return { id: result.user.id, email: result.user.email };
  }

  @Post('auth/logout')
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: boolean }> {
    await this.auth.logout(readCookie(cookieHeader, SESSION_COOKIE));
    res.setHeader('Set-Cookie', clearSessionCookie());

    return { ok: true };
  }
}
