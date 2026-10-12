import type { Quiz } from '@quiz/shared';

const base = { imageUrl: null, timeLimit: 20, points: 1000 };

/** Коротка вікторина, що показує всі типи запитань. */
export const demoQuiz: Quiz = {
  title: 'Україна: розминка',
  description: 'Шість запитань, по одному кожного типу.',
  settings: { speedBonus: true, leaderboard: 'each', shuffleOptions: false },
  questions: [
    {
      ...base,
      id: 'q1',
      type: 'single',
      text: 'Яка річка найдовша в межах України?',
      options: [
        { id: 'a', text: 'Дністер' },
        { id: 'b', text: 'Дніпро' },
        { id: 'c', text: 'Південний Буг' },
        { id: 'd', text: 'Десна' },
      ],
      correctId: 'b',
    },
    {
      ...base,
      id: 'q2',
      type: 'multi',
      text: 'Які з цих міст стоять на Дніпрі?',
      options: [
        { id: 'a', text: 'Черкаси' },
        { id: 'b', text: 'Львів' },
        { id: 'c', text: 'Запоріжжя' },
        { id: 'd', text: 'Полтава' },
      ],
      correctIds: ['a', 'c'],
    },
    { ...base, id: 'q3', type: 'boolean', text: 'Говерла є найвищою горою України.', correct: true },
    {
      ...base,
      id: 'q4',
      type: 'text',
      timeLimit: 30,
      text: 'У якому місті розташований замок Паланок?',
      accepted: ['Мукачево', 'Мукачеве'],
    },
    {
      ...base,
      id: 'q5',
      type: 'numeric',
      timeLimit: 30,
      text: 'Яка висота Говерли в метрах?',
      correct: 2061,
      tolerance: 100,
    },
    {
      ...base,
      id: 'q6',
      type: 'order',
      timeLimit: 40,
      text: 'Розташуйте міста із заходу на схід.',
      items: [
        { id: 'u', text: 'Ужгород' },
        { id: 'l', text: 'Львів' },
        { id: 'k', text: 'Київ' },
        { id: 'h', text: 'Харків' },
      ],
    },
  ],
};
