/**
 * “Party Night” (сід `party-en`): поле — чотири категорії по п’ять клітинок 100…500 і по запасній.
 * Ціна росте зі складністю; ×2/×3 і бліц-клітинку розкидає scatter (mix-quiz) на випадкових цінах.
 * Last War: Survival звірено 2026-11-27 зі сторінкою App Store (FUNFLY PTE. LTD.) і гайдами lastwartutorial.com, heaven-guardian.com, ldshop.gg.
 */
import type { Question } from '@quiz/shared';
import { bool, cell, clues, numeric, single, textQ, type Cell } from './kit';

export type BoardKey = 'hq' | 'hogwarts' | 'world' | 'playlist';
export type Slot = { cells: Cell[]; spare: Question };

export const board: Record<BoardKey, Slot> = {
  hq: {
    cells: [
      // lastwartutorial.com/buildings: рівень HQ обмежує рівень усіх інших будівель (і героїв).
      cell(
        single(
          'In Last War: Survival, which building sets the maximum level for every other building in your base?',
          ['Headquarters (HQ)', 'Hospital', 'Wall', 'Drill Ground'],
          0,
          100,
          25,
        ),
      ),
      // Склад загону можна змішувати; однотипний загін дає лише бонус до характеристик.
      cell(bool('In Last War, every squad is only allowed to contain heroes of one single type.', false, 200, 25)),
      // Загін — п’ять героїв: двоє в передньому ряду, троє в задньому.
      cell(numeric('How many heroes can you put into one Last War squad?', 5, 0, 300, 25)),
      // lastwartutorial.com/the-capitol: альянс, що здобув Капітолій, обирає зі своїх членів Президента.
      cell(single('After the big fight for the Capitol in Last War, the winners choose one player to rule the server. What is that title?', ['President', 'King', 'Emperor', 'Mayor'], 0, 400, 25)),
      // Overlord Gorilla — додатковий бойовий звір, якого рятують і тренують на окремій базі (з другого сезону).
      cell(
        textQ(
          'What kind of animal is the Overlord — the giant battle beast that Last War players rescue and train at its own base?',
          ['gorilla', 'a gorilla', 'ape', 'an ape', 'gorila', 'gorrilla', 'silverback', 'silverback gorilla', 'the gorilla'],
          500,
          30,
        ),
      ),
    ],
    // Поля й шахти: їжа (Field), залізо (Iron Mine), золото-монети (Gold Mine).
    spare: single(
      'Which three basic resources do the fields and mines in a Last War base produce?',
      ['Food, iron and gold', 'Wood, stone and oil', 'Water, sand and gems', 'Food, wood and steel'],
      0,
      300,
      25,
    ),
  },
  hogwarts: {
    cells: [
      // Квафл — м’яч, який загоничі кидають в обручі (10 очок).
      cell(single('Which ball do Quidditch Chasers throw through the hoops to score goals?', ['Quaffle', 'Bludger', 'Golden Snitch', 'Bouncer'], 0, 100, 25)),
      // Батьки Герміони — стоматологи (маґли).
      cell(bool('Both of Hermione Granger’s parents work as dentists.', true, 200, 25)),
      // “В’язень Азкабану”: Фред і Джордж віддають Гаррі Карту мародерів перед походом у Гоґсмід.
      cell(single('Who hands Harry the Marauder’s Map in his third year?', ['Fred and George Weasley', 'Sirius Black', 'Remus Lupin', 'Rubeus Hagrid'], 0, 300, 25)),
      // “Mischief managed” стирає карту; “I solemnly swear that I am up to no good” відкриває її.
      cell(textQ('What do you say to wipe the Marauder’s Map blank again when you have finished with it?', ['Mischief managed', 'Mischief managed!', 'mischief is managed'], 400, 30)),
      // Ґілдерой Локарт: палата Януса Тікі в лікарні Святого Мунґо (“Орден Фенікса”), п’ять нагород Witch Weekly,
      // автобіографія “Magical Me”, корнуольські піксі на першому уроці, учитель захисту на другому курсі Гаррі.
      cell(
        clues(
          'Who am I? The clues get easier one by one',
          [
            'These days I live in a long-term ward at St Mungo’s Hospital.',
            'I won Witch Weekly’s Most-Charming-Smile Award five times.',
            'My autobiography is called “Magical Me”.',
            'In my very first lesson I let a cage of Cornish pixies loose on the class.',
            'I taught Defence Against the Dark Arts in Harry’s second year.',
          ],
          ['Gilderoy Lockhart', 'Lockhart', 'Gilderoy', 'Professor Lockhart', 'Guilderoy Lockhart', 'Lockheart', 'Gilderoy Lockheart'],
          7,
          500,
          45,
        ),
      ),
    ],
    // Громовещатель (Howler) — червоний лист, що вигукує послання на весь голос.
    spare: single(
      'What happens when a wizard opens a Howler?',
      ['It yells the sender’s message at full volume', 'It bursts into a cloud of glitter', 'It turns into a paper bird', 'It sings a birthday song'],
      0,
      300,
      25,
    ),
  },
  world: {
    cells: [
      // Піньята — традиція мексиканських дитячих свят і різдвяних посад.
      cell(single('Smashing a sweet-filled piñata is a beloved birthday tradition that is most closely linked with which country?', ['Mexico', 'Japan', 'Norway', 'Egypt'], 0, 100, 25)),
      // La Tomatina — щороку в серпні в Буньолі (Валенсія, Іспанія).
      cell(bool('La Tomatina, the giant tomato fight festival, takes place every year in Italy.', false, 200, 25)),
      // Нідерландський kringverjaardag: гості сідають колом і вітають не лише іменинника, а й усю його рідню (“Gefeliciteerd met je moeder!”).
      cell(
        single(
          'At a Dutch “circle party” birthday, guests sit in a big circle. Whom do they congratulate as they arrive?',
          ['The birthday person and all their relatives', 'Only the oldest guest', 'Only whoever baked the cake', 'Nobody — it brings bad luck'],
          0,
          300,
          25,
        ),
      ),
      // Nose greasing: в Атлантичній Канаді (Нова Шотландія) іменинникові змащують ніс маслом, щоб невдача “зісковзнула”.
      cell(single('In parts of Atlantic Canada, what do friends smear on the birthday person’s nose for good luck?', ['Butter', 'Jam', 'Honey', 'Toothpaste'], 0, 400, 25)),
      // Міекгук — суп із морської капусти, який корейці традиційно їдять на день народження; ттокгук (з рисовими коржиками) — новорічний, пастка.
      cell(single('On their birthday, many Koreans traditionally eat a bowl of which soup?', ['Seaweed soup', 'Rice-cake soup (tteokguk)', 'Red bean soup', 'Chicken noodle soup'], 0, 500, 25)),
    ],
    // Червоні конверти (хунбао) з грошима на Китайський Новий рік.
    spare: single(
      'What do children in China traditionally receive from older relatives at Lunar New Year?',
      ['Red envelopes with money', 'Golden paper crowns', 'Wooden toy dragons', 'Paper snowflakes'],
      0,
      300,
      25,
    ),
  },
  playlist: {
    cells: [
      // Y.M.C.A. (Village People, 1978): у приспіві руками показують літери.
      cell(single('At parties, which song gets everyone spelling out letters with their arms?', ['Y.M.C.A.', 'Macarena', 'Dancing Queen', 'Twist and Shout'], 0, 100, 25)),
      // Earth, Wind & Fire, “September” (1978): “Do you remember the 21st night of September?”
      cell(textQ('Complete the Earth, Wind & Fire lyric: “Do you remember the 21st night of…”', ['September', 'Septembr', 'Setember'], 200, 25)),
      // “Can’t Stop the Feeling!” Джастіна Тімберлейка — з мультфільму “Trolls” (2016), номінація на “Оскар”.
      cell(single('Justin Timberlake’s party hit “Can’t Stop the Feeling!” was written for which animated film?', ['Trolls', 'Frozen', 'Sing', 'Inside Out'], 0, 400, 25)),
      // “Cha Cha Slide” DJ Casper (2000): “Take it back now, y’all”, “Criss cross!”, “Slide to the left”.
      cell(single('Which line-dance hit by DJ Casper shouts instructions like “Take it back now, y’all” and “Criss cross!”?', ['Cha Cha Slide', 'Cupid Shuffle', 'Electric Slide', 'Macarena'], 0, 300, 25)),
      // “Chicken Dance” (Der Ententanz / Vogerltanz) написав швейцарський акордеоніст Вернер Томас із Давоса в 1950-х.
      cell(single('The “Chicken Dance”, played at countless parties and weddings, was first composed in which country?', ['Switzerland', 'USA', 'Brazil', 'Japan'], 0, 500, 25)),
    ],
    // Black Eyed Peas, “I Gotta Feeling” (2009): “…that tonight’s gonna be a good night”.
    spare: textQ('Which Black Eyed Peas party anthem promises that “tonight’s gonna be a good night”?', ['I Gotta Feeling', 'I Got a Feeling', 'I’ve Got a Feeling', 'I Gotta Feelin'], 300, 25),
  },
};
