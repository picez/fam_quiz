/**
 * „Polska wzdłuż i wszerz: geografia, przyroda i sport” (sid `pl-geo`) — średni quiz po polsku: mapa, miasta, góry i morze, przyroda, sport.
 * Rundy: rozgrzewka z mapą, plansza 4 × 5, Polska na zdjęciach i mapach (układanka, punkt na mapie, „Więcej czy mniej”, lista na czas, blef),
 * „Przetrwanie” z drzwiami szczęścia, sportowa błyskawica, „Va banque” z rekordami i finał.
 * Punkty na mapie Europy policzono tą samą projekcją co apps/web/scripts/build-maps.mjs (Berlin wychodzi dokładnie jak w PIN_PLACES).
 */
import { DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import {
  bluff,
  bool,
  cell,
  clues,
  img,
  jigsaw,
  list,
  match,
  moreless,
  multi,
  numeric,
  order,
  pin,
  reveal,
  rules,
  scatter,
  settings,
  single,
  slider,
  stepped,
  textQ,
  type Photos,
  type Slot,
} from './kit';

/** Klucz → plik z Wikimedia Commons. */
export const PL_GEO_PHOTOS: Record<string, string> = {
  malbork: 'File:Malbork zamek (dron1).jpg',
  spodek: 'File:Katowice - Spodek by night.jpg',
  morskieOko: 'File:Morskie Oko 2019.jpg',
  kinga: 'File:Saint Kinga Chapel in Wieliczka Salt Mine.jpg',
  krzywyDomek: 'File:Krzywy Domek Sopot 1.jpg',
  sukiennice: 'File:Kraków - sukiennice, rynek główny - panoramio.jpg',
};

/** Miasta na wbudowanej mapie Europy (części szerokości i wysokości). */
const EUROPE = { gdansk: { x: 0.5995, y: 0.4996 }, szczecin: { x: 0.5597, y: 0.5213 } } as const;

const warmup = (photos: Photos): Question[] => [
  single('Jak nazywa się najwyższe pasmo górskie w Polsce?', ['Tatry', 'Karkonosze', 'Bieszczady', 'Pieniny'], 0, 500, 25),
  pin('Zaznacz na mapie Europy Gdańsk', 'europe', EUROPE.gdansk, [1.2, 5], 1000, 30),
  // Hel leży na Mierzei Helskiej (półwysep), nie na wyspie.
  bool('Hel jest wyspą.', false, 500, 25),
  // Kujawsko-pomorskie: wojewoda w Bydgoszczy, sejmik w Toruniu; lubuskie: wojewoda w Gorzowie Wlkp., sejmik w Zielonej Górze.
  multi(
    'Które województwa mają dwie stolice — siedziba wojewody jest w innym mieście niż siedziba sejmiku?',
    ['Kujawsko-pomorskie', 'Lubuskie', 'Śląskie', 'Małopolskie', 'Warmińsko-mazurskie', 'Zachodniopomorskie'],
    [0, 1],
    1500,
    40,
  ),
  // Szerokości: Gdańsk 54,35°, Bydgoszcz 53,12°, Łódź 51,76°, Katowice 50,26°, Zakopane 49,30°.
  order('Ułóż miasta od położonego najdalej na północ do najdalej na południe', ['Gdańsk', 'Bydgoszcz', 'Łódź', 'Katowice', 'Zakopane'], 1000, 45, ['Najdalej na północ', 'Najdalej na południe']),
  match(
    'Połącz miasto z rzeką, nad którą leży',
    [
      ['Wrocław', 'Odra'],
      ['Poznań', 'Warta'],
      ['Bydgoszcz', 'Brda'],
      ['Rzeszów', 'Wisłok'],
      ['Przemyśl', 'San'],
    ],
    1000,
    45,
  ),
  reveal(
    textQ('Jak nazywa się ten zamek nad Nogatem — dawna siedziba wielkich mistrzów zakonu krzyżackiego?', ['Malbork', 'zamek w Malborku', 'Zamek Malbork', 'zamek malborski', 'Marienburg', 'Malborku'], 1000, 30),
    photos('malbork'),
  ),
  // Polski wierzchołek Rysów — 2499 m n.p.m. (środkowy, słowacki — 2501 m).
  slider('Jaką wysokość ma najwyższy szczyt Polski — Rysy (polski wierzchołek)?', { min: 1500, max: 3000 }, 2499, { tolerance: 10, zeroBeyond: 200, unit: 'm n.p.m.' }, 1500, 30),
  // GUS: 37,5 mln (2024) — przyjmujemy 37 i 38.
  numeric('Ile milionów mieszkańców liczy Polska? Podaj liczbę całkowitą.', 37.5, 1, 500, 25),
  // Wrocław: ponad sto mostów i kładek, powódź tysiąclecia w lipcu 1997 r., Hala Stulecia (UNESCO, 2006), kilkaset krasnali z brązu.
  clues(
    'Kim jestem? Zgadnij miasto po podpowiedziach',
    ['Mam ponad sto mostów i kładek.', 'W lipcu 1997 roku zalała mnie powódź tysiąclecia.', 'Moja Hala Stulecia jest na liście UNESCO.', 'Po moich ulicach chodzi kilkaset małych krasnali z brązu.'],
    ['Wrocław', 'Wroclaw', 'Breslau', 'we Wrocławiu'],
    8,
    1500,
    40,
  ),
  // Kaszubski — jedyny w Polsce ustawowo uznany język regionalny (ustawa z 2005 r.).
  single('Mieszkańcy którego regionu mówią językiem uznanym w polskim prawie za jedyny język regionalny?', ['Kaszub', 'Kurpiów', 'Podhala', 'Kociewia'], 0, 1000, 30),
];

const BOARD = (photos: Photos): Record<'cities' | 'mountains' | 'waters' | 'heritage', Slot> => ({
  cities: [
    cell(single('W którym mieście co godzinę z wieży kościoła Mariackiego rozbrzmiewa hejnał?', ['W Krakowie', 'W Gdańsku', 'W Poznaniu', 'W Lublinie'], 0, 100, 25)),
    // Koziołki na ratuszu w Poznaniu trykają się codziennie w samo południe; koza jest w herbie Lublina.
    cell(single('W którym mieście w samo południe na wieży ratusza trykają się dwa koziołki?', ['W Poznaniu', 'W Lublinie', 'W Toruniu', 'We Wrocławiu'], 0, 500, 25)),
    cell(textQ('Które miasto nazywane jest „zimową stolicą Polski”?', ['Zakopane', 'Zakopanem', 'Zakopanego'], 200, 30)),
    cell(img(single('W którym mieście stoi Spodek — hala widowiskowa w kształcie latającego talerza?', ['W Katowicach', 'W Łodzi', 'W Bydgoszczy', 'W Gliwicach'], 0, 400, 25), photos('spodek'))),
    // Ulica Piotrkowska — ok. 4,2 km, jedna z najdłuższych ulic handlowych w Europie.
    cell(single('Ulica Piotrkowska, jeden z najdłuższych deptaków w Europie, to wizytówka którego miasta?', ['Łodzi', 'Piotrkowa Trybunalskiego', 'Radomia', 'Kielc'], 0, 300, 25)),
  ],
  mountains: [
    // Zasolenie Bałtyku to średnio ok. 7‰ — kilka razy mniej niż w oceanie (ok. 35‰).
    cell(bool('Bałtyk jest tak samo słony jak ocean.', false, 100, 25)),
    // Giewont (1894 m) — krzyż na szczycie od 1901 r.; sylwetka przypomina śpiącego rycerza.
    cell(single('Który szczyt w Tatrach ma na wierzchołku żelazny krzyż, a jego sylwetka przypomina śpiącego rycerza?', ['Giewont', 'Kasprowy Wierch', 'Świnica', 'Kościelec'], 0, 200, 25)),
    cell(single('Które góry na południowym wschodzie Polski słyną z połonin i dzikiej przyrody?', ['Bieszczady', 'Karkonosze', 'Pieniny', 'Beskid Śląski'], 0, 300, 25)),
    // Słowiński Park Narodowy — ruchome wydmy między Łebą a jeziorem Łebsko (Łącka i Czołpińska).
    cell(single('Który park narodowy nad Bałtykiem słynie z ruchomych wydm koło Łeby?', ['Słowiński', 'Woliński', 'Kampinoski', 'Drawieński'], 0, 400, 25)),
    // Śnieżka (1603 m) — najwyższy szczyt Karkonoszy i Sudetów; obserwatorium meteorologiczne w kształcie spodków.
    cell(textQ('Jak nazywa się najwyższy szczyt Sudetów, na którym stoi obserwatorium w kształcie trzech spodków?', ['Śnieżka', 'Sniezka', 'Śnieżkę', 'Sniezke', 'Śnieżki'], 500, 30)),
  ],
  waters: [
    // Słubice leżą nad Odrą, naprzeciw Frankfurtu; granica z Niemcami biegnie Odrą i Nysą Łużycką.
    cell(single('Nad którą graniczną rzeką leżą Słubice, naprzeciw niemieckiego Frankfurtu?', ['Odra', 'Nysa Łużycka', 'Warta', 'Bug'], 0, 100, 25)),
    cell(single('Jak nazywa się kraina na północnym wschodzie Polski z setkami jezior?', ['Mazury', 'Kaszuby', 'Kujawy', 'Podhale'], 0, 200, 25)),
    // Hańcza — 108,5 m (najgłębsze jezioro Polski i Niżu Środkowoeuropejskiego).
    cell(single('Które jezioro jest najgłębsze w Polsce — ma ponad sto metrów głębokości?', ['Hańcza', 'Drawsko', 'Wigry', 'Śniardwy'], 0, 300, 25)),
    // Morskie Oko — największe jezioro Tatr (ok. 35 ha), pod Rysami i Mięguszowieckimi Szczytami.
    cell(img(textQ('Jak nazywa się to największe jezioro w Tatrach, do którego co roku wędrują tłumy turystów?', ['Morskie Oko', 'Morskiego Oka', 'Morskie oko'], 400, 30), photos('morskieOko'))),
    // Długość Wisły: tradycyjnie 1047 km, według nowszych pomiarów ok. 1022 km — tolerancja obejmuje oba.
    cell(numeric('Ile kilometrów długości ma Wisła? Wystarczy z dokładnością do 30 km.', 1047, 30, 500, 30)),
  ],
  heritage: [
    // Zamość — Stare Miasto na liście UNESCO od 1992 r.
    cell(bool('Renesansowe Stare Miasto w Zamościu jest na liście światowego dziedzictwa UNESCO.', true, 100, 25)),
    // Żuraw — średniowieczny dźwig portowy nad Motławą w Gdańsku.
    cell(single('Gdzie stoi średniowieczny dźwig portowy zwany Żurawiem?', ['W Gdańsku', 'W Szczecinie', 'W Elblągu', 'W Gdyni'], 0, 200, 25)),
    // Kaplica św. Kingi — największa podziemna kaplica kopalni soli w Wieliczce, ok. 100 m pod ziemią.
    cell(img(single('Na zdjęciu kaplica świętej Kingi, w całości wykuta w soli. Gdzie się znajduje?', ['W kopalni w Wieliczce', 'W kopalni w Kłodawie', 'W Jaskini Raj', 'W kopalni Guido w Zabrzu'], 0, 300, 25), photos('kinga'))),
    // Kościoły Pokoju w Jaworze i Świdnicy (UNESCO 2001) — konstrukcja szachulcowa: drewno i glina.
    cell(single('Z czego zbudowano Kościoły Pokoju w Jaworze i Świdnicy, wpisane na listę UNESCO?', ['Z drewna i gliny', 'Z białego marmuru', 'Z czerwonej cegły', 'Z ciosanego granitu'], 0, 400, 25)),
    // Puszcza Białowieska — UNESCO 1979 (rozszerzona 1992 i 2014): pierwszy polski obiekt przyrodniczy; od 2021 r. także buczyny Bieszczadów.
    cell(single('Który park narodowy chroni puszczę, która w 1979 roku jako pierwszy polski obiekt przyrodniczy trafiła na listę UNESCO?', ['Białowieski', 'Tatrzański', 'Biebrzański', 'Karkonoski'], 0, 500, 25)),
  ],
});

const views = (photos: Photos): Question[] => [
  jigsaw('Ułóż układankę: Sukiennice na krakowskim Rynku Głównym', photos('sukiennice'), '4:3', 12, 1000, 150, true, 9),
  reveal(textQ('W jakim nadmorskim mieście stoi ten „Krzywy Domek”?', ['Sopot', 'Sopocie', 'w Sopocie'], 1000, 30), photos('krzywyDomek')),
  pin('Zaznacz na mapie Europy Szczecin', 'europe', EUROPE.szczecin, [1.2, 5], 1000, 30),
  // Odra 854 km, Warta 808 km; Kraków ok. 800 tys., Łódź ok. 650 tys. (GUS 2023); mazowieckie 35,6 tys. km², wielkopolskie 29,8 tys. km²;
  // Śniardwy 113,8 km², Mamry ok. 104 km²; Śnieżka 1603 m, Babia Góra 1725 m.
  stepped(
    moreless(
      'Więcej czy mniej: polskie rekordy',
      [
        ['Która rzeka jest dłuższa?', ['Odra', '854 km'], ['Warta', '808 km'], 'a', 100],
        ['Które miasto ma więcej mieszkańców?', ['Kraków', 'ok. 800 tys.'], ['Łódź', 'ok. 650 tys.'], 'a', 200],
        ['Które województwo jest większe?', ['Wielkopolskie', '29,8 tys. km²'], ['Mazowieckie', '35,6 tys. km²'], 'b', 300],
        ['Które jezioro jest większe?', ['Mamry', 'ok. 104 km²'], ['Śniardwy', 'ok. 114 km²'], 'b', 400],
        ['Który szczyt jest wyższy?', ['Babia Góra', '1725 m'], ['Śnieżka', '1603 m'], 'a', 500],
      ],
      90,
    ),
    100,
  ),
  list(
    'Lista na czas: wymień jak najwięcej województw',
    [
      ['Dolnośląskie', ['dolnoslaskie', 'województwo dolnośląskie']],
      ['Kujawsko-pomorskie', ['kujawsko pomorskie', 'kujawskopomorskie']],
      ['Lubelskie', ['lubelskie województwo']],
      ['Lubuskie', []],
      ['Łódzkie', ['lodzkie']],
      ['Małopolskie', ['malopolskie']],
      ['Mazowieckie', []],
      ['Opolskie', []],
      ['Podkarpackie', []],
      ['Podlaskie', []],
      ['Pomorskie', []],
      ['Śląskie', ['slaskie']],
      ['Świętokrzyskie', ['swietokrzyskie']],
      ['Warmińsko-mazurskie', ['warminsko mazurskie', 'warmińsko mazurskie', 'warminsko-mazurskie']],
      ['Wielkopolskie', []],
      ['Zachodniopomorskie', ['zachodnio-pomorskie', 'zachodnio pomorskie']],
    ],
    100,
    null,
    120,
  ),
  // Bóbrka koło Krosna — najstarsza na świecie czynna kopalnia ropy naftowej, założona w 1854 r. przez Ignacego Łukasiewicza.
  bluff(
    'Blef: w Bóbrce koło Krosna od 1854 roku działa najstarsza na świecie ___.',
    ['kopalnia ropy naftowej', 'kopalnia ropy', 'kopalnia nafty', 'kopalnia ropy naftowej w Bóbrce'],
    ['kopalnia bursztynu', 'warzelnia soli', 'huta szkła'],
    1000,
    60,
    40,
  ),
];

/** „Przetrwanie” z drzwiami szczęścia: przyroda Polski. */
const SURVIVAL: Question[] = [
  // Żubr — najcięższy ssak lądowy Europy.
  single('Jak nazywa się największy dziki ssak lądowy Europy, który żyje w polskich puszczach?', ['Żubr', 'Łoś', 'Jeleń szlachetny', 'Niedźwiedź brunatny'], 0, 300, 25),
  // Bocian biały odlatuje na zimę do Afryki.
  bool('Bocian biały zostaje w Polsce na zimę.', false, 300, 25),
  // Szarotka alpejska — w Tatrach i Pieninach, pod ochroną.
  textQ('Jak nazywa się chroniona roślina tatrzańska o białych, filcowych „gwiazdkach” kwiatów, symbol gór?', ['szarotka', 'szarotka alpejska', 'edelweiss', 'szarotki'], 400, 30),
  // Kozica tatrzańska — pod ścisłą ochroną gatunkową.
  bool('Kozica, która żyje w polskich Tatrach, jest pod ścisłą ochroną.', true, 400, 25),
  // Biebrzański PN — ok. 592 km², największy park narodowy w Polsce.
  single('Który park narodowy jest największy w Polsce?', ['Biebrzański', 'Kampinoski', 'Tatrzański', 'Bieszczadzki'], 0, 500, 25),
  // Lasy zajmują ok. 29,6–31% powierzchni Polski (GUS, Raport o stanie lasów).
  slider('Jaki procent powierzchni Polski zajmują lasy (w przybliżeniu)?', { min: 0, max: 100 }, 30, { tolerance: 2, zeroBeyond: 10, unit: '%' }, 600, 30),
  // Bielik — największy ptak drapieżny gniazdujący w Polsce (rozpiętość skrzydeł do ok. 2,5 m).
  single('Jak nazywa się największy ptak drapieżny gniazdujący w Polsce?', ['Bielik', 'Orzeł przedni', 'Myszołów', 'Sokół wędrowny'], 0, 700, 25),
  // Pustynia Błędowska — między Błędowem (Dąbrowa Górnicza) a Klucze, „polska Sahara”.
  textQ('Jak nazywa się obszar lotnych piasków koło Olkusza, nazywany „polską Saharą”?', ['Pustynia Błędowska', 'Błędowska', 'Pustynia Bledowska', 'Bledowska', 'Pustynią Błędowską'], 800, 30),
];

/** Błyskawica: sport. */
const BLITZ: Question[] = [
  // Małysz — indywidualne złota MŚ: 2001 (Lahti, K-116), 2003 (Val di Fiemme, obie skocznie), 2007 (Sapporo, K-90).
  single('Który skoczek narciarski z Wisły czterokrotnie zdobył indywidualne mistrzostwo świata?', ['Adam Małysz', 'Kamil Stoch', 'Dawid Kubacki', 'Piotr Żyła'], 0, 300, 25),
  textQ('Jak nazywa się polska tenisistka, która wielokrotnie wygrała turniej Roland Garros?', ['Iga Świątek', 'Świątek', 'Swiatek', 'Iga Swiatek', 'Iga'], 400, 25),
  // Sezon 2020/21: 41 goli — rekord Bundesligi (Gerd Müller, 40 w 1971/72).
  numeric('Ile goli strzelił Robert Lewandowski w sezonie Bundesligi 2020/21, bijąc rekord Gerda Müllera?', 41, 0, 400, 25),
  // Kubica wygrał Grand Prix Kanady 8 czerwca 2008 r. w BMW Sauber.
  single('W barwach którego zespołu Robert Kubica wygrał Grand Prix Kanady 2008?', ['BMW Sauber', 'Renault', 'Williams', 'Lotus'], 0, 500, 25),
  // Mistrzostwa świata siatkarzy: 1974 (Meksyk), 2014, 2018.
  single('W którym roku polscy siatkarze po raz pierwszy zostali mistrzami świata?', ['1974', '1982', '2014', '1966'], 0, 500, 25),
  // Trzecie miejsca na mundialu: 1974 (RFN) i 1982 (Hiszpania).
  bool('Piłkarska reprezentacja Polski dwa razy zajęła trzecie miejsce na mistrzostwach świata.', true, 600, 25),
  // Pudzianowski wygrał World's Strongest Man w latach 2002, 2003, 2005, 2007 i 2008.
  single("Ile razy Mariusz Pudzianowski wygrał zawody World's Strongest Man?", ['5', '3', '4', '7'], 0, 600, 25),
  // Halina Konopacka — rzut dyskiem, Amsterdam 1928: pierwszy złoty medal olimpijski dla Polski.
  textQ('Jak nazywała się dyskobolka, która w Amsterdamie w 1928 roku zdobyła pierwszy olimpijski złoty medal dla Polski?', ['Halina Konopacka', 'Konopacka', 'Halina Konopacka-Matuszewska'], 700, 25),
];

/** „Va banque”: rekordy i wyczyny, ceny rosną z trudnością. */
const WIPEOUT: Question[] = [
  // Varso Tower (Warszawa, 2022) — 310 m z iglicą, najwyższy budynek w Polsce i w Unii Europejskiej.
  bool('Najwyższym budynkiem w Polsce jest Varso Tower w Warszawie.', true, 100, 25),
  // Molo w Sopocie — 511,5 m, najdłuższe drewniane molo w Europie.
  single('Gdzie jest najdłuższe drewniane molo w Europie?', ['W Sopocie', 'W Kołobrzegu', 'W Międzyzdrojach', 'W Gdyni-Orłowie'], 0, 200, 25),
  // Kolej linowa na Kasprowy Wierch — otwarta w marcu 1936 r.
  numeric('W którym roku otwarto kolejkę linową na Kasprowy Wierch?', 1936, 0, 400, 30),
  // Jaskinia Wielka Śnieżna (Tatry Zachodnie) — najdłuższa (ponad 23 km) i najgłębsza jaskinia Polski.
  textQ('Jak nazywa się najdłuższa i najgłębsza jaskinia Polski, w Tatrach Zachodnich?', ['Jaskinia Wielka Śnieżna', 'Wielka Śnieżna', 'Wielka Sniezna', 'Jaskinia Wielka Sniezna'], 600, 30),
  // Kukuczka — Korona Himalajów i Karakorum w 1987 r., drugi po Reinholdzie Messnerze (1986).
  single('Który Polak jako drugi człowiek na świecie zdobył wszystkie czternaście ośmiotysięczników?', ['Jerzy Kukuczka', 'Krzysztof Wielicki', 'Andrzej Zawada', 'Piotr Pustelnik'], 0, 800, 25),
  // 17 lutego 1980 r. — Krzysztof Wielicki i Leszek Cichy, pierwsze zimowe wejście na Mount Everest.
  slider('W którym roku Polacy jako pierwsi na świecie stanęli zimą na szczycie Mount Everestu?', { min: 1950, max: 2010 }, 1980, { tolerance: 1, zeroBeyond: 6 }, 1000, 30),
  // Wanda Rutkiewicz — 16 października 1978 r., pierwsza Europejka i trzecia kobieta na Evereście.
  single('Która Polka jako pierwsza Europejka stanęła na szczycie Mount Everestu (1978)?', ['Wanda Rutkiewicz', 'Halina Krüger-Syrokomska', 'Kinga Baranowska', 'Anna Czerwińska'], 0, 1500, 25),
];

// Długość granic: z Czechami ok. 796 km, ze Słowacją 541 km, z Niemcami 467 km, z Litwą 104 km.
const FINAL: Question = single('Z którym z tych państw Polska ma najdłuższą granicę lądową?', ['Z Czechami', 'Z Niemcami', 'Ze Słowacją', 'Z Litwą'], 0, 0, 40);

/** Quiz `pl-geo`: photos — klucz PL_GEO_PHOTOS → adres zdjęcia na stronie. */
export const plGeoQuiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `plg-${theme}-${++k}` });
  const board = BOARD(photos);
  const category = (key: keyof typeof board, title: string) => {
    const t = tag(key);
    return { id: `plg-c-${key}`, title, cells: scatter(`pl-geo-${key}`, board[key].map((c) => ({ ...c, question: t(c.question) }))) };
  };

  return {
    title: 'Polska wzdłuż i wszerz: geografia, przyroda i sport',
    description: 'Miasta, góry, morze, przyroda i polscy sportowcy — z mapą, zdjęciami i układanką.',
    settings: settings({ shake: 200, fog: 200, freeze: 300, mirror: 300, guests: 150, mud: 200, flip: 250, torch: 250, sticky: 200, noclock: 250, bubbles: 200 }),
    rounds: [
      {
        id: 'plg-warmup',
        type: 'classic',
        title: 'Rozgrzewka z mapą',
        description:
          'Jedenaście pytań na start: góry, rzeki, województwa i miasta. Zaznaczysz punkt na mapie Europy, ułożysz miasta z północy na południe, połączysz miasta z rzekami, zgadniesz zamek z odsłaniającego się zdjęcia i miasto po kolejnych podpowiedziach — im wcześniej, tym więcej punktów. Za szybkie odpowiedzi jest bonus, a za częściowo dobrą kolejność czy pary — połowa punktów.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: warmup(photos).map(tag('warm')),
      },
      {
        id: 'plg-board',
        type: 'board',
        title: 'Miasta, góry i zabytki',
        description:
          'Cztery kategorie po pięć pól: od 100 do 500 punktów — im drożej, tym trudniej. Gracze po kolei wybierają pola. Gdzieś czekają pola ×2 i ×3, a pole błyskawiczne zgarnia najszybszy. Uwaga: za błędną odpowiedź traci się punkty pola.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: [category('cities', 'Miasta'), category('mountains', 'Góry i morze'), category('waters', 'Rzeki i jeziora'), category('heritage', 'Zabytki i UNESCO')],
      },
      {
        id: 'plg-views',
        type: 'classic',
        title: 'Polska na zdjęciach i mapach',
        description:
          'Sześć zadań bez pośpiechu: ułóż układankę z krakowskim Rynkiem, rozpoznaj nadmorskie miasto ze zdjęcia, zaznacz Szczecin na mapie, zdecyduj „więcej czy mniej” (każde kolejne porównanie jest droższe o 100), wymień województwa na czas i rozegraj blef: dopisz zmyśloną odpowiedź, która zmyli innych, a potem znajdź prawdę.',
        speedBonus: false,
        shuffleOptions: false,
        rules: DEFAULT_RULES,
        questions: views(photos).map(tag('views')),
      },
      {
        id: 'plg-survival',
        type: 'survival',
        title: 'Przetrwanie: polska przyroda',
        description:
          'Osiem pytań o polską przyrodę. Kto się pomyli, wybiera jedne z trojga drzwi: za dwojgiem czeka ratunek, za jednymi — odpadnięcie. Runda kończy się, gdy zostanie dwoje graczy; każdy, kto przetrwa, dostaje 800 punktów premii.',
        speedBonus: true,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        questions: SURVIVAL.map(tag('surv')),
        trials: [],
        trial: 'luck',
        survivors: 2,
        bonus: 800,
      },
      {
        id: 'plg-blitz',
        type: 'blitz',
        title: 'Błyskawica: polski sport',
        description:
          'Osiem pytań o polskich sportowców. Kto pierwszy wciśnie „Odpowiadam”, ten odpowiada: ma 15 sekund i jedną próbę. Błędna odpowiedź oddaje pytanie pozostałym.',
        shuffleOptions: true,
        answerWindow: 15,
        attempts: 1,
        check: 'auto',
        rules: { ...DEFAULT_RULES, partial: null },
        questions: BLITZ.map(tag('blitz')),
      },
      {
        id: 'plg-wipeout',
        type: 'wipeout',
        title: 'Va banque: rekordy i wyczyny',
        description:
          'Siedem pytań od 100 do 1500 punktów. Każda dobra odpowiedź dokłada cenę pytania do twojego banku, a pomyłka spala cały bank. Po każdej dobrej odpowiedzi decydujesz: grasz dalej czy zabierasz bank.',
        shuffleOptions: true,
        questions: WIPEOUT.map(tag('wipeout')),
      },
      {
        id: 'plg-final',
        type: 'final',
        title: 'Finał: granice Polski',
        description: 'Ostatnie pytanie dla wszystkich. Najpierw w tajemnicy stawiasz część punktów, potem odpowiadasz: dobrze — stawka się dodaje, źle — odejmuje.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [tag('final')(FINAL)],
      },
    ],
  };
};
