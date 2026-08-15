import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { GenerationService } from './generation.service';

/**
 * Drives the pipeline.
 *
 * A self-rescheduling `setTimeout` rather than `setInterval`, so a tick cannot
 * start while the previous one is still running — a research stage takes tens of
 * seconds and overlapping ticks would run the same stage twice.
 *
 * Deliberately not a job queue. The work is a handful of articles a day by one
 * operator, the database already holds the state the timeline reads, and adding
 * Redis to schedule six rows would be more moving parts than the feature has.
 */
const IDLE_MS = 3_000;
const BUSY_MS = 250;

@Injectable()
export class GenerationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GenerationWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly generation: GenerationService) {}

  async onApplicationBootstrap() {
    // A stage left `running` means the process died mid-stage. Reset it before
    // taking new work, or it sits there forever looking active.
    await this.generation.recoverStuckStages().catch((error) => {
      this.logger.error(`Recovery failed: ${(error as Error).message}`);
    });

    this.schedule(IDLE_MS);
    this.logger.log('Generation worker started');
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delay);
    // Never hold the process open. A pending tick must not delay shutdown.
    this.timer.unref();
  }

  private async tick() {
    let didWork = false;
    try {
      didWork = await this.generation.advanceOne();
    } catch (error) {
      // advanceOne records stage failures itself; reaching here means something
      // broke around the loop rather than inside a stage. Log and keep going —
      // stopping the worker would strand every other run.
      this.logger.error(`Worker tick failed: ${(error as Error).message}`);
    }
    this.schedule(didWork ? BUSY_MS : IDLE_MS);
  }
}
