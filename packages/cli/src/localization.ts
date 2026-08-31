import { formatLengthCount, resolveLengthCountingMode } from "@actalk/inkos-core";

export type CliLanguage = "zh" | "en" | "vi";

type WriteIssue = {
  readonly severity: string;
  readonly category: string;
  readonly description: string;
};

type WriteResultShape = {
  readonly chapterNumber: number;
  readonly title: string;
  readonly wordCount: number;
  readonly status: string;
  readonly revised: boolean;
  readonly issues: ReadonlyArray<WriteIssue>;
  readonly auditPassed?: boolean;
  readonly passedAudit?: boolean;
};

type ImportResultShape = {
  readonly importedCount: number;
  readonly totalWords: number;
  readonly nextChapter: number;
  readonly continueBookId: string;
};

function localize(language: CliLanguage, messages: { zh: string; en: string; vi: string }): string {
  return messages[language];
}

function normalizeCliLanguageTag(value: string | undefined): CliLanguage | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("en")) {
    return "en";
  }
  if (normalized === "vi" || normalized.startsWith("vi-") || normalized.startsWith("vi_")) {
    return "vi";
  }
  if (normalized.startsWith("zh")) {
    return "zh";
  }
  return undefined;
}

export function resolveCliLanguageFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): CliLanguage | undefined {
  const requested = normalizeCliLanguageTag(env.INKOS_LOCALE);
  if (requested) {
    return requested;
  }

  return normalizeCliLanguageTag(env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG);
}

export function resolveCliLanguage(
  language?: string,
  env: NodeJS.ProcessEnv = process.env,
): CliLanguage {
  const explicit = normalizeCliLanguageTag(language);
  return explicit ?? resolveCliLanguageFromEnvironment(env) ?? "zh";
}

export function formatBookCreateCreating(
  language: CliLanguage,
  title: string,
  genre: string,
  platform: string,
): string {
  return localize(language, {
    zh: `创建书籍 "${title}"（${genre} / ${platform}）...`,
    en: `Creating book "${title}" (${genre} / ${platform})...`,
    vi: `Đang tạo sách "${title}" (${genre} / ${platform})...`,
  });
}

export function formatBookCreateCreated(language: CliLanguage, bookId: string): string {
  return localize(language, {
    zh: `已创建书籍：${bookId}`,
    en: `Book created: ${bookId}`,
    vi: `Đã tạo sách: ${bookId}`,
  });
}

export function formatBookCreateLocation(language: CliLanguage, bookId: string): string {
  return localize(language, {
    zh: `  位置：books/${bookId}/`,
    en: `  Location: books/${bookId}/`,
    vi: `  Vị trí: books/${bookId}/`,
  });
}

export function formatBookCreateFoundationReady(language: CliLanguage): string {
  return localize(language, {
    zh: "  故事圣经、大纲和书籍规则已生成。",
    en: "  Story bible, outline, book rules generated.",
    vi: "  Đã tạo story bible, dàn ý và quy tắc sách.",
  });
}

export function formatBookCreateNextStep(language: CliLanguage, bookId: string): string {
  return localize(language, {
    zh: `下一步：inkos write next ${bookId}`,
    en: `Next: inkos write next ${bookId}`,
    vi: `Tiếp theo: inkos write next ${bookId}`,
  });
}

export function formatWriteNextProgress(
  language: CliLanguage,
  current: number,
  total: number,
  bookId: string,
): string {
  return localize(language, {
    zh: `[${current}/${total}] 为「${bookId}」撰写章节...`,
    en: `[${current}/${total}] Writing chapter for "${bookId}"...`,
    vi: `[${current}/${total}] Đang viết chương cho "${bookId}"...`,
  });
}

export function formatWriteNextResultLines(
  language: CliLanguage,
  result: WriteResultShape,
): string[] {
  const auditPassed = result.auditPassed ?? result.passedAudit ?? false;
  const lengthLabel = formatLengthCount(result.wordCount, resolveLengthCountingMode(language));
  const lines = [
    localize(language, {
      zh: `  第${result.chapterNumber}章：${result.title}`,
      en: `  Chapter ${result.chapterNumber}: ${result.title}`,
      vi: `  Chương ${result.chapterNumber}: ${result.title}`,
    }),
    localize(language, {
      zh: `  字数：${lengthLabel}`,
      en: `  Length: ${lengthLabel}`,
      vi: `  Độ dài: ${lengthLabel}`,
    }),
    localize(language, {
      zh: `  审计：${auditPassed ? "通过" : "需复核"}`,
      en: `  Audit: ${auditPassed ? "PASSED" : "NEEDS REVIEW"}`,
      vi: `  Kiểm duyệt: ${auditPassed ? "ĐẠT" : "CẦN XEM LẠI"}`,
    }),
  ];

  if (result.revised) {
    lines.push(localize(language, {
      zh: "  自动修正：已执行（已修复关键问题）",
      en: "  Auto-revised: YES (critical issues were fixed)",
      vi: "  Tự động chỉnh sửa: CÓ (đã sửa các vấn đề nghiêm trọng)",
    }));
  }

  lines.push(localize(language, {
    zh: `  状态：${result.status}`,
    en: `  Status: ${result.status}`,
    vi: `  Trạng thái: ${result.status}`,
  }));

  if (result.issues.length > 0) {
    lines.push(localize(language, {
      zh: "  问题：",
      en: "  Issues:",
      vi: "  Vấn đề:",
    }));
    for (const issue of result.issues) {
      lines.push(`    [${issue.severity}] ${issue.category}: ${issue.description}`);
    }
  }

  return lines;
}

export function formatWriteNextComplete(language: CliLanguage): string {
  return localize(language, {
    zh: "完成。",
    en: "Done.",
    vi: "Hoàn tất.",
  });
}

export function formatAutoWriteStart(
  language: CliLanguage,
  bookId: string,
  startChapter: number,
  targetChapter: number,
): string {
  return localize(language, {
    zh: `自动写作「${bookId}」：从第${startChapter}章连续写到第${targetChapter}章...`,
    en: `Auto-writing "${bookId}": chapter ${startChapter} through chapter ${targetChapter}...`,
    vi: `Tự động viết "${bookId}": từ chương ${startChapter} đến chương ${targetChapter}...`,
  });
}

export function formatAutoWriteAlreadyComplete(
  language: CliLanguage,
  bookId: string,
  writtenChapters: number,
  targetChapter: number,
): string {
  return localize(language, {
    zh: `「${bookId}」已写到第${writtenChapters}章（目标第${targetChapter}章），无需继续。`,
    en: `"${bookId}" already has ${writtenChapters} chapter(s) written (target: chapter ${targetChapter}). Nothing to do.`,
    vi: `"${bookId}" đã có ${writtenChapters} chương (mục tiêu: chương ${targetChapter}). Không cần làm gì thêm.`,
  });
}

export type NotifyCommandAction = "write-next" | "write-rewrite" | "revise" | "audit" | "auto";

const NOTIFY_ACTION_LABELS: Record<NotifyCommandAction, { zh: string; en: string; vi: string }> = {
  "write-next": { zh: "写作", en: "Write", vi: "Viết" },
  "write-rewrite": { zh: "重写", en: "Rewrite", vi: "Viết lại" },
  revise: { zh: "修订", en: "Revise", vi: "Chỉnh sửa" },
  audit: { zh: "审计", en: "Audit", vi: "Kiểm duyệt" },
  auto: { zh: "自动连写", en: "Auto-write", vi: "Tự động viết" },
};

export function formatNotifyCommandTitle(
  language: CliLanguage,
  action: NotifyCommandAction,
  bookName: string | undefined,
  succeeded: boolean,
): string {
  const label = localize(language, NOTIFY_ACTION_LABELS[action]);
  const book = bookName === undefined
    ? ""
    : localize(language, { zh: `《${bookName}》`, en: `: ${bookName}`, vi: `: ${bookName}` });
  return succeeded
    ? localize(language, { zh: `✅ ${label}完成${book}`, en: `✅ ${label} complete${book}`, vi: `✅ ${label} hoàn tất${book}` })
    : localize(language, { zh: `❌ ${label}失败${book}`, en: `❌ ${label} failed${book}`, vi: `❌ ${label} thất bại${book}` });
}

export function formatNotifyBatchWriteBody(
  language: CliLanguage,
  chapters: ReadonlyArray<{
    readonly chapterNumber: number;
    readonly title: string;
    readonly wordCount: number;
    readonly auditPassed: boolean;
  }>,
): string {
  const first = chapters[0]!;
  const last = chapters[chapters.length - 1]!;
  const lines = [
    localize(language, {
      zh: `本次完成 ${chapters.length} 章（第${first.chapterNumber}章到第${last.chapterNumber}章）`,
      en: `${chapters.length} chapter(s) written (chapter ${first.chapterNumber} to ${last.chapterNumber})`,
      vi: `Đã viết ${chapters.length} chương (từ chương ${first.chapterNumber} đến chương ${last.chapterNumber})`,
    }),
    ...chapters.map((ch) => {
      const lengthLabel = formatLengthCount(ch.wordCount, resolveLengthCountingMode(language));
      return localize(language, {
        zh: `第${ch.chapterNumber}章 ${ch.title} | ${lengthLabel} | ${ch.auditPassed ? "审计通过" : "需复核"}`,
        en: `Chapter ${ch.chapterNumber} ${ch.title} | ${lengthLabel} | ${ch.auditPassed ? "audit passed" : "needs review"}`,
        vi: `Chương ${ch.chapterNumber} ${ch.title} | ${lengthLabel} | ${ch.auditPassed ? "kiểm duyệt đạt" : "cần xem lại"}`,
      });
    }),
  ];
  return lines.join("\n");
}

export function formatNotifyAuditBody(
  language: CliLanguage,
  result: {
    readonly chapterNumber: number;
    readonly passed: boolean;
    readonly issueCount: number;
    readonly summary: string;
  },
): string {
  const head = localize(language, {
    zh: `第${result.chapterNumber}章审计${result.passed ? "通过" : "未通过"}（${result.issueCount} 个问题）`,
    en: `Chapter ${result.chapterNumber} audit ${result.passed ? "passed" : "failed"} (${result.issueCount} issue(s))`,
    vi: `Chương ${result.chapterNumber} kiểm duyệt ${result.passed ? "đạt" : "không đạt"} (${result.issueCount} vấn đề)`,
  });
  return result.summary ? `${head}\n${result.summary}` : head;
}

export function formatNotifyReviseBody(
  language: CliLanguage,
  result: {
    readonly chapterNumber: number;
    readonly applied: boolean;
    readonly wordCount: number;
    readonly fixedCount: number;
    readonly skippedReason?: string;
  },
): string {
  if (!result.applied) {
    return localize(language, {
      zh: `第${result.chapterNumber}章保留原稿${result.skippedReason ? `：${result.skippedReason}` : ""}`,
      en: `Chapter ${result.chapterNumber} kept original draft${result.skippedReason ? `: ${result.skippedReason}` : ""}`,
      vi: `Chương ${result.chapterNumber} giữ bản nháp gốc${result.skippedReason ? `: ${result.skippedReason}` : ""}`,
    });
  }
  const lengthLabel = formatLengthCount(result.wordCount, resolveLengthCountingMode(language));
  return localize(language, {
    zh: `第${result.chapterNumber}章已修订 | ${lengthLabel} | 修复 ${result.fixedCount} 个问题`,
    en: `Chapter ${result.chapterNumber} revised | ${lengthLabel} | ${result.fixedCount} issue(s) fixed`,
    vi: `Chương ${result.chapterNumber} đã chỉnh sửa | ${lengthLabel} | đã sửa ${result.fixedCount} vấn đề`,
  });
}

export function formatNotifyFailureBody(language: CliLanguage, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return localize(language, {
    zh: `错误：${detail}`,
    en: `Error: ${detail}`,
    vi: `Lỗi: ${detail}`,
  });
}

export function formatImportChaptersDiscovery(
  language: CliLanguage,
  chapterCount: number,
  bookId: string,
): string {
  return localize(language, {
    zh: `发现 ${chapterCount} 章，准备导入到「${bookId}」。`,
    en: `Found ${chapterCount} chapters to import into "${bookId}".`,
    vi: `Tìm thấy ${chapterCount} chương để nhập vào "${bookId}".`,
  });
}

export function formatImportChaptersResume(
  language: CliLanguage,
  resumeFrom: number,
): string {
  return localize(language, {
    zh: `从第 ${resumeFrom} 章继续导入。`,
    en: `Resuming from chapter ${resumeFrom}.`,
    vi: `Tiếp tục từ chương ${resumeFrom}.`,
  });
}

export function formatImportChaptersComplete(
  language: CliLanguage,
  result: ImportResultShape,
): string[] {
  const lengthLabel = formatLengthCount(result.totalWords, resolveLengthCountingMode(language));
  return [
    localize(language, {
      zh: "导入完成：",
      en: "Import complete:",
      vi: "Nhập hoàn tất:",
    }),
    localize(language, {
      zh: `  已导入章节：${result.importedCount}`,
      en: `  Chapters imported: ${result.importedCount}`,
      vi: `  Số chương đã nhập: ${result.importedCount}`,
    }),
    localize(language, {
      zh: `  总长度：${lengthLabel}`,
      en: `  Total length: ${lengthLabel}`,
      vi: `  Tổng độ dài: ${lengthLabel}`,
    }),
    localize(language, {
      zh: `  下一章编号：${result.nextChapter}`,
      en: `  Next chapter number: ${result.nextChapter}`,
      vi: `  Số chương tiếp theo: ${result.nextChapter}`,
    }),
    "",
    localize(language, {
      zh: `运行 "inkos write next ${result.continueBookId}" 继续写作。`,
      en: `Run "inkos write next ${result.continueBookId}" to continue writing.`,
      vi: `Chạy "inkos write next ${result.continueBookId}" để tiếp tục viết.`,
    }),
  ];
}

export function formatImportCanonStart(
  language: CliLanguage,
  parentBookId: string,
  targetBookId: string,
): string {
  return localize(language, {
    zh: `把 "${parentBookId}" 的正典导入到 "${targetBookId}"...`,
    en: `Importing canon from "${parentBookId}" into "${targetBookId}"...`,
    vi: `Đang nhập canon từ "${parentBookId}" vào "${targetBookId}"...`,
  });
}

export function formatImportCanonComplete(language: CliLanguage): string[] {
  return [
    localize(language, {
      zh: "正典已导入：story/parent_canon.md",
      en: "Canon imported: story/parent_canon.md",
      vi: "Đã nhập canon: story/parent_canon.md",
    }),
    localize(language, {
      zh: "Writer 和 auditor 会在番外模式下自动识别这个文件。",
      en: "Writer and auditor will auto-detect this file for spinoff mode.",
      vi: "Writer và auditor sẽ tự nhận diện file này trong chế độ ngoại truyện.",
    }),
  ];
}

export function formatListModelsEmpty(language: CliLanguage, service: string): string {
  return localize(language, {
    zh: `${service} 没有可用模型（可能需要 --api-key 和 --base-url）`,
    en: `No models available for ${service} (you may need --api-key and --base-url)`,
    vi: `Không có model nào cho ${service} (có thể bạn cần --api-key và --base-url)`,
  });
}

export function formatListModelsHeader(
  language: CliLanguage,
  service: string,
  count: number,
): string {
  return localize(language, {
    zh: `${service}：${count} 个模型`,
    en: `${service}: ${count} model(s)`,
    vi: `${service}: ${count} model`,
  });
}

export function formatDoctorHintQuota(language: CliLanguage): string {
  return localize(language, {
    zh: "检查 API Key 是否正确、模型是否可用，以及账号余额或配额是否足够。",
    en: "Check that the API key is valid, the model is available, and the account has enough balance or quota.",
    vi: "Kiểm tra API key có hợp lệ, model có khả dụng và tài khoản còn đủ số dư hoặc hạn mức hay không.",
  });
}

export function formatDoctorHintOpenAiProbeExhausted(language: CliLanguage): string {
  return localize(language, {
    zh: "当前已自动尝试 chat/responses 与流式开关组合；如果仍失败，问题更可能在模型名、baseUrl 路径或服务商兼容性本身。",
    en: "All chat/responses and stream on/off combinations were already probed; if it still fails, the problem is more likely the model name, the baseUrl path, or provider compatibility itself.",
    vi: "Đã thử tất cả tổ hợp chat/responses và bật/tắt stream; nếu vẫn lỗi, nguyên nhân có thể là tên model, đường dẫn baseUrl hoặc khả năng tương thích của nhà cung cấp.",
  });
}

export function formatDoctorHintBaseUrl(language: CliLanguage): string {
  return localize(language, {
    zh: "baseUrl 可能不正确，检查 INKOS_LLM_BASE_URL 是否包含完整路径（如 /v1）",
    en: "The baseUrl may be wrong. Check that INKOS_LLM_BASE_URL includes the full path (e.g. /v1).",
    vi: "baseUrl có thể sai. Kiểm tra INKOS_LLM_BASE_URL đã bao gồm đường dẫn đầy đủ (ví dụ /v1) chưa.",
  });
}

export function formatDoctorHintStreamRequirement(language: CliLanguage): string {
  return localize(language, {
    zh: "检查提供方文档，确认该接口要求 stream=true、stream=false，还是根本不支持 stream",
    en: "Check the provider docs to confirm whether the endpoint requires stream=true, stream=false, or does not support streaming at all.",
    vi: "Kiểm tra tài liệu nhà cung cấp để xác nhận endpoint yêu cầu stream=true, stream=false hay hoàn toàn không hỗ trợ streaming.",
  });
}

export function formatDoctorHintModelName(language: CliLanguage): string {
  return localize(language, {
    zh: "检查模型名称是否正确（INKOS_LLM_MODEL）",
    en: "Check that the model name is correct (INKOS_LLM_MODEL).",
    vi: "Kiểm tra tên model có đúng không (INKOS_LLM_MODEL).",
  });
}

export function formatDoctorHintInvalidApiKey(language: CliLanguage): string {
  return localize(language, {
    zh: "API Key 无效，检查 INKOS_LLM_API_KEY",
    en: "The API key is invalid. Check INKOS_LLM_API_KEY.",
    vi: "API key không hợp lệ. Kiểm tra INKOS_LLM_API_KEY.",
  });
}

// Fanfic errors are intentionally bilingual in a single string: they can surface
// through `--json` output or be rethrown before any book language is known.
export function formatFanficInvalidModeError(mode: string, language: CliLanguage = "zh"): string {
  return localize(language, {
    zh: `无效的同人模式："${mode}"，可选 canon、au、ooc、cp`,
    en: `Invalid fanfic mode: "${mode}". Valid modes: canon, au, ooc, cp`,
    vi: `Chế độ fanfic không hợp lệ: "${mode}". Chế độ hợp lệ: canon, au, ooc, cp`,
  });
}

export function formatFanficSourceTooShortError(length: number, language: CliLanguage = "zh"): string {
  return localize(language, {
    zh: `源素材内容过短，仅 ${length} 字符，请提供至少 100 字符的原作素材`,
    en: `Source material too short (${length} chars); provide at least 100 chars`,
    vi: `Nguồn tư liệu quá ngắn (${length} ký tự); cần ít nhất 100 ký tự`,
  });
}

export function formatFanficCanonMissingError(language: CliLanguage = "zh"): string {
  return localize(language, {
    zh: "该书没有同人正典文件，用 inkos fanfic init 创建同人书",
    en: "No fanfic canon found for this book. Create one with `inkos fanfic init`",
    vi: "Không tìm thấy canon fanfic cho sách này. Hãy tạo bằng `inkos fanfic init`",
  });
}

export function formatFanficSourceDirEmptyError(sourcePath: string, language: CliLanguage = "zh"): string {
  return localize(language, {
    zh: `目录 ${sourcePath} 中没有 .txt 或 .md 文件`,
    en: `No .txt or .md files found in ${sourcePath}`,
    vi: `Không tìm thấy file .txt hoặc .md nào trong ${sourcePath}`,
  });
}

export function formatFanficCreating(language: CliLanguage, title: string, mode: string, genre: string): string {
  return localize(language, { zh: `创建同人文 "${title}"（${mode} 模式，${genre}）...`, en: `Creating fanfic "${title}" (${mode} mode, ${genre})...`, vi: `Đang tạo fanfic "${title}" (chế độ ${mode}, ${genre})...` });
}
export function formatFanficSource(language: CliLanguage, name: string, length: number): string {
  return localize(language, { zh: `  来源：${name}（${length} 字符）`, en: `  Source: ${name} (${length} chars)`, vi: `  Nguồn: ${name} (${length} ký tự)` });
}
export function formatFanficCreated(language: CliLanguage, bookId: string): string {
  return localize(language, { zh: `同人文已创建：${bookId}`, en: `Fanfic created: ${bookId}`, vi: `Đã tạo fanfic: ${bookId}` });
}
export function formatFanficNextStep(language: CliLanguage, bookId: string): string {
  return localize(language, { zh: `下一步：inkos write next ${bookId}`, en: `Next: inkos write next ${bookId}`, vi: `Tiếp theo: inkos write next ${bookId}` });
}
export function formatFanficRefreshing(language: CliLanguage, bookId: string, source: string): string {
  return localize(language, { zh: `正在为 "${bookId}" 从 ${source} 刷新同人正典...`, en: `Refreshing fanfic canon for "${bookId}" from ${source}...`, vi: `Đang làm mới canon fanfic cho "${bookId}" từ ${source}...` });
}
export function formatFanficRefreshed(language: CliLanguage, source: string): string {
  return localize(language, { zh: `已从 "${source}" 刷新正典。`, en: `Canon refreshed from "${source}".`, vi: `Đã làm mới canon từ "${source}".` });
}
export function formatFanficMode(language: CliLanguage, mode: string): string {
  return localize(language, { zh: `  模式：${mode}`, en: `  Mode: ${mode}`, vi: `  Chế độ: ${mode}` });
}
export function formatFanficLocation(language: CliLanguage, bookId: string): string {
  return localize(language, { zh: `  位置：books/${bookId}/`, en: `  Location: books/${bookId}/`, vi: `  Vị trí: books/${bookId}/` });
}
export function formatFanficGenerated(language: CliLanguage): string {
  return localize(language, { zh: "  已生成 fanfic_canon.md + foundation。", en: "  fanfic_canon.md + foundation generated.", vi: "  Đã tạo fanfic_canon.md và foundation." });
}
export function formatFanficShowHeader(language: CliLanguage, bookId: string): string {
  return localize(language, { zh: `同人正典："${bookId}"：\n`, en: `Fanfic Canon for "${bookId}":\n`, vi: `Canon fanfic của "${bookId}":\n` });
}

export function formatFanficCreateError(language: CliLanguage, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return localize(language, { zh: `创建同人文失败：${detail}`, en: `Failed to create fanfic: ${detail}`, vi: `Không thể tạo fanfic: ${detail}` });
}
export function formatFanficError(language: CliLanguage, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return localize(language, { zh: `显示同人文失败：${detail}`, en: `Failed to show fanfic: ${detail}`, vi: `Không thể hiển thị fanfic: ${detail}` });
}
export function formatFanficRefreshError(language: CliLanguage, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return localize(language, { zh: `刷新正典失败：${detail}`, en: `Failed to refresh canon: ${detail}`, vi: `Không thể làm mới canon: ${detail}` });
}
export function formatGenreFieldLabels(language: CliLanguage): Record<string, string> {
  return language === "vi"
    ? { chapterTypes: "Loại chương", fatigueWords: "Từ gây mệt mỏi", numericalSystem: "Hệ thống số", powerScaling: "Tăng cấp sức mạnh", eraResearch: "Nghiên cứu thời đại", pacingRule: "Quy tắc nhịp độ", satisfactionTypes: "Kiểu thỏa mãn", auditDimensions: "Chiều kiểm duyệt", body: "Nội dung" }
    : language === "en"
      ? { chapterTypes: "Chapter types", fatigueWords: "Fatigue words", numericalSystem: "Numerical system", powerScaling: "Power scaling", eraResearch: "Era research", pacingRule: "Pacing rule", satisfactionTypes: "Satisfaction types", auditDimensions: "Audit dimensions", body: "Body" }
      : { chapterTypes: "章节类型", fatigueWords: "疲劳词", numericalSystem: "数值体系", powerScaling: "力量体系", eraResearch: "时代考据", pacingRule: "节奏规则", satisfactionTypes: "爽点类型", auditDimensions: "审计维度", body: "正文" };
}
export function formatGenreListEmpty(language: CliLanguage): string { return localize(language, { zh: "未找到题材档案。", en: "No genre profiles found.", vi: "Chưa tìm thấy hồ sơ thể loại." }); }
export function formatGenreListHeader(language: CliLanguage): string { return localize(language, { zh: "可用题材：\n", en: "Available genres:\n", vi: "Các thể loại có sẵn:\n" }); }
export function formatGenreListTotal(language: CliLanguage, count: number): string { return localize(language, { zh: `\n总计：${count} 个题材`, en: `\nTotal: ${count} genre(s)`, vi: `\nTổng cộng: ${count} thể loại` }); }
export function formatGenreShowHeader(language: CliLanguage, id: string, name: string): string { return localize(language, { zh: `题材：${name}（${id}）\n`, en: `Genre: ${name} (${id})\n`, vi: `Thể loại: ${name} (${id})\n` }); }
export function formatGenreCreateSuccess(language: CliLanguage, path: string): string { return localize(language, { zh: `已创建题材档案：${path}`, en: `Created genre profile: ${path}`, vi: `Đã tạo hồ sơ thể loại: ${path}` }); }
export function formatGenreCreateCustomize(language: CliLanguage): string { return localize(language, { zh: "编辑文件以自定义章节类型、疲劳词、规则等。", en: "Edit the file to customize chapter types, fatigue words, rules, etc.", vi: "Chỉnh sửa file để tùy biến loại chương, từ gây mệt mỏi, quy tắc, v.v." }); }
export function formatGenreError(language: CliLanguage, error: string): string { return localize(language, { zh: `创建题材失败：${error}`, en: `Failed to create genre: ${error}`, vi: `Không thể tạo thể loại: ${error}` }); }
export function formatGenreOperationError(language: CliLanguage, operation: string, error: string): string {
  return localize(language, { zh: `${operation}题材失败：${error}`, en: `Failed to ${operation} genre: ${error}`, vi: `Không thể ${operation} thể loại: ${error}` });
}
export function formatGenreNotFound(language: CliLanguage, id: string, available: string): string {
  return localize(language, { zh: `未找到题材 "${id}"。可用：${available}`, en: `Genre "${id}" not found. Available: ${available}`, vi: `Không tìm thấy thể loại "${id}". Có sẵn: ${available}` });
}
export function formatGenreAlreadyExists(language: CliLanguage, path: string, project = false): string {
  return localize(language, { zh: `${project ? "项目" : "题材档案"}已存在：${path}`, en: `${project ? "Project genre profile" : "Genre profile"} already exists: ${path}`, vi: `${project ? "Hồ sơ thể loại dự án" : "Hồ sơ thể loại"} đã tồn tại: ${path}` });
}
export function formatBuiltinGenreMissing(language: CliLanguage, id: string): string {
  return localize(language, { zh: `未找到内置题材 "${id}"。使用 'inkos genre list' 查看可用题材。`, en: `Built-in genre "${id}" not found. Use 'inkos genre list' to see available genres.`, vi: `Không tìm thấy thể loại dựng sẵn "${id}". Dùng 'inkos genre list' để xem các thể loại.` });
}

export function formatChapterSyncNoChanges(language: CliLanguage, checked: number): string {
  return localize(language, {
    zh: `已核对 ${checked} 章，index.json 字数无需修正。`,
    en: `Checked ${checked} chapter(s); index.json word counts already match the files.`,
    vi: `Đã kiểm tra ${checked} chương; số từ trong index.json đã khớp với các file.`,
  });
}

export function formatChapterSyncChange(
  language: CliLanguage,
  change: { number: number; title: string; previousWordCount: number; wordCount: number },
  countingMode: "zh_chars" | "en_words" | "vi_words",
): string {
  const from = formatLengthCount(change.previousWordCount, countingMode);
  const to = formatLengthCount(change.wordCount, countingMode);
  return localize(language, {
    zh: `  第${change.number}章 ${change.title}：${from} → ${to}`,
    en: `  Chapter ${change.number} ${change.title}: ${from} → ${to}`,
    vi: `  Chương ${change.number} ${change.title}: ${from} → ${to}`,
  });
}

export function formatChapterSyncSummary(language: CliLanguage, changed: number, checked: number): string {
  return localize(language, {
    zh: `已核对 ${checked} 章，修正了 ${changed} 章的 index.json 字数。`,
    en: `Checked ${checked} chapter(s); corrected ${changed} index.json word count(s).`,
    vi: `Đã kiểm tra ${checked} chương; đã sửa số từ trong index.json cho ${changed} chương.`,
  });
}

export function formatChapterSyncMissingFiles(language: CliLanguage, numbers: ReadonlyArray<number>): string {
  return localize(language, {
    zh: `警告：index.json 中的第 ${numbers.join("、")} 章找不到对应的章节文件，已跳过。`,
    en: `Warning: chapter(s) ${numbers.join(", ")} exist in index.json but have no chapter file on disk; skipped.`,
    vi: `Cảnh báo: chương ${numbers.join(", ")} có trong index.json nhưng không có file chương trên đĩa; đã bỏ qua.`,
  });
}

export function formatChapterDeleteConfirm(
  language: CliLanguage,
  params: { bookTitle: string; bookId: string; number: number; title: string },
): string {
  return localize(language, {
    zh: `将删除《${params.bookTitle}》(${params.bookId}) 的最新章：第${params.number}章 ${params.title}。`
      + `章节文件会移入 chapters/.trash/，索引和故事状态回滚到第${params.number - 1}章。确认删除？(y/N) `,
    en: `Delete the latest chapter of "${params.bookTitle}" (${params.bookId}): chapter ${params.number} ${params.title}? `
      + `The chapter file moves to chapters/.trash/ and the index and story state roll back to chapter ${params.number - 1}. (y/N) `,
    vi: `Xóa chương mới nhất của "${params.bookTitle}" (${params.bookId}): chương ${params.number} ${params.title}? `
      + `File chương sẽ chuyển vào chapters/.trash/, còn index và trạng thái truyện quay lại chương ${params.number - 1}. (y/N) `,
  });
}

export function formatChapterDeleteCancelled(language: CliLanguage): string {
  return localize(language, {
    zh: "已取消。",
    en: "Cancelled.",
    vi: "Đã hủy.",
  });
}

export function formatChapterDeleteDone(
  language: CliLanguage,
  params: { number: number; title: string; trashedFiles: ReadonlyArray<string>; rolledBackTo: number },
): string {
  const trashNote = params.trashedFiles.length > 0
    ? params.trashedFiles.join(", ")
    : localize(language, { zh: "（章节文件已不存在，未移动）", en: "(chapter file was already gone; nothing moved)", vi: "(file chương đã không còn; không di chuyển gì)" });
  return localize(language, {
    zh: `已删除第${params.number}章 ${params.title}：章节文件保留在 ${trashNote}，索引和故事状态已回滚到第${params.rolledBackTo}章。`,
    en: `Deleted chapter ${params.number} ${params.title}: chapter file kept at ${trashNote}; index and story state rolled back to chapter ${params.rolledBackTo}.`,
    vi: `Đã xóa chương ${params.number} ${params.title}: file chương được giữ tại ${trashNote}; index và trạng thái truyện đã quay lại chương ${params.rolledBackTo}.`,
  });
}

export function formatBookBackupCreated(language: CliLanguage, bookId: string, backupId: string): string {
  return localize(language, {
    zh: `已备份 ${bookId} → .inkos/backups/${bookId}/${backupId}/`,
    en: `Backed up ${bookId} → .inkos/backups/${bookId}/${backupId}/`,
    vi: `Đã sao lưu ${bookId} → .inkos/backups/${bookId}/${backupId}/`,
  });
}

export function formatBookBackupListEmpty(language: CliLanguage, bookId: string): string {
  return localize(language, {
    zh: `${bookId} 还没有备份。用 inkos book backup ${bookId} 创建一份。`,
    en: `No backups for ${bookId} yet. Create one with: inkos book backup ${bookId}`,
    vi: `${bookId} chưa có bản sao lưu. Tạo bằng: inkos book backup ${bookId}`,
  });
}

export function formatBookRestoreDone(
  language: CliLanguage,
  params: { bookId: string; backupId: string; preRestoreBackupId: string | null },
): string {
  const preNote = params.preRestoreBackupId
    ? localize(language, {
        zh: `恢复前的状态已自动备份为 ${params.preRestoreBackupId}。`,
        en: `The pre-restore state was automatically backed up as ${params.preRestoreBackupId}.`,
        vi: `Trạng thái trước khi khôi phục đã được tự động sao lưu thành ${params.preRestoreBackupId}.`,
      })
    : localize(language, {
        zh: "书目录当时不存在，未创建恢复前备份。",
        en: "The book directory did not exist, so no pre-restore backup was created.",
        vi: "Thư mục sách không tồn tại, nên không tạo bản sao lưu trước khi khôi phục.",
      });
  return localize(language, {
    zh: `已把 ${params.bookId} 恢复到备份 ${params.backupId}。${preNote}`,
    en: `Restored ${params.bookId} to backup ${params.backupId}. ${preNote}`,
    vi: `Đã khôi phục ${params.bookId} về bản sao lưu ${params.backupId}. ${preNote}`,
  });
}
export function formatCliInitSuccess(language: CliLanguage, projectDir: string): string {
  return localize(language, {
    zh: `项目已初始化于 ${projectDir}`,
    en: `Project initialized at ${projectDir}`,
    vi: `Đã khởi tạo project tại ${projectDir}`,
  });
}

export function formatCliNextSteps(language: CliLanguage): string {
  return localize(language, { zh: "下一步：", en: "Next steps:", vi: "Bước tiếp theo:" });
}

export function formatCliSetupRequired(language: CliLanguage): string {
  return localize(language, {
    zh: "尚未配置 LLM。请先运行 inkos setup 或 inkos config set-global。",
    en: "LLM is not configured. Run inkos setup or inkos config set-global first.",
    vi: "Chưa có cấu hình LLM. Hãy chạy inkos setup hoặc inkos config set-global trước.",
  });
}

export function formatCliApiError(language: CliLanguage, error: string): string {
  return localize(language, { zh: `API 错误：${error}`, en: `API error: ${error}`, vi: `Lỗi API: ${error}` });
}

export function formatCliNoBooks(language: CliLanguage): string {
  return localize(language, {
    zh: "未找到书籍。请先创建一本书。",
    en: "No books found. Create a book first.",
    vi: "Chưa tìm thấy sách nào. Hãy tạo sách trước.",
  });
}

export function formatCliSuccess(language: CliLanguage, message: string): string {
  return message;
}
export function formatCliError(language: CliLanguage, message: string): string {
  return localize(language, { zh: `错误：${message}`, en: `Error: ${message}`, vi: `Lỗi: ${message}` });
}

export function formatCliDoctorHeader(language: CliLanguage): string {
  return localize(language, { zh: "\nInkOS Doctor\n", en: "\nInkOS Doctor\n", vi: "\nInkOS Doctor\n" });
}

export function formatCliIssuesFound(language: CliLanguage, count: number): string {
  return localize(language, { zh: `\n发现 ${count} 个问题。`, en: `\n${count} issue(s) found.`, vi: `\nPhát hiện ${count} vấn đề.` });
}

export function formatCliAllChecksPassed(language: CliLanguage): string {
  return localize(language, { zh: "\n所有检查均已通过。", en: "\nAll checks passed.", vi: "\nTất cả kiểm tra đều đạt." });
}
export function formatCliConfigSet(language: CliLanguage, key: string, value: string): string {
  return localize(language, { zh: `已设置 ${key} = ${value}`, en: `Set ${key} = ${value}`, vi: `Đã đặt ${key} = ${value}` });
}

export function formatCliConfigSaved(language: CliLanguage, path: string): string {
  return localize(language, { zh: `全局配置已保存到 ${path}`, en: `Global config saved to ${path}`, vi: `Đã lưu cấu hình global vào ${path}` });
}
export function formatCliUnknownConfigKey(language: CliLanguage, key: string, suggestion?: string): string {
  return localize(language, {
    zh: `未知配置键 "${key}"。${suggestion ? `您是否想要 "${suggestion}"？` : ""}`,
    en: `Unknown config key "${key}".${suggestion ? ` Did you mean "${suggestion}"?` : ""}`,
    vi: `Không nhận diện được khóa cấu hình "${key}".${suggestion ? ` Bạn có muốn dùng "${suggestion}" không?` : ""}`,
  });
}

export function formatCliKnownConfigKeys(language: CliLanguage, keys: ReadonlyArray<string>): string {
  return localize(language, { zh: `已知配置键：${keys.join(", ")}`, en: `Known keys: ${keys.join(", ")}`, vi: `Các khóa được hỗ trợ: ${keys.join(", ")}` });
}

export function formatCliUnknownAgent(language: CliLanguage, agent: string, agents: ReadonlyArray<string>): string {
  return localize(language, { zh: `未知 agent "${agent}"。可用 agent：${agents.join(", ")}`, en: `Unknown agent "${agent}". Valid agents: ${agents.join(", ")}`, vi: `Agent "${agent}" không tồn tại. Các agent hợp lệ: ${agents.join(", ")}` });
}
export function formatCliAutoUsage(language: CliLanguage): string {
  return localize(language, {
    zh: "用法：inkos auto [book-id] <target-chapter>",
    en: "Usage: inkos auto [book-id] <target-chapter>",
    vi: "Cách dùng: inkos auto [book-id] <target-chapter>",
  });
}

export function formatCliAutoValidation(language: CliLanguage, value: string, target?: number): string {
  if (target !== undefined) {
    return localize(language, {
      zh: `目标章节必须 >= 1，当前为 ${target}`,
      en: `Target chapter must be >= 1, got ${target}`,
      vi: `Số chương đích phải >= 1, hiện là ${target}`,
    });
  }
  return localize(language, {
    zh: `期望章节编号，实际得到 "${value}"`,
    en: `Expected target chapter number, got "${value}"`,
    vi: `Số chương đích không hợp lệ "${value}"`,
  });
}

export function formatCliAutoChapterFailure(language: CliLanguage, chapter: number, completed: number, error: string): string {
  return localize(language, {
    zh: `第 ${chapter} 章失败，自动写作停止（本次已完成 ${completed} 章）：${error}`,
    en: `Chapter ${chapter} failed, stopping auto-write (${completed} chapter(s) completed this run): ${error}`,
    vi: `Chương ${chapter} thất bại, dừng tự động viết (đã hoàn tất ${completed} chương trong lượt này): ${error}`,
  });
}

export function formatCliAutoStateDegraded(language: CliLanguage, bookId: string, chapter: number): string {
  return localize(language, {
    zh: `第 ${chapter} 章完成但状态为 state-degraded，自动写作停止。请先运行 "inkos write repair-state ${bookId} ${chapter}"，然后重新运行 inkos auto。`,
    en: `Chapter ${chapter} finished in state-degraded status, stopping auto-write. Run "inkos write repair-state ${bookId} ${chapter}" first, then re-run inkos auto.`,
    vi: `Chương ${chapter} hoàn tất nhưng ở trạng thái state-degraded, dừng tự động viết. Hãy chạy "inkos write repair-state ${bookId} ${chapter}" trước, rồi chạy lại inkos auto.`,
  });
}


export function formatCliDoctorCheckName(language: CliLanguage, name: string): string {
  if (language !== "vi") return name;
  const names: Record<string, string> = {
    "Global Config": "Cấu hình global",
    "Node runtime pin files repaired": "Đã sửa file ghim runtime Node",
    "Node runtime pin files": "File ghim runtime Node",
    "LLM API Key": "API key LLM",
    "API Connectivity": "Kết nối API",
    "LLM Config": "Cấu hình LLM",
    "LLM Config Mode": "Chế độ cấu hình LLM",
    "Version Migration": "Di chuyển phiên bản",
    "Books": "Sách",
    "  Config Hint": "  Gợi ý cấu hình",
    "  Hint": "  Gợi ý",
  };
  return names[name] ?? name;
}

export function formatCliDoctorCheckDetail(language: CliLanguage, detail: string): string {
  if (language !== "vi") return detail;
  const exact: Record<string, string> = {
    Found: "Đã tìm thấy",
    "Not found": "Không tìm thấy",
    Configured: "Đã cấu hình",
    "Already pinned to Node 22": "Đã ghim Node 22",
    "Optional for local/self-hosted endpoint": "Tùy chọn cho endpoint local/tự lưu trữ",
    "All books use current format": "Tất cả sách dùng định dạng hiện tại",
    "0 books": "0 sách",
    "No LLM config available (no project config or global .env)": "Không có cấu hình LLM (không có cấu hình dự án hoặc .env global)",
  };
  if (exact[detail]) return exact[detail];
  if (detail.startsWith("Wrote ")) return detail.replace("Wrote ", "Đã ghi ").replace(" -> Node 22", " -> Node 22");
  if (detail.startsWith("Not found. Run 'inkos init'")) return "Không tìm thấy. Hãy chạy 'inkos init'";
  if (detail.startsWith("Not set. Run 'inkos config set-global'")) return "Chưa thiết lập. Hãy chạy 'inkos config set-global'";
  if (detail.startsWith("Missing —")) return detail.replace("Missing —", "Thiếu —").replace("save a Studio service key or set env for CLI/daemon/deploy", "lưu service key trong Studio hoặc đặt biến môi trường cho CLI/daemon/deploy");
  if (detail.startsWith("Run `inkos setup`")) return detail.replace("Run `", "Chạy `").replace(" or add LLM settings to the project .env file.", " hoặc thêm cài đặt LLM vào file .env của dự án.");
  if (detail.startsWith("OK (model: ")) return detail.replace("OK (model: ", "OK (model: ");
  if (/^\d+ book\(s\) found$/.test(detail)) return detail.replace("book(s) found", "sách được tìm thấy");
  return detail;
}

export function formatCliDoctorProbe(language: CliLanguage): string {
  return localize(language, { zh: "\n  [..] 正在测试 API 连接...", en: "\n  [..] Testing API connectivity...", vi: "\n  [..] Đang kiểm tra kết nối API..." });
}

export function formatCliInitError(language: CliLanguage, error: string): string {
  return localize(language, { zh: `初始化项目失败：${error}`, en: `Failed to initialize project: ${error}`, vi: `Không thể khởi tạo project: ${error}` });
}
export function formatCliAutoMigration(language: CliLanguage, hint: string): string {
  return `[migration] ${hint}`;
}
export function formatCliApiKeyEnvError(language: CliLanguage, value: string, raw: boolean): string {
  return localize(language, {
    zh: raw ? "--api-key-env 需要环境变量名，不能是原始 API Key 或 URL。" : `--api-key-env 需要类似 PACKY_API_KEY 的环境变量名。"${value}" 不是有效名称。`,
    en: raw ? "--api-key-env expects an environment variable name like PACKY_API_KEY, not a raw API key or URL." : `--api-key-env expects an environment variable name like PACKY_API_KEY. "${value}" is not a valid env var name.`,
    vi: raw ? "--api-key-env yêu cầu tên biến môi trường như PACKY_API_KEY, không phải API key thô hoặc URL." : `--api-key-env yêu cầu tên biến môi trường như PACKY_API_KEY. "${value}" không phải tên biến hợp lệ.`,
  });
}
export function formatCliModelOverride(language: CliLanguage, agent: string, model: string, baseUrl?: string): string {
  return localize(language, { zh: `模型覆盖：${agent} → ${model}${baseUrl ? ` (${baseUrl})` : ""}`, en: `Model override: ${agent} → ${model}${baseUrl ? ` (${baseUrl})` : ""}`, vi: `Ghi đè model: ${agent} → ${model}${baseUrl ? ` (${baseUrl})` : ""}` });
}
export function formatCliDefaultModel(language: CliLanguage, model: string): string {
  return localize(language, { zh: `默认模型：${model}\n`, en: `Default model: ${model}\n`, vi: `Model mặc định: ${model}\n` });
}
