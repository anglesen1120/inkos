import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlannerAgent } from "../agents/planner.js";
import * as llmProvider from "../llm/provider.js";
import type { LLMClient } from "../llm/provider.js";
import type { BookConfig } from "../models/book.js";

const VALID_BODY = `
## 场景与篇幅预算
- 场景一（900字）：进入七号门现场，确认锁芯刮痕并排除自然磨损。
- 场景二（1200字）：对照监控时间线与门禁记录，形成可复核的证据链。
- 场景三（900字）：带着实证离场，同时让幕后主使的压力逼近但不揭底。

## 当前任务
主角进入七号门现场，比对锁芯刮痕与监控时间线，把"被动过手脚"从猜测钉成实证。

## 读者此刻在等什么
1) 读者在等七号门是否有异常实锤
2) 本章完全兑现，钉成现场实证

## 该兑现的 / 暂不掀的
- 该兑现：七号门异常 → 钉成现场实证
- 暂不掀：幕后主使 → 压到第 20 章

## 日常/过渡承担什么任务
不适用 - 本章为高压实证章，无日常过渡段。

## 关键抉择过三连问
- 主角本章最关键的一次选择：
  - 为什么这么做？线索只剩这一条
  - 符合当前利益吗？符合
  - 符合他的人设吗？符合
- 对手/配角本章最关键的一次选择：
  - 为什么这么做？掩盖踪迹
  - 符合当前利益吗？符合
  - 符合他的人设吗？符合

## 章尾必须发生的改变
- 信息改变：主角掌握实证，可以面对幕后主使前先压住对手的退路

## 本章 hook 账
advance:
- H03 "七号门异常" → 从 pressured → near_payoff（本章钉成实证）
resolve:
- S004 "锁芯刮痕" → 核验完毕，本章结清
defer:
- H07 "幕后主使" → 第 20 章再动

## 不要做
- 不要让对手突然降智
- 不要直接点破幕后主使
`.trim();

function validMemoRaw(chapter: number): string {
  return `# 第 ${chapter} 章 memo

## 本章目标
把七号门被动过手脚钉成现场实证

## 关联线索
- H03
- S004

${VALID_BODY}
`;
}

const ZERO_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
} as const;

const STUB_CLIENT: LLMClient = {
  provider: "openai",
  apiFormat: "chat",
  stream: false,
  defaults: { temperature: 0.7, maxTokens: 2048, thinkingBudget: 0, maxTokensCap: null, extra: {} },
};

function makeBook(): BookConfig {
  return {
    id: "book-plan-1",
    title: "Test Book",
    genre: "urban",
    platform: "qidian",
    status: "active",
    language: "zh",
    targetChapters: 120,
    chapterWordCount: 3000,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
}

async function seedStoryFiles(bookDir: string): Promise<void> {
  const storyDir = join(bookDir, "story");
  await mkdir(storyDir, { recursive: true });
  await Promise.all([
    writeFile(join(storyDir, "author_intent.md"), "# Intent\n- Tell a taut mystery.", "utf-8"),
    writeFile(join(storyDir, "current_focus.md"), "# Focus\n- Keep pressure on the seventh gate.", "utf-8"),
    writeFile(join(storyDir, "story_bible.md"), "# Bible\n- Protagonist: 阿泽", "utf-8"),
    writeFile(join(storyDir, "volume_outline.md"), "# Outline\n- 第 1 章：开场", "utf-8"),
    writeFile(join(storyDir, "chapter_summaries.md"), "# Summaries\n", "utf-8"),
    writeFile(join(storyDir, "book_rules.md"), "# Rules\n- 禁止反派降智", "utf-8"),
    writeFile(join(storyDir, "current_state.md"), "# State\n- 主角在七号门附近", "utf-8"),
    writeFile(join(storyDir, "pending_hooks.md"), "# Hooks\n", "utf-8"),
    writeFile(join(storyDir, "subplot_board.md"), "# Subplot\n", "utf-8"),
    writeFile(join(storyDir, "emotional_arcs.md"), "# Arcs\n", "utf-8"),
    writeFile(join(storyDir, "character_matrix.md"), "# Matrix\n", "utf-8"),
  ]);
}

describe("PlannerAgent.planChapter memo generation", () => {
  let root: string;
  let bookDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "planner-memo-"));
    bookDir = join(root, "book");
    await seedStoryFiles(bookDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  function makePlanner(): PlannerAgent {
    return new PlannerAgent({
      client: STUB_CLIENT,
      model: "test-model",
      projectRoot: root,
      bookId: "book-plan-1",
    });
  }

  it("produces a valid ChapterMemo when the LLM returns well-formed output", async () => {
    const chatSpy = vi.spyOn(llmProvider, "chatCompletion").mockResolvedValue({
      content: validMemoRaw(1),
      usage: ZERO_USAGE,
    } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);

    const result = await makePlanner().planChapter({
      book: makeBook(),
      bookDir,
      chapterNumber: 1,
    });

    expect(chatSpy).toHaveBeenCalledTimes(1);
    expect(result.memo.chapter).toBe(1);
    expect(result.memo.isGoldenOpening).toBe(true); // ch1 zh → golden opening, authoritative over LLM
    expect(result.memo.goal).toBe("把七号门被动过手脚钉成现场实证");
    expect(result.memo.threadRefs).toEqual(["H03", "S004"]);
    expect(result.memo.body).toContain("## 当前任务");
  });

  it("does not hard-cap memo generation below the configured model output budget", async () => {
    const chatSpy = vi.spyOn(llmProvider, "chatCompletion").mockResolvedValue({
      content: validMemoRaw(1),
      usage: ZERO_USAGE,
    } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);

    await makePlanner().planChapter({
      book: makeBook(),
      bookDir,
      chapterNumber: 1,
    });

    const callArgs = chatSpy.mock.calls[0]!;
    const options = callArgs[3] as { temperature?: number; maxTokens?: number } | undefined;
    expect(options).toEqual(expect.objectContaining({ temperature: 0.7 }));
    expect(options).not.toHaveProperty("maxTokens");
  });

  it("passes per-chapter user context into the memo prompt as a high-priority instruction", async () => {
    const chatSpy = vi.spyOn(llmProvider, "chatCompletion").mockResolvedValue({
      content: validMemoRaw(1),
      usage: ZERO_USAGE,
    } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);

    await makePlanner().planChapter({
      book: makeBook(),
      bookDir,
      chapterNumber: 1,
      externalContext: "本章标题：雨夜账本\n必须围绕账本失窃后的当面对质展开。",
    });

    const callArgs = chatSpy.mock.calls[0]!;
    const messages = callArgs[2] as ReadonlyArray<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("本章用户指令");
    expect(userMsg?.content).toContain("本章标题：雨夜账本");
    expect(userMsg?.content).toContain("当面对质");
  });

  it("retries when the first response is malformed and succeeds on retry", async () => {
    const chatSpy = vi.spyOn(llmProvider, "chatCompletion")
      .mockResolvedValueOnce({
        content: "no memo sections here",
        usage: ZERO_USAGE,
      } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>)
      .mockResolvedValueOnce({
        content: "still no memo sections",
        usage: ZERO_USAGE,
      } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>)
      .mockResolvedValueOnce({
        content: validMemoRaw(4),
        usage: ZERO_USAGE,
      } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);

    const result = await makePlanner().planChapter({
      book: makeBook(),
      bookDir,
      chapterNumber: 4,
    });

    expect(chatSpy).toHaveBeenCalledTimes(3);
    expect(result.memo.chapter).toBe(4);
    expect(result.memo.isGoldenOpening).toBe(false);

    // Retry prompts must include the failure feedback
    const secondCallArgs = chatSpy.mock.calls[1]!;
    const secondMessages = secondCallArgs[2] as ReadonlyArray<{ role: string; content: string }>;
    const userMsg = secondMessages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("上次输出的错误");
  });

  // Phase hotfix 4: English books must receive English system + user prompts
  // and English golden-opening guidance for chapters ≤ 3.
  it("uses English prompts end-to-end when book.language is en", async () => {
    const VALID_EN_BODY = `
## Scene and length budget
- Scene one (600 words): enter Door 7, inspect the lock, and rule out ordinary wear.
- Scene two (800 words): compare access logs with surveillance timing and establish a verifiable chain of evidence.
- Scene three (600 words): leave with proof while the mastermind's pressure closes in without revealing them.

## Current task
Pin the Door 7 tampering from suspicion to live evidence.

## What the reader is waiting for right now
1) Reader expects to learn whether Door 7 is really compromised.
2) This chapter pays it off in full — live evidence on stage.

## To pay off / to keep buried
- Pay off: Door 7 anomaly → live evidence
- Keep buried: the mastermind → push to chapter 20

## What the slow / transitional beats carry
n/a — pressure chapter, no transitional beats.

## Three-question check on the key choice
- Protagonist's most important choice this chapter:
  - Why this choice? It is the only remaining lead.
  - Does it match current interest? Yes.
  - Does it match their persona? Yes.
- Antagonist / supporting cast's most important choice this chapter:
  - Why this choice? To cover their tracks.
  - Does it match current interest? Yes.
  - Does it match their persona? Yes.

## Required end-of-chapter change
- Information change: protagonist holds live evidence.

## Hook ledger for this chapter
advance:
- H03 "Door 7 anomaly" → pressured → near_payoff (pinned as live evidence this chapter)
defer:
- H07 "the mastermind" → hold until chapter 20

## Do not
- Do not let the antagonist suddenly turn dumb.
- Do not directly name the mastermind.
`.trim();

    const validEnRaw = `# Chapter 1 memo

## Chapter goal
Pin Door 7 tampering as live evidence

## Thread refs
- H03

${VALID_EN_BODY}
`;

    const chatSpy = vi.spyOn(llmProvider, "chatCompletion").mockResolvedValue({
      content: validEnRaw,
      usage: ZERO_USAGE,
    } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);

    const enBook = { ...makeBook(), language: "en" as const };
    const result = await makePlanner().planChapter({
      book: enBook,
      bookDir,
      chapterNumber: 1,
    });

    expect(chatSpy).toHaveBeenCalledTimes(1);
    expect(result.memo.chapter).toBe(1);
    expect(result.memo.isGoldenOpening).toBe(true); // ch1 en → also golden (≤5)

    // System prompt must be the English variant
    const callArgs = chatSpy.mock.calls[0]!;
    const messages = callArgs[2] as ReadonlyArray<{ role: string; content: string }>;
    const systemMsg = messages.find((m) => m.role === "system");
    const userMsg = messages.find((m) => m.role === "user");
    // English system prompt markers
    expect(systemMsg?.content).toContain("editor-in-chief");
    expect(systemMsg?.content).toContain("Output format (strict)");
    expect(systemMsg?.content).not.toContain("你是这本小说的创作总编");
    expect(systemMsg?.content).not.toContain("tổng biên tập sáng tác");
    expect(systemMsg?.content).not.toContain("## Output format (bắt buộc)");
    expect(systemMsg?.content).toContain("## Hook ledger for this chapter");
    expect(systemMsg?.content).toContain("open/advance/resolve/defer");
    expect(systemMsg?.content).toContain("hook_id");

    // English user template markers
    expect(userMsg?.content).toContain("# Chapter 1 memo request");
    expect(userMsg?.content).toContain("Last screen of previous chapter");
    expect(userMsg?.content).toContain("Golden opening chapter: yes");
    expect(userMsg?.content).not.toContain("# Yêu cầu memo chương 1");
    expect(userMsg?.content).not.toContain("Chương mở đầu vàng");
    expect(userMsg?.content).not.toContain("## Hướng dẫn mở đầu vàng");
  });
  it("uses Vietnamese prompts end-to-end when book.language is vi", async () => {
    const VALID_VI_BODY = `
## Scene and length budget
- Scene 1 (600 từ): vào hiện trường Cổng Bảy, kiểm tra vết xước ổ khóa và loại trừ hao mòn tự nhiên.
- Scene 2 (800 từ): đối chiếu mốc thời gian camera với nhật ký cửa, hình thành chuỗi bằng chứng kiểm chứng được.
- Scene 3 (600 từ): rời đi cùng bằng chứng, sức ép của kẻ chủ mưu siết lại nhưng chưa lộ diện.

## Current task
Nhân vật chính vào hiện trường Cổng Bảy, so sánh vết xước ổ khóa với mốc thời gian camera, đóng đinh "bị động tay chân" từ phỏng đoán thành bằng chứng hiện trường.

## What the reader is waiting for right now
1) Độc giả đang chờ Cổng Bảy có gì bất thường.
2) Chương này hồi đáp trọn vẹn, đóng đinh bằng chứng hiện trường.

## To pay off / to keep buried
- Pay off: bất thường Cổng Bảy → đóng đinh bằng chứng hiện trường
- Keep buried: kẻ chủ mưu → giữ đến chương 20

## What the slow / transitional beats carry
Không áp dụng - chương áp lực bằng chứng, không có đoạn chuyển tiếp.

## Three-question check on the key choice
- Lựa chọn quan trọng nhất của nhân vật chính:
  - Vì sao chọn vậy? Manh mối chỉ còn lại một đường này.
  - Có khớp lợi ích hiện tại không? Có.
  - Có khớp nhân vật không? Có.

## Required end-of-chapter change
- Thay đổi thông tin: nhân vật chính nắm bằng chứng hiện trường.

## Hook ledger for this chapter
advance:
- H03 "bất thường Cổng Bảy" → từ pressured → near_payoff (chương này đóng đinh)
defer:
- H07 "kẻ chủ mưu" → giữ đến chương 20

## Do not
- Không để kẻ địch đột ngột hạ trí.
- Không trực tiếp vạch mặt kẻ chủ mưu.
`.trim();

    const validViRaw = `# Chapter 1 memo

## Chapter goal
Đóng đinh Cổng Bảy bị động tay chân thành bằng chứng hiện trường

## Thread refs
- H03

${VALID_VI_BODY}
`;

    const chatSpy = vi.spyOn(llmProvider, "chatCompletion").mockResolvedValue({
      content: validViRaw,
      usage: ZERO_USAGE,
    } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);

    const viBook = { ...makeBook(), language: "vi" as const };
    await Promise.all([
      writeFile(join(bookDir, "story/subplot_board.md"), "| S001 | Tuyến chìa khóa | Mai | 1 | 3 | 0 | active | Đang truy dấu | 1 chương |\n", "utf-8"),
      writeFile(join(bookDir, "story/emotional_arcs.md"), "| Mai | 0 | Căng thẳng | Mất chìa khóa | 8 | Leo thang |\n", "utf-8"),
      writeFile(join(bookDir, "story/book_rules.md"), [
        "---",
        "version: \"1.0\"",
        "protagonist:",
        "  name: Mai",
        "  personalityLock: [điềm tĩnh]",
        "  behavioralConstraints: [không bỏ rơi đồng đội]",
        "genreLock:",
        "  primary: mystery",
        "  forbidden: [xuyên không]",
        "prohibitions: [không tiết lộ bí mật]",
        "fanficMode: canon",
        "---",
      ].join("\n"), "utf-8"),
    ]);
    const result = await makePlanner().planChapter({
      book: viBook,
      bookDir,
      chapterNumber: 1,
    });

    expect(chatSpy).toHaveBeenCalledTimes(1);
    expect(result.memo.chapter).toBe(1);
    expect(result.memo.goal).toBe("Đóng đinh Cổng Bảy bị động tay chân thành bằng...");
    expect(result.memo.threadRefs).toEqual(["H03"]);

    const callArgs = chatSpy.mock.calls[0]!;
    const messages = callArgs[2] as ReadonlyArray<{ role: string; content: string }>;
    const systemMsg = messages.find((m) => m.role === "system");
    const userMsg = messages.find((m) => m.role === "user");

    // Vietnamese system prompt: parser-recognized English structural headings,
    // Vietnamese prose, no Chinese fallback.
    expect(systemMsg?.content).toContain("tổng biên tập sáng tác");
    expect(systemMsg?.content).toContain("## Output format (bắt buộc)");
    expect(systemMsg?.content).toContain("## Scene and length budget");
    expect(systemMsg?.content).toContain("## Current task");
    expect(systemMsg?.content).toContain("## Hook ledger for this chapter");
    expect(systemMsg?.content).toContain("## Do not");
    expect(systemMsg?.content).toContain("open/advance/resolve/defer");
    expect(systemMsg?.content).toContain("hook_id");
    expect(systemMsg?.content).toContain("tiếng Việt tự nhiên");
    expect(systemMsg?.content).not.toContain("你是这本小说的创作总编");
    expect(systemMsg?.content).not.toContain("editor-in-chief");

    expect(userMsg?.content).toContain("# Yêu cầu memo chương 1");
    expect(userMsg?.content).toContain("## Màn hình cuối chương trước (trích)");
    expect(userMsg?.content).toContain("Chương mở đầu vàng: có");
    expect(userMsg?.content).toContain("## Hướng dẫn mở đầu vàng — Chương 1");
    expect(userMsg?.content).toContain("Tuyến phụ đang hoạt động");
    expect(userMsg?.content).toContain("Cung cảm xúc gần đây");
    expect(userMsg?.content).not.toContain("活跃支线");
    expect(userMsg?.content).not.toContain("近期情感线");
    expect(userMsg?.content).not.toContain("# 第 1 章 memo 请求");
    expect(userMsg?.content).not.toContain("黄金三章规划指引");
    expect(userMsg?.content).toContain("(chưa có tóm tắt chương trước)");
    expect(userMsg?.content).toContain("(không tìm thấy hàng nhân vật chính — hãy kiểm tra character_matrix.md)");
    expect(userMsg?.content).toContain("(chưa có đối thủ rõ ràng xuất hiện)");
    expect(userMsg?.content).toContain("(chưa có cộng tác viên rõ ràng xuất hiện)");
    expect(userMsg?.content).toContain("Nhân vật chính Mai / khóa tính cách: điềm tĩnh / ràng buộc hành vi: không bỏ rơi đồng đội");
    expect(userMsg?.content).toContain("Điều cấm của sách");
    expect(userMsg?.content).toContain("Khóa thể loại: mystery / không pha trộn: xuyên không");
    expect(userMsg?.content).toContain("Chế độ đồng nhân: canon");
    expect(userMsg?.content).not.toContain("暂无前章摘要");
    expect(userMsg?.content).not.toContain("未找到主角行");
    expect(userMsg?.content).not.toContain("暂无明确对手登场");
    expect(userMsg?.content).not.toContain("暂无明确协作者登场");
    expect(userMsg?.content).not.toContain("本书禁忌");
    expect(userMsg?.content).not.toContain("题材锁");
  });
  it("uses a Vietnamese goal for a sparse vi book when memo generation degrades", async () => {
    vi.spyOn(llmProvider, "chatCompletion").mockResolvedValue({
      content: "permanently broken",
      usage: ZERO_USAGE,
    } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);
    await Promise.all([
      writeFile(join(bookDir, "story/author_intent.md"), "(文件尚未创建)", "utf-8"),
      writeFile(join(bookDir, "story/current_focus.md"), "(文件尚未创建)", "utf-8"),
      writeFile(join(bookDir, "story/volume_outline.md"), "(文件尚未创建)", "utf-8"),
    ]);

    const result = await makePlanner().planChapter({
      book: { ...makeBook(), language: "vi" as const },
      bookDir,
      chapterNumber: 2,
    });

    const expectedGoal = "Tiếp tục chương 2 với trọng tâm tự sự rõ ràng.";
    expect(result.intent.goal).toBe(expectedGoal);
    expect(result.memo.goal).toBe(expectedGoal);
    expect(result.intentMarkdown).toContain(expectedGoal);
    expect(result.intentMarkdown).not.toContain("(文件尚未创建)");
    // Parser contract: structural headings stay in the recognized zh/en form;
    // the fallback body prose is Vietnamese.
    expect(result.memo.body).toContain("## Current task");
    expect(result.memo.body).toContain("## Scene and length budget");
    expect(result.memo.body).toContain("## What the slow / transitional beats carry");
    expect(result.memo.body).toContain("## Hook ledger for this chapter");
    expect(result.memo.body).toContain("## Planner warning");
    expect(result.memo.body).toContain("lần");
    expect(result.memo.body).toContain("từ");
    expect(result.memo.body).not.toContain("## Nhiệm vụ hiện tại");
  });

  it("feeds Vietnamese retry feedback back into the user prompt for vi books", async () => {
    const chatSpy = vi.spyOn(llmProvider, "chatCompletion")
      .mockResolvedValueOnce({
        content: "no memo sections here",
        usage: ZERO_USAGE,
      } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>)
      .mockResolvedValueOnce({
        content: validMemoRaw(4),
        usage: ZERO_USAGE,
      } as unknown as Awaited<ReturnType<typeof llmProvider.chatCompletion>>);

    const result = await makePlanner().planChapter({
      book: { ...makeBook(), language: "vi" as const },
      bookDir,
      chapterNumber: 4,
    });

    expect(chatSpy).toHaveBeenCalledTimes(2);
    expect(result.memo.chapter).toBe(4);
    expect(result.memo.isGoldenOpening).toBe(true);

    const retryArgs = chatSpy.mock.calls[1]!;
    const retryMessages = retryArgs[2] as ReadonlyArray<{ role: string; content: string }>;
    const userMsg = retryMessages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("## Lỗi từ đầu ra trước đó");
    expect(userMsg?.content).toContain("Sửa lại và phát hành lại.");
    expect(userMsg?.content).not.toContain("上次输出的错误");
  });
});
