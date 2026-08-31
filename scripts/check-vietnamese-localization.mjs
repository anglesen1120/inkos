#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const STUDIO_CATALOG = "packages/studio/src/hooks/use-i18n.ts";
const REVIEWED_STUDIO_KEYS = [
  "nav.books",
  "nav.createNovel",
  "dash.noBooks",
  "book.writeNext",
  "reader.chapterBriefPlaceholder",
  "translation.upload",
  "import.spinoffHint",
  "radar.emptyHint",
  "doctor.allPassed",
  "genre.saveChanges",
  "settings.modelOverridesHint",
  "truth.selectFile",
  "daemon.waitingEvents",
  "common.enterCommand",
  "chapter.readyForReview",
  "logs.showingRecent",
];

const README_FILES = ["README.md", "README.en.md", "README.ja.md"];
const DESIGNATED_DOCS = [...README_FILES, "CONTRIBUTING.md", ".github/pull_request_template.md"];

const LOCALIZED_DISTINCTION_PATTERNS = new Map([
  ["README.md", /界面区域设置与内容生成语言是两个独立选项[^\n]*`vi-VN`[^\n]*生成使用 `vi`/],
  ["README.en.md", /UI locale and content-generation language are separate settings[^\n]*`vi-VN`[^\n]*(?:writing and )?generation use `vi`/i],
  ["README.ja.md", /UI ロケールとコンテンツ生成言語は別の設定[^\n]*`vi-VN`[^\n]*生成には `vi`/],
]);
const VIETNAMESE_DISTINCTION = /Ngôn ngữ tạo nội dung\/dự án dùng mã `vi`; ngôn ngữ giao diện TUI dùng locale `vi-VN`\./;
const REVIEWED_RUNTIME_ASSETS = new Set([
  "packages/core/skills/inkos-interactive-film/SKILL.md",
  "packages/core/skills/inkos-long-writing/SKILL.md",
  "packages/core/skills/inkos-play-world/SKILL.md",
  "packages/core/skills/inkos-script-writing/SKILL.md",
  "packages/core/skills/inkos-short-writing/SKILL.md",
  "packages/core/skills/inkos-translation/SKILL.md",
  "packages/core/skills/inkos-long-writing/references/scene-dialogue-and-length-budget.md",
  "packages/core/skills/inkos-play-world/references/world-turn-continuity.md",
  "packages/core/skills/inkos-short-writing/references/production-checklist.md",
  "packages/core/skills/inkos-translation/references/long-form-consistency.md",
]);


const DOCUMENT_CONTRACTS = [
  {
    files: DESIGNATED_DOCS,
    matches: (content) => content.includes("inkos init <project-name> --lang vi"),
    code: "LOCALE_DOC_MISSING_EXAMPLE",
    message: "Missing Vietnamese project initialization example.",
  },
  {
    files: DESIGNATED_DOCS,
    matches: (content, file) => VIETNAMESE_DISTINCTION.test(content)
      || LOCALIZED_DISTINCTION_PATTERNS.get(file)?.test(content) === true,
    code: "LOCALE_DOC_MISSING_DISTINCTION",
    message: "Missing distinction between generation language vi and TUI locale vi-VN.",
  },
  {
    files: DESIGNATED_DOCS,
    matches: (content) => /\$env:INKOS_TUI_LOCALE\s*=\s*["']vi-VN["']\s*(?:;|\r?\n)\s*(?:PowerShell:\s*)?inkos tui/.test(content),
    code: "LOCALE_DOC_MISSING_POWERSHELL_EXAMPLE",
    message: "Missing PowerShell Vietnamese TUI locale example.",
  },
  {
    files: DESIGNATED_DOCS,
    matches: (content) => content.includes("set INKOS_TUI_LOCALE=vi-VN && inkos tui"),
    code: "LOCALE_DOC_MISSING_CMD_EXAMPLE",
    message: "Missing Command Prompt Vietnamese TUI locale example.",
  },
];

function normalizeRelativePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function lineAt(content, offset) {
  return content.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

async function readText(root, relativePath) {
  try {
    return await readFile(path.join(root, ...relativePath.split("/")), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function catalogFinding(content, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entry = new RegExp(`["']${escapedKey}["']\\s*:\\s*\\{([^}]*)\\}`, "m").exec(content);
  if (!entry) {
    return {
      file: STUDIO_CATALOG,
      line: 1,
      code: "LOCALE_CATALOG_MISSING_VI",
      message: `Reviewed Studio key ${key} is missing or has no non-blank vi value.`,
    };
  }

  const vi = /(?:["']vi["']|\bvi)\s*:\s*(["'`])([\s\S]*?)\1/.exec(entry[1]);
  if (vi && vi[2].trim()) return undefined;
  return {
    file: STUDIO_CATALOG,
    line: lineAt(content, entry.index),
    code: "LOCALE_CATALOG_MISSING_VI",
    message: `Reviewed Studio key ${key} is missing or has no non-blank vi value.`,
  };
}

function manifestIncludes(files, assetPath) {
  let included = false;
  for (const rawPattern of files) {
    if (typeof rawPattern !== "string") continue;
    const excluded = rawPattern.startsWith("!");
    const pattern = normalizeRelativePath(excluded ? rawPattern.slice(1) : rawPattern).replace(/\/$/, "");
    const matches = assetPath === pattern || assetPath.startsWith(`${pattern}/`);
    if (matches) included = !excluded;
  }
  return included;
}

function reviewedAssetPath(relativeFile) {
  if (!REVIEWED_RUNTIME_ASSETS.has(relativeFile)) return undefined;
  return {
    manifestPath: "packages/core/package.json",
    packagePath: relativeFile.slice("packages/core/".length),
  };
}

async function assetFinding(root, changedFile) {
  const relativeFile = normalizeRelativePath(changedFile);
  const reviewedAsset = reviewedAssetPath(relativeFile);
  if (!reviewedAsset) return undefined;

  const { manifestPath, packagePath } = reviewedAsset;
  const manifestText = await readText(root, manifestPath);

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return {
      file: manifestPath,
      line: 1,
      code: "LOCALE_MANIFEST_INVALID",
      message: `Cannot parse publish manifest for changed asset ${relativeFile}.`,
    };
  }

  if (Array.isArray(manifest.files) && manifestIncludes(manifest.files, packagePath)) return undefined;
  return {
    file: relativeFile,
    line: 1,
    code: "LOCALE_ASSET_NOT_PUBLISHED",
    message: `Changed runtime asset is not covered by ${manifestPath} files.`,
  };
}

export async function changedFilesSince(ref, {
  root = process.cwd(),
  execFileImpl = execFile,
} = {}) {
  if (typeof ref !== "string" || !ref.trim()) throw new TypeError("ref must be a non-empty git ref");
  try {
    const { stdout } = await execFileImpl(
      "git",
      ["diff", "--name-only", "-z", ref, "HEAD", "--"],
      { cwd: path.resolve(root), encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    return stdout.split("\0").filter(Boolean).map(normalizeRelativePath);
  } catch {
    throw new Error(`Cannot derive changed files since ${ref}. Verify that the ref exists in this checkout.`);
  }
}

function sortFindings(findings) {
  findings.sort((left, right) => left.file.localeCompare(right.file)
    || left.line - right.line
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message));
}

export async function checkVietnameseLocalization({ root, changedFiles = [] } = {}) {
  if (typeof root !== "string" || !root.trim()) {
    throw new TypeError("root must be a non-empty path");
  }
  if (!Array.isArray(changedFiles) || changedFiles.some((file) => typeof file !== "string")) {
    throw new TypeError("changedFiles must be an array of paths");
  }

  const absoluteRoot = path.resolve(root);
  const findings = [];
  const catalog = await readText(absoluteRoot, STUDIO_CATALOG);
  if (catalog === undefined) {
    findings.push({
      file: STUDIO_CATALOG,
      line: 1,
      code: "LOCALE_CATALOG_MISSING_VI",
      message: "Studio localization catalog is missing.",
    });
  } else {
    for (const key of REVIEWED_STUDIO_KEYS) {
      const finding = catalogFinding(catalog, key);
      if (finding) findings.push(finding);
    }
  }

  for (const contract of DOCUMENT_CONTRACTS) {
    for (const file of contract.files) {
      const content = await readText(absoluteRoot, file);
      if (content !== undefined && contract.matches(content, file)) continue;
      findings.push({ file, line: 1, code: contract.code, message: contract.message });
    }
  }

  const uniqueChangedFiles = [...new Set(changedFiles.map(normalizeRelativePath))].sort();
  for (const changedFile of uniqueChangedFiles) {
    const finding = await assetFinding(absoluteRoot, changedFile);
    if (finding) findings.push(finding);
  }

  sortFindings(findings);
  return { findings };
}

function usage() {
  return [
    "Usage: node scripts/check-vietnamese-localization.mjs [options]",
    "  --root <path>          Repository root (default: current directory)",
    "  --changed-file <path>  Changed reviewed asset; repeat for multiple files",
    "  --changed-since <ref>  Add paths changed from <ref> through HEAD",
    "  --json                 Print machine-readable output",
    "  --help                 Show this help",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { root: process.cwd(), changedFiles: [], changedSince: undefined, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--root" || arg === "--changed-file" || arg === "--changed-since") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) throw new Error(`${arg} requires a value`);
      index += 1;
      if (arg === "--root") options.root = value;
      else if (arg === "--changed-file") options.changedFiles.push(value);
      else if (options.changedSince === undefined) options.changedSince = value;
      else throw new Error("--changed-since may only be specified once");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}\n${usage()}`);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }


  if (options.changedSince !== undefined) {
    try {
      options.changedFiles.push(...await changedFilesSince(options.changedSince, { root: options.root }));
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exitCode = 2;
      return;
    }
  }
  try {
    const result = await checkVietnameseLocalization(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else if (result.findings.length === 0) console.log("Vietnamese localization check passed.");
    else {
      console.error(`Vietnamese localization findings: ${result.findings.length}`);
      for (const finding of result.findings) {
        console.error(`${finding.file}:${finding.line} [${finding.code}] ${finding.message}`);
      }
    }
    if (result.findings.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await main();
