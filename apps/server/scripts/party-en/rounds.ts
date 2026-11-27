/**
 * “Party Night” (сід `party-en`): розминка, брифінг Last War, “Мільйонер”, бліц, “Ва-банк” Гоґвортсу, головоломки, фінал і запасні.
 * Розв'язки й джерела — у коментарях. Гаррі Поттер — за книжками й фільмами (факти не повторюють сід `fantasy`).
 * Last War: Survival звірено 2026-11-27: App Store (FUNFLY PTE. LTD., безкоштовна з покупками, зомбі-апокаліпсис, бої на смугах),
 * lastwartutorial.com (типи героїв, рідкості, кругообіг переваг, сезони, Капітолій, будівлі), heaven-guardian.com і ldshop.gg (загін 2+3, ранги альянсу, Таверна).
 * Числа, що змінюються з оновленнями (ціни, рівні, бонуси), навмисно не питаємо.
 */
import type { Question } from '@quiz/shared';
import { PIN_PLACES, bool, chain, crossword, hinted, match, memory, multi, numeric, order, pin, single, slider, sort, sudoku, textQ } from './kit';

/** Розминка: від простого до середнього, усі три теми. */
export const WARMUP: Question[] = [
  // Murphy — UR-герой типу “танк” (lastwartutorial.com/heroes).
  single('Which of these characters is a hero you can actually recruit in Last War: Survival?', ['Murphy', 'Mario', 'Pikachu', 'Shrek'], 0, 500, 25),
  // “Hagrid: Yer a wizard, Harry” — у хатині на скелі, “Філософський камінь”.
  single('In the hut on the rock, Hagrid tells Harry some life-changing news: “Harry, you’re a…”', ['Wizard', 'Prince', 'Giant', 'Superhero'], 0, 500, 25),
  // Гаррі до Гоґвортсу спить у комірчині під сходами в будинку на Прівет-драйв, 4.
  bool('Before he gets his Hogwarts letter, Harry sleeps in a cupboard under the stairs.', true, 500, 25),
  // Charades — показують слово чи фільм без слів.
  single('Which party game has you act out a word or a film title without saying a single word?', ['Charades', 'Pictionary', 'Bingo', 'Twister'], 0, 500, 25),
  // Діти Візлі від старшого: Білл, Чарлі, Персі, Фред і Джордж, Рон, Джіні.
  multi(
    'Which of these Weasley siblings are older than Ron?',
    ['Bill', 'Charlie', 'Percy', 'George', 'Ginny'],
    [0, 1, 2, 3],
    1000,
    30,
  ),
  // “Філософський камінь”, розділ 2: “Thirty-six,” he said… “That’s two less than last year.”
  numeric('On his birthday, Dudley Dursley counts his presents and is furious there are fewer than last year. How many does he count?', 36, 2, 1000, 25),
  // “Dancing Queen” — 1976, “Y.M.C.A.” — 1978, “Macarena” — 1993, “Gangnam Style” — 2012, “Happy” — 2013.
  order('Party hits: put these songs in order of release, oldest first', ['Dancing Queen', 'Y.M.C.A.', 'Macarena', 'Gangnam Style', 'Happy'], 1000, 45, ['Oldest', 'Newest']),
  match(
    'Match each party song with the artist who made it famous',
    [
      ['I Wanna Dance with Somebody', 'Whitney Houston'],
      ['Don’t Stop Me Now', 'Queen'],
      ['Celebration', 'Kool & the Gang'],
      ['Party Rock Anthem', 'LMFAO'],
      ['Hey Ya!', 'OutKast'],
    ],
    1000,
    45,
  ),
  // Квафл, Гіпогриф, Портал-ключ (Portkey), Думоотвід (Pensieve), Котел — світ Гаррі; HQ, альянс, Капітолій, Drill Ground, дрон — Last War.
  sort(
    'Sort it out: does each word belong to the world of Harry Potter or to Last War: Survival?',
    ['Harry Potter', 'Last War'],
    [
      ['Hippogriff', 0],
      ['Portkey', 0],
      ['Pensieve', 0],
      ['Cauldron', 0],
      ['Remembrall', 0],
      ['Drill Ground', 1],
      ['Capitol', 1],
      ['Desert Storm', 1],
      ['Iron Mine', 1],
      ['Arms Race', 1],
    ],
    100,
    50,
  ),
  // “Gangnam Style” PSY став першим роликом YouTube із мільярдом переглядів 21 грудня 2012 року.
  slider('In which year did “Gangnam Style” become the first YouTube video to reach one billion views?', { min: 2005, max: 2020 }, 2012, { tolerance: 1, zeroBeyond: 4, unit: 'year' }, 1000, 30),
  // Сідней: новорічний феєрверк над мостом Harbour Bridge і Оперним театром — одне з найбільших новорічних свят світу.
  pin('Mark on the world map the city famous for its New Year’s Eve fireworks over a giant harbour bridge and a sail-shaped opera house.', 'world', PIN_PLACES.world.sydney, [3, 12], 1000, 35),
  // День народження → торт → свічки → вогонь → дракон (серцевина з драконового серця) → чарівна паличка.
  chain('Chain: get from Birthday to Wand — each word is linked to the one before it', ['Birthday', 'Cake', 'Candles', 'Fire', 'Dragon', 'Wand'], 5, 1000, 60),
];

/** “Командирський брифінг”: тематичний раунд Last War. */
export const BRIEFING: Question[] = [
  // App Store: Free, In-App Purchases.
  bool('Last War: Survival is free to download, with optional in-app purchases.', true, 500, 25),
  // App Store: розробник FUNFLY PTE. LTD. (Сінгапур).
  single('Which company develops Last War: Survival?', ['FUNFLY', 'Supercell', 'Rovio', 'King'], 0, 500, 25),
  // Захисники — у передньому ряду (2 місця), атака й підтримка — у задньому (3 місця).
  single('Where do defence heroes usually stand in a Last War squad?', ['In the front row', 'In the back row', 'Hidden inside the HQ', 'Anywhere — rows don’t exist'], 0, 500, 25),
  // Рідкості: UR (легендарні), SSR (епічні), SR (рідкісні).
  multi('Which of these are real hero rarity grades in Last War?', ['UR', 'SSR', 'SR', 'MVP', 'XL', 'VIP'], [0, 1, 2], 1000, 30),
  // Last War — PvP-стратегія: бази інших гравців можна атакувати, не лише зомбі.
  bool('In Last War, only zombies can attack your base — other players never can.', false, 1000, 25),
  // Кругообіг: танк сильніший за ракетні установки, ракети — за літаки, літаки — за танки (±20 %).
  match(
    'Rock, paper, scissors — Last War style: match each squad type with the type it has the advantage over',
    [
      ['Tank', 'Missile Vehicle'],
      ['Missile Vehicle', 'Aircraft'],
      ['Aircraft', 'Tank'],
    ],
    1000,
    40,
  ),
  // Зомбі-облога: щомісячна подія альянсу — 20 хвиль, що дедалі сильнішають.
  single(
    'Which alliance event has everyone defending their bases against twenty ever-stronger waves of the undead?',
    ['Zombie Siege', 'Desert Storm', 'Arms Race', 'Capitol Conquest'],
    0,
    1000,
    25,
  ),
  // Президент призначає віцепрезидента (колишня назва посади — First Lady) і міністрів.
  single(
    'The President of a Last War server picks a deputy. What is that role called today (it used to be called “First Lady”)?',
    ['Vice President', 'Prime Minister', 'Chancellor', 'Governor'],
    0,
    1000,
    25,
  ),
  // Сезони: 1 — The Crimson Plague, 2 — Polar Storm, 3 — Golden Kingdom, 4 — Evernight Isle.
  order('Put the first four seasons of Last War in order', ['The Crimson Plague', 'Polar Storm', 'Golden Kingdom', 'Evernight Isle'], 1500, 45, ['Season 1', 'Season 4']),
  // Сезон 5 — Wild West (The Golden Wasteland of the Land of Liberty).
  single('Season 5 of Last War takes the fighting to which setting?', ['The Wild West', 'Ancient Egypt', 'Outer space', 'The Ice Age'], 0, 1500, 25),
];

/** “Мільйонер”: 10 сходинок від найпростішого до найскладнішого; ціну дає сходинка (levels у збирачі). Підказки не називають відповіді. */
export const LADDER: Question[] = [
  // Нора (The Burrow) — дім Візлі біля Оттері-Сент-Кечпоул.
  hinted(single('What is the name of the Weasley family home?', ['The Burrow', 'The Nest', 'Shell Cottage', 'The Leaky Cauldron'], 0, 1000, 30), 'It sounds like a rabbit’s home under the ground.'),
  hinted(
    single('What are you supposed to do silently just before you blow out your birthday candles?', ['Make a wish', 'Count to ten', 'Close one eye', 'Clap three times'], 0, 1000, 30),
    'Say it out loud and, they say, it won’t come true.',
  ),
  // Таверна — тут вербують героїв за квитки (heaven-guardian.com, theriagames.com).
  hinted(
    single('In Last War, which building do you visit to recruit new heroes?', ['Tavern', 'Hospital', 'Wall', 'Drill Ground'], 0, 1000, 30),
    'In fantasy stories, it’s where adventurers meet over a meal.',
  ),
  hinted(
    single('Which party game makes players freeze in place the moment the music stops?', ['Musical statues', 'Hot potato', 'Duck, duck, goose', 'Pass the parcel'], 0, 1000, 30),
    'Move a muscle and you’re out.',
  ),
  // Боби Берті Бота: Дамблдор колись натрапив на смак блювотиння, Джордж — на смак козявок, у фільмі Дамблдору трапляється сірка з вуха.
  hinted(
    single('Which wizarding sweets could taste of earwax, bogeys or even vomit?', ['Bertie Bott’s Beans', 'Chocolate Frogs', 'Fizzing Whizzbees', 'Acid Pops'], 0, 1000, 30),
    'Their full name promises “every flavour”.',
  ),
  // Ранги альянсу R1–R5: R5 — лідер, R4 — офіцери.
  hinted(
    single('In Last War, what do the ranks R1 to R5 describe?', ['Members of an alliance', 'Hero star levels', 'Troop tiers', 'Server numbers'], 0, 1000, 30),
    'There is only one R5, and that player calls the shots.',
  ),
  // Італ. confetti — зацукровані мигдалики, які кидали на святах; паперові кружальця прийшли пізніше.
  hinted(
    single('The word “confetti” comes from Italian. What did it originally mean?', ['Sugar-coated sweets', 'Tiny papers', 'Snowflakes', 'Flower petals'], 0, 1000, 30),
    'In Italy these are still given out at weddings — and you can eat them.',
  ),
  // “Таємна кімната”, розділ 8: Майже Безголовий Нік святкує п’ятисоті роковини смерті (deathday) на Гелловін.
  hinted(
    single(
      'In “Chamber of Secrets”, Nearly Headless Nick invites Harry to a very spooky party. What is he celebrating?',
      ['His 500th deathday', 'His 100th birthday', 'Joining the Headless Hunt', 'A ghost wedding'],
      0,
      1000,
      30,
    ),
    'The food is rotten — the ghosts can only sniff it.',
  ),
  // Лімбо — танець із Тринідаду і Тобаго.
  hinted(single('Which country gave the world the limbo dance?', ['Trinidad and Tobago', 'Brazil', 'Jamaica', 'Cuba'], 0, 1000, 30), 'Think steel drums and Carnival.'),
  // “Келих вогню”: на Різдвяному балу грає гурт The Weird Sisters; The Hobgoblins і Celestina Warbeck теж є у світі Гаррі.
  hinted(
    single('Which wizarding band plays at the Yule Ball?', ['The Weird Sisters', 'The Hobgoblins', 'Celestina Warbeck’s Band', 'The Bludger Boys'], 0, 1000, 30),
    'Their name sounds spooky, but they rock the Great Hall.',
  ),
];

/** Бліц: короткі запитання, хто швидший. */
export const BLITZ: Question[] = [
  // Роберт Паттінсон зіграв Седрика Діґорі, а не Віктора Крума (Станіслав Яневський).
  bool('In the “Goblet of Fire” film, Robert Pattinson plays Viktor Krum.', false, 200, 25),
  // Седрик Діґорі — Гафелпаф.
  single('Which Hogwarts house is Cedric Diggory in?', ['Hufflepuff', 'Ravenclaw', 'Gryffindor', 'Slytherin'], 0, 200, 25),
  // Зірки героя підвищують осколками (Hero Shards).
  bool('In Last War, a hero’s star level is raised with hero shards.', true, 300, 25),
  // Мелодія “Happy Birthday to You” — з пісні сестер Гілл “Good Morning to All” (1893).
  bool('“Happy Birthday to You” uses the tune of an older children’s song called “Good Morning to All”.', true, 300, 25),
  // У “Музичних стільцях” після кожного раунду прибирають один стілець, а не додають.
  bool('In musical chairs, an extra chair is added after every round.', false, 300, 25),
  // Гра на вечірці: “Simon says” — виконуй лише накази, що починаються з цих слів.
  single('In “Simon Says”, which orders should you obey?', ['Only those that start with “Simon says”', 'Only those that are shouted', 'Every order at all', 'Only the last one'], 0, 300, 25),
  // Weasleys’ Wizard Wheezes — крамниця жартів Фреда й Джорджа на Алеї Діаґон.
  textQ(
    'What is the name of the joke shop Fred and George open in Diagon Alley?',
    ['Weasleys’ Wizard Wheezes', "Weasleys' Wizard Wheezes", 'Weasley’s Wizard Wheezes', "Weasley's Wizard Wheezes", 'Weasleys Wizard Wheezes', 'Weasley Wizard Wheezes', 'Wizard Wheezes', 'WWW'],
    400,
    25,
  ),
  // Волосина з мантії Міллісент виявилася котячою — Герміона стала напівкішкою.
  bool('In “Chamber of Secrets”, Hermione’s Polyjuice Potion turns her into a perfect copy of Millicent Bulstrode.', false, 400, 25),
];

/** “Ва-банк” у Гоґвортсі: ціни ростуть зі складністю — 100…1500. */
export const WIPEOUT: Question[] = [
  // Паличка Гаррі: падуб, перо фенікса, 11 дюймів.
  bool('Harry’s wand has a phoenix feather at its core.', true, 100, 25),
  // “В’язень Азкабану”: Люпин після нападу дементора в поїзді дає Гаррі шоколад.
  single('What does Professor Lupin give Harry after a Dementor attack on the train?', ['Chocolate', 'A cup of tea', 'A Pepper-Up Potion', 'A lucky charm'], 0, 200, 25),
  // Wingardium Leviosa — чари левітації, перші уроки чарів, піря.
  textQ(
    'Which levitation charm do first-years practise on feathers in their Charms lessons?',
    ['Wingardium Leviosa', 'Wingardium Leviosa!', 'Wingardium Levioza', 'Wingardum Leviosa', 'Wingardium Leviossa'],
    400,
    25,
  ),
  // Перше завдання Тричаклунського турніру: Гаррі дістався угорський рогохвіст.
  single(
    'Which dragon does Harry have to face in the first task of the Triwizard Tournament?',
    ['A Hungarian Horntail', 'A Swedish Short-Snout', 'A Chinese Fireball', 'A Common Welsh Green'],
    0,
    700,
    25,
  ),
  // “Таємна кімната”: пароль до кабінету Дамблдора — “Sherbet lemon” (у США — “Lemon drop”).
  textQ('What sweet is the password to Dumbledore’s office in “Chamber of Secrets”?', ['Sherbet lemon', 'Sherbet lemons', 'Lemon drop', 'Lemon drops', 'Lemon sherbet', 'Sherbert lemon'], 1000, 30),
  // “Напівкровний Принц”: крамниця жартів — Діаґон-алея, 93.
  numeric('At what house number in Diagon Alley does the Weasley twins’ joke shop stand?', 93, 0, 1500, 30),
];

/** Головоломки: кросворд з ключем PARTY, “Пам’ять” “актор — роль” і легка судоку. */
export const PUZZLES: Question[] = [
  crossword(
    'Party crossword: solve the clues, then find the key word hidden in the highlighted squares',
    [
      ['PRESENTS', 'Wrapped gifts piled up for the birthday child'],
      ['KARAOKE', 'Singing along with the lyrics on a screen'],
      ['BIRTHDAY', 'The special day that most parties are thrown for'],
      ['DRONE', 'Flying gadget that Last War players upgrade with chips and parts'],
      ['ALLIANCE', 'In Last War, a team of players who fight side by side'],
      ['CANDLES', 'You blow these out on top of the cake'],
    ],
    'PARTY',
    1200,
  ),
  // Меґґі Сміт — Макґонеґел, Роббі Колтрейн — Геґрід, Імельда Стонтон — Амбридж, Кеннет Брана — Локарт, Емма Томпсон — Трелоні,
  // Том Фелтон — Драко, Руперт Ґрінт — Рон, Брендан Ґлісон — Дикозор Муді.
  memory(
    'Memory: find the pairs “actor — Harry Potter character”',
    '4x4',
    [
      [{ text: 'Maggie Smith' }, { text: 'Minerva McGonagall' }],
      [{ text: 'Robbie Coltrane' }, { text: 'Rubeus Hagrid' }],
      [{ text: 'Imelda Staunton' }, { text: 'Dolores Umbridge' }],
      [{ text: 'Kenneth Branagh' }, { text: 'Gilderoy Lockhart' }],
      [{ text: 'Emma Thompson' }, { text: 'Sybill Trelawney' }],
      [{ text: 'Tom Felton' }, { text: 'Draco Malfoy' }],
      [{ text: 'Rupert Grint' }, { text: 'Ron Weasley' }],
      [{ text: 'Brendan Gleeson' }, { text: 'Mad-Eye Moody' }],
    ],
    1000,
    150,
    41,
  ),
  sudoku('Party-time sudoku 6×6: every row, column and 2×3 box holds the numbers 1 to 6, each exactly once.', 2711, 'easy', 1000, 240),
];

/** Фінал: весілля Білла й Флер. */
// “Смертельні реліквії”, розділ 8: патронус-рись Кінґслі: “The Ministry has fallen. Scrimgeour is dead. They are coming.”
export const FINAL: Question = single(
  'The wedding party of Bill and Fleur ends in a flash when a silvery Patronus bursts in with a message. What news does it bring?',
  ['The Ministry has fallen', 'Hogwarts has been closed', 'Voldemort has been defeated', 'Dumbledore is alive'],
  0,
  0,
  60,
);

/** Запасні для бафу “Заміна запитання”: прості типи без медіа. */
export const SPARES: Question[] = [
  // У США перша книжка — “Harry Potter and the Sorcerer’s Stone”.
  bool('In the USA, the first book was renamed “Harry Potter and the Wizard’s Stone”.', false, 300, 25),
  // Шкідливий привид дівчачого туалету на другому поверсі — Плаксива Мірта.
  single('Which Hogwarts ghost haunts a girls’ bathroom?', ['Moaning Myrtle', 'The Grey Lady', 'The Fat Friar', 'Peeves'], 0, 300, 25),
  // “Hot potato”: хто тримає “картоплю”, коли стихає музика, вибуває.
  single('In “Hot Potato”, what happens to the player holding the potato when the music stops?', ['They are out', 'They win the game', 'They must sing a song', 'They swap seats'], 0, 300, 25),
  // У “Pin the tail on the donkey” гравцеві зав’язують очі.
  bool('In “Pin the Tail on the Donkey”, players try to stick the tail on while blindfolded.', true, 300, 25),
];
