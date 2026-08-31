import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFillNodeTool,
  createReviseNodeTool,
  createDraftStructureTool,
  type FilmLLMDeps,
} from "../agent/film-authoring-tools.js";
import { saveStoryGraph } from "../interactive-film/graph-store.js";
import { StoryGraphSchema, StoryNodeSchema } from "../interactive-film/graph-schema.js";

const node = StoryNodeSchema.parse({
  id: "n1", type: "branch", title: "Choice", sceneDesc: "At the gate",
  dialogue: [{ speaker: "Mei", text: "The ledger cannot lie", emotion: "resolute" }],
  choices: [{ id: "a", text: "Go public", targetNodeId: "e" }],
});

const structureNodes = StoryGraphSchema.shape.nodes.parse([
  { id: "s", type: "start", choices: [{ id: "c", text: "go", targetNodeId: "e" }] },
  { id: "e", type: "ending", choices: [] },
]);

function filmDeps(overrides: Partial<FilmLLMDeps> = {}): FilmLLMDeps {
  return {
    submitNode: async (_system, _user, nodeId) => ({ ...node, id: nodeId }),
    submitStructure: async () => structureNodes,
    ...overrides,
  };
}

function expectVietnameseGraphContext(userPrompt: string): void {
  expect(userPrompt).toContain("# Phim tương tác: Hồ sơ mất tích");
  expect(userPrompt).toContain("Cốt lõi: Tìm hồ sơ");
  expect(userPrompt).toContain("Chủ đề: Niềm tin");
  expect(userPrompt).toContain("Thể loại: Trinh thám");
  expect(userPrompt).toContain("Quy tắc thế giới: Không phép thuật");
  expect(userPrompt).toContain("Thời lượng: 30 phút");
  expect(userPrompt).toContain("Biến: trust");
  expect(userPrompt).toContain("Các nút:");
  expect(userPrompt).toContain("n1[branch] Ngã rẽ");
  expect(userPrompt).toContain("Công khai→e");
  expect(userPrompt).toContain("Hồ sơ nhân vật:");
  expect(userPrompt).toContain("Mai (protagonist)");
  expect(userPrompt).toContain("Động lực: Tìm sự thật");
  expect(userPrompt).toContain("Giọng thoại: Dứt khoát / Trang trọng");
  expect(userPrompt).not.toContain("互动影游");
  expect(userPrompt).not.toContain("核心：");
  expect(userPrompt).not.toContain("角色档案：");
}

describe("film authoring LLM tools language switch", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "if-en-"));
    await mkdir(join(root, "interactive-films", "p"), { recursive: true });
    await saveStoryGraph(root, "p", StoryGraphSchema.parse({
      schemaVersion: 1,
      projectId: "p",
      title: "Hồ sơ mất tích",
      worldAnchor: {
        storyCore: "Tìm hồ sơ",
        theme: "Niềm tin",
        genre: "Trinh thám",
        worldRules: "Không phép thuật",
        durationMinutes: 30,
      },
      characters: [{
        id: "mai",
        name: "Mai",
        role: "protagonist",
        motivation: "Tìm sự thật",
        voiceProfile: {
          speakingRhythm: "Dứt khoát",
          vocabulary: "Trang trọng",
          sampleLines: ["Hồ sơ không biết nói dối."],
        },
      }],
      variables: [{ name: "trust", type: "counter", default: 0, desc: "Mức độ tin cậy" }],
      nodes: [
        {
          id: "n1",
          type: "branch",
          title: "Ngã rẽ",
          choices: [{ id: "public", text: "Công khai", targetNodeId: "e" }],
        },
        { id: "e", type: "ending", title: "Sự thật", choices: [] },
      ],
      endings: [],
    }));
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("fill_node with language en sends the English node system prompt and user prompt", async () => {
    let systemPrompt = "";
    let userPrompt = "";
    const tool = createFillNodeTool(root, "p", filmDeps({
      submitNode: async (system, user, nodeId) => {
        systemPrompt = system;
        userPrompt = user;
        return { ...node, id: nodeId };
      },
    }), "en");

    await tool.execute("call-1", { nodeId: "n1", instruction: "Write the decision scene" } as never);

    expect(systemPrompt).toContain("You are an interactive film scriptwriter");
    expect(systemPrompt).not.toContain("你是互动影游编剧");
    expect(userPrompt).toContain("Node id to fill: n1");
    expect(userPrompt).toContain("Instruction: Write the decision scene");
  });

  it("fill_node defaults to the Chinese system prompt when language is omitted", async () => {
    let systemPrompt = "";
    let userPrompt = "";
    const tool = createFillNodeTool(root, "p", filmDeps({
      submitNode: async (system, user, nodeId) => {
        systemPrompt = system;
        userPrompt = user;
        return { ...node, id: nodeId };
      },
    }));

    await tool.execute("call-2", { nodeId: "n1", instruction: "写抉择场景" } as never);

    expect(systemPrompt).toContain("你是互动影游编剧");
    expect(userPrompt).toContain("要填的节点 id：n1");
  });

  it("revise_node with language en sends the English node system prompt and user prompt", async () => {
    let systemPrompt = "";
    let userPrompt = "";
    const tool = createReviseNodeTool(root, "p", filmDeps({
      submitNode: async (system, user, nodeId) => {
        systemPrompt = system;
        userPrompt = user;
        return { ...node, id: nodeId };
      },
    }), "en");

    await tool.execute("call-3", { nodeId: "n1", instruction: "Tighten the dialogue" } as never);

    expect(systemPrompt).toContain("You are an interactive film scriptwriter");
    expect(userPrompt).toContain("Node id to revise: n1");
    expect(userPrompt).toContain("Revision instruction: Tighten the dialogue");
  });

  it("draft_structure with language en sends the English structure system prompt and user prompt", async () => {
    let systemPrompt = "";
    let userPrompt = "";
    const tool = createDraftStructureTool(root, "p", filmDeps({
      submitStructure: async (system, user) => {
        systemPrompt = system;
        userPrompt = user;
        return structureNodes;
      },
    }), "en");

    await tool.execute("call-4", { instruction: "Three acts" } as never);

    expect(systemPrompt).toContain("You are an interactive film scriptwriter");
    expect(systemPrompt).toContain("branching skeleton");
    expect(systemPrompt).not.toContain("你是互动影游编剧");
    expect(userPrompt).toContain("Skeleton instruction: Three acts");
  });

  it("draft_structure defaults to the Chinese structure system prompt when language is omitted", async () => {
    let systemPrompt = "";
    let userPrompt = "";
    const tool = createDraftStructureTool(root, "p", filmDeps({
      submitStructure: async (system, user) => {
        systemPrompt = system;
        userPrompt = user;
        return structureNodes;
      },
    }));

    await tool.execute("call-5", { instruction: "三幕" } as never);

    expect(systemPrompt).toContain("你是互动影游编剧");
    expect(userPrompt).toContain("骨架指令：三幕");
  });

  it("fill_node with language vi sends the Vietnamese node system prompt and user prompt", async () => {
    let systemPrompt = "";
    let userPrompt = "";
    const tool = createFillNodeTool(root, "p", filmDeps({
      submitNode: async (system, user, nodeId) => {
        systemPrompt = system;
        userPrompt = user;
        return { ...node, id: nodeId };
      },
    }), "vi");

    await tool.execute("call-6", { nodeId: "n1", instruction: "Viết cảnh quyết định" } as never);

    expect(systemPrompt).toContain("Bạn là biên kịch phim tương tác");
    expect(systemPrompt).toContain("submit_story_node");
    expect(systemPrompt).not.toContain("You are an interactive film scriptwriter");
    expect(systemPrompt).not.toContain("你是互动影游编剧");
    expect(userPrompt).toContain("Id nút cần viết: n1");
    expect(userPrompt).toContain("Chỉ dẫn: Viết cảnh quyết định");
    expectVietnameseGraphContext(userPrompt);
  });

  it("revise_node with language vi sends the Vietnamese node system prompt and user prompt", async () => {
    let systemPrompt = "";
    let userPrompt = "";
    const tool = createReviseNodeTool(root, "p", filmDeps({
      submitNode: async (system, user, nodeId) => {
        systemPrompt = system;
        userPrompt = user;
        return { ...node, id: nodeId };
      },
    }), "vi");

    await tool.execute("call-7", { nodeId: "n1", instruction: "Viết lại đoạn đối thoại" } as never);

    expect(systemPrompt).toContain("Bạn là biên kịch phim tương tác");
    expect(systemPrompt).not.toContain("你是互动影游编剧");
    expect(userPrompt).toContain("Id nút cần sửa: n1");
    expect(userPrompt).toContain("Chỉ dẫn sửa: Viết lại đoạn đối thoại");
    expectVietnameseGraphContext(userPrompt);
  });

  it("draft_structure with language vi sends the Vietnamese structure system prompt and user prompt", async () => {
    let systemPrompt = "";
    let userPrompt = "";
    const tool = createDraftStructureTool(root, "p", filmDeps({
      submitStructure: async (system, user) => {
        systemPrompt = system;
        userPrompt = user;
        return structureNodes;
      },
    }), "vi");

    await tool.execute("call-8", { instruction: "Ba hồi" } as never);

    expect(systemPrompt).toContain("Bạn là biên kịch phim tương tác");
    expect(systemPrompt).toContain("khung phân nhánh");
    expect(systemPrompt).toContain("submit_story_structure");
    expect(systemPrompt).not.toContain("你是互动影游编剧");
    expect(userPrompt).toContain("Chỉ dẫn khung: Ba hồi");
    expectVietnameseGraphContext(userPrompt);
  });
});
