import assert from 'node:assert/strict';
import { execFile as execFileCallback, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  checkVietnameseLocalization,
  changedFilesSince,
} from '../check-vietnamese-localization.mjs';

const execFile = promisify(execFileCallback);


const REVIEWED_STUDIO_KEYS = [
  'nav.books',
  'nav.createNovel',
  'dash.noBooks',
  'book.writeNext',
  'reader.chapterBriefPlaceholder',
  'translation.upload',
  'import.spinoffHint',
  'radar.emptyHint',
  'doctor.allPassed',
  'genre.saveChanges',
  'settings.modelOverridesHint',
  'truth.selectFile',
  'daemon.waitingEvents',
  'common.enterCommand',
  'chapter.readyForReview',
  'logs.showingRecent',
];

const REQUIRED_DOC_TEXT = [
  'inkos init <project-name> --lang vi',
  'Ngôn ngữ tạo nội dung/dự án dùng mã `vi`; ngôn ngữ giao diện TUI dùng locale `vi-VN`.',
  'PowerShell: $env:INKOS_TUI_LOCALE="vi-VN"; inkos tui',
  'Command Prompt: set INKOS_TUI_LOCALE=vi-VN && inkos tui',
].join('\n');

async function put(root, relativePath, content) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
}

function studioCatalog(overrides = {}) {
  const entries = REVIEWED_STUDIO_KEYS.map((key, index) => {
    const value = overrides[key] ?? {
      zh: `中文文案 ${index}`,
      en: `English copy ${index}`,
      vi: `Nội dung tiếng Việt ${index}`,
    };
    return `${JSON.stringify(key)}: ${JSON.stringify(value)}`;
  });

  return `export const strings = {\n${entries.join(',\n')}\n};\n`;
}

async function createValidRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'inkos-vi-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await put(root, 'packages/studio/src/hooks/use-i18n.ts', studioCatalog());

  for (const doc of [
    'README.md',
    'README.en.md',
    'CONTRIBUTING.md',
    '.github/pull_request_template.md',
  ]) {
    await put(root, doc, REQUIRED_DOC_TEXT);
  }
  await put(root, 'README.ja.md', [
    'UI ロケールとコンテンツ生成言語は別の設定です。TUI の UI には `vi-VN`、執筆・生成には `vi` を指定します。',
    'inkos init <project-name> --lang vi',
    'INKOS_TUI_LOCALE=vi-VN inkos tui',
    '$env:INKOS_TUI_LOCALE = "vi-VN"',
    'inkos tui',
    'set INKOS_TUI_LOCALE=vi-VN && inkos tui',
  ].join('\n'));

  await put(
    root,
    'packages/core/package.json',
    JSON.stringify({ name: '@actalk/inkos-core', files: ['dist', 'genres', 'skills'] }),
  );
  await put(
    root,
    'packages/core/skills/vietnamese-writing/SKILL.md',
    '# Vietnamese writing\nNội dung hướng dẫn viết tiếng Việt.\n',
  );

  return root;
}

function findingCodes(result) {
  assert.ok(result && Array.isArray(result.findings), 'checker returns a findings array');
  return result.findings.map(({ code }) => code);
}

function assertFindingsSorted(findings) {
  const keys = findings.map(
    ({ file, line, code }) => `${file}\u0000${String(line).padStart(12, '0')}\u0000${code}`,
  );
  assert.deepEqual(keys, [...keys].sort());
}

test('accepts a complete Vietnamese localization root', async (t) => {
  const root = await createValidRoot(t);

  const result = await checkVietnameseLocalization({ root });

  assert.deepEqual(result.findings, []);
});

test('accepts localized distinction prose and multiline PowerShell examples', async (t) => {
  const root = await createValidRoot(t);
  const localizedReadmes = {
    'README.md': [
      '界面区域设置与内容生成语言是两个独立选项：Studio / TUI 界面使用 `vi-VN`，创作与生成使用 `vi`。',
      'inkos init <project-name> --lang vi',
      'INKOS_TUI_LOCALE=vi-VN inkos tui',
      '$env:INKOS_TUI_LOCALE = "vi-VN"',
      'inkos tui',
      'set INKOS_TUI_LOCALE=vi-VN && inkos tui',
    ].join('\n'),
    'README.en.md': [
      'The UI locale and content-generation language are separate settings: Studio/TUI uses `vi-VN`, while writing and generation use `vi`.',
      'inkos init <project-name> --lang vi',
      'INKOS_TUI_LOCALE=vi-VN inkos tui',
      '$env:INKOS_TUI_LOCALE = "vi-VN"',
      'inkos tui',
      'set INKOS_TUI_LOCALE=vi-VN && inkos tui',
    ].join('\n'),
    'README.ja.md': [
      'UI ロケールとコンテンツ生成言語は別の設定です。TUI の UI には `vi-VN`、執筆・生成には `vi` を指定します。',
      'inkos init <project-name> --lang vi',
      'INKOS_TUI_LOCALE=vi-VN inkos tui',
      '$env:INKOS_TUI_LOCALE = "vi-VN"',
      'inkos tui',
      'set INKOS_TUI_LOCALE=vi-VN && inkos tui',
    ].join('\n'),
  };
  for (const [file, content] of Object.entries(localizedReadmes)) await put(root, file, content);

  const result = await checkVietnameseLocalization({ root });

  assert.deepEqual(result.findings, []);
});

test('rejects documentation with commands but no generation versus UI distinction', async (t) => {
  const root = await createValidRoot(t);
  await put(root, 'README.en.md', [
    'Vietnamese setup commands:',
    'inkos init <project-name> --lang vi',
    'INKOS_TUI_LOCALE=vi-VN inkos tui',
    '$env:INKOS_TUI_LOCALE = "vi-VN"',
    'inkos tui',
    'set INKOS_TUI_LOCALE=vi-VN && inkos tui',
  ].join('\n'));

  const result = await checkVietnameseLocalization({ root });

  assert.deepEqual(findingCodes(result), ['LOCALE_DOC_MISSING_DISTINCTION']);
});

test('reports a reviewed Studio catalog key whose vi value is blank', async (t) => {
  const root = await createValidRoot(t);
  await put(
    root,
    'packages/studio/src/hooks/use-i18n.ts',
    studioCatalog({
      'nav.books': { zh: '书籍', en: 'Books', vi: '   ' },
    }),
  );

  const result = await checkVietnameseLocalization({ root });

  assert.deepEqual(findingCodes(result), ['LOCALE_CATALOG_MISSING_VI']);
});

test('reports a designated document missing the Vietnamese init contract', async (t) => {
  const root = await createValidRoot(t);
  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  await put(root, 'README.md', readme.replace('inkos init <project-name> --lang vi', 'inkos init <project-name>'));

  const result = await checkVietnameseLocalization({ root });

  assert.deepEqual(findingCodes(result), ['LOCALE_DOC_MISSING_EXAMPLE']);
});

test('reports a changed reviewed skill omitted from the core publish manifest', async (t) => {
  const root = await createValidRoot(t);
  await put(
    root,
    'packages/core/package.json',
    JSON.stringify({ name: '@actalk/inkos-core', files: ['dist', 'genres'] }),
  );

  const result = await checkVietnameseLocalization({
    root,
    changedFiles: ['packages/core/skills/inkos-long-writing/SKILL.md'],
  });

  assert.deepEqual(findingCodes(result), ['LOCALE_ASSET_NOT_PUBLISHED']);
});

test('reports a changed reviewed skill reference omitted from the core publish manifest', async (t) => {
  const root = await createValidRoot(t);
  await put(
    root,
    'packages/core/package.json',
    JSON.stringify({ name: '@actalk/inkos-core', files: ['dist', 'genres'] }),
  );

  const result = await checkVietnameseLocalization({
    root,
    changedFiles: ['packages/core/skills/inkos-translation/references/long-form-consistency.md'],
  });

  assert.deepEqual(findingCodes(result), ['LOCALE_ASSET_NOT_PUBLISHED']);
});

test('ignores an unrelated changed skill and genre asset', async (t) => {
  const root = await createValidRoot(t);
  await put(
    root,
    'packages/core/package.json',
    JSON.stringify({ name: '@actalk/inkos-core', files: ['dist'] }),
  );

  const result = await checkVietnameseLocalization({
    root,
    changedFiles: [
      'packages/core/skills/inkos-story-cover/SKILL.md',
      'packages/core/genres/horror.md',
    ],
  });

  assert.deepEqual(result.findings, []);
});

test('ignores an unrelated changed package asset outside reviewed roots', async (t) => {
  const root = await createValidRoot(t);
  const changedAsset = 'packages/core/prompts/vi/chapter.md';
  await put(root, changedAsset, '# Viết chương\n');

  const result = await checkVietnameseLocalization({ root, changedFiles: [changedAsset] });

  assert.deepEqual(result.findings, []);
});

test('derives changed files from git with an argv-safe ref', async () => {
  const calls = [];
  const files = await changedFilesSince('origin/main;echo unsafe', {
    root: 'C:/repo root',
    execFileImpl: async (...args) => {
      calls.push(args);
      return { stdout: 'packages/core/skills/a/SKILL.md\0packages/core/genres/b.yaml\0' };
    },
  });

  assert.deepEqual(calls, [[
    'git',
    ['diff', '--name-only', '-z', 'origin/main;echo unsafe', 'HEAD', '--'],
    { cwd: path.resolve('C:/repo root'), encoding: 'utf8', maxBuffer: 1024 * 1024 },
  ]]);
  assert.deepEqual(files, [
    'packages/core/skills/a/SKILL.md',
    'packages/core/genres/b.yaml',
  ]);
});
test('derives all files from the empty tree for a first release', async () => {
  const calls = [];
  const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  await changedFilesSince(emptyTree, {
    root: 'C:/repo root',
    execFileImpl: async (...args) => {
      calls.push(args);
      return { stdout: '' };
    },
  });

  assert.deepEqual(calls, [[
    'git',
    ['diff', '--name-only', '-z', emptyTree, 'HEAD', '--'],
    { cwd: path.resolve('C:/repo root'), encoding: 'utf8', maxBuffer: 1024 * 1024 },
  ]]);
});


test('CLI exits 2 with a bounded error when --changed-since ref is unavailable', async () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-vietnamese-localization.mjs', '--changed-since', 'definitely-not-a-ref'],
    { cwd: path.resolve('.'), encoding: 'utf8' },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /^Error: Cannot derive changed files since definitely-not-a-ref\./);
  assert.ok(result.stderr.length < 500, `error must be bounded, got ${result.stderr.length} chars`);
});

test('git-derived changed files enforce reviewed asset publication end to end', async (t) => {
  const root = await createValidRoot(t);
  await put(
    root,
    'packages/core/package.json',
    JSON.stringify({ name: '@actalk/inkos-core', files: ['dist', 'genres'] }),
  );
  await execFile('git', ['init'], { cwd: root });
  await execFile('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
  await execFile('git', ['config', 'user.name', 'Localization Test'], { cwd: root });
  await execFile('git', ['add', '.'], { cwd: root });
  await execFile('git', ['commit', '-m', 'fixture baseline'], { cwd: root });
  const { stdout: baseRef } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: root });
  await put(
    root,
    'packages/core/skills/inkos-long-writing/SKILL.md',
    '# Long writing\nNội dung hướng dẫn viết tiếng Việt đã đổi.\n',
  );
  await execFile('git', ['add', '.'], { cwd: root });
  await execFile('git', ['commit', '-m', 'change reviewed skill'], { cwd: root });

  const cli = spawnSync(
    process.execPath,
    [path.resolve('scripts/check-vietnamese-localization.mjs'), '--root', root, '--changed-since', baseRef.trim()],
    { cwd: path.resolve('.'), encoding: 'utf8' },
  );

  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /packages\/core\/skills\/inkos-long-writing\/SKILL\.md:1 \[LOCALE_ASSET_NOT_PUBLISHED\]/);
});

test('ignores allowlisted fixture prose, parser markers, technical IDs, and unrelated files', async (t) => {
  const root = await createValidRoot(t);
  await put(
    root,
    'packages/core/src/__tests__/fixtures/chinese-story.txt',
    '这是允许出现在测试夹具中的中文故事。\n=== CHAPTER_BRIEF ===\nbook_id: books/demo/book.json\n',
  );
  await put(
    root,
    'scratch/arbitrary-chinese-notes.txt',
    '这里的中文证明检查器不会无差别扫描整个仓库。\n=== TAG ===\ntechnical_id/path.json\n',
  );

  const result = await checkVietnameseLocalization({ root });

  assert.deepEqual(result.findings, []);
  assertFindingsSorted(result.findings);
});
