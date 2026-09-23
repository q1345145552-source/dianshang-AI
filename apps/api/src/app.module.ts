import { Module } from '@nestjs/common';
import { InfraModule } from './infra/infra.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [InfraModule, HealthModule, AuthModule],
})
export class AppModule {}
