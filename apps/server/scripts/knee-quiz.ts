import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { bool, clues, match, multi, numeric, order, pin, rules, single, slider, sort, textQ, cell } from './demo-quiz';
import { crossword, cut, scatter, type Cell } from './mix-quiz';
import { jigsaw } from './mix2/kit';
import { img, memory } from './mega/kit';
import { aspectOf, pinOf, type KneeImageKey } from './knee/images';

/** Bild: Schlüssel → Adresse auf der Seite (/uploads/…). */
export type KneePhotos = (key: KneeImageKey) => string;

/**
 * «Knie & Unterschenkel» (Seed `knee`): Lernquiz zu den Vorlesungsfolien «Anatomie skelettal» (Kerstin Milcarek, 2025) —
 * distales Femur, Patella, Tibia, Fibula, Kniegelenk, Bänder, Bursen, Menisken, Kapsel, Bewegungen und Art. tibiofibularis.
 * Sprache Deutsch, Fachbegriffe Latein wie auf den Folien. Alle Fakten stammen aus den Folien (Lehrbuchwissen, das ihnen entspricht).
 * Bilder: Abbildungen der Folien selbst (knee/images.ts), Beschriftungen abgedeckt oder durch Nummern ersetzt.
 * Timer ab 25 s, Ja/Nein gemischt, Preise steigen mit der Schwierigkeit. Nichts mit Bezug zu russland.
 */
export const kneeQuiz = (photos: KneePhotos): Quiz => {
  let k = 0;
  const tag =
    (part: string) =>
    (question: Question): Question => ({ ...question, id: `kn-${part}-${++k}` });
  /** «Tippe auf …» auf einer Folienabbildung. */
  const tap = (text: string, key: KneeImageKey, radii: [number, number], points: number, time = 30): Question =>
    pin(text, { imageUrl: photos(key), aspect: aspectOf(key) }, pinOf(key), radii, points, time);
  const pic = (question: Question, key: KneeImageKey): Question => img(question, photos(key));

  const category = (key: string, title: string, cells: Question[], spare: Question) => {
    const t = tag(key);
    return {
      id: `knc-${key}`,
      title,
      cells: scatter(`knee-${key}`, cells.map((q): Cell => cell(t(q)))),
      spares: [t(spare)],
    };
  };

  return {
    title: 'Knie & Unterschenkel: Anatomie skelettal',
    description: 'Lernquiz zu den Folien «Knie & Unterschenkel»: Femur, Patella, Tibia, Fibula, Bänder, Menisken und Bewegungen — mit Atlasbildern und lateinischen Fachbegriffen.',
    settings: {
      leaderboard: 'each',
      newcomers: true,
      buffs: [...BUFF_KINDS],
      debuffs: [...DEBUFF_KINDS],
      debuffPrices: { shake: 200, fog: 250, freeze: 350, mirror: 300, guests: 200, mud: 200, flip: 250, torch: 300, sticky: 200, noclock: 300, bubbles: 200 },
      debuffShop: true,
    },
    rounds: [
      {
        id: 'kn-warmup',
        type: 'classic',
        title: 'Aufwärmen: Knochen rund ums Knie',
        description:
          'Zehn Fragen zum Einstieg: Knochen des Beins, lateinische Namen, Gelenktyp, Knorpel und Bursen. Dazu eine Reihenfolge von proximal nach distal, eine Zuordnung zu Femur, Tibia und Fibula und ein «Wer bin ich?». Schnelle richtige Antworten bringen einen Bonus, teilweise richtige die Hälfte.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: [
          // Folie 2: linkes Bild von ventral mit Patella; rechts dorsal — dort ist keine Patella zu sehen.
          tap('Beinskelett von vorne (links) und von hinten (rechts). Tippe auf die Patella.', 'skeleton', [3, 8], 500),
          // Folie 8: zwei Knochen.
          single('Aus welchen zwei Knochen wird der Unterschenkel gebildet?', ['Tibia und Fibula', 'Femur und Tibia', 'Tibia und Patella', 'Fibula und Femur'], 0, 500, 25),
          // Folie 13.
          single('Wie lautet der lateinische Name des Kniegelenks?', ['Art. genus', 'Art. coxae', 'Art. cubiti', 'Art. talocruralis'], 0, 500, 25),
          // Folie 26.
          bool('Schleimbeutel sind mit Synovialflüssigkeit gefüllt.', true, 500, 25),
          // Folie 14: im Wesentlichen ein Scharniergelenk.
          single('Welcher Gelenktyp ist das Kniegelenk im Wesentlichen?', ['Scharniergelenk', 'Kugelgelenk', 'Sattelgelenk', 'Eigelenk'], 0, 500, 25),
          // Folie 5: lateral ausgeprägter.
          bool('Das Patellagleitlager ist medial stärker ausgeprägt als lateral.', false, 500, 25),
          // Folie 5: hyaliner Knorpel.
          bool('Die Gelenkfläche des distalen Femurs ist mit Faserknorpel überzogen.', false, 500, 25),
          // Folien 3–4, 9–12.
          sort(
            'Femur, Tibia oder Fibula? Ordne jede Struktur ihrem Knochen zu.',
            ['Femur', 'Tibia', 'Fibula'],
            [
              ['Linea supracondylaris lateralis', 0],
              ['Linea intercondylaris', 0],
              ['Epicondylus lateralis', 0],
              ['Margo anterior', 1],
              ['Facies articularis fibulae', 1],
              ['Area intercondylaris posterior', 1],
              ['Collum fibulae', 2],
              ['Malleolus lateralis', 2],
              ['Fossa malleoli lateralis', 2],
            ],
            100,
            70,
          ),
          // Folie 4/9: Epicondylus medialis (Femur) → Tuberositas tibiae → Malleolus medialis; das Lig. collaterale tibiale zieht vom Epicondylus nach distal unter das Tibiaplateau.
          order(
            'Ordne die Strukturen von proximal nach distal.',
            ['Linea supracondylaris medialis', 'Epicondylus medialis femoris', 'Tibiaplateau', 'Tuberositas tibiae', 'Malleolus medialis'],
            1000,
            45,
            ['proximal', 'distal'],
          ),
          // Folien 8, 9, 12, 40, 41.
          clues(
            'Wer bin ich? Die Hinweise erscheinen nacheinander, vom schwersten zum leichtesten.',
            [
              'Ich helfe mit, das kleine Gelenk zwischen Wadenbeinkopf und Schienbein zusammenzuhalten.',
              'Auch die Verbindung von Schien- und Wadenbein knapp über dem Sprunggelenk stabilisiere ich mit.',
              'Ich spanne mich zwischen den Margines interossei der beiden Knochen aus.',
              'Ich verbinde Tibia und Fibula über die ganze Länge des Unterschenkels.',
            ],
            ['Membrana interossea cruris', 'Membrana interossea', 'Zwischenknochenmembran', 'Membrana interossea cruris (Zwischenknochenmembran)'],
            8,
            1500,
            45,
          ),
        ].map(tag('warm')),
      },
      {
        id: 'kn-atlas',
        type: 'classic',
        title: 'Bilderatlas: Folien ohne Beschriftung',
        description:
          'Fünfzehn Abbildungen aus den Folien — die Beschriftungen sind abgedeckt oder durch Nummern ersetzt. Tippe die gesuchte Struktur im Bild an, ordne Nummern zu oder nenne den lateinischen Namen. Je näher der Fingertipp am Ziel, desto mehr Punkte; teilweise richtige Zuordnungen geben die Hälfte.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: [
          // Folie 6a: Apex patellae kaudal.
          tap('Patella von ventral. Tippe auf den Apex patellae.', 'patellaFront', [4, 10], 500),
          // Folie 9: Tuberositas tibiae.
          tap('Proximale Tibia und Fibula von ventral. Tippe auf die Tuberositas tibiae.', 'tibiaFront', [4, 9], 500),
          // Folie 6b: Facies articularis patellae, mit hyalinem Knorpel überzogen.
          pic(
            textQ(
              'Die Patella von dorsal: Wie heißt die große, mit Knorpel überzogene Fläche, die hier zu sehen ist? (Latein)',
              ['Facies articularis patellae', 'Facies articularis', 'Facies articularis der Patella', 'Fac. articularis patellae'],
              500,
              40,
            ),
            'patellaBack',
          ),
          // Folie 13: Fibula ist nicht am Kniegelenk beteiligt.
          tap('Rechtes Knie von ventral. Tippe auf den Knochen, der NICHT am Kniegelenk beteiligt ist.', 'kneeFront', [5, 9], 1000),
          // Folien 3/4: 1 Epicondylus medialis, 2 Linea intercondylaris, 3 Facies patellaris, 4 Condylus lateralis.
          pic(
            match(
              'Distales Femur, links von ventral, rechts von dorsal. Ordne jeder Nummer die richtige Struktur zu.',
              [
                ['Nummer 1', 'Epicondylus medialis'],
                ['Nummer 2', 'Linea intercondylaris'],
                ['Nummer 3', 'Facies patellaris'],
                ['Nummer 4', 'Condylus lateralis'],
              ],
              1000,
              60,
            ),
            'femurNumbered',
          ),
          // Folie 4: Tuberculum adductorium über dem Epicondylus medialis.
          tap('Distales Femur von dorsal. Tippe auf das Tuberculum adductorium.', 'femurBack', [4, 9], 1000),
          // Folie 7: First teilt in laterale (leicht konkav) und mediale (leicht konvex) Facette; 1 = lateral.
          pic(
            single(
              'Querschnitt durch Patella und Patellagleitlager. Welche Aussage über die Facette mit der Nummer 1 stimmt?',
              ['Laterale Facette, leicht konkav', 'Laterale Facette, leicht konvex', 'Mediale Facette, leicht konkav', 'Mediale Facette, leicht konvex'],
              0,
              1000,
              35,
            ),
            'facets',
          ),
          // Folie 10: Eminentia intercondylaris als Erhöhung zwischen den Condylen.
          tap('Tibiaplateau von kranial. Tippe auf die Eminentia intercondylaris.', 'plateau', [4, 9], 1000),
          // Folie 10: 1 = Area intercondylaris anterior.
          pic(
            single(
              'Tibiaplateau von kranial. Welche Fläche zeigt die Nummer 1?',
              ['Area intercondylaris anterior', 'Area intercondylaris posterior', 'Facies articularis superior', 'Facies poplitea'],
              0,
              1000,
              30,
            ),
            'plateauNumbered',
          ),
          // Folie 19: 1 = Lig. collaterale fibulare.
          pic(
            textQ(
              'Knie von lateral. Wie heißt das mit 1 markierte Band? (Latein)',
              ['Lig. collaterale fibulare', 'Ligamentum collaterale fibulare', 'Lig collaterale fibulare', 'Lig. collaterale laterale', 'Ligamentum collaterale laterale', 'Collaterale fibulare'],
              1000,
              45,
            ),
            'lateralKnee',
          ),
          // Folie 18: Lig. collaterale tibiale (Innenband).
          tap('Knie von medial. Tippe auf das Lig. collaterale tibiale.', 'medialKnee', [5, 10], 1000),
          // Folie 26: Bursa subcutanea prepatellaris vor der Patella.
          tap('Sagittalschnitt durch das Knie, die Patella liegt rechts. Tippe auf die Bursa subcutanea prepatellaris.', 'bursae', [4, 8], 1000),
          // Folie 31/32: vorne oben, medial links; Hinterhorn des Außenmeniskus unten rechts.
          tap('Menisken von kranial (vorne ist oben, medial links). Tippe auf das Hinterhorn des Meniscus lateralis.', 'horns', [5, 11], 1000),
          // Folie 21: 1 = Lig. cruciatum anterius.
          pic(
            single(
              'Gebeugtes Knie von ventral, die Patella ist nach unten geklappt. Welches Band markiert die Nummer 1?',
              ['Lig. cruciatum anterius', 'Lig. cruciatum posterius', 'Lig. transversum genus', 'Lig. meniscofemorale posterius'],
              0,
              1500,
              35,
            ),
            'cruciate',
          ),
          // Folie 27: Lig. transversum genus verbindet die Vorderhörner.
          tap('Tibiaplateau mit Menisken von kranial. Tippe auf das Lig. transversum genus.', 'menisci', [4, 9], 1500),
        ].map(tag('atlas')),
      },
      {
        id: 'kn-board',
        type: 'board',
        title: 'Spielfeld: fünf Themen rund ums Knie',
        description:
          'Fünf Themen mit je fünf Feldern von 100 bis 500: je teurer, desto schwerer. Femur und Patella, Tibia und Fibula, Bänder, Menisken sowie Bewegung und Kapsel. Irgendwo verstecken sich Felder ×2 und ×3, und ein Blitzfeld bekommt der Schnellste. Falsche Antworten kosten Punkte.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: [
          category(
            'femur',
            'Femur & Patella',
            [
              // Folie 5: Facies patellaris femoris = Patellagleitlager.
              single('Welcher deutsche Begriff steht auf den Folien für die Facies patellaris femoris?', ['Patellagleitlager', 'Kniekehle', 'Schienbeinplateau', 'Kniescheibenspitze'], 0, 100, 25),
              // Folie 4: Fossa intercondylaris zwischen den Condylen, dorsal.
              bool('Die Fossa intercondylaris liegt ventral am Femur, direkt über der Facies patellaris.', false, 200, 25),
              // Folie 13: Femur und Patella bilden das Art. patellofemoralis.
              textQ(
                'Wie heißt das Teilgelenk des Kniegelenks zwischen Femur und Patella? (Latein)',
                ['Art. patellofemoralis', 'Articulatio patellofemoralis', 'Art patellofemoralis', 'Art. femoropatellaris', 'Articulatio femoropatellaris', 'patellofemoralis'],
                300,
                35,
              ),
              // Folie 6/7: ein First teilt die Facies articularis.
              single('Wodurch wird die Gelenkfläche der Patella in eine laterale und eine mediale Facette geteilt?', ['Durch einen First', 'Durch eine Fossa', 'Durch ein Tuberculum', 'Durch einen Sulcus'], 0, 400, 25),
              // Folie 4: am dorsalen Corpus femoris.
              textQ(
                'Wie heißt die Fläche am dorsalen distalen Femur zwischen der Linea supracondylaris medialis und lateralis? (Latein)',
                ['Facies poplitea', 'Facies poplitea femoris', 'Fac. poplitea'],
                500,
                35,
              ),
            ],
            // Folie 6: Basis kranial.
            single('Wo liegt die Basis patellae?', ['kranial', 'kaudal', 'medial', 'lateral'], 0, 300, 25),
          ),
          category(
            'leg',
            'Tibia & Fibula',
            [
              single('Welcher Knochen liegt am Unterschenkel lateral?', ['Fibula', 'Tibia', 'Patella', 'Talus'], 0, 100, 25),
              // Folie 11: Linea musculi solei an der dorsalen Tibia.
              bool('Die Linea musculi solei liegt auf der Vorderseite der Tibia.', false, 200, 25),
              // Folie 11: Sulcus malleolaris als Gleitrinne für die Sehne des M. tibialis posterior.
              single(
                'Wozu dient der Sulcus malleolaris an der dorsalen Tibia?',
                ['Gleitrinne für die Sehne des M. tibialis posterior', 'Ansatz des Lig. patellae', 'Ursprung des Lig. collaterale tibiale', 'Gelenkfläche für die Patella'],
                0,
                300,
                30,
              ),
              // Folie 40.
              textQ(
                'Wie heißt das Gelenk zwischen Caput fibulae und Condylus lateralis der Tibia? (Latein)',
                ['Art. tibiofibularis superior', 'Articulatio tibiofibularis superior', 'Art. tibiofibulare superior', 'Art tibiofibularis superior', 'Art. tibiofibularis proximalis', 'Articulatio tibiofibularis'],
                400,
                40,
              ),
              // Folie 12: Malleolus lateralis mit Facies articularis malleoli lateralis.
              single(
                'Wie heißt die Gelenkfläche am Malleolus lateralis?',
                ['Facies articularis malleoli lateralis', 'Facies articularis malleoli medialis', 'Facies articularis capitis fibulae', 'Facies malleolaris lateralis'],
                0,
                500,
                30,
              ),
            ],
            // Folie 8 (Abbildung): Malleolengabel.
            single('Wie nennt die Folie die Gabel, die die beiden Knöchel am distalen Unterschenkel bilden?', ['Malleolengabel', 'Tibiaplateau', 'Patellagleitlager', 'Fossa intercondylaris'], 0, 300, 25),
          ),
          category(
            'ligs',
            'Bänder',
            [
              // Folie 18: mit dem Innenmeniskus verwachsen.
              bool('Das Innenband ist mit dem Innenmeniskus verwachsen.', true, 100, 25),
              // Folie 20: Flexion → Entspannung.
              single('Wie verhalten sich die Collateralbänder bei Flexion des Knies?', ['Sie entspannen sich', 'Sie spannen sich an', 'Sie wickeln sich umeinander', 'Sie verkürzen sich aktiv'], 0, 200, 25),
              // Folie 17: LPTL/MPTL = Lig. patellotibiale lat./med.
              pic(
                single(
                  'Die Skizze zeigt zusätzliche Haltebänder der Patella. Wofür steht die Abkürzung MPTL?',
                  ['Lig. patellotibiale mediale', 'Lig. patellofemorale mediale', 'Lig. patellomeniscale mediale', 'Lig. popliteum transversum laterale'],
                  0,
                  300,
                  30,
                ),
                'patellaLigs',
              ),
              // Folien 16, 18, 19.
              match(
                'Wohin ziehen diese Bänder? Ordne zu.',
                [
                  ['Lig. collaterale tibiale', 'unter das Tibiaplateau'],
                  ['Lig. collaterale fibulare', 'zum Caput fibulae'],
                  ['Lig. patellae', 'zur Tuberositas tibiae'],
                ],
                400,
                45,
              ),
              // Folie 23: VKB + Außenband, HKB + Innenband.
              single(
                'Welche Bänder überkreuzen sich zusätzlich und sorgen so für die Verschraubung in Extension?',
                ['VKB mit Außenband, HKB mit Innenband', 'VKB mit Innenband, HKB mit Außenband', 'Innenband mit Lig. patellae', 'VKB mit Lig. patellae, HKB mit Lig. popliteum obliquum'],
                0,
                500,
                35,
              ),
            ],
            // Folie 17: LPFL/MPFL.
            single('Wofür steht die Abkürzung MPFL?', ['Lig. patellofemorale mediale', 'Lig. patellofibulare mediale', 'Lig. popliteofemorale mediale', 'Lig. patellofemorale posterius'], 0, 300, 25),
          ),
          category(
            'menisci',
            'Menisken',
            [
              // Folie 27.
              single('Welche Form haben die Menisken in der Ansicht von kranial?', ['Halbmondförmig', 'Kreisrund', 'Quadratisch', 'Dreieckig'], 0, 100, 25),
              // Folie 31/32.
              bool('Der Meniscus lateralis ist beweglicher als der Meniscus medialis.', true, 200, 25),
              // Folie 33: Verlagerung nach dorsal; Patella rechts = ventral.
              pic(
                single(
                  'Das Bild zeigt ein gebeugtes Knie, die Patella liegt rechts. Wohin verlagern sich die Menisken bei Flexion?',
                  ['Nach dorsal', 'Nach ventral', 'Nach medial', 'Nach kranial'],
                  0,
                  300,
                  30,
                ),
                'shift',
              ),
              // Folie 29.
              single('Aus welchem Kollagen bestehen die Menisken hauptsächlich?', ['Kollagen Typ I', 'Kollagen Typ II', 'Kollagen Typ III', 'Kollagen Typ IV'], 0, 400, 25),
              // Folie 31: Fasern des M. semimembranosus haben Kontakt zum Hinterhorn des Innenmeniskus.
              textQ(
                'Fasern welches Muskels haben Kontakt zum Hinterhorn des Meniscus medialis? (Latein, M. …)',
                ['M. semimembranosus', 'Musculus semimembranosus', 'semimembranosus', 'M semimembranosus', 'M. semimenbranosus', 'semimenbranosus'],
                500,
                35,
              ),
            ],
            // Folie 27.
            single('Wie sind die Menisken in der Area intercondylaris am Knochen fixiert?', ['Über kurze Bänder', 'Über die Quadrizepssehne', 'Über die Patella', 'Gar nicht'], 0, 300, 25),
          ),
          category(
            'motion',
            'Bewegung & Kapsel',
            [
              // Folie 38: Rotation nur über Flexionsstellung.
              bool('Rotationsbewegungen im Kniegelenk sind vor allem in voller Streckung möglich.', false, 100, 25),
              // Folie 38.
              single('Wie nennt man eine Hyperextension im Kniegelenk?', ['Genu recurvatum', 'Genu valgum', 'Genu varum', 'Genu flexum'], 0, 200, 25),
              // Folie 37: Flexion 120–150°.
              pic(slider('Wie viel Grad Flexion sind im Kniegelenk etwa möglich?', { min: 0, max: 180, step: 5 }, 135, { tolerance: 15, zeroBeyond: 45, unit: '°' }, 300, 30), 'flexion'),
              // Folie 38: Stabilität in voller Extension durch die angespannten Collateralbänder.
              single(
                'Woher kommt die Stabilität des Knies in voller Extension?',
                ['Von den angespannten Collateralbändern', 'Von den Menisken allein', 'Von der Patella', 'Von den Bursen'],
                0,
                400,
                25,
              ),
              // Folie 35: intraartikulär, aber extrakapsulär auf die Membrana synovialis bezogen.
              bool('Die Kreuzbänder liegen intraartikulär, bezogen auf die Membrana synovialis aber extrakapsulär.', true, 500, 30),
            ],
            // Folie 37: Extension 5–10°.
            single('Wie viel Grad Überstreckung (Extension) zeigt das Bewegungsschema der Folie?', ['5–10°', '30–40°', '120–150°', '0°'], 0, 300, 25),
          ),
        ],
      },
      {
        id: 'kn-blitz',
        type: 'blitz',
        title: 'Blitz: Wer ist schneller?',
        description:
          'Zwölf kurze Fragen zu Menisken, Bändern, Bursen und Gelenken. Drücke als Erster auf «Antworten»: Du hast 25 Sekunden und einen Versuch. Punkte bekommt nur, wer zuerst richtig antwortet.',
        shuffleOptions: true,
        answerWindow: 25,
        attempts: 1,
        check: 'auto',
        rules: { ...DEFAULT_RULES, partial: null },
        questions: [
          // Folie 19: kein Kontakt zur Kapsel.
          bool('Das Außenband hat keinen Kontakt zur Gelenkkapsel.', true, 300, 25),
          // Folie 31/32: der laterale bildet fast einen Ring.
          bool('Der Meniscus medialis hat die Form eines nahezu geschlossenen Rings.', false, 300, 25),
          // Folie 18: breiter in Höhe des Gelenkspalts.
          bool('Das Innenband ist in Höhe des Gelenkspalts breiter.', true, 300, 25),
          // Folie 39.
          bool('In der Art. tibiofibularis inferior ist nur wenig Bewegungsspielraum vorhanden.', true, 300, 25),
          // Folie 19: nach distal/dorsal zum Caput fibulae.
          bool('Das Außenband zieht vom Epicondylus lateralis femoris schräg nach distal und ventral.', false, 300, 25),
          // Folie 28: keilförmig.
          bool('Im Querschnitt sind die Menisken flach und rechteckig.', false, 300, 25),
          // Folie 16: Retinaculum patellae laterale/mediale, jeweils transversale und longitudinale.
          numeric('Wie viele Retinacula patellae (längs und quer, medial und lateral) nennt die Folie?', 4, 0, 300, 25),
          // Folie 28: außen mit der Kapsel verbunden.
          bool('Die Menisken haben keinerlei Verbindung zur Gelenkkapsel.', false, 300, 25),
          // Folie 28: gleichen Inkongruenz aus.
          bool('Die Menisken gleichen die Inkongruenz zwischen Femur und Tibia aus.', true, 300, 25),
          // Folie 25: Binnenbänder.
          single('Welches dieser Bänder ist ein Binnenband des Kniegelenks?', ['Lig. meniscofemorale posterius', 'Lig. patellae', 'Lig. popliteum obliquum', 'Lig. collaterale tibiale'], 0, 300, 25),
          // Folie 33: bei Extension minimal nach ventral.
          bool('Bei Extension verlagern sich die Menisken stark nach dorsal.', false, 300, 25),
          // Folie 16: Lig. patellae und Retinacula halten die Patella im Lager.
          single('Welches Band hält laut Folie zusammen mit den Retinacula die Patella im Lager?', ['Lig. patellae', 'Lig. popliteum arcuatum', 'Lig. meniscofemorale posterius', 'Lig. capitis fibulae posterius'], 0, 300, 25),
        ].map(tag('blitz')),
      },
      {
        id: 'kn-wipeout',
        type: 'wipeout',
        title: 'Alles oder nichts: von 100 bis 1500',
        description:
          'Acht Fragen, jede teurer und schwerer als die vorige: von 100 bis 1500 Punkten. Eine richtige Antwort legt den Preis in die Bank, ein Fehler verbrennt die ganze Bank. Nach jeder richtigen Antwort entscheidest du: weiter riskieren oder die Bank nehmen.',
        shuffleOptions: true,
        questions: [
          // Folie 16.
          single('Welche Aufgabe haben die Retinacula patellae?', ['Sie halten die Patella in ihrem Lager', 'Sie verbinden die beiden Menisken', 'Sie ernähren den Meniskus', 'Sie verbinden Tibia und Fibula'], 0, 100, 25),
          // Folie 37: Außenrotation 30–40°.
          pic(single('Wie viel Grad Außenrotation sind im gebeugten Knie etwa möglich?', ['30–40°', '5–10°', '60–70°', '90°'], 0, 200, 25), 'rotation'),
          // Folie 30: zentrale Zone über die Synovia per Diffusion.
          pic(
            single(
              'Ernährung des Meniskus: Wie wird die zentrale Zone (Nummer 1) versorgt?',
              ['Über die Synovia durch Diffusion', 'Über Gefäße der Membrana fibrosa', 'Über das Knochenmark der Tibia', 'Über die Kreuzbänder'],
              0,
              300,
              30,
            ),
            'nutrition',
          ),
          // Folie 13: zusammengesetztes Gelenk aus zwei Einzelgelenken mit gemeinsamer Kapsel.
          single(
            'Das Kniegelenk ist ein zusammengesetztes Gelenk. Was bedeutet das laut Folie?',
            [
              'Zwei Einzelgelenke in einer gemeinsamen Kapsel',
              'Zwei Einzelgelenke mit getrennten Kapseln',
              'Drei Knochen, die alle mit der Fibula artikulieren',
              'Ein Gelenk aus Knochen und Knorpel zusammengesetzt',
            ],
            0,
            500,
            30,
          ),
          // Folie 36: Recessi der Membrana synovialis.
          single(
            'Wozu bildet die Membrana synovialis Recessi?',
            ['Zur Oberflächenvergrößerung für Beweglichkeit und Gleiten der Patella', 'Zur Verstärkung der Kreuzbänder', 'Zur Ernährung der Fibula', 'Als Ersatz für die Menisken'],
            0,
            700,
            30,
          ),
          // Folie 18: hemmt Extension, ARO und Aufklappen zur Innenseite.
          single(
            'Was hemmt das Lig. collaterale tibiale laut Folie?',
            [
              'Extension, Außenrotation und Aufklappen zur Innenseite',
              'Flexion, Innenrotation und Aufklappen zur Außenseite',
              'Extension, Innenrotation und Aufklappen zur Außenseite',
              'Flexion, Außenrotation und Aufklappen zur Innenseite',
            ],
            0,
            900,
            35,
          ),
          // Folie 40.
          single(
            'Welche Bänder halten laut Folie die Art. tibiofibularis superior?',
            ['Lig. capitis fibulae anterius und posterius', 'Lig. tibiofibulare anterius und posterius', 'Lig. popliteum obliquum und arcuatum', 'Lig. meniscofemorale anterius und posterius'],
            0,
            1200,
            30,
          ),
          // Folie 33: bei Rotation der Tibia folgen die Menisken den Femurkondylen.
          textQ(
            'Welchen Strukturen folgen die Menisken bei Rotation der Tibia? (ein Wort)',
            ['Femurkondylen', 'den Femurkondylen', 'Femurcondylen', 'Kondylen', 'Condylen', 'Femurkondyle', 'Condyli femoris', 'Femurcondyli'],
            1500,
            35,
          ),
        ].map(tag('wipeout')),
      },
      {
        id: 'kn-puzzles',
        type: 'puzzles',
        title: 'Rätsel: Latein trifft Deutsch',
        description:
          'Drei Rätsel nacheinander: ein Kreuzworträtsel mit deutschen und lateinischen Begriffen, ein Memory, in dem lateinische Namen ihre deutschen Partner suchen, und ein Puzzle aus einer Atlasabbildung des Kniegelenks.',
        questions: [
          // Folien 13–37: Begriffe aus Femur, Tibia, Fibula, Bändern, Menisken und Bewegung; die Sprache steht in jedem Hinweis.
          crossword(
            'Kreuzworträtsel: Deutsch und Latein rund ums Knie. In jedem Hinweis steht, in welcher Sprache das Wort gesucht ist; Umlaute und ß sind eigene Buchstaben.',
            [
              ['Patella', 'Latein: größtes Sesambein des Körpers, eingebettet in die Sehne des M. quadriceps femoris'],
              ['Meniskus', 'Deutsch: halbmondförmige Faserknorpelscheibe zwischen den Gelenkflächen von Ober- und Unterschenkel (Einzahl)'],
              ['Fibula', 'Latein: der schlanke Knochen an der Außenseite des Unterschenkels'],
              ['Kreuzband', 'Deutsch: Lig. cruciatum, ein Wort'],
              ['Tibia', 'Latein: der kräftigere der beiden Unterschenkelknochen'],
              ['Schienbein', 'Deutsch: derselbe kräftige Unterschenkelknochen; sein Vorderrand liegt direkt unter der Haut'],
              ['Rotation', 'Deutsch/Latein: Bewegung des Unterschenkels, die nur im gebeugten Knie möglich ist'],
              ['Außenband', 'Deutsch: Lig. collaterale fibulare'],
            ],
            null,
            1500,
            300,
          ),
          memory(
            'Memory: Finde die Paare «lateinischer Name – deutscher Name».',
            '4x4',
            [
              [{ text: 'Lig. cruciatum anterius' }, { text: 'Vorderes Kreuzband' }],
              [{ text: 'Lig. cruciatum posterius' }, { text: 'Hinteres Kreuzband' }],
              [{ text: 'Lig. collaterale tibiale' }, { text: 'Innenband' }],
              [{ text: 'Lig. collaterale fibulare' }, { text: 'Außenband' }],
              [{ text: 'Meniscus medialis' }, { text: 'Innenmeniskus' }],
              [{ text: 'Meniscus lateralis' }, { text: 'Außenmeniskus' }],
              [{ text: 'Os femoris' }, { text: 'Oberschenkelknochen' }],
              [{ text: 'Lig. patellae' }, { text: 'Kniescheibenband' }],
            ],
            1000,
            150,
            17,
          ),
          // Folie 13: Kniegelenk von ventral und dorsal als Puzzle (Beschriftungen stören hier nicht).
          jigsaw('Puzzle: Setze die Atlasabbildung des Kniegelenks von ventral und dorsal aus 20 Teilen zusammen.', photos('kneePuzzle'), '1:1', 20, 1200, 180, true, 13),
        ].map(tag('puzzle')),
      },
      {
        id: 'kn-auction',
        type: 'auction',
        title: 'Auktion: für echte Kenner',
        description:
          'Die schwersten Fragen des Quiz. Vor dem Bieten ist nur das Thema zu sehen, geboten wird in Schritten von 100 Punkten. Nur der Höchstbietende antwortet: richtig — Einsatz zurück plus Preis der Frage, falsch — Einsatz weg. Bietet niemand, spielen alle.',
        shuffleOptions: true,
        check: 'auto',
        bidMode: 'step',
        bidStep: 100,
        loss: 'bid',
        questions: [
          // Folie 24.
          cut(multi(
            'Kniekehle: Welche dieser Bänder liegen an der Hinterseite des Knies? Wähle alle richtigen Antworten.',
            ['Lig. popliteum obliquum', 'Lig. popliteum arcuatum', 'Lig. popliteofibulare', 'Retinaculum patellae longitudinale mediale', 'Lig. meniscofemorale posterius', 'Lig. collaterale tibiale'],
            [0, 1, 2],
            1000,
            35,
          ), 1),
          // Folie 41.
          cut(textQ(
            'Sprunggelenk: Wie heißt die Verbindung, die als Art. tibiofibularis inferior bezeichnet wird? (Latein, zwei Wörter)',
            ['Syndesmosis tibiofibularis', 'Syndesmosis tibiofibulare', 'Syndesmose tibiofibularis', 'Syndesmosis tibiofibularis distalis', 'Syndesmosis'],
            1200,
            40,
          ), 1),
          // Folie 32: teilweise strahlt der M. popliteus in den Außenmeniskus ein.
          cut(
            textQ(
              'Außenmeniskus: Welcher Muskel strahlt teilweise in den Meniscus lateralis ein? (Latein, M. …)',
              ['M. popliteus', 'Musculus popliteus', 'popliteus', 'M popliteus', 'Popliteus'],
              1500,
              35,
            ),
            1,
          ),
          // Folie 38: Iro — Kreuzbänder wickeln sich umeinander, deshalb kleiner; Aro — sie entdrehen sich.
          cut(single(
            'Rotation: Welche Rotation ist im gebeugten Knie größer — und warum?',
            [
              'Außenrotation, weil sich die Kreuzbänder dabei entdrehen',
              'Innenrotation, weil sich die Kreuzbänder dabei entdrehen',
              'Außenrotation, weil sich die Kreuzbänder dabei umeinander wickeln',
              'Beide sind gleich groß, die Kreuzbänder bleiben unverändert',
            ],
            0,
            2000,
            35,
          ), 1),
        ].map(tag('auction')),
      },
      {
        id: 'kn-final',
        type: 'final',
        title: 'Finale: das Kniegelenk',
        description: 'Die letzte Frage für alle. Setze zuerst geheim einen Teil deiner Punkte, dann antworte: richtig — der Einsatz kommt dazu, falsch — er wird abgezogen.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        // Folie 38: Schlussrotation — Außenrotation der Tibia um ca. 10–15° am Ende der Streckung.
        questions: [
          tag('final')(
            textQ(
              'Am Ende der Streckung dreht sich die Tibia automatisch um etwa 10–15° nach außen, wodurch die Kreuzbänder wieder entspannter werden. Wie heißt dieser Vorgang?',
              ['Schlussrotation', 'Schluss-Rotation', 'Schlussrotation der Tibia', 'Schlußrotation', 'terminale Rotation', 'Schlussrotation des Kniegelenks'],
              0,
              60,
            ),
          ),
        ],
      },
    ],
  };
};
