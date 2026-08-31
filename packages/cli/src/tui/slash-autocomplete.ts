import type { CliLanguage } from "../localization.js";

const SLASH_COMMAND_VARIANTS: ReadonlyArray<{ zh: string; en: string; vi: string }> = [
  { zh: "/new 输入你的想法", en: "/new describe your idea", vi: "/new mô tả ý tưởng của bạn" },
  { zh: "/short 输入短篇方向", en: "/short describe the short", vi: "/short mô tả truyện ngắn" },
  { zh: "/play [open|guided] 输入互动世界开局", en: "/play [open|guided] describe the opening", vi: "/play [open|guided] mô tả mở đầu thế giới tương tác" },
  { zh: "/cover 输入封面方向", en: "/cover describe the cover", vi: "/cover mô tả hướng bìa" },
  { zh: "/write", en: "/write", vi: "/write" },
  { zh: "/confirm", en: "/confirm", vi: "/confirm" },
  { zh: "/cancel", en: "/cancel", vi: "/cancel" },
  { zh: "/model <model>", en: "/model <model>", vi: "/model <model>" },
  { zh: "/help", en: "/help", vi: "/help" },
  { zh: "/status", en: "/status", vi: "/status" },
  { zh: "/clear", en: "/clear", vi: "/clear" },
  { zh: "/depth <light|normal|deep>", en: "/depth <light|normal|deep>", vi: "/depth <light|normal|deep>" },
  { zh: "/quit", en: "/quit", vi: "/quit" },
  { zh: "/exit", en: "/exit", vi: "/exit" },
];

export function buildSlashCommands(language: CliLanguage = "zh"): readonly string[] {
  return SLASH_COMMAND_VARIANTS.map((variant) => variant[language]);
}

export const SLASH_COMMANDS = buildSlashCommands("zh");

export type SlashNavigationDirection = "up" | "down";

export function getSlashSuggestions(input: string, commands: readonly string[]): string[] {
  const value = input.trim();
  if (!value.startsWith("/")) {
    return [];
  }

  return commands.filter((command) => slashCommandStem(command).startsWith(value));
}

export function getNextSlashSelection(
  currentIndex: number,
  suggestionCount: number,
  direction: SlashNavigationDirection,
): number {
  if (suggestionCount <= 0) {
    return 0;
  }

  if (direction === "down") {
    return (currentIndex + 1) % suggestionCount;
  }

  return (currentIndex - 1 + suggestionCount) % suggestionCount;
}

export function applySlashSuggestion(
  _input: string,
  suggestions: readonly string[],
  selectedIndex: number,
): string {
  const suggestion = suggestions[selectedIndex] ?? "";
  return slashSuggestionInsertion(suggestion);
}

function slashCommandStem(command: string): string {
  return command.match(/^\/\S+/)?.[0] ?? command;
}

function slashSuggestionInsertion(suggestion: string): string {
  const stem = slashCommandStem(suggestion);
  return suggestion === stem ? stem : `${stem} `;
}
