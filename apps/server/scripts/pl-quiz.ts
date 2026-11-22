/**
 * Cztery quizy po polsku (dla konta Nasti i bota): sidy `pl-light`, `pl-geo`, `pl-big` i `pl-fun`.
 * Prawie wszystko o Polsce i Polakach, trochę historii świata; bez historii Ukrainy i Ameryki i bez niczego, co wiąże się z rosją.
 * Treść — w scripts/pl; zdjęcia z Wikimedia Commons (PL_*_PHOTOS) wgrywa seed (potrzebny SITE_URL), `pl-fun` zdjęć nie ma.
 */
export { PL_BIG_MEDIA, PL_BIG_PHOTOS, plBigQuiz } from './pl/big';
export { PL_FUN_MEDIA, plFunQuiz } from './pl/fun';
export { PL_GEO_PHOTOS, plGeoQuiz } from './pl/geo';
export { PL_LIGHT_PHOTOS, plLightQuiz } from './pl/light';
