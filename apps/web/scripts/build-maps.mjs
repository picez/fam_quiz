/**
 * Одноразовий скрипт (не в CI): будує вбудовані мапи для запитань «точка на мапі» з даних Natural Earth 5.1.2
 * (суспільне надбання) і файл опорних точок для демо, тестів і e2e.
 *
 *   node apps/web/scripts/build-maps.mjs <тека-з-geojson>
 *
 * У теці мають лежати (https://github.com/nvkelso/natural-earth-vector, тег v5.1.2, тека geojson/):
 *   ne_10m_admin_0_countries_ukr.geojson     — країни з погляду України (Крим — Україна);
 *   ne_10m_admin_1_states_provinces.geojson  — області України (за кодом ISO 3166-2 «UA-», тож Крим і Севастополь теж);
 *   ne_10m_rivers_lake_centerlines.geojson   — Дніпро.
 * Пише apps/web/public/maps/{world,europe,ukraine}.svg і apps/server/scripts/pin-places.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoConicConformal, geoContains, geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature, merge, mesh } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const MAX_BYTES = 350_000;
const CREDIT = '<!-- Made with Natural Earth. Public domain. naturalearthdata.com -->';
const COLORS = { sea: '#cfe3f0', land: '#f3efe6', border: '#8f8676', neighbor: '#e4e1da', ukraine: '#f7f1df', river: '#7fb0d4' };

const dataDir = process.argv[2];
if (!dataDir) fail('Вкажіть теку з GeoJSON Natural Earth: node apps/web/scripts/build-maps.mjs <тека>');

/** Читає GeoJSON лише як дані. */
const readGeo = (name) => JSON.parse(readFileSync(resolve(dataDir, `${name}.geojson`), 'utf8'));

function fail(message) {
  console.error(`build-maps: ${message}`);
  process.exit(1);
}

// --- Дані ---
const countries = readGeo('ne_10m_admin_0_countries_ukr');
const code = (f) => f.properties.ADM0_A3;
const ukraine = countries.features.find((f) => code(f) === 'UKR');
if (!ukraine) fail('у файлі країн немає України');
if (!geoContains(ukraine, [34.1, 44.95])) fail('Сімферополь не всередині України — потрібен файл *_admin_0_countries_ukr');

const oblasts = {
  type: 'FeatureCollection',
  features: readGeo('ne_10m_admin_1_states_provinces').features.filter((f) => String(f.properties.iso_3166_2).startsWith('UA-')),
};
const isoCodes = new Set(oblasts.features.map((f) => f.properties.iso_3166_2));
if (!isoCodes.has('UA-43') || !isoCodes.has('UA-40')) fail('серед областей немає Криму (UA-43) чи Севастополя (UA-40)');

const dnipro = {
  type: 'FeatureCollection',
  features: readGeo('ne_10m_rivers_lake_centerlines').features.filter((f) => ['Dnipro', 'Dnieper'].includes(f.properties.name)),
};
if (dnipro.features.length === 0) fail('у файлі річок немає Дніпра');

const world = { type: 'FeatureCollection', features: countries.features.filter((f) => code(f) !== 'ATA') };

// --- Міста для опорних точок (довгота, широта) ---
const CITIES = {
  kyiv: [30.5234, 50.4501],
  lviv: [24.0297, 49.8397],
  odesa: [30.7233, 46.4825],
  kharkiv: [36.2304, 49.9935],
  simferopol: [34.1024, 44.9521],
  uzhhorod: [22.2879, 48.6208],
  paris: [2.3522, 48.8566],
  rome: [12.4964, 41.9028],
  berlin: [13.405, 52.52],
  madrid: [-3.7038, 40.4168],
  london: [-0.1276, 51.5072],
  tokyo: [139.6917, 35.6895],
  cairo: [31.2357, 30.0444],
  newYork: [-74.006, 40.7128],
  rio: [-43.1729, -22.9068],
  sydney: [151.2093, -33.8688],
};

/** Рамка з точок по краях прямокутника довгот і широт (для fitExtent). */
function frame(west, east, south, north) {
  const points = [];
  for (let lon = west; lon <= east; lon += 1) points.push([lon, south], [lon, north]);
  for (let lat = south; lat <= north; lat += 1) points.push([west, lat], [east, lat]);
  return { type: 'MultiPoint', coordinates: points };
}

const MAPS = {
  europe: {
    width: 1600,
    height: 1200,
    projection: () => geoConicConformal().rotate([-15, 0]).parallels([40, 65]),
    fit: frame(-25, 45, 34, 71),
    clip: true,
    cities: ['paris', 'rome', 'berlin', 'madrid', 'london', 'kyiv'],
  },
  ukraine: {
    width: 1600,
    height: 1100,
    projection: () => geoConicConformal().rotate([-31, 0]).parallels([45, 51]),
    fit: ukraine,
    clip: true,
    cities: ['kyiv', 'lviv', 'odesa', 'kharkiv', 'simferopol', 'uzhhorod'],
    detail: true,
  },
  world: {
    width: 2000,
    height: 1000,
    projection: () => geoNaturalEarth1(),
    fit: world,
    clip: false,
    cities: ['kyiv', 'tokyo', 'cairo', 'newYork', 'rio', 'sydney'],
  },
};

/** Готова проєкція мапи: вписана в поле з відступом 20, для Європи й України — обрізана по viewBox. */
function projectionOf(map) {
  const projection = map.projection().fitExtent([[20, 20], [map.width - 20, map.height - 20]], map.fit);
  if (map.clip) projection.clipExtent([[0, 0], [map.width, map.height]]);
  return projection;
}

/** SVG мапи, що лишає частку keep вершин з найбільшою вагою (1 — усі). */
function render(map, topo, keep) {
  const simple = simplify(topo, keep < 1 ? quantile(topo, keep) : 0);
  const path = geoPath(projectionOf(map)).digits(1);
  const d = (object) => path(object) ?? '';
  const all = simple.objects.countries;
  const borders = mesh(simple, all, (a, b) => a !== b);
  const body = [];
  body.push(`<rect width="${map.width}" height="${map.height}" fill="${COLORS.sea}"/>`);
  if (map.detail) {
    const others = all.geometries.filter((g) => g.properties.code !== 'UKR');
    const own = all.geometries.filter((g) => g.properties.code === 'UKR');
    body.push(`<path fill="${COLORS.neighbor}" d="${d(merge(simple, others))}"/>`);
    body.push(`<path fill="${COLORS.ukraine}" d="${d(merge(simple, own))}"/>`);
    body.push(`<path fill="none" stroke="${COLORS.border}" stroke-width="0.6" d="${d(mesh(simple, simple.objects.oblasts, (a, b) => a !== b))}"/>`);
    body.push(`<path fill="none" stroke="${COLORS.river}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="${d(feature(simple, simple.objects.dnipro))}"/>`);
  } else {
    body.push(`<path fill="${COLORS.land}" d="${d(merge(simple, all.geometries))}"/>`);
  }
  body.push(`<path fill="none" stroke="${COLORS.border}" stroke-width="1" stroke-linejoin="round" d="${d(borders)}"/>`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.width} ${map.height}" width="${map.width}" height="${map.height}">`,
    CREDIT,
    ...body,
    '</svg>',
    '',
  ].join('\n');
}

/** Країни (і для України — області й Дніпро) однією топологією, щоб спільні межі не дублювалися. */
function topologyOf(map) {
  const objects = {
    countries: {
      type: 'FeatureCollection',
      features: (map.detail ? countries.features : world.features).map((f) => ({ type: 'Feature', properties: { code: code(f) }, geometry: f.geometry })),
    },
  };
  if (map.detail) {
    objects.oblasts = { type: 'FeatureCollection', features: oblasts.features.map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })) };
    objects.dnipro = { type: 'FeatureCollection', features: dnipro.features.map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })) };
  }
  return presimplify(topology(objects, 1e6));
}

const places = {};
for (const name of ['ukraine', 'europe', 'world']) {
  const map = MAPS[name];
  const topo = topologyOf(map);
  // Найменше спрощення, за якого файл уміщується в бюджет (із запасом 10 % до ліміту): двійковий пошук частки вершин.
  const budget = MAX_BYTES * 0.9;
  let svg = render(map, topo, 1);
  if (Buffer.byteLength(svg) > budget) {
    let [low, high] = [0, 1];
    svg = null;
    for (let step = 0; step < 20; step++) {
      const keep = (low + high) / 2;
      const candidate = render(map, topo, keep);
      if (Buffer.byteLength(candidate) <= budget) [low, svg] = [keep, candidate];
      else high = keep;
    }
  }
  if (!svg) fail(`${name}.svg не вміщується в ${MAX_BYTES} байтів`);
  if (Buffer.byteLength(svg) > MAX_BYTES) fail(`${name}.svg більший за ${MAX_BYTES} байтів`);
  console.log(`${name}.svg: ${Buffer.byteLength(svg)} байтів`);
  writeFileSync(resolve(repo, `apps/web/public/maps/${name}.svg`), svg);

  const projection = projectionOf(map);
  places[name] = {};
  for (const city of map.cities) {
    const point = projection(CITIES[city]);
    if (!point) fail(`${city} поза мапою ${name}`);
    const [x, y] = [point[0] / map.width, point[1] / map.height].map((v) => Math.round(v * 1e4) / 1e4);
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) fail(`${city} поза мапою ${name}`);
    places[name][city] = { x, y };
  }
}

const entry = (cities) =>
  Object.entries(cities)
    .map(([city, { x, y }]) => `${city}: { x: ${x}, y: ${y} }`)
    .join(', ');
writeFileSync(
  resolve(repo, 'apps/server/scripts/pin-places.ts'),
  [
    "import type { PinMap } from '@quiz/shared';",
    '',
    '/** Згенеровано apps/web/scripts/build-maps.mjs: частки x/y міст на вбудованих мапах (для демо, тестів і e2e). Не редагувати вручну. */',
    'export const PIN_PLACES = {',
    ...Object.entries(places).map(([name, cities]) => `  ${name}: { ${entry(cities)} },`),
    '} as const satisfies Record<PinMap, Record<string, { x: number; y: number }>>;',
    '',
  ].join('\n'),
);
console.log('build-maps: готово');
