/**
 * pnpm l10n <команда>: переклад з uk і файли для вичитки. Тонка обгортка над src/locales/review-sheet.ts.
 *   todo <lang> [--glossary] [--limit N]   що ще перекладати (JSON)
 *   merge <lang> <file.json>               кладе партію { ключ: переклад }; при issues нічого не пише, код 1
 *   check <lang>                           повна перевірка мови
 *   status <lang>                          draft N, reviewed M
 *   sheet <lang> [--out path]              CSV для вичитки
 *   apply <lang> <file.csv>                застосовує повернутий CSV
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, type Locale } from '@quiz/shared';
import { helpUk } from '../src/help/help-uk';
import { ukMessages } from '../src/i18n';
import { checkLocale, type Issue } from '../src/locales/checks';
import { type BatchIssue, applySheet, mergeBatch, sectionContexts, sheetCsv, sheetRows, statusCounts, todoItems, type Dicts, type Reviewed, type SheetSource } from '../src/locales/review-sheet';
import { pushStrings } from '../src/push/push-strings';

type Target = Exclude<Locale, 'uk'>;

const webDir = fileURLToPath(new URL('..', import.meta.url));
const repoDir = resolve(webDir, '../..');
/** pnpm запускає скрипт у apps/server, а шляхи від людини рахуються від теки, звідки її запущено. */
const callerDir = process.env.INIT_CWD ?? process.cwd();
const localesDir = resolve(webDir, 'src/locales');
const pushDir = resolve(webDir, 'src/push/strings');

const paths = (lang: Target) => ({
  ui: resolve(localesDir, `${lang}.json`),
  help: resolve(localesDir, `${lang}.help.json`),
  push: resolve(pushDir, `${lang}.json`),
  reviewed: resolve(localesDir, `reviewed/${lang}.json`),
});

const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback);

/** Ключі відсортовані за алфавітом, відступ 2, \n у кінці. */
function writeJson(file: string, value: Record<string, unknown>): void {
  const sorted = Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
}

function source(): SheetSource {
  const pushKeys = new Set(Object.keys(pushStrings));
  const ui = Object.fromEntries(Object.entries(ukMessages).filter(([key]) => !pushKeys.has(key)));
  const contexts = sectionContexts(readFileSync(resolve(webDir, 'src/i18n.ts'), 'utf8'));
  return { ui, help: helpUk, push: pushStrings, contexts };
}

function targetOf(lang: Target): Dicts {
  const where = paths(lang);
  return { ui: readJson(where.ui, {}), help: readJson(where.help, {}), push: readJson(where.push, {}) };
}

const reviewedOf = (lang: Target): Reviewed => readJson(paths(lang).reviewed, {});

function writeTarget(lang: Target, target: Dicts): void {
  const where = paths(lang);
  writeJson(where.ui, target.ui);
  writeJson(where.help, target.help);
  writeJson(where.push, target.push);
}

function language(value: string | undefined): Target {
  if (value === undefined || value === 'uk' || !(LOCALES as readonly string[]).includes(value)) {
    throw new Error(`Language must be one of: ${LOCALES.filter((one) => one !== 'uk').join(', ')}`);
  }
  return value as Target;
}

function printIssues(issues: (Issue | BatchIssue)[]): void {
  for (const issue of issues) console.error(`${issue.kind}\t${issue.key}\t${issue.detail}`);
}

function option(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

function main(argv: string[]): number {
  const [command, ...args] = argv;
  const positional = args.filter((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));
  switch (command) {
    case 'todo': {
      const lang = language(positional[0]);
      const limit = option(args, '--limit');
      const items = todoItems(lang, source(), targetOf(lang), {
        glossaryOnly: args.includes('--glossary'),
        limit: limit === undefined ? undefined : Number(limit),
      });
      console.log(JSON.stringify(items, null, 2));
      return 0;
    }
    case 'merge': {
      const lang = language(positional[0]);
      const file = positional[1];
      if (!file) throw new Error('Usage: pnpm l10n merge <lang> <file.json>');
      const batch: unknown = JSON.parse(readFileSync(resolve(callerDir, file), 'utf8'));
      if (typeof batch !== 'object' || batch === null || Array.isArray(batch)) throw new Error('The batch must be a JSON object { key: translation }');
      const { target, issues } = mergeBatch(lang, source(), targetOf(lang), batch as Record<string, string>);
      if (issues.length > 0) {
        printIssues(issues);
        console.error(`${issues.length} issue(s), nothing written`);
        return 1;
      }
      writeTarget(lang, target);
      console.log(`merged ${Object.keys(batch).length} key(s) into ${lang}`);
      return 0;
    }
    case 'check': {
      const lang = language(positional[0]);
      const src = source();
      const issues = checkLocale(lang, src, targetOf(lang));
      if (issues.length === 0) {
        console.log('OK');
        return 0;
      }
      printIssues(issues);
      console.error(`${issues.length} issue(s)`);
      return 1;
    }
    case 'status': {
      const lang = language(positional[0]);
      const counts = statusCounts(lang, source(), targetOf(lang), reviewedOf(lang));
      console.log(`draft ${counts.draft}, reviewed ${counts.reviewed}`);
      return 0;
    }
    case 'sheet': {
      const lang = language(positional[0]);
      const out = resolve(callerDir, option(args, '--out') ?? resolve(repoDir, `docs/l10n/review-${lang}.csv`));
      const rows = sheetRows(lang, source(), targetOf(lang), reviewedOf(lang));
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, sheetCsv(rows));
      console.log(`${rows.length} row(s) -> ${out}`);
      return 0;
    }
    case 'apply': {
      const lang = language(positional[0]);
      const file = positional[1];
      if (!file) throw new Error('Usage: pnpm l10n apply <lang> <file.csv>');
      const result = applySheet(lang, readFileSync(resolve(callerDir, file), 'utf8'), source(), targetOf(lang), reviewedOf(lang));
      writeTarget(lang, result.target);
      writeJson(paths(lang).reviewed, result.reviewed);
      const counts = statusCounts(lang, source(), result.target, result.reviewed);
      console.log(`applied; draft ${counts.draft}, reviewed ${counts.reviewed}`);
      for (const one of result.rejected) console.error(`rejected\t${one.key}\t${one.reason}`);
      if (result.rejected.length > 0) console.error(`${result.rejected.length} row(s) rejected`);
      return result.rejected.length > 0 ? 1 : 0;
    }
    default:
      console.error('Usage: pnpm l10n <todo|merge|check|status|sheet|apply> <lang> [...]');
      return 1;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
