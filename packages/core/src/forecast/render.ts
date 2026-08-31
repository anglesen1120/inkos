import type { ForecastBranch, NarrativeForecast } from "./schema.js";

// Deterministic markdown renderers for forecast artifacts. Both documents are
// derived purely from forecast.json so re-rendering never needs another LLM
// call and tests stay clock-free.

export function renderForecastComparisonMarkdown(forecast: NarrativeForecast): string {
  const vi = forecast.language === "vi";
  const zh = !vi && forecast.language === "zh";
  const header = zh
    ? [
        `# 叙事推演对比：${forecast.divergence}`,
        "",
        `- 推演 ID：${forecast.forecastId}`,
        `- 书籍：${forecast.bookId}`,
        `- 基准章节：第 ${forecast.baseChapter} 章`,
        `- 推演跨度：约 ${forecast.horizon} 章`,
        `- 生成时间：${forecast.createdAt}`,
        "",
        "> 本文件是非正史规划材料，不会改动正文或权威状态。",
      ]
    : vi
      ? [
          `# So sánh suy diễn cốt truyện: ${forecast.divergence}`,
          "",
          `- ID suy diễn: ${forecast.forecastId}`,
          `- Sách: ${forecast.bookId}`,
          `- Chương gốc: chương ${forecast.baseChapter}`,
          `- Tầm suy diễn: khoảng ${forecast.horizon} chương`,
          `- Thời điểm tạo: ${forecast.createdAt}`,
          "",
          "> Tài liệu này là tư liệu lập kế hoạch không thuộc chính sử; nó không sửa văn xuôi hay trạng thái có thẩm quyền.",
        ]
      : [
          `# Narrative forecast comparison: ${forecast.divergence}`,
          "",
          `- Forecast id: ${forecast.forecastId}`,
          `- Book: ${forecast.bookId}`,
          `- Base chapter: ${forecast.baseChapter}`,
          `- Horizon: ~${forecast.horizon} chapters`,
          `- Created at: ${forecast.createdAt}`,
          "",
          "> Non-canonical planning material. Nothing here modifies prose or authoritative state.",
        ];

  const tableHeader = zh
    ? ["| 分支 | 标题 | 意图匹配 | 风险数 | 前提 |", "| --- | --- | --- | --- | --- |"]
    : vi
      ? ["| Nhánh | Tiêu đề | Độ khớp ý định | Số rủi ro | Tiền đề |", "| --- | --- | --- | --- | --- |"]
      : ["| Branch | Title | Intent fit | Risks | Premise |", "| --- | --- | --- | --- | --- |"];
  const tableRows = forecast.branches.map((branch) =>
    `| ${branch.branchId} | ${escapeCell(branch.title)} | ${branch.intentAlignment.score} | ${branch.risks.length} | ${escapeCell(branch.premise)} |`);

  const sections = forecast.branches.map((branch) => renderBranchSection(branch, zh, vi));

  return [...header, "", ...tableHeader, ...tableRows, "", sections.join("\n\n")].join("\n");
}

export function renderSelectedBranchPlanMarkdown(input: {
  readonly forecast: NarrativeForecast;
  readonly branch: ForecastBranch;
  readonly selectedAt: string;
  readonly stale: boolean;
}): string {
  const { forecast, branch } = input;
  const vi = forecast.language === "vi";
  const zh = !vi && forecast.language === "zh";

  const staleWarning = input.stale
    ? (zh
        ? "> ⚠️ 该推演已过期：正史章节或状态在推演生成后发生了变化。以下计划基于旧上下文，采用前请重新核对，必要时重新生成推演。"
        : vi
          ? "> ⚠️ Bản suy diễn này đã lỗi thời: chương hoặc trạng thái chính sử đã thay đổi sau khi bản suy diễn được tạo. Kế hoạch dưới đây dựa trên ngữ cảnh cũ — hãy đối chiếu lại trước khi áp dụng và tạo lại bản suy diễn nếu cần."
          : "> ⚠️ This forecast is stale: canonical chapters or state changed after it was generated. The plan below is based on outdated context — re-check before applying, and regenerate if needed.")
    : "";

  const header = zh
    ? [
        `# 已选分支计划：${branch.title}`,
        "",
        `- 推演 ID：${forecast.forecastId}`,
        `- 分支：${branch.branchId}`,
        `- 分歧点：${forecast.divergence}`,
        `- 基准章节：第 ${forecast.baseChapter} 章`,
        `- 选择时间：${input.selectedAt}`,
      ]
    : vi
      ? [
          `# Kế hoạch nhánh đã chọn: ${branch.title}`,
          "",
          `- ID suy diễn: ${forecast.forecastId}`,
          `- Nhánh: ${branch.branchId}`,
          `- Điểm phân kỳ: ${forecast.divergence}`,
          `- Chương gốc: chương ${forecast.baseChapter}`,
          `- Thời điểm chọn: ${input.selectedAt}`,
        ]
      : [
          `# Selected branch plan: ${branch.title}`,
          "",
          `- Forecast id: ${forecast.forecastId}`,
          `- Branch: ${branch.branchId}`,
          `- Divergence: ${forecast.divergence}`,
          `- Base chapter: ${forecast.baseChapter}`,
          `- Selected at: ${input.selectedAt}`,
        ];

  const footer = zh
    ? "> 本计划不修改正史。要把它应用到大纲、章节意图或权威状态，需要另行确认的操作（v1 不自动执行）。"
    : vi
      ? "> Kế hoạch này không sửa chính sử. Việc áp dụng nó vào dàn bài, ý định chương hoặc trạng thái có thẩm quyền là thao tác riêng, cần xác nhận rõ ràng (không tự động thực hiện ở v1)."
      : "> This plan does not modify canon. Applying it to the outline, chapter intents, or authoritative state is a separate, explicitly confirmed operation (not automated in v1).";

  return [
    ...header,
    ...(staleWarning ? ["", staleWarning] : []),
    "",
    renderBranchSection(branch, zh, vi, { headingLevel: 2, includeBranchId: false }),
    "",
    footer,
  ].join("\n");
}
function renderBranchSection(
  branch: ForecastBranch,
  zh: boolean,
  vi: boolean,
  options: { readonly headingLevel?: number; readonly includeBranchId?: boolean } = {},
): string {
  const level = "#".repeat(options.headingLevel ?? 2);
  const sub = `${level}#`;
  const heading = options.includeBranchId === false || !zh
    ? `${level} ${branch.title}`
    : `${level} ${branch.branchId}：${branch.title}`;

  const labels = zh
    ? {
        premise: "前提与假设",
        beats: "未来章节节拍",
        decisions: "人物决策",
        changes: "预计变化",
        characters: "人物",
        relationships: "关系",
        world: "世界",
        hooks: "伏笔",
        risks: "一致性风险",
        uncertainties: "不确定性",
        alignment: "作者意图匹配度",
        chapterPrefix: (n: number) => `第 ${n} 章`,
        none: "（无）",
      }
    : vi
      ? {
          premise: "Tiền đề và giả định",
          beats: "Nhịp các chương tương lai",
          decisions: "Quyết định nhân vật",
          changes: "Thay đổi dự kiến",
          characters: "Nhân vật",
          relationships: "Quan hệ",
          world: "Thế giới",
          hooks: "Câu móc",
          risks: "Rủi ro nhất quán",
          uncertainties: "Yếu tố bất định",
          alignment: "Độ khớp với ý định tác giả",
          chapterPrefix: (n: number) => `Chương ${n}`,
          none: "(không có)",
        }
      : {
          premise: "Premise and assumptions",
          beats: "Future chapter beats",
          decisions: "Character decisions",
          changes: "Projected changes",
          characters: "Characters",
          relationships: "Relationships",
          world: "World",
          hooks: "Hooks",
          risks: "Consistency risks",
          uncertainties: "Uncertainties",
          alignment: "Author intent alignment",
          chapterPrefix: (n: number) => `Chapter ${n}`,
          none: "(none)",
        };

  const sep = zh ? "：" : vi ? ": " : ": ";
  const joinSep = zh ? "；" : vi ? "; " : "; ";

  const list = (items: ReadonlyArray<string>): string =>
    items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : labels.none;

  return [
    heading,
    "",
    `${sub} ${labels.premise}`,
    "",
    branch.premise,
    "",
    `${sub} ${labels.beats}`,
    "",
    list(branch.beats.map((beat) => `${labels.chapterPrefix(beat.chapter)}${sep}${beat.summary}`)),
    "",
    `${sub} ${labels.decisions}`,
    "",
    list(branch.characterDecisions.map((decision) => `${decision.character}${sep}${decision.decision}`)),
    "",
    `${sub} ${labels.changes}`,
    "",
    `- ${labels.characters}${sep}${joinOrNone(branch.projectedChanges.characters, labels.none, joinSep)}`,
    `- ${labels.relationships}${sep}${joinOrNone(branch.projectedChanges.relationships, labels.none, joinSep)}`,
    `- ${labels.world}${sep}${joinOrNone(branch.projectedChanges.world, labels.none, joinSep)}`,
    `- ${labels.hooks}${sep}${joinOrNone(branch.projectedChanges.hooks, labels.none, joinSep)}`,
    "",
    `${sub} ${labels.risks}`,
    "",
    list(branch.risks.map((risk) => `[${risk.kind}] ${risk.description}`)),
    "",
    `${sub} ${labels.uncertainties}`,
    "",
    list([...branch.uncertainties]),
    "",
    `${sub} ${labels.alignment}`,
    "",
    `${branch.intentAlignment.score}/100 — ${branch.intentAlignment.rationale}`,
  ].join("\n");
}

function joinOrNone(items: ReadonlyArray<string>, none: string, sep: string = "；"): string {
  return items.length > 0 ? items.join(sep) : none;
}


function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
