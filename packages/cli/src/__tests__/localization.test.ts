import { describe, expect, it } from "vitest";
import {
  formatAutoWriteAlreadyComplete, formatAutoWriteStart, formatBookCreateCreating, formatBookCreateCreated,
  formatBookCreateNextStep, formatDoctorHintBaseUrl, formatDoctorHintInvalidApiKey, formatDoctorHintModelName,
  formatDoctorHintOpenAiProbeExhausted, formatDoctorHintQuota, formatDoctorHintStreamRequirement,
  formatFanficCanonMissingError, formatFanficInvalidModeError, formatFanficSourceDirEmptyError,
  formatFanficSourceTooShortError, formatFanficCreating, formatFanficSource, formatFanficCreated,
  formatFanficNextStep, formatFanficRefreshing, formatFanficRefreshed, formatFanficMode, formatFanficLocation,
  formatFanficGenerated, formatFanficShowHeader, formatFanficError, formatFanficCreateError, formatFanficRefreshError, formatGenreFieldLabels,
  formatGenreListEmpty, formatGenreListHeader, formatGenreListTotal, formatGenreShowHeader,
  formatGenreCreateSuccess, formatGenreCreateCustomize, formatGenreError, formatImportCanonComplete,
  formatImportCanonStart, formatImportChaptersComplete, formatImportChaptersDiscovery, formatImportChaptersResume,
  formatListModelsEmpty, formatListModelsHeader, formatWriteNextComplete, formatWriteNextProgress,
  formatWriteNextResultLines, formatCliInitSuccess, formatCliNextSteps, formatCliSetupRequired, formatCliApiError,
  formatCliNoBooks, formatCliSuccess, formatCliAutoUsage, formatCliAutoValidation, formatCliAutoChapterFailure,
  formatCliAutoStateDegraded, formatCliDoctorCheckDetail, formatCliInitError, formatCliDoctorCheckName,
  formatCliDoctorProbe, formatCliAutoMigration, resolveCliLanguage, type CliLanguage,
} from "../localization.js";

const CHINESE_CHARS = /[\u3400-\u9fff]/;

describe("Task 3 remaining runtime output localization", () => {
  it("formats auto validation and failure paths in Vietnamese without changing IDs", () => {
    expect(formatCliAutoUsage("vi")).toContain("Cách dùng: inkos auto");
    expect(formatCliAutoValidation("vi", "abc")).toContain('Số chương đích không hợp lệ "abc"');
    expect(formatCliAutoChapterFailure("vi", 3, 2, "oops")).toContain("Chương 3 thất bại");
    expect(formatCliAutoStateDegraded("vi", "ben-suong", 3)).toContain("state-degraded");
    expect(formatCliAutoStateDegraded("vi", "ben-suong", 3)).toContain("ben-suong");
    for (const language of ["vi", "zh", "en"] as const) {
      expect(formatCliAutoMigration(language, "hint")).toBe("[migration] hint");
    }
  });

  it("localizes doctor check details while preserving paths, env names and model values", () => {
    expect(formatCliDoctorCheckDetail("vi", "Found")).toBe("Đã tìm thấy");
    expect(formatCliDoctorCheckDetail("vi", "Not found")).toBe("Không tìm thấy");
    expect(formatCliDoctorCheckDetail("vi", "Configured")).toBe("Đã cấu hình");
    expect(formatCliDoctorCheckDetail("vi", "Optional for local/self-hosted endpoint")).toContain("Tùy chọn");
    expect(formatCliDoctorCheckDetail("vi", "provider=openai model=gpt-5 stream=true baseUrl=https://example.test")).toContain("provider=openai");
    expect(formatCliDoctorCheckName("vi", "Global Config")).toBe("Cấu hình global");
    expect(formatCliDoctorProbe("vi")).toBe("\n  [..] Đang kiểm tra kết nối API...");
  });

  it("formats init errors in Vietnamese and leaves English unchanged", () => {
    expect(formatCliInitError("vi", "permission denied")).toBe("Không thể khởi tạo project: permission denied");
    expect(formatCliInitError("en", "permission denied")).toBe("Failed to initialize project: permission denied");
  });
});

describe("CLI localization", () => {
  it("formats book-create summaries in both languages", () => {
    expect(formatBookCreateCreating("zh", "山河", "xuanhuan", "tomato"))
      .toBe('创建书籍 "山河"（xuanhuan / tomato）...');
    expect(formatBookCreateCreated("zh", "shan-he")).toBe("已创建书籍：shan-he");
    expect(formatBookCreateNextStep("zh", "shan-he")).toBe("下一步：inkos write next shan-he");

    expect(formatBookCreateCreating("en", "Harbor", "other", "other"))
      .toBe('Creating book "Harbor" (other / other)...');
    expect(formatBookCreateCreated("en", "harbor")).toBe("Book created: harbor");
    expect(formatBookCreateNextStep("en", "harbor")).toBe("Next: inkos write next harbor");

    expect(formatBookCreateCreating("vi", "Bến Sương", "fantasy", "wattpad"))
      .toBe('Đang tạo sách "Bến Sương" (fantasy / wattpad)...');
    expect(formatBookCreateCreated("vi", "ben-suong")).toBe("Đã tạo sách: ben-suong");
    expect(formatBookCreateNextStep("vi", "ben-suong")).toBe("Tiếp theo: inkos write next ben-suong");
  });

  it("formats write-next progress and result summaries in both languages", () => {
    expect(formatWriteNextProgress("zh", 1, 2, "shan-he"))
      .toBe('[1/2] 为「shan-he」撰写章节...');
    expect(formatWriteNextComplete("zh")).toBe("完成。");
    expect(formatWriteNextResultLines("zh", {
      chapterNumber: 3,
      title: "风雪夜",
      wordCount: 3200,
      status: "ready-for-review",
      revised: true,
      issues: [],
      auditPassed: true,
    })).toEqual([
      "  第3章：风雪夜",
      "  字数：3200字",
      "  审计：通过",
      "  自动修正：已执行（已修复关键问题）",
      "  状态：ready-for-review",
    ]);

    expect(formatWriteNextProgress("en", 2, 3, "harbor"))
      .toBe('[2/3] Writing chapter for "harbor"...');
    expect(formatWriteNextComplete("en")).toBe("Done.");
    expect(formatWriteNextResultLines("en", {
      chapterNumber: 4,
      title: "Cold Harbor",
      wordCount: 2200,
      status: "audit-failed",
      revised: false,
      issues: [{ severity: "critical", category: "continuity", description: "Mismatch" }],
      auditPassed: false,
    })).toEqual([
      "  Chapter 4: Cold Harbor",
      "  Length: 2200 words",
      "  Audit: NEEDS REVIEW",
      "  Status: audit-failed",
      "  Issues:",
      "    [critical] continuity: Mismatch",
    ]);

    expect(formatWriteNextProgress("vi", 1, 2, "ben-suong"))
      .toBe('[1/2] Đang viết chương cho "ben-suong"...');
    expect(formatWriteNextComplete("vi")).toBe("Hoàn tất.");
    expect(formatWriteNextResultLines("vi", {
      chapterNumber: 5,
      title: "Đêm Mưa",
      wordCount: 1800,
      status: "ready-for-review",
      revised: true,
      issues: [],
      auditPassed: true,
    })).toEqual([
      "  Chương 5: Đêm Mưa",
      "  Độ dài: 1800 từ",
      "  Kiểm duyệt: ĐẠT",
      "  Tự động chỉnh sửa: CÓ (đã sửa các vấn đề nghiêm trọng)",
      "  Trạng thái: ready-for-review",
    ]);
  });

  it("formats auto-write banners in both languages", () => {
    expect(formatAutoWriteStart("zh", "shan-he", 3, 10))
      .toBe("自动写作「shan-he」：从第3章连续写到第10章...");
    expect(formatAutoWriteAlreadyComplete("zh", "shan-he", 12, 10))
      .toBe("「shan-he」已写到第12章（目标第10章），无需继续。");

    expect(formatAutoWriteStart("en", "harbor", 3, 10))
      .toBe('Auto-writing "harbor": chapter 3 through chapter 10...');
    expect(formatAutoWriteAlreadyComplete("en", "harbor", 12, 10))
      .toBe('"harbor" already has 12 chapter(s) written (target: chapter 10). Nothing to do.');

    expect(formatAutoWriteStart("vi", "ben-suong", 3, 10))
      .toBe('Tự động viết "ben-suong": từ chương 3 đến chương 10...');
    expect(formatAutoWriteAlreadyComplete("vi", "ben-suong", 12, 10))
      .toBe('"ben-suong" đã có 12 chương (mục tiêu: chương 10). Không cần làm gì thêm.');
  });

  it("formats import summaries with language-specific units and action hints", () => {
    expect(formatImportChaptersDiscovery("zh", 12, "shan-he"))
      .toBe('发现 12 章，准备导入到「shan-he」。');
    expect(formatImportChaptersResume("zh", 5)).toBe("从第 5 章继续导入。");
    expect(formatImportChaptersComplete("zh", {
      importedCount: 8,
      totalWords: 45678,
      nextChapter: 13,
      continueBookId: "shan-he",
    })).toEqual([
      "导入完成：",
      "  已导入章节：8",
      "  总长度：45678字",
      "  下一章编号：13",
      "",
      '运行 "inkos write next shan-he" 继续写作。',
    ]);

    expect(formatImportChaptersDiscovery("en", 10, "harbor"))
      .toBe('Found 10 chapters to import into "harbor".');
    expect(formatImportChaptersResume("en", 6)).toBe("Resuming from chapter 6.");
    expect(formatImportChaptersComplete("en", {
      importedCount: 10,
      totalWords: 18342,
      nextChapter: 11,
      continueBookId: "harbor",
    })).toEqual([
      "Import complete:",
      "  Chapters imported: 10",
      "  Total length: 18342 words",
      "  Next chapter number: 11",
      "",
      'Run "inkos write next harbor" to continue writing.',
    ]);

    expect(formatImportChaptersDiscovery("vi", 10, "ben-suong"))
      .toBe('Tìm thấy 10 chương để nhập vào "ben-suong".');
    expect(formatImportChaptersResume("vi", 6)).toBe("Tiếp tục từ chương 6.");
    expect(formatImportChaptersComplete("vi", {
      importedCount: 10,
      totalWords: 18342,
      nextChapter: 11,
      continueBookId: "ben-suong",
    })).toEqual([
      "Nhập hoàn tất:",
      "  Số chương đã nhập: 10",
      "  Tổng độ dài: 18342 từ",
      "  Số chương tiếp theo: 11",
      "",
      'Chạy "inkos write next ben-suong" để tiếp tục viết.',
    ]);
  });

  it("formats import-canon prompts in both languages", () => {
    expect(formatImportCanonStart("zh", "parent-book", "target-book"))
      .toBe('把 "parent-book" 的正典导入到 "target-book"...');
    expect(formatImportCanonComplete("zh")).toEqual([
      "正典已导入：story/parent_canon.md",
      "Writer 和 auditor 会在番外模式下自动识别这个文件。",
    ]);

    expect(formatImportCanonStart("en", "parent-book", "target-book"))
      .toBe('Importing canon from "parent-book" into "target-book"...');
    expect(formatImportCanonComplete("en")).toEqual([
      "Canon imported: story/parent_canon.md",
      "Writer and auditor will auto-detect this file for spinoff mode.",
    ]);

    expect(formatImportCanonStart("vi", "sach-goc", "sach-moi"))
      .toBe('Đang nhập canon từ "sach-goc" vào "sach-moi"...');
    expect(formatImportCanonComplete("vi")).toEqual([
      "Đã nhập canon: story/parent_canon.md",
      "Writer và auditor sẽ tự nhận diện file này trong chế độ ngoại truyện.",
    ]);
  });
});

describe("resolveCliLanguage environment fallback", () => {
  it("prefers the explicit language over any environment variable", () => {
    expect(resolveCliLanguage("en", { INKOS_LOCALE: "zh_CN" })).toBe("en");
    expect(resolveCliLanguage("zh", { INKOS_LOCALE: "en", LANG: "en_US.UTF-8" })).toBe("zh");
    expect(resolveCliLanguage("vi-VN", { INKOS_LOCALE: "zh_CN" })).toBe("vi");
  });

  it("reads INKOS_LOCALE before the system locale variables", () => {
    expect(resolveCliLanguage(undefined, { INKOS_LOCALE: "en", LANG: "zh_CN.UTF-8" })).toBe("en");
    expect(resolveCliLanguage(undefined, { INKOS_LOCALE: "zh-CN", LC_ALL: "en_US.UTF-8" })).toBe("zh");
    expect(resolveCliLanguage(undefined, { INKOS_LOCALE: "vi_VN.UTF-8", LANG: "zh_CN.UTF-8" })).toBe("vi");
  });

  it("falls back to LC_ALL, then LC_MESSAGES, then LANG", () => {
    expect(resolveCliLanguage(undefined, { LC_ALL: "en_US.UTF-8" })).toBe("en");
    expect(resolveCliLanguage(undefined, { LC_MESSAGES: "en_GB.UTF-8" })).toBe("en");
    expect(resolveCliLanguage(undefined, { LANG: "en_US.UTF-8" })).toBe("en");
    expect(resolveCliLanguage(undefined, { LANG: "zh_CN.UTF-8" })).toBe("zh");
    expect(resolveCliLanguage(undefined, { LANG: "vi_VN.UTF-8" })).toBe("vi");
  });

  it("lets an unrecognized explicit language fall through to the environment", () => {
    expect(resolveCliLanguage("fr", { LANG: "en_US.UTF-8" })).toBe("en");
  });

  it("defaults to zh when nothing is set or the locale is unrecognized", () => {
    expect(resolveCliLanguage(undefined, {})).toBe("zh");
    expect(resolveCliLanguage(undefined, { LANG: "C" })).toBe("zh");
    expect(resolveCliLanguage("fr", {})).toBe("zh");
  });
});

describe("config list-models localization", () => {
  it("formats the empty-result error in both languages", () => {
    expect(formatListModelsEmpty("zh", "deepseek"))
      .toBe("deepseek 没有可用模型（可能需要 --api-key 和 --base-url）");
    expect(formatListModelsEmpty("en", "deepseek"))
      .toBe("No models available for deepseek (you may need --api-key and --base-url)");
    expect(formatListModelsEmpty("vi", "deepseek"))
      .toBe("Không có model nào cho deepseek (có thể bạn cần --api-key và --base-url)");
  });

  it("formats the model-count header in both languages", () => {
    expect(formatListModelsHeader("zh", "deepseek", 3)).toBe("deepseek：3 个模型");
    expect(formatListModelsHeader("en", "deepseek", 3)).toBe("deepseek: 3 model(s)");
    expect(formatListModelsHeader("vi", "deepseek", 3)).toBe("deepseek: 3 model");
  });
});

describe("doctor hint localization", () => {
  it("keeps the original Chinese hints for zh", () => {
    expect(formatDoctorHintQuota("zh"))
      .toBe("检查 API Key 是否正确、模型是否可用，以及账号余额或配额是否足够。");
    expect(formatDoctorHintBaseUrl("zh")).toContain("INKOS_LLM_BASE_URL");
    expect(formatDoctorHintStreamRequirement("zh")).toContain("stream");
    expect(formatDoctorHintModelName("zh")).toContain("INKOS_LLM_MODEL");
    expect(formatDoctorHintInvalidApiKey("zh")).toContain("INKOS_LLM_API_KEY");
    expect(formatDoctorHintOpenAiProbeExhausted("zh")).toContain("chat/responses");
  });

  it("emits pure English hints for en", () => {
    const hints = [
      formatDoctorHintQuota("en"),
      formatDoctorHintOpenAiProbeExhausted("en"),
      formatDoctorHintBaseUrl("en"),
      formatDoctorHintStreamRequirement("en"),
      formatDoctorHintModelName("en"),
      formatDoctorHintInvalidApiKey("en"),
    ];
    for (const hint of hints) {
      expect(hint).not.toMatch(CHINESE_CHARS);
    }
    expect(formatDoctorHintBaseUrl("en")).toContain("INKOS_LLM_BASE_URL");
    expect(formatDoctorHintModelName("en")).toContain("INKOS_LLM_MODEL");
    expect(formatDoctorHintInvalidApiKey("en")).toContain("INKOS_LLM_API_KEY");
    expect(formatDoctorHintStreamRequirement("en")).toContain("stream=true");
  });

  it("emits pure Vietnamese hints for vi", () => {
    const hints = [
      formatDoctorHintQuota("vi"),
      formatDoctorHintOpenAiProbeExhausted("vi"),
      formatDoctorHintBaseUrl("vi"),
      formatDoctorHintStreamRequirement("vi"),
      formatDoctorHintModelName("vi"),
      formatDoctorHintInvalidApiKey("vi"),
    ];
    for (const hint of hints) {
      expect(hint).not.toMatch(CHINESE_CHARS);
    }
    expect(formatDoctorHintBaseUrl("vi")).toContain("INKOS_LLM_BASE_URL");
    expect(formatDoctorHintModelName("vi")).toContain("INKOS_LLM_MODEL");
    expect(formatDoctorHintInvalidApiKey("vi")).toContain("INKOS_LLM_API_KEY");
    expect(formatDoctorHintStreamRequirement("vi")).toContain("stream=true");
  });
});

describe("fanfic error localization", () => {
  it("uses Chinese by default and Vietnamese when requested", () => {
    expect(formatFanficInvalidModeError("xx")).toContain("无效的同人模式");
    expect(formatFanficInvalidModeError("xx", "vi")).toContain("Chế độ fanfic không hợp lệ");
    expect(formatFanficSourceTooShortError(42)).toContain("源素材内容过短");
    expect(formatFanficSourceTooShortError(42, "vi")).toContain("Nguồn tư liệu quá ngắn");
    expect(formatFanficCanonMissingError()).toContain("同人正典");
    expect(formatFanficCanonMissingError("vi")).toContain("Không tìm thấy canon fanfic");
    expect(formatFanficSourceDirEmptyError("/tmp/source")).toContain("目录 /tmp/source 中没有");
    expect(formatFanficSourceDirEmptyError("/tmp/source", "vi")).toContain("Không tìm thấy file");
  });
});

describe("Task 3 fanfic and genre Vietnamese output", () => {
  it("formats fanfic human-readable messages in Vietnamese while preserving IDs", () => {
    expect(formatFanficCreating("vi", "Bến Sương", "canon", "fantasy")).toContain("Đang tạo fanfic");
    expect(formatFanficSource("vi", "canon.txt", 123)).toContain("Nguồn");
    expect(formatFanficCreated("vi", "ben-suong")).toContain("Đã tạo fanfic: ben-suong");
    expect(formatFanficNextStep("vi", "ben-suong")).toContain("inkos write next ben-suong");
    expect(formatFanficRefreshing("vi", "ben-suong", "canon.txt")).toContain("Đang làm mới");
    expect(formatFanficRefreshed("vi", "canon.txt")).toContain("Đã làm mới");
    expect(formatFanficError("vi", new Error("boom"))).toContain("Không thể hiển thị fanfic");
    expect(formatFanficCreateError("vi", new Error("boom"))).toContain("Không thể tạo fanfic");
    expect(formatFanficRefreshError("vi", new Error("boom"))).toContain("Không thể làm mới canon");
  });
  it("formats genre list/show/create messages in Vietnamese without translating IDs", () => {
    const labels = formatGenreFieldLabels("vi");
    expect(formatGenreListEmpty("vi")).toContain("Chưa tìm thấy");
    expect(formatGenreListHeader("vi")).toContain("Các thể loại");
    expect(formatGenreListTotal("vi", 2)).toContain("2");
    expect(formatGenreShowHeader("vi", "xuanhuan", "Tiên hiệp")).toContain("xuanhuan");
    expect(labels.chapterTypes).toBeDefined();
    expect(labels.body).toBe("Nội dung");
    expect(formatGenreCreateSuccess("vi", "genres/scifi.md")).toContain("Đã tạo");
    expect(formatGenreCreateCustomize("vi")).toContain("Chỉnh sửa");
    expect(formatGenreError("vi", "failed")).toContain("Không thể");
  });
});

describe("runtime command output localization", () => {
  it("formats init, setup, API error, empty and normal output in Vietnamese", () => {
    expect(formatCliInitSuccess("vi", "/tmp/proj")).toBe("Đã khởi tạo project tại /tmp/proj");
    expect(formatCliNextSteps("vi")).toBe("Bước tiếp theo:");
    expect(formatCliSetupRequired("vi")).toContain("Chưa có cấu hình LLM");
    expect(formatCliApiError("vi", "timeout")).toBe("Lỗi API: timeout");
    expect(formatCliNoBooks("vi")).toContain("Chưa tìm thấy sách nào");
    expect(formatCliSuccess("vi", "Đã hoàn tất.")).toBe("Đã hoàn tất.");
  });

  it("treats explicit language as taking precedence over environment variables", () => {
    expect(resolveCliLanguage("en", { INKOS_LOCALE: "zh_CN" })).toBe("en");
    expect(resolveCliLanguage("zh", { INKOS_LOCALE: "en", LANG: "en_US.UTF-8" })).toBe("zh");
    expect(resolveCliLanguage("vi-VN", { INKOS_LOCALE: "zh_CN" })).toBe("vi");
  });

  it("reads INKOS_LOCALE before the system locale variables", () => {
    expect(resolveCliLanguage(undefined, { INKOS_LOCALE: "en", LANG: "zh_CN.UTF-8" })).toBe("en");
    expect(resolveCliLanguage(undefined, { INKOS_LOCALE: "zh-CN", LC_ALL: "en_US.UTF-8" })).toBe("zh");
    expect(resolveCliLanguage(undefined, { INKOS_LOCALE: "vi_VN.UTF-8", LANG: "zh_CN.UTF-8" })).toBe("vi");
  });

  it("falls back to LC_ALL, then LC_MESSAGES, then LANG", () => {
    expect(resolveCliLanguage(undefined, { LC_ALL: "en_US.UTF-8" })).toBe("en");
    expect(resolveCliLanguage(undefined, { LC_MESSAGES: "en_GB.UTF-8" })).toBe("en");
    expect(resolveCliLanguage(undefined, { LANG: "en_US.UTF-8" })).toBe("en");
    expect(resolveCliLanguage(undefined, { LANG: "zh_CN.UTF-8" })).toBe("zh");
    expect(resolveCliLanguage(undefined, { LANG: "vi_VN.UTF-8" })).toBe("vi");
  });

  it("lets an unrecognized explicit language fall through to the environment", () => {
    expect(resolveCliLanguage("fr", { LANG: "en_US.UTF-8" })).toBe("en");
  });

  it("defaults to zh when nothing is set or the locale is unrecognized", () => {
    expect(resolveCliLanguage(undefined, {})).toBe("zh");
    expect(resolveCliLanguage(undefined, { LANG: "C" })).toBe("zh");
    expect(resolveCliLanguage("fr", {})).toBe("zh");
  });
});
