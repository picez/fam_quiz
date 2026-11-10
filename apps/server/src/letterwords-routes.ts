// Перевірка набору «Слів з літер» словником для редактора (27d). Лише попередження ведучому: у грі набір ведучого діє завжди.
import { letterCheckSchema, letterSet } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { dealOf, letterIndexOf } from './letterwords/deal';
import type { NounDictionary } from './wordladder/nouns';

export interface LetterWordsDeps {
  nouns: NounDictionary;
  currentUser: (request: FastifyRequest) => Promise<{ id: string } | null>;
}

const INVALID = { error: 'invalid_payload' };

export async function registerLetterWordsRoutes(app: FastifyInstance, deps: LetterWordsDeps): Promise<void> {
  const { nouns, currentUser } = deps;
  const limit = {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `letterwords:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  };

  // Вхід не обов'язковий, як у драбини: відповідь — лише кількість і два слова, а частоту стереже обмеження.
  app.post('/api/letterwords/check', limit, async (request, reply) => {
    const body = letterCheckSchema.safeParse(request.body);
    const letters = body.success ? letterSet(body.data.letters) : null;
    if (letters === null) return reply.code(400).send(INVALID);
    // Індекс спільний з кімнатами (той самий словник) і будується при першій перевірці.
    const { possible, best } = dealOf(letterIndexOf(nouns), letters);
    return { possible, best };
  });
}
