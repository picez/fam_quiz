/**
 * „Polska na wesoło: kino, muzyka, telewizja i język” (sid `pl-fun`) — zabawny quiz po polsku: język i gwary, kultowe komedie,
 * przeboje, telewizja i gry towarzyskie (szpieg, rysunek, ściana, łańcuch), „Milionerzy”, „Prawda o graczu”, błyskawica i finał.
 * Nagrania sprawdzone 2026-11-22: oEmbed 200 (tytuł i kanał w komentarzach). Starty piosenek — według zsynchronizowanych tekstów lrclib
 * dla wersji o tej samej długości; w żadnym fragmencie (start … start + 16 s) nie pada tytuł. Kadry filmów — w storyboardzie YouTube.
 */
import { DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { bluff, bool, chain, clip, drawing, match, melody, multi, numeric, order, rules, settings, single, sort, spy, textQ, wall, yt } from './kit';

/** Identyfikatory YouTube → sekunda startu. */
export const PL_FUN_MEDIA: Record<string, number> = {
  fgSyYZtBeO0: 2, // Cyrulik: „Trailer Seksmisja (1984)”, 2:26 — od 2 s mężczyźni w szpitalnych koszulach, 20 s wieniec „najlepszy tytuł” bez tytułu; „misja” dopiero 46 s.
  pCIQ2qq00r8: 10, // Cyrulik: „KILER - TRAILER (4K) 1997”, 3:36 — 4–6 s napis „odnowiona wersja zwiastunu”; od 10 s zapalniczka, strzelanina, broń; nazwisko aktora dopiero 32 s.
  _ewr2o0PEzc: 35, // Lady Pank - Topic: „Mniej niż zero”, 4:01; lrclib 240 s: zwrotka „Myślisz może…” 0:35, tytuł dopiero 0:55.
  '1n0MupX-7AM': 16, // MTJ Wytwórnia Muzyczna: „Perfect - Autobiografia (Official audio)”, 4:34; lrclib 275 s: „Miałem dziesięć lat” 0:16–0:17; tytuł nie pada.
  '2YA_zrmxLiQ': 1, // Maanam: „Kocham Cię Kochanie Moje (2011 Remaster)”, 4:52; lrclib 291–294 s: instrumentalny wstęp, tytuł śpiewany od 0:22.
  A8d3QBMWUgs: 43, // S.P. RECORDS: „KULT - Arahja [OFFICIAL AUDIO]”, 3:36; lrclib 217 s: zwrotka „Mój dom murem podzielony” 0:42,6–1:04.
  'S7sN-cFhwuk': 1, // sanah: „sanah - Szampan (Official Video)”, 3:19; lrclib 200 s: „Pod górkę mam” od 0:00, tytuł dopiero 0:29.
  x9UVz4l4nlw: 5, // EdytaGorniakChannel: „Edyta Górniak - To nie ja [2020 Remaster]”, 3:06; lrclib 184 s: „Świat mój tak zwyczajny” 0:05–0:07, tytuł 0:53.
  nlyWvOwg78A: 0, // Niemen - Topic: „Dziwny jest ten świat (1967)”, 3:38 — pytanie o wykonawcę, tytuł piosenki nic nie zdradza.
};

const WARMUP: Question[] = [
  textQ('Dokończ łamaniec językowy: „W Szczebrzeszynie chrząszcz brzmi w…”', ['trzcinie', 'trzcinie.', 'w trzcinie'], 500, 25),
  // Polski alfabet: 32 litery (bez q, v, x; z ą, ć, ę, ł, ń, ó, ś, ź, ż).
  numeric('Ile liter liczy polski alfabet?', 32, 0, 1000, 25),
  multi('Których z tych liter nie ma w polskim alfabecie — pojawiają się tylko w wyrazach obcych?', ['Q', 'V', 'X', 'Ź', 'Ł', 'Ż'], [0, 1, 2], 1000, 30),
  single('Jak nazywa się pingwin-naukowiec z „Pingwinów z Madagaskaru”, który nosi polskie nazwisko?', ['Kowalski', 'Szeregowy', 'Rico', 'Skipper'], 0, 500, 25),
  // Gwara podhalańska: baca, juhas, ciupaga, gazda; gwara śląska: gruba (kopalnia), szolka (filiżanka), hajer (górnik), kołocz (placek).
  sort(
    'Góry czy Śląsk? Przyporządkuj słowa do gwary',
    ['Gwara góralska', 'Gwara śląska'],
    [
      ['Baca', 0],
      ['Juhas', 0],
      ['Ciupaga', 0],
      ['Gazda', 0],
      ['Gruba', 1],
      ['Szolka', 1],
      ['Hajer', 1],
      ['Kołocz', 1],
    ],
    100,
    45,
  ),
  match(
    'Połącz zdrobnienie z pełnym imieniem',
    [
      ['Kuba', 'Jakub'],
      ['Gosia', 'Małgorzata'],
      ['Jędrek', 'Andrzej'],
      ['Zośka', 'Zofia'],
      ['Bartek', 'Bartłomiej'],
    ],
    1000,
    40,
  ),
  // „Jak rozpętałem drugą wojnę światową” (1969): szeregowy Grzegorz Brzęczyszczykiewicz z Chrząszczyżewoszyc, powiat Łękołody.
  textQ(
    'Jak brzmi nazwisko Grzegorza z komedii „Jak rozpętałem drugą wojnę światową”, który podaje adres: Chrząszczyżewoszyce, powiat Łękołody?',
    ['Brzęczyszczykiewicz', 'Brzeczyszczykiewicz', 'Grzegorz Brzęczyszczykiewicz', 'Brzęczyszczykiewicza'],
    1500,
    40,
  ),
  single('Co znaczy powiedzenie „nie mój cyrk, nie moje małpy”?', ['To nie moja sprawa', 'Nie lubię zwierząt', 'Nie chodzę do cyrku', 'Mam dość pracy'], 0, 500, 25),
  // „Narobić bigosu” — narobić zamieszania, kłopotu.
  bool('Powiedzenie „narobić bigosu” znaczy tyle co narobić zamieszania.', true, 500, 25),
  // Najczęstsze nazwisko w Polsce to Nowak, drugie — Kowalski (PESEL).
  bool('Najczęstszym polskim nazwiskiem jest Kowalski.', false, 500, 25),
];

const CINEMA: Question[] = [
  clip('Kadr po kadrze: jak nazywa się ta komedia Juliusza Machulskiego o świecie bez mężczyzn?', 'fgSyYZtBeO0', 2, ['Seksmisja', 'Sexmisja', 'Seks misja', 'Sexmission', 'Seksmisji'], 1000),
  clip('Kadr po kadrze: jak nazywa się ta komedia kryminalna o taksówkarzu wziętym za płatnego zabójcę?', 'pCIQ2qq00r8', 10, ['Kiler', 'Killer', 'Kilera', 'Kiler (1997)'], 1000),
  // „Miś” (1980, Stanisław Bareja) — scena w szatni.
  single('Z którego filmu pochodzi zdanie „Nie mamy pańskiego płaszcza i co pan nam zrobi?”', ['Miś', 'Rejs', 'Kiler', 'Kogel-mogel'], 0, 1000, 30),
  // Kasię Solską zagrała Grażyna Błęcka-Kolska; Ewa Kasprzyk — Wolańska.
  single('Która aktorka zagrała Kasię Solską w „Kogel-moglu” (1988)?', ['Grażyna Błęcka-Kolska', 'Ewa Kasprzyk', 'Katarzyna Figura', 'Małgorzata Kożuchowska'], 0, 1000, 25),
  // Inżynier Mamoń: „Mnie się podobają melodie, które już raz słyszałem”.
  bluff(
    'Blef: inżynier Mamoń z „Rejsu” twierdzi, że podobają mu się tylko te melodie, które ___.',
    ['już raz słyszał', 'już słyszał', 'raz już słyszał', 'słyszał już wcześniej', 'już kiedyś słyszał', 'już zna'],
    ['nuci jego żona', 'grają w radiu', 'da się zagwizdać'],
    1000,
    60,
    40,
  ),
  // „Kogel-mogel” (1988): Kasia ucieka z domu do Warszawy przed ślubem z Pawłem, który zaplanowali rodzice.
  bluff(
    'Blef: w „Kogel-moglu” Kasia Solska ucieka ze wsi do Warszawy, bo rodzice chcą ją ___.',
    ['wydać za mąż', 'wydać za mąż za Pawła', 'wydać za mąż za sąsiada', 'wydać za mąż wbrew jej woli'],
    ['zapisać do zespołu ludowego', 'wysłać do ciotki w Kanadzie', 'zatrudnić na poczcie'],
    1000,
    60,
    40,
  ),
  // Rejs 1970, Miś 1981 (premiera 4 maja), Seksmisja 1984, Kiler 1997, Chłopaki nie płaczą 2000.
  order('Ułóż komedie według roku premiery', ['Rejs', 'Miś', 'Seksmisja', 'Kiler', 'Chłopaki nie płaczą'], 1000, 45, ['Najstarsza', 'Najnowsza']),
  // „Bareizm”, „jak u Barei” — o absurdach codzienności.
  textQ('Jak się nazywa reżyser „Misia”, od którego nazwiska mówi się „jak u …” o absurdach życia codziennego?', ['Bareja', 'Stanisław Bareja', 'Barei', 'Stanislaw Bareja'], 1000, 30),
  single('Jak ma na imię dobroduszny pies z polskiej kreskówki, który pomaga innym zwierzętom?', ['Reksio', 'Pankracy', 'Filuś', 'Burek'], 0, 500, 25),
  // „Bolek i Lolek” — Studio Filmów Rysunkowych w Bielsku-Białej, od 1963 r.
  single('Jak mieli na imię dwaj bracia z kreskówki z Bielska-Białej, którzy podróżowali po całym świecie?', ['Bolek i Lolek', 'Jacek i Placek', 'Tytus i Romek', 'Flip i Flap'], 0, 500, 25),
];

const HITS: Question[] = [
  melody('Melodia: jak nazywa się ten przebój zespołu Lady Pank?', '_ewr2o0PEzc', 35, ['Mniej niż zero', 'Mniej niz zero', 'Mniej niż 0'], 1000, 60),
  melody('Melodia: jak nazywa się ta piosenka zespołu Perfect z początku lat osiemdziesiątych?', '1n0MupX-7AM', 16, ['Autobiografia', 'Autobiografja'], 1000, 60),
  melody(
    'Melodia: jak nazywa się ten przebój Maanamu?',
    '2YA_zrmxLiQ',
    1,
    ['Kocham cię, kochanie moje', 'Kocham cię kochanie moje', 'Kocham cie kochanie moje', 'Kocham cię, kochanie', 'Kocham cie, kochanie moje'],
    1000,
    60,
  ),
  melody('Melodia: jak nazywa się ta piosenka zespołu Kult?', 'A8d3QBMWUgs', 43, ['Arahja', 'Arahia', 'Arachja', 'Arahija'], 1500, 60),
  melody('Melodia: jak nazywa się ten przebój sanah z 2020 roku?', 'S7sN-cFhwuk', 1, ['Szampan', 'Szampan sanah'], 1000, 60),
  melody('Melodia: jak nazywa się piosenka, z którą Edyta Górniak wystąpiła na Eurowizji 1994?', 'x9UVz4l4nlw', 5, ['To nie ja', 'To nie ja byłam Ewą', 'To nie ja!'], 1500, 60),
  // Eurowizja 1994 (Dublin): debiut Polski — 2. miejsce.
  single('Które miejsce zajęła Edyta Górniak na Eurowizji 1994, w debiucie Polski w tym konkursie?', ['Drugie', 'Pierwsze', 'Trzecie', 'Szóste'], 0, 1000, 25),
  yt(single('Posłuchaj: kto śpiewa ten przebój z 1967 roku?', ['Czesław Niemen', 'Krzysztof Krawczyk', 'Seweryn Krajewski', 'Marek Grechuta'], 0, 1000, 30), 'nlyWvOwg78A', 0, 20),
];

const TV: Question[] = [
  // Koło fortuny 1992, Familiada 1994, Milionerzy 1999, Taniec z gwiazdami 2005, Mam talent! 2008.
  order('Ułóż programy telewizyjne według roku pierwszej emisji', ['Koło fortuny', 'Familiada', 'Milionerzy', 'Taniec z gwiazdami', 'Mam talent!'], 1000, 45, ['Najwcześniej', 'Najpóźniej']),
  single('Kto prowadzi „Familiadę” od jej pierwszego odcinka w 1994 roku?', ['Karol Strasburger', 'Hubert Urbański', 'Robert Janowski', 'Krzysztof Ibisz'], 0, 500, 25),
  // „Świat według Kiepskich”: Ferdynand; Marian Paździoch, Waldemar Kiepski, Arnold Boczek.
  single('Jak ma na imię bezrobotny bohater „Świata według Kiepskich”, który całe dnie spędza w fotelu?', ['Ferdynand', 'Marian', 'Waldemar', 'Arnold'], 0, 500, 25),
  textQ('Jak nazywa się wieś, w której dzieje się serial „Ranczo”?', ['Wilkowyje', 'Wilkowyjach', 'Wilkowyj'], 1000, 30),
  wall(
    'Ściana skojarzeń: rozłóż szesnaście haseł na cztery grupy po cztery',
    [
      ['Polskie zespoły rockowe', ['Dżem', 'Republika', 'Budka Suflera', 'T.Love']],
      ['Bohaterowie bajek i komiksów', ['Koziołek Matołek', 'Pan Kleks', 'Plastuś', 'Tytus']],
      ['Dopływy Wisły', ['Narew', 'Pilica', 'San', 'Bzura']],
      ['Sery z Podhala', ['Bundz', 'Gołka', 'Redykołka', 'Bryndza']],
    ],
    3,
    1500,
    120,
  ),
  chain('Łańcuch skojarzeń: od morza do wakacji — każde słowo ciągnie za sobą następne', ['Morze', 'Plaża', 'Ręcznik', 'Słońce', 'Opalenizna', 'Wakacje'], 5, 1000, 60),
  spy('Szpieg przy stole 1: napisz jedno słowo-skojarzenie do wspólnego słowa', ['pierogi', 'pieróg', 'pierogów'], 'Potrawa, którą lepi się w domu', 500, 40),
  spy('Szpieg przy stole 2: krótkie skojarzenie, ale nie samo słowo', ['kiełbasa', 'kielbasa', 'kiełbaski'], 'Coś, co często ląduje na grillu', 1000, 40),
  drawing('Rysunek 1: co rysuje artysta?', ['żubr', 'zubr', 'żubra', 'żubry', 'zubry'], 500, 75),
  drawing('Rysunek 2: co rysuje artysta?', ['bocian', 'bociana', 'bociany', 'bocian biały'], 1000, 75),
];

/** „Milionerzy”: dwanaście szczebli, cztery odpowiedzi, coraz trudniej. */
const LADDER: Question[] = [
  single('Jak nazywa się smok, który według legendy mieszkał w jamie pod krakowskim zamkiem?', ['Smok Wawelski', 'Smok Pomorski', 'Smok Mazowiecki', 'Smok Bałtycki'], 0, 0, 30),
  single('Jaki kolor jest na górze polskiej flagi?', ['Biały', 'Czerwony', 'Niebieski', 'Zielony'], 0, 0, 30),
  single('W jakiej miejscowości stoi szpital z serialu „Na dobre i na złe”?', ['W Leśnej Górze', 'W Złotopolicach', 'W Grabowie', 'W Pcimiu'], 0, 0, 30),
  single('Która piosenkarka była wokalistką zespołu Maanam?', ['Kora', 'Kayah', 'Kasia Kowalska', 'Doda'], 0, 0, 30),
  single('Jak ma na imię mały kotek, który w polskiej kreskówce mieszka z kotem Bonifacym?', ['Filemon', 'Mruczek', 'Puszek', 'Garfield'], 0, 0, 30),
  single('W którym mieście gra klub piłkarski Lech?', ['W Poznaniu', 'W Krakowie', 'W Gdańsku', 'We Wrocławiu'], 0, 0, 30),
  single('Kto napisał „Akademię pana Kleksa”?', ['Jan Brzechwa', 'Julian Tuwim', 'Kornel Makuszyński', 'Maria Konopnicka'], 0, 0, 30),
  single('W którym roku Polska wstąpiła do Unii Europejskiej?', ['2004', '1999', '2007', '1989'], 0, 0, 30),
  // Piwnica Świdnicka we Wrocławiu — wzmiankowana od 1273 r.
  single('Która restauracja, działająca od XIII wieku, uchodzi za jedną z najstarszych w Europie?', ['Piwnica Świdnicka we Wrocławiu', 'Wierzynek w Krakowie', 'Pod Aniołami w Krakowie', 'Kurza Stopka w Warszawie'], 0, 0, 30),
  // Władysław III Warneńczyk zginął w bitwie pod Warną 10 listopada 1444 r.
  single('Który polski król zginął w 1444 roku w bitwie z Turkami pod Warną?', ['Władysław III', 'Kazimierz Jagiellończyk', 'Zygmunt Stary', 'Jan Olbracht'], 0, 0, 30),
  // Polska Stacja Antarktyczna im. Henryka Arctowskiego — Wyspa Króla Jerzego (od 1977 r.); Hornsund — Spitsbergen; Dobrowolskiego — Antarktyda Wschodnia.
  single('Jak nazywa się polska stacja polarna na Wyspie Króla Jerzego w Antarktyce?', ['Stacja im. Henryka Arctowskiego', 'Stacja Hornsund', 'Stacja im. Antoniego Dobrowolskiego', 'Stacja im. Mikołaja Kopernika'], 0, 0, 30),
  // Wojciech Fortuna, Sapporo 1972 — skoki narciarskie: pierwsze złoto zimowych igrzysk dla Polski.
  single('W jakiej dyscyplinie Polska zdobyła swój pierwszy złoty medal zimowych igrzysk olimpijskich (Sapporo 1972)?', ['W skokach narciarskich', 'W łyżwiarstwie szybkim', 'W biathlonie', 'W saneczkarstwie'], 0, 0, 30),
];

/** Błyskawica: ciekawostki i codzienność. */
const BLITZ: Question[] = [
  single('Co Polacy rozstawiają na plażach nad Bałtykiem, żeby osłonić się od wiatru?', ['Parawany', 'Kosze plażowe', 'Namioty', 'Altany'], 0, 300, 25),
  bool('Polski hymn zaczyna się od słów „Boże, coś Polskę”.', false, 300, 25),
  textQ('Co mówimy po polsku, gdy ktoś kichnie?', ['na zdrowie', 'nazdrowie', 'zdrowie', 'na zdrowko', 'na zdrówko'], 400, 25),
  numeric('W jakim wieku zostaje się w Polsce pełnoletnim?', 18, 0, 400, 25),
  // „Pszczółka Maja” — piosenka Zbigniewa Wodeckiego do serialu animowanego (1975).
  single('Jaki owad jest bohaterem bajki, do której piosenkę śpiewał Zbigniew Wodecki?', ['Pszczoła', 'Biedronka', 'Mrówka', 'Motyl'], 0, 500, 25),
  bool('Imieniny Anny wypadają 26 lipca.', true, 500, 25),
  single('Jaki samochód nazywano w Polsce „maluchem”?', ['Fiat 126p', 'Polonez', 'Syrena', 'Fiat 125p'], 0, 600, 25),
  textQ('Kto założył Wielką Orkiestrę Świątecznej Pomocy, która gra co roku w styczniu?', ['Jerzy Owsiak', 'Owsiak', 'Jurek Owsiak', 'Jerzy Owsiak (Jurek)'], 700, 25),
];

const TRUTH_FAKES = [
  'Raz zjadłem za jednym posiedzeniem trzydzieści pierogów.',
  'Jako dziecko wystąpiłam w „Jaka to melodia?”.',
  'Mam w domu kolekcję ponad stu kubków.',
  'Przepłynąłem wpław jezioro Śniardwy.',
  'Spotkałam kiedyś Adama Małysza na stacji benzynowej.',
];

// Junior Eurovision: 2018 Roksana Węgiel („Anyone I Want to Be”), 2019 Viki Gabor („Superhero”).
const FINAL: Question = single('Kto jako pierwszy wygrał dla Polski Eurowizję Junior (2018)?', ['Roksana Węgiel', 'Viki Gabor', 'Sara James', 'Laura Bączkiewicz'], 0, 0, 40);

/** Quiz `pl-fun` (bez zdjęć: tylko nagrania i zwiastuny z YouTube). */
export const plFunQuiz = (): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `plf-${theme}-${++k}` });

  return {
    title: 'Polska na wesoło: kino, muzyka, telewizja i język',
    description: 'Kultowe komedie, przeboje, telewizja i łamańce językowe — z kadrami filmów, melodiami i „Milionerami”.',
    settings: settings({ shake: 150, fog: 200, freeze: 300, mirror: 250, guests: 150, mud: 200, flip: 250, torch: 250, sticky: 150, noclock: 250, bubbles: 150 }),
    rounds: [
      {
        id: 'plf-warmup',
        type: 'classic',
        title: 'Rozgrzewka: polszczyzna na wesoło',
        description:
          'Dziesięć pytań o języku polskim: łamańce, alfabet, gwary, zdrobnienia i powiedzonka. Będą pytania z jedną i z kilkoma odpowiedziami, prawda czy fałsz, pary i sortowanie. Za szybkie dobre odpowiedzi jest bonus, a za częściowo dobre pary i sortowanie — połowa punktów.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: WARMUP.map(tag('warm')),
      },
      {
        id: 'plf-cinema',
        type: 'classic',
        title: 'Kino: kultowe komedie',
        description:
          'Polskie komedie i kreskówki. Kadry filmów odsłaniają się kawałkami po 1, 2, 4, 8 i 16 sekund — im wcześniej zgadniesz tytuł, tym więcej punktów. W blefie najpierw dopisujesz zmyśloną odpowiedź, która ma zmylić innych, a potem szukasz prawdy. Za częściowo dobrą kolejność — połowa punktów.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: CINEMA.map(tag('cinema')),
      },
      {
        id: 'plf-hits',
        type: 'classic',
        title: 'Przeboje: śpiewamy po polsku',
        description:
          'Polskie przeboje od lat sześćdziesiątych po dziś. Melodia odsłania się kawałkami po 1, 2, 4, 8 i 16 sekund — wpisz tytuł jak najwcześniej, a dostaniesz więcej punktów. Na koniec pytanie o Eurowizję i o wykonawcę.',
        speedBonus: false,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        questions: HITS.map(tag('hits')),
      },
      {
        id: 'plf-tv',
        type: 'classic',
        title: 'Telewizja i zabawy',
        description:
          'Najpierw telewizja: teleturnieje, seriale i ściana skojarzeń. Potem łańcuch słów, w którym każde słowo ciągnie za sobą następne. Dalej „Szpieg”: wszyscy widzą jedno słowo, a szpieg nie — napisz skojarzenie i głosuj, kto jest szpiegiem. Na koniec rysunek: jedna osoba rysuje, reszta zgaduje.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: TV.map(tag('tv')),
      },
      {
        id: 'plf-ladder',
        type: 'ladder',
        title: 'Milionerzy',
        description:
          'Uczestnika wybiera los. Dwanaście szczebli od 100 do 10 000, na każdym cztery odpowiedzi — im wyżej, tym trudniej. Szczeble 750 i 3500 są gwarantowane, a z pomocą przychodzą koła ratunkowe: „50 na 50” i pytanie do publiczności.',
        shuffleOptions: true,
        pick: 'random',
        timer: true,
        levels: [100, 200, 300, 500, 750, 1000, 1500, 2500, 3500, 5000, 7500, 10000],
        safe: [4, 8],
        lifelines: ['fifty', 'audience'],
        questions: LADDER.map(tag('ladder')),
      },
      {
        id: 'plf-truth',
        type: 'truth',
        title: 'Prawda o graczu',
        description:
          'W poczekalni każdy wpisał o sobie mało znany fakt, a prowadzący dorzucił kilka zmyśleń. Zgadnij, kto z graczy to napisał — albo że to zmyślenie. Punkty dostają ci, którzy zgadli, a autor — za każdego, kogo jego fakt wyprowadził w pole.',
        points: 500,
        timeLimit: 30,
        fakes: TRUTH_FAKES,
      },
      {
        id: 'plf-blitz',
        type: 'blitz',
        title: 'Błyskawica: polska codzienność',
        description:
          'Osiem szybkich pytań o codziennym życiu w Polsce. Kto pierwszy wciśnie „Odpowiadam”, ten odpowiada: ma 15 sekund i jedną próbę. Błędna odpowiedź oddaje pytanie pozostałym.',
        shuffleOptions: true,
        answerWindow: 15,
        attempts: 1,
        check: 'auto',
        rules: { ...DEFAULT_RULES, partial: null },
        questions: BLITZ.map(tag('blitz')),
      },
      {
        id: 'plf-final',
        type: 'final',
        title: 'Finał: mała wielka scena',
        description: 'Ostatnie pytanie dla wszystkich. Najpierw w tajemnicy stawiasz część punktów, potem odpowiadasz: dobrze — stawka się dodaje, źle — odejmuje.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [tag('final')(FINAL)],
      },
    ],
  };
};
