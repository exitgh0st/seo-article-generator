import { Module } from '@nestjs/common';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';
import { ArticlesModule } from '../articles/articles.module';
import { ResearchModule } from '../research/research.module';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [ArticlesModule, ResearchModule, ToolsModule],
  controllers: [PublishController],
  providers: [PublishService],
  exports: [PublishService],
})
export class PublishModule {}
