import { normalizePlatformOrOther, defaultChapterLength, type Platform } from "@actalk/inkos-core";
export { waitForStudioBookReady } from "../lib/book-ready.js";
export type { StudioBookDetail, WaitForStudioBookReadyOptions } from "../lib/book-ready.js";

type StudioLanguage = "zh" | "en" | "vi";

function normalizeStudioBookLanguage(language?: string): StudioLanguage | undefined {
  if (language === "en") return "en";
  if (language === "vi" || language === "vi-VN" || language === "vi_VN" || language === "vi_VN.UTF-8") return "vi";
  if (language === "zh") return "zh";
  return undefined;
}

export interface StudioCreateBookBody {
  readonly title: string;
  readonly genre: string;
  readonly language?: string;
  readonly platform?: string;
  readonly chapterWordCount?: number;
  readonly targetChapters?: number;
  readonly blurb?: string;
}

export interface StudioBookConfigDraft {
  readonly id: string;
  readonly title: string;
  readonly platform: Platform;
  readonly genre: string;
  readonly status: "outlining";
  readonly targetChapters: number;
  readonly chapterWordCount: number;
  readonly language?: StudioLanguage;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function normalizeStudioPlatform(platform?: string): Platform {
  return normalizePlatformOrOther(platform);
}

export function buildStudioBookConfig(body: StudioCreateBookBody, now: string): StudioBookConfigDraft {
  const language = normalizeStudioBookLanguage(body.language);
  return {
    id: body.title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 30),
    title: body.title,
    platform: normalizeStudioPlatform(body.platform),
    genre: body.genre,
    status: "outlining",
    targetChapters: body.targetChapters ?? 200,
    chapterWordCount: body.chapterWordCount ?? defaultChapterLength(language === "en" || language === "vi" ? "en" : "zh"),
    ...(language ? { language } : {}),
    createdAt: now,
    updatedAt: now,
  };
}
