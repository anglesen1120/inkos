import { BaseAgent } from "./base.js";
import type { GenreProfile } from "../models/genre-profile.js";
import type { BookRules } from "../models/book-rules.js";
import type { FanficMode } from "../models/book.js";
import type { ChapterMemo, ContextPackage, RuleStack } from "../models/input-governance.js";
import { readGenreProfile, readBookLanguage, readBookRules } from "./rules-reader.js";
import { getFanficDimensionConfig, FANFIC_DIMENSIONS } from "./fanfic-dimensions.js";
import { readFile, readdir } from "node:fs/promises";
import { filterHooks, filterSummaries, filterSubplots, filterEmotionalArcs, filterCharacterMatrix } from "../utils/context-filter.js";
import { buildGovernedMemoryEvidenceBlocks } from "../utils/governed-context.js";
import {
  readVolumeMap,
  readCharacterContext,
  readCurrentStateWithFallback,
} from "../utils/outline-paths.js";
import { join } from "node:path";

export interface AuditResult {
  readonly passed: boolean;
  readonly issues: ReadonlyArray<AuditIssue>;
  readonly summary: string;
  /** True when the auditor response itself was not parseable; callers must not auto-revise content from this result. */
  readonly parseFailed?: boolean;
  /** 0-100 overall quality score. Present when the auditor supports scoring. */
  readonly overallScore?: number;
  readonly tokenUsage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

export interface AuditIssue {
  readonly severity: "critical" | "warning" | "info";
  readonly category: string;
  readonly description: string;
  readonly suggestion: string;
  readonly repairScope?: "local" | "structural" | "unknown";
}

type PromptLanguage = "zh" | "en" | "vi";

function normalizeRepairScope(value: unknown): AuditIssue["repairScope"] {
  if (value === "local" || value === "structural" || value === "unknown") return value;
  return undefined;
}
const MISSING_FILE_SENTINEL = "(文件不存在)";
const MISSING_STYLE_GUIDE_SENTINEL = "(无文风指南)";

function renderMissingContext(value: string, language: PromptLanguage, vietnameseFallback: string): string {
  if (language !== "vi") return value;
  return value === MISSING_FILE_SENTINEL || value === MISSING_STYLE_GUIDE_SENTINEL
    ? vietnameseFallback
    : value;
}


const DIMENSION_LABELS: Record<number, Record<PromptLanguage, string>> = {
  1: { zh: "OOC检查", en: "OOC Check", vi: "Kiểm tra lệch tính cách" },
  2: { zh: "时间线检查", en: "Timeline Check", vi: "Kiểm tra dòng thời gian" },
  3: { zh: "设定冲突", en: "Lore Conflict Check", vi: "Kiểm tra xung đột thiết lập" },
  4: { zh: "战力崩坏", en: "Power Scaling Check", vi: "Kiểm tra thang sức mạnh" },
  5: { zh: "数值检查", en: "Numerical Consistency Check", vi: "Kiểm tra nhất quán số liệu" },
  6: { zh: "伏笔检查", en: "Hook Check", vi: "Kiểm tra móc truyện" },
  7: { zh: "节奏检查", en: "Pacing Check", vi: "Kiểm tra nhịp truyện" },
  8: { zh: "文风检查", en: "Style Check", vi: "Kiểm tra văn phong" },
  9: { zh: "信息越界", en: "Information Boundary Check", vi: "Kiểm tra vượt ranh giới thông tin" },
  10: { zh: "词汇疲劳", en: "Lexical Fatigue Check", vi: "Kiểm tra mỏi từ vựng" },
  11: { zh: "利益链断裂", en: "Incentive Chain Check", vi: "Kiểm tra đứt chuỗi động cơ" },
  12: { zh: "年代考据", en: "Era Accuracy Check", vi: "Kiểm tra niên đại" },
  13: { zh: "配角降智", en: "Side Character Competence Check", vi: "Kiểm tra phụ nhân vật bị hạ trí" },
  14: { zh: "配角工具人化", en: "Side Character Instrumentalization Check", vi: "Kiểm tra phụ nhân vật thành công cụ" },
  15: { zh: "爽点虚化", en: "Payoff Dilution Check", vi: "Kiểm tra điểm thỏa mãn bị loãng" },
  16: { zh: "台词失真", en: "Dialogue Authenticity Check", vi: "Kiểm tra thoại tự nhiên" },
  17: { zh: "流水账", en: "Chronicle Drift Check", vi: "Kiểm tra kể lể biên niên" },
  18: { zh: "知识库污染", en: "Knowledge Base Pollution Check", vi: "Kiểm tra ô nhiễm tri thức" },
  19: { zh: "视角一致性", en: "POV Consistency Check", vi: "Kiểm tra nhất quán điểm nhìn" },
  20: { zh: "段落等长", en: "Paragraph Uniformity Check", vi: "Kiểm tra đoạn đều máy móc" },
  21: { zh: "套话密度", en: "Cliche Density Check", vi: "Kiểm tra mật độ sáo ngữ" },
  22: { zh: "公式化转折", en: "Formulaic Twist Check", vi: "Kiểm tra chuyển ngoặt công thức" },
  23: { zh: "列表式结构", en: "List-like Structure Check", vi: "Kiểm tra cấu trúc liệt kê" },
  24: { zh: "支线停滞", en: "Subplot Stagnation Check", vi: "Kiểm tra tuyến phụ đình trệ" },
  25: { zh: "弧线平坦", en: "Arc Flatline Check", vi: "Kiểm tra cung truyện phẳng" },
  26: { zh: "节奏单调", en: "Pacing Monotony Check", vi: "Kiểm tra nhịp điệu đơn điệu" },
  27: { zh: "敏感词检查", en: "Sensitive Content Check", vi: "Kiểm tra nội dung nhạy cảm" },
  28: { zh: "正传事件冲突", en: "Mainline Canon Event Conflict", vi: "Kiểm tra xung đột sự kiện chính truyện" },
  29: { zh: "未来信息泄露", en: "Future Knowledge Leak Check", vi: "Kiểm tra lộ thông tin tương lai" },
  30: { zh: "世界规则跨书一致性", en: "Cross-Book World Rule Check", vi: "Kiểm tra nhất quán luật thế giới liên sách" },
  31: { zh: "番外伏笔隔离", en: "Spinoff Hook Isolation Check", vi: "Kiểm tra cách ly móc truyện ngoại truyện" },
  32: { zh: "读者期待管理", en: "Reader Expectation Check", vi: "Kiểm tra quản lý kỳ vọng độc giả" },
  33: { zh: "章节备忘偏离", en: "Chapter Memo Drift Check", vi: "Kiểm tra lệch memo chương" },
  34: { zh: "角色还原度", en: "Character Fidelity Check", vi: "Kiểm tra độ trung thành nhân vật" },
  35: { zh: "世界规则遵守", en: "World Rule Compliance Check", vi: "Kiểm tra tuân thủ luật thế giới" },
  36: { zh: "关系动态", en: "Relationship Dynamics Check", vi: "Kiểm tra động thái quan hệ" },
  37: { zh: "正典事件一致性", en: "Canon Event Consistency Check", vi: "Kiểm tra nhất quán sự kiện chính điển" },
};

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/u.test(text);
}

function resolveGenreLabel(genreId: string, profileName: string, language: PromptLanguage): string {
  if (language === "zh" || !containsChinese(profileName)) {
    return profileName;
  }

  if (genreId === "other") {
    return "general";
  }

  return genreId.replace(/[_-]+/g, " ");
}

function dimensionName(id: number, language: PromptLanguage): string | undefined {
  return DIMENSION_LABELS[id]?.[language];
}

function joinLocalized(items: ReadonlyArray<string>, language: PromptLanguage): string {
  return items.join(language === "en" ? ", " : language === "vi" ? ", " : "、");
}

function formatFanficSeverityNote(
  severity: "critical" | "warning" | "info",
  language: PromptLanguage,
): string {
  if (language === "en") {
    return severity === "critical"
      ? "Strict check."
      : severity === "info"
        ? "Log only; do not fail the chapter."
        : "Warning level.";
  }

  if (language === "vi") {
    return severity === "critical"
      ? "Kiểm tra nghiêm ngặt."
      : severity === "info"
        ? "Chỉ ghi nhận; không đánh rớt chương."
        : "Mức cảnh báo.";
  }

  return severity === "critical"
    ? "（严格检查）"
    : severity === "info"
      ? "（仅记录，不判定失败）"
      : "（警告级别）";
}

function buildDimensionNote(
  id: number,
  language: PromptLanguage,
  gp: GenreProfile,
  bookRules: BookRules | null,
  fanficMode: FanficMode | undefined,
  fanficConfig: ReturnType<typeof getFanficDimensionConfig> | undefined,
): string {
  const words = bookRules?.fatigueWordsOverride && bookRules.fatigueWordsOverride.length > 0
    ? bookRules.fatigueWordsOverride
    : gp.fatigueWords;

  if (fanficConfig?.notes.has(id) && language === "zh") {
    return fanficConfig.notes.get(id)!;
  }

  if (id === 1 && fanficMode === "ooc") {
    return language === "en"
      ? "In OOC mode, personality drift can be intentional; record only, do not fail. Evaluate against the character dossiers in fanfic_canon.md."
      : language === "vi"
        ? "Ở chế độ OOC, nhân vật có thể lệch lõi tính cách có chủ đích; chiều này chỉ ghi nhận, không đánh rớt. Đối chiếu hồ sơ nhân vật trong fanfic_canon.md để đánh giá mức độ lệch."
        : "OOC模式下角色可偏离性格底色，此维度仅记录不判定失败。参照 fanfic_canon.md 角色档案评估偏离程度。";
  }

  if (id === 1 && fanficMode === "canon") {
    return language === "en"
      ? "Canon-faithful fanfic: characters must stay close to their original personality core. Evaluate against fanfic_canon.md character dossiers."
      : language === "vi"
        ? "Fanfic trung thành nguyên tác: nhân vật phải bám sát lõi tính cách gốc. Đối chiếu hồ sơ nhân vật trong fanfic_canon.md."
        : "原作向同人：角色必须严格遵守性格底色。参照 fanfic_canon.md 角色档案中的性格底色和行为模式。";
  }

  if (id === 10 && words.length > 0) {
    return language === "en"
      ? `Fatigue words: ${words.join(", ")}. Also check AI tell markers (仿佛/不禁/宛如/竟然/忽然/猛地); warn when any appears more than once per 3,000 words.`
      : language === "vi"
        ? `Từ mệt mỏi: ${words.join(", ")}. Đồng thời kiểm tra mật độ từ báo AI (仿佛/不禁/宛如/竟然/忽然/猛地); cảnh báo nếu bất kỳ từ nào xuất hiện quá 1 lần mỗi 3.000 từ.`
        : `高疲劳词：${words.join("、")}。同时检查AI标记词（仿佛/不禁/宛如/竟然/忽然/猛地）密度，每3000字超过1次即warning`;
  }

  if (id === 15 && gp.satisfactionTypes.length > 0) {
    return language === "en"
      ? `Payoff types: ${gp.satisfactionTypes.join(", ")}`
      : language === "vi"
        ? `Loại điểm thỏa mãn: ${gp.satisfactionTypes.join(", ")}`
        : `爽点类型：${gp.satisfactionTypes.join("、")}`;
  }

  if (id === 12 && bookRules?.eraConstraints) {
    const era = bookRules.eraConstraints;
    const parts = [era.period, era.region].filter(Boolean);
    if (parts.length > 0) {
      return language === "en"
        ? `Era: ${parts.join(", ")}`
        : language === "vi"
          ? `Niên đại: ${parts.join(", ")}`
          : `年代：${parts.join("，")}`;
    }
  }

  // v10: Enhanced dimension notes with writing methodology awareness
  if (id === 7) {
    return language === "en"
      ? "Check pacing rhythm: Do the recent 3-5 chapters form a complete mini-goal cycle (build-up → escalation → climax → aftermath)? If 5+ consecutive chapters pass without a climax (payoff/reward/reversal), flag as pacing stagnation. If the previous chapter was a climax/big reversal, does this chapter show change (relationships shifted, status changed, costs paid)? If it jumps straight to new build-up without showing impact, flag as 'post-climax impact missing'. Daily/transition scenes must carry at least one task: plant a hook, advance a relationship, set up contrast, or prepare the next cycle."
      : language === "vi"
        ? "Kiểm tra nhịp sóng: 3-5 chương gần nhất có tạo thành chu kỳ mục tiêu nhỏ trọn vẹn (tích áp → leo thang → bùng nổ → hậu quả) không? Nếu 5+ chương liên tiếp không có bùng nổ (hồi đáp/phần thưởng/đảo chiều), đánh dấu là nhịp trì trệ. Nếu chương trước là bùng nổ/cao trào/đảo chiều lớn, chương này có cho thấy thay đổi không? Nếu nhảy thẳng sang tích áp mới mà không cho thấy ảnh hưởng của đợt bùng nổ trước, đánh dấu 'thiếu hậu quả sau cao trào'. Cảnh thường/đoạn chuyển tiếp trong chương không xung đột phải gánh ít nhất một nhiệm vụ: gieo hook, đẩy quan hệ, tạo tương phản, hoặc chuẩn bị chu kỳ tiếp theo. Cảnh thường thuần tán gẫu đánh dấu rủi ro kể lể."
        : "检查节奏波形：最近 3-5 章是否形成了完整的「蓄压→升级→爆发→后效」周期？如果连续 5 章没有爆发（兑现/回报/翻转），标记为节奏停滞。如果上一章是爆发/高潮/大反转，本章是否写出了改变？如果直接跳到新蓄压而没有展示前一波爆发的影响，标记为「高潮后影响缺失」。非冲突章节中的日常/过渡/对话段落，是否至少承担了一项任务：埋伏笔、推关系、建立反差、准备下一轮蓄压。纯水日常标记为流水账风险。";
  }

  if (id === 15) {
    const base = gp.satisfactionTypes.length > 0
      ? (language === "en"
        ? `Payoff types: ${gp.satisfactionTypes.join(", ")}. `
        : language === "vi"
          ? `Loại điểm thỏa mãn: ${gp.satisfactionTypes.join(", ")}. `
          : `爽点类型：${gp.satisfactionTypes.join("、")}。`)
      : "";
    return language === "en"
      ? `${base}Check desire engine: Has the chapter created an emotional gap (reader wants release) OR delivered a payoff that exceeds expectations? A payoff that only satisfies 70% of built-up anticipation counts as diluted. If this chapter is in the aftermath phase of a mini-goal cycle, verify that consequences are shown — not just emotional reactions, but concrete changes to status, relationships, or resources.`
      : language === "vi"
        ? `${base}Kiểm tra động cơ ham muốn: chương này có tạo khoảng trống cảm xúc (độc giả khao khát được thỏa mãn) hoặc hoàn thành một hồi đáp vượt kỳ vọng không? Hồi đáp chỉ thỏa mãn 70% kỳ vọng đã xây dựng là điểm thỏa mãn bị loãng. Nếu chương nằm ở pha hậu quả của chu kỳ mục tiêu nhỏ, kiểm tra xem hậu quả có được thể hiện không — không chỉ cảm xúc, mà là thay đổi cụ thể về địa vị, quan hệ hoặc tài nguyên.`
        : `${base}检查欲望驱动：本章是否制造了情绪缺口（读者渴望释放）或完成了超出预期的兑现？只满足读者70%期待的兑现等于爽点虚化。如果本章处于小目标周期的后效阶段，检查是否展示了具体改变——不只是情绪反应，而是地位、关系或资源的实际变化。`;
  }

  if (id === 25) {
    return language === "en"
      ? "Cross-check character behavior against the 3-question test: (1) Why does the character do this? (2) Does it match their established profile? (3) Would a reader who only read prior chapters find it jarring? Also check if character's emotional state progresses or stagnates."
      : language === "vi"
        ? "Đối chiếu hành vi nhân vật với bài kiểm tra ba câu hỏi: (1) Vì sao nhân vật làm vậy? (2) Có khớp nhân vật đã xây dựng trước đó không? (3) Độc giả chỉ đọc các chương trước có thấy gượng gạo không? Đồng thời kiểm tra cung cảm xúc của nhân vật đang tiến triển hay trì trệ."
        : "人设三问检查：(1)角色为什么这么做？(2)符合之前建立的人设吗？(3)只看过前面章节的读者会觉得突兀吗？同时检查角色情绪弧线是否在推进还是停滞。";
  }

  switch (id) {
    case 6:
      // Phase 7 — hook-debt escalation. Reviewer now reads pending_hooks.md
      // not just for "is this hook undelivered" but for causal/temporal
      // debt escalation. The ledger's status column carries "过期 (距=…/半衰=…)"
      // and "受阻于 …" markers emitted by the stale/blocked detector; this
      // dimension tells the reviewer how to escalate them.
      return language === "en"
        ? `Hook-debt escalation (Phase 7 + hotfixes 2/3). Read the pending_hooks.md ledger and escalate based on the stale / blocked / core_hook / depends_on / promoted columns, NOT only on "undelivered hook present":

• Critical severity only applies to hooks with promoted=true in the ledger. A stale/blocked non-promoted hook stays at info — the promotion flag is the gate that keeps reviewer noise down, because architect-seed emits many non-load-bearing seeds.
• A promoted core_hook=true hook that has been stale for over 10 chapters → escalate from warning to critical. The book has only 3-7 core hooks; letting one drift that long is the lead symptom of narrative rot.
• A promoted hook whose status cell contains "blocked on X (blocked Y chapters)" with Y >= 6 → warning. The literal "blocked Y chapters" token comes straight from the ledger — read it, don't guess. Call out the upstream hook id so the planner can route the resolution.
• At volume end (final chapter of any volume per volume_map) a promoted core_hook that is still open or stale without explicit "carried over to volume N+1" planning → critical.
• Any non-promoted stale hook → info-level log; do not fail the chapter on it, but note it so the planner can schedule cleanup.

Quote the exact hook_id in description and include the stale / blocked marker text verbatim. Structure check only — do not judge hook prose quality.`
        : language === "vi"
          ? `Quy tắc leo thang nợ hook (Phase 7 + hotfix 2/3). Khi đọc pending_hooks.md đừng chỉ nhìn "có hook chưa hồi đáp hay không", mà phải đọc các cột stale / blocked trong cột trạng thái, cột core_hook, cột depends_on và cột nâng cấp:

• Mức critical chỉ áp dụng cho hook có promoted=true trong sổ. Hook stale/blocked không promoted giữ nguyên info — cờ nâng cấp là công tắc giảm nhiễu, vì giai đoạn architect-seed sinh ra nhiều hạt giống không chịu lực.
• Hook promoted=true và core_hook=true bị stale quá 10 chương chưa thu hồi → nâng từ warning lên critical. Mỗi cuốn chỉ có 3-7 hook lõi; để một hook trôi lâu như vậy là triệu chứng đầu của mục ruỗng cốt truyện.
• Hook promoted bị chặn, trong ô trạng thái có "blocked on X (blocked Y chapters)" với Y >= 6 → warning. Token "blocked Y chapters" đọc nguyên văn từ sổ, đừng đoán. Ghi rõ hook_id thượng nguồn để planner định tuyến hướng giải quyết.
• Cuối tập (chương cuối của bất kỳ tập nào theo volume_map), hook lõi được promoted vẫn mở hoặc stale mà không có kế hoạch "chuyển sang tập N+1" rõ ràng → critical.
• Hook stale không promoted → ghi info, không đánh rớt chương này, nhưng giữ lại để planner sắp xếp dọn dẹp.

Trong description phải trích chính xác hook_id và chép nguyên văn token stale / blocked từ cột trạng thái. Chiều này chỉ soi cấu trúc, không chấm văn chương của hook.`
          : `Phase 7 hook-debt 升级规则（含 hotfix 2/3）。阅读 pending_hooks.md 伏笔池时不要只看"有没有悬而未决的伏笔"，要读状态列中的 stale / blocked 标记、core_hook 列、depends_on 列、以及升级列：

• critical 级别仅适用于升级=是（promoted=true）的伏笔。非升级的 stale/blocked 伏笔一律保持 info——升级标志是降噪的开关，因为架构师阶段会产出大量非承重的伏笔种子。
• 升级=是且 core_hook=是 的伏笔过期超过 10 章未回收 → warning 升级为 critical。全书只有 3-7 条核心伏笔，任何一条漂移这么久都是烂尾前兆。
• 升级=是的受阻伏笔，状态列中"受阻于 X (已阻 Y 章)"且 Y ≥ 6 → warning。"已阻 Y 章"这个字面 token 直接读自账本，不要猜。描述中要写出具体的上游 hook_id，让 planner 能安排落地路径。
• 卷尾（volume_map 中任一卷的末章）仍有升级=是的主线伏笔处于 open 或 stale 且没有显式"延至下一卷"规划 → critical。
• 升级=否的 stale 伏笔 → info 级记录，不判本章失败，但保留以便 planner 安排清理。

description 中要明确引用 hook_id，并把状态列中 stale / blocked 的原文标记字面抄进去。本维度只审结构，不评价伏笔文笔。`;
    case 19:
      return language === "en"
        ? "Check whether POV shifts are signaled clearly and stay consistent with the configured viewpoint."
        : language === "vi"
          ? "Kiểm tra việc chuyển điểm nhìn có tín hiệu chuyển rõ ràng và nhất quán với điểm nhìn đã cấu hình không."
          : "检查视角切换是否有过渡、是否与设定视角一致";
    case 24:
      return language === "en"
        ? "Cross-check subplot_board and chapter_summaries: flag any subplot that stays dormant long enough to feel abandoned, or a recent run where every subplot is only restated instead of genuinely moving."
        : language === "vi"
          ? "Đối chiếu subplot_board và chapter_summaries: đánh dấu tuyến phụ trầm lắng lâu tới mức gần như bị lãng quên, hoặc chuỗi chương gần đây chỉ nhắc lại tuyến phụ mà không thực sự đẩy tiến."
          : "对照 subplot_board 和 chapter_summaries：标记那些沉寂到接近被遗忘的支线，或近期连续只被重复提及、没有真实推进的支线。";
    case 25:
      return language === "en"
        ? "Cross-check emotional_arcs and chapter_summaries: flag any major character whose emotional line holds one pressure shape across a run instead of taking new pressure, release, reversal, or reinterpretation. Distinguish unchanged circumstances from unchanged inner movement."
        : language === "vi"
          ? "Đối chiếu emotional_arcs và chapter_summaries: đánh dấu nhân vật chính có đường cảm xúc giữ nguyên một hình thái áp lực trong một khoảng chạy dài, không có áp lực mới, giải tỏa, đảo chiều hoặc diễn giải lại. Phân biệt 'hoàn cảnh không đổi' với 'nội tâm không đổi'."
          : "对照 emotional_arcs 和 chapter_summaries：标记主要角色在一段时间内始终停留在同一种情绪压力形态、没有新压力、释放、转折或重估的情况。注意区分'处境未变'和'内心未变'。";
    case 26:
      return language === "en"
        ? "Cross-check chapter_summaries for chapter-type distribution: warn when the recent sequence stays in the same mode long enough to flatten rhythm, or when payoff / release beats disappear for too long. Explicitly list the recent type sequence."
        : language === "vi"
          ? "Đối chiếu chapter_summaries về phân bố loại chương: cảnh báo khi chuỗi chương gần đây dừng quá lâu ở một kiểu làm bẹt nhịp, hoặc các nhịp hồi đáp / giải tỏa biến mất quá lâu. Liệt kê rõ chuỗi loại chương gần nhất."
          : "对照 chapter_summaries 的章节类型分布：当近期章节长时间停留在同一种模式、把节奏压平，或回收/释放/高潮章节缺席过久时给出 warning。请明确列出最近章节的类型序列。";
    case 28:
      return language === "en"
        ? "Check whether spinoff events contradict the mainline canon constraints."
        : language === "vi"
          ? "Kiểm tra sự kiện ngoại truyện có mâu thuẫn với ràng buộc chính điển không."
          : "检查番外事件是否与正典约束表矛盾";
    case 29:
      return language === "en"
        ? "Check whether characters reference information that should only be revealed after the divergence point (see the information-boundary table)."
        : language === "vi"
          ? "Kiểm tra nhân vật có nhắc tới thông tin chỉ được hé lộ sau điểm phân kỳ không (tham chiếu bảng ranh giới thông tin)."
          : "检查角色是否引用了分歧点之后才揭示的信息（参照信息边界表）";
    case 30:
      return language === "en"
        ? "Check whether the spinoff violates mainline world rules (power system, geography, factions)."
        : language === "vi"
          ? "Kiểm tra ngoại truyện có vi phạm luật thế giới chính truyện không (hệ thống sức mạnh, địa lý, phe phái)."
          : "检查番外是否违反正传世界规则（力量体系、地理、阵营）";
    case 31:
      return language === "en"
        ? "Check whether the spinoff resolves mainline hooks without authorization (warning level)."
        : language === "vi"
          ? "Kiểm tra ngoại truyện có tự ý thu hồi hook chính truyện không (mức cảnh báo)."
          : "检查番外是否越权回收正传伏笔（warning级别）";
    case 32:
      return language === "en"
        ? "Check whether the ending renews curiosity, whether promised payoffs are landing on the cadence their hooks imply, whether pressure gets any release, and whether reader expectation gaps are accumulating faster than they are being satisfied. If a climax just occurred, check whether the aftermath chapters show concrete change before starting a new cycle."
        : language === "vi"
          ? "Kiểm tra: cuối chương có thắp lại trí tò mò không, các hồi đáp đã hứa có rơi đúng nhịp mà hook của chúng ngụ ý không, áp lực có được giải tỏa không, khoảng trống kỳ vọng của độc giả đang tích lũy nhanh hơn hay được thỏa mãn. Nếu vừa trải qua cao trào, kiểm tra các chương hậu quả có cho thấy thay đổi cụ thể trước khi mở chu kỳ mới."
          : "检查：章尾是否重新点燃好奇心，已经承诺的回收是否按伏笔自身节奏落地，压力是否得到释放，读者期待缺口是在持续累积还是在被满足。如果刚经历高潮，检查后效章节是否在开启新周期前展示了具体改变。";
    case 33:
      return language === "en"
        ? "Cross-check the chapter_memo provided with the chapter. Does the final prose deliver the memo's goal and leave a visible trace for every one of the 7 sections it contains (tasks, pay-offs / held-back cards, daily/transition function map, three-question check, end-of-chapter concrete changes, hard-don'ts)? Missing or contradicted sections -> critical. Note: a sparse memo (breather chapter, goal + skeleton body only) is legitimate — only flag drift against sections that the memo actually populates. Never flag the memo itself for being sparse."
        : language === "vi"
          ? "Đối chiếu chapter_memo kèm theo. Thành phẩm có hiện thực hóa goal của memo và để lại dấu vết thấy được cho từng phần trong 7 mục nó chứa không (nhiệm vụ / hồi đáp·giữ kín / bản đồ chức năng đoạn thường·chuyển tiếp / ba câu hỏi then chốt / thay đổi cụ thể cuối chương / cấm kỵ)? Thiếu hoặc viết ngược bất kỳ mục nào → critical. Lưu ý: memo thưa là hợp lệ (chương thở có thể chỉ có goal + body khung), chỉ chấm độ lệch so với phần memo thực sự viết; không được chê memo vì nó thưa."
          : "对照随章提供的 chapter_memo。成稿是否兑现了 memo 中的 goal，并在 7 段正文（当前任务 / 该兑现·暂不掀 / 日常过渡功能 / 关键抉择三连问 / 章尾必须发生的改变 / 不要做 等）中留下可见落地痕迹？任何段落缺失或被写反 → critical。提醒：稀疏 memo 合法（喘息章 memo 可以只有 goal + 骨架 body），只检查 memo 实际写出的段落，不能因为 memo 稀疏就判 incomplete。";
    case 34:
    case 35:
    case 36:
    case 37: {
      if (!fanficConfig) return "";
      const severity = fanficConfig.severityOverrides.get(id) ?? "warning";
      const baseNote = language === "en"
        ? {
            34: "Check whether dialogue tics, speaking style, and behavior remain consistent with the character dossiers in fanfic_canon.md. Deviations need clear situational motivation.",
            35: "Check whether the chapter violates world rules documented in fanfic_canon.md (geography, power system, faction relations).",
            36: "Check whether relationship beats remain plausible and aligned with, or meaningfully develop from, the key relationships documented in fanfic_canon.md.",
            37: "Check whether the chapter contradicts the key event timeline in fanfic_canon.md.",
          }[id]
        : FANFIC_DIMENSIONS.find((dimension) => dimension.id === id)?.baseNote;

      return baseNote
        ? `${baseNote} ${formatFanficSeverityNote(severity, language)}`
        : "";
    }
    default:
      return "";
  }
}

function buildDimensionList(
  gp: GenreProfile,
  bookRules: BookRules | null,
  language: PromptLanguage,
  hasParentCanon = false,
  fanficMode?: FanficMode,
): ReadonlyArray<{ readonly id: number; readonly name: string; readonly note: string }> {
  const activeIds = new Set(gp.auditDimensions);

  // Add book-level additional dimensions (supports both numeric IDs and name strings)
  if (bookRules?.additionalAuditDimensions) {
    // Build reverse lookup: name → id
    const nameToId = new Map<string, number>();
    for (const [id, labels] of Object.entries(DIMENSION_LABELS)) {
      nameToId.set(labels.zh, Number(id));
      nameToId.set(labels.en, Number(id));
    }

    for (const d of bookRules.additionalAuditDimensions) {
      if (typeof d === "number") {
        activeIds.add(d);
      } else if (typeof d === "string") {
        // Try exact match first, then substring match
        const exactId = nameToId.get(d);
        if (exactId !== undefined) {
          activeIds.add(exactId);
        } else {
          // Fuzzy: find dimension whose name contains the string
          for (const [name, id] of nameToId) {
            if (name.includes(d) || d.includes(name)) {
              activeIds.add(id);
              break;
            }
          }
        }
      }
    }
  }

  // Always-active dimensions
  activeIds.add(32); // 读者期待管理 — universal
  activeIds.add(33); // 章节备忘偏离 — universal (replaces legacy volume-outline drift)

  // Conditional overrides
  if (gp.eraResearch || bookRules?.eraConstraints?.enabled) {
    activeIds.add(12);
  }

  // Spinoff dimensions — activated when parent_canon.md exists (but NOT in fanfic mode)
  if (hasParentCanon && !fanficMode) {
    activeIds.add(28); // 正传事件冲突
    activeIds.add(29); // 未来信息泄露
    activeIds.add(30); // 世界规则跨书一致性
    activeIds.add(31); // 番外伏笔隔离
  }

  // Fanfic dimensions — replace spinoff dims with fanfic-specific checks
  let fanficConfig: ReturnType<typeof getFanficDimensionConfig> | undefined;
  if (fanficMode) {
    fanficConfig = getFanficDimensionConfig(fanficMode, bookRules?.allowedDeviations);
    for (const id of fanficConfig.activeIds) {
      activeIds.add(id);
    }
    for (const id of fanficConfig.deactivatedIds) {
      activeIds.delete(id);
    }
  }

  const dims: Array<{ id: number; name: string; note: string }> = [];

  for (const id of [...activeIds].sort((a, b) => a - b)) {
    const name = dimensionName(id, language);
    if (!name) continue;

    const note = buildDimensionNote(id, language, gp, bookRules, fanficMode, fanficConfig);

    dims.push({ id, name, note });
  }

  return dims;
}

export class ContinuityAuditor extends BaseAgent {
  get name(): string {
    return "continuity-auditor";
  }

  async auditChapter(
    bookDir: string,
    chapterContent: string,
    chapterNumber: number,
    genre?: string,
    options?: {
      temperature?: number;
      chapterIntent?: string;
      chapterMemo?: ChapterMemo;
      contextPackage?: ContextPackage;
      ruleStack?: RuleStack;
      truthFileOverrides?: {
        currentState?: string;
        ledger?: string;
        hooks?: string;
      };
    },
  ): Promise<AuditResult> {
    const [diskCurrentState, diskLedger, diskHooks, styleGuideRaw, subplotBoard, emotionalArcs, characterMatrix, chapterSummaries, parentCanon, fanficCanon, volumeOutline] =
      await Promise.all([
        // Phase 5 consolidation: derive initial state from roles + seed hooks
        // when current_state.md is still the architect seed placeholder.
        readCurrentStateWithFallback(bookDir, MISSING_FILE_SENTINEL),
        this.readFileSafe(join(bookDir, "story/particle_ledger.md")),
        this.readFileSafe(join(bookDir, "story/pending_hooks.md")),
        this.readFileSafe(join(bookDir, "story/style_guide.md")),
        this.readFileSafe(join(bookDir, "story/subplot_board.md")),
        this.readFileSafe(join(bookDir, "story/emotional_arcs.md")),
        readCharacterContext(bookDir, MISSING_FILE_SENTINEL),
        this.readFileSafe(join(bookDir, "story/chapter_summaries.md")),
        this.readFileSafe(join(bookDir, "story/parent_canon.md")),
        this.readFileSafe(join(bookDir, "story/fanfic_canon.md")),
        readVolumeMap(bookDir, MISSING_FILE_SENTINEL),
      ]);
    const currentState = options?.truthFileOverrides?.currentState ?? diskCurrentState;
    const ledger = options?.truthFileOverrides?.ledger ?? diskLedger;
    const hooks = options?.truthFileOverrides?.hooks ?? diskHooks;

    const hasParentCanon = parentCanon !== MISSING_FILE_SENTINEL;
    const hasFanficCanon = fanficCanon !== MISSING_FILE_SENTINEL;

    // Load last chapter full text for fine-grained continuity checking
    const previousChapter = await this.loadPreviousChapter(bookDir, chapterNumber);

    // Load genre profile and book rules
    const genreId = genre ?? "other";
    const [{ profile: gp }, bookLanguage] = await Promise.all([
      readGenreProfile(this.ctx.projectRoot, genreId),
      readBookLanguage(bookDir),
    ]);
    const parsedRules = await readBookRules(bookDir);
    const bookRules = parsedRules?.rules ?? null;

    // Fallback: use book_rules body when style_guide.md doesn't exist.
    // Phase 5 hotfix 2: parsedRules.body is only populated for legacy
    // book_rules.md sources — story_frame.md frontmatter yields an empty
    // body, and an empty string is NOT a usable style guide. Treat
    // missing/empty body as "no fallback available".
    const legacyRulesBody = parsedRules?.body?.trim();
    const styleGuide = styleGuideRaw !== MISSING_FILE_SENTINEL
      ? styleGuideRaw
      : (legacyRulesBody || MISSING_STYLE_GUIDE_SENTINEL);

    const resolvedLanguage = bookLanguage ?? gp.language;
    const isEnglish = resolvedLanguage === "en";
    const isVietnamese = resolvedLanguage === "vi";
    const fanficMode = hasFanficCanon ? (bookRules?.fanficMode as FanficMode | undefined) : undefined;
    const currentStateDisplay = renderMissingContext(currentState, resolvedLanguage, "Chưa có trạng thái hiện tại.");
    const styleGuideDisplay = renderMissingContext(styleGuide, resolvedLanguage, "Chưa có hướng dẫn văn phong.");
    const dimensions = buildDimensionList(gp, bookRules, resolvedLanguage, hasParentCanon, fanficMode);
    const dimList = dimensions
      .map((d) => `${d.id}. ${d.name}${d.note ? (isEnglish || isVietnamese ? ` (${d.note})` : `（${d.note}）`) : ""}`)
      .join("\n");
    const genreLabel = resolveGenreLabel(genreId, gp.name, resolvedLanguage);

    const protagonistBlock = bookRules?.protagonist
      ? isEnglish
        ? `\n\nProtagonist lock: ${bookRules.protagonist.name}; personality locks: ${joinLocalized(bookRules.protagonist.personalityLock, resolvedLanguage)}; behavioral constraints: ${joinLocalized(bookRules.protagonist.behavioralConstraints, resolvedLanguage)}.`
        : isVietnamese
          ? `\n\nKhóa nhân vật chính: ${bookRules.protagonist.name}; các nét tính cách phải giữ: ${joinLocalized(bookRules.protagonist.personalityLock, resolvedLanguage)}; ràng buộc hành vi: ${joinLocalized(bookRules.protagonist.behavioralConstraints, resolvedLanguage)}.`
          : `\n主角人设锁定：${bookRules.protagonist.name}，${bookRules.protagonist.personalityLock.join("、")}，行为约束：${bookRules.protagonist.behavioralConstraints.join("、")}`
      : "";

    const searchNote = gp.eraResearch
      ? isEnglish
        ? "\n\nYou have web-search capability (search_web / fetch_url). For real-world eras, people, events, geography, or policies, you must verify with search_web instead of relying on memory. Cross-check at least 2 sources."
        : isVietnamese
          ? "\n\nBạn có khả năng tìm kiếm web (search_web / fetch_url). Với niên đại, nhân vật, sự kiện, địa lý hoặc chính sách có thật, phải xác minh bằng search_web thay vì dựa vào trí nhớ; đối chiếu ít nhất 2 nguồn."
          : "\n\n你有联网搜索能力（search_web / fetch_url）。对于涉及真实年代、人物、事件、地理、政策的内容，你必须用search_web核实，不可凭记忆判断。至少对比2个来源交叉验证。"
      : "";

    const systemPromptBase = isEnglish
      ? `You are a strict ${genreLabel} web-fiction structural editor. Audit the chapter for completion and structure, not for prose craft. ALL OUTPUT MUST BE IN ENGLISH.${protagonistBlock}${searchNote}

## Reviewer Scope (hard constraints)

You audit completion and structure only. Your job is to decide whether the chapter delivers the plan, keeps characters and timelines intact, and moves the book forward. Wording, sentence rhythm, paragraph shape, punctuation, imagery, and other prose-surface choices are NOT yours — those belong to the Polisher pass that runs after you. If you notice prose-surface issues, you may flag them with severity "info" so the Polisher can see them, but they do not count toward passed / overall_score and they must never be critical.

You audit twelve structural reader-pain patterns: dragging / flat openings, blurry worldbuilding disconnected from reality, contradictory character setup, tangled POV, mainline drift or stagnation, weak conflict with missing payoff, pacing loss of control and abrupt transitions, character inconsistency across the arc, thin/one-note characters without contrast, stiff emotion expression and abrupt relationship jumps, imbalanced cheats/power gifts, and settings that never land in concrete action. Alongside these, keep the engineering dimensions listed below.

Sparse chapter_memo is legitimate. Breather / aftermath / transition chapters may ship a memo that only contains goal + a skeleton body — do NOT flag such memos as incomplete, and do NOT penalise the chapter for lacking content against sections the memo itself does not populate. Judge drift only against what the memo actually says.

If the chapter memo, rule stack, or supplied context specifies content proportions between lines, audit whether those lines appear as actual scenes, dialogue, action, or relationship movement. A line summarized in one sentence counts as missing. Mark it critical only when the memo explicitly required it for this chapter.

For every issue, set repair_scope as a typed routing hint: "local" for wording, paragraph shape, small repetition, or narrow sentence-level fixes; "structural" for plot drift, timeline break, missing scene/payoff, character logic collapse, POV/knowledge boundary failure, or anything requiring a rewritten scene/chapter; "unknown" only when you genuinely cannot decide.

Audit dimensions:
${dimList}

Output format MUST be JSON:
{
  "passed": true/false,
  "overall_score": 0-100,
  "issues": [{ "severity": "critical|warning|info", "repair_scope": "local|structural|unknown", "category": "dimension name", "description": "specific issue description", "suggestion": "fix suggestion" }],
  "summary": "one-sentence audit conclusion"
}

passed is false ONLY when critical-severity issues exist.

overall_score calibration:
- 95-100: Publishable as-is, no noticeable issues
- 85-94: Minor blemishes but smooth reading
- 75-84: Noticeable problems but the story backbone holds
- 65-74: Multiple issues hurt the reading experience
- < 65: Structural breakdown, needs major rewrite
Score holistically — do not let a single minor issue tank the score.`
      : isVietnamese
        ? `Bạn là biên tập viên cấu trúc nghiêm khắc cho truyện mạng ${genreLabel}. Hãy kiểm tra mức độ hoàn thành và cấu trúc của chương, không chấm kỹ thuật văn xuôi. MỌI ĐẦU RA PHẢI BẰNG TIẾNG VIỆT.${protagonistBlock}${searchNote}

## Phạm vi rà soát (ràng buộc cứng)

Chỉ rà soát mức độ hoàn thành và cấu trúc: chương có thực hiện kế hoạch, giữ nhất quán nhân vật và dòng thời gian, đồng thời đẩy câu chuyện đi tiếp không. Câu chữ, nhịp câu, hình dáng đoạn, dấu câu, hình ảnh và các lựa chọn bề mặt văn xuôi thuộc lượt Polisher sau đó. Nếu thấy lỗi bề mặt, chỉ ghi severity "info" để Polisher tham khảo; chúng không ảnh hưởng passed / overall_score và không bao giờ là critical.

Rà soát mười hai kiểu lỗi cấu trúc gây khó chịu cho độc giả: mở đầu lê thê hoặc phẳng, thế giới mơ hồ không bám thực tế, thiết lập nhân vật mâu thuẫn, điểm nhìn rối, tuyến chính lệch hoặc đình trệ, xung đột yếu thiếu hồi đáp, nhịp mất kiểm soát và chuyển cảnh đột ngột, nhân vật thiếu nhất quán theo cung truyện, nhân vật mỏng hoặc một màu, cảm xúc gượng và quan hệ đổi quá đột ngột, năng lực/quà tặng mất cân bằng, và thiết lập không chuyển thành hành động cụ thể. Đồng thời giữ các chiều kỹ thuật bên dưới.

chapter_memo thưa là hợp lệ. Chương nghỉ nhịp, hậu quả hoặc chuyển tiếp có thể chỉ có goal và body khung; không được xem đó là thiếu, cũng không trừ chương vì memo không có phần mà nó không điền. Chỉ đánh giá độ lệch so với điều memo thực sự nêu.

Nếu memo chương, rule stack hoặc ngữ cảnh cung cấp quy định tỷ lệ giữa các tuyến, hãy kiểm tra các tuyến đó có thành cảnh, thoại, hành động hoặc chuyển động quan hệ thực tế hay không. Tuyến chỉ được tóm tắt trong một câu được xem là thiếu. Chỉ đánh dấu critical khi memo yêu cầu rõ tuyến đó phải được đẩy trong chương này.

Với mỗi issue, đặt repair_scope làm gợi ý định tuyến có kiểu: "local" cho câu chữ, hình dáng đoạn, lặp nhỏ hoặc sửa ở phạm vi câu; "structural" cho lệch cốt truyện, đứt dòng thời gian, thiếu cảnh/hồi đáp, đổ vỡ logic nhân vật, lỗi điểm nhìn/ranh giới thông tin, hoặc việc phải viết lại cảnh/chương; chỉ dùng "unknown" khi thực sự không thể xác định.

Các chiều rà soát:
${dimList}

Định dạng đầu ra BẮT BUỘC là JSON:
{
  "passed": true/false,
  "overall_score": 0-100,
  "issues": [{ "severity": "critical|warning|info", "repair_scope": "local|structural|unknown", "category": "tên chiều rà soát", "description": "mô tả vấn đề cụ thể", "suggestion": "đề xuất sửa" }],
  "summary": "kết luận rà soát trong một câu"
}

passed chỉ là false khi có issue mức critical.

Hiệu chuẩn overall_score:
- 95-100: Có thể xuất bản ngay, không có lỗi đáng chú ý
- 85-94: Có lỗi nhỏ nhưng đọc trôi chảy
- 75-84: Có vấn đề thấy rõ nhưng khung truyện vẫn vững
- 65-74: Nhiều lỗi làm giảm trải nghiệm đọc
- < 65: Vỡ cấu trúc, cần viết lại lớn
Chấm tổng thể; đừng để một lỗi nhỏ đơn lẻ kéo tụt điểm quá mức.`
        : `你是一位严格的${gp.name}网络小说结构审稿编辑。你只审完成度 + 结构，不审文笔。${protagonistBlock}${searchNote}

## 审稿边界（硬约束）

你不审文笔、不审排版、不审句式——这些归 Polisher。你发现的文笔问题只能以 severity="info" 标注供 Polisher 参考，不计入 reviewer 的 passed/overall_score，也绝不可标为 critical。

你审 12 条结构类雷点：开篇拖沓/平淡、世界观模糊脱现实、人设矛盾、视角杂乱、主线偏离/停滞、冲突乏力爽点缺失、节奏失控过渡生硬、人设前后矛盾、人物单薄无反差、情感表达生硬/关系突兀、金手指失衡、设定无落地。同时保留工程维度。

稀疏 memo 是合法状态。喘息章 / 后效章 / 过渡章的 memo 可以只有 goal + 骨架 body——此类 memo 不判 incomplete，也不能因为 memo 没写的段落就扣成稿的分。只按 memo 实际写出来的内容判偏离。

如果章节备忘、规则栈或输入上下文明确指定多条剧情线的比例，要审它们是否真正落成了场景、对话、行动或关系变化。只用一句总结带过的线，视为缺失。只有当 memo 明确要求本章必须推进该线时，才标 critical。

每条 issue 必须给 repair_scope 作为 typed 路由提示："local" 表示措辞、段落形状、小重复、句段级小修；"structural" 表示主线偏离、时间线断裂、场面/回报缺失、人物逻辑崩、视角/信息边界失败，或任何需要重写场景/整章的问题；只有确实无法判断时才写 "unknown"。

审查维度：
${dimList}

输出格式必须为 JSON：
{
  "passed": true/false,
  "overall_score": 0-100,
  "issues": [{ "severity": "critical|warning|info", "repair_scope": "local|structural|unknown", "category": "审查维度名称", "description": "具体问题描述", "suggestion": "修改建议" }],
  "summary": "一句话总结审查结论"
}

只有当存在 critical 级别问题时，passed 才为 false。

overall_score 评分校准：
- 95-100：可直接发布，无明显问题
- 85-94：有小瑕疵但整体流畅可读
- 75-84：有明显问题但故事主干完整
- 65-74：多处影响阅读体验的问题
- < 65：结构性问题，需要大幅重写
综合评分，不要因为单一小问题大幅拉低分数。`;
    const systemPrompt = await this.withPromptPackGuidance(systemPromptBase, "longform.auditor");

    const ledgerDisplay = renderMissingContext(ledger, resolvedLanguage, "Chưa có sổ tài nguyên.");
    const ledgerBlock = gp.numericalSystem
      ? isEnglish ? `\n## Resource Ledger\n${ledgerDisplay}` : isVietnamese ? `\n## Sổ tài nguyên\n${ledgerDisplay}` : `\n## 资源账本\n${ledgerDisplay}`
      : "";

    // Smart context filtering for auditor — same logic as writer
    const bookRulesForFilter = parsedRules?.rules ?? null;
    const filteredSubplots = filterSubplots(subplotBoard);
    const filteredArcs = filterEmotionalArcs(emotionalArcs, chapterNumber);
    const filteredMatrix = filterCharacterMatrix(characterMatrix, volumeOutline, bookRulesForFilter?.protagonist?.name);
    const filteredSummaries = filterSummaries(chapterSummaries, chapterNumber);
    const filteredHooks = filterHooks(hooks);

    const governedMemoryBlocks = options?.contextPackage
      ? buildGovernedMemoryEvidenceBlocks(options.contextPackage, resolvedLanguage)
      : undefined;

    const hooksBlock = governedMemoryBlocks?.hooksBlock
      ?? (filteredHooks !== MISSING_FILE_SENTINEL ? isEnglish ? `\n## Pending Hooks\n${filteredHooks}\n` : isVietnamese ? `\n## Hook đang chờ\n${filteredHooks}\n` : `\n## 伏笔池\n${filteredHooks}\n` : "");
    const subplotBlock = filteredSubplots !== MISSING_FILE_SENTINEL ? isEnglish ? `\n## Subplot Board\n${filteredSubplots}\n` : isVietnamese ? `\n## Bảng tuyến phụ\n${filteredSubplots}\n` : `\n## 支线进度板\n${filteredSubplots}\n` : "";
    const emotionalBlock = filteredArcs !== MISSING_FILE_SENTINEL ? isEnglish ? `\n## Emotional Arcs\n${filteredArcs}\n` : isVietnamese ? `\n## Cung cảm xúc\n${filteredArcs}\n` : `\n## 情感弧线\n${filteredArcs}\n` : "";
    const matrixBlock = filteredMatrix !== MISSING_FILE_SENTINEL ? isEnglish ? `\n## Character Interaction Matrix\n${filteredMatrix}\n` : isVietnamese ? `\n## Ma trận tương tác nhân vật\n${filteredMatrix}\n` : `\n## 角色交互矩阵\n${filteredMatrix}\n` : "";
    const summariesBlock = governedMemoryBlocks?.summariesBlock ?? (filteredSummaries !== MISSING_FILE_SENTINEL ? isEnglish ? `\n## Chapter Summaries (for pacing checks)\n${filteredSummaries}\n` : isVietnamese ? `\n## Tóm tắt chương (để kiểm tra nhịp)\n${filteredSummaries}\n` : `\n## 章节摘要（用于节奏检查）\n${filteredSummaries}\n` : "");
    const volumeSummariesBlock = governedMemoryBlocks?.volumeSummariesBlock ?? "";
    const canonBlock = hasParentCanon ? isEnglish ? `\n## Mainline Canon Reference (for spinoff audit)\n${parentCanon}\n` : isVietnamese ? `\n## Tham chiếu chính truyện (để rà soát ngoại truyện)\n${parentCanon}\n` : `\n## 正传正典参照（番外审查专用）\n${parentCanon}\n` : "";
    const fanficCanonBlock = hasFanficCanon ? isEnglish ? `\n## Fanfic Canon Reference (for fanfic audit)\n${fanficCanon}\n` : isVietnamese ? `\n## Tham chiếu chính điển fanfic\n${fanficCanon}\n` : `\n## 同人正典参照（同人审查专用）\n${fanficCanon}\n` : "";
    const memoBlock = options?.chapterMemo ? isEnglish ? `\n## Chapter Memo (for memo drift checks)\nGoal: ${options.chapterMemo.goal}\n\n${options.chapterMemo.body}\n` : isVietnamese ? `\n## Memo chương (để kiểm tra lệch memo)\nMục tiêu: ${options.chapterMemo.goal}\n\n${options.chapterMemo.body}\n` : `\n## 章节备忘（用于 memo 偏离检测）\ngoal：${options.chapterMemo.goal}\n\n${options.chapterMemo.body}\n` : "";
    const reducedControlBlock = options?.chapterIntent && options.contextPackage && options.ruleStack ? this.buildReducedControlBlock(options.chapterIntent, options.contextPackage, options.ruleStack, resolvedLanguage) : "";
    const styleGuideBlock = reducedControlBlock.length === 0 ? isEnglish ? `\n## Style Guide\n${styleGuideDisplay}` : isVietnamese ? `\n## Hướng dẫn văn phong\n${styleGuideDisplay}` : `\n## 文风指南\n${styleGuideDisplay}` : "";
    const prevChapterBlock = previousChapter ? isEnglish ? `\n## Previous Chapter Full Text (for transition checks)\n${previousChapter}\n` : isVietnamese ? `\n## Toàn văn chương trước (để kiểm tra chuyển tiếp)\n${previousChapter}\n` : `\n## 上一章全文（用于衔接检查）\n${previousChapter}\n` : "";
    const userPrompt = isEnglish
      ? `Review chapter ${chapterNumber}.\n\n## Current State Card\n${currentStateDisplay}\n${ledgerBlock}\n${hooksBlock}${volumeSummariesBlock}${subplotBlock}${emotionalBlock}${matrixBlock}${summariesBlock}${canonBlock}${fanficCanonBlock}${reducedControlBlock}${memoBlock}${prevChapterBlock}${styleGuideBlock}\n\n## Chapter Content Under Review\n${chapterContent}`
      : isVietnamese
        ? `Hãy rà soát Chương ${chapterNumber}.\n\n## Thẻ trạng thái hiện tại\n${currentStateDisplay}\n${ledgerBlock}\n${hooksBlock}${volumeSummariesBlock}${subplotBlock}${emotionalBlock}${matrixBlock}${summariesBlock}${canonBlock}${fanficCanonBlock}${reducedControlBlock}${memoBlock}${prevChapterBlock}${styleGuideBlock}\n\n## Nội dung chương cần rà soát\n${chapterContent}`
        : `请审查第${chapterNumber}章。\n\n## 当前状态卡\n${currentStateDisplay}\n${ledgerBlock}\n${hooksBlock}${volumeSummariesBlock}${subplotBlock}${emotionalBlock}${matrixBlock}${summariesBlock}${canonBlock}${fanficCanonBlock}${reducedControlBlock}${memoBlock}${prevChapterBlock}${styleGuideBlock}\n\n## 待审章节内容\n${chapterContent}`;

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];
    const chatOptions = { temperature: options?.temperature ?? 0.3 };

    // Use web search for fact verification when eraResearch is enabled
    const response = gp.eraResearch
      ? await this.chatWithSearch(chatMessages, chatOptions)
      : await this.chat(chatMessages, chatOptions);

    const result = this.parseAuditResult(response.content, resolvedLanguage);
    return { ...result, tokenUsage: response.usage };
  }

  private parseAuditResult(content: string, language: PromptLanguage): AuditResult {
    // Try multiple JSON extraction strategies (handles small/local models)

    // Strategy 1: Find balanced JSON object (not greedy)
    const balanced = this.extractBalancedJson(content);
    if (balanced) {
      const result = this.tryParseAuditJson(balanced, language);
      if (result) return result;
    }

    // Strategy 2: Try the whole content as JSON (some models output pure JSON)
    const trimmed = content.trim();
    if (trimmed.startsWith("{")) {
      const result = this.tryParseAuditJson(trimmed, language);
      if (result) return result;
    }

    // Strategy 3: Look for ```json code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      const result = this.tryParseAuditJson(codeBlockMatch[1]!.trim(), language);
      if (result) return result;
    }

    // Strategy 4: Try to extract individual fields via regex (last resort fallback)
    const passedMatch = content.match(/"passed"\s*:\s*(true|false)/);
    const issuesMatch = content.match(/"issues"\s*:\s*\[([\s\S]*?)\]/);
    const summaryMatch = content.match(/"summary"\s*:\s*"([^"]*)"/);
    if (passedMatch) {
      const issues: AuditIssue[] = [];
      if (issuesMatch) {
        // Try to parse individual issue objects
        const issuePattern = /\{[^{}]*"severity"\s*:\s*"[^"]*"[^{}]*\}/g;
        let match: RegExpExecArray | null;
        while ((match = issuePattern.exec(issuesMatch[1]!)) !== null) {
          try {
            const issue = JSON.parse(match[0]);
            issues.push({
              severity: issue.severity ?? "warning",
              category: issue.category ?? (language === "en" ? "Uncategorized" : language === "vi" ? "Chưa phân loại" : "未分类"),
              description: issue.description ?? "",
              suggestion: issue.suggestion ?? "",
              repairScope: normalizeRepairScope(issue.repair_scope ?? issue.repairScope),
            });
          } catch {
            // Skip malformed individual issue.
          }
        }
      }
      return {
        passed: passedMatch[1] === "true",
        issues,
        summary: summaryMatch?.[1] ?? "",
      };
    }

    return {
      passed: false,
      parseFailed: true,
      issues: [{
        severity: "critical",
        category: language === "en" ? "System Error" : language === "vi" ? "Lỗi hệ thống" : "系统错误",
        description: language === "en" ? "Audit output format was invalid and could not be parsed as JSON." : language === "vi" ? "Định dạng đầu ra rà soát không hợp lệ và không thể phân tích thành JSON." : "审稿输出格式异常，无法解析为 JSON",
        suggestion: language === "en" ? "The model may not support reliable structured output. Try a stronger model or inspect the API response format." : language === "vi" ? "Mô hình có thể không hỗ trợ đầu ra có cấu trúc ổn định. Hãy thử mô hình mạnh hơn hoặc kiểm tra định dạng phản hồi API." : "可能是模型不支持结构化输出。尝试换一个更大的模型，或检查 API 返回格式。",
      }],
      summary: language === "en" ? "Audit output parsing failed" : language === "vi" ? "Không thể phân tích đầu ra rà soát" : "审稿输出解析失败",
    };
  }

  private buildReducedControlBlock(
    chapterIntent: string,
    contextPackage: ContextPackage,
    ruleStack: RuleStack,
    language: PromptLanguage,
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
      return `\n## Đầu vào kiểm soát chương (do Planner/Composer biên dịch)
${chapterIntent}

### Ngữ cảnh đã chọn
${selectedContext || "- không có"}

### Ngăn xếp quy tắc
- Hàng rào cứng: ${ruleStack.sections.hard.join(", ") || "(không có)"}
- Ràng buộc mềm: ${ruleStack.sections.soft.join(", ") || "(không có)"}
- Quy tắc chẩn đoán: ${ruleStack.sections.diagnostic.join(", ") || "(không có)"}

### Ghi đè đang hoạt động
${ruleStack.activeOverrides.length > 0 ? overrides : "- không có"}\n`;
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

  private extractBalancedJson(text: string): string | null {
    const start = text.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      if (text[i] === "}") depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
    return null;
  }

  private tryParseAuditJson(json: string, language: PromptLanguage = "zh"): AuditResult | null {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed.passed !== "boolean" && parsed.passed !== undefined) return null;
      const rawScore = parsed.overall_score ?? parsed.overallScore;
      const overallScore = typeof rawScore === "number" && Number.isFinite(rawScore)
        ? Math.round(Math.max(0, Math.min(100, rawScore)))
        : undefined;
      return {
        passed: Boolean(parsed.passed ?? false),
        issues: Array.isArray(parsed.issues)
	          ? parsed.issues.map((i: Record<string, unknown>) => ({
	              severity: (i.severity as string) ?? "warning",
              category: (i.category as string) ?? (language === "en" ? "Uncategorized" : language === "vi" ? "Chưa phân loại" : "未分类"),
	              description: (i.description as string) ?? "",
	              suggestion: (i.suggestion as string) ?? "",
	              repairScope: normalizeRepairScope(i.repair_scope ?? i.repairScope),
	            }))
          : [],
        summary: String(parsed.summary ?? ""),
        overallScore,
      };
    } catch {
      return null;
    }
  }

  private async loadPreviousChapter(bookDir: string, currentChapter: number): Promise<string> {
    if (currentChapter <= 1) return "";
    const chaptersDir = join(bookDir, "chapters");
    try {
      const files = await readdir(chaptersDir);
      const paddedPrev = String(currentChapter - 1).padStart(4, "0");
      const prevFile = files.find((f) => f.startsWith(paddedPrev) && f.endsWith(".md"));
      if (!prevFile) return "";
      return await readFile(join(chaptersDir, prevFile), "utf-8");
    } catch {
      return "";
    }
  }

  private async readFileSafe(path: string): Promise<string> {
    try {
      return await readFile(path, "utf-8");
    } catch {
      return "(文件不存在)";
    }
  }
}
