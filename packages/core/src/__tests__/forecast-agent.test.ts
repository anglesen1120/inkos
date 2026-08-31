import { describe, expect, it, vi, afterEach } from "vitest";
import { NarrativeForecastAgent } from "../forecast/agent.js";
import { makeForecast, makeForecastBranch } from "./helpers/forecast-fixture.js";
import { parseForecastModelOutput } from "../forecast/schema.js";
import { renderForecastComparisonMarkdown, renderSelectedBranchPlanMarkdown } from "../forecast/render.js";
import type { LLMMessage, LLMResponse } from "../llm/provider.js";

function llmResponse(content: string): LLMResponse {
  return { content, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
}

function validModelJson(count: number): string {
  const branches = Array.from({ length: count }, (_, index) => {
    const { branchId: _branchId, ...rest } = makeForecastBranch({ title: `分支${index + 1}` });
    return rest;
  });
  return JSON.stringify({ branches });
}

function makeAgent(): NarrativeForecastAgent {
  return new NarrativeForecastAgent({
    client: { provider: "openai" } as never,
    model: "fake",
    projectRoot: "/tmp",
  });
}

function spyOnChat(responses: ReadonlyArray<string>) {
  const spy = vi.spyOn(
    NarrativeForecastAgent.prototype as unknown as { chat: (messages: ReadonlyArray<LLMMessage>) => Promise<LLMResponse> },
    "chat",
  );
  for (const content of responses) {
    spy.mockResolvedValueOnce(llmResponse(content));
  }
  return spy;
}

const INPUT = {
  contextMarkdown: "# 正史上下文",
  divergence: "主角是否接受提议",
  branchCount: 2,
  horizon: 5,
  baseChapter: 12,
  language: "zh" as const,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NarrativeForecastAgent", () => {
  it("returns validated branches from a valid first response", async () => {
    const spy = spyOnChat([validModelJson(2)]);

    const output = await makeAgent().generateBranches(INPUT);

    expect(output.branches).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);
    const [messages] = spy.mock.calls[0]!;
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.content).toContain("主角是否接受提议");
  });

  it("retries once with the validation error when the first response is invalid", async () => {
    const spy = spyOnChat(["这不是 JSON", validModelJson(2)]);

    const output = await makeAgent().generateBranches(INPUT);

    expect(output.branches).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
    const [retryMessages] = spy.mock.calls[1]!;
    expect(retryMessages.at(-2)?.role).toBe("assistant");
    expect(retryMessages.at(-1)?.content).toContain("not valid JSON");
  });

  it("throws after two invalid responses without further retries", async () => {
    const spy = spyOnChat(["垃圾输出一", "垃圾输出二"]);

    await expect(makeAgent().generateBranches(INPUT)).rejects.toThrow(/not valid JSON/);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("treats a branch count mismatch as invalid output", async () => {
    const spy = spyOnChat([validModelJson(3), validModelJson(2)]);

    const output = await makeAgent().generateBranches(INPUT);

    expect(output.branches).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
    const [retryMessages] = spy.mock.calls[1]!;
    expect(retryMessages.at(-1)?.content).toContain("2");
  });
});

describe("NarrativeForecastAgent Vietnamese prompts", () => {
  it("sends the Vietnamese system and user prompts when language is vi", async () => {
    const spy = spyOnChat([validModelJson(2)]);

    const output = await makeAgent().generateBranches({
      ...INPUT,
      divergence: "Nhân vật chính có chấp nhận lời đề nghị hay không",
      language: "vi",
    });

    expect(output.branches).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);
    const [messages] = spy.mock.calls[0]!;
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("trợ lý suy diễn cốt truyện");
    expect(messages[0]?.content).toContain("chính sử");
    expect(messages[0]?.content).not.toContain("你是长篇小说的叙事推演助手");
    expect(messages[0]?.content).not.toContain("narrative forecast assistant");
    expect(messages[1]?.content).toContain("## Điểm phân kỳ");
    expect(messages[1]?.content).toContain("Nhân vật chính có chấp nhận lời đề nghị hay không");
    expect(messages[1]?.content).toContain('"risks"');
    expect(messages[1]?.content).toContain("continuity|causality|character");
  });

  it("uses the Vietnamese repair prompt with the unchanged validation error text for vi", async () => {
    const spy = spyOnChat(["Đây không phải JSON", validModelJson(2)]);

    const output = await makeAgent().generateBranches({
      ...INPUT,
      language: "vi",
    });

    expect(output.branches).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
    const [retryMessages] = spy.mock.calls[1]!;
    expect(retryMessages.at(-1)?.content).toContain("chưa vượt qua kiểm tra");
    expect(retryMessages.at(-1)?.content).toContain("narrative forecast model output is not valid JSON");
  });

  it("keeps the raw validation error text verbatim inside the Vietnamese repair prompt", async () => {
    const spy = spyOnChat(["không phải JSON", validModelJson(2)]);
    const rawError = "narrative forecast model output is not valid JSON: Unexpected token";
    const parseSpy = vi.spyOn(await import("../forecast/schema.js"), "parseForecastModelOutput")
      .mockImplementationOnce(() => {
        throw new Error(rawError);
      })
      .mockImplementationOnce((raw) => parseForecastModelOutput(raw));

    const output = await makeAgent().generateBranches({ ...INPUT, language: "vi" });

    expect(output.branches).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
    const [retryMessages] = spy.mock.calls[1]!;
    const repair = retryMessages.at(-1)?.content ?? "";
    expect(repair).toContain("chưa vượt qua kiểm tra");
    expect(repair).toContain(rawError);
  });
  it("renders the comparison document in Vietnamese prose without leaking zh/en labels", () => {
    const markdown = renderForecastComparisonMarkdown(makeForecast({ language: "vi" }));

    expect(markdown).toContain("# So sánh suy diễn cốt truyện");
    expect(markdown).toContain("| Nhánh | Tiêu đề");
    expect(markdown).toContain("## Tiền đề và giả định");
    expect(markdown).toContain("Chương 13");
    expect(markdown).not.toContain("叙事推演对比");
    expect(markdown).not.toContain("Narrative forecast comparison");
  });

  it("renders the selected branch plan in Vietnamese including the stale warning", () => {
    const markdown = renderSelectedBranchPlanMarkdown({
      forecast: makeForecast({ language: "vi" }),
      branch: makeForecastBranch({ branchId: "branch-1" }),
      selectedAt: "2026-01-02T00:00:00.000Z",
      stale: true,
    });

    expect(markdown).toContain("# Kế hoạch nhánh đã chọn");
    expect(markdown).toContain("> ⚠️ Bản suy diễn này đã lỗi thời");
    expect(markdown).toContain("## Tiền đề và giả định");
    expect(markdown).toContain("không tự động thực hiện ở v1");
    expect(markdown).not.toContain("该推演已过期");
    expect(markdown).not.toContain("This forecast is stale");
  });
});
