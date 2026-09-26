import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  // 钱包那边要借着它认人，所以导出去
  exports: [AuthService],
})
export class AuthModule {}
