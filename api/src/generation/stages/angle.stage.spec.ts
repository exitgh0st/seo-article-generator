import { AngleStage } from './angle.stage';
import type { ResearchService } from '../../research/research.service';
import type { DeepSeekService } from '../deepseek.service';
import type { PromptsService } from '../prompts.service';
import type { GenerationRun } from '@prisma/client';
import type { StageContext } from '../stage.types';

/**
 * The angle stage is the only one that can park a run, so the test that matters is
 * that it stops parking by default. A run reaching review unattended is the whole
 * point of the pipeline, and a pause halfway is indistinguishable from a hang to
 * the person who walked away from it.
 *
 * The manual mode still has to work: `autoAngle` off is what a flagship piece uses,
 * where which story to tell is the question being asked.
 */

const angles = [
  {
    title: 'What to patch, and by when',
    summary: 'For the admin who has to close this before Monday morning arrives.',
    primaryKeyword: 'fortiweb path traversal',
  },
  {
    title: 'How the exploit chain works',
    summary: 'For the responder who needs to know what to hunt for in the logs.',
    primaryKeyword: 'fortiweb exploit',
  },
];

function stageWith(run: Partial<GenerationRun>) {
  const research = {
    findBySlug: jest.fn().mockResolvedValue({ markdown: '## Summary\nSomething.' }),
  } as unknown as ResearchService;

  const deepseek = {
    json: jest.fn().mockResolvedValue({
      value: { angles },
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
  } as unknown as DeepSeekService;

  const prompts = { preamble: () => 'preamble' } as unknown as PromptsService;

  const ctx = {
    run: { briefSlug: '2026-08-18-fortiweb', topic: 'FortiWeb', ...run } as GenerationRun,
    outputOf: () => undefined,
  } satisfies StageContext;

  return { stage: new AngleStage(research, deepseek, prompts), ctx };
}

describe('AngleStage', () => {
  describe('with autoAngle on', () => {
    it('does not park the run', async () => {
      const { stage, ctx } = stageWith({ autoAngle: true });
      const result = await stage.run(ctx);
      expect(result.awaitingInput).toBeFalsy();
    });

    it('takes the first angle, which the prompt orders strongest first', async () => {
      const { stage, ctx } = stageWith({ autoAngle: true });
      const result = await stage.run(ctx);
      expect(result.runPatch?.chosenAngle).toEqual(angles[0]);
    });

    it('keeps the alternatives so the timeline can show what it passed over', async () => {
      const { stage, ctx } = stageWith({ autoAngle: true });
      const result = await stage.run(ctx);
      expect(result.runPatch?.angleOptions).toEqual(angles);
      expect(result.output).toMatchObject({ chosenIndex: 0, auto: true });
    });
  });

  describe('with autoAngle off', () => {
    it('parks the run for a person', async () => {
      const { stage, ctx } = stageWith({ autoAngle: false });
      const result = await stage.run(ctx);
      expect(result.awaitingInput).toBe(true);
    });

    it('chooses nothing, leaving chooseAngle to do it', async () => {
      const { stage, ctx } = stageWith({ autoAngle: false });
      const result = await stage.run(ctx);
      expect(result.runPatch?.chosenAngle).toBeUndefined();
      expect(result.runPatch?.angleOptions).toEqual(angles);
    });
  });

  it('fails with a remedy when the research stage left no brief', async () => {
    const { stage, ctx } = stageWith({ autoAngle: true, briefSlug: null });
    await expect(stage.run(ctx)).rejects.toThrow(/No brief on the run/);
  });
});
