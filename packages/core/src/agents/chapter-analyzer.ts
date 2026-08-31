import { BaseAgent } from "./base.js";
import type { BookConfig } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";
import type { ContextPackage, RuleStack } from "../models/input-governance.js";
import { readGenreProfile, readBookRules } from "./rules-reader.js";
import { parseWriterOutput, type ParsedWriterOutput } from "./writer-parser.js";
import { buildGovernedMemoryEvidenceBlocks } from "../utils/governed-context.js";
import {
  buildGovernedCharacterMatrixWorkingSet,
  buildGovernedHookWorkingSet,
} from "../utils/governed-working-set.js";
import { filterEmotionalArcs, filterSubplots } from "../utils/context-filter.js";
import { countChapterLength, resolveLengthCountingMode } from "../utils/length-metrics.js";
import { retrieveMemorySelection } from "../utils/memory-retrieval.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  readStoryFrame,
  readVolumeMap,
  readCharacterContext,
  readCurrentStateWithFallback,
} from "../utils/outline-paths.js";

export interface AnalyzeChapterInput {
  readonly book: BookConfig;
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly chapterContent: string;
  readonly chapterTitle?: string;
  readonly chapterIntent?: string;
  readonly contextPackage?: ContextPackage;
  readonly ruleStack?: RuleStack;
}

export type AnalyzeChapterOutput = ParsedWriterOutput;

export class ChapterAnalyzerAgent extends BaseAgent {
  get name(): string {
    return "chapter-analyzer";
  }

  async analyzeChapter(input: AnalyzeChapterInput): Promise<AnalyzeChapterOutput> {
    const { book, bookDir, chapterNumber, chapterContent, chapterTitle } = input;
    const { profile: genreProfile, body: genreBody } =
      await readGenreProfile(this.ctx.projectRoot, book.genre);
    const resolvedLanguage = book.language ?? genreProfile.language;

    // Read current truth files (same set as writer.ts). Phase 5: prefer the
    // new prose outline (story_frame / volume_map) and roles/ directory.
    const placeholder = this.missingFilePlaceholder(resolvedLanguage);
    const [
      currentState, ledger, hooks,
      subplotBoard, emotionalArcs, characterMatrix,
      storyBible, volumeOutline,
    ] = await Promise.all([
      // Phase 5 consolidation: derive initial state from roles + seed hooks
      // when current_state.md is still the architect seed placeholder.
      readCurrentStateWithFallback(bookDir, placeholder),
      this.readFileOrDefault(join(bookDir, "story/particle_ledger.md"), resolvedLanguage),
      this.readFileOrDefault(join(bookDir, "story/pending_hooks.md"), resolvedLanguage),
      this.readFileOrDefault(join(bookDir, "story/subplot_board.md"), resolvedLanguage),
      this.readFileOrDefault(join(bookDir, "story/emotional_arcs.md"), resolvedLanguage),
      readCharacterContext(bookDir, placeholder),
      readStoryFrame(bookDir, placeholder),
      readVolumeMap(bookDir, placeholder),
    ]);
    const parsedBookRules = await readBookRules(bookDir);
    const bookRulesBody = parsedBookRules?.body ?? "";
    const bookRules = parsedBookRules?.rules;
    const governedMode = Boolean(input.chapterIntent && input.contextPackage && input.ruleStack);
    const memorySelection = await retrieveMemorySelection({
      bookDir,
      chapterNumber,
      goal: this.buildMemoryGoal(chapterTitle, chapterContent),
      outlineNode: this.findOutlineNode(volumeOutline, chapterNumber),
    });
    const chapterSummaries = this.renderSummarySnapshot(
      memorySelection.summaries,
      resolvedLanguage,
    );
    const rawGovernedMemoryBlocks = input.contextPackage
      ? buildGovernedMemoryEvidenceBlocks(input.contextPackage, resolvedLanguage)
      : undefined;
    const governedMemoryBlocks = rawGovernedMemoryBlocks && resolvedLanguage === "vi"
      ? {
          hookDebtBlock: this.localizeGovernedEvidenceBlock(rawGovernedMemoryBlocks.hookDebtBlock),
          hooksBlock: this.localizeGovernedEvidenceBlock(rawGovernedMemoryBlocks.hooksBlock),
          summariesBlock: this.localizeGovernedEvidenceBlock(rawGovernedMemoryBlocks.summariesBlock),
          volumeSummariesBlock: this.localizeGovernedEvidenceBlock(rawGovernedMemoryBlocks.volumeSummariesBlock),
          titleHistoryBlock: this.localizeGovernedEvidenceBlock(rawGovernedMemoryBlocks.titleHistoryBlock),
          moodTrailBlock: this.localizeGovernedEvidenceBlock(rawGovernedMemoryBlocks.moodTrailBlock),
          canonBlock: this.localizeGovernedEvidenceBlock(rawGovernedMemoryBlocks.canonBlock),
        }
      : rawGovernedMemoryBlocks;
    const hooksWorkingSet = governedMode && input.contextPackage
      ? buildGovernedHookWorkingSet({
          hooksMarkdown: hooks,
          contextPackage: input.contextPackage,
          chapterIntent: input.chapterIntent,
          chapterNumber,
          language: resolvedLanguage,
        })
      : hooks;
    const subplotWorkingSet = governedMode
      ? filterSubplots(subplotBoard)
      : subplotBoard;
    const emotionalWorkingSet = governedMode
      ? filterEmotionalArcs(emotionalArcs, chapterNumber)
      : emotionalArcs;
    const matrixWorkingSet = governedMode && input.chapterIntent && input.contextPackage
      ? buildGovernedCharacterMatrixWorkingSet({
          matrixMarkdown: characterMatrix,
          chapterIntent: input.chapterIntent,
          contextPackage: input.contextPackage,
          protagonistName: bookRules?.protagonist?.name,
        })
      : characterMatrix;
    const reducedControlBlock = governedMode && input.chapterIntent && input.contextPackage && input.ruleStack
      ? this.buildReducedControlBlock(input.chapterIntent, input.contextPackage, input.ruleStack, resolvedLanguage)
      : "";

    const systemPrompt = this.buildSystemPrompt(
      book,
      genreProfile,
      genreBody,
      bookRulesBody,
      resolvedLanguage,
    );

    const userPrompt = this.buildUserPrompt({
      language: resolvedLanguage,
      chapterNumber,
      chapterContent,
      chapterTitle,
      currentState,
      ledger: genreProfile.numericalSystem ? ledger : "",
      hooks: hooksWorkingSet,
      chapterSummaries,
      subplotBoard: subplotWorkingSet,
      emotionalArcs: emotionalWorkingSet,
      characterMatrix: matrixWorkingSet,
      bibleBlock: !governedMode && storyBible !== this.missingFilePlaceholder(resolvedLanguage)
        ? resolvedLanguage === "en"
          ? `\n## Story Bible\n${storyBible}\n`
          : resolvedLanguage === "vi"
            ? `\n## Bối cảnh thế giới\n${storyBible}\n`
            : `\n## 世界观设定\n${storyBible}\n`
        : "",
      outlineOrControlBlock: reducedControlBlock || (
        volumeOutline !== this.missingFilePlaceholder(resolvedLanguage)
          ? resolvedLanguage === "en"
            ? `\n## Volume Outline\n${volumeOutline}\n`
            : resolvedLanguage === "vi"
              ? `\n## Dàn ý tập\n${volumeOutline}\n`
              : `\n## 卷纲\n${volumeOutline}\n`
          : ""
      ),
      hooksBlock: governedMemoryBlocks?.hooksBlock
        ?? (
          hooksWorkingSet !== this.missingFilePlaceholder(resolvedLanguage)
            ? resolvedLanguage === "en"
              ? `\n## Current Hooks\n${hooksWorkingSet}\n`
              : resolvedLanguage === "vi"
                ? `\n## Các tuyến gợi mở hiện tại\n${hooksWorkingSet}\n`
                : `\n## 当前伏笔池\n${hooksWorkingSet}\n`
            : ""
        ),
      summariesBlock: governedMemoryBlocks?.summariesBlock
        ?? (
          chapterSummaries !== this.missingFilePlaceholder(resolvedLanguage)
            ? resolvedLanguage === "en"
              ? `\n## Existing Chapter Summaries\n${chapterSummaries}\n`
              : resolvedLanguage === "vi"
                ? `\n## Tóm tắt các chương trước\n${chapterSummaries}\n`
                : `\n## 已有章节摘要\n${chapterSummaries}\n`
            : ""
        ),
      volumeSummariesBlock: governedMemoryBlocks?.volumeSummariesBlock ?? "",
      subplotBlock: subplotWorkingSet !== this.missingFilePlaceholder(resolvedLanguage)
        ? resolvedLanguage === "en"
          ? `\n## Current Subplot Board\n${subplotWorkingSet}\n`
          : resolvedLanguage === "vi"
            ? `\n## Bảng tiến độ tuyến truyện phụ hiện tại\n${subplotWorkingSet}\n`
            : `\n## 当前支线进度板\n${subplotWorkingSet}\n`
        : "",
      emotionalBlock: emotionalWorkingSet !== this.missingFilePlaceholder(resolvedLanguage)
        ? resolvedLanguage === "en"
          ? `\n## Current Emotional Arcs\n${emotionalWorkingSet}\n`
          : resolvedLanguage === "vi"
            ? `\n## Các cung cảm xúc hiện tại\n${emotionalWorkingSet}\n`
            : `\n## 当前情感弧线\n${emotionalWorkingSet}\n`
        : "",
      matrixBlock: matrixWorkingSet !== this.missingFilePlaceholder(resolvedLanguage)
        ? resolvedLanguage === "en"
          ? `\n## Current Character Matrix\n${matrixWorkingSet}\n`
          : resolvedLanguage === "vi"
            ? `\n## Ma trận nhân vật hiện tại\n${matrixWorkingSet}\n`
            : `\n## 当前角色交互矩阵\n${matrixWorkingSet}\n`
        : "",
    });

    const response = await this.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3 },
    );

    const countingMode = resolveLengthCountingMode(book.language ?? genreProfile.language);
    const output = parseWriterOutput(chapterNumber, response.content, genreProfile, countingMode);
    const canonicalContent = chapterContent;
    const canonicalWordCount = countChapterLength(canonicalContent, countingMode);

    // If the LLM didn't return a title, use the one from input or derive from chapter number.
    const parserFallbackTitle = output.title === this.defaultChapterTitle(chapterNumber, resolvedLanguage)
      || output.title === `第${chapterNumber}章`;
    if (parserFallbackTitle) {
      return {
        ...output,
        title: chapterTitle || this.defaultChapterTitle(chapterNumber, resolvedLanguage),
        content: canonicalContent,
        wordCount: canonicalWordCount,
      };
    }

    return {
      ...output,
      content: canonicalContent,
      wordCount: canonicalWordCount,
    };
  }

  private buildSystemPrompt(
    book: BookConfig,
    genreProfile: GenreProfile,
    genreBody: string,
    bookRulesBody: string,
    language: "zh" | "en" | "vi",
  ): string {
    if (language === "en") {
      const numericalBlock = genreProfile.numericalSystem
        ? "\n- This genre tracks numerical/resources systems; UPDATED_LEDGER must capture every resource change shown in the chapter."
        : "\n- This genre has no numerical system; leave UPDATED_LEDGER empty.";

      return `【LANGUAGE OVERRIDE】ALL output MUST be in English. The === TAG === markers remain unchanged.

You are a fiction continuity analyst. Analyze a finished chapter, extract every state change, and update the tracking files.

## Working Mode

You are not writing new prose. You are reading completed chapter text and updating the book's truth files.
1. Read the chapter carefully and extract all important facts.
2. Update the existing tracking files incrementally rather than rebuilding them from scratch.
3. Keep the output contract identical to the writer pipeline.

## What To Extract

- Character entrances, exits, injuries, breakthroughs, deaths, and other status changes
- Location movement and scene transitions
- Item or resource gains and losses
- Hook setup, advancement, and payoff
- Emotional arc movement
- Subplot progress
- Relationship changes and information-boundary changes

## Book Information

- Title: ${book.title}
- Genre: ${genreProfile.name} (${book.genre})
- Platform: ${book.platform}
${numericalBlock}

## Genre Guidance

${genreBody}

${bookRulesBody ? `## Book Rules\n\n${bookRulesBody}` : ""}

## Output Format

Use === TAG === delimiters exactly as shown:

=== CHAPTER_TITLE ===
(Extract or infer the chapter title. Output title text only.)

=== CHAPTER_CONTENT ===
(Repeat the original chapter content exactly. Do not rewrite.)

=== PRE_WRITE_CHECK ===
(Leave empty in analysis mode.)

=== POST_SETTLEMENT ===
(Leave empty in analysis mode.)

=== UPDATED_STATE ===
Updated state card as a Markdown table reflecting the end-of-chapter state:
| Field | Value |
| --- | --- |
| Current Chapter | {chapter_number} |
| Current Location | ... |
| Protagonist State | ... |
| Current Goal | ... |
| Current Constraint | ... |
| Current Alliances | ... |
| Current Conflict | ... |

=== UPDATED_LEDGER ===
(If the genre has a numerical system: output the fully updated resource ledger table. Otherwise leave empty.)

=== UPDATED_HOOKS ===
Updated hooks pool as a Markdown table with the latest status of every known hook:
| hook_id | start_chapter | type | status | last_advanced_chapter | expected_payoff | payoff_timing | notes |

=== CHAPTER_SUMMARY ===
Single Markdown table row:
| Chapter | Title | Characters | Key Events | State Changes | Hook Activity | Mood | Chapter Type |

=== UPDATED_SUBPLOTS ===
Updated subplot board (Markdown table)

=== UPDATED_EMOTIONAL_ARCS ===
Updated emotional arcs (Markdown table)

=== UPDATED_CHARACTER_MATRIX ===
Updated character matrix (one ## section per character, bullet-list fields):

## Character Name
- **Role**: protagonist / antagonist / ally / minor / mentioned
- **Tags**: core identity tags
- **Contrast**: distinctive details that defy expectations
- **Speech**: speaking style summary
- **Personality**: core personality traits
- **Motivation**: fundamental driving force
- **Current**: immediate goal this chapter
- **Relationships**: OtherChar(type/Ch#) | ...
- **Known**: what this character knows (only witnessed or told)
- **Unknown**: what this character does not know

(Repeat for each character. Add new characters; keep existing ones updated.)

## Rules

1. UPDATED_STATE and UPDATED_HOOKS must be incremental updates based on the current tracking files.
2. Every factual change in the chapter must appear in the corresponding tracking file.
3. Do not miss resource changes, movement, relationship changes, or information changes.
4. Information boundaries in the character matrix must stay exact: each character only knows what they directly witnessed or learned.`;
    }

    if (language === "vi") {
      const numericalBlock = genreProfile.numericalSystem
        ? "\n- Thể loại này có hệ thống số/tài nguyên; UPDATED_LEDGER phải ghi mọi thay đổi tài nguyên trong chương."
        : "\n- Thể loại này không có hệ thống số; để UPDATED_LEDGER trống.";
      return `【LANGUAGE OVERRIDE】MỌI nội dung mô tả và phản hồi phải bằng tiếng Việt tự nhiên. Giữ nguyên các marker === TAG ===.

Bạn là chuyên viên phân tích tính liên tục của tiểu thuyết. Nhiệm vụ của bạn là phân tích nội dung một chương đã hoàn thành, trích xuất mọi thay đổi trạng thái và cập nhật các tệp theo dõi.

## Chế độ làm việc

Bạn không viết văn xuôi mới mà phân tích nội dung hiện có. Bạn cần:
1. Đọc kỹ nội dung chương và trích xuất mọi thông tin quan trọng.
2. Cập nhật tăng dần dựa trên các tệp theo dõi hiện tại, không dựng lại từ đầu.
3. Giữ định dạng đầu ra hoàn toàn giống pipeline writer.

## Các khía cạnh cần phân tích

Trích xuất các thông tin sau từ nội dung chương:
- Nhân vật xuất hiện, rời đi hoặc thay đổi trạng thái (bị thương, đột phá, qua đời, v.v.).
- Di chuyển địa điểm và chuyển cảnh.
- Vật phẩm hoặc tài nguyên nhận được và tiêu hao.
- Gợi mở được thiết lập, phát triển và hoàn tất.
- Diễn biến cung cảm xúc.
- Tiến triển tuyến truyện phụ.
- Thay đổi quan hệ giữa các nhân vật và ranh giới thông tin mới.

## Thông tin sách

- Tiêu đề: ${book.title}
- Thể loại: ${genreProfile.name} (${book.genre})
- Nền tảng: ${book.platform}
${numericalBlock}

## Hướng dẫn thể loại

${genreBody}

${bookRulesBody ? `## Quy tắc riêng của sách\n\n${bookRulesBody}` : ""}

## Định dạng đầu ra (phải tuân thủ nghiêm ngặt)

Dùng dấu phân cách === TAG === chính xác như dưới đây, hoàn toàn giống pipeline writer:

=== CHAPTER_TITLE ===
(Trích xuất hoặc suy luận tiêu đề chương. Chỉ xuất nội dung tiêu đề.)

=== CHAPTER_CONTENT ===
(Lặp lại nguyên văn nội dung chương, không viết lại.)

=== PRE_WRITE_CHECK ===
(Để trống trong chế độ phân tích.)

=== POST_SETTLEMENT ===
(Để trống trong chế độ phân tích.)

=== UPDATED_STATE ===
Thẻ trạng thái đã cập nhật dưới dạng bảng Markdown, phản ánh trạng thái cuối chương:
| Trường | Giá trị |
| --- | --- |
| Chương hiện tại | {chapter_number} |
| Địa điểm hiện tại | ... |
| Trạng thái nhân vật chính | ... |
| Mục tiêu hiện tại | ... |
| Ràng buộc hiện tại | ... |
| Liên minh hiện tại | ... |
| Xung đột hiện tại | ... |

=== UPDATED_LEDGER ===
(Nếu thể loại có hệ thống số: xuất bảng sổ cái tài nguyên đầy đủ đã cập nhật. Nếu không, để trống.)

=== UPDATED_HOOKS ===
Nhóm gợi mở đã cập nhật dưới dạng bảng Markdown, gồm trạng thái mới nhất của mọi gợi mở đã biết:
| hook_id | start_chapter | type | status | last_advanced_chapter | expected_payoff | payoff_timing | notes |

=== CHAPTER_SUMMARY ===
Một hàng duy nhất trong bảng Markdown:
| Chương | Tiêu đề | Nhân vật | Sự kiện chính | Thay đổi trạng thái | Diễn biến gợi mở | Sắc thái | Loại chương |

=== UPDATED_SUBPLOTS ===
Bảng tiến độ tuyến truyện phụ đã cập nhật (bảng Markdown).

=== UPDATED_EMOTIONAL_ARCS ===
Các cung cảm xúc đã cập nhật (bảng Markdown).

=== UPDATED_CHARACTER_MATRIX ===
Ma trận nhân vật đã cập nhật (mỗi nhân vật là một mục ##, các trường dùng danh sách gạch đầu dòng):

## Tên nhân vật
- **Vai trò**: nhân vật chính / phản diện / đồng minh / phụ / được nhắc đến
- **Nhãn**: các nhãn nhận dạng cốt lõi
- **Tương phản**: chi tiết riêng biệt phá vỡ kỳ vọng
- **Lời thoại**: tóm tắt phong cách nói
- **Tính cách**: các nét tính cách cốt lõi
- **Động cơ**: động lực căn bản
- **Hiện tại**: mục tiêu tức thời trong chương này
- **Quan hệ**: NhânVậtKhác(loại/Ch#) | ...
- **Đã biết**: điều nhân vật này biết (chỉ những gì trực tiếp chứng kiến hoặc được kể)
- **Chưa biết**: điều nhân vật này không biết

(Lặp lại cho từng nhân vật. Thêm nhân vật mới và cập nhật tăng dần các nhân vật hiện có.)

## Quy tắc then chốt

1. UPDATED_STATE và UPDATED_HOOKS phải được cập nhật tăng dần dựa trên các tệp theo dõi hiện tại.
2. Mọi thay đổi thực tế trong chương phải xuất hiện trong tệp theo dõi tương ứng.
3. Không bỏ sót thay đổi tài nguyên, địa điểm, quan hệ hoặc thông tin.
4. Ranh giới thông tin trong ma trận nhân vật phải chính xác: mỗi nhân vật chỉ biết điều họ trực tiếp chứng kiến hoặc được kể.
5. Nhãn, lời giải thích và bảng phải dùng tiếng Việt; JSON keys, rule IDs và marker máy đọc giữ nguyên.`;
    }

    const numericalBlock = genreProfile.numericalSystem
      ? `\n- 本题材有数值/资源体系，你必须在 UPDATED_LEDGER 中追踪正文中出现的所有资源变动`
      : `\n- 本题材无数值系统，UPDATED_LEDGER 留空`;

    return `你是小说连续性分析师。你的任务是分析一章已完成的小说正文，从中提取所有状态变化并更新追踪文件。

## 工作模式

你不是在写作，而是在分析已有正文。你需要：
1. 仔细阅读正文，提取所有关键信息
2. 基于"当前追踪文件"做增量更新
3. 输出格式与写作模块完全一致

## 分析维度

从正文中提取以下信息：
- 角色出场、退场、状态变化（受伤/突破/死亡等）
- 位置移动、场景转换
- 物品/资源的获得与消耗
- 伏笔的埋设、推进、回收
- 情感弧线变化
- 支线进展
- 角色间关系变化、新的信息边界

## 书籍信息

- 标题：${book.title}
- 题材：${genreProfile.name}（${book.genre}）
- 平台：${book.platform}
${numericalBlock}

## 题材特征

${genreBody}

${bookRulesBody ? `## 本书规则\n\n${bookRulesBody}` : ""}

## 输出格式（必须严格遵循）

使用 === TAG === 分隔各部分，与写作模块完全一致：

=== CHAPTER_TITLE ===
（从正文标题行提取或推断章节标题，只输出标题文字）

=== CHAPTER_CONTENT ===
（原样输出正文内容，不做任何修改）

=== PRE_WRITE_CHECK ===
（留空，分析模式不需要写作自检）

=== POST_SETTLEMENT ===
（留空，分析模式不需要写后结算）

=== UPDATED_STATE ===
更新后的状态卡（Markdown表格），反映本章结束时的最新状态：
| 字段 | 值 |
|------|-----|
| 当前章节 | {章节号} |
| 当前位置 | ... |
| 主角状态 | ... |
| 当前目标 | ... |
| 当前限制 | ... |
| 当前敌我 | ... |
| 当前冲突 | ... |

=== UPDATED_LEDGER ===
（如有数值系统：更新后的完整资源账本表格；无则留空）

=== UPDATED_HOOKS ===
更新后的伏笔池（Markdown表格），包含所有已知伏笔的最新状态：
| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 回收节奏 | 备注 |

=== CHAPTER_SUMMARY ===
本章摘要（Markdown表格行）：
| 章节 | 标题 | 出场人物 | 关键事件 | 状态变化 | 伏笔动态 | 情绪基调 | 章节类型 |

=== UPDATED_SUBPLOTS ===
更新后的支线进度板（Markdown表格）

=== UPDATED_EMOTIONAL_ARCS ===
更新后的情感弧线（Markdown表格）

=== UPDATED_CHARACTER_MATRIX ===
更新后的角色矩阵（每个角色一个 ## 块，字段用 bullet list）：

## 角色名
- **定位**: 主角 / 反派 / 盟友 / 配角 / 提及
- **标签**: 核心身份标签
- **反差**: 打破刻板印象的独特细节
- **说话**: 说话风格概述
- **性格**: 性格底色
- **动机**: 根本驱动力
- **当前**: 本章即时目标
- **关系**: 某角色(关系性质/Ch#) | ...
- **已知**: 该角色已知的信息（仅限亲历或被告知）
- **未知**: 该角色不知道的信息

（每个角色重复以上格式。新角色追加新 ## 块，已有角色做增量更新。）

## 关键规则

1. 状态卡和伏笔池必须基于"当前追踪文件"做增量更新，不是从零开始
2. 正文中的每一个事实性变化都必须反映在对应的追踪文件中
3. 不要遗漏细节：数值变化、位置变化、关系变化、信息变化都要记录
4. 角色矩阵中的"已知/未知"要准确——角色只知道他在场时发生的事`;
  }

  private buildUserPrompt(params: {
    readonly language: "zh" | "en" | "vi";
    readonly chapterNumber: number;
    readonly chapterContent: string;
    readonly chapterTitle?: string;
    readonly currentState: string;
    readonly ledger: string;
    readonly hooks: string;
    readonly chapterSummaries: string;
    readonly subplotBoard: string;
    readonly emotionalArcs: string;
    readonly characterMatrix: string;
    readonly hooksBlock: string;
    readonly summariesBlock: string;
    readonly volumeSummariesBlock: string;
    readonly subplotBlock: string;
    readonly emotionalBlock: string;
    readonly matrixBlock: string;
    readonly bibleBlock: string;
    readonly outlineOrControlBlock: string;
  }): string {
    if (params.language === "en") {
      const titleLine = params.chapterTitle ? `Chapter Title: ${params.chapterTitle}\n` : "";
      const ledgerBlock = params.ledger ? `\n## Current Resource Ledger\n${params.ledger}\n` : "";
      return `Analyze chapter ${params.chapterNumber} and update all tracking files.\n${titleLine}\n## Chapter Content\n\n${params.chapterContent}\n\n## Current State\n${params.currentState}${ledgerBlock}\n${params.hooksBlock}${params.volumeSummariesBlock}${params.subplotBlock}${params.emotionalBlock}${params.matrixBlock}${params.summariesBlock}${params.outlineOrControlBlock}${params.bibleBlock}\n\nPlease return the result strictly in the === TAG === format.`;
    }
    if (params.language === "vi") {
      const titleLine = params.chapterTitle ? `Tiêu đề chương: ${params.chapterTitle}\n` : "";
      const ledgerBlock = params.ledger ? `\n## Sổ tài nguyên hiện tại\n${params.ledger}\n` : "";
      return `Hãy phân tích chương ${params.chapterNumber} và cập nhật mọi tệp theo dõi.\n${titleLine}\n## Nội dung chương\n\n${params.chapterContent}\n\n## Trạng thái hiện tại\n${params.currentState}${ledgerBlock}\n${params.hooksBlock}${params.volumeSummariesBlock}${params.subplotBlock}${params.emotionalBlock}${params.matrixBlock}${params.summariesBlock}${params.outlineOrControlBlock}${params.bibleBlock}\n\nHãy trả về đúng định dạng === TAG ===; giữ nguyên mọi marker và trường dữ liệu.`;
    }
    const titleLine = params.chapterTitle ? `章节标题：${params.chapterTitle}\n` : "";
    const ledgerBlock = params.ledger ? `\n## 当前资源账本\n${params.ledger}\n` : "";
    return `请分析第${params.chapterNumber}章正文，更新所有追踪文件。\n${titleLine}\n## 正文内容\n\n${params.chapterContent}\n\n## 当前状态卡\n${params.currentState}${ledgerBlock}\n${params.hooksBlock}${params.volumeSummariesBlock}${params.subplotBlock}${params.emotionalBlock}${params.matrixBlock}${params.summariesBlock}${params.outlineOrControlBlock}${params.bibleBlock}\n\n请严格按照 === TAG === 格式输出分析结果。`;
  }

  private buildReducedControlBlock(
    chapterIntent: string,
    contextPackage: ContextPackage,
    ruleStack: RuleStack,
    language: "zh" | "en" | "vi",
  ): string {
    const selectedContext = contextPackage.selectedContext
      .map((entry) => `- ${entry.source}: ${entry.reason}${entry.excerpt ? ` | ${entry.excerpt}` : ""}`)
      .join("\n");
    const overrides = ruleStack.activeOverrides.length > 0
      ? ruleStack.activeOverrides
        .map((override) => `- ${override.from} -> ${override.to}: ${override.reason} (${override.target})`)
        .join("\n")
      : "- none";

    if (language === "en") {
      return `\n## Chapter Control Inputs (compiled by Planner/Composer)
${chapterIntent}

### Selected Context
${selectedContext || "- none"}

### Rule Stack
- Hard guardrails: ${ruleStack.sections.hard.join(", ") || "(none)"}
- Soft constraints: ${ruleStack.sections.soft.join(", ") || "(none)"}
- Diagnostic rules: ${ruleStack.sections.diagnostic.join(", ") || "(none)"}

### Active Overrides
${overrides}\n`;
    }

    if (language === "vi") {
      return `\n## Dữ liệu điều khiển chương (do Planner/Composer biên soạn)
${chapterIntent}

### Ngữ cảnh đã chọn
${selectedContext || "- không có"}

### Ngăn xếp quy tắc
- Rào chắn cứng: ${ruleStack.sections.hard.join(", ") || "(không có)"}
- Ràng buộc mềm: ${ruleStack.sections.soft.join(", ") || "(không có)"}
- Quy tắc chẩn đoán: ${ruleStack.sections.diagnostic.join(", ") || "(không có)"}

### Ghi đè đang áp dụng
${overrides}\n`;
    }

    return `\n## 本章控制输入（由 Planner/Composer 编译）
${chapterIntent}

### 已选上下文
${selectedContext || "- none"}

### 规则栈
- 硬护栏：${ruleStack.sections.hard.join("、") || "(无)"}
- 软约束：${ruleStack.sections.soft.join("、") || "(无)"}
- 诊断规则：${ruleStack.sections.diagnostic.join("、") || "(无)"}

### 当前覆盖
${overrides}\n`;
  }

  private localizeGovernedEvidenceBlock(block: string | undefined) {
    const headings: Readonly<Record<string, string>> = {
      "Hook Debt Briefs": "Tóm tắt nợ gợi mở",
      "已选伏笔证据": "Bằng chứng gợi mở đã chọn",
      "已选章节摘要证据": "Bằng chứng tóm tắt chương đã chọn",
      "已选卷级摘要证据": "Bằng chứng tóm tắt tập đã chọn",
      "近期标题历史": "Lịch sử tiêu đề gần đây",
      "近期情绪/章节类型轨迹": "Diễn biến cảm xúc / loại chương gần đây",
      "正典约束证据": "Bằng chứng chính sử",
    };

    return block?.replace(
      /(?<=## )(Hook Debt Briefs|已选伏笔证据|已选章节摘要证据|已选卷级摘要证据|近期标题历史|近期情绪\/章节类型轨迹|正典约束证据)/g,
      (heading) => headings[heading] ?? heading,
    );
  }

  private buildMemoryGoal(chapterTitle: string | undefined, chapterContent: string): string {
    return [chapterTitle ?? "", chapterContent]
      .filter((part) => part.trim().length > 0)
      .join("\n\n");
  }

  private findOutlineNode(volumeOutline: string, chapterNumber: number): string | undefined {
    if (!volumeOutline || (["zh", "en", "vi"] as const).some(
      (language) => volumeOutline === this.missingFilePlaceholder(language),
    )) {
      return undefined;
    }

    const lines = volumeOutline.split("\n").map((line) => line.trim()).filter(Boolean);
    const chapterPatterns = [
      new RegExp(`^#+\\s*Chapter\\s*${chapterNumber}\\b`, "i"),
      new RegExp(`^#+\\s*第\\s*${chapterNumber}\\s*章`),
    ];

    const heading = lines.find((line) => chapterPatterns.some((pattern) => pattern.test(line)));
    if (!heading) return undefined;

    const headingIndex = lines.indexOf(heading);
    const nextLine = lines[headingIndex + 1];
    return nextLine && !nextLine.startsWith("#") ? nextLine : heading.replace(/^#+\s*/, "");
  }

  private renderSummarySnapshot(
    summaries: ReadonlyArray<{
      chapter: number;
      title: string;
      characters: string;
      events: string;
      stateChanges: string;
      hookActivity: string;
      mood: string;
      chapterType: string;
    }>,
    language: "zh" | "en" | "vi",
  ): string {
    if (summaries.length === 0) {
      return this.missingFilePlaceholder(language);
    }

    const header = language === "en"
      ? [
          "| Chapter | Title | Characters | Key Events | State Changes | Hook Activity | Mood | Chapter Type |",
          "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
      : language === "vi"
        ? [
            "| Chương | Tiêu đề | Nhân vật | Sự kiện chính | Thay đổi trạng thái | Diễn biến gợi mở | Sắc thái | Loại chương |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
          ]
        : [
            "| 章节 | 标题 | 出场人物 | 关键事件 | 状态变化 | 伏笔动态 | 情绪基调 | 章节类型 |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
          ];

    const rows = summaries.map((summary) => [
      summary.chapter,
      summary.title,
      summary.characters,
      summary.events,
      summary.stateChanges,
      summary.hookActivity,
      summary.mood,
      summary.chapterType,
    ].map((cell) => this.escapeTableCell(String(cell))).join(" | "));

    return [
      ...header,
      ...rows.map((row) => `| ${row} |`),
    ].join("\n");
  }

  private escapeTableCell(value: string): string {
    return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  }

  private async readFileOrDefault(path: string, language: "zh" | "en" | "vi"): Promise<string> {
    try {
      return await readFile(path, "utf-8");
    } catch {
      return this.missingFilePlaceholder(language);
    }
  }

  private missingFilePlaceholder(language: "zh" | "en" | "vi"): string {
    if (language === "en") return "(file not created yet)";
    if (language === "vi") return "(tệp chưa được tạo)";
    return "(文件尚未创建)";
  }

  private defaultChapterTitle(chapterNumber: number, language: "zh" | "en" | "vi"): string {
    if (language === "en") return `Chapter ${chapterNumber}`;
    if (language === "vi") return `Chương ${chapterNumber}`;
    return `第${chapterNumber}章`;
  }
}
