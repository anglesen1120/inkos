import { z } from "zod";
export type WritingLanguage = "zh" | "en" | "vi";
export const WritingLanguageSchema = z.preprocess(
  (value) => normalizeWritingLanguage(value),
  z.enum(["zh", "en", "vi"]),
);

/** Convert common BCP-47/POSIX language tags to InkOS's canonical identifiers. */
export function normalizeWritingLanguage(value: unknown): WritingLanguage | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "vi" || normalized.startsWith("vi-")) return "vi";
  return undefined;
}

export function writingLanguageToEpubLocale(language: WritingLanguage): string {
  return language === "zh" ? "zh-CN" : language;
}

/**
 * Infer the writing language from a free-text brief/premise when the user did not set one explicitly.
 * Defaults to zh for compatibility; Vietnamese diacritics identify vi even when incidental CJK is present.
 */
export function inferLanguage(text?: string | null): WritingLanguage {
  const t = text ?? "";
  const cjk = (t.match(/[一-鿿]/g) ?? []).length;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  const vietnamese = (t.match(/[ĂÂĐÊÔƠƯăâđêôơưÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/g) ?? []).length;
  if (vietnamese > 0) return "vi";
  if (cjk === 0 && latin > 0) return "en";
  if (latin > 0 && cjk * 4 < latin) return "en";
  return "zh";
}
