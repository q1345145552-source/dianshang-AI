import { Module } from '@nestjs/common';
import { InfraModule } from './infra/infra.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [InfraModule, HealthModule],
})
export class AppModule {}
