import { Command } from "commander";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { log, logError, GLOBAL_ENV_PATH } from "../utils.js";
import { hasActiveGlobalApiKey, initializeProjectDirectory } from "../project-bootstrap.js";
import { formatCliInitSuccess, formatCliNextSteps, formatCliInitError, resolveCliLanguage } from "../localization.js";

export const initCommand = new Command("init")
  .description("Initialize an InkOS project (current directory by default)")
  .argument("[name]", "Project name (creates subdirectory). Omit to init current directory.")
  .option("--lang <language>", "Default writing language: zh (Chinese), en (English), or vi (Vietnamese)")
  .action(async (name: string | undefined, opts: { lang?: string }) => {
    const projectDir = name ? resolve(process.cwd(), name) : process.cwd();
    const language = resolveCliLanguage(opts.lang);

    try {
      const globalConfigured = await readFile(GLOBAL_ENV_PATH, "utf-8")
        .then(hasActiveGlobalApiKey)
        .catch(() => false);
      await mkdir(projectDir, { recursive: true });
      await initializeProjectDirectory(projectDir, { language, overwriteSupportFiles: true });

      log(formatCliInitSuccess(language, projectDir));
      log("");
      const exampleCreateLines = language === "en"
        ? ["  inkos book create --title 'My Novel' --genre progression --platform royalroad --lang en"]
        : language === "vi"
          ? ["  inkos book create --title 'Tiểu thuyết của tôi' --genre fantasy --platform wattpad --lang vi"]
          : [
            "  inkos book create --title '我的小说' --genre xuanhuan --platform tomato",
            "  # English project? Re-run with: inkos init --lang en",
            "  # Vietnamese project? Re-run with: inkos init --lang vi",
          ];
      if (globalConfigured) {
        log(language === "vi" ? "Đã phát hiện cấu hình LLM global. Có thể bắt đầu." : "Global LLM config detected. Ready to go!");
        log("");
        log(formatCliNextSteps(language));
        if (name) log(`  cd ${name}`);
        for (const line of exampleCreateLines) log(line);
      } else {
        log(formatCliNextSteps(language));
        if (name) log(`  cd ${name}`);
        log(language === "vi" ? "  # Cách 1: Đặt cấu hình global (khuyến nghị, chỉ cần làm một lần):" : "  # Option 1: Set global config (recommended, one-time):");
        log("  inkos config set-global --provider openai --base-url <your-api-url> --api-key <your-key> --model <your-model>");
        log(language === "vi" ? "  # Cách 2: Chỉnh .env chỉ cho project này" : "  # Option 2: Edit .env for this project only");
        log("");
        for (const line of exampleCreateLines) log(line);
      }
      log(language === "vi" ? "  inkos write next <book-id>  # viết chương tiếp theo" : "  inkos write next <book-id>");
    } catch (e) {
      logError(formatCliInitError(language, String(e)));
      process.exit(1);
    }
  });
