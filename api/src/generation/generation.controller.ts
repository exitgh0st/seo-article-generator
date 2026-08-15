import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GenerationService } from './generation.service';
import { ChooseAngleDto, StartRunDto } from './dto/generation.dto';

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
  constructor(private readonly generation: GenerationService) {}

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
