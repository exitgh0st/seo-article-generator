import { z } from 'zod';
import { DeepSeekService } from './deepseek.service';
import { OutputValidationError, ProviderError, RefusalError } from './errors';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';

/**
 * The property under test is that one unusable reply is not a dead run.
 *
 * Nothing above this layer retries. `GenerationService.advanceOne` records a
 * stage failure and stops the run until a person presses a button, so a reply the
 * model would have got right on the next attempt used to cost an operator a round
 * trip through the UI — and on the draft stage it cost three, because the same
 * frontmatter call failed the same way each time.
 *
 * The tests therefore assert on the number of round trips and on what the second
 * one is told, not only on the value that comes back. A correction turn that does
 * not name the actual complaint is a retry with extra steps.
 */

const Schema = z.object({ title: z.string(), tags: z.array(z.string()) });

type Create = jest.Mock;

function build(): { service: DeepSeekService; create: Create } {
  const config = {
    getOrThrow: () => 'sk-test',
    get: (key: string) =>
      key === 'DEEPSEEK_MODEL' ? 'deepseek-chat' : 'https://api.deepseek.com',
  } as unknown as ConfigService<Env, true>;

  const service = new DeepSeekService(config);
  const create: Create = jest.fn();

  (service as unknown as { client: unknown }).client = {
    chat: { completions: { create } },
  };

  return { service, create };
}

const reply = (
  content: string,
  over: { finishReason?: string; inTokens?: number; outTokens?: number } = {},
) => ({
  choices: [
    { message: { content }, finish_reason: over.finishReason ?? 'stop' },
  ],
  usage: {
    prompt_tokens: over.inTokens ?? 100,
    completion_tokens: over.outTokens ?? 20,
  },
});

const good = JSON.stringify({ title: 'A title', tags: ['one'] });

/** The messages array the nth call was made with. */
const messagesOf = (create: Create, call: number) =>
  create.mock.calls[call][0].messages as { role: string; content: string }[];

describe('DeepSeekService.json', () => {
  it('returns the value on a first-time-valid reply, in one round trip', async () => {
    const { service, create } = build();
    create.mockResolvedValueOnce(reply(good));

    const result = await service.json(Schema, 'system', 'user');

    expect(result.value).toEqual({ title: 'A title', tags: ['one'] });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('corrects a reply that is missing a required key', async () => {
    const { service, create } = build();
    create
      .mockResolvedValueOnce(reply(JSON.stringify({ title: 'A title' })))
      .mockResolvedValueOnce(reply(good));

    const result = await service.json(Schema, 'system', 'user');

    expect(result.value).toEqual({ title: 'A title', tags: ['one'] });
    expect(create).toHaveBeenCalledTimes(2);

    // The correction carries the original exchange, the rejected answer, and the
    // specific complaint — enough for the model to fix it rather than reroll.
    const second = messagesOf(create, 1);
    expect(second.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(second[2].content).toContain('A title');
    expect(second[3].content).toContain('tags');
  });

  it('corrects a reply that is not JSON at all', async () => {
    const { service, create } = build();
    create
      .mockResolvedValueOnce(reply('Certainly! Here is the frontmatter:'))
      .mockResolvedValueOnce(reply(good));

    await expect(service.json(Schema, 'system', 'user')).resolves.toMatchObject({
      value: { title: 'A title' },
    });
    expect(messagesOf(create, 1)[3].content).toContain('not valid JSON');
  });

  it('sums usage across both round trips', async () => {
    const { service, create } = build();
    create
      .mockResolvedValueOnce(reply('{}', { inTokens: 100, outTokens: 5 }))
      .mockResolvedValueOnce(reply(good, { inTokens: 130, outTokens: 25 }));

    const result = await service.json(Schema, 'system', 'user');

    expect(result.usage).toEqual({ inputTokens: 230, outputTokens: 30 });
  });

  it('gives up after one correction, reporting the second failure', async () => {
    const { service, create } = build();
    create
      .mockResolvedValueOnce(reply('{}'))
      .mockResolvedValueOnce(reply(JSON.stringify({ title: 7 })));

    await expect(service.json(Schema, 'system', 'user')).rejects.toThrow(
      OutputValidationError,
    );
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('calls an empty reply a provider problem, not a shape problem', async () => {
    const { service, create } = build();
    create.mockResolvedValueOnce(reply('')).mockResolvedValueOnce(reply('  '));

    // The remedies differ and both are shown to the operator: "press Retry"
    // against "the model returned something we could not read".
    await expect(service.json(Schema, 'system', 'user')).rejects.toThrow(
      ProviderError,
    );
  });

  it('keeps a valid object that stopped exactly at the token limit', async () => {
    const { service, create } = build();
    create.mockResolvedValueOnce(reply(good, { finishReason: 'length' }));

    // The reply is complete by inspection. Rejecting it on `finish_reason` alone
    // would throw away a usable answer and spend a correction turn.
    await expect(service.json(Schema, 'system', 'user')).resolves.toMatchObject({
      value: { title: 'A title' },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('tells the model it ran out of room when a cut-off reply is unusable', async () => {
    const { service, create } = build();
    create
      .mockResolvedValueOnce(reply('{"title": "A ti', { finishReason: 'length' }))
      .mockResolvedValueOnce(reply(good));

    await expect(service.json(Schema, 'system', 'user')).resolves.toBeDefined();
    expect(messagesOf(create, 1)[3].content).toContain('cut off');
  });

  it('does not argue with a refusal', async () => {
    const { service, create } = build();
    create.mockResolvedValueOnce(reply('', { finishReason: 'content_filter' }));

    await expect(service.json(Schema, 'system', 'user')).rejects.toThrow(
      RefusalError,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('surfaces a transport failure as a provider error', async () => {
    const { service, create } = build();
    create.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(service.json(Schema, 'system', 'user')).rejects.toThrow(
      ProviderError,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('DeepSeekService.text', () => {
  it('returns prose unchanged', async () => {
    const { service, create } = build();
    create.mockResolvedValueOnce(reply('## A heading\n\nSome prose.'));

    const result = await service.text('system', 'user');

    expect(result.value).toBe('## A heading\n\nSome prose.');
  });

  it('rejects a body cut off at the output limit', async () => {
    const { service, create } = build();
    create.mockResolvedValueOnce(reply('## Half an ar', { finishReason: 'length' }));

    // No correction turn here: half an article is not something a follow-up
    // message repairs, and the stage would rather fail than save a truncated body.
    await expect(service.text('system', 'user')).rejects.toThrow(
      OutputValidationError,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty body', async () => {
    const { service, create } = build();
    create.mockResolvedValueOnce(reply(''));

    await expect(service.text('system', 'user')).rejects.toThrow(
      OutputValidationError,
    );
  });
});
