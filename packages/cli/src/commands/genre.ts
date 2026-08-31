import { Command } from "commander";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { listAvailableGenres, readGenreProfile, getBuiltinGenresDir } from "@actalk/inkos-core";
import { findProjectRoot, log, logError } from "../utils.js";
import {
  resolveCliLanguage,
  type CliLanguage,
  formatGenreFieldLabels,
  formatGenreListEmpty,
  formatGenreListHeader,
  formatGenreListTotal,
  formatGenreShowHeader,
  formatGenreCreateSuccess,
  formatGenreCreateCustomize,
  formatGenreOperationError,
  formatGenreNotFound,
  formatGenreAlreadyExists,
  formatBuiltinGenreMissing,
} from "../localization.js";

export function buildGenreTemplate(
  params: {
    readonly id: string;
    readonly name: string;
    readonly numerical: boolean;
    readonly power: boolean;
    readonly era: boolean;
  },
  language: CliLanguage = "zh",
): string {
  if (language === "en") {
    return `---
name: ${params.name}
id: ${params.id}
language: en
chapterTypes: ["progression", "setup", "transition", "payoff"]
fatigueWords: ["shocked", "unbelievable", "incredible"]
numericalSystem: ${params.numerical}
powerScaling: ${params.power}
eraResearch: ${params.era}
pacingRule: "A clear advance or payoff every 2-3 chapters"
satisfactionTypes: ["goal achieved", "obstacle overcome", "truth revealed"]
auditDimensions: [1,2,3,6,7,8,9,10,13,14,15,16,17,18,19]
---

## Genre Taboos

- (add taboos for this genre)

## Narrative Guidance

(describe the narrative focus and style requirements for this genre)
`;
  }

  if (language === "vi") {
    return `---
name: ${params.name}
id: ${params.id}
language: vi
chapterTypes: ["tiến triển", "thiết lập", "chuyển tiếp", "cao trào"]
fatigueWords: ["sững sờ", "không thể tin", "khó tin"]
numericalSystem: ${params.numerical}
powerScaling: ${params.power}
eraResearch: ${params.era}
pacingRule: "Mỗi 2-3 chương cần có một tiến triển hoặc phần thưởng rõ ràng"
satisfactionTypes: ["đạt mục tiêu", "vượt trở ngại", "hé lộ sự thật"]
auditDimensions: [1,2,3,6,7,8,9,10,13,14,15,16,17,18,19]
---

## Điều cấm kỵ của thể loại

- (thêm điều cấm kỵ cho thể loại này)

## Hướng dẫn kể chuyện

(mô tả trọng tâm kể chuyện và yêu cầu phong cách cho thể loại này)
`;
  }

  return `---
name: ${params.name}
id: ${params.id}
language: zh
chapterTypes: ["推进章", "布局章", "过渡章", "回收章"]
fatigueWords: ["震惊", "不可思议", "难以置信"]
numericalSystem: ${params.numerical}
powerScaling: ${params.power}
eraResearch: ${params.era}
pacingRule: "每2-3章有一个明确的进展或反馈"
satisfactionTypes: ["目标达成", "困难克服", "真相揭示"]
auditDimensions: [1,2,3,6,7,8,9,10,13,14,15,16,17,18,19]
---

## 题材禁忌

- (根据题材添加禁忌)

## 叙事指导

(根据题材描述叙事重心和风格要求)
`;
}

export const genreCommand = new Command("genre")
  .description("Manage genre profiles");

genreCommand
  .command("list")
  .option("--lang <language>", "Output language: zh, en, or vi")
  .action(async (opts) => {
    const language = resolveCliLanguage(opts.lang);
    try {
      const root = findProjectRoot();
      const genres = await listAvailableGenres(root);
      if (genres.length === 0) { log(formatGenreListEmpty(language)); return; }
      log(formatGenreListHeader(language));
      for (const g of genres) {
        const tag = g.source === "project" ? "[project]" : "[builtin]";
        log(`  ${g.id.padEnd(12)} ${g.name.padEnd(8)} ${tag}`);
      }
      log(formatGenreListTotal(language, genres.length));
    } catch (e) { logError(formatGenreOperationError(language, "list", String(e))); process.exit(1); }
  });

genreCommand
  .command("show")
  .description("Display a genre profile")
  .argument("<id>", "Genre ID (e.g. xuanhuan, urban, horror)")
  .option("--lang <language>", "Output language: zh, en, or vi")
  .action(async (id: string, opts) => {
    const language = resolveCliLanguage(opts.lang);
    try {
      const root = findProjectRoot();
      const genres = await listAvailableGenres(root);
      if (!genres.some(g => g.id === id)) { logError(formatGenreNotFound(language, id, genres.map(g => g.id).join(", "))); process.exit(1); return; }
      const { profile, body } = await readGenreProfile(root, id);
      const labels = formatGenreFieldLabels(language);
      log(formatGenreShowHeader(language, profile.id, profile.name));
      log(`  ${labels.chapterTypes}:      ${profile.chapterTypes.join(", ")}`);
      log(`  ${labels.fatigueWords}:      ${profile.fatigueWords.join(", ")}`);
      log(`  ${labels.numericalSystem}:   ${profile.numericalSystem}`);
      log(`  ${labels.powerScaling}:      ${profile.powerScaling}`);
      log(`  ${labels.eraResearch}:       ${profile.eraResearch}`);
      log(`  ${labels.pacingRule}:        ${profile.pacingRule}`);
      log(`  ${labels.satisfactionTypes}: ${profile.satisfactionTypes.join(", ")}`);
      log(`  ${labels.auditDimensions}:   ${profile.auditDimensions.join(", ")}`);
      if (body) log(`\n--- ${labels.body} ---\n${body}`);
    } catch (e) { logError(formatGenreOperationError(language, "show", String(e))); process.exit(1); }
  });

genreCommand
  .command("create")
  .description("Scaffold a new genre profile in the project genres/ directory")
  .argument("<id>", "Genre ID (e.g. scifi, wuxia, romance)")
  .option("--name <name>", "Genre display name", "")
  .option("--numerical", "Enable numerical system", false)
  .option("--power", "Enable power scaling", false)
  .option("--era", "Enable era research", false)
  .option("--lang <language>", "Template language: zh, en, or vi (defaults to INKOS_LOCALE/LANG, then zh)")
  .action(async (id: string, opts) => {
    const language = resolveCliLanguage(opts.lang);
    try {
      const root = findProjectRoot(); const genresDir = join(root, "genres"); const filePath = join(genresDir, `${id}.md`);
      try { await readFile(filePath, "utf-8"); logError(formatGenreAlreadyExists(language, filePath)); process.exit(1); } catch { /* absent */ }
      await mkdir(genresDir, { recursive: true });
      const template = buildGenreTemplate({ id, name: opts.name || id, numerical: opts.numerical, power: opts.power, era: opts.era }, language);
      await writeFile(filePath, template, "utf-8");
      log(formatGenreCreateSuccess(language, filePath)); log(formatGenreCreateCustomize(language));
    } catch (e) { logError(formatGenreOperationError(language, "create", String(e))); process.exit(1); }
  });

genreCommand
  .command("copy")
  .description("Copy a built-in genre profile to project for customization")
  .argument("<id>", "Genre ID to copy (e.g. xuanhuan)")
  .option("--lang <language>", "Output language: zh, en, or vi")
  .action(async (id: string, opts) => {
    const language = resolveCliLanguage(opts.lang);
    try {
      const root = findProjectRoot(); const builtinDir = getBuiltinGenresDir(); const srcPath = join(builtinDir, `${id}.md`); const genresDir = join(root, "genres"); const destPath = join(genresDir, `${id}.md`);
      try { await readFile(destPath, "utf-8"); logError(formatGenreAlreadyExists(language, destPath, true)); process.exit(1); } catch { /* absent */ }
      let content: string; try { content = await readFile(srcPath, "utf-8"); } catch { logError(formatBuiltinGenreMissing(language, id)); process.exit(1); return; }
      await mkdir(genresDir, { recursive: true }); await writeFile(destPath, content, "utf-8");
      log(formatGenreCreateSuccess(language, destPath)); log(formatGenreCreateCustomize(language));
    } catch (e) { logError(formatGenreOperationError(language, "copy", String(e))); process.exit(1); }
  });
