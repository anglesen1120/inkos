import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChapterAnalyzerAgent } from "../agents/chapter-analyzer.js";
import type { BookConfig } from "../models/book.js";
import { countChapterLength } from "../utils/length-metrics.js";

const ZERO_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
} as const;

describe("ChapterAnalyzerAgent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts English chapter content using words instead of characters", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-analyzer-"));
    const englishContent = "He looked at the sky and waited.";
    const agent = new ChapterAnalyzerAgent({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          thinkingBudget: 0,
          extra: {},
        },
      },
      model: "test-model",
      projectRoot: process.cwd(),
    });

    const book: BookConfig = {
      id: "english-book",
      title: "English Book",
      platform: "other",
      genre: "other",
      status: "active",
      targetChapters: 10,
      chapterWordCount: 2200,
      language: "en",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    };

    vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({
        content: [
          "=== CHAPTER_TITLE ===",
          "A Quiet Sky",
          "",
          "=== CHAPTER_CONTENT ===",
          englishContent,
          "",
          "=== PRE_WRITE_CHECK ===",
          "",
          "=== POST_SETTLEMENT ===",
          "",
          "=== UPDATED_STATE ===",
          "| Field | Value |",
          "| --- | --- |",
          "| Chapter | 1 |",
          "",
          "=== UPDATED_LEDGER ===",
          "",
          "=== UPDATED_HOOKS ===",
          "| hook_id | status |",
          "| --- | --- |",
          "| h1 | open |",
          "",
          "=== CHAPTER_SUMMARY ===",
          "| 1 | A Quiet Sky |",
          "",
          "=== UPDATED_SUBPLOTS ===",
          "",
          "=== UPDATED_EMOTIONAL_ARCS ===",
          "",
          "=== UPDATED_CHARACTER_MATRIX ===",
          "",
        ].join("\n"),
        usage: ZERO_USAGE,
      });

    try {
      const output = await agent.analyzeChapter({
        book,
        bookDir,
        chapterNumber: 1,
        chapterContent: englishContent,
      });

      expect(output.wordCount).toBe(countChapterLength(englishContent, "en_words"));
      expect(output.wordCount).toBe(7);
    } finally {
      await rm(bookDir, { recursive: true, force: true });
    }
  });

  it("uses English prompts when analyzing imported English chapters", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-analyzer-en-"));
    const englishContent = "He looked at the sky and waited.";
    const agent = new ChapterAnalyzerAgent({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          thinkingBudget: 0,
          extra: {},
        },
      },
      model: "test-model",
      projectRoot: process.cwd(),
    });

    const book: BookConfig = {
      id: "english-book",
      title: "English Book",
      platform: "other",
      genre: "other",
      status: "active",
      targetChapters: 10,
      chapterWordCount: 2200,
      language: "en",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    };

    const chat = vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({
        content: [
          "=== CHAPTER_TITLE ===",
          "A Quiet Sky",
          "",
          "=== CHAPTER_CONTENT ===",
          englishContent,
          "",
          "=== PRE_WRITE_CHECK ===",
          "",
          "=== POST_SETTLEMENT ===",
          "",
          "=== UPDATED_STATE ===",
          "| Field | Value |",
          "| --- | --- |",
          "| Current Chapter | 1 |",
          "",
          "=== UPDATED_LEDGER ===",
          "",
          "=== UPDATED_HOOKS ===",
          "| hook_id | status |",
          "| --- | --- |",
          "| h1 | open |",
          "",
          "=== CHAPTER_SUMMARY ===",
          "| 1 | A Quiet Sky |",
          "",
          "=== UPDATED_SUBPLOTS ===",
          "",
          "=== UPDATED_EMOTIONAL_ARCS ===",
          "",
          "=== UPDATED_CHARACTER_MATRIX ===",
          "",
        ].join("\n"),
        usage: ZERO_USAGE,
      });

    try {
      await agent.analyzeChapter({
        book,
        bookDir,
        chapterNumber: 1,
        chapterContent: englishContent,
        chapterTitle: "A Quiet Sky",
      });

      const messages = chat.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
      expect(messages[0]?.content).toContain("ALL output MUST be in English");
      expect(messages[1]?.content).toContain("Analyze chapter 1");
      expect(messages[1]?.content).toContain("## Chapter Content");
      expect(messages[1]?.content).toContain("## Current State");
      expect(messages[1]?.content).not.toContain("请分析第1章正文");
    } finally {
      await rm(bookDir, { recursive: true, force: true });
    }
  });

  it("uses a retrieved summary snapshot instead of full long-history chapter summaries", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-analyzer-memory-"));
    const storyDir = join(bookDir, "story");
    await mkdir(storyDir, { recursive: true });

    await Promise.all([
      writeFile(
        join(storyDir, "chapter_summaries.md"),
        [
          "# Chapter Summaries",
          "",
          "| Chapter | Title | Characters | Key Events | State Changes | Hook Activity | Mood | Chapter Type |",
          "| --- | --- | --- | --- | --- | --- | --- | --- |",
          "| 1 | Guild Trail | Lin Yue | Merchant guild flees west | Route clues only | guild-route seeded | tense | action |",
          "| 99 | Mentor Oath | Lin Yue, Mentor Shen | Mentor left without explanation | Oath token matters again | mentor-oath advanced | aching | fallout |",
          "",
        ].join("\n"),
        "utf-8",
      ),
      writeFile(
        join(storyDir, "pending_hooks.md"),
        [
          "# Pending Hooks",
          "",
          "| hook_id | start_chapter | type | status | last_advanced_chapter | expected_payoff | notes |",
          "| --- | --- | --- | --- | --- | --- | --- |",
          "| guild-route | 1 | mystery | open | 2 | 6 | Merchant guild trail |",
          "| mentor-oath | 8 | relationship | open | 99 | 101 | Mentor oath debt |",
          "",
        ].join("\n"),
        "utf-8",
      ),
      writeFile(join(storyDir, "current_state.md"), "# Current State\n\n- Lin Yue still carries the oath token.\n", "utf-8"),
      writeFile(join(storyDir, "volume_outline.md"), "# Volume Outline\n\n## Chapter 100\nReturn to the mentor oath conflict.\n", "utf-8"),
    ]);

    const agent = new ChapterAnalyzerAgent({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          thinkingBudget: 0,
          extra: {},
        },
      },
      model: "test-model",
      projectRoot: process.cwd(),
    });

    const chat = vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({
        content: [
          "=== CHAPTER_TITLE ===",
          "Mentor Oath Returns",
          "",
          "=== CHAPTER_CONTENT ===",
          "Lin Yue returned to the mentor oath and the missing explanation.",
          "",
          "=== PRE_WRITE_CHECK ===",
          "",
          "=== POST_SETTLEMENT ===",
          "",
          "=== UPDATED_STATE ===",
          "| Field | Value |",
          "| --- | --- |",
          "| Current Chapter | 100 |",
          "",
          "=== UPDATED_LEDGER ===",
          "",
          "=== UPDATED_HOOKS ===",
          "| hook_id | status |",
          "| --- | --- |",
          "| h1 | open |",
          "",
          "=== CHAPTER_SUMMARY ===",
          "| 100 | Mentor Oath Returns |",
          "",
          "=== UPDATED_SUBPLOTS ===",
          "",
          "=== UPDATED_EMOTIONAL_ARCS ===",
          "",
          "=== UPDATED_CHARACTER_MATRIX ===",
          "",
        ].join("\n"),
        usage: ZERO_USAGE,
      });

    const book: BookConfig = {
      id: "english-book",
      title: "English Book",
      platform: "other",
      genre: "other",
      status: "active",
      targetChapters: 120,
      chapterWordCount: 2200,
      language: "en",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    };

    try {
      await agent.analyzeChapter({
        book,
        bookDir,
        chapterNumber: 100,
        chapterTitle: "Mentor Oath Returns",
        chapterContent: "Lin Yue returned to the mentor oath and the missing explanation.",
      });

      const messages = chat.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
      const userPrompt = messages[1]?.content ?? "";

      expect(userPrompt).toContain("| 99 | Mentor Oath |");
      expect(userPrompt).not.toContain("| 1 | Guild Trail |");
    } finally {
      await rm(bookDir, { recursive: true, force: true });
    }
  });

  it("preserves the supplied chapter content when the model omits CHAPTER_CONTENT", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-analyzer-fallback-"));
    const chapterContent = "Lin Yue stepped into the archive and kept the real ledger hidden inside his sleeve.";
    const agent = new ChapterAnalyzerAgent({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          thinkingBudget: 0,
          extra: {},
        },
      },
      model: "test-model",
      projectRoot: process.cwd(),
    });

    const book: BookConfig = {
      id: "english-book",
      title: "English Book",
      platform: "other",
      genre: "other",
      status: "active",
      targetChapters: 10,
      chapterWordCount: 2200,
      language: "en",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    };

    vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({
        content: [
          "=== CHAPTER_TITLE ===",
          "Archive Entry",
          "",
          "=== PRE_WRITE_CHECK ===",
          "",
          "=== POST_SETTLEMENT ===",
          "",
          "=== UPDATED_STATE ===",
          "| Field | Value |",
          "| --- | --- |",
          "| Current Chapter | 1 |",
          "",
          "=== UPDATED_LEDGER ===",
          "",
          "=== UPDATED_HOOKS ===",
          "| hook_id | status |",
          "| --- | --- |",
          "| h1 | open |",
          "",
          "=== CHAPTER_SUMMARY ===",
          "| 1 | Archive Entry |",
          "",
          "=== UPDATED_SUBPLOTS ===",
          "",
          "=== UPDATED_EMOTIONAL_ARCS ===",
          "",
          "=== UPDATED_CHARACTER_MATRIX ===",
          "",
        ].join("\n"),
        usage: ZERO_USAGE,
      });

    try {
      const output = await agent.analyzeChapter({
        book,
        bookDir,
        chapterNumber: 1,
        chapterTitle: "Archive Entry",
        chapterContent,
      });

      expect(output.content).toBe(chapterContent);
      expect(output.wordCount).toBe(countChapterLength(chapterContent, "en_words"));
    } finally {
      await rm(bookDir, { recursive: true, force: true });
    }
  });

  it("uses Vietnamese context labels in governed and legacy analyzer prompts", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-analyzer-vi-"));
    const storyDir = join(bookDir, "story");
    await mkdir(storyDir, { recursive: true });
    await Promise.all([
      writeFile(join(storyDir, "story_bible.md"), "# Bối cảnh\n\n- Bí mật về chiếc chuông cổ.\n", "utf-8"),
      writeFile(join(storyDir, "volume_outline.md"), "# Dàn ý\n\n## Chapter 3\nLinh tìm manh mối mới.\n", "utf-8"),
      writeFile(join(storyDir, "pending_hooks.md"), "# Gợi mở\n\n- Chiếc chuông vẫn chưa được giải mã.\n", "utf-8"),
      writeFile(join(storyDir, "subplot_board.md"), "# Tuyến truyện phụ\n\n- Hành trình của Linh.\n", "utf-8"),
      writeFile(join(storyDir, "emotional_arcs.md"), "# Cảm xúc\n\n- Linh thêm quyết tâm.\n", "utf-8"),
      writeFile(join(storyDir, "chapter_summaries.md"), [
        "# Chapter Summaries",
        "",
        "| Chapter | Title | Characters | Key Events | State Changes | Hook Activity | Mood | Chapter Type |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| 2 | Ký hiệu | Linh | Phát hiện ký hiệu | Có manh mối mới | bell advanced | hồi hộp | bí ẩn |",
      ].join("\n"), "utf-8"),
      writeFile(join(storyDir, "character_matrix.md"), "# Nhân vật\n\n- Linh là nhân vật chính.\n", "utf-8"),
      writeFile(join(storyDir, "book_rules.md"), "## Quy tắc riêng\n\n- Không tiết lộ danh tính người gác chuông.\n", "utf-8"),
    ]);

    const agent = new ChapterAnalyzerAgent({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: { temperature: 0.7, maxTokens: 4096, thinkingBudget: 0, extra: {} },
      },
      model: "test-model",
      projectRoot: process.cwd(),
    });
    const chat = vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({
        content: [
          "=== CHAPTER_TITLE ===", "Manh mối", "", "=== CHAPTER_CONTENT ===", "Linh tìm thấy chiếc chuông cổ.", "",
          "=== PRE_WRITE_CHECK ===", "", "=== POST_SETTLEMENT ===", "", "=== UPDATED_STATE ===", "", "=== UPDATED_LEDGER ===", "",
          "=== UPDATED_HOOKS ===", "", "=== CHAPTER_SUMMARY ===", "", "=== UPDATED_SUBPLOTS ===", "",
          "=== UPDATED_EMOTIONAL_ARCS ===", "", "=== UPDATED_CHARACTER_MATRIX ===", "",
        ].join("\n"),
        usage: ZERO_USAGE,
      });
    const book: BookConfig = {
      id: "vietnamese-book", title: "Truyện Việt", platform: "other", genre: "other", status: "active",
      targetChapters: 10, chapterWordCount: 2200, language: "vi",
      createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z",
    };

    try {
      await agent.analyzeChapter({
        book, bookDir, chapterNumber: 3, chapterTitle: "Manh mối", chapterContent: "Linh tìm thấy chiếc chuông cổ.",
      });
      await agent.analyzeChapter({
        book, bookDir, chapterNumber: 3, chapterTitle: "Manh mối", chapterContent: "Linh tìm thấy chiếc chuông cổ.",
        chapterIntent: "# Mục tiêu chương\n\nTìm manh mối về chiếc chuông.",
        contextPackage: {
          chapter: 3,
          selectedContext: [
            { source: "story/pending_hooks.md#bell", reason: "Theo dõi chiếc chuông", excerpt: "Chiếc chuông chưa được giải mã." },
            { source: "story/chapter_summaries.md#2", reason: "Tóm tắt liên quan", excerpt: "Linh đã phát hiện ký hiệu." },
            { source: "story/volume_summaries.md#1", reason: "Tóm tắt tập", excerpt: "Bí mật chiếc chuông là trọng tâm." },
          ],
        },
        ruleStack: { layers: [], sections: { hard: [], soft: [], diagnostic: [] }, overrideEdges: [], activeOverrides: [] },
      });

      const legacyPrompt = (chat.mock.calls[0]?.[0] as Array<{ content: string }>)[1]?.content ?? "";
      const governedPrompt = (chat.mock.calls[1]?.[0] as Array<{ content: string }>)[1]?.content ?? "";
      const systemPrompt = (chat.mock.calls[0]?.[0] as Array<{ content: string }>)[0]?.content ?? "";
      const analyzerMarkers = [
        "CHAPTER_TITLE",
        "CHAPTER_CONTENT",
        "PRE_WRITE_CHECK",
        "POST_SETTLEMENT",
        "UPDATED_STATE",
        "UPDATED_LEDGER",
        "UPDATED_HOOKS",
        "CHAPTER_SUMMARY",
        "UPDATED_SUBPLOTS",
        "UPDATED_EMOTIONAL_ARCS",
        "UPDATED_CHARACTER_MATRIX",
      ];
      const actualMarkers = [...systemPrompt.matchAll(/^=== ([A-Z_]+) ===$/gm)]
        .map((match) => match[1]);
      expect(actualMarkers).toEqual(analyzerMarkers);
      expect(systemPrompt).toContain("- Tiêu đề: Truyện Việt");
      expect(systemPrompt).toContain("- Thể loại: 通用 (other)");
      expect(systemPrompt).toContain("- Nền tảng: other");
      expect(systemPrompt).toContain("## Hướng dẫn thể loại\n\n## 题材禁忌");
      expect(systemPrompt).toContain("## Quy tắc riêng của sách\n\n## Quy tắc riêng");
      expect(systemPrompt).toContain("| hook_id | start_chapter | type | status | last_advanced_chapter | expected_payoff | payoff_timing | notes |");
      expect(legacyPrompt).toContain("## Bối cảnh thế giới");
      expect(legacyPrompt).toContain("## Dàn ý tập");
      expect(legacyPrompt).toContain("## Các tuyến gợi mở hiện tại");
      expect(legacyPrompt).toContain("## Bảng tiến độ tuyến truyện phụ hiện tại");
      expect(legacyPrompt).toContain("## Các cung cảm xúc hiện tại");
      expect(legacyPrompt).toContain("## Ma trận nhân vật hiện tại");
      expect(legacyPrompt).toContain("## Tóm tắt các chương trước");
      expect(legacyPrompt).toContain("| Chương | Tiêu đề | Nhân vật | Sự kiện chính | Thay đổi trạng thái | Diễn biến gợi mở | Sắc thái | Loại chương |");
      expect(governedPrompt).toContain("## Dữ liệu điều khiển chương (do Planner/Composer biên soạn)");
      expect(governedPrompt).toContain("### Ngữ cảnh đã chọn");
      expect(governedPrompt).toContain("### Ngăn xếp quy tắc");
      expect(governedPrompt).toContain("### Ghi đè đang áp dụng");
      expect(governedPrompt).not.toContain("## 本章控制输入");
      expect(governedPrompt).toContain("## Bằng chứng gợi mở đã chọn");
      expect(governedPrompt).toContain("## Bằng chứng tóm tắt chương đã chọn");
      expect(governedPrompt).toContain("## Bằng chứng tóm tắt tập đã chọn");
      expect(governedPrompt).not.toContain("## 已选伏笔证据");
    } finally {
      await rm(bookDir, { recursive: true, force: true });
    }
  });

  it("uses Vietnamese missing-file and chapter-title fallbacks", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-analyzer-vi-missing-"));
    const agent = new ChapterAnalyzerAgent({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: { temperature: 0.7, maxTokens: 4096, thinkingBudget: 0, extra: {} },
      },
      model: "test-model",
      projectRoot: process.cwd(),
    });
    const chat = vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({
        content: [
          "=== CHAPTER_TITLE ===", "", "=== CHAPTER_CONTENT ===", "Linh bước vào căn phòng trống.", "",
          "=== PRE_WRITE_CHECK ===", "", "=== POST_SETTLEMENT ===", "", "=== UPDATED_STATE ===", "",
          "=== UPDATED_LEDGER ===", "", "=== UPDATED_HOOKS ===", "", "=== CHAPTER_SUMMARY ===", "",
          "=== UPDATED_SUBPLOTS ===", "", "=== UPDATED_EMOTIONAL_ARCS ===", "", "=== UPDATED_CHARACTER_MATRIX ===", "",
        ].join("\n"),
        usage: ZERO_USAGE,
      });
    const book: BookConfig = {
      id: "vietnamese-missing-book", title: "Truyện Việt", platform: "other", genre: "other", status: "active",
      targetChapters: 10, chapterWordCount: 2200, language: "vi",
      createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z",
    };

    try {
      const output = await agent.analyzeChapter({
        book,
        bookDir,
        chapterNumber: 4,
        chapterContent: "Linh bước vào căn phòng trống.",
      });

      const userPrompt = (chat.mock.calls[0]?.[0] as Array<{ content: string }>)[1]?.content ?? "";
      expect(userPrompt).toContain("## Trạng thái hiện tại\n(tệp chưa được tạo)");
      expect(userPrompt).not.toContain("(文件尚未创建)");
      expect(userPrompt).not.toContain("(file not created yet)");
      expect(output.title).toBe("Chương 4");
      expect((agent as unknown as {
        findOutlineNode: (outline: string, chapter: number) => string | undefined;
      }).findOutlineNode("(tệp chưa được tạo)", 4)).toBeUndefined();
    } finally {
      await rm(bookDir, { recursive: true, force: true });
    }
  });

  it("uses governed control inputs instead of old broad truth-file blocks when provided", async () => {
    const bookDir = await mkdtemp(join(tmpdir(), "inkos-chapter-analyzer-governed-"));
    const storyDir = join(bookDir, "story");
    await mkdir(storyDir, { recursive: true });

    await Promise.all([
      writeFile(join(storyDir, "story_bible.md"), "# Story Bible\n\n- Full bible should stay out of governed analyzer prompts.\n", "utf-8"),
      writeFile(join(storyDir, "volume_outline.md"), "# Volume Outline\n\n## Chapter 100\nReturn to the mentor oath conflict.\n", "utf-8"),
      writeFile(join(storyDir, "current_state.md"), "# Current State\n\n- Lin Yue still carries the oath token.\n", "utf-8"),
      writeFile(join(storyDir, "pending_hooks.md"), [
        "# Pending Hooks",
        "",
        "| hook_id | start_chapter | type | status | last_advanced_chapter | expected_payoff | notes |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| guild-route | 1 | mystery | open | 2 | 6 | Merchant guild trail |",
        "| mentor-oath | 8 | relationship | open | 99 | 101 | Mentor oath debt |",
        "",
      ].join("\n"), "utf-8"),
      writeFile(join(storyDir, "subplot_board.md"), [
        "# Subplot Board",
        "",
        "| subplot | status | last_update | notes |",
        "| --- | --- | --- | --- |",
        "| Guild trail | open | 99 | Still active |",
        "| Harbor tax | resolved | 40 | Closed long ago |",
        "",
      ].join("\n"), "utf-8"),
      writeFile(join(storyDir, "emotional_arcs.md"), [
        "# Emotional Arcs",
        "",
        "| chapter | character | emotion | trigger | direction |",
        "| --- | --- | --- | --- | --- |",
        "| 95 | Lin Yue | grief | mentor silence | down |",
        "| 100 | Lin Yue | resolve | oath token | up |",
        "",
      ].join("\n"), "utf-8"),
      writeFile(join(storyDir, "character_matrix.md"), [
        "# Character Matrix",
        "",
        "### Character Profiles",
        "| character | role | status | notes |",
        "| --- | --- | --- | --- |",
        "| Lin Yue | protagonist | active | carries oath token |",
        "| Mentor Shen | mentor | missing | tied to oath debt |",
        "| Harbor Clerk | clerk | inactive | old tax subplot |",
        "",
      ].join("\n"), "utf-8"),
    ]);

    const agent = new ChapterAnalyzerAgent({
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          thinkingBudget: 0,
          extra: {},
        },
      },
      model: "test-model",
      projectRoot: process.cwd(),
    });

    const chat = vi.spyOn(agent as unknown as { chat: (...args: unknown[]) => Promise<unknown> }, "chat")
      .mockResolvedValue({
        content: [
          "=== CHAPTER_TITLE ===",
          "Mentor Oath Returns",
          "",
          "=== CHAPTER_CONTENT ===",
          "Lin Yue returned to the mentor oath and the missing explanation.",
          "",
          "=== PRE_WRITE_CHECK ===",
          "",
          "=== POST_SETTLEMENT ===",
          "",
          "=== UPDATED_STATE ===",
          "| Field | Value |",
          "| --- | --- |",
          "| Current Chapter | 100 |",
          "",
          "=== UPDATED_LEDGER ===",
          "",
          "=== UPDATED_HOOKS ===",
          "| hook_id | status |",
          "| --- | --- |",
          "| h1 | open |",
          "",
          "=== CHAPTER_SUMMARY ===",
          "| 100 | Mentor Oath Returns |",
          "",
          "=== UPDATED_SUBPLOTS ===",
          "",
          "=== UPDATED_EMOTIONAL_ARCS ===",
          "",
          "=== UPDATED_CHARACTER_MATRIX ===",
          "",
        ].join("\n"),
        usage: ZERO_USAGE,
      });

    const book: BookConfig = {
      id: "english-book",
      title: "English Book",
      platform: "other",
      genre: "other",
      status: "active",
      targetChapters: 120,
      chapterWordCount: 2200,
      language: "en",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    };

    try {
      await agent.analyzeChapter({
        book,
        bookDir,
        chapterNumber: 100,
        chapterTitle: "Mentor Oath Returns",
        chapterContent: "Lin Yue returned to the mentor oath and the missing explanation.",
        chapterIntent: "# Chapter Intent\n\n## Goal\nBring the focus back to the mentor oath conflict.\n",
        contextPackage: {
          chapter: 100,
          selectedContext: [
            {
              source: "story/pending_hooks.md#mentor-oath",
              reason: "Primary hook for this chapter",
              excerpt: "mentor-oath remains unresolved",
            },
            {
              source: "story/chapter_summaries.md#99",
              reason: "Closest relevant summary",
              excerpt: "Mentor oath debt sharpened",
            },
          ],
        },
        ruleStack: {
          layers: [
            { id: "L1", name: "Global", precedence: 1, scope: "global" },
            { id: "L2", name: "Book", precedence: 2, scope: "book" },
          ],
          sections: {
            hard: ["story_bible"],
            soft: ["author_intent"],
            diagnostic: ["anti_ai_checks"],
          },
          overrideEdges: [],
          activeOverrides: [
            {
              from: "brief",
              to: "current_focus",
              reason: "Keep the chapter on the oath debt",
              target: "focus",
            },
          ],
        },
      });

      const messages = chat.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
      const userPrompt = messages[1]?.content ?? "";

      expect(userPrompt).toContain("## Chapter Control Inputs (compiled by Planner/Composer)");
      expect(userPrompt).toContain("story/pending_hooks.md#mentor-oath");
      expect(userPrompt).toContain("Selected Hook Evidence");
      expect(userPrompt).not.toContain("## Story Bible");
      expect(userPrompt).not.toContain("Full bible should stay out of governed analyzer prompts");
      expect(userPrompt).not.toContain("guild-route");
    } finally {
      await rm(bookDir, { recursive: true, force: true });
    }
  });
});
