/**
 * „Wielka gra o Polsce” (sid `pl-big`), część pierwsza: rozgrzewka, plansza „Dzieje Polski” (6 × 5) i runda o nauce.
 * Rozwiązania i źródła — w komentarzach. Bez rozbiorów, powstań i drugiej połowy XX wieku (przepis właściciela: nic, co wiąże się z rosją).
 */
import type { Question } from '@quiz/shared';
import { bool, cell, clues, match, multi, numeric, order, reveal, single, slider, sort, textQ, type Photos, type Slot } from './kit';

export const WARMUP = (photos: Photos): Question[] => [
  single('Który władca przyjął chrzest w 966 roku?', ['Mieszko I', 'Bolesław Chrobry', 'Przemysł II', 'Władysław Łokietek'], 0, 500, 25),
  // Jadwiga Andegaweńska urodziła się w Budzie (1373 lub 1374), córka Ludwika Węgierskiego.
  bool('Królowa Jadwiga urodziła się w Krakowie.', false, 500, 25),
  // Nobel literacki: Sienkiewicz 1905, Reymont 1924, Szymborska 1996, Tokarczuk 2018 (oraz Miłosz 1980 — nie ma go wśród opcji).
  multi(
    'Które z tych osób dostały Literacką Nagrodę Nobla?',
    ['Henryk Sienkiewicz', 'Władysław Reymont', 'Wisława Szymborska', 'Olga Tokarczuk', 'Stanisław Lem', 'Bolesław Prus'],
    [0, 1, 2, 3],
    1000,
    40,
  ),
  // 1025, 1525, 1683, 1791, 1918.
  order(
    'Ułóż wydarzenia od najdawniejszego',
    ['Koronacja Bolesława Chrobrego', 'Hołd pruski', 'Odsiecz wiedeńska', 'Uchwalenie Konstytucji 3 maja', 'Odzyskanie niepodległości'],
    1000,
    50,
    ['Najdawniej', 'Najpóźniej'],
  ),
  // Zygmunt III Waza — przeniesienie dworu do Warszawy (od 1596 r.); Sobieski — pałac w Wilanowie; Poniatowski — obiady czwartkowe;
  // Zygmunt I Stary — dzwon „Zygmunt” na Wawelu (1520).
  match(
    'Połącz króla z tym, z czego jest znany',
    [
      ['Zygmunt III Waza', 'Przeniósł dwór do Warszawy'],
      ['Jan III Sobieski', 'Pałac w Wilanowie'],
      ['Stanisław August Poniatowski', 'Obiady czwartkowe'],
      ['Zygmunt I Stary', 'Dzwon „Zygmunt” na Wawelu'],
    ],
    1000,
    45,
  ),
  sort(
    'Pisarz czy kompozytor? Rozdziel nazwiska',
    ['Pisarz', 'Kompozytor'],
    [
      ['Bolesław Prus', 0],
      ['Eliza Orzeszkowa', 0],
      ['Stefan Żeromski', 0],
      ['Maria Konopnicka', 0],
      ['Juliusz Słowacki', 0],
      ['Stanisław Moniuszko', 1],
      ['Karol Szymanowski', 1],
      ['Krzysztof Penderecki', 1],
      ['Henryk Mikołaj Górecki', 1],
      ['Witold Lutosławski', 1],
    ],
    100,
    50,
  ),
  // Dagerotyp Louisa-Auguste'a Bissona, Paryż 1849.
  reveal(single('Kto jest na tej fotografii z 1849 roku?', ['Fryderyk Chopin', 'Stanisław Moniuszko', 'Ignacy Jan Paderewski', 'Karol Szymanowski'], 0, 1000, 30), photos('chopin')),
  // Chopin urodził się w Żelazowej Woli 1 marca (lub 22 lutego) 1810 r.
  slider('W którym roku urodził się Fryderyk Chopin?', { min: 1700, max: 1900 }, 1810, { tolerance: 2, zeroBeyond: 20 }, 1500, 30),
  numeric('Z ilu ksiąg składa się „Pan Tadeusz” Adama Mickiewicza?', 12, 0, 1000, 25),
  // Irena Sendlerowa: ur. 1910 w Warszawie, „Żegota” (referat dziecięcy), ok. 2500 dzieci z getta, listy imion w słoikach zakopanych w ogrodzie.
  clues(
    'Kim jestem? Zgadnij po podpowiedziach',
    [
      'Urodziłam się w Warszawie w 1910 roku i pracowałam w opiece społecznej.',
      'W czasie wojny kierowałam referatem dziecięcym Rady Pomocy Żydom „Żegota”.',
      'Imiona uratowanych dzieci spisałam i zakopałam w słoikach w ogrodzie.',
      'Wyprowadziłam z warszawskiego getta około 2500 żydowskich dzieci.',
    ],
    ['Irena Sendlerowa', 'Sendlerowa', 'Irena Sendler', 'Sendler', 'Irena Sendlerowej'],
    8,
    1500,
    40,
  ),
  textQ('Jak nazywa się powieść Bolesława Prusa o młodym władcy starożytnego Egiptu, Ramzesie XIII?', ['Faraon', 'Faraonie', 'Faraona'], 1000, 30),
  // Maria Kazimiera d'Arquien — „Marysieńka”, adresatka listów Jana III Sobieskiego.
  textQ(
    'Do kogo Jan III Sobieski pisał słynne listy miłosne? Podaj imię lub zdrobnienie, którym ją nazywał',
    ['Marysieńka', 'Marysienka', 'Maria Kazimiera', 'Maria Kazimiera Sobieska', "Maria Kazimiera d'Arquien", 'Marysieńki', 'Maria'],
    1000,
    30,
  ),
];

/** Plansza „Dzieje Polski”: sześć kategorii po pięć pól, ceny 100…500 według trudności. */
export const BOARD: Record<'piast' | 'jagiellon' | 'century' | 'science' | 'books' | 'arts', Slot> = {
  piast: [
    // Legenda o Lechu, Czechu i Rusie: Lech osiadł tam, gdzie ujrzał orła w gnieździe (stąd Gniezno i biały orzeł w herbie).
    cell(bool('Według legendy Lech założył gród tam, gdzie ujrzał białego orła w gnieździe.', true, 100, 25)),
    // Koronacja Bolesława Chrobrego (1025) — najpewniej w katedrze gnieźnieńskiej.
    cell(single('W katedrze w którym mieście koronowano w 1025 roku Bolesława Chrobrego?', ['W Gnieźnie', 'W Krakowie', 'W Płocku', 'We Wrocławiu'], 0, 200, 25)),
    // Zjazd gnieźnieński — 1000 r., Bolesław Chrobry i cesarz Otton III.
    cell(single('Który władca spotkał się w 1000 roku z cesarzem Ottonem III na zjeździe gnieźnieńskim?', ['Bolesław Chrobry', 'Mieszko I', 'Kazimierz Odnowiciel', 'Bolesław Śmiały'], 0, 300, 25)),
    cell(textQ('O którym królu mówi się, że „zastał Polskę drewnianą, a zostawił murowaną”?', ['Kazimierz Wielki', 'Kazimierz III Wielki', 'Kazimierz III', 'Kazimierza Wielkiego', 'Kazimierzu Wielkim'], 400, 30)),
    // Testament Bolesława Krzywoustego (1138) — początek rozbicia dzielnicowego.
    cell(single('Który władca testamentem z 1138 roku podzielił kraj między synów, zaczynając rozbicie dzielnicowe?', ['Bolesław Krzywousty', 'Bolesław Śmiały', 'Władysław Herman', 'Mieszko II'], 0, 500, 25)),
  ],
  jagiellon: [
    cell(single('Na którym zamku w Krakowie mieszkali polscy królowie?', ['Na Wawelu', 'W Niepołomicach', 'W Wiśniczu', 'W Pieskowej Skale'], 0, 100, 25)),
    // Bona Sforza — z Mediolanu i Bari, czyli z Włoch.
    cell(bool('Królowa Bona, żona Zygmunta Starego, pochodziła z Hiszpanii.', false, 200, 25)),
    cell(single('Jak nazywała się zasada, dzięki której jeden poseł mógł zerwać obrady sejmu?', ['Liberum veto', 'Wolna elekcja', 'Neminem captivabimus', 'Pacta conventa'], 0, 300, 25)),
    cell(textQ('Jak nazywała się słynna polska ciężka jazda, której żołnierze nosili na plecach skrzydła?', ['husaria', 'husarze', 'husarz', 'husarii', 'husaria skrzydlata'], 400, 30)),
    // Henryk Walezy — wybrany w 1573 r. w pierwszej wolnej elekcji.
    cell(single('Kto został pierwszym królem wybranym w wolnej elekcji (1573)?', ['Henryk Walezy', 'Stefan Batory', 'Zygmunt III Waza', 'Anna Jagiellonka'], 0, 500, 25)),
  ],
  century: [
    cell(single('Którego dnia obchodzimy Narodowe Święto Niepodległości?', ['11 listopada', '3 maja', '15 sierpnia', '1 września'], 0, 100, 25)),
    // Westerplatte broniło się 1–7 września 1939 r.; Hel — do 2 października.
    cell(single('Która placówka w Gdańsku broniła się przez siedem dni we wrześniu 1939 roku?', ['Westerplatte', 'Hel', 'Oksywie', 'Poczta Polska'], 0, 200, 25)),
    // Dywizjon 303 im. Tadeusza Kościuszki — najwięcej zestrzeleń wśród jednostek RAF w bitwie o Anglię.
    cell(single('Jak nazywał się polski dywizjon myśliwski, najskuteczniejszy w bitwie o Anglię?', ['Dywizjon 303', 'Dywizjon 302', 'Dywizjon 307', 'Dywizjon 315'], 0, 300, 25)),
    // Eugeniusz Kwiatkowski — minister przemysłu i handlu (budowa portu w Gdyni), potem skarbu (Centralny Okręg Przemysłowy, od 1936 r.).
    cell(single('Który minister jest nazywany ojcem budowy portu w Gdyni i Centralnego Okręgu Przemysłowego?', ['Eugeniusz Kwiatkowski', 'Władysław Grabski', 'Ignacy Mościcki', 'Stanisław Wojciechowski'], 0, 400, 25)),
    // Gabriel Narutowicz — wybrany 9 grudnia 1922 r., zastrzelony 16 grudnia w Zachęcie.
    cell(single('Jak nazywał się pierwszy prezydent Polski, zastrzelony w 1922 roku kilka dni po wyborze?', ['Gabriel Narutowicz', 'Stanisław Wojciechowski', 'Ignacy Mościcki', 'Józef Piłsudski'], 0, 500, 25)),
  ],
  science: [
    cell(single('W którym mieście urodził się Mikołaj Kopernik?', ['W Toruniu', 'W Krakowie', 'We Fromborku', 'W Olsztynie'], 0, 100, 25)),
    // Lem (BRITE-PL) — pierwszy polski satelita naukowy, wyniesiony 21 listopada 2013 r.
    cell(bool('Pierwszy polski satelita naukowy, nazwany Lem, trafił na orbitę jeszcze w XX wieku.', false, 200, 25)),
    // Ignacy Łukasiewicz — lampa naftowa, 1853 r., Lwów (pierwsza operacja przy jej świetle 31 lipca 1853).
    cell(single('Kto w 1853 roku skonstruował lampę naftową?', ['Ignacy Łukasiewicz', 'Jan Szczepanik', 'Kazimierz Prószyński', 'Stefan Drzewiecki'], 0, 300, 25)),
    // Metoda Czochralskiego (1916) — hodowla monokryształów, podstawa produkcji krzemu dla elektroniki.
    cell(single('Metoda otrzymywania monokryształów krzemu, bez której nie byłoby współczesnej elektroniki, nosi nazwisko polskiego chemika. Jakie?', ['Czochralskiego', 'Banacha', 'Smoluchowskiego', 'Wróblewskiego'], 0, 400, 25)),
    // Kazimierz Funk — „vitamine” (1912).
    cell(single('Który polski biochemik wymyślił w 1912 roku słowo „witamina”?', ['Kazimierz Funk', 'Ludwik Hirszfeld', 'Rudolf Weigl', 'Hilary Koprowski'], 0, 500, 25)),
  ],
  books: [
    cell(single('Kto napisał „Przedwiośnie”?', ['Stefan Żeromski', 'Bolesław Prus', 'Henryk Sienkiewicz', 'Władysław Reymont'], 0, 100, 25)),
    // „Quo vadis”: Marek Winicjusz kocha Ligię; Petroniusz — jego wuj; Ursus — obrońca Ligii.
    cell(single('Jak nazywa się młody rzymski patrycjusz zakochany w Ligii w „Quo vadis”?', ['Marek Winicjusz', 'Petroniusz', 'Neron', 'Ursus'], 0, 200, 25)),
    cell(textQ('Jak nazywa się kupiec zakochany w Izabeli Łęckiej, główny bohater „Lalki” Bolesława Prusa?', ['Wokulski', 'Stanisław Wokulski', 'Wokulskiego', 'Stanislaw Wokulski'], 300, 30)),
    // „Hymn” („Smutno mi, Boże!”) — Juliusz Słowacki, 1836.
    cell(single('Kto napisał wiersz zaczynający się od słów „Smutno mi, Boże!”?', ['Juliusz Słowacki', 'Adam Mickiewicz', 'Cyprian Kamil Norwid', 'Zygmunt Krasiński'], 0, 400, 25)),
    cell(single('Jak nazywa się powieść Stanisława Lema o żywym oceanie, który pokrywa odległą planetę?', ['Solaris', 'Eden', 'Fiasko', 'Niezwyciężony'], 0, 500, 25)),
  ],
  arts: [
    cell(single('Jakim tańcem w metrum 3/4 tradycyjnie otwiera się studniówkę?', ['Polonezem', 'Krakowiakiem', 'Kujawiakiem', 'Oberkiem'], 0, 100, 25)),
    cell(single('Kto namalował „Bitwę pod Grunwaldem”?', ['Jan Matejko', 'Józef Chełmoński', 'Jacek Malczewski', 'Wojciech Kossak'], 0, 200, 25)),
    cell(single('Kto skomponował operę „Straszny dwór”?', ['Stanisław Moniuszko', 'Fryderyk Chopin', 'Karol Szymanowski', 'Ignacy Jan Paderewski'], 0, 300, 25)),
    // Paderewski — premier i minister spraw zagranicznych w 1919 r.
    cell(single('Który słynny pianista i kompozytor był w 1919 roku premierem Polski?', ['Ignacy Jan Paderewski', 'Artur Rubinstein', 'Henryk Wieniawski', 'Mieczysław Karłowicz'], 0, 400, 25)),
    // XV Konkurs Chopinowski (2005): Blechacz — I nagroda i wszystkie nagrody dodatkowe, II nagrody nie przyznano.
    cell(single('Kto wygrał Konkurs Chopinowski w 2005 roku, zgarniając też wszystkie nagrody dodatkowe?', ['Rafał Blechacz', 'Krystian Zimerman', 'Adam Harasiewicz', 'Piotr Paleczny'], 0, 500, 25)),
  ],
};

/** Nauka i wynalazki. */
export const SCIENCE: Question[] = [
  // Aleksander Wolszczan (z Dale’em Frailem), 1992: planety wokół pulsara PSR B1257+12.
  single('Kto w 1992 roku odkrył pierwsze planety poza Układem Słonecznym, krążące wokół pulsara?', ['Aleksander Wolszczan', 'Andrzej Udalski', 'Bohdan Paczyński', 'Józef Smak'], 0, 1000, 30),
  // „Monetae cudendae ratio” (1526): prawo Kopernika-Greshama.
  bool('Mikołaj Kopernik zajmował się też ekonomią i opisał, jak gorszy pieniądz wypiera lepszy.', true, 1000, 25),
  // Sławosz Uznański-Wiśniewski, misja Ax-4 (czerwiec–lipiec 2025), ok. 20 dni na ISS.
  textQ(
    'Jak się nazywa polski astronauta ESA, który w 2025 roku spędził prawie trzy tygodnie na Międzynarodowej Stacji Kosmicznej w misji Ax-4?',
    ['Sławosz Uznański', 'Uznański', 'Uznanski', 'Sławosz Uznański-Wiśniewski', 'Slawosz Uznanski', 'Uznański-Wiśniewski', 'Sławosz'],
    1500,
    30,
  ),
  // Banach — analiza funkcjonalna; Koprowski — pierwsza skuteczna żywa szczepionka przeciw polio; Hirszfeld — dziedziczenie i oznaczenia grup krwi;
  // Weigl — szczepionka przeciw tyfusowi plamistemu; Malinowski — badania terenowe na Wyspach Trobrianda.
  match(
    'Połącz polskiego uczonego z jego dokonaniem',
    [
      ['Stefan Banach', 'Analiza funkcjonalna'],
      ['Hilary Koprowski', 'Szczepionka przeciw polio'],
      ['Ludwik Hirszfeld', 'Dziedziczenie grup krwi'],
      ['Rudolf Weigl', 'Szczepionka przeciw tyfusowi'],
      ['Bronisław Malinowski', 'Badania na Wyspach Trobrianda'],
    ],
    1000,
    50,
  ),
  // Jan Heweliusz, „Selenographia” (Gdańsk, 1647).
  single('Który astronom wydał w 1647 roku „Selenografię” — jeden z pierwszych dokładnych atlasów Księżyca?', ['Jan Heweliusz', 'Mikołaj Kopernik', 'Marcin Bylica', 'Jan Brożek'], 0, 1500, 30),
  // Kopernik 1473, Heweliusz 1611, Skłodowska-Curie 1867, Banach 1892, Wolszczan 1946.
  order(
    'Ułóż uczonych od urodzonego najwcześniej',
    ['Mikołaj Kopernik', 'Jan Heweliusz', 'Maria Skłodowska-Curie', 'Stefan Banach', 'Aleksander Wolszczan'],
    1000,
    45,
    ['Najwcześniej', 'Najpóźniej'],
  ),
  // Karol Olszewski i Zygmunt Wróblewski, Kraków, kwiecień 1883: pierwsze skroplenie tlenu w stanie trwałym.
  numeric('W którym roku Olszewski i Wróblewski w Krakowie jako pierwsi skroplili tlen w stanie trwałym?', 1883, 0, 1500, 30),
  // Zbigniew Religa, Zabrze, 5 listopada 1985 r. — pierwszy udany przeszczep serca w Polsce.
  slider('W którym roku Zbigniew Religa przeprowadził w Zabrzu pierwszy udany w Polsce przeszczep serca?', { min: 1950, max: 2010 }, 1985, { tolerance: 1, zeroBeyond: 10 }, 1000, 30),
];
