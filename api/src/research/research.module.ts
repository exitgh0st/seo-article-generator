import { Module } from '@nestjs/common';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { GroundingService } from './grounding.service';

@Module({
  controllers: [ResearchController],
  providers: [ResearchService, GroundingService],
  exports: [ResearchService, GroundingService],
})
export class ResearchModule {}
