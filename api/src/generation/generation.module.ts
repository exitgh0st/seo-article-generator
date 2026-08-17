import { Module } from '@nestjs/common';
import { ToolsModule } from '../tools/tools.module';
import { ArticlesModule } from '../articles/articles.module';
import { ResearchModule } from '../research/research.module';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationWorker } from './generation.worker';
import { DeepSeekService } from './deepseek.service';
import { PromptsService } from './prompts.service';
import { HumanizeService } from './humanize.service';
import { InternalLinksService } from './internal-links.service';
import { TopicSuggesterService } from './topic-suggester.service';
import { TopicPreflightService } from './topic-preflight.service';
import { ResearchStage } from './stages/research.stage';
import { AngleStage } from './stages/angle.stage';
import { DraftStage } from './stages/draft.stage';
import { HumanizeStage } from './stages/humanize.stage';
import { AuditStage } from './stages/audit.stage';
import { ReviewStage } from './stages/review.stage';

/**
 * Article generation: six stages, a worker to drive them, and the two clients
 * they need.
 *
 * The stages depend on the same services the rest of the app uses — the same
 * `ArticlesService.save()` with its validation, scoring and grounding, the same
 * `ResearchService.save()` — so a generated article and an imported one cannot
 * diverge. There is no second write path.
 */
@Module({
  imports: [ToolsModule, ArticlesModule, ResearchModule],
  controllers: [GenerationController],
  providers: [
    GenerationService,
    GenerationWorker,
    DeepSeekService,
    PromptsService,
    HumanizeService,
    InternalLinksService,
    TopicSuggesterService,
    TopicPreflightService,
    ResearchStage,
    AngleStage,
    DraftStage,
    HumanizeStage,
    AuditStage,
    ReviewStage,
  ],
  exports: [GenerationService, DeepSeekService, PromptsService, HumanizeService],
})
export class GenerationModule {}
