import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { applyGraphDelta } from "../interactive-film/authoring-store.js";
import type { LLMClient } from "../llm/provider.js";
import { runWorkerAgentTool } from "./worker-agent.js";
import { loadStoryGraph } from "../interactive-film/graph-store.js";
import {
  buildWorldAnchorDelta,
  buildAddVariableDelta,
  buildDefineEndingDelta,
  buildUpsertCharactersDelta,
  buildConnectChoiceDelta,
  buildRemoveNodeDelta,
} from "../interactive-film/authoring-tools.js";
import { StoryNodeSchema, type StoryGraph, type StoryNode } from "../interactive-film/graph-schema.js";
import { StoryNodeContentToolSchema, StoryStructureToolSchema } from "../interactive-film/tool-schemas.js";
import { writeCharacterFacts } from "../interactive-film/memory-link.js";
import { MemoryDB } from "../state/memory-db.js";
import { join } from "node:path";
import { generateNodeImage, defaultNodeImageDeps, type NodeImageDeps } from "../interactive-film/node-image.js";
import { appendPromptPackGuidance } from "../prompts/prompt-pack.js";
import { appendActivatedSkillGuidance } from "../agents/base.js";
import type { ActivatedSkillGuidance } from "./skill-tool.js";

// ---------------------------------------------------------------------------
// Local helper — textResult is not exported from agent-tools.ts
// ---------------------------------------------------------------------------

function textResult(text: string): AgentToolResult<undefined>;
function textResult<T>(text: string, details: T): AgentToolResult<T>;
function textResult<T = undefined>(text: string, details?: T): AgentToolResult<T> {
  return { content: [{ type: "text", text }], details: details as T };
}

// ---------------------------------------------------------------------------
// set_world_anchor
// ---------------------------------------------------------------------------

const WorldAnchorParams = Type.Object({
  storyCore: Type.Optional(Type.String({ description: "one-sentence story core" })),
  theme: Type.Optional(Type.String({ description: "theme of the story" })),
  genre: Type.Optional(Type.String({ description: "genre, free text (e.g. suspense, romance)" })),
  worldRules: Type.Optional(Type.String({ description: "world rules that constrain the plot" })),
  durationMinutes: Type.Optional(Type.Number({ description: "target playthrough duration in minutes" })),
});

export function createSetWorldAnchorTool(projectRoot: string, projectId: string): AgentTool<typeof WorldAnchorParams> {
  return {
    name: "set_world_anchor",
    description: "interactive-film authoring: set/update the world anchor (story core, theme, rules, duration). Applies immediately.",
    label: "Set World Anchor",
    parameters: WorldAnchorParams,
    async execute(_id, params: Static<typeof WorldAnchorParams>) {
      const { graph, rev } = await applyGraphDelta({ projectRoot, projectId, delta: buildWorldAnchorDelta(params), phase: "world" });
      return textResult(`World anchor updated (rev ${rev}). core=${graph.worldAnchor?.storyCore ?? ""}`, { kind: "graph_updated", rev });
    },
  };
}

// ---------------------------------------------------------------------------
// add_variable
// ---------------------------------------------------------------------------

const AddVariableParams = Type.Object({
  name: Type.String({ description: "variable name (unique key)" }),
  type: Type.Union([Type.Literal("flag"), Type.Literal("counter"), Type.Literal("relationship"), Type.Literal("item")]),
  default: Type.Union([Type.Number(), Type.String(), Type.Boolean()], { description: "default value" }),
  desc: Type.Optional(Type.String({ description: "what it tracks" })),
});

export function createAddVariableTool(projectRoot: string, projectId: string): AgentTool<typeof AddVariableParams> {
  return {
    name: "add_variable",
    description: "interactive-film authoring: add/update a variable. Applies immediately.",
    label: "Add Variable",
    parameters: AddVariableParams,
    async execute(_id, params: Static<typeof AddVariableParams>) {
      const { rev } = await applyGraphDelta({
        projectRoot,
        projectId,
        delta: buildAddVariableDelta({ name: params.name, type: params.type, default: params.default, desc: params.desc ?? "" }),
      });
      return textResult(`Variable "${params.name}" added (rev ${rev}).`, { kind: "graph_updated", rev });
    },
  };
}

// ---------------------------------------------------------------------------
// define_ending
// ---------------------------------------------------------------------------

const DefineEndingParams = Type.Object({
  id: Type.String({ description: "ending id" }),
  nodeId: Type.String({ description: "the ending node this describes (must exist)" }),
  title: Type.String(),
  type: Type.Union([Type.Literal("good"), Type.Literal("bad"), Type.Literal("neutral"), Type.Literal("secret")]),
  description: Type.Optional(Type.String()),
});

export function createDefineEndingTool(projectRoot: string, projectId: string): AgentTool<typeof DefineEndingParams> {
  return {
    name: "define_ending",
    description: "interactive-film authoring: define/update an ending (its nodeId must exist). Applies immediately.",
    label: "Define Ending",
    parameters: DefineEndingParams,
    async execute(_id, params: Static<typeof DefineEndingParams>) {
      const { rev } = await applyGraphDelta({
        projectRoot,
        projectId,
        delta: buildDefineEndingDelta({ id: params.id, nodeId: params.nodeId, title: params.title, type: params.type, description: params.description ?? "" }),
      });
      return textResult(`Ending "${params.title}" defined (rev ${rev}).`, { kind: "graph_updated", rev });
    },
  };
}

// ---------------------------------------------------------------------------
// upsert_characters
// ---------------------------------------------------------------------------

const UpsertCharactersParams = Type.Object({
  characters: Type.Array(Type.Object({
    id: Type.String(),
    name: Type.String(),
    role: Type.Optional(Type.Union([Type.Literal("protagonist"), Type.Literal("antagonist"), Type.Literal("support"), Type.Literal("other")])),
    motivation: Type.Optional(Type.String()),
    voiceProfile: Type.Optional(Type.Object({
      speakingRhythm: Type.Optional(Type.String()),
      vocabulary: Type.Optional(Type.String()),
      sampleLines: Type.Optional(Type.Array(Type.String())),
    })),
  })),
});

export function createUpsertCharactersTool(projectRoot: string, projectId: string): AgentTool<typeof UpsertCharactersParams> {
  return {
    name: "upsert_characters",
    description: "interactive-film authoring: add/update characters with voice profiles. Applies immediately and records them to memory for cross-node voice consistency.",
    label: "Upsert Characters",
    parameters: UpsertCharactersParams,
    async execute(_id, params: Static<typeof UpsertCharactersParams>) {
      const chars = params.characters.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role ?? "other" as const,
        motivation: c.motivation ?? "",
        voiceProfile: c.voiceProfile
          ? {
              speakingRhythm: c.voiceProfile.speakingRhythm ?? "",
              vocabulary: c.voiceProfile.vocabulary ?? "",
              sampleLines: c.voiceProfile.sampleLines ?? [],
            }
          : undefined,
      }));
      const { rev } = await applyGraphDelta({ projectRoot, projectId, delta: buildUpsertCharactersDelta(chars) });
      const db = new MemoryDB(join(projectRoot, "interactive-films", projectId));
      try {
        writeCharacterFacts(db, chars, rev);
      } finally {
        db.close();
      }
      return textResult(`Upserted ${chars.length} character(s) (rev ${rev}).`, { kind: "graph_updated", rev });
    },
  };
}

// ---------------------------------------------------------------------------
// LLM-backed fill_node / revise_node
// ---------------------------------------------------------------------------

export interface FilmLLMDeps {
  readonly submitNode: (
    system: string,
    user: string,
    nodeId: string,
    signal?: AbortSignal,
  ) => Promise<StoryNode>;
  readonly submitStructure: (
    system: string,
    user: string,
    signal?: AbortSignal,
  ) => Promise<ReadonlyArray<StoryNode>>;
  readonly skillIds?: () => ReadonlyArray<string>;
}

function defaultSubmitNode(
  client: LLMClient,
  model: string,
  activatedSkills?: () => ReadonlyArray<ActivatedSkillGuidance>,
): FilmLLMDeps["submitNode"] {
  return async (system, user, nodeId, signal) => {
    const submitted = await runWorkerAgentTool(client, model, appendActivatedSkillGuidance([
      { role: "system", content: system },
      { role: "user", content: user },
    ], activatedSkills?.()), {
      name: "submit_story_node",
      label: "Submit Story Node",
      description: "Submit the complete scene, dialogue, choices, and image direction for the requested node. The host owns the node id.",
      parameters: StoryNodeContentToolSchema,
    }, { temperature: 0.6, maxTokens: 4000, signal });
    return StoryNodeSchema.parse({ ...submitted, id: nodeId });
  };
}

function defaultSubmitStructure(
  client: LLMClient,
  model: string,
  activatedSkills?: () => ReadonlyArray<ActivatedSkillGuidance>,
): FilmLLMDeps["submitStructure"] {
  return async (system, user, signal) => {
    const submitted = await runWorkerAgentTool(client, model, appendActivatedSkillGuidance([
      { role: "system", content: system },
      { role: "user", content: user },
    ], activatedSkills?.()), {
      name: "submit_story_structure",
      label: "Submit Story Structure",
      description: "Submit the complete branching node skeleton. Node ids and choice targets must form one connected playable graph.",
      parameters: StoryStructureToolSchema,
    }, { temperature: 0.6, maxTokens: 6000, signal });
    return submitted.nodes.map((node) => StoryNodeSchema.parse(node));
  };
}

const FillNodeParams = Type.Object({
  nodeId: Type.String({ description: "the node to fill/rewrite" }),
  instruction: Type.String({ description: "what this scene should contain (beats, who speaks, choices)" }),
});

export type FilmAuthoringLanguage = "zh" | "en" | "vi";

const NODE_SYSTEM_ZH = `你是互动影游编剧。根据当前图上下文和指令，写出指定节点的完整场景、对白、选项和配图方向。choices[].targetNodeId 必须指向已存在的节点 id。完成后调用 submit_story_node。`;
const NODE_SYSTEM_EN = `You are an interactive film scriptwriter. Using the current graph context and the instruction, write the requested node's complete scene, dialogue, choices, and image direction. Every choices[].targetNodeId must point to an existing node id. Finish by calling submit_story_node.`;

const NODE_SYSTEM_VI = `Bạn là biên kịch phim tương tác. Dựa trên ngữ cảnh đồ thị hiện tại và chỉ dẫn, hãy viết đầy đủ cảnh, đối thoại, lựa chọn và định hướng hình ảnh cho nút được yêu cầu. Mọi choices[].targetNodeId phải trỏ tới một id nút đã tồn tại. Khi hoàn thành, hãy gọi submit_story_node.`;

function nodeSystemPrompt(language: FilmAuthoringLanguage): string {
  if (language === "en") return NODE_SYSTEM_EN;
  if (language === "vi") return NODE_SYSTEM_VI;
  return NODE_SYSTEM_ZH;
}

interface FilmContextLabels {
  readonly film: string;
  readonly core: string;
  readonly theme: string;
  readonly genre: string;
  readonly rules: string;
  readonly duration: string;
  readonly minutes: string;
  readonly variables: string;
  readonly nodes: string;
  readonly characters: string;
  readonly motivation: string;
  readonly voice: string;
}

const FILM_CONTEXT_LABELS: Record<FilmAuthoringLanguage, FilmContextLabels> = {
  zh: {
    film: "互动影游",
    core: "核心",
    theme: "主题",
    genre: "题材",
    rules: "规则",
    duration: "时长",
    minutes: "分",
    variables: "变量",
    nodes: "节点",
    characters: "角色档案",
    motivation: "动机",
    voice: "口吻",
  },
  en: {
    film: "Interactive film",
    core: "Core",
    theme: "Theme",
    genre: "Genre",
    rules: "World rules",
    duration: "Duration",
    minutes: "minutes",
    variables: "Variables",
    nodes: "Nodes",
    characters: "Character profiles",
    motivation: "Motivation",
    voice: "Voice",
  },
  vi: {
    film: "Phim tương tác",
    core: "Cốt lõi",
    theme: "Chủ đề",
    genre: "Thể loại",
    rules: "Quy tắc thế giới",
    duration: "Thời lượng",
    minutes: "phút",
    variables: "Biến",
    nodes: "Các nút",
    characters: "Hồ sơ nhân vật",
    motivation: "Động lực",
    voice: "Giọng thoại",
  },
};

function buildLocalizedFilmAuthoringContext(graph: StoryGraph, language: FilmAuthoringLanguage): string {
  const labels = FILM_CONTEXT_LABELS[language];
  const lines: string[] = [`# ${labels.film}: ${graph.title || graph.projectId}`];
  if (graph.worldAnchor) {
    const anchor = graph.worldAnchor;
    lines.push(
      `${labels.core}: ${anchor.storyCore} / ${labels.theme}: ${anchor.theme} / ${labels.genre}: ${anchor.genre} / `
      + `${labels.rules}: ${anchor.worldRules} / ${labels.duration}: ${anchor.durationMinutes} ${labels.minutes}`,
    );
  }
  if (graph.variables.length > 0) {
    lines.push(`${labels.variables}: ${graph.variables.map((variable) => variable.name).join(", ")}`);
  }
  lines.push(`${labels.nodes}:`);
  for (const node of graph.nodes) {
    const edges = node.choices.map((choice) => `${choice.text}→${choice.targetNodeId}`).join(", ");
    lines.push(`- ${node.id}[${node.type}] ${node.title}${edges ? ` -> ${edges}` : ""}`);
  }
  if (graph.characters.length === 0) return lines.join("\n");

  const characters = graph.characters.map((character) => {
    const profile = character.voiceProfile;
    const voice = profile ? [profile.speakingRhythm, profile.vocabulary].filter(Boolean).join(" / ") : "";
    return `- ${character.name} (${character.role}) ${labels.motivation}: ${character.motivation}`
      + (voice ? ` ${labels.voice}: ${voice}` : "");
  });
  return [lines.join("\n"), [`${labels.characters}:`, ...characters].join("\n")].join("\n\n");
}

function graphUpdatedDetails(rev: number, promptId: string, extra: Record<string, unknown> = {}) {
  return {
    kind: "graph_updated" as const,
    rev,
    promptPacks: [promptId],
    ...extra,
  };
}

export function createFillNodeTool(
  projectRoot: string,
  projectId: string,
  deps: FilmLLMDeps,
  language: FilmAuthoringLanguage = "zh",
): AgentTool<typeof FillNodeParams> {
  return {
    name: "fill_node",
    description: "interactive-film authoring: write/rewrite one node's scene, dialogue and choices via the model. Applies immediately.",
    label: "Fill Node",
    parameters: FillNodeParams,
    async execute(_id, params: Static<typeof FillNodeParams>, signal) {
      const graph = await loadStoryGraph(projectRoot, projectId);
      const context = graph ? buildLocalizedFilmAuthoringContext(graph, language) : "(empty graph)";
      const systemPrompt = await appendPromptPackGuidance(nodeSystemPrompt(language), {
        promptId: "interactive-film.script",
        projectRoot,
      });
      const userPrompt = language === "en"
        ? `${context}\n\nNode id to fill: ${params.nodeId}\nInstruction: ${params.instruction}`
        : language === "vi"
          ? `${context}\n\nId nút cần viết: ${params.nodeId}\nChỉ dẫn: ${params.instruction}`
          : `${context}\n\n要填的节点 id：${params.nodeId}\n指令：${params.instruction}`;
      const node = await deps.submitNode(systemPrompt, userPrompt, params.nodeId, signal);
      const { rev } = await applyGraphDelta({
        projectRoot,
        projectId,
        delta: { nodes: { upsert: [node], remove: [] }, notes: [] },
        phase: "workshop",
      });
      return textResult(`Node ${params.nodeId} filled (rev ${rev}).`, graphUpdatedDetails(rev, "interactive-film.script", {
        skillIds: deps.skillIds?.() ?? [],
      }));
    },
  };
}

export function createReviseNodeTool(
  projectRoot: string,
  projectId: string,
  deps: FilmLLMDeps,
  language: FilmAuthoringLanguage = "zh",
): AgentTool<typeof FillNodeParams> {
  return {
    name: "revise_node",
    description: "interactive-film authoring: revise one existing node per instruction. Applies immediately.",
    label: "Revise Node",
    parameters: FillNodeParams,
    async execute(_id, params: Static<typeof FillNodeParams>, signal) {
      const graph = await loadStoryGraph(projectRoot, projectId);
      const context = graph ? buildLocalizedFilmAuthoringContext(graph, language) : "(empty graph)";
      const current = graph?.nodes.find((n) => n.id === params.nodeId);
      const systemPrompt = await appendPromptPackGuidance(nodeSystemPrompt(language), {
        promptId: "interactive-film.script",
        projectRoot,
      });
      const userPrompt = language === "en"
        ? `${context}\n\nNode id to revise: ${params.nodeId}\nCurrent content: ${JSON.stringify(current ?? {})}\nRevision instruction: ${params.instruction}`
        : language === "vi"
          ? `${context}\n\nId nút cần sửa: ${params.nodeId}\nNội dung hiện tại: ${JSON.stringify(current ?? {})}\nChỉ dẫn sửa: ${params.instruction}`
          : `${context}\n\n要修改的节点 id：${params.nodeId}\n现有内容：${JSON.stringify(current ?? {})}\n修改指令：${params.instruction}`;
      const node = await deps.submitNode(systemPrompt, userPrompt, params.nodeId, signal);
      const { rev } = await applyGraphDelta({
        projectRoot,
        projectId,
        delta: { nodes: { upsert: [node], remove: [] }, notes: [] },
        phase: "workshop",
      });
      return textResult(`Node ${params.nodeId} revised (rev ${rev}).`, graphUpdatedDetails(rev, "interactive-film.script", {
        skillIds: deps.skillIds?.() ?? [],
      }));
    },
  };
}

export function filmLLMDepsFromClient(
  client: LLMClient,
  model: string,
  options: { readonly activatedSkills?: () => ReadonlyArray<ActivatedSkillGuidance> } = {},
): FilmLLMDeps {
  return {
    submitNode: defaultSubmitNode(client, model, options.activatedSkills),
    submitStructure: defaultSubmitStructure(client, model, options.activatedSkills),
    skillIds: () => (options.activatedSkills?.() ?? []).map((activation) => activation.skill.id),
  };
}

// ---------------------------------------------------------------------------
// draft_structure — confirm-class: structured worker result → apply
// ---------------------------------------------------------------------------

const DraftStructureParams = Type.Object({
  instruction: Type.String({ description: "what skeleton to draft (acts, branch points, endings)" }),
});
const STRUCT_SYSTEM_ZH = `你是互动影游编剧。根据上下文与指令设计分支骨架。恰好 1 个 type=start，至少 2 个 branch，至少 2 个差异化 ending 节点；每条路径都能到某个 ending。完成后调用 submit_story_structure。`;
const STRUCT_SYSTEM_EN = `You are an interactive film scriptwriter. Using the context and the instruction, design the branching skeleton. Include exactly 1 node with type=start, at least 2 branch nodes, and at least 2 clearly differentiated ending nodes; every path must reach an ending. Finish by calling submit_story_structure.`;

const STRUCT_SYSTEM_VI = `Bạn là biên kịch phim tương tác. Dựa trên ngữ cảnh và chỉ dẫn, hãy thiết kế khung phân nhánh. Gồm đúng 1 nút type=start, ít nhất 2 nút branch và ít nhất 2 nút ending khác biệt rõ ràng; mọi đường đi đều phải tới được một ending. Khi hoàn thành, hãy gọi submit_story_structure.`;

function structureSystemPrompt(language: FilmAuthoringLanguage): string {
  if (language === "en") return STRUCT_SYSTEM_EN;
  if (language === "vi") return STRUCT_SYSTEM_VI;
  return STRUCT_SYSTEM_ZH;
}
export function createDraftStructureTool(
  projectRoot: string,
  projectId: string,
  deps: FilmLLMDeps,
  language: FilmAuthoringLanguage = "zh",
): AgentTool<typeof DraftStructureParams> {
  return {
    name: "draft_structure",
    description: "interactive-film authoring: draft the branching node skeleton + topology. Structural — requires user confirmation.",
    label: "Draft Structure",
    parameters: DraftStructureParams,
    async execute(_id, params: Static<typeof DraftStructureParams>, signal) {
      const graph = await loadStoryGraph(projectRoot, projectId);
      const context = graph ? buildLocalizedFilmAuthoringContext(graph, language) : "(empty graph)";
      const systemPrompt = await appendPromptPackGuidance(structureSystemPrompt(language), {
        promptId: "interactive-film.story-graph",
        projectRoot,
      });
      const userPrompt = language === "en"
        ? `${context}\n\nSkeleton instruction: ${params.instruction}`
        : language === "vi"
          ? `${context}\n\nChỉ dẫn khung: ${params.instruction}`
          : `${context}\n\n骨架指令：${params.instruction}`;
      const nodes = await deps.submitStructure(systemPrompt, userPrompt, signal);
      const { graph: next, rev } = await applyGraphDelta({
        projectRoot,
        projectId,
        delta: { nodes: { upsert: [...nodes], remove: [] }, notes: [] },
        phase: "structure",
      });
      return textResult(`Structure drafted: ${next.nodes.length} nodes (rev ${rev}).`, graphUpdatedDetails(rev, "interactive-film.story-graph", {
        skillIds: deps.skillIds?.() ?? [],
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// connect_choice — confirm-class: full StoryNode → buildConnectChoiceDelta → apply
// ---------------------------------------------------------------------------

const ConnectChoiceParams = Type.Object({
  node: Type.Unsafe<unknown>({ description: "the full StoryNode (with updated choices) to upsert" }),
});

export function createConnectChoiceTool(
  projectRoot: string,
  projectId: string,
): AgentTool<typeof ConnectChoiceParams> {
  return {
    name: "connect_choice",
    description: "interactive-film authoring: add/rewire a node's choices (topology). Structural — requires user confirmation.",
    label: "Connect Choice",
    parameters: ConnectChoiceParams,
    async execute(_id, params: Static<typeof ConnectChoiceParams>) {
      const node = StoryNodeSchema.parse(params.node);
      const { rev } = await applyGraphDelta({ projectRoot, projectId, delta: buildConnectChoiceDelta(node) });
      return textResult(`Choices updated on node ${node.id} (rev ${rev}).`, { kind: "graph_updated", rev });
    },
  };
}

// ---------------------------------------------------------------------------
// remove_node — confirm-class: nodeId → buildRemoveNodeDelta → apply
// ---------------------------------------------------------------------------

const RemoveNodeParams = Type.Object({
  nodeId: Type.String({ description: "node id to remove" }),
});

export function createRemoveNodeTool(
  projectRoot: string,
  projectId: string,
): AgentTool<typeof RemoveNodeParams> {
  return {
    name: "remove_node",
    description: "interactive-film authoring: delete a node. Destructive — requires user confirmation.",
    label: "Remove Node",
    parameters: RemoveNodeParams,
    async execute(_id, params: Static<typeof RemoveNodeParams>) {
      const { rev } = await applyGraphDelta({ projectRoot, projectId, delta: buildRemoveNodeDelta(params.nodeId) });
      return textResult(`Node ${params.nodeId} removed (rev ${rev}).`, { kind: "graph_updated", rev });
    },
  };
}

// ---------------------------------------------------------------------------
// generate_node_image
// ---------------------------------------------------------------------------

const GenerateNodeImageParams = Type.Object({
  nodeId: Type.String({ description: "the node to generate a shot image for (uses its imageSlot.prompt or sceneDesc)" }),
  size: Type.Optional(Type.Union([
    Type.Literal("1536x1024"),
    Type.Literal("1024x1536"),
    Type.Literal("1024x1024"),
  ], { description: "output image size; use 1536x1024 for landscape film frames, 1024x1536 for portrait, or 1024x1024 for square" })),
});

export function createGenerateNodeImageTool(projectRoot: string, projectId: string, deps?: NodeImageDeps): AgentTool<typeof GenerateNodeImageParams> {
  return {
    name: "generate_node_image",
    description: "interactive-film authoring: generate a shot image for a node (from its imageSlot.prompt or sceneDesc) and attach it. Applies immediately.",
    label: "Generate Node Image",
    parameters: GenerateNodeImageParams,
    async execute(_id, params: Static<typeof GenerateNodeImageParams>) {
      const graph = await loadStoryGraph(projectRoot, projectId);
      if (!graph) throw new Error(`interactive-film project ${projectId} has no story graph`);
      const node = graph.nodes.find((n) => n.id === params.nodeId);
      if (!node) throw new Error(`node ${params.nodeId} not found`);
      const imageDeps = deps ?? (await defaultNodeImageDeps(projectRoot));
      const { assetRef, delta } = await generateNodeImage({
        projectRoot,
        projectId,
        node,
        size: params.size,
        deps: imageDeps,
      });
      const { rev } = await applyGraphDelta({ projectRoot, projectId, delta });
      return textResult(`Generated image for node ${params.nodeId} (rev ${rev}).`, { kind: "graph_updated", rev, assetRef });
    },
  };
}

// ---------------------------------------------------------------------------
// Tool set selection + factory
// ---------------------------------------------------------------------------

/**
 * Returns the tool names that the interactive-film-authoring session should
 * provide given the current `confirmedIntent`.
 *
 * - No confirmed intent → direct-write tools + propose_action (let the agent
 *   surface high-cost operations for explicit user confirmation).
 * - Confirmed intent → exactly that one tool (already confirmed, execute it).
 */
export function buildFilmAuthoringToolNames(confirmedIntent: string | undefined): string[] {
  if (confirmedIntent === "draft_structure") return ["draft_structure"];
  if (confirmedIntent === "connect_choice") return ["connect_choice"];
  if (confirmedIntent === "remove_node") return ["remove_node"];
  return ["set_world_anchor", "upsert_characters", "add_variable", "define_ending", "fill_node", "revise_node", "generate_node_image", "propose_action"];
}

/**
 * Instantiates the AgentTool objects for an interactive-film-authoring
 * session.  Keeps tool construction out of agent-session.ts so it can be
 * unit-tested independently.
 */
export function createFilmAuthoringTools(params: {
  readonly projectRoot: string;
  readonly projectId: string;
  readonly llm: FilmLLMDeps;
  readonly proposeActionTool: AgentTool<any>;
  readonly confirmedIntent?: string;
  readonly language?: FilmAuthoringLanguage;
}): AgentTool<any>[] {
  const { projectRoot, projectId, llm } = params;
  const language = params.language ?? "zh";
  const names = buildFilmAuthoringToolNames(params.confirmedIntent);
  const byName: Record<string, () => AgentTool<any>> = {
    set_world_anchor: () => createSetWorldAnchorTool(projectRoot, projectId),
    upsert_characters: () => createUpsertCharactersTool(projectRoot, projectId),
    add_variable: () => createAddVariableTool(projectRoot, projectId),
    define_ending: () => createDefineEndingTool(projectRoot, projectId),
    fill_node: () => createFillNodeTool(projectRoot, projectId, llm, language),
    revise_node: () => createReviseNodeTool(projectRoot, projectId, llm, language),
    generate_node_image: () => createGenerateNodeImageTool(projectRoot, projectId),
    draft_structure: () => createDraftStructureTool(projectRoot, projectId, llm, language),
    connect_choice: () => createConnectChoiceTool(projectRoot, projectId),
    remove_node: () => createRemoveNodeTool(projectRoot, projectId),
    propose_action: () => params.proposeActionTool,
  };
  return names.map((n) => byName[n]());
}
