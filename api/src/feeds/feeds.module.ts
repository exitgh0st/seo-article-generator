import { Module } from '@nestjs/common';
import { FeedsController } from './feeds.controller';
import { FeedsService } from './feeds.service';
import { SiteConfigService } from './site-config.service';

@Module({
  controllers: [FeedsController],
  providers: [FeedsService, SiteConfigService],
  exports: [SiteConfigService],
})
export class FeedsModule {}
