/**
 * „Wielka gra o Polsce” (sid `pl-big`), część druga: kultura (muzyka, film, blef, ściana), aukcja „Sławni Polacy”,
 * „Przetrwanie” z literaturą, łamigłówki, zakłady z historią świata, quest „Szyfr” i finał.
 * Nagrania sprawdzone 2026-11-22: oEmbed 200 (tytuł i kanał w komentarzu); fragmenty zaczynają się od samej muzyki.
 * Kadry zwiastunów sprawdzone w storyboardzie YouTube (klatka co 1 s): od startu do start + 16 s nie ma tytułu filmu.
 */
import type { Question } from '@quiz/shared';
import { bluff, bool, clip, cut, match, melody, memory, multi, numeric, order, reveal, single, slider, sudoku, textQ, wall, yt, jigsaw, type Photos } from './kit';

/** Klucz → plik z Wikimedia Commons (obrazy — domena publiczna). */
export const PL_BIG_PHOTOS: Record<string, string> = {
  chopin: 'File:Frédéric Chopin by Bisson, 1849.png',
  szymborska: 'File:Wisława Szymborska čte - Svět knihy 2010 (002).JPG',
  matejko: 'File:Jan Matejko - Stańczyk - Google Art Project.jpg',
  chelmonski: 'File:Józef Chełmoński - Indian summer - Google Art Project.jpg',
  malczewski: 'File:Malczewski Jacek Melancholia.jpg',
  wyspianski: 'File:Wyspiański - Dzieła malarskie - Macierzyństwo 1905 kolor.jpg',
  boznanska: 'File:Olga Boznańska - Girl with Chrysanthemums - MNK II-b-1032 - National Museum Kraków.jpg',
  podkowinski: 'File:Podkowiński-Szał uniesień-MNK.jpg',
  gierymski: 'File:Aleksander Gierymski - Jewish woman selling oranges - Google Art Project.jpg',
  mehoffer: 'File:Józef Mehoffer - Dziwny ogród.jpg',
  hold: 'File:Prussian Homage.jpg',
};

/** Identyfikatory YouTube → sekunda startu (sprawdzone oEmbed 2026-11-22). */
export const PL_BIG_MEDIA: Record<string, number> = {
  P8BT_qwenJs: 0, // Arthur Rubinstein - Topic: „Waltzes, Op. 64: No. 1 in D-Flat Major "Minute"”, 1:51 — fortepian od pierwszej sekundy.
  'q0-svpeM-c0': 0, // Arthur Rubinstein - Topic: „Nocturnes, Op. 9: No. 2 in E-flat Major”, 4:23 — melodia od pierwszego taktu.
  i_vrlpWB4Vo: 9, // Music Box Films: „Ida - Official Trailer”, 1:57 — 0–8 s plansza MPAA i logo; od 9 s klasztor, Anna, napisy bez tytułu.
  '1biE4cOrDPE': 10, // NEXTFILMPL: „Oficjalny zwiastun filmu BOGOWIE”, 1:56 — 8–9 s logo NEXT FILM; od 10 s korytarz, narada, brak tytułu do 26 s.
};

export const CULTURE = (photos: Photos): Question[] => [
  melody('Melodia: jak potocznie nazywa się ten utwór Fryderyka Chopina?', 'P8BT_qwenJs', 0, ['Walc minutowy', 'Minutowy', 'Walc Des-dur', 'Minute Waltz', 'Walc op. 64 nr 1', 'Walc Des-dur op. 64 nr 1', 'Walc minutowy Chopina', 'Walc „Minutowy”', 'Walc pieska', 'Walc szczenięcy'], 1500, 60),
  yt(single('Posłuchaj: który to utwór Chopina?', ['Nokturn Es-dur op. 9 nr 2', 'Polonez As-dur „Heroiczny”', 'Marsz żałobny', 'Kołysanka Des-dur'], 0, 1000, 30), 'q0-svpeM-c0', 0, 20),
  reveal(textQ('Kim jest poetka na tym zdjęciu?', ['Wisława Szymborska', 'Szymborska', 'Wislawa Szymborska', 'Szymborską'], 1500, 30), photos('szymborska')),
  // Ida (2013) — Oscar dla najlepszego filmu nieanglojęzycznego, gala 22 lutego 2015 r.
  clip('Kadr po kadrze: jak nazywa się czarno-biały film Pawła Pawlikowskiego, który w 2015 roku zdobył Oscara dla najlepszego filmu nieanglojęzycznego?', 'i_vrlpWB4Vo', 9, ['Ida'], 1000),
  // Bogowie (2014, reż. Łukasz Palkowski) — Tomasz Kot jako Zbigniew Religa.
  clip('Kadr po kadrze: jak nazywa się film z 2014 roku o kardiochirurgu Zbigniewie Relidze?', '1biE4cOrDPE', 10, ['Bogowie', 'Bogów', 'Bogowie (2014)'], 1000),
  // Szymborska pisała limeryki (m.in. w „Rymowankach dla dużych dzieci”) i robiła wyklejanki-kolaże.
  bluff(
    'Blef: Wisława Szymborska z zamiłowaniem pisała żartobliwe ___ i rozsyłała przyjaciołom kartki-wyklejanki.',
    ['limeryki', 'limeryk', 'limeryków', 'limeryki o ludziach'],
    ['sonety o kotach', 'haiku', 'palindromy'],
    1000,
    60,
    40,
  ),
  // Serce Chopina spoczywa w filarze kościoła Świętego Krzyża na Krakowskim Przedmieściu.
  bluff(
    'Blef: Chopin wyjechał z kraju w 1830 roku i już nie wrócił. Jego serce, zgodnie z życzeniem, przewieziono do Warszawy i umieszczono w ___.',
    ['kościele Świętego Krzyża', 'kościół Świętego Krzyża', 'kościele św. Krzyża', 'kościele Swietego Krzyza', 'Świętego Krzyża', 'filarze kościoła Świętego Krzyża'],
    ['katedrze Świętego Jana', 'Zamku Królewskim', 'Pałacu na Wyspie'],
    1000,
    60,
    40,
  ),
  wall(
    'Ściana skojarzeń: rozłóż szesnaście tytułów na cztery grupy po cztery',
    [
      ['Powieści Sienkiewicza', ['Krzyżacy', 'Potop', 'Rodzina Połanieckich', 'Bez dogmatu']],
      ['Filmy Andrzeja Wajdy', ['Ziemia obiecana', 'Wesele', 'Panny z Wilka', 'Tatarak']],
      ['Utwory Mickiewicza', ['Konrad Wallenrod', 'Grażyna', 'Świtezianka', 'Ballady i romanse']],
      ['Utwory Kochanowskiego', ['Treny', 'Fraszki', 'Pieśni', 'Psałterz Dawidów']],
    ],
    3,
    1500,
    120,
  ),
  // Nóż w wodzie 1962, Rękopis znaleziony w Saragossie 1965, Kingsajz 1987, Pianista 2002, Boże Ciało 2019.
  order('Ułóż polskie filmy według roku premiery', ['Nóż w wodzie', 'Rękopis znaleziony w Saragossie', 'Kingsajz', 'Pianista', 'Boże Ciało'], 1000, 50, ['Najstarszy', 'Najnowszy']),
  // „Pianista” — Złota Palma w Cannes (2002) i Oscar za reżyserię (2003).
  textQ('Który reżyser za „Pianistę” dostał Złotą Palmę w Cannes i Oscara za reżyserię?', ['Roman Polański', 'Polański', 'Polanski', 'Roman Polanski'], 1000, 30),
];

/** Aukcja: przed licytacją widać tylko pierwsze słowa (betsCut). */
export const AUCTION: Question[] = [
  // Jan A.P. Kaczmarek — Oscar za muzykę do „Marzyciela” (Finding Neverland), 2005.
  cut(bool('Muzyka filmowa: Jan A.P. Kaczmarek dostał Oscara za muzykę do filmu „Marzyciel”.', true, 0, 30), 2),
  // Pola Negri (Apolonia Chałupiec), ur. 1897 w Lipnie — gwiazda Hollywood lat 20.
  cut(textQ('Gwiazda Hollywood: jak nazywała się urodzona w Lipnie aktorka, gwiazda kina niemego lat dwudziestych?', ['Pola Negri', 'Negri', 'Apolonia Chałupiec', 'Pola Negri (Apolonia Chałupiec)'], 0, 35), 2),
  // Karol Wojtyła — wybrany 16 października 1978 r.
  cut(single('Papież Polak: w którym roku Karol Wojtyła został wybrany na papieża?', ['1978', '1965', '1981', '1989'], 0, 0, 30), 2),
  // Ignacy Domeyko — geolog i mineralog w Chile; jego imię noszą Cordillera Domeyko i minerał domeykit.
  cut(single('Bohater Chile: kim z zawodu był Ignacy Domeyko, którego imię nosi pasmo górskie w Andach i minerał?', ['Geologiem i mineralogiem', 'Malarzem', 'Generałem', 'Kompozytorem'], 0, 0, 30), 2),
  // Otylia Jędrzejczak — złoto na 200 m stylem motylkowym, Ateny 2004.
  cut(single('Pływanie: na jakim dystansie stylem motylkowym Otylia Jędrzejczak zdobyła złoto olimpijskie w Atenach (2004)?', ['200 m', '100 m', '50 m', '400 m'], 0, 0, 30), 1),
  // Robert Korzeniowski — chód sportowy: 50 km (1996, 2000, 2004) i 20 km (2000).
  cut(single('Czterokrotny mistrz olimpijski: w jakiej konkurencji Robert Korzeniowski zdobył cztery złote medale?', ['W chodzie sportowym', 'W maratonie', 'W biegu na 10 000 m', 'W pięcioboju nowoczesnym'], 0, 0, 30), 3),
  // „Księgi Jakubowe” (2014) — o Jakubie Franku i frankistach.
  cut(single('Noblistka 2018: o kim opowiadają „Księgi Jakubowe” Olgi Tokarczuk?', ['O Jakubie Franku i jego wyznawcach', 'O apostole Jakubie', 'O Jakubie Szeli', 'O Jakubie Wędrowyczu'], 0, 0, 35), 2),
  // Kazimierz Prószyński — aeroskop (1909), pierwsza ręczna kamera filmowa.
  cut(single('Pionier kina: co skonstruował Kazimierz Prószyński?', ['Aeroskop — ręczną kamerę filmową', 'Pierwszy telewizor', 'Fonograf', 'Gramofon płytowy'], 0, 0, 30), 2),
];

/** „Przetrwanie”: literatura polska. */
export const SURVIVAL: Question[] = [
  // Akcja „Lalki” toczy się w Warszawie (1878–1879).
  bool('Akcja „Lalki” Bolesława Prusa toczy się głównie w Krakowie.', false, 300, 25),
  // „Mazurek Dąbrowskiego” — słowa Józefa Wybickiego, 1797, Reggio nell’Emilia.
  single('Kto napisał słowa „Mazurka Dąbrowskiego”?', ['Józef Wybicki', 'Jan Henryk Dąbrowski', 'Ignacy Krasicki', 'Adam Mickiewicz'], 0, 400, 25),
  textQ('Jak miała na imię córka Jana Kochanowskiego, po której śmierci powstały „Treny”?', ['Urszula', 'Urszulka', 'Orszula', 'Orszulka', 'Urszuli'], 400, 30),
  // „Chłopi”: Jesień, Zima, Wiosna, Lato.
  numeric('Z ilu tomów, nazwanych od pór roku, składają się „Chłopi” Władysława Reymonta?', 4, 0, 500, 25),
  textQ('Jak ma na imię chłopiec, bohater „W pustyni i w puszczy”, który opiekuje się małą Nel?', ['Staś', 'Stas', 'Stanisław', 'Staś Tarkowski', 'Stanisław Tarkowski', 'Stasiu'], 500, 30),
  // Krasicki — biskup warmiński, potem arcybiskup gnieźnieński; „Bajki i przypowieści”.
  bool('Ignacy Krasicki, autor bajek i satyr, był biskupem.', true, 500, 25),
  // Jacek Soplica — „Pan Tadeusz”; Kmicic — „Potop”; Zagłoba i Wołodyjowski — Trylogia.
  single('Która postać pochodzi z „Pana Tadeusza”?', ['Jacek Soplica', 'Andrzej Kmicic', 'Jan Zagłoba', 'Michał Wołodyjowski'], 0, 600, 25),
  // Adam Mickiewicz urodził się 24 grudnia 1798 r.
  slider('W którym roku urodził się Adam Mickiewicz?', { min: 1750, max: 1850 }, 1798, { tolerance: 1, zeroBeyond: 15 }, 600, 30),
  textQ('W której komedii Aleksandra Fredry Cześnik Raptusiewicz kłóci się z Rejentem Milczkiem o mur graniczny?', ['Zemsta', 'Zemście', 'Zemsta za mur graniczny'], 700, 30),
  single('Kto napisał „Ferdydurke”?', ['Witold Gombrowicz', 'Bruno Schulz', 'Stanisław Ignacy Witkiewicz', 'Sławomir Mrożek'], 0, 800, 25),
];

/** Łamigłówki: „Pamięć” z obrazami i ich autorami, układanka z „Hołdem pruskim” i trudne sudoku. */
export const PUZZLES = (photos: Photos): Question[] => [
  // Stańczyk — Matejko; Babie lato — Chełmoński; Melancholia — Malczewski; Macierzyństwo — Wyspiański; Dziewczynka z chryzantemami — Boznańska;
  // Szał uniesień — Podkowiński; Żydówka z pomarańczami — A. Gierymski; Dziwny ogród — Mehoffer.
  memory(
    'Pamięć: połącz obraz z jego autorem',
    '4x4',
    [
      [{ image: photos('matejko') }, { text: 'Jan Matejko' }],
      [{ image: photos('chelmonski') }, { text: 'Józef Chełmoński' }],
      [{ image: photos('malczewski') }, { text: 'Jacek Malczewski' }],
      [{ image: photos('wyspianski') }, { text: 'Stanisław Wyspiański' }],
      [{ image: photos('boznanska') }, { text: 'Olga Boznańska' }],
      [{ image: photos('podkowinski') }, { text: 'Władysław Podkowiński' }],
      [{ image: photos('gierymski') }, { text: 'Aleksander Gierymski' }],
      [{ image: photos('mehoffer') }, { text: 'Józef Mehoffer' }],
    ],
    1000,
    150,
    29,
  ),
  jigsaw('Ułóż układankę: „Hołd pruski” Jana Matejki', photos('hold'), '16:9', 16, 1000, 180, true, 13),
  sudoku('Sudoku 6×6 dla wytrwałych: w każdym wierszu, kolumnie i prostokącie 2×3 cyfry od 1 do 6, każda raz.', 4242, 'hard', 1000, 300),
];

/** Zakłady: trochę historii świata (i Polski w świecie). Przed zakładem widać tylko pierwsze słowa. */
export const BETS: Question[] = [
  // Vasco da Gama — Kalikat, maj 1498.
  cut(single('Wielkie odkrycia: kto jako pierwszy dopłynął morzem z Europy do Indii (1498)?', ['Vasco da Gama', 'Krzysztof Kolumb', 'Ferdynand Magellan', 'Bartolomeu Dias'], 0, 0, 30), 2),
  // Kopernik: studia w Bolonii i Padwie, doktorat z prawa kanonicznego w Ferrarze (1503).
  cut(single('Renesans: na którym uniwersytecie Mikołaj Kopernik uzyskał w 1503 roku doktorat z prawa kanonicznego?', ['W Ferrarze', 'W Bolonii', 'W Padwie', 'W Rzymie'], 0, 0, 30), 1),
  // Odsiecz wiedeńska 1683 — przeciw armii Imperium Osmańskiego pod wodzą Kara Mustafy.
  cut(single('Odsiecz wiedeńska: z czyją armią walczył Jan III Sobieski pod Wiedniem w 1683 roku?', ['Imperium Osmańskiego', 'Szwecji', 'Francji', 'Prus'], 0, 0, 30), 2),
  // Konstytucja 3 maja — 3 V 1791; pierwsza konstytucja Francji — 3 IX 1791.
  cut(bool('Rewolucja francuska: Konstytucja 3 maja została uchwalona wcześniej niż pierwsza konstytucja Francji.', true, 0, 30), 2),
  // Według tradycji (Warron) Rzym założono 21 kwietnia 753 r. p.n.e.
  cut(numeric('Starożytność: w którym roku przed naszą erą według tradycji założono Rzym?', 753, 0, 0, 30), 1),
  // Traktat wersalski — 28 czerwca 1919 r., Sala Lustrzana pałacu w Wersalu.
  cut(single('Po I wojnie światowej: gdzie podpisano w 1919 roku traktat pokojowy z Niemcami?', ['W Wersalu', 'W Londynie', 'W Wiedniu', 'W Genewie'], 0, 0, 30), 4),
];

/** Quest „Szyfr”: odpowiedź na zagadkę to kod z sześciu liter; dobre odpowiedzi o Warszawie odsłaniają litery. */
export const QUEST = {
  // Marian Rejewski, Jerzy Różycki, Henryk Zygalski — absolwenci Uniwersytetu Poznańskiego, od 1932 r. w Biurze Szyfrów w Warszawie.
  prompt:
    'Zagadka-szyfr: w latach trzydziestych trzej matematycy z Poznania czytali w Warszawie moje tajne wiadomości, choć Niemcy byli pewni, że jestem nie do złamania. Kim jestem? Odpowiedź ma sześć liter.',
  code: 'ENIGMA',
  questions: [
    single('Warszawa: w którym parku stoi Pałac na Wyspie?', ['W Łazienkach Królewskich', 'W Ogrodzie Saskim', 'W Parku Skaryszewskim', 'Na Polu Mokotowskim'], 0, 500, 25),
    // Syrenka warszawska trzyma miecz i tarczę.
    bool('Warszawa: Syrenka z herbu stolicy trzyma w dłoniach łuk i strzały.', false, 500, 25),
    // Stare Miasto w Warszawie — UNESCO 1980, jako przykład niemal całkowitej odbudowy.
    textQ('Warszawa: jak nazywa się odbudowana po wojnie dzielnica, wpisana w 1980 roku na listę UNESCO?', ['Stare Miasto', 'Starówka', 'Starowka', 'Stare Miasto w Warszawie', 'Starego Miasta'], 600, 30),
    // Barbakan 1548, Kolumna Zygmunta 1644, pałac w Wilanowie 1677–1696, Teatr Wielki 1833, Stadion Narodowy 2011.
    order('Warszawa: ułóż budowle od najstarszej', ['Barbakan', 'Kolumna Zygmunta', 'Pałac w Wilanowie', 'Teatr Wielki', 'Stadion Narodowy'], 700, 45, ['Najstarsza', 'Najnowsza']),
    // E. Wedel — od 1851 r.; Wawel — marka z Krakowa; Blikle — cukiernia; Goplana — Poznań.
    single('Warszawa: jak nazywa się słynna warszawska firma czekoladowa założona w 1851 roku?', ['E. Wedel', 'Blikle', 'Wawel', 'Goplana'], 0, 700, 25),
    // Pierwszy odcinek metra (Kabaty — Politechnika) otwarto 7 kwietnia 1995 r.
    slider('Warszawa: w którym roku otwarto pierwszą linię metra?', { min: 1950, max: 2020 }, 1995, { tolerance: 1, zeroBeyond: 10 }, 800, 30),
    single('Warszawa: którą ulicą zaczyna się Trakt Królewski przy Zamku Królewskim?', ['Krakowskim Przedmieściem', 'Nowym Światem', 'Marszałkowską', 'Alejami Jerozolimskimi'], 0, 900, 25),
    // W Warszawie urodzili się Skłodowska-Curie (1867) i Baczyński (1921); Chopin — Żelazowa Wola, Kopernik — Toruń, Lem — Lwów, Gombrowicz — Małoszyce.
    multi(
      'Warszawa: które z tych osób urodziły się w stolicy?',
      ['Maria Skłodowska-Curie', 'Fryderyk Chopin', 'Mikołaj Kopernik', 'Krzysztof Kamil Baczyński', 'Stanisław Lem', 'Witold Gombrowicz'],
      [0, 3],
      1000,
      40,
    ),
  ] as Question[],
};

// Jan Szczepanik i Kazimierz Żegleń — kamizelka kuloodporna z jedwabiu (1897–1901).
export const FINAL: Question = single(
  'Który polski wynalazca jest współtwórcą kamizelki kuloodpornej z końca XIX wieku?',
  ['Jan Szczepanik', 'Ignacy Łukasiewicz', 'Stefan Drzewiecki', 'Kazimierz Prószyński'],
  0,
  0,
  40,
);
