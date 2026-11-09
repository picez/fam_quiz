// Перевірка шляху «Словесної драбини» словником для редактора (26c). Лише попередження: у грі слова шляху приймаються завжди.
import { ladderKey, wordLadderCheckSchema } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { NounDictionary } from './wordladder/nouns';

export interface WordLadderDeps {
  nouns: NounDictionary;
  currentUser: (request: FastifyRequest) => Promise<{ id: string } | null>;
}

const INVALID = { error: 'invalid_payload' };

export async function registerWordLadderRoutes(app: FastifyInstance, deps: WordLadderDeps): Promise<void> {
  const { nouns, currentUser } = deps;
  const limit = {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `wordladder:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  };

  // Вхід не обов'язковий: словник не таємниця, а частоту стереже обмеження.
  app.post('/api/wordladder/check', limit, async (request, reply) => {
    const body = wordLadderCheckSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const unknown = body.data.words.filter((word) => {
      const key = ladderKey(word);
      return key === null || !nouns.isNoun(key);
    });
    return { unknown };
  });
}
