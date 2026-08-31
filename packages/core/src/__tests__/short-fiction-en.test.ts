import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildShortFictionDraftContinuationUserPrompt,
  buildShortFictionDraftReviewSystemPrompt,
  buildShortFictionDraftReviewUserPrompt,
  buildShortFictionDraftRevisionFollowup,
  buildShortFictionOutlineReviewSystemPrompt,
  buildShortFictionOutlineReviewUserPrompt,
  buildShortFictionOutlineRevisionFollowup,
  buildShortFictionOutlineSystemPrompt,
  buildShortFictionOutlineUserPrompt,
  buildShortFictionPackageSystemPrompt,
  buildShortFictionPackageUserPrompt,
  buildShortFictionWriterSystemPrompt,
  buildShortFictionWriterUserPrompt,
} from "../prompts/short-fiction.js";
import {
  ShortFictionDraftReviewerAgent,
  ShortFictionDraftReviserAgent,
  ShortFictionPackagingAgent,
  ShortFictionWriterAgent,
  parseShortFictionBatchDraft,
  parseShortFictionOutline,
  renderShortFictionDraftMarkdown,
  formatShortFictionChapterHeading,
} from "../agents/short-fiction.js";
import { runShortFictionProduction } from "../pipeline/short-fiction-runner.js";

const CJK = /[一-鿿]/;

const OUTLINE_INPUT = {
  direction: "revenge thriller inside a law firm, hidden evidence, final reversal",
  chapterCount: 12,
  charsPerChapter: 650,
  reference: { text: "short reference sample" },
};

const DRAFT_INPUT = {
  direction: "revenge thriller inside a law firm",
  outlineMarkdown: "## Plan\nChapter 1: the setup scene",
  chapterCount: 12,
  charsPerChapter: 650,
};

describe("short-fiction English prompt branch", () => {
  it("produces fully English prompts with no Chinese instruction text", () => {
    const enPrompts: Record<string, string> = {
      outlineSystem: buildShortFictionOutlineSystemPrompt("en"),
      outlineUser: buildShortFictionOutlineUserPrompt(OUTLINE_INPUT, "en"),
      outlineReviewSystem: buildShortFictionOutlineReviewSystemPrompt("en"),
      outlineReviewUser: buildShortFictionOutlineReviewUserPrompt({
        direction: OUTLINE_INPUT.direction,
        outline: { rawContent: "the plan body" },
      }, "en"),
      outlineRevisionFollowup: buildShortFictionOutlineRevisionFollowup({
        direction: OUTLINE_INPUT.direction,
        outline: { rawContent: "the plan body" },
        review: "the back half sags",
        chapterCount: 12,
        charsPerChapter: 650,
      }, "en"),
      writerSystem: buildShortFictionWriterSystemPrompt("en"),
      writerUser: buildShortFictionWriterUserPrompt(DRAFT_INPUT, "en"),
      continuationUser: buildShortFictionDraftContinuationUserPrompt({
        ...DRAFT_INPUT,
        existingDraftMarkdown: "# Existing Draft",
        missingChapters: [3, 4],
      }, "en"),
      draftReviewSystem: buildShortFictionDraftReviewSystemPrompt("en"),
      draftReviewUser: buildShortFictionDraftReviewUserPrompt({
        ...DRAFT_INPUT,
        draftMarkdown: "# The Draft Body",
      }, "en"),
      draftRevisionFollowup: buildShortFictionDraftRevisionFollowup({
        ...DRAFT_INPUT,
        review: "fix the timeline in chapter 4",
      }, "en"),
      packageSystem: buildShortFictionPackageSystemPrompt("en"),
      packageUser: buildShortFictionPackageUserPrompt({
        direction: OUTLINE_INPUT.direction,
        outlineMarkdown: "the plan",
        draftMarkdown: "the draft",
        draftTitle: "The Extra Floor",
      }, "en"),
    };

    for (const [name, prompt] of Object.entries(enPrompts)) {
      expect(prompt.trim().length, `${name} is empty`).toBeGreaterThan(0);
      expect(CJK.test(prompt), `${name} contains Chinese: ${prompt.match(CJK)?.[0]}`).toBe(false);
    }
  });


  it("keeps machine-readable block tags and word calibration in the en writer prompt", () => {
    const prompt = buildShortFictionWriterUserPrompt(DRAFT_INPUT, "en");
    expect(prompt).toContain("=== SHORT_FICTION_TITLE ===");
    expect(prompt).toContain("=== SHORT_FICTION_OPENING_HOOK ===");
    expect(prompt).toContain("=== CHAPTER 1 TITLE ===");
    expect(prompt).toContain("=== CHAPTER 12 CONTENT ===");
    expect(prompt).toContain("650 words per chapter");
  });

  it("keeps the zh default identical to the explicit zh branch", () => {
    expect(buildShortFictionWriterSystemPrompt()).toBe(buildShortFictionWriterSystemPrompt("zh"));
    expect(buildShortFictionOutlineSystemPrompt()).toBe(buildShortFictionOutlineSystemPrompt("zh"));
    expect(buildShortFictionWriterSystemPrompt()).toContain("中文短篇 BatchWriter");
    const zhWriterUser = buildShortFictionWriterUserPrompt({ ...DRAFT_INPUT, charsPerChapter: 1000 });
    expect(zhWriterUser).toContain("高潮即场景");
    expect(zhWriterUser).toContain("每章约 1000 字");
  });
});
describe("short-fiction Vietnamese prompt branch", () => {
  it("produces Vietnamese prompts with Vietnamese word-count instructions", () => {
    const input = { direction: "Một truyện ngắn trinh thám ở Hà Nội.", outlineMarkdown: "Một kế hoạch truyện đầy đủ.", chapterCount: 12, charsPerChapter: 650 };
    const outlineSystem = buildShortFictionOutlineSystemPrompt("vi");
    const outlineUser = buildShortFictionOutlineUserPrompt(input, "vi");
    const writerSystem = buildShortFictionWriterSystemPrompt("vi");
    const writerUser = buildShortFictionWriterUserPrompt(input, "vi");
    expect(outlineSystem).toContain("biên tập viên truyện ngắn tiếng Việt");
    expect(outlineUser).toContain("650 từ mỗi chương");
    expect(writerSystem).toContain("BatchWriter truyện ngắn tiếng Việt");
    expect(writerUser).toContain("Viết toàn bộ truyện 12 chương");
    expect(writerUser).toContain("650 từ mỗi chương");
    expect(writerUser).toContain("=== CHAPTER 1 TITLE ===");
  });

  it("produces fully Vietnamese prompts with no Chinese instruction text", () => {
    const viInput = { direction: "Một truyện ngắn ngược dòng thời gian ở Sài Gòn.", outlineMarkdown: "Một kế hoạch truyện đầy đủ.", chapterCount: 12, charsPerChapter: 650 };
    const viPrompts: Record<string, string> = {
      outlineSystem: buildShortFictionOutlineSystemPrompt("vi"),
      outlineUser: buildShortFictionOutlineUserPrompt(viInput, "vi"),
      outlineReviewSystem: buildShortFictionOutlineReviewSystemPrompt("vi"),
      outlineReviewUser: buildShortFictionOutlineReviewUserPrompt({
        direction: viInput.direction,
        outline: { rawContent: "phần thân kế hoạch" },
      }, "vi"),
      outlineRevisionFollowup: buildShortFictionOutlineRevisionFollowup({
        direction: viInput.direction,
        outline: { rawContent: "phần thân kế hoạch" },
        review: "nửa sau chùng",
        chapterCount: 12,
        charsPerChapter: 650,
      }, "vi"),
      writerSystem: buildShortFictionWriterSystemPrompt("vi"),
      writerUser: buildShortFictionWriterUserPrompt(viInput, "vi"),
      continuationUser: buildShortFictionDraftContinuationUserPrompt({
        ...viInput,
        outlineMarkdown: "## Kế hoạch",
        existingDraftMarkdown: "# Bản thảo hiện có",
        missingChapters: [3, 4],
      }, "vi"),
      draftReviewSystem: buildShortFictionDraftReviewSystemPrompt("vi"),
      draftReviewUser: buildShortFictionDraftReviewUserPrompt({
        ...viInput,
        outlineMarkdown: "## Kế hoạch",
        draftMarkdown: "# Thân bản thảo",
      }, "vi"),
      draftRevisionFollowup: buildShortFictionDraftRevisionFollowup({
        ...viInput,
        outlineMarkdown: "## Kế hoạch",
        review: "sửa mạch thời gian ở chương 4",
      }, "vi"),
      packageSystem: buildShortFictionPackageSystemPrompt("vi"),
      packageUser: buildShortFictionPackageUserPrompt({
        direction: viInput.direction,
        outlineMarkdown: "kế hoạch",
        draftMarkdown: "bản thảo",
        draftTitle: "Tầng bí mật",
      }, "vi"),
    };

    for (const [name, prompt] of Object.entries(viPrompts)) {
      expect(prompt.trim().length, `${name} is empty`).toBeGreaterThan(0);
      expect(CJK.test(prompt), `${name} contains Chinese: ${prompt.match(CJK)?.[0]}`).toBe(false);
    }
  });

  it("keeps machine-readable block tags in every vi prompt builder", () => {
    const input = { direction: "Một truyện ngắn trinh thám ở Hà Nội.", outlineMarkdown: "Một kế hoạch truyện đầy đủ.", chapterCount: 12, charsPerChapter: 650 };
    expect(buildShortFictionWriterUserPrompt(input, "vi")).toContain("=== SHORT_FICTION_TITLE ===");
    expect(buildShortFictionWriterUserPrompt(input, "vi")).toContain("=== SHORT_FICTION_OPENING_HOOK ===");
    expect(buildShortFictionWriterUserPrompt(input, "vi")).toContain("=== CHAPTER 1 TITLE ===");
    expect(buildShortFictionWriterUserPrompt(input, "vi")).toContain("=== CHAPTER 12 CONTENT ===");
    expect(buildShortFictionOutlineUserPrompt(input, "vi")).toContain("=== SHORT_FICTION_PLAN_TITLE ===");
    expect(buildShortFictionOutlineUserPrompt(input, "vi")).toContain("=== SHORT_FICTION_PLAN ===");
    const revision = buildShortFictionOutlineRevisionFollowup({
      direction: input.direction,
      outline: { rawContent: "thân kế hoạch" },
      review: "nửa sau chùng",
      chapterCount: 12,
      charsPerChapter: 650,
    }, "vi");
    expect(revision).toContain("=== SHORT_FICTION_PLAN_TITLE ===");
    const followup = buildShortFictionDraftRevisionFollowup({
      ...input,
      outlineMarkdown: "## Kế hoạch",
      review: "bổ sung cảnh thật",
    }, "vi");
    expect(followup).toContain("=== SHORT_FICTION_TITLE ===");
    expect(followup).toContain("=== SHORT_FICTION_OPENING_HOOK ===");
    expect(buildShortFictionPackageUserPrompt({
      direction: input.direction,
      outlineMarkdown: "kế hoạch",
      draftMarkdown: "bản thảo",
      draftTitle: "Tầng bí mật",
    }, "vi")).toContain("=== SHORT_FICTION_PACKAGE_TITLE ===");
    expect(buildShortFictionPackageUserPrompt({
      direction: input.direction,
      outlineMarkdown: "kế hoạch",
      draftMarkdown: "bản thảo",
      draftTitle: "Tầng bí mật",
    }, "vi")).toContain("=== SHORT_FICTION_INTRO ===");
    expect(buildShortFictionDraftContinuationUserPrompt({
      ...input,
      outlineMarkdown: "## Kế hoạch",
      existingDraftMarkdown: "# Bản thảo",
      missingChapters: [4],
    }, "vi")).toContain("=== CHAPTER 4 TITLE ===");
    expect(buildShortFictionDraftContinuationUserPrompt({
      ...input,
      outlineMarkdown: "## Kế hoạch",
      existingDraftMarkdown: "# Bản thảo",
      missingChapters: [4],
    }, "vi")).toContain("=== CHAPTER 4 CONTENT ===");
  });
});

const VI_ONE_TAGGED_DRAFT = `
=== SHORT_FICTION_TITLE ===
Chuyến thang máy lạ
=== SHORT_FICTION_OPENING_HOOK ===
Thang máy dừng ở một tầng không có trong bản vẽ.
=== CHAPTER 1 TITLE ===
Chương 1: Nút bấm thứ mười ba
=== CHAPTER 1 CONTENT ===
Thang máy mở ra một hành lang không có trong bản vẽ nào.
`;

describe("short-fiction Vietnamese parsing and rendering", () => {
  it("counts vi chapter length in words (vi_words), not characters", () => {
    const draft = parseShortFictionBatchDraft(VI_ONE_TAGGED_DRAFT, { expectedChapters: 1, language: "vi" });
    // "Thang máy mở ra một hành lang không có trong bản vẽ nào." = 13 words
    expect(draft.chapters[0]?.charCount).toBe(13);
  });

  it("strips the Chương N prefix from vi titles and uses vi fallbacks", () => {
    const draft = parseShortFictionBatchDraft(VI_ONE_TAGGED_DRAFT, { expectedChapters: 2, language: "vi" });
    expect(draft.chapters[0]?.title).toBe("Nút bấm thứ mười ba");
    expect(draft.chapters[1]?.title).toBe("Chương 2"); // missing chapter falls back in Vietnamese
    expect(parseShortFictionOutline("không có thẻ nào", "vi").storyTitle).toBe("Truyện ngắn chưa đặt tên");
  });

  it("formats and renders vi chapter headings without any Chinese", () => {
    const draft = parseShortFictionBatchDraft(VI_ONE_TAGGED_DRAFT, { expectedChapters: 2, language: "vi" });
    expect(formatShortFictionChapterHeading(1, "Nút bấm thứ mười ba", "vi")).toBe("Chương 1: Nút bấm thứ mười ba");
    expect(formatShortFictionChapterHeading(2, "", "vi")).toBe("Chương 2");
    const markdown = renderShortFictionDraftMarkdown(draft, "vi");
    expect(markdown).toContain("# Chuyến thang máy lạ");
    expect(markdown).toContain("## Móc mở đầu");
    expect(markdown).toContain("## Chương 1: Nút bấm thứ mười ba");
    expect(markdown).toContain("## Chương 2");
    expect(CJK.test(markdown)).toBe(false);
  });

  it("parses vi markdown fallback chapter headings with the Chương prefix", () => {
    const raw = [
      "# Chuyến thang máy lạ",
      "## Chương 1: Nút bấm thứ mười ba",
      "Thang máy mở ra một hành lang không có trong bản vẽ.",
      "## Chương 2: Tiếng chuông",
      "Cô bấm nút năm lần trước khi bảng điện tắt ngấm.",
    ].join("\n");
    const draft = parseShortFictionBatchDraft(raw, { expectedChapters: 2, language: "vi" });
    expect(draft.chapters[0]?.title).toBe("Nút bấm thứ mười ba");
    expect(draft.chapters[1]?.title).toBe("Tiếng chuông");
    expect(draft.chapters[0]?.content).toBe("Thang máy mở ra một hành lang không có trong bản vẽ.");
    expect(draft.chapters[1]?.content).toBe("Cô bấm nút năm lần trước khi bảng điện tắt ngấm.");
    expect(CJK.test(draft.chapters[0]?.title ?? "")).toBe(false);
  });

  it("uses numbered vi chapter headings as boundaries despite other level-2 headings", () => {
    const raw = [
      "# Chuyến thang máy lạ",
      "## Móc mở đầu",
      "Thang máy dừng ở một tầng không có trong bản vẽ.",
      "## Chương 1: Nút bấm thứ mười ba",
      "Thang máy mở ra một hành lang không có trong bản vẽ.",
      "## Dấu vết trong hành lang",
      "Một vệt nước dẫn tới cánh cửa khóa kín.",
      "## Chương 2: Tiếng chuông",
      "Cô bấm nút năm lần trước khi bảng điện tắt ngấm.",
    ].join("\n");

    const draft = parseShortFictionBatchDraft(raw, { expectedChapters: 2, language: "vi" });

    expect(draft.chapters[0]).toMatchObject({
      title: "Nút bấm thứ mười ba",
      content: [
        "Thang máy mở ra một hành lang không có trong bản vẽ.",
        "## Dấu vết trong hành lang",
        "Một vệt nước dẫn tới cánh cửa khóa kín.",
      ].join("\n"),
    });
    expect(draft.chapters[1]).toMatchObject({
      title: "Tiếng chuông",
      content: "Cô bấm nút năm lần trước khi bảng điện tắt ngấm.",
    });
  });
});

const EN_TWO_CHAPTER_DRAFT = `
=== SHORT_FICTION_TITLE ===
The Extra Floor
=== SHORT_FICTION_OPENING_HOOK ===
The elevator stopped on a floor that does not exist.
=== CHAPTER 1 TITLE ===
Chapter 1: The Thirteenth Button
=== CHAPTER 1 CONTENT ===
The elevator doors opened onto a hallway that was not on any blueprint.
=== CHAPTER 2 TITLE ===
The Night Shift
=== CHAPTER 2 CONTENT ===
She pressed the button five times before the panel finally went dark.
`;

describe("short-fiction English parsing and rendering", () => {
  it("counts en chapter length in words, not characters", () => {
    const draft = parseShortFictionBatchDraft(EN_TWO_CHAPTER_DRAFT, { expectedChapters: 2, language: "en" });
    // "The elevator doors opened onto a hallway that was not on any blueprint." = 13 words
    expect(draft.chapters[0]?.charCount).toBe(13);
    // "She pressed the button five times before the panel finally went dark." = 12 words
    expect(draft.chapters[1]?.charCount).toBe(12);
  });

  it("keeps zh default counting by characters", () => {
    const draft = parseShortFictionBatchDraft([
      "=== SHORT_FICTION_TITLE ===",
      "电梯多一层",
      "=== CHAPTER 1 TITLE ===",
      "第十三个按钮",
      "=== CHAPTER 1 CONTENT ===",
      "深夜电梯 停在十三层",
    ].join("\n"), { expectedChapters: 1 });
    expect(draft.chapters[0]?.charCount).toBe(9); // whitespace excluded, characters counted
  });

  it("strips the Chapter N prefix from en titles and uses en fallbacks", () => {
    const draft = parseShortFictionBatchDraft(EN_TWO_CHAPTER_DRAFT, { expectedChapters: 3, language: "en" });
    expect(draft.chapters[0]?.title).toBe("The Thirteenth Button");
    expect(draft.chapters[1]?.title).toBe("The Night Shift");
    expect(draft.chapters[2]?.title).toBe("Chapter 3"); // missing chapter falls back in English
    expect(parseShortFictionOutline("no tags here", "en").storyTitle).toBe("Untitled Short Story");
  });

  it("renders en draft markdown with English headings", () => {
    const draft = parseShortFictionBatchDraft(EN_TWO_CHAPTER_DRAFT, { expectedChapters: 2, language: "en" });
    const markdown = renderShortFictionDraftMarkdown(draft, "en");
    expect(markdown).toContain("# The Extra Floor");
    expect(markdown).toContain("## Opening Hook");
    expect(markdown).toContain("## Chapter 1: The Thirteenth Button");
    expect(markdown).toContain("## Chapter 2: The Night Shift");
    expect(CJK.test(markdown)).toBe(false);
  });

  it("parses unnumbered markdown chapter headings by position", () => {
    const draft = parseShortFictionBatchDraft([
      "# The Extra Floor",
      "## The Thirteenth Button",
      "The elevator doors opened onto a hallway.",
      "## The Night Shift",
      "The panel finally went dark.",
    ].join("\n"), { expectedChapters: 2, language: "en" });

    expect(draft.chapters[0]).toMatchObject({
      title: "The Thirteenth Button",
      content: "The elevator doors opened onto a hallway.",
    });
    expect(draft.chapters[1]).toMatchObject({
      title: "The Night Shift",
      content: "The panel finally went dark.",
    });
  });
});

describe("short-fiction runner English branch", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "inkos-short-en-")); });
  afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

  function runtimes(projectRoot: string) {
    const context = { client: { provider: "openai" } as never, model: "fake", projectRoot };
    return { planner: context, outlineReview: context, writer: context, draftReview: context, revise: context, package: context };
  }

  it("bounds en charsPerChapter in words (600-800), rejecting the zh char range", async () => {
    await expect(runShortFictionProduction({
      projectRoot: root,
      direction: "haunted elevator",
      language: "en",
      charsPerChapter: 1000,
      cover: false,
      runtimes: runtimes(root),
    })).rejects.toThrow(/charsPerChapter must be an integer between 600 and 800/);
  });

  it("threads language and the en word default through the pipeline and artifacts", async () => {
    const CH = 12;
    await mkdir(join(root, "shorts", "extra-floor", "outline"), { recursive: true });
    await writeFile(join(root, "shorts", "extra-floor", "outline", "v002.md"), "## Existing plan", "utf-8");

    const draftMd = [
      "=== SHORT_FICTION_TITLE ===",
      "The Extra Floor",
      ...Array.from({ length: CH }, (_, index) => [
        `=== CHAPTER ${index + 1} TITLE ===`,
        `Room ${index + 1}`,
        `=== CHAPTER ${index + 1} CONTENT ===`,
        "The corridor bends where no corridor should bend. ".repeat(20),
      ].join("\n")),
    ].join("\n");
    const draft = parseShortFictionBatchDraft(draftMd, { expectedChapters: CH, language: "en" });

    const writeDraft = vi.spyOn(ShortFictionWriterAgent.prototype, "writeDraft").mockResolvedValue(draft);
    vi.spyOn(ShortFictionDraftReviewerAgent.prototype, "reviewDraft").mockResolvedValue("reads fine");
    vi.spyOn(ShortFictionDraftReviserAgent.prototype, "reviseDraft").mockResolvedValue(draft);
    vi.spyOn(ShortFictionPackagingAgent.prototype, "generatePackage").mockResolvedValue({
      title: "The Extra Floor", intro: "An elevator hook.", sellingPoints: ["reversal"], coverPrompt: "", rawContent: "",
    });

    await runShortFictionProduction({
      projectRoot: root,
      direction: "haunted elevator",
      storyId: "extra-floor",
      chapterCount: CH,
      cover: false,
      language: "en",
      runtimes: runtimes(root),
    });

    expect(writeDraft).toHaveBeenCalledWith(expect.objectContaining({ language: "en", charsPerChapter: 650 }));
    const final = await readFile(join(root, "shorts", "extra-floor", "final", "full.md"), "utf-8");
    expect(final).toContain("## Chapter 12: Room 12");
    expect(CJK.test(final)).toBe(false);
    const chapterFile = await readFile(join(root, "shorts", "extra-floor", "final", "chapters", "0001.md"), "utf-8");
    expect(chapterFile.startsWith("# Chapter 1: Room 1")).toBe(true);
    const salesPackage = await readFile(join(root, "shorts", "extra-floor", "final", "sales-package.md"), "utf-8");
    expect(salesPackage).toContain("## Synopsis");
    expect(salesPackage).toContain("## Selling Points");
  });
});
