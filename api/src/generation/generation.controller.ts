import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GenerationService } from './generation.service';
import { TopicSuggesterService } from './topic-suggester.service';
import { TopicPreflightService } from './topic-preflight.service';
import {
  ChooseAngleDto,
  PreflightTopicDto,
  StartRunDto,
  SuggestTopicsDto,
} from './dto/generation.dto';

/**
 * Everything is behind the global JwtAuthGuard.
 *
 * There is no endpoint that runs a stage synchronously. Starting a run creates
 * rows and returns immediately; the worker picks it up. That is what keeps the
 * UI responsive while a research stage spends forty seconds fetching pages, and
 * it is why the client polls rather than holding a request open.
 */
@ApiTags('Generation')
@ApiBearerAuth()
@Controller('generation')
export class GenerationController {
  constructor(
    private readonly generation: GenerationService,
    private readonly suggester: TopicSuggesterService,
    private readonly preflightService: TopicPreflightService,
  ) {}

  // One press costs four searches and one model call — real money, but roughly a
  // tenth of a run, so the ceiling sits above the run limit rather than at it.
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('suggestions')
  // Nothing is created. 201 would tell the client a resource exists at a URL it
  // could fetch again, and there is none.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Propose topics not already covered. Creates nothing.',
  })
  suggest(@Body() dto: SuggestTopicsDto) {
    return this.suggester.suggest(dto);
  }

  // Four searches and a query, no model call — roughly a tenth of a suggestion and
  // a hundredth of a run. The ceiling is generous because pressing it is the
  // behaviour we want: it is cheaper than the run it prevents.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('preflight')
  // Creates nothing, same as `suggestions`.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Judge whether a topic can become an article. Creates nothing.',
  })
  preflight(@Body() dto: PreflightTopicDto) {
    return this.preflightService.check(dto);
  }

  @Get('runs')
  @ApiOperation({ summary: 'Recent runs, newest first.' })
  list(@Query('limit') limit?: string) {
    return this.generation.listRuns(Math.min(Number(limit) || 20, 50));
  }

  // Each run costs real money at the provider, so the ceiling is low enough that
  // a stuck retry loop in a browser cannot spend the month's budget.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('runs')
  @ApiOperation({ summary: 'Start a generation run.' })
  start(@Body() dto: StartRunDto) {
    return this.generation.createRun(dto);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'One run with its stages. Polled by the UI.' })
  get(@Param('id') id: string) {
    return this.generation.getRun(id);
  }

  @Post('runs/:id/angle')
  @ApiOperation({ summary: 'Choose an angle, releasing the pause.' })
  chooseAngle(@Param('id') id: string, @Body() dto: ChooseAngleDto) {
    return this.generation.chooseAngle(id, dto.angleIndex);
  }

  @Post('runs/:id/stages/:stage/retry')
  @ApiOperation({
    summary: 'Re-queue a stage and everything after it.',
  })
  retry(@Param('id') id: string, @Param('stage') stage: string) {
    return this.generation.retryFrom(id, stage);
  }
}
