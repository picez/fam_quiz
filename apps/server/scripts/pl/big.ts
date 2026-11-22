/**
 * „Wielka gra o Polsce: historia, nauka i kultura” (sid `pl-big`) — duży, trudny quiz po polsku na dziesięć rund:
 * rozgrzewka, plansza „Dzieje Polski”, nauka, kultura z muzyką i filmem, aukcja, „Przetrwanie”, łamigłówki, zakłady, quest i finał.
 * Bez prowadzącego gra autopilot: nic nie jest zablokowane. Liczniki czasu — od 25 s. Nic, co wiąże się z rosją.
 */
import { DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { BOARD, SCIENCE, WARMUP } from './big-a';
import { AUCTION, BETS, CULTURE, FINAL, PUZZLES, QUEST, SURVIVAL } from './big-b';
import { rules, scatter, settings, type Photos } from './kit';

export { PL_BIG_MEDIA, PL_BIG_PHOTOS } from './big-b';

/** Quiz `pl-big`: photos — klucz PL_BIG_PHOTOS → adres zdjęcia na stronie. */
export const plBigQuiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `plb-${theme}-${++k}` });
  const category = (key: keyof typeof BOARD, title: string) => {
    const t = tag(key);
    return { id: `plb-c-${key}`, title, cells: scatter(`pl-big-${key}`, BOARD[key].map((c) => ({ ...c, question: t(c.question) }))) };
  };

  return {
    title: 'Wielka gra o Polsce: historia, nauka i kultura',
    description: 'Od Mieszka I do Szymborskiej: historia, wynalazki, literatura, muzyka, malarstwo i film w dziesięciu rundach.',
    settings: settings({ shake: 250, fog: 200, freeze: 350, mirror: 300, guests: 200, mud: 200, flip: 300, torch: 300, sticky: 200, noclock: 300, bubbles: 200 }),
    rounds: [
      {
        id: 'plb-warmup',
        type: 'classic',
        title: 'Rozgrzewka: tysiąc lat w pigułce',
        description:
          'Dwanaście pytań przez całą polską historię i kulturę: od chrztu Mieszka po noblistów. Będą pytania z jedną i z kilkoma odpowiedziami, prawda czy fałsz, kolejność, pary, sortowanie, suwak, odsłaniające się zdjęcie i zagadka „Kim jestem?” — im wcześniej zgadniesz, tym więcej punktów. Za szybkość jest bonus, za częściowo dobrą kolejność, pary czy sortowanie — połowa punktów.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: WARMUP(photos).map(tag('warm')),
      },
      {
        id: 'plb-board',
        type: 'board',
        title: 'Dzieje Polski',
        description:
          'Sześć kategorii po pięć pól: od 100 do 500 punktów — im drożej, tym trudniej. Gracze po kolei wybierają pola. W losowych miejscach ukryły się pola ×2 i ×3, a pole błyskawiczne zgarnia ten, kto pierwszy wciśnie przycisk. Za błędną odpowiedź traci się cenę pola.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: [
          category('piast', 'Piastowie'),
          category('jagiellon', 'Jagiellonowie i elekcje'),
          category('century', 'Wiek XX'),
          category('science', 'Nauka'),
          category('books', 'Literatura'),
          category('arts', 'Sztuka i muzyka'),
        ],
      },
      {
        id: 'plb-science',
        type: 'classic',
        title: 'Pracownia: polscy uczeni',
        description:
          'Osiem pytań o polskich uczonych i ich odkrycia: od Kopernika i Heweliusza po planety przy pulsarze i lot na stację kosmiczną. Za szybkie odpowiedzi jest bonus, a za częściowo dobre pary i kolejność — połowa punktów.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: SCIENCE.map(tag('sci')),
      },
      {
        id: 'plb-culture',
        type: 'classic',
        title: 'Kultura: muzyka, film i słowo',
        description:
          'Muzyka Chopina, polskie kino i literatura. Melodia i zwiastuny odsłaniają się kawałkami po 1, 2, 4, 8 i 16 sekund — im wcześniej zgadniesz, tym więcej punktów. W blefie najpierw dopisujesz zmyśloną odpowiedź, która ma zmylić innych, a potem szukasz prawdy. Jest też ściana skojarzeń: rozłóż szesnaście tytułów na cztery grupy.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: CULTURE(photos).map(tag('culture')),
      },
      {
        id: 'plb-auction',
        type: 'auction',
        title: 'Aukcja: sławni Polacy',
        description:
          'Przed każdym pytaniem widać tylko jego temat. Licytujcie dowolną stawką: kto da najwięcej, ten odpowiada. Dobra odpowiedź zwraca stawkę i przynosi cenę pytania, pomyłka zabiera stawkę i jeszcze cenę. Jeśli nikt nie licytował, odpowiadają wszyscy.',
        shuffleOptions: true,
        check: 'auto',
        bidMode: 'free',
        bidStep: 100,
        loss: 'bid_price',
        questions: AUCTION.map(tag('auction')).map((q, i) => ({ ...q, points: 300 + 100 * i })),
      },
      {
        id: 'plb-survival',
        type: 'survival',
        title: 'Przetrwanie: lekcja polskiego',
        description:
          'Dziesięć pytań z literatury polskiej. Kto się pomyli, wybiera jedne z trojga drzwi: za dwojgiem czeka ratunek, za jednymi — odpadnięcie. Runda kończy się, gdy zostanie troje graczy; każdy, kto przetrwa, dostaje 1000 punktów premii.',
        speedBonus: true,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        questions: SURVIVAL.map(tag('surv')),
        trials: [],
        trial: 'luck',
        survivors: 3,
        bonus: 1000,
      },
      {
        id: 'plb-puzzles',
        type: 'puzzles',
        title: 'Łamigłówki: galeria',
        description:
          'Trzy łamigłówki po kolei: „Pamięć” z ośmioma polskimi obrazami i ich autorami, układanka z „Hołdu pruskiego” Jana Matejki i trudne sudoku 6×6. Kto szybciej skończy, dostanie więcej punktów.',
        questions: PUZZLES(photos).map(tag('puzzle')),
      },
      {
        id: 'plb-bets',
        type: 'bets',
        title: 'Zakłady: Polska i świat',
        description:
          'Sześć pytań z historii świata i Polski w świecie. Przed każdym widać tylko temat — stawiasz w tajemnicy: od 200 punktów, a minimum rośnie o 100 z każdym pytaniem; najwyższa stawka to 1500. Kto odpowie dobrze, dzieli pulę proporcjonalnie do stawek; jeśli nikt — stawki wracają.',
        shuffleOptions: true,
        check: 'auto',
        betStart: 200,
        betStep: 100,
        betMax: 1500,
        questions: BETS.map(tag('bets')),
      },
      {
        id: 'plb-quest',
        type: 'quest',
        title: 'Quest: warszawski szyfr',
        description:
          'Nad rundą wisi zagadka — jej rozwiązanie to sześcioliterowy kod. Każda dobra odpowiedź o Warszawie odsłania jedną literę; kod można wpisać w każdej chwili, masz trzy próby. Trzy pierwsze osoby, które otworzą skrzynię, dostaną dodatkowe „Podwojenie”.',
        speedBonus: false,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        prompt: QUEST.prompt,
        code: QUEST.code,
        order: [2, 5, 0, 3, 1, 4],
        tries: 3,
        bonus: { kind: 'buff', buff: 'double', first: 3 },
        questions: QUEST.questions.map(tag('quest')),
      },
      {
        id: 'plb-final',
        type: 'final',
        title: 'Finał: polski wynalazek',
        description: 'Ostatnie pytanie dla wszystkich. Najpierw w tajemnicy stawiasz część punktów, potem odpowiadasz: dobrze — stawka się dodaje, źle — odejmuje.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [tag('final')(FINAL)],
      },
    ],
  };
};
