import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ResearchService } from '../../research/research.service';
import { DeepSeekService } from '../deepseek.service';
import { PromptsService } from '../prompts.service';
import { StageError } from '../errors';
import type { Stage, StageContext, StageResult } from '../stage.types';

/**
 * Work out which story to tell, and — unless asked not to — get on with it.
 *
 * This is the one decision a non-technical person can make well and the pipeline
 * cannot: the same brief supports "what do I patch before Monday", "who is behind
 * this" and "how the exploit actually works", and those are three different
 * articles for three different readers.
 *
 * It is still not worth stopping for by default. A run that parks here is a run
 * that does not finish while nobody is looking at it, and the operator comes back
 * to a decision they would have made the obvious way — the prompt already asks for
 * the options ordered strongest sourcing first, so the first one is the answer
 * almost every time. So `autoAngle` takes it and continues, and the options are
 * recorded either way so the timeline can show what was passed over.
 *
 * With `autoAngle` off the stage ends `awaiting_input` and the worker will not
 * touch the run again until someone presses a button. That is the right mode for
 * a flagship piece, where which story to tell is the whole question.
 */

const AngleSchema = z.object({
  angles: z
    .array(
      z.object({
        /** Plain language. This is a button label, not a headline. */
        title: z.string().min(6).max(90),
        /** One sentence on who this serves and what they get. */
        summary: z.string().min(20).max(280),
        primaryKeyword: z.string().min(3).max(60),
      }),
    )
    .min(2)
    .max(3),
});

@Injectable()
export class AngleStage implements Stage {
  readonly name = 'angle' as const;

  constructor(
    private readonly research: ResearchService,
    private readonly deepseek: DeepSeekService,
    private readonly prompts: PromptsService,
  ) {}

  async run(ctx: StageContext): Promise<StageResult> {
    const briefSlug = ctx.run.briefSlug;
    if (!briefSlug) {
      throw new StageError(
        'No brief on the run.',
        'validation',
        'The research step did not finish. Retry from there.',
      );
    }

    const brief = await this.research.findBySlug(briefSlug);

    const { value, usage } = await this.deepseek.json(
      AngleSchema,
      [
        this.prompts.preamble(),
        '',
        'Propose two or three angles this brief could support. Each is a distinct',
        'article for a distinct reader — not three phrasings of the same piece.',
        '',
        'Return JSON: { "angles": [{ "title", "summary", "primaryKeyword" }] }.',
        '',
        'The title is a button label read by a non-technical editor. Write plain',
        'language — "What to patch, and by when" rather than "Remediation posture',
        'and KEV compliance". No jargon, no CVE identifiers in the title.',
        '',
        'The summary is one sentence naming who the angle serves and what they get.',
        '',
        'primaryKeyword is the search query the article targets, and it has one',
        'hard constraint: **it must be a noun phrase naming a thing** — the',
        'product, or the product and its flaw. Two or three words, lowercase.',
        '',
        'Good: "progress loadmaster", "loadmaster vulnerability",',
        '"n-able n-central", "teamcity rce".',
        'Bad: "loadmaster patch deadline", "what to do about loadmaster",',
        '"cve-2026-8037 patch now".',
        '',
        'The test is whether the phrase can sit inside an ordinary sentence four',
        'to eight times without sounding stapled on. An action phrase or a',
        'question cannot, and a keyword nobody can use is a keyword used zero',
        'times. Never put a CVE identifier in it.',
        '',
        'Order them strongest sourcing first.',
      ].join('\n'),
      `Topic: ${ctx.run.topic}\n\n${brief.markdown}`,
      { maxTokens: 1_500 },
    );

    const angles = value.angles;

    if (!ctx.run.autoAngle) {
      return {
        output: { angles },
        usage,
        awaitingInput: true,
        runPatch: { angleOptions: angles },
      };
    }

    // `chosen` is recorded on the output as well as the run, so the timeline row
    // can name it without a second query, and `angles` stays on both so the
    // alternatives remain visible after the fact.
    const chosen = angles[0];

    return {
      output: { angles, chosen, chosenIndex: 0, auto: true },
      usage,
      runPatch: { angleOptions: angles, chosenAngle: chosen },
    };
  }
}
