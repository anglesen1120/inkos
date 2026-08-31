import { Command } from "commander";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { deriveBookIdFromTitle, normalizePlatformOrOther, PipelineRunner, StateManager, type BookConfig, type FanficMode } from "@actalk/inkos-core";
import { loadConfig, buildPipelineConfig, findProjectRoot, resolveBookId, log, logError } from "../utils.js";
import type { CliLanguage } from "../localization.js";
import {
  formatFanficCanonMissingError,
  formatFanficInvalidModeError,
  formatFanficSourceDirEmptyError,
  formatFanficSourceTooShortError,
  formatFanficCreating,
  formatFanficSource,
  formatFanficCreated,
  formatFanficNextStep,
  formatFanficRefreshing,
  formatFanficRefreshed,
  formatFanficError,
  formatFanficCreateError,
  formatFanficRefreshError,
  resolveCliLanguage,
  resolveCliLanguageFromEnvironment,
} from "../localization.js";

export const fanficCommand = new Command("fanfic")
  .description("Fan fiction writing tools");

fanficCommand
  .command("init")
  .description("Create a fanfic book from external source material")
  .requiredOption("--title <title>", "Book title")
  .requiredOption("--from <path>", "Source file or directory (novel text, wiki, character docs)")
  .option("--mode <mode>", "Fanfic mode: canon|au|ooc|cp", "canon")
  .option("--genre <genre>", "Genre", "other")
  .option("--platform <platform>", "Target platform", "other")
  .option("--target-chapters <n>", "Target chapter count", "100")
  .option("--chapter-words <n>", "Words per chapter", "3000")
  .option("--lang <language>", "Writing language: zh, en, or vi. Defaults from genre.")
  .option("--json", "Output JSON")
  .action(async (opts) => {
    let language = resolveCliLanguage(opts.lang);
    try {
      const config = await loadConfig();
      language = opts.lang
        ? resolveCliLanguage(opts.lang)
        : resolveCliLanguageFromEnvironment() ?? resolveCliLanguage(config.language);
      const root = findProjectRoot();

      const mode = opts.mode as FanficMode;
      if (!["canon", "au", "ooc", "cp"].includes(mode)) {
        throw new Error(formatFanficInvalidModeError(mode, language));
      }

      const sourcePath = resolve(opts.from);
      const sourceText = await readSourceMaterial(sourcePath, language);
      const sourceName = basename(sourcePath);
      if (!sourceText || sourceText.length < 100) {
        throw new Error(formatFanficSourceTooShortError(sourceText.length, language));
      }

      const bookId = deriveBookIdFromTitle(opts.title) || `book-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      const bookLanguage = language;
      const book: BookConfig = {
        id: bookId,
        title: opts.title,
        platform: normalizePlatformOrOther(opts.platform),
        genre: opts.genre,
        status: "outlining",
        targetChapters: parseInt(opts.targetChapters, 10),
        chapterWordCount: parseInt(opts.chapterWords, 10),
        language: bookLanguage,
        createdAt: now,
        updatedAt: now,
        fanficMode: mode,
      };

      if (!opts.json) log(formatFanficCreating(language, book.title, mode, book.genre));
      if (!opts.json) log(formatFanficSource(language, sourceName, sourceText.length));

      const pipeline = new PipelineRunner(buildPipelineConfig(config, root));
      await pipeline.initFanficBook(book, sourceText, sourceName, mode);

      if (opts.json) {
        log(JSON.stringify({
          bookId,
          title: book.title,
          genre: book.genre,
          fanficMode: mode,
          source: sourceName,
          location: `books/${bookId}/`,
          nextStep: `inkos write next ${bookId}`,
        }, null, 2));
      } else {
        log(formatFanficCreated(language, bookId));
        log(language === "vi" ? `  Chế độ: ${mode}` : language === "en" ? `  Mode: ${mode}` : `  模式：${mode}`);
        log(language === "vi" ? `  Vị trí: books/${bookId}/` : language === "en" ? `  Location: books/${bookId}/` : `  位置：books/${bookId}/`);
        log(language === "vi" ? "  Đã tạo fanfic_canon.md và foundation." : language === "en" ? "  fanfic_canon.md + foundation generated." : "  已生成 fanfic_canon.md + foundation。");
        log("");
        log(formatFanficNextStep(language, bookId));
      }
    } catch (e) {
      if (opts.json) {
        log(JSON.stringify({ error: String(e) }));
      } else {
        logError(formatFanficCreateError(language, e));
      }
      process.exit(1);
    }
  });

fanficCommand
  .command("show")
  .description("Display parsed fanfic canon")
  .argument("[book-id]", "Book ID (auto-detected if only one book)")
  .option("--lang <language>", "Output language: zh, en, or vi")
  .option("--json", "Output JSON")
  .action(async (bookIdArg: string | undefined, opts) => {
    const language = resolveCliLanguage(opts.lang);
    try {
      const root = findProjectRoot();
      const bookId = await resolveBookId(bookIdArg, root);
      const state = new StateManager(root);
      const bookDir = state.bookDir(bookId);
      let canon: string;
      try {
        canon = await readFile(join(bookDir, "story/fanfic_canon.md"), "utf-8");
      } catch {
        throw new Error(formatFanficCanonMissingError(language));
      }
      if (opts.json) {
        log(JSON.stringify({ bookId, fanficCanon: canon }, null, 2));
      } else {
        log(language === "vi" ? `Canon fanfic của "${bookId}":\n` : language === "en" ? `Fanfic Canon for "${bookId}":\n` : `同人正典："${bookId}"：\n`);
        log(canon);
      }
    } catch (e) {
      if (opts.json) log(JSON.stringify({ error: String(e) }));
      else logError(formatFanficError(language, e));
      process.exit(1);
    }
  });

fanficCommand
  .command("refresh")
  .description("Re-import source material and regenerate fanfic canon")
  .argument("[book-id]", "Book ID (auto-detected if only one book)")
  .requiredOption("--from <path>", "Source file or directory")
  .option("--lang <language>", "Output language: zh, en, or vi")
  .option("--json", "Output JSON")
  .action(async (bookIdArg: string | undefined, opts) => {
    const language = resolveCliLanguage(opts.lang);
    try {
      const config = await loadConfig();
      const root = findProjectRoot();
      const bookId = await resolveBookId(bookIdArg, root);
      const state = new StateManager(root);
      const book = await state.loadBookConfig(bookId);
      const mode = (book.fanficMode ?? "canon") as FanficMode;
      const sourcePath = resolve(opts.from);
      const sourceText = await readSourceMaterial(sourcePath, language);
      const sourceName = basename(sourcePath);
      if (!opts.json) log(formatFanficRefreshing(language, bookId, sourceName));
      const pipeline = new PipelineRunner(buildPipelineConfig(config, root));
      await pipeline.importFanficCanon(bookId, sourceText, sourceName, mode);
      if (opts.json) {
        log(JSON.stringify({ bookId, source: sourceName, refreshedAt: new Date().toISOString() }));
      } else {
        log(formatFanficRefreshed(language, sourceName));
      }
    } catch (e) {
      if (opts.json) log(JSON.stringify({ error: String(e) }));
      else logError(formatFanficRefreshError(language, e));
      process.exit(1);
    }
  });

async function readSourceMaterial(sourcePath: string, language: CliLanguage = "zh"): Promise<string> {
  const s = await stat(sourcePath);
  if (s.isDirectory()) {
    const files = await readdir(sourcePath);
    const textFiles = files.filter((f) => f.endsWith(".txt") || f.endsWith(".md"));
    if (textFiles.length === 0) {
      throw new Error(formatFanficSourceDirEmptyError(sourcePath, language));
    }
    const contents = await Promise.all(textFiles.sort().map((f) => readFile(join(sourcePath, f), "utf-8")));
    return contents.join("\n\n---\n\n");
  }
  return readFile(sourcePath, "utf-8");
}
