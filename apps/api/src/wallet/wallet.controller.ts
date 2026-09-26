import { Controller, Get, Headers, HttpException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { readCookie } from '../auth/cookie';
import { SESSION_COOKIE } from '../auth/session';
import { WalletService } from './wallet.service';

@Controller('api/app/wallet')
export class WalletController {
  constructor(
    private readonly auth: AuthService,
    private readonly wallet: WalletService,
  ) {}

  @Get()
  async current(@Headers('cookie') cookieHeader: string | undefined) {
    const user = await this.requireUser(cookieHeader);
    return { balanceUnits: await this.wallet.balanceUnits(user.id) };
  }

  @Get('ledger')
  async ledger(@Headers('cookie') cookieHeader: string | undefined) {
    const user = await this.requireUser(cookieHeader);
    const rows = await this.wallet.ledger(user.id);

    return {
      balanceUnits: await this.wallet.balanceUnits(user.id),
      entries: rows.map((row) => ({
        id: row.id,
        type: row.type,
        reason: row.reason,
        businessRef: row.business_ref,
        deltaUnits: Number(row.delta_units),
        createdAt: row.created_at,
      })),
    };
  }

  // 谁的 cookie 就只能看谁的钱包
  private async requireUser(cookieHeader: string | undefined) {
    const token = readCookie(cookieHeader, SESSION_COOKIE);
    const user = await this.auth.currentUser(token);

    if (!user) {
      throw new HttpException({ code: 'UNAUTHENTICATED', message: '还没有登录。' }, 401);
    }
    return user;
  }
}
