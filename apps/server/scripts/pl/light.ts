/**
 * „Polska od kuchni: codzienność i tradycje” (sid `pl-light`) — krótki, lekki quiz po polsku: kuchnia, święta i domowe zwyczaje.
 * Rundy: klasyczna rozgrzewka, plansza 3 × 5, łamigłówki („Pamięć” ze zdjęciami potraw i układanka z szopką krakowską), finał.
 * Zdjęcia — pliki z Wikimedia Commons (PL_LIGHT_PHOTOS), wgrywane na stronę przez seed. Rozwiązania i źródła — w komentarzach.
 */
import { DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { bool, cell, jigsaw, match, memory, multi, numeric, order, reveal, rules, scatter, settings, single, slider, sort, textQ, type Photos, type Slot } from './kit';

/** Klucz → plik z Wikimedia Commons. */
export const PL_LIGHT_PHOTOS: Record<string, string> = {
  faworki: 'File:Faworki (plate).jpg',
  pierogi: 'File:Polish pierogi in a dish.jpg',
  golabki: 'File:Golabki jacek.jpg',
  paczki: 'File:Polskie pączki.jpg',
  bigos: 'File:Bigos, March 2023.jpg',
  oscypek: 'File:Oscypki.jpg',
  sernik: 'File:2023 Sernik polski (1).jpg',
  szopka: 'File:Szopka krakowska4.JPG',
};

const warmup = (photos: Photos): Question[] => [
  // Żurek — zupa na zakwasie żytnim; krupnik — na kaszy jęczmiennej; kapuśniak — na kapuście.
  single('Jak nazywa się zupa na zakwasie z mąki żytniej, którą często podaje się z jajkiem i białą kiełbasą?', ['Żurek', 'Rosół', 'Krupnik', 'Kapuśniak'], 0, 500, 25),
  // Śmigus-dyngus to lany poniedziałek — drugi dzień Wielkanocy.
  bool('Śmigus-dyngus, czyli zwyczaj oblewania się wodą, przypada w Wielką Sobotę.', false, 500, 25),
  // Bigos (kapusta kiszona i świeża), gołąbki (liście kapusty), kapuśniak (zupa z kapusty); kopytka, placki i pyzy — z ziemniaków.
  multi('Które z tych potraw przygotowuje się z kapusty?', ['Bigos', 'Gołąbki', 'Kapuśniak', 'Kopytka', 'Placki ziemniaczane', 'Pyzy'], [0, 1, 2], 1000, 35),
  reveal(
    textQ(
      'Jak nazywają się te kruche ciastka smażone w głębokim tłuszczu i posypane cukrem pudrem, bez których trudno wyobrazić sobie tłusty czwartek i ostatki?',
      ['faworki', 'chrust', 'chruściki', 'chrusty', 'faworek', 'chrusciki', 'chruścik', 'faworka'],
      1000,
      30,
    ),
    photos('faworki'),
  ),
  // Trzech Króli 6 I, Dzień Kobiet 8 III, Dzień Matki 26 V, andrzejki 29/30 XI, mikołajki 6 XII.
  order('Ułóż te dni w kolejności, w jakiej wypadają w roku — od stycznia', ['Święto Trzech Króli', 'Dzień Kobiet', 'Dzień Matki', 'Andrzejki', 'Mikołajki'], 1000, 45, ['Najwcześniej', 'Najpóźniej']),
  // Pierniki toruńskie, rogal świętomarciński (Poznań, 11 XI), obwarzanek krakowski, kremówka papieska (Wadowice), andruty kaliskie.
  match(
    'Połącz regionalny przysmak z miastem, z którym jest kojarzony',
    [
      ['Pierniki', 'Toruń'],
      ['Rogal świętomarciński', 'Poznań'],
      ['Obwarzanek', 'Kraków'],
      ['Kremówka papieska', 'Wadowice'],
      ['Andruty', 'Kalisz'],
    ],
    1000,
    45,
  ),
  sort(
    'Wigilia czy Wielkanoc? Przyporządkuj potrawy i zwyczaje do święta',
    ['Wigilia', 'Wielkanoc'],
    [
      ['Karp', 0],
      ['Barszcz z uszkami', 0],
      ['Kutia', 0],
      ['Opłatek', 0],
      ['Siano pod obrusem', 0],
      ['Mazurek', 1],
      ['Babka', 1],
      ['Pisanki', 1],
      ['Święconka', 1],
      ['Rzeżucha', 1],
    ],
    100,
    45,
  ),
  numeric('Ile potraw według tradycji powinno stanąć na stole wigilijnym?', 12, 0, 500, 25),
  // Czernina (czarnina) — zupa na kaczej (rzadziej gęsiej) krwi z octem i suszonymi owocami.
  single('Czernina to staropolska zupa. Jaki jest jej najważniejszy, dość nietypowy składnik?', ['Kacza krew', 'Czarny bez', 'Kawa zbożowa', 'Mak'], 0, 1500, 30),
  // Ustawa z 10 stycznia 2018 r. o ograniczeniu handlu w niedziele — obowiązuje od 1 marca 2018 r.
  slider('W którym roku weszła w życie ustawa ograniczająca handel w niedziele?', { min: 1990, max: 2025 }, 2018, { tolerance: 0, zeroBeyond: 5 }, 1500, 30),
];

/** Plansza: trzy kategorie po pięć pól, ceny 100…500 według trudności. */
const BOARD: Record<'holidays' | 'table' | 'home', Slot> = {
  holidays: [
    cell(bool('Andrzejki to wieczór wróżb, podczas którego leje się wosk przez dziurkę od klucza.', true, 100, 25)),
    // Wielkanocne śniadanie zaczyna się od dzielenia się jajkiem ze święconki; opłatkiem — w Wigilię.
    cell(single('Czym Polacy tradycyjnie dzielą się przy wielkanocnym śniadaniu, składając sobie życzenia?', ['Jajkiem ze święconki', 'Opłatkiem', 'Chlebem i solą', 'Piernikiem'], 0, 200, 25)),
    cell(textQ('Jak nazywa się słomiana kukła, którą na powitanie wiosny topi się w rzece albo pali?', ['Marzanna', 'Marzannę', 'Marzana', 'Marzanne', 'Marzane', 'Marzanę'], 300, 30)),
    // Gwiazdor — Wielkopolska, Pomorze, Kujawy; Dzieciątko — Śląsk; Aniołek — Małopolska.
    cell(single('Kto w Wielkopolsce tradycyjnie przynosi dzieciom prezenty w Wigilię?', ['Gwiazdor', 'Dzieciątko', 'Aniołek', 'Święty Marcin'], 0, 400, 25)),
    // Boże Ciało — czwartek po uroczystości Trójcy Świętej, 60 dni po Niedzieli Wielkanocnej.
    cell(numeric('Ile dni po Wielkanocy przypada Boże Ciało?', 60, 0, 500, 30)),
  ],
  table: [
    cell(single('Z jakiego mięsa robi się klasyczny kotlet schabowy?', ['Z wieprzowego', 'Z wołowego', 'Z cielęcego', 'Z indyczego'], 0, 100, 25)),
    // Pierogi leniwe — kluski z ciasta z twarogiem, bez nadzienia.
    cell(bool('Pierogi leniwe mają nadzienie z mięsa.', false, 200, 25)),
    cell(textQ('Jak nazywa się zupa z pokrojonych w paski żołądków wołowych, mocno doprawiona majerankiem?', ['flaki', 'flaczki', 'flaki wołowe', 'flaczki wołowe', 'flaki po polsku', 'flaczki po polsku'], 500, 30)),
    // Oscypek (ChNP od 2008 r.) — wędzony ser z mleka owczego; dodatek krowiego najwyżej 40%.
    cell(single('Z jakiego mleka robi się przede wszystkim oscypek?', ['Z owczego', 'Z krowiego', 'Z koziego', 'Z bawolego'], 0, 400, 25)),
    cell(single('Czym wyróżniają się kluski śląskie?', ['Dołkiem pośrodku', 'Nadzieniem z mięsa', 'Zielonym kolorem od szpinaku', 'Kształtem półksiężyca'], 0, 300, 25)),
  ],
  home: [
    // Skala ocen w szkole: 1 (niedostateczny) … 6 (celujący).
    cell(bool('W polskiej szkole najwyższa ocena to szóstka, czyli ocena celująca.', true, 100, 25)),
    // 999 — pogotowie ratunkowe, 998 — straż pożarna, 997 — policja, 986 — straż miejska.
    cell(single('Jaki numer ma w Polsce pogotowie ratunkowe (obok numeru 112)?', ['999', '997', '998', '986'], 0, 200, 25)),
    cell(textQ('Jak nazywa się zwyczaj chodzenia od domu do domu z gwiazdą, turoniem i śpiewem w okresie Bożego Narodzenia?', ['kolędowanie', 'kolędnicy', 'koledowanie', 'kolednicy', 'kolędować', 'kolędnik'], 300, 30)),
    // 1 XI — Wszystkich Świętych, 2 XI — Dzień Zaduszny (Zaduszki); Popielec — Środa Popielcowa; Matki Boskiej Gromnicznej — 2 II.
    cell(single('Jak nazywa się dzień 2 listopada, poświęcony modlitwie za zmarłych?', ['Zaduszki', 'Popielec', 'Matki Boskiej Gromnicznej', 'Wszystkich Świętych'], 0, 400, 25)),
    // Kody pocztowe 00-xxx…05-xxx — Warszawa i okolice (okręg 0); 30-xxx — Kraków, 80-xxx — Gdańsk.
    cell(numeric('Polskie kody pocztowe mają postać XX-XXX. Od jakiej cyfry zaczynają się kody pocztowe w Warszawie?', 0, 0, 500, 30)),
  ],
};

const puzzles = (photos: Photos): Question[] => [
  memory(
    'Pamięć: odkrywaj po dwie karty i łącz zdjęcie przysmaku z jego nazwą',
    '3x4',
    [
      [{ image: photos('pierogi') }, { text: 'Pierogi' }],
      [{ image: photos('golabki') }, { text: 'Gołąbki' }],
      [{ image: photos('paczki') }, { text: 'Pączki' }],
      [{ image: photos('bigos') }, { text: 'Bigos' }],
      [{ image: photos('oscypek') }, { text: 'Oscypek' }],
      [{ image: photos('sernik') }, { text: 'Sernik' }],
    ],
    1000,
    120,
    17,
  ),
  jigsaw('Ułóż układankę: kolorowa szopka krakowska ze świątecznego konkursu', photos('szopka'), '3:4', 12, 1000, 150, true, 5),
];

// Tradycja szopkarstwa krakowskiego — wpis na Listę reprezentatywną niematerialnego dziedzictwa ludzkości UNESCO w listopadzie 2018 r.
const FINAL: Question = single(
  'Od którego roku tradycja krakowskich szopek bożonarodzeniowych jest wpisana na listę niematerialnego dziedzictwa ludzkości UNESCO?',
  ['2018', '2003', '2011', '2023'],
  0,
  0,
  40,
);

/** Quiz `pl-light`: photos — klucz PL_LIGHT_PHOTOS → adres zdjęcia na stronie. */
export const plLightQuiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `pll-${theme}-${++k}` });
  const category = (key: keyof typeof BOARD, title: string) => {
    const t = tag(key);
    return { id: `pll-c-${key}`, title, cells: scatter(`pl-light-${key}`, BOARD[key].map((c) => ({ ...c, question: t(c.question) }))) };
  };

  return {
    title: 'Polska od kuchni: codzienność i tradycje',
    description: 'Lekki quiz o polskim stole, świętach i domowych zwyczajach — ze zdjęciami, pamięcią i układanką.',
    settings: settings({ shake: 150, fog: 150, freeze: 250, mirror: 250, guests: 150, mud: 150, flip: 200, torch: 200, sticky: 150, noclock: 200, bubbles: 150 }),
    rounds: [
      {
        id: 'pll-warmup',
        type: 'classic',
        title: 'Rozgrzewka przy stole',
        description:
          'Dziesięć pytań na dobry początek: polska kuchnia, święta i zwyczaje. Będą pytania z jedną i z kilkoma odpowiedziami, prawda czy fałsz, kolejność, pary, sortowanie, suwak i zdjęcie, które odsłania się powoli — im szybciej zgadniesz, tym więcej punktów. Za szybkie dobre odpowiedzi jest bonus, a za częściowo dobrą kolejność, pary czy sortowanie — połowa punktów.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: warmup(photos).map(tag('warm')),
      },
      {
        id: 'pll-board',
        type: 'board',
        title: 'Polski kalendarz i domowe zwyczaje',
        description:
          'Trzy kategorie po pięć pól: od 100 do 500 punktów — im drożej, tym trudniej. Gracze po kolei wybierają pola. Gdzieś ukryły się pola ×2 i ×3, a pole błyskawiczne zgarnia ten, kto pierwszy wciśnie przycisk. Za pomyłkę nie traci się punktów, więc śmiało!',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: DEFAULT_RULES,
        categories: [category('holidays', 'Święta i zwyczaje'), category('table', 'Polski stół'), category('home', 'Dom i codzienność')],
      },
      {
        id: 'pll-puzzles',
        type: 'puzzles',
        title: 'Deser: łamigłówki',
        description:
          'Dwie łamigłówki na słodko. Najpierw „Pamięć”: odkrywaj po dwie karty i łącz zdjęcie polskiego przysmaku z jego nazwą. Potem układanka z kolorowej szopki krakowskiej — przeciągaj kawałki na miejsca. Kto skończy szybciej, dostanie więcej punktów.',
        questions: puzzles(photos).map(tag('puzzle')),
      },
      {
        id: 'pll-final',
        type: 'final',
        title: 'Finał: szopka pod choinkę',
        description: 'Jedno pytanie dla wszystkich. Najpierw w tajemnicy stawiasz część swoich punktów, potem odpowiadasz: dobrze — stawka się dodaje, źle — odejmuje.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [tag('final')(FINAL)],
      },
    ],
  };
};
