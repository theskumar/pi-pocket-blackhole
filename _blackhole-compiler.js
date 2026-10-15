/* pi-blackhole 0.5.11 compiler. MIT, Copyright (c) 2026 k0valik. See THIRD_PARTY_LICENSES.md. */

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/segment.ts
var CJK_SCRIPT_CLASS = "[\\u3000-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af\\uff00-\\uff5e\\u{20000}-\\u{2fa1f}\\u{30000}-\\u{323af}]";
var CJK_SCRIPT_RE = new RegExp(CJK_SCRIPT_CLASS, "u");
var CJK_SCRIPT_GLOBAL_RE = new RegExp(CJK_SCRIPT_CLASS, "gu");
var hasCJK = (text) => CJK_SCRIPT_RE.test(text);
var _segmenter = void 0;
var wordSegments = (text) => {
  if (_segmenter) return Array.from(_segmenter.segment(text));
  if (_segmenter === null) {
    const parts = [];
    let idx = 0;
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      parts.push({ segment: part, index: idx, isWordLike: /\S/.test(part) });
      idx += part.length;
    }
    return parts;
  }
  try {
    _segmenter = new Intl.Segmenter(void 0, { granularity: "word" });
    return Array.from(_segmenter.segment(text));
  } catch {
    _segmenter = null;
    const parts = [];
    let idx = 0;
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      parts.push({ segment: part, index: idx, isWordLike: /\S/.test(part) });
      idx += part.length;
    }
    return parts;
  }
};
var isWordSegment = (seg) => !!seg.isWordLike || /[\p{L}\p{N}]/u.test(seg.segment);

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/tool-args.ts
var PATH_KEYS = ["path", "file_path", "filePath", "file"];
var extractPath = (args) => {
  for (const key of PATH_KEYS) {
    if (typeof args[key] === "string") return args[key];
  }
  return null;
};

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/content.ts
var CJK_PAUSE_GLOBAL_RE = /[。！？；，、：]/gu;
var clip = (text, max = 200) => {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  let end = cut > max * 0.6 ? cut : max;
  if (end === max && hasCJK(text)) {
    CJK_PAUSE_GLOBAL_RE.lastIndex = 0;
    let m;
    let pauseIdx = -1;
    while ((m = CJK_PAUSE_GLOBAL_RE.exec(text)) !== null && m.index < max) {
      if (m.index >= max * 0.6) pauseIdx = m.index;
    }
    if (pauseIdx >= 0) end = pauseIdx + 1;
  }
  if (end > 0 && end < text.length) {
    const code = text.charCodeAt(end - 1);
    if (code >= 55296 && code <= 56319) end--;
  }
  return text.slice(0, end);
};
var clipSentence = (text, max = 200) => {
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const matches = [...window.matchAll(/[.!?](?:\s|$)|[。！？；]/g)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const end = (last.index ?? 0) + 1;
    if (end >= max * 0.5) return text.slice(0, end);
  }
  return clip(text, max);
};
var nonEmptyLines = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);
var firstLine = (text, max = 200) => clip(text.split("\n")[0] ?? "", max);
var textParts = (content) => {
  if (!content) return [];
  if (typeof content === "string") return [content];
  return content.filter((part) => part.type === "text").map((part) => part.text);
};
var textOf = (content) => textParts(content).join("\n");

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/sanitize.ts
var ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
var CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;
var sanitize = (text) => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(ANSI_RE, "").replace(CTRL_RE, "");

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/normalize.ts
var normalizeOne = (msg, msgIndex) => {
  if (msg.role === "user") {
    const blocks = [];
    const text = sanitize(textOf(msg.content));
    if (text) blocks.push({ kind: "user", text, sourceIndex: msgIndex });
    if (msg.content && typeof msg.content !== "string") {
      for (const part of msg.content) {
        if (part.type === "image") {
          blocks.push({
            kind: "user",
            text: `[image: ${part.mimeType}]`,
            sourceIndex: msgIndex
          });
        }
      }
    }
    return blocks.length > 0 ? blocks : [{ kind: "user", text: "", sourceIndex: msgIndex }];
  }
  if (msg.role === "bashExecution") {
    const bashMsg = msg;
    return [
      {
        kind: "bash",
        command: bashMsg.command ?? "",
        output: bashMsg.output ?? "",
        exitCode: bashMsg.exitCode,
        sourceIndex: msgIndex
      }
    ];
  }
  if (msg.role === "toolResult") {
    return [
      {
        kind: "tool_result",
        name: msg.toolName,
        text: sanitize(textOf(msg.content)),
        isError: msg.isError,
        sourceIndex: msgIndex
      }
    ];
  }
  if (msg.role === "assistant") {
    if (!msg.content) return [];
    if (typeof msg.content === "string") {
      return [
        {
          kind: "assistant",
          text: sanitize(msg.content),
          sourceIndex: msgIndex
        }
      ];
    }
    const blocks = [];
    for (const part of msg.content) {
      if (part.type === "text") {
        blocks.push({
          kind: "assistant",
          text: sanitize(part.text),
          sourceIndex: msgIndex
        });
      } else if (part.type === "thinking") {
        blocks.push({
          kind: "thinking",
          text: sanitize(part.thinking),
          redacted: part.redacted ?? false,
          sourceIndex: msgIndex
        });
      } else if (part.type === "toolCall") {
        blocks.push({
          kind: "tool_call",
          name: part.name,
          args: part.arguments,
          sourceIndex: msgIndex
        });
      }
    }
    return blocks;
  }
  return [];
};
var normalize = (messages, sourceIndices) => messages.flatMap((msg, i) => normalizeOne(msg, sourceIndices ? sourceIndices[i] : i));

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/filter-noise.ts
var NOISE_TOOLS = /* @__PURE__ */ new Set([
  "TodoWrite",
  "TodoRead",
  "ToolSearch",
  "WebSearch",
  "AskUser",
  "ExitSpecMode",
  "GenerateDroid"
]);
var NOISE_STRINGS = [
  "Continue from where you left off.",
  "No response requested.",
  "IMPORTANT: TodoWrite was not called yet."
];
var XML_WRAPPER_RE = /<(system-reminder|ide_opened_file|command-message|context-window-usage)[^>]*>[\s\S]*?<\/\1>/g;
var cleanOrNull = (text) => {
  const trimmed = text.trim();
  if (NOISE_STRINGS.some((s) => trimmed.includes(s))) return null;
  const cleaned = trimmed.replace(XML_WRAPPER_RE, "").trim();
  return cleaned.length > 0 ? cleaned : null;
};
var filterNoise = (blocks) => {
  const out = [];
  for (const b of blocks) {
    if (b.kind === "thinking") continue;
    if (b.kind === "tool_call" && NOISE_TOOLS.has(b.name)) continue;
    if (b.kind === "tool_result" && NOISE_TOOLS.has(b.name)) continue;
    if (b.kind === "user") {
      const cleaned = cleanOrNull(b.text);
      if (!cleaned) continue;
      out.push({ ...b, text: cleaned });
      continue;
    }
    out.push(b);
  }
  return out;
};

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/skill-collapse.ts
var SKILL_TAG_RE = /^-?\s*<skill\s+name="([^"]+)"/;
var SKILL_CLOSE_RE = /^-?\s*<\/skill>/;
var collapseSkillLines = (lines) => {
  const result = [];
  const seenSkills = /* @__PURE__ */ new Set();
  let insideSkill = false;
  for (const line of lines) {
    const skillMatch = line.match(SKILL_TAG_RE);
    if (skillMatch) {
      insideSkill = true;
      const name = skillMatch[1];
      if (!seenSkills.has(name)) {
        seenSkills.add(name);
        result.push(`[skill: ${name}]`);
      }
      continue;
    }
    if (insideSkill) {
      if (SKILL_CLOSE_RE.test(line)) insideSkill = false;
      continue;
    }
    result.push(line);
  }
  return result;
};
var SKILL_BLOCK_RE = /<skill\s+name="([^"]+)"[^>]*>[\s\S]*?(?:<\/skill>|$)/g;
var collapseSkillText = (text) => text.replace(SKILL_BLOCK_RE, (_, name) => `[skill: ${name}]`);

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/extract/goals.ts
var SCOPE_CHANGE_RE = /\b(instead|actually|change of plan|forget that|new task|switch to|now I want|pivot|let'?s do|stop .* and)\b/i;
var TASK_RE = /\b(fix|implement|add|create|build|refactor|debug|investigate|update|remove|delete|migrate|deploy|test|write|set up)\b/i;
var NOISE_SHORT_RE = /^(ok|yes|no|sure|yeah|yep|go|hi|hey|thx|thanks|ok\b.*|y|n|k)\s*[.!?]*$/i;
var NON_GOAL_RE = /^\s*[[│├└─╭╰]|```|^\s*(=[A-Z]+\(|function |const |let |var |import |export |class )|^(https?:|file:|\/[A-Za-z])|\\n|^\s*For each\b|\bin full\b[^\n]*\b(comments|issue|issues|PRs?|linked)\b/;
var TEMPLATE_SIGNAL_RE = /^\s*(For each\b|Do NOT implement\b|Analyze and propose\b|If Task\/context\b|Output:\s*$)/i;
var truncateAtTemplate = (lines) => {
  const idx = lines.findIndex((l) => TEMPLATE_SIGNAL_RE.test(l));
  return idx >= 0 ? lines.slice(0, idx) : lines;
};
var stripLeadingBullet = (line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").trim();
var MAX_GOAL_CHARS = 200;
var isSubstantiveGoal = (text) => {
  const t = text.trim();
  if (t.length <= 5) return false;
  if (t.length > MAX_GOAL_CHARS) return false;
  if (NOISE_SHORT_RE.test(t)) return false;
  if (NON_GOAL_RE.test(t)) return false;
  return true;
};
var FIRST_MSG_CLIP = 200;
var indexSuffix = (sourceIndex) => sourceIndex != null ? ` (#${sourceIndex})` : "";
var LEADING_CHARS = 200;
var extractGoals = (blocks) => {
  const goals = [];
  let latestScopeChange = null;
  let latestScopeIndex;
  for (const b of blocks) {
    if (b.kind !== "user") continue;
    const rawLines = nonEmptyLines(b.text);
    const truncated = truncateAtTemplate(rawLines);
    const lines = collapseSkillLines(truncated.filter(isSubstantiveGoal)).map(stripLeadingBullet).filter((l) => l.length > 5);
    if (lines.length === 0) continue;
    if (goals.length === 0) {
      goals.push(
        ...lines.slice(0, 6).map((l) => clip(l, FIRST_MSG_CLIP) + indexSuffix(b.sourceIndex))
      );
      continue;
    }
    const leading = b.text.slice(0, LEADING_CHARS);
    if (SCOPE_CHANGE_RE.test(leading)) {
      latestScopeChange = lines.slice(0, 3).map((l) => clip(l, MAX_GOAL_CHARS));
      latestScopeIndex = b.sourceIndex;
    } else if (TASK_RE.test(leading) && lines[0].length > 15) {
      latestScopeChange = lines.slice(0, 2).map((l) => clip(l, MAX_GOAL_CHARS));
      latestScopeIndex = b.sourceIndex;
    }
  }
  if (latestScopeChange && latestScopeChange.length > 0) {
    goals.push("[Scope change]" + indexSuffix(latestScopeIndex));
    for (const line of latestScopeChange) {
      goals.push(line + indexSuffix(latestScopeIndex));
    }
  }
  return goals.slice(0, 8);
};

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/extract/files.ts
import path from "node:path";
var FILE_READ_TOOLS = /* @__PURE__ */ new Set(["Read", "read_file", "View", "read", "view"]);
var FILE_WRITE_TOOLS = /* @__PURE__ */ new Set([
  "Edit",
  "Write",
  "edit",
  "write",
  "edit_file",
  "write_file",
  "MultiEdit"
]);
var FILE_CREATE_TOOLS = /* @__PURE__ */ new Set();
var displayPath = (abs, cwd) => {
  if (cwd) {
    const rel = path.relative(cwd, abs);
    if (rel && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)) {
      return rel.split(path.sep).join("/");
    }
  }
  return abs;
};
var isOutsideCwd = (display) => display.startsWith("/") || /^[A-Za-z]:\//.test(display);
var rankByCwd = (set) => new Set([...set].filter((p) => !isOutsideCwd(p)).concat([...set].filter(isOutsideCwd)));
var sanitizeReference = (raw) => {
  let value = raw.trim();
  if (!value) return value;
  const first = value.charCodeAt(0);
  const last = value.charCodeAt(value.length - 1);
  if (first === 34 || first === 39 || first === 96 || first === 40 || first === 60 || first === 91 || last === 34 || last === 39 || last === 96 || last === 62 || last === 59 || last === 41 || last === 93 || last === 46 || last === 44 || last === 58 || last === 92) {
    value = value.replace(/^["'`(<[]+/, "");
    value = value.replace(/[>"'`,;).\\\]]+$/, "");
    value = value.replace(/[.,;:]+$/, "");
  }
  return value;
};
var stripLineSuffix = (value) => {
  if (!value.includes("#") && !value.includes(":")) return value;
  let result = value.replace(/#L\d+(C\d+)?$/i, "");
  const lastSeparator = Math.max(result.lastIndexOf("/"), result.lastIndexOf("\\"));
  const segmentStart = lastSeparator >= 0 ? lastSeparator + 1 : 0;
  const segment = result.slice(segmentStart);
  const colonIndex = segment.indexOf(":");
  if (colonIndex >= 0 && /\d/.test(segment[colonIndex + 1] ?? "")) {
    result = result.slice(0, segmentStart + colonIndex);
    return result;
  }
  const lastColon = result.lastIndexOf(":");
  if (lastColon > lastSeparator) {
    const suffix = result.slice(lastColon + 1);
    if (/^\d+(?::\d+)?$/.test(suffix)) {
      result = result.slice(0, lastColon);
    }
  }
  return result;
};
var stripReadSliceSuffix = (p) => p.replace(/:(\d+)-(\d+)$/, "");
var seedFromTouched = (act, touched) => {
  for (const t of touched) {
    if (t.lastOperation === "delete") continue;
    const ops = t.operations;
    if (ops.has("write") || ops.has("edit") || ops.has("move")) {
      act.modified.add(t.path);
    } else if (ops.has("read")) {
      act.read.add(t.path);
    }
  }
};
var toLookupPath = (p, cwd) => {
  const cleaned = stripLineSuffix(sanitizeReference(stripReadSliceSuffix(p)));
  const slashed = cleaned.replace(/\\/g, "/");
  return slashed.startsWith("/") || /^[A-Za-z]:\//.test(slashed) ? slashed : cwd ? path.resolve(cwd, cleaned).replace(/\\/g, "/") : cleaned;
};
var extractFiles = (blocks, fileOps, touched = [], gitTags, cwd) => {
  const canon = (p) => toLookupPath(p, cwd);
  const act = { read: /* @__PURE__ */ new Set(), modified: /* @__PURE__ */ new Set(), created: /* @__PURE__ */ new Set() };
  seedFromTouched(act, touched);
  for (const p of fileOps?.readFiles ?? []) act.read.add(canon(p));
  for (const p of fileOps?.modifiedFiles ?? []) act.modified.add(canon(p));
  for (const p of fileOps?.createdFiles ?? []) act.created.add(canon(p));
  for (const b of blocks) {
    if (b.kind !== "tool_call") continue;
    const p = extractPath(b.args);
    if (!p) continue;
    const c = canon(p);
    if (FILE_READ_TOOLS.has(b.name)) act.read.add(c);
    if (FILE_WRITE_TOOLS.has(b.name)) act.modified.add(c);
    if (FILE_CREATE_TOOLS.has(b.name)) act.created.add(c);
  }
  if (gitTags) {
    for (const p of act.modified) {
      if (gitTags.get(toLookupPath(p, cwd)) === "new") {
        act.modified.delete(p);
        act.created.add(p);
      }
    }
  }
  for (const p of act.modified) act.read.delete(p);
  if (gitTags) {
    const annotations = /* @__PURE__ */ new Map();
    const collect = (set, allowNew) => {
      for (const p of set) {
        const tag = gitTags.get(toLookupPath(p, cwd));
        if (!tag || tag === "new" && !allowNew) continue;
        annotations.set(displayPath(p, cwd), tag);
      }
    };
    collect(act.modified, true);
    collect(act.created, true);
    collect(act.read, false);
    if (annotations.size > 0) act.gitTags = annotations;
  }
  act.read = rankByCwd(new Set([...act.read].map((p) => displayPath(p, cwd))));
  act.modified = rankByCwd(new Set([...act.modified].map((p) => displayPath(p, cwd))));
  act.created = rankByCwd(new Set([...act.created].map((p) => displayPath(p, cwd))));
  return act;
};
var formatFileList = (category, paths, limit, total) => {
  const shown = paths.slice(0, limit);
  const count = total ?? paths.length;
  const lines = [`${category} (${count}):`, ...shown.map((p) => `  ${p},`)];
  if (count > shown.length) lines.push(`  (+${count - shown.length} more)`);
  return lines.join("\n");
};

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/extract/file-touch.ts
import path2 from "node:path";
function uniqStrings(values) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
function normalizePathSeparators(value) {
  return value.replace(/\\/g, "/");
}
function normalizeSegments(value) {
  if (value === null || value === void 0) {
    return "";
  }
  const normalized = normalizePathSeparators(value);
  const segments = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
        continue;
      }
    }
    segments.push(segment);
  }
  return segments.join("/");
}
function normalizeRelativePath(value) {
  return normalizeSegments(value.trim());
}
function normalizeAbsolutePath(value) {
  const normalized = normalizePathSeparators(value.trim());
  const windowsMatch = normalized.match(/^([A-Za-z]:)(?:\/(.*))?$/);
  if (windowsMatch) {
    const segments2 = normalizeSegments(windowsMatch[2] || "");
    return segments2 ? `${windowsMatch[1]}/${segments2}` : `${windowsMatch[1]}/`;
  }
  const segments = normalizeSegments(normalized);
  return segments ? `/${segments}` : "/";
}
function isAbsolutePath(value) {
  const normalized = normalizePathSeparators(value.trim());
  return normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
}
function stripReadSliceSuffix2(value) {
  return value.replace(/:(\d+)-(\d+)$/, "");
}
function firstDefinedString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}
function parseRootPrefixedPath(value) {
  const normalized = normalizePathSeparators(value.trim());
  if (!normalized || isAbsolutePath(normalized)) {
    return null;
  }
  const match = normalized.match(/^([^/:]+):(.*)$/);
  if (!match) {
    return null;
  }
  const root = match[1];
  if (/^[A-Za-z]$/.test(root)) {
    return null;
  }
  const relativePath = normalizeRelativePath(match[2]);
  if (!relativePath) {
    return null;
  }
  return {
    root,
    relativePath
  };
}
function splitPathSegments(value) {
  return normalizePathSeparators(value).split("/").filter(Boolean);
}
function deriveRootFromAbsoluteAndRelative(absPath, relativePath) {
  const absSegments = splitPathSegments(normalizeAbsolutePath(absPath));
  const relSegments = splitPathSegments(normalizeRelativePath(relativePath));
  if (relSegments.length === 0 || absSegments.length <= relSegments.length) {
    return null;
  }
  for (let index = 1; index <= relSegments.length; index += 1) {
    if (absSegments[absSegments.length - index] !== relSegments[relSegments.length - index]) {
      return null;
    }
  }
  const derivedSegments = absSegments.slice(0, absSegments.length - relSegments.length);
  const firstSegment = derivedSegments[0] || "";
  if (/^[A-Za-z]:$/.test(firstSegment)) {
    return derivedSegments.join("/");
  }
  return `/${derivedSegments.join("/")}`;
}
function inferRootMappings(paths) {
  const absolutePaths = uniqStrings(
    paths.filter((value) => isAbsolutePath(value)).map((value) => normalizeAbsolutePath(value))
  );
  const rootRefs = paths.map((value) => parseRootPrefixedPath(value)).filter((value) => Boolean(value));
  const scoresByRoot = /* @__PURE__ */ new Map();
  for (const ref of rootRefs) {
    const rootScores = scoresByRoot.get(ref.root) ?? /* @__PURE__ */ new Map();
    for (const absolutePath of absolutePaths) {
      const candidateRoot = deriveRootFromAbsoluteAndRelative(absolutePath, ref.relativePath);
      if (!candidateRoot) {
        continue;
      }
      const bonus = path2.basename(candidateRoot) === ref.root ? 2 : 1;
      rootScores.set(candidateRoot, (rootScores.get(candidateRoot) ?? 0) + bonus);
    }
    scoresByRoot.set(ref.root, rootScores);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [root, scores] of scoresByRoot) {
    const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
    if (ranked.length === 0) {
      continue;
    }
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
      continue;
    }
    out.set(root, ranked[0][0]);
  }
  return out;
}
function getCurrentRootInfo(cwd) {
  if (!cwd || !isAbsolutePath(cwd)) {
    return null;
  }
  const absolutePath = normalizeAbsolutePath(cwd);
  return {
    absolutePath,
    name: path2.basename(absolutePath)
  };
}
function buildRootMappings(paths, currentRoot) {
  const mappings = inferRootMappings(paths);
  if (currentRoot) {
    mappings.set(currentRoot.name, currentRoot.absolutePath);
  }
  return mappings;
}
function isWithinPath(filePath, rootPath) {
  return filePath === rootPath || filePath.startsWith(`${rootPath}/`);
}
function findRootForAbsolutePath(absolutePath, rootMappings) {
  const normalizedAbsolutePath = normalizeAbsolutePath(absolutePath);
  let bestMatch = null;
  for (const [root, rootPath] of rootMappings) {
    if (!isWithinPath(normalizedAbsolutePath, rootPath) || normalizedAbsolutePath === rootPath) {
      continue;
    }
    const relativePath = normalizedAbsolutePath.slice(rootPath.length + 1);
    if (!relativePath) {
      continue;
    }
    if (!bestMatch || rootPath.length > bestMatch.rootPathLength) {
      bestMatch = { root, relativePath, rootPathLength: rootPath.length };
    }
  }
  return bestMatch ? { root: bestMatch.root, relativePath: bestMatch.relativePath } : null;
}
function normalizeTrackedPath(pathValue, rootMappings, currentRoot, sortedRootKeys) {
  const strippedPath = stripReadSliceSuffix2(pathValue.trim());
  if (!strippedPath) {
    return "";
  }
  const rootPrefixed = parseRootPrefixedPath(strippedPath);
  if (rootPrefixed) {
    return `${rootPrefixed.root}:${rootPrefixed.relativePath}`;
  }
  if (isAbsolutePath(strippedPath)) {
    const rooted = findRootForAbsolutePath(strippedPath, rootMappings);
    return rooted ? `${rooted.root}:${rooted.relativePath}` : normalizeAbsolutePath(strippedPath);
  }
  let relativePath = strippedPath;
  if (currentRoot && (relativePath === currentRoot.name || relativePath.startsWith(`${currentRoot.name}/`))) {
    relativePath = relativePath === currentRoot.name ? "" : relativePath.slice(currentRoot.name.length + 1);
  }
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) {
    return currentRoot?.absolutePath ?? "";
  }
  const keys = sortedRootKeys ?? [...rootMappings.keys()].sort((left, right) => right.length - left.length);
  const rootedRelative = keys.find((root) => normalizedRelativePath.startsWith(`${root}/`));
  if (rootedRelative) {
    return `${rootedRelative}:${normalizedRelativePath.slice(rootedRelative.length + 1)}`;
  }
  return currentRoot ? `${currentRoot.name}:${normalizedRelativePath}` : normalizedRelativePath;
}
function resolveCanonicalPath(canonicalPath, rootMappings, currentRoot) {
  if (!canonicalPath) {
    return canonicalPath;
  }
  if (isAbsolutePath(canonicalPath)) {
    return normalizeAbsolutePath(canonicalPath);
  }
  const rootPrefixed = parseRootPrefixedPath(canonicalPath);
  if (rootPrefixed) {
    const rootPath = rootMappings.get(rootPrefixed.root) ?? (currentRoot?.name === rootPrefixed.root ? currentRoot.absolutePath : null);
    if (!rootPath) {
      return canonicalPath;
    }
    return `${rootPath}/${rootPrefixed.relativePath}`;
  }
  const normalizedRelativePath = normalizeRelativePath(canonicalPath);
  if (!normalizedRelativePath) {
    return currentRoot?.absolutePath ?? canonicalPath;
  }
  return currentRoot ? `${currentRoot.absolutePath}/${normalizedRelativePath}` : normalizedRelativePath;
}
function resolveMoveRedirect(pathValue, redirects) {
  let current = pathValue;
  const seen = /* @__PURE__ */ new Set();
  while (redirects.has(current) && !seen.has(current)) {
    seen.add(current);
    current = redirects.get(current) ?? current;
  }
  return current;
}
function extractJsonObject(text, prefix) {
  const trimmed = text.trim();
  if (!trimmed.startsWith(prefix)) {
    return null;
  }
  const jsonText = trimmed.slice(prefix.length).trim();
  if (!jsonText.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function extractJsonObjectAnywhere(text, prefix) {
  const idx = text.indexOf(prefix);
  if (idx === -1) return null;
  const after = text.slice(idx + prefix.length).trim();
  if (!after.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(after);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function extractFileActionsFromJson(args) {
  const action = typeof args.action === "string" ? args.action : "";
  const targetPath = typeof args.path === "string" ? args.path : null;
  const newPath = typeof args.new_path === "string" ? args.new_path : null;
  if (action === "create" && targetPath) {
    return { kind: "touch", path: targetPath, operation: "write" };
  }
  if (action === "delete" && targetPath) {
    return { kind: "touch", path: targetPath, operation: "delete" };
  }
  if (action === "move" && targetPath && newPath) {
    return { kind: "move", from: targetPath, to: newPath };
  }
  return null;
}
function actionAlreadyCaptured(existing, action) {
  for (const a of existing) {
    if (a.kind !== action.kind) continue;
    if (a.kind === "move" && action.kind === "move") {
      if (a.from === action.from && a.to === action.to) return true;
    } else if (a.kind === "touch" && action.kind === "touch") {
      if (a.path === action.path && a.operation === action.operation) return true;
    }
  }
  return false;
}
function extractCliNamedArg(cmd, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cmd.match(new RegExp(`(?:^|\\s)${escapedKey}=(?:"([^"]+)"|'([^']+)'|(\\S+))`));
  return firstDefinedString(...match?.slice(1) ?? []);
}
function commandStartsWith(cmd, name) {
  const trimmed = cmd.trim();
  return trimmed === name || trimmed.startsWith(`${name} `);
}
function extractReadPathFromCliCommand(cmd) {
  const readFileMatch = cmd.match(/(?:^|\s)read_file\s+.*?\bpath=(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (readFileMatch) {
    return stripReadSliceSuffix2(firstDefinedString(...readFileMatch.slice(1)) ?? "");
  }
  const simpleReadMatch = cmd.match(/^(?:read|cat)\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (simpleReadMatch) {
    return stripReadSliceSuffix2(firstDefinedString(...simpleReadMatch.slice(1)) ?? "");
  }
  return null;
}
function tokenizeShellCommand(cmd) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  const flush = () => {
    if (current) {
      tokens.push(current);
      current = "";
    }
  };
  for (let index = 0; index < cmd.length; index += 1) {
    const char = cmd[index];
    const next = cmd[index + 1] ?? "";
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (quote) {
      if (quote === '"' && char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "\r" || char === "\n") {
      flush();
      tokens.push(";");
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (char === ";") {
      flush();
      tokens.push(char);
      continue;
    }
    if ((char === "&" || char === "|") && next === char) {
      flush();
      tokens.push(char + next);
      index += 1;
      continue;
    }
    if (char === "&" || char === "|") {
      flush();
      tokens.push(char);
      continue;
    }
    current += char;
  }
  flush();
  return tokens;
}
function splitShellCommands(cmd) {
  const commands = [];
  let current = [];
  for (const token of tokenizeShellCommand(cmd)) {
    if (token === ";" || token === "&&" || token === "||" || token === "|" || token === "&") {
      if (current.length > 0) {
        commands.push(current);
        current = [];
      }
      continue;
    }
    current.push(token);
  }
  if (current.length > 0) {
    commands.push(current);
  }
  return commands;
}
function stripShellCommandWrappers(tokens) {
  let current = [...tokens];
  while (current.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(current[0])) {
    current = current.slice(1);
  }
  for (const wrapper of ["command", "env", "noglob", "sudo"]) {
    if (current[0] !== wrapper) {
      continue;
    }
    current = current.slice(1);
    while (current.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(current[0])) {
      current = current.slice(1);
    }
  }
  return current;
}
function extractShellOperands(tokens) {
  const operands = [];
  let allowFlags = true;
  for (const token of tokens) {
    if (allowFlags && token === "--") {
      allowFlags = false;
      continue;
    }
    if (allowFlags && token.startsWith("-")) {
      continue;
    }
    operands.push(token);
  }
  return operands;
}
function extractHeadTailReadOperands(tokens) {
  const operands = [];
  let allowFlags = true;
  let skipNextOptionValue = false;
  for (const token of tokens) {
    if (skipNextOptionValue) {
      skipNextOptionValue = false;
      continue;
    }
    if (allowFlags && token === "--") {
      allowFlags = false;
      continue;
    }
    if (allowFlags && (token === "-n" || token === "-c" || token === "--lines" || token === "--bytes")) {
      skipNextOptionValue = true;
      continue;
    }
    if (allowFlags && (token.startsWith("-") || /^[+]\d+[bcflkm]?$/.test(token))) {
      continue;
    }
    operands.push(token);
  }
  return operands;
}
function isIgnoredRedirectTarget(value) {
  return value === "/dev/null" || value === "/dev/stderr" || value === "/dev/stdout";
}
function isLiteralShellPathOperand(value) {
  return !/[`$]/.test(value) && !value.startsWith("<(") && !value.startsWith(">(");
}
function pushShellTouch(actions, pathValue, operation) {
  if (isLiteralShellPathOperand(pathValue)) {
    actions.push({ kind: "touch", path: pathValue, operation });
  }
}
function pushShellMove(actions, from, to) {
  if (isLiteralShellPathOperand(from) && isLiteralShellPathOperand(to)) {
    actions.push({ kind: "move", from, to });
  }
}
function extractRedirectWriteTargets(tokens, actions) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === ">" || token === ">>" || token === "2>" || token === "2>>") {
      if (i + 1 < tokens.length && !isIgnoredRedirectTarget(tokens[i + 1])) {
        if (tokens[i + 1] === "|") {
          if (i + 2 < tokens.length && !isIgnoredRedirectTarget(tokens[i + 2])) {
            pushShellTouch(actions, tokens[i + 2], "write");
          }
          i += 2;
        } else {
          pushShellTouch(actions, tokens[i + 1], "write");
          i += 1;
        }
      } else {
        i += 1;
      }
      continue;
    }
    if ((token.startsWith(">>") || token.startsWith("2>>")) && token.length > (token.startsWith("2") ? 3 : 2)) {
      const target = token.slice(token.startsWith("2") ? 3 : 2);
      if (!isIgnoredRedirectTarget(target)) {
        pushShellTouch(actions, target, "write");
      }
      continue;
    }
    if ((token.startsWith(">") || token.startsWith("2>")) && token.length > (token.startsWith("2") ? 2 : 1)) {
      const target = token.slice(token.startsWith("2") ? 2 : 1);
      if (!isIgnoredRedirectTarget(target)) {
        pushShellTouch(actions, target, "write");
      }
      continue;
    }
  }
}
function looksLikeSedExpression(value) {
  return /^[sy]([^A-Za-z0-9\s]).*?\1.*?\1/.test(value) || /^\/.+\//.test(value) || /^\d+[,\d]*[acdipqs]?$/.test(value);
}
function stripRedirectTokens(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === ">" || token === ">>" || token === "2>" || token === "2>>" || token === ">|" || token === "<") {
      i += 1;
      continue;
    }
    if (token === "<<" || token === "<<-" || token === "<<~") {
      i += 1;
      continue;
    }
    if (token.startsWith(">>") || token.startsWith(">") || token.startsWith("2>>") || token.startsWith("2>") || token.startsWith("<<") || token.startsWith("<")) {
      continue;
    }
    result.push(token);
  }
  return result;
}
function stripHeredocBodies(cmd) {
  const lines = cmd.split("\n");
  const result = [];
  let terminator = null;
  let justClosedHeredoc = false;
  for (const line of lines) {
    if (terminator !== null) {
      if (line.trim() === terminator) {
        terminator = null;
        justClosedHeredoc = true;
      }
      continue;
    }
    const match = line.match(/<<-?\s*(?:['"]([\w]+)['"]|([\w]+))/);
    if (match) {
      terminator = match.at(1) ?? match.at(2) ?? null;
    }
    if (justClosedHeredoc) {
      result.push("; " + line);
      justClosedHeredoc = false;
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}
function parseBashActions(cmd) {
  const actions = [];
  for (const tokens of splitShellCommands(stripHeredocBodies(cmd))) {
    extractRedirectWriteTargets(tokens, actions);
    const command = stripShellCommandWrappers(stripRedirectTokens(tokens));
    if (command.length === 0) {
      continue;
    }
    if (command[0] === "git" && command[1] === "mv") {
      const operands = extractShellOperands(command.slice(2));
      if (operands.length === 2) {
        pushShellMove(actions, operands[0], operands[1]);
      }
      continue;
    }
    if (command[0] === "git" && command[1] === "rm") {
      for (const operand of extractShellOperands(command.slice(2))) {
        pushShellTouch(actions, operand, "delete");
      }
      continue;
    }
    if (command[0] === "mv") {
      const operands = extractShellOperands(command.slice(1));
      if (operands.length === 2) {
        pushShellMove(actions, operands[0], operands[1]);
      }
      continue;
    }
    if (command[0] === "rm" || command[0] === "trash" || command[0] === "trash-put" || command[0] === "unlink") {
      for (const operand of extractShellOperands(command.slice(1))) {
        pushShellTouch(actions, operand, "delete");
      }
      continue;
    }
    if (command[0] === "sed") {
      if (command.some((t) => /^-[a-z]*i/.test(t))) {
        const hasExplicitExpr = command.some((t) => t === "-e" || t === "-f");
        const operands = extractShellOperands(command.slice(1));
        const fileOperands = hasExplicitExpr ? operands : operands.slice(1);
        for (const operand of fileOperands) {
          if (!looksLikeSedExpression(operand)) {
            pushShellTouch(actions, operand, "edit");
          }
        }
      }
      continue;
    }
    if (command[0] === "cp" || command[0] === "rsync") {
      const operands = extractShellOperands(command.slice(1));
      if (operands.length >= 2) {
        pushShellTouch(actions, operands[operands.length - 1], "write");
      }
      continue;
    }
    if (command[0] === "tee") {
      for (const operand of extractShellOperands(command.slice(1))) {
        pushShellTouch(actions, operand, "write");
      }
      continue;
    }
    if (command[0] === "touch") {
      for (const operand of extractShellOperands(command.slice(1))) {
        pushShellTouch(actions, operand, "write");
      }
      continue;
    }
    if (command[0] === "patch") {
      const operands = extractShellOperands(command.slice(1));
      if (operands.length >= 1) {
        pushShellTouch(actions, operands[0], "edit");
      }
      continue;
    }
    if (command[0] === "curl") {
      for (let i = 1; i < command.length; i++) {
        if ((command[i] === "-o" || command[i] === "--output") && i + 1 < command.length) {
          pushShellTouch(actions, command[i + 1], "write");
          break;
        }
      }
      continue;
    }
    if (command[0] === "wget") {
      for (let i = 1; i < command.length; i++) {
        if ((command[i] === "-O" || command[i] === "--output-document") && i + 1 < command.length) {
          pushShellTouch(actions, command[i + 1], "write");
          break;
        }
      }
      continue;
    }
    if (command[0] === "cat") {
      for (const operand of extractShellOperands(command.slice(1))) {
        pushShellTouch(actions, operand, "read");
      }
      continue;
    }
    if (command[0] === "head" || command[0] === "tail") {
      for (const operand of extractHeadTailReadOperands(command.slice(1))) {
        pushShellTouch(actions, operand, "read");
      }
      continue;
    }
  }
  return actions;
}
function parseRpExecActions(cmd) {
  const normalized = cmd.trim();
  if (!normalized) {
    return [];
  }
  const actions = [];
  const jsonSearches = [
    [
      "call read_file",
      (args) => typeof args.path === "string" ? {
        kind: "touch",
        path: stripReadSliceSuffix2(args.path),
        operation: "read"
      } : null
    ],
    [
      "call apply_edits",
      (args) => typeof args.path === "string" ? { kind: "touch", path: args.path, operation: "edit" } : null
    ],
    ["call file_actions", (args) => extractFileActionsFromJson(args)]
  ];
  for (const line of normalized.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    for (const [prefix, build] of jsonSearches) {
      const args = extractJsonObject(trimmedLine, prefix);
      if (args) {
        const action = build(args);
        if (action) actions.push(action);
      }
    }
  }
  for (const [prefix, build] of jsonSearches) {
    const args = extractJsonObjectAnywhere(normalized, prefix);
    if (args) {
      const action = build(args);
      if (action && !actionAlreadyCaptured(actions, action)) {
        actions.push(action);
      }
    }
  }
  if (commandStartsWith(normalized, "apply_edits")) {
    const targetPath = extractCliNamedArg(normalized, "path");
    if (targetPath) {
      actions.push({ kind: "touch", path: targetPath, operation: "edit" });
    }
  }
  if (commandStartsWith(normalized, "file_actions")) {
    const action = extractCliNamedArg(normalized, "action");
    const targetPath = extractCliNamedArg(normalized, "path");
    const newPath = extractCliNamedArg(normalized, "new_path");
    if (action === "create" && targetPath) {
      actions.push({ kind: "touch", path: targetPath, operation: "write" });
    }
    if (action === "delete" && targetPath) {
      actions.push({ kind: "touch", path: targetPath, operation: "delete" });
    }
    if (action === "move" && targetPath && newPath) {
      actions.push({ kind: "move", from: targetPath, to: newPath });
    }
  }
  for (const command of splitShellCommands(normalized)) {
    if (command[0] !== "file") {
      continue;
    }
    if (command[1] === "delete") {
      for (const operand of extractShellOperands(command.slice(2))) {
        actions.push({ kind: "touch", path: operand, operation: "delete" });
      }
      continue;
    }
    if (command[1] === "move") {
      const operands = extractShellOperands(command.slice(2));
      if (operands.length === 2) {
        actions.push({ kind: "move", from: operands[0], to: operands[1] });
      }
    }
  }
  const readPath = extractReadPathFromCliCommand(normalized);
  if (readPath) {
    actions.push({ kind: "touch", path: readPath, operation: "read" });
  }
  return actions;
}
function getTrackedToolActions(name, args) {
  const pathLikeArg = firstDefinedString(args.path, args.file_path, args.filePath, args.file);
  if ((name === "read" || name === "write" || name === "edit") && pathLikeArg) {
    return [{ kind: "touch", path: pathLikeArg, operation: name }];
  }
  if (name === "rp") {
    const rpCall = typeof args.call === "string" ? args.call : null;
    const rpArgs = args.args && typeof args.args === "object" && !Array.isArray(args.args) ? args.args : null;
    if (!rpCall || !rpArgs) {
      return [];
    }
    if (rpCall === "read_file" && typeof rpArgs.path === "string") {
      return [{ kind: "touch", path: rpArgs.path, operation: "read" }];
    }
    if (rpCall === "apply_edits" && typeof rpArgs.path === "string") {
      return [{ kind: "touch", path: rpArgs.path, operation: "edit" }];
    }
    if (rpCall === "file_actions") {
      const action = typeof rpArgs.action === "string" ? rpArgs.action : "";
      if (action === "create" && typeof rpArgs.path === "string") {
        return [{ kind: "touch", path: rpArgs.path, operation: "write" }];
      }
      if (action === "delete" && typeof rpArgs.path === "string") {
        return [{ kind: "touch", path: rpArgs.path, operation: "delete" }];
      }
      if (action === "move" && typeof rpArgs.path === "string" && typeof rpArgs.new_path === "string") {
        return [{ kind: "move", from: rpArgs.path, to: rpArgs.new_path }];
      }
    }
  }
  if (name === "rp_exec") {
    const cmd = typeof args.cmd === "string" ? args.cmd : "";
    return parseRpExecActions(cmd);
  }
  if (name === "bash") {
    const command = typeof args.command === "string" ? args.command : "";
    return parseBashActions(command);
  }
  return [];
}
var RESULT_TOUCH_PATTERNS = [
  {
    re: /\bSuccessfully replaced (?:\d+ block\(s\) )?in (\S+?)(?:\.\s|\.$|\s|$)/,
    op: "edit"
  },
  {
    re: /\bSuccessfully inserted[^\n]*?\bin (\S+?)(?:\.\s|\.$|\s|$)/,
    op: "edit"
  },
  {
    re: /\bSuccessfully wrote (?:\d+ bytes )?to (\S+?)(?:\.\s|\.$|\s|$)/,
    op: "write"
  }
];
var RESULT_FALLBACK_TOOL_RE = /(edit|replace|insert|patch|apply|write|save|update|create|remove|delete)/i;
function extractTouchActionsFromResultText(toolName, text) {
  if (!RESULT_FALLBACK_TOOL_RE.test(toolName)) {
    return [];
  }
  for (const { re, op } of RESULT_TOUCH_PATTERNS) {
    const match = text.match(re);
    if (match?.[1]) {
      return [{ kind: "touch", path: match[1], operation: op }];
    }
  }
  return [];
}
function extractTextFromContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((block) => {
    if (typeof block === "string") {
      return block;
    }
    if (!block || typeof block !== "object") {
      return "";
    }
    return typeof block.text === "string" ? block.text : "";
  }).filter(Boolean).join("\n");
}
function getToolCallId(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return firstDefinedString(
    value.id,
    value.toolCallId,
    value.tool_call_id,
    value.tool_use_id
  );
}
var NOOP_EDIT_RE = /applied:\s*0|no changes applied|no changes made|nothing to (?:do|change)|classification:\s*noop/i;
function collectFilesTouched(messages, cwd) {
  const toolCalls = /* @__PURE__ */ new Map();
  for (const msg of messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
      continue;
    }
    for (const block of msg.content) {
      if (typeof block !== "object" || block.type !== "toolCall") {
        continue;
      }
      const toolCallId = getToolCallId(block);
      const toolName = typeof block.name === "string" ? block.name : "";
      const args = block.arguments;
      const argObject = args && typeof args === "object" && !Array.isArray(args) ? args : {};
      if (!toolCallId || !toolName) {
        continue;
      }
      const actions = getTrackedToolActions(toolName, argObject);
      if (actions.length > 0) {
        toolCalls.set(toolCallId, actions);
      }
    }
  }
  const touches = [];
  const moves = [];
  for (const msg of messages) {
    const role = msg.role;
    if (role === "bashExecution") {
      const bashMsg = msg;
      const command = typeof bashMsg.command === "string" ? bashMsg.command : "";
      const actions2 = parseBashActions(command);
      const timestamp2 = typeof bashMsg.timestamp === "number" ? bashMsg.timestamp : 0;
      for (const action of actions2) {
        if (action.kind === "move") {
          moves.push({ from: action.from, to: action.to });
          touches.push({ path: action.to, operation: "move", timestamp: timestamp2 });
        } else {
          touches.push({ path: action.path, operation: action.operation, timestamp: timestamp2 });
        }
      }
      continue;
    }
    if (role !== "toolResult") {
      continue;
    }
    const toolResultMsg = msg;
    if (toolResultMsg.isError) {
      continue;
    }
    const toolCallId = getToolCallId(msg);
    if (!toolCallId) {
      continue;
    }
    let actions = toolCalls.get(toolCallId);
    const toolResultText = extractTextFromContent(msg.content);
    const isNoOpEdit = NOOP_EDIT_RE.test(toolResultText);
    if ((!actions || actions.length === 0) && !isNoOpEdit) {
      actions = extractTouchActionsFromResultText(toolResultMsg.toolName, toolResultText);
    }
    if (!actions || actions.length === 0) {
      continue;
    }
    const timestamp = msg.timestamp ?? 0;
    for (const action of actions) {
      if (action.kind === "move") {
        moves.push({ from: action.from, to: action.to });
        touches.push({
          path: action.to,
          operation: "move",
          timestamp
        });
        continue;
      }
      if (isNoOpEdit && action.operation === "edit") {
        continue;
      }
      touches.push({
        path: action.path,
        operation: action.operation,
        timestamp
      });
    }
  }
  const currentRoot = getCurrentRootInfo(cwd);
  const rootMappings = buildRootMappings(
    [...touches.map((touch) => touch.path), ...moves.flatMap((move) => [move.from, move.to])],
    currentRoot
  );
  const sortedRootKeys = [...rootMappings.keys()].sort((left, right) => right.length - left.length);
  const redirects = /* @__PURE__ */ new Map();
  for (const move of moves) {
    const fromPath = normalizeTrackedPath(move.from, rootMappings, currentRoot, sortedRootKeys);
    const toPath = normalizeTrackedPath(move.to, rootMappings, currentRoot, sortedRootKeys);
    if (fromPath && toPath && fromPath !== toPath) {
      redirects.set(fromPath, toPath);
    }
  }
  const merged = /* @__PURE__ */ new Map();
  for (const touch of touches) {
    const normalizedPath = normalizeTrackedPath(
      touch.path,
      rootMappings,
      currentRoot,
      sortedRootKeys
    );
    const canonicalPath = resolveMoveRedirect(normalizedPath, redirects);
    if (!canonicalPath) {
      continue;
    }
    const existing = merged.get(canonicalPath);
    if (existing) {
      existing.operations.add(touch.operation);
      if (touch.timestamp >= existing.lastTimestamp) {
        existing.lastTimestamp = touch.timestamp;
        existing.lastOperation = touch.operation;
      }
      continue;
    }
    merged.set(canonicalPath, {
      operations: /* @__PURE__ */ new Set([touch.operation]),
      lastTimestamp: touch.timestamp,
      lastOperation: touch.operation
    });
  }
  const prepared = [...merged.entries()].map(([canonicalPath, value]) => {
    const resolvedPath = resolveCanonicalPath(canonicalPath, rootMappings, currentRoot);
    return {
      path: resolvedPath,
      operations: value.operations,
      lastOperation: value.lastOperation,
      lastTimestamp: value.lastTimestamp
    };
  }).sort((left, right) => right.lastTimestamp - left.lastTimestamp);
  return prepared;
}

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/extract/preferences.ts
var PREF_PATTERNS = [
  /\bprefer(?:s|red|ring)?\s+\w/i,
  /\bdon'?t want\b/i,
  /\balways (?:use|do|run|prefer|keep|make|format|write|add|set|put|prefix|start|include|append)\b/i,
  /\bnever (?:use|do|run|push|commit|write|ignore|add|set|put|remove|delete|include|deploy)\b/i,
  /\bplease (?:use|avoid|keep|make|don'?t|do not|format|write)\b/i,
  /\b(?:style|format|language|naming)\s*[:=]\s*\S/i,
  // Correction anchors — directive/negation markers rather than preference
  // verbs. English.
  /\bstop (?:doing|using|adding|running|writing|committing|pushing)\b/i,
  /\b(?:that's|this is) wrong\b/i,
  /\b(?:revert|undo) (?:that|this|the|it|your)\b/i,
  // Correction anchors — common CJK directive/negation markers. CJK has no
  // word boundaries, so no \b. Deliberately excludes broad negatives (不行,
  // 不对, 别) that occur in conversational chatter (如果不行的话, 别人).
  /不要|不用|别再|回退|错了|停止/,
  // Standing-instruction markers — 以后/下次/必须 scope future behavior, so
  // they are preference signals by construction. 记住 fires unless followed
  // by an acknowledgement particle: 记住了/记住吧/记住哦 acknowledges a
  // previous message rather than directing future work.
  /以后|下次|必须|记住(?!了|吧|哦)/
];
var INTERROGATIVE_START_RE = /^(?:what|where|when|who|whom|whose|why|how|which)\b/i;
var CJK_INTERROGATIVE_RE = /为什么|怎么|如何|什么|哪里|哪儿|哪个|哪些|怎样|咋/;
var extractPreferences = (blocks) => {
  const prefs = [];
  const seen = /* @__PURE__ */ new Set();
  for (const b of blocks) {
    if (b.kind !== "user") continue;
    let perBlock = 0;
    for (const line of nonEmptyLines(b.text)) {
      const trimmed = line.trim();
      const minLength = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(trimmed) ? 2 : 5;
      if (!trimmed || trimmed.length < minLength) continue;
      if (trimmed.length > 200) continue;
      const questionText = trimmed.replace(/^[“‘"'「『]+/, "").replace(/[”’"'」』]+$/, "");
      if ((questionText.endsWith("?") || questionText.endsWith("\uFF1F")) && (INTERROGATIVE_START_RE.test(questionText) || CJK_INTERROGATIVE_RE.test(questionText)))
        continue;
      if (!PREF_PATTERNS.some((p) => p.test(trimmed))) continue;
      const clipped = clip(trimmed, 200);
      const key = clipped.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      prefs.push(clipped);
      if (++perBlock >= 1) break;
    }
  }
  return prefs.slice(0, 10);
};
var dedupPreferencesAgainstGoals = (prefs, goals) => {
  const norm = (s) => s.trim().toLowerCase();
  const goalSet = new Set(goals.map(norm));
  return prefs.filter((p) => !goalSet.has(norm(p)));
};

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/extract/commits.ts
var HASH_RE = /\b([0-9a-f]{8,12})\b/;
var OUTPUT_COMMIT_RE = /\[(?:[^\]\n]*\s)?([0-9a-f]{7,12})\]\s+(.+)/;
var NOTHING_TO_COMMIT_RE = /nothing(?: to commit| added to commit but untracked)|no changes added to commit/;
var firstLineOf = (text) => {
  const line = text.split(/\\n|\n/)[0] ?? "";
  return line.trim();
};
var cleanMessage = (msg) => msg.replace(/\\"/g, '"').replace(/\\'/g, "'").trim();
var tokenizeCommand = (cmd) => {
  const joined = cmd.replace(/\\\s*\n/g, " ");
  const tokens = [];
  let cur = "";
  let quote;
  for (let i = 0; i < joined.length; i++) {
    const c = joined[i];
    if (quote) {
      if (c === quote) {
        quote = void 0;
        cur += c;
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === "\n") {
      if (cur) tokens.push(cur);
      cur = "";
      tokens.push("\n");
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) tokens.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur) tokens.push(cur);
  return tokens;
};
var stripHeredocBodies2 = (cmd) => {
  const out = [];
  let delim;
  for (const line of cmd.split("\n")) {
    if (delim !== void 0) {
      if (line.trim() === delim) delim = void 0;
      continue;
    }
    const m = line.match(/<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (m) delim = m[2];
    out.push(line);
  }
  return out.join("\n");
};
var SHELL_CONTROL = /* @__PURE__ */ new Set(["&&", "||", ";", "|", "&", "\n"]);
var unquoteToken = (t) => t.length >= 2 && (t[0] === '"' && t[t.length - 1] === '"' || t[0] === "'" && t[t.length - 1] === "'") ? t.slice(1, -1) : t;
var isDryRunToken = (t) => {
  const u = unquoteToken(t);
  return u === "--dry-run" || u === "-n";
};
var EXEC_WRAPPER_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
var EXEC_WRAPPERS = /* @__PURE__ */ new Set(["sudo", "env", "time", "nice", "nohup", "command", "exec"]);
var segmentHeadIsGit = (tokens, start) => {
  let k = start;
  while (k < tokens.length) {
    const u2 = unquoteToken(tokens[k]);
    if (EXEC_WRAPPER_RE.test(u2) || EXEC_WRAPPERS.has(u2)) {
      k += 1;
      continue;
    }
    break;
  }
  const head = tokens[k];
  if (!head) return false;
  const u = unquoteToken(head);
  return u === "git" || u.endsWith("/git");
};
var segmentStartOf = (tokens, i) => {
  for (let j = i - 1; j >= 0; j--) {
    if (SHELL_CONTROL.has(tokens[j])) return j + 1;
  }
  return 0;
};
var segmentInvokesCommit = (tokens) => {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "commit") continue;
    if (!segmentHeadIsGit(tokens, segmentStartOf(tokens, i))) continue;
    if (tokens.some(isDryRunToken)) continue;
    return true;
  }
  return false;
};
var commitSegments = (cmd) => {
  const tokens = tokenizeCommand(stripHeredocBodies2(cmd));
  const segments = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "commit") continue;
    const segEnd = tokens.findIndex((t, k) => k > i && SHELL_CONTROL.has(t));
    const segment = tokens.slice(segmentStartOf(tokens, i), segEnd === -1 ? tokens.length : segEnd);
    if (!segmentHeadIsGit(tokens, segmentStartOf(tokens, i))) continue;
    if (segment.some(isDryRunToken)) continue;
    segments.push(segment);
  }
  return segments;
};
var isGitCommitCommand = (cmd) => commitSegments(cmd).length > 0;
var heredocSubject = (body) => {
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    return line;
  }
  return void 0;
};
var STDIN_FLAG_RE = /(?:^|\s)(?:-F|--file)(?:=|\s+)-(?=\s|$)|(?:^|\s)--stdin(?:\s|$)/;
var HEREDOC_RE = /<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1\s*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?:\n|$)/;
var extractHeredocMessage = (cmd) => {
  for (const m of cmd.matchAll(new RegExp(STDIN_FLAG_RE.source, "g"))) {
    const flagIdx = m.index ?? 0;
    const before = stripHeredocBodies2(cmd.slice(0, flagIdx));
    const tokens = tokenizeCommand(before);
    let segStart = 0;
    for (let k = 0; k < tokens.length; k++) {
      if (SHELL_CONTROL.has(tokens[k])) segStart = k + 1;
    }
    if (!segmentInvokesCommit(tokens.slice(segStart))) continue;
    const hm = cmd.slice(flagIdx).match(HEREDOC_RE);
    if (!hm) continue;
    return heredocSubject(hm[3]);
  }
  return void 0;
};
var extractDashMMessage = (cmd) => {
  for (const segment of commitSegments(cmd)) {
    const text = segment.join(" ");
    const m = text.match(/(?:^|\s)-m\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+))/) ?? text.match(/(?:^|\s)--message(?:=|\s+)(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+))/);
    if (!m) continue;
    const message = firstLineOf(cleanMessage(m[1] ?? m[2] ?? m[3] ?? ""));
    if (message) return message;
  }
  return void 0;
};
var extractHashFromOutput = (text) => {
  const bracket = text.match(/\[(?:[^\]\n]*\s)?([0-9a-f]{7,12})\]/);
  if (bracket) return bracket[1];
  const range = text.match(/\b([0-9a-f]{7,12})\.\.([0-9a-f]{7,12})\b/);
  if (range) return range[2];
  const plain = text.match(HASH_RE);
  if (plain) return plain[1];
  return void 0;
};
var extractOutputSubject = (output) => {
  const m = output.match(OUTPUT_COMMIT_RE);
  if (!m) return void 0;
  const subject = firstLineOf(m[2]);
  return subject ? { hash: m[1], subject } : void 0;
};
var extractFromCommitCommand = (cmd, output) => {
  if (!isGitCommitCommand(cmd)) return {};
  if (NOTHING_TO_COMMIT_RE.test(output)) return { failed: true };
  const dashM = extractDashMMessage(cmd);
  if (dashM) return { message: dashM };
  const heredoc = extractHeredocMessage(cmd);
  if (heredoc) return { message: heredoc };
  const fromOutput = extractOutputSubject(output);
  if (fromOutput) return { message: fromOutput.subject };
  const hash = extractHashFromOutput(output);
  if (hash) return { message: "(message not captured)" };
  return {};
};
var tryExtract = (cmd, output) => {
  const { message, failed } = extractFromCommitCommand(cmd, output);
  if (failed || !message) return void 0;
  const hash = extractHashFromOutput(output);
  return { hash, message };
};
var extractCommits = (blocks) => {
  const commits = [];
  const addCommit = (hash, message, sourceIndex) => {
    const key = `${hash ?? ""}::${message}`;
    if (!commits.some((c) => `${c.hash ?? ""}::${c.message}` === key)) {
      commits.push({ hash, message, sourceIndex });
    }
  };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "tool_call" && b.name === "bash") {
      const cmd = b.args && typeof b.args.command === "string" ? b.args.command : "";
      if (!isGitCommitCommand(cmd)) continue;
      for (let j = i + 1; j < Math.min(blocks.length, i + 3); j++) {
        const r = blocks[j];
        if (r.kind !== "tool_result") continue;
        if (r.name !== b.name) continue;
        if (r.isError) break;
        const commit = tryExtract(cmd, r.text);
        if (commit) addCommit(commit.hash, commit.message, b.sourceIndex);
        break;
      }
      continue;
    }
    if (b.kind === "bash") {
      if (b.exitCode !== void 0 && b.exitCode !== 0) continue;
      const commit = tryExtract(b.command, b.output);
      if (commit) addCommit(commit.hash, commit.message, b.sourceIndex);
      continue;
    }
    if (b.kind === "user") {
      const ranCmd = b.text.match(/Ran\s+`((?:[^`\\]|\\.)*)`/);
      if (!ranCmd) continue;
      if (!isGitCommitCommand(ranCmd[1])) continue;
      const codeBlock = b.text.match(/```\n([\s\S]*?)```/);
      const output = codeBlock ? codeBlock[1] : "";
      const commit = tryExtract(ranCmd[1], output);
      if (commit) addCommit(commit.hash, commit.message, b.sourceIndex);
    }
  }
  return commits;
};
var formatCommits = (commits, limit = 8) => {
  const lines = [];
  const items = commits.slice(-limit);
  for (const c of items) {
    const prefix = c.hash ? `${c.hash}: ` : "";
    const ref = c.sourceIndex != null ? ` (#${c.sourceIndex})` : "";
    lines.push(`${prefix}${c.message}${ref}`);
  }
  return lines;
};

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/brief.ts
var TRUNCATE_USER = 256;
var TRUNCATE_ASSISTANT = 200;
var SELF_TALK_PREFIX_RE = /^\s*(?:hmm|wait|actually|oh|okay|ok|well|so)[,.!\s-]+/i;
var isNoiseUser = (text) => {
  return !text.trim();
};
var STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "must",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "under",
  "over",
  "and",
  "but",
  "or",
  "nor",
  "not",
  "so",
  "yet",
  "both",
  "either",
  "neither",
  "each",
  "every",
  "all",
  "any",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "him",
  "his",
  "she",
  "her",
  "they",
  "them",
  "their",
  "who",
  "which",
  "what",
  "if",
  "then",
  "than",
  "when",
  "where",
  "how",
  "just",
  "also"
]);
var truncateTokens = (text, limit) => {
  const flat = text.replace(/\s+/g, " ").trim();
  let count = 0;
  let lastEnd = 0;
  for (const seg of wordSegments(flat)) {
    if (isWordSegment(seg)) {
      if (!STOP_WORDS.has(seg.segment.toLowerCase())) {
        count++;
        if (count > limit) {
          return flat.slice(0, lastEnd).trimEnd() + "...(truncated)";
        }
      }
    }
    lastEnd = seg.index + seg.segment.length;
  }
  return flat;
};
var BASH_CAP = 120;
var PIPE_TAIL_RE = /\s*\|\s*(?:head|tail|sort|wc|column|tr|cut|uniq)(?:\s[^|]*)?$/;
var compressBash = (raw) => {
  let cmd = raw.split("\n").map((l) => l.trim()).filter(Boolean).join("; ");
  cmd = cmd.replace(/^cd\s+\S+\s*&&\s*/, "");
  for (let i = 0; i < 10; i++) {
    const stripped = cmd.replace(PIPE_TAIL_RE, "");
    if (stripped === cmd) break;
    cmd = stripped;
  }
  if (cmd.length > BASH_CAP) {
    const cut = cmd.lastIndexOf(" ", BASH_CAP - 2);
    const end = cut > BASH_CAP * 0.6 ? cut : BASH_CAP - 3;
    return cmd.slice(0, end).trimEnd() + "...";
  }
  return cmd;
};
var TOOL_SUMMARY_FIELDS = {
  Read: "file_path",
  Edit: "file_path",
  Write: "file_path",
  read: "path",
  edit: "path",
  write: "path",
  Glob: "pattern",
  Grep: "pattern"
};
var toolOneLiner = (name, args) => {
  const field = TOOL_SUMMARY_FIELDS[name];
  if (field && typeof args[field] === "string") {
    return `* ${name} "${args[field]}"`;
  }
  const path3 = extractPath(args);
  if (path3) return `* ${name} "${path3}"`;
  if (name === "bash" || name === "Bash") {
    const raw = args.command ?? args.description ?? "";
    const cmd = compressBash(raw);
    return `* ${name} "${cmd}"`;
  }
  if (typeof args.query === "string") {
    return `* ${name} "${clip(args.query, 60)}"`;
  }
  return `* ${name}`;
};
var buildBriefSections = (blocks) => {
  const sections = [];
  let lastHeader = "";
  const push = (header, line) => {
    if (header === lastHeader && sections.length > 0) {
      sections[sections.length - 1].lines.push(line);
      return;
    }
    sections.push({ header, lines: [line] });
    lastHeader = header;
  };
  for (const b of blocks) {
    switch (b.kind) {
      case "user": {
        if (isNoiseUser(b.text)) break;
        const text = truncateTokens(collapseSkillText(b.text), TRUNCATE_USER);
        if (text) {
          const ref = b.sourceIndex != null ? ` (#${b.sourceIndex})` : "";
          push("[user]", text + ref);
        }
        lastHeader = "[user]";
        break;
      }
      case "bash": {
        const cmd = compressBash(b.command);
        const ref = b.sourceIndex != null ? ` (#${b.sourceIndex})` : "";
        if (cmd) {
          push("[user]", `$ ${cmd}${ref}`);
        }
        lastHeader = "[user]";
        break;
      }
      case "assistant": {
        let raw = b.text;
        for (let i = 0; i < 2; i++) {
          const stripped = raw.replace(SELF_TALK_PREFIX_RE, "");
          if (stripped === raw) break;
          raw = stripped;
        }
        const text = truncateTokens(raw, TRUNCATE_ASSISTANT);
        if (text) {
          const ref = b.sourceIndex != null ? ` (#${b.sourceIndex})` : "";
          push("[assistant]", text + ref);
        }
        break;
      }
      case "tool_call": {
        if (!b.name || b.name.trim() === "") break;
        const ref = b.sourceIndex != null ? ` (#${b.sourceIndex})` : "";
        const summary = toolOneLiner(b.name, b.args) + ref;
        push("[assistant]", summary);
        break;
      }
      case "tool_result": {
        if (b.isError) {
          const body = firstLine(b.text, 150);
          if (!body || body === "(no output)") break;
          const ref = b.sourceIndex != null ? ` (#${b.sourceIndex})` : "";
          const header = `[tool_error] ${b.name}${ref}`;
          push(header, body);
          lastHeader = header;
        }
        break;
      }
      case "thinking":
        break;
    }
  }
  for (const sec of sections) {
    if (sec.header !== "[assistant]") continue;
    const out = [];
    for (const line of sec.lines) {
      if (!line.startsWith("* ")) {
        out.push(line);
        continue;
      }
      const ref = line.match(/\(#(\d+)\)$/)?.[1] ?? "";
      const base = ref ? line.slice(0, -(ref.length + 3)).trimEnd() : line;
      const last = out.length > 0 ? out[out.length - 1] : "";
      const m = last.match(/^(.*) \((#[\d, #]+)\) x(\d+)$/);
      if (m && m[1] === base) {
        out[out.length - 1] = `${base} (${m[2]}, #${ref}) x${parseInt(m[3]) + 1}`;
      } else if (last.match(/\(#\d+\)$/) && last.replace(/\s*\(#\d+\)$/, "") === base) {
        const prevRef = last.match(/\(#(\d+)\)$/)?.[1];
        out[out.length - 1] = `${base} (#${prevRef}, #${ref}) x2`;
      } else {
        out.push(line);
      }
    }
    sec.lines = out;
  }
  const TOOL_CALLS_PER_TURN = 8;
  for (const sec of sections) {
    if (sec.header !== "[assistant]") continue;
    const toolIdxs = sec.lines.map((l, i) => l.startsWith("* ") ? i : -1).filter((i) => i >= 0);
    if (toolIdxs.length <= TOOL_CALLS_PER_TURN) continue;
    const dropCount = toolIdxs.length - TOOL_CALLS_PER_TURN;
    const dropSet = new Set(toolIdxs.slice(0, dropCount));
    const firstKeptToolIdx = toolIdxs[dropCount];
    const next = [];
    let inserted = false;
    for (let i = 0; i < sec.lines.length; i++) {
      if (dropSet.has(i)) continue;
      if (!inserted && i === firstKeptToolIdx) {
        next.push(`* (${dropCount} earlier tool-call entries omitted)`);
        inserted = true;
      }
      next.push(sec.lines[i]);
    }
    sec.lines = next;
  }
  const collapsedErrors = [];
  for (const sec of sections) {
    const m = sec.header.match(/^\[tool_error\]\s+(\S+?)(?:\s*\(#(\d+)\))?$/);
    if (!m || sec.lines.length !== 1) {
      collapsedErrors.push(sec);
      continue;
    }
    const tool = m[1];
    const ref = m[2];
    const body = sec.lines[0];
    const prev = collapsedErrors[collapsedErrors.length - 1];
    const prevMatch = prev?.header.match(
      /^\[tool_error\]\s+(\S+?)\s*\(((?:#\d+(?:,\s*)?)+)\)(?:\s*x(\d+))?$/
    );
    if (prev && prevMatch && prevMatch[1] === tool && prev.lines.length === 1 && prev.lines[0] === body) {
      const refs = prevMatch[2] + (ref ? `, #${ref}` : "");
      const count = prevMatch[3] ? parseInt(prevMatch[3]) + 1 : 2;
      prev.header = `[tool_error] ${tool} (${refs}) x${count}`;
    } else {
      collapsedErrors.push(sec);
    }
  }
  sections.length = 0;
  sections.push(...collapsedErrors);
  return sections;
};
var stringifyBrief = (sections) => {
  const out = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (i > 0) {
      const prev = sections[i - 1];
      const prevIsToolLike = prev.header === "[assistant]" && prev.lines.every((l) => l.startsWith("* ")) || prev.header.startsWith("[tool_error]");
      const curIsToolLike = sec.header === "[assistant]" && sec.lines.every((l) => l.startsWith("* ")) || sec.header.startsWith("[tool_error]");
      if (!(prevIsToolLike && curIsToolLike)) {
        out.push("");
      }
    }
    out.push(sec.header);
    for (const line of sec.lines) {
      out.push(line);
    }
  }
  return out.join("\n");
};

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/build-sections.ts
var BLOCKER_RE = /\b(fail(ed|s|ure|ing)?|broken|cannot|can't|won't work|does not work|doesn't work|still (broken|failing|wrong)|blocked|blocker|not (fixed|resolved|working)|crash(es|ed|ing)?)\b/i;
var BLOCKER_CJK_RE = /失败|报错|错误|卡住|崩溃/;
var CJK_BENIGN_RE = /错误(?:处理|信息|消息|码|类型|日志|堆栈)|失败(?:重试|率)/g;
var SENTENCE_START_RE = /^\s*["'`*_【『「]?[A-Z`\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
var OUTSTANDING_CLIP = 200;
var MAX_PATH_TOKENS = 200;
var PATH_SCAN_HEAD = 8e3;
var PATH_SCAN_TAIL = 8e3;
var pathTokens = (text) => {
  const out = /* @__PURE__ */ new Set();
  const scan = (chunk) => {
    for (const m of chunk.matchAll(
      /(?<![A-Za-z0-9_.$/-])[A-Za-z0-9_.$/-]*(?<=[A-Za-z0-9_-])\.[A-Za-z0-9]{1,5}\b/g
    )) {
      out.add(m[0].toLowerCase());
      if (out.size >= MAX_PATH_TOKENS) break;
    }
  };
  if (text.length <= PATH_SCAN_HEAD + PATH_SCAN_TAIL) {
    scan(text);
  } else {
    scan(text.slice(0, PATH_SCAN_HEAD));
    if (out.size < MAX_PATH_TOKENS) scan(text.slice(-PATH_SCAN_TAIL));
  }
  return out;
};
var extractOutstandingContext = (blocks) => {
  const pending = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (index, text) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pending.push({ index, text });
  };
  const errors = [];
  const successes = [];
  const lastCallCommand = /* @__PURE__ */ new Map();
  blocks.forEach((b, index) => {
    if (b.kind === "tool_call") {
      if (b.name === "bash" && typeof b.args.command === "string") {
        lastCallCommand.set(b.name, b.args.command);
      }
      return;
    }
    if (b.kind !== "tool_result") return;
    if (b.isError) {
      errors.push({
        name: b.name,
        index,
        command: lastCallCommand.get(b.name),
        paths: pathTokens(b.text),
        text: b.text
      });
    } else {
      successes.push({
        name: b.name,
        index,
        command: lastCallCommand.get(b.name),
        paths: pathTokens(b.text)
      });
    }
  });
  const isExtinguished = (e) => successes.some((s) => {
    if (s.name !== e.name || s.index <= e.index) return false;
    if (e.name === "bash") return s.command !== void 0 && s.command === e.command;
    if (e.paths.size > 0 || s.paths.size > 0) {
      return [...e.paths].some((p) => s.paths.has(p));
    }
    return true;
  });
  for (const e of errors) {
    if (isExtinguished(e)) continue;
    push(e.index, `[${e.name}] ${firstLine(e.text, OUTSTANDING_CLIP)}`);
  }
  blocks.forEach((b, index) => {
    if (b.kind === "tool_result" && b.isError) return;
    if (b.kind === "assistant" || b.kind === "user") {
      for (const line of nonEmptyLines(b.text)) {
        const scannable = line.replace(CJK_BENIGN_RE, "");
        if (!BLOCKER_RE.test(scannable) && !BLOCKER_CJK_RE.test(scannable)) continue;
        const minLength = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(line) ? 2 : 15;
        if (line.length < minLength) continue;
        if (/^\s*[-*+>]\s/.test(line)) continue;
        if (/^\s*\(/.test(line)) continue;
        if (!SENTENCE_START_RE.test(line)) continue;
        const clipped = b.kind === "user" ? `[user] ${clipSentence(line, OUTSTANDING_CLIP)}` : clipSentence(line, OUTSTANDING_CLIP);
        const before = seen.size;
        push(index, clipped);
        if (seen.size > before) break;
      }
    }
  });
  pending.sort((a, z) => a.index - z.index);
  return pending.slice(-5).map((p) => p.text);
};
var formatFileActivity = (input) => {
  const touched = input.messages ? collectFilesTouched(input.messages, input.cwd) : [];
  const act = extractFiles(input.blocks, input.fileOps, touched, input.gitTags, input.cwd);
  for (const p of act.modified) act.created.delete(p);
  const lines = [];
  const tagOf = (p) => {
    const tag = act.gitTags?.get(p);
    return tag ? ` (${tag})` : "";
  };
  const list = (set) => [...set].map((p) => `${p}${tagOf(p)}`);
  if (act.modified.size > 0) lines.push(formatFileList("Modified", list(act.modified), 20));
  if (act.created.size > 0) lines.push(formatFileList("Created", list(act.created), 20));
  if (act.read.size > 0) {
    const arr = list(act.read);
    lines.push(
      `Read: ${arr.slice(0, 10).join(", ")}${arr.length > 10 ? ` (+${arr.length - 10} more)` : ""}`
    );
  }
  return lines;
};
var buildSections = (input) => {
  const { blocks } = input;
  const briefSections = buildBriefSections(blocks);
  const sessionGoal = extractGoals(blocks);
  const userPreferences = dedupPreferencesAgainstGoals(extractPreferences(blocks), sessionGoal);
  return {
    sessionGoal,
    outstandingContext: extractOutstandingContext(blocks),
    filesAndChanges: formatFileActivity(input),
    commits: formatCommits(extractCommits(blocks)),
    userPreferences,
    briefTranscript: stringifyBrief(briefSections)
  };
};

// ../../.pi/agent/npm/node_modules/get-east-asian-width/lookup-data.js
var ambiguousMinimalCodePoint = 161;
var ambiguousMaximumCodePoint = 1114109;
var ambiguousRanges = [161, 161, 164, 164, 167, 168, 170, 170, 173, 174, 176, 180, 182, 186, 188, 191, 198, 198, 208, 208, 215, 216, 222, 225, 230, 230, 232, 234, 236, 237, 240, 240, 242, 243, 247, 250, 252, 252, 254, 254, 257, 257, 273, 273, 275, 275, 283, 283, 294, 295, 299, 299, 305, 307, 312, 312, 319, 322, 324, 324, 328, 331, 333, 333, 338, 339, 358, 359, 363, 363, 462, 462, 464, 464, 466, 466, 468, 468, 470, 470, 472, 472, 474, 474, 476, 476, 593, 593, 609, 609, 708, 708, 711, 711, 713, 715, 717, 717, 720, 720, 728, 731, 733, 733, 735, 735, 768, 879, 913, 929, 931, 937, 945, 961, 963, 969, 1025, 1025, 1040, 1103, 1105, 1105, 8208, 8208, 8211, 8214, 8216, 8217, 8220, 8221, 8224, 8226, 8228, 8231, 8240, 8240, 8242, 8243, 8245, 8245, 8251, 8251, 8254, 8254, 8308, 8308, 8319, 8319, 8321, 8324, 8364, 8364, 8451, 8451, 8453, 8453, 8457, 8457, 8467, 8467, 8470, 8470, 8481, 8482, 8486, 8486, 8491, 8491, 8531, 8532, 8539, 8542, 8544, 8555, 8560, 8569, 8585, 8585, 8592, 8601, 8632, 8633, 8658, 8658, 8660, 8660, 8679, 8679, 8704, 8704, 8706, 8707, 8711, 8712, 8715, 8715, 8719, 8719, 8721, 8721, 8725, 8725, 8730, 8730, 8733, 8736, 8739, 8739, 8741, 8741, 8743, 8748, 8750, 8750, 8756, 8759, 8764, 8765, 8776, 8776, 8780, 8780, 8786, 8786, 8800, 8801, 8804, 8807, 8810, 8811, 8814, 8815, 8834, 8835, 8838, 8839, 8853, 8853, 8857, 8857, 8869, 8869, 8895, 8895, 8978, 8978, 9312, 9449, 9451, 9547, 9552, 9587, 9600, 9615, 9618, 9621, 9632, 9633, 9635, 9641, 9650, 9651, 9654, 9655, 9660, 9661, 9664, 9665, 9670, 9672, 9675, 9675, 9678, 9681, 9698, 9701, 9711, 9711, 9733, 9734, 9737, 9737, 9742, 9743, 9756, 9756, 9758, 9758, 9792, 9792, 9794, 9794, 9824, 9825, 9827, 9829, 9831, 9834, 9836, 9837, 9839, 9839, 9886, 9887, 9919, 9919, 9926, 9933, 9935, 9939, 9941, 9953, 9955, 9955, 9960, 9961, 9963, 9969, 9972, 9972, 9974, 9977, 9979, 9980, 9982, 9983, 10045, 10045, 10102, 10111, 11094, 11097, 12872, 12879, 57344, 63743, 65024, 65039, 65533, 65533, 127232, 127242, 127248, 127277, 127280, 127337, 127344, 127373, 127375, 127376, 127387, 127404, 917760, 917999, 983040, 1048573, 1048576, 1114109];
var fullwidthMinimalCodePoint = 12288;
var fullwidthMaximumCodePoint = 65510;
var fullwidthRanges = [12288, 12288, 65281, 65376, 65504, 65510];
var wideMinimalCodePoint = 4352;
var wideMaximumCodePoint = 262141;
var wideRanges = [4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180, 94192, 94198, 94208, 101589, 101631, 101662, 101760, 101874, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110951, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374, 127377, 127386, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709, 128716, 128716, 128720, 128722, 128725, 128728, 128732, 128735, 128747, 128748, 128756, 128764, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535, 129648, 129660, 129664, 129674, 129678, 129734, 129736, 129736, 129741, 129756, 129759, 129770, 129775, 129784, 131072, 196605, 196608, 262141];

// ../../.pi/agent/npm/node_modules/get-east-asian-width/utilities.js
var isInRange = (ranges, codePoint) => {
  let low = 0;
  let high = Math.floor(ranges.length / 2) - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const i = mid * 2;
    if (codePoint < ranges[i]) {
      high = mid - 1;
    } else if (codePoint > ranges[i + 1]) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
};

// ../../.pi/agent/npm/node_modules/get-east-asian-width/lookup.js
var commonCjkCodePoint = 19968;
var [wideFastPathStart, wideFastPathEnd] = /* @__PURE__ */ findWideFastPathRange(wideRanges);
function findWideFastPathRange(ranges) {
  let fastPathStart = ranges[0];
  let fastPathEnd = ranges[1];
  for (let index = 0; index < ranges.length; index += 2) {
    const start = ranges[index];
    const end = ranges[index + 1];
    if (commonCjkCodePoint >= start && commonCjkCodePoint <= end) {
      return [start, end];
    }
    if (end - start > fastPathEnd - fastPathStart) {
      fastPathStart = start;
      fastPathEnd = end;
    }
  }
  return [fastPathStart, fastPathEnd];
}
var isAmbiguous = (codePoint) => {
  if (codePoint < ambiguousMinimalCodePoint || codePoint > ambiguousMaximumCodePoint) {
    return false;
  }
  return isInRange(ambiguousRanges, codePoint);
};
var isFullWidth = (codePoint) => {
  if (codePoint < fullwidthMinimalCodePoint || codePoint > fullwidthMaximumCodePoint) {
    return false;
  }
  return isInRange(fullwidthRanges, codePoint);
};
var isWide = (codePoint) => {
  if (codePoint >= wideFastPathStart && codePoint <= wideFastPathEnd) {
    return true;
  }
  if (codePoint < wideMinimalCodePoint || codePoint > wideMaximumCodePoint) {
    return false;
  }
  return isInRange(wideRanges, codePoint);
};

// ../../.pi/agent/npm/node_modules/get-east-asian-width/index.js
function validate(codePoint) {
  if (!Number.isSafeInteger(codePoint)) {
    throw new TypeError(`Expected a code point, got \`${typeof codePoint}\`.`);
  }
}
function eastAsianWidth(codePoint, { ambiguousAsWide = false } = {}) {
  validate(codePoint);
  if (isFullWidth(codePoint) || isWide(codePoint) || ambiguousAsWide && isAmbiguous(codePoint)) {
    return 2;
  }
  return 1;
}

// ../../.pi/agent/npm/node_modules/@earendil-works/pi-tui/dist/utils.js
var graphemeSegmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
var wordSegmenter = new Intl.Segmenter(void 0, { granularity: "word" });
function couldBeEmoji(segment) {
  const cp = segment.codePointAt(0);
  return cp >= 126976 && cp <= 130047 || // Emoji and Pictograph
  cp >= 8960 && cp <= 9215 || // Misc technical
  cp >= 9728 && cp <= 10175 || // Misc symbols, dingbats
  cp >= 11088 && cp <= 11093 || // Specific stars/circles
  segment.includes("\uFE0F") || // Contains VS16 (emoji presentation selector)
  segment.length > 2;
}
var zeroWidthRegex = new RegExp("^(?:\\p{Default_Ignorable_Code_Point}|\\p{Control}|\\p{Mark}|\\p{Surrogate})+$", "v");
var leadingNonPrintingRegex = new RegExp("^[\\p{Default_Ignorable_Code_Point}\\p{Control}\\p{Format}\\p{Mark}\\p{Surrogate}]+", "v");
var nonPrintingCharRegex = new RegExp("^(?:\\p{Default_Ignorable_Code_Point}|\\p{Control}|\\p{Format}|\\p{Mark}|\\p{Surrogate})$", "v");
var markCharRegex = new RegExp("^\\p{Mark}$", "v");
var terminalSpacingMarkRegex = new RegExp("^(?:[\\p{Spacing_Mark}--[\\u1734\\u302E\\u302F]]|[\\u065F\\u0F7F\\u102B\\u102C\\u1031\\u1033-\\u1035\\u1038\\u103A-\\u103E])+$", "v");
var rgiEmojiRegex = new RegExp("^\\p{RGI_Emoji}$", "v");
var WIDTH_CACHE_SIZE = 512;
var widthCache = /* @__PURE__ */ new Map();
var cjkBreakRegex = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]/u;
var cjkPunctuationRegex = new RegExp(`(?:(?=\\p{Punctuation})${cjkBreakRegex.source}|[\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF08\uFF09\uFF3B\uFF3D\uFF5B\uFF5D\u201C\u201D\u2018\u2019\u2026\u2014])`, "u");
var autocompleteSeparatorRegex = new RegExp(`(?:\\s|${cjkPunctuationRegex.source})`, "u");
var autocompleteBoundaryRegex = new RegExp(`(?:^|${autocompleteSeparatorRegex.source})`, "u");
function isPrintableAscii(str) {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 32 || code > 126) {
      return false;
    }
  }
  return true;
}
function graphemeWidth(segment) {
  if (segment.length === 1) {
    const code = segment.charCodeAt(0);
    if (code >= 32 && code <= 126)
      return 1;
    if (code === 9)
      return 3;
  }
  if (terminalSpacingMarkRegex.test(segment)) {
    return [...segment].length;
  }
  if (zeroWidthRegex.test(segment)) {
    return 0;
  }
  if (couldBeEmoji(segment) && rgiEmojiRegex.test(segment)) {
    return 2;
  }
  const base = segment.replace(leadingNonPrintingRegex, "");
  const cp = base.codePointAt(0);
  if (cp === void 0) {
    return 0;
  }
  if (cp >= 127462 && cp <= 127487) {
    return 2;
  }
  let width = eastAsianWidth(cp);
  let followsMark = false;
  const chars = [...base];
  for (const char of chars.slice(1)) {
    if (terminalSpacingMarkRegex.test(char)) {
      width += 1;
      followsMark = false;
    } else if (markCharRegex.test(char)) {
      followsMark = true;
    } else if (!nonPrintingCharRegex.test(char)) {
      const c = char.codePointAt(0);
      if (followsMark || c >= 65280 && c <= 65519) {
        width += eastAsianWidth(c);
      } else if (c === 3635 || c === 3763) {
        width += 1;
      }
      followsMark = false;
    }
  }
  return width;
}
function visibleWidth(str) {
  if (str.length === 0) {
    return 0;
  }
  const asciiWidth = asciiVisibleWidth(str);
  if (asciiWidth !== -1) {
    return asciiWidth;
  }
  const cached = widthCache.get(str);
  if (cached !== void 0) {
    return cached;
  }
  let clean = str;
  if (str.includes("	")) {
    clean = clean.replace(/\t/g, "   ");
  }
  let escapeIndex = clean.indexOf("\x1B");
  if (escapeIndex !== -1) {
    let stripped = "";
    let copyFrom = 0;
    while (escapeIndex !== -1) {
      const length = ansiCodeLength(clean, escapeIndex);
      if (length > 0) {
        stripped += clean.slice(copyFrom, escapeIndex);
        escapeIndex += length;
        copyFrom = escapeIndex;
      } else {
        escapeIndex++;
      }
      escapeIndex = clean.indexOf("\x1B", escapeIndex);
    }
    clean = stripped + clean.slice(copyFrom);
  }
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(clean)) {
    width += graphemeWidth(segment);
  }
  if (widthCache.size >= WIDTH_CACHE_SIZE) {
    const firstKey = widthCache.keys().next().value;
    if (firstKey !== void 0) {
      widthCache.delete(firstKey);
    }
  }
  widthCache.set(str, width);
  return width;
}
function extractAnsiCode(str, pos) {
  const length = ansiCodeLength(str, pos);
  return length > 0 ? { code: str.substring(pos, pos + length), length } : null;
}
function asciiVisibleWidth(str) {
  let width = 0;
  let i = 0;
  while (i < str.length) {
    const code = str.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      width++;
      i++;
    } else if (code === 9) {
      width += 3;
      i++;
    } else if (code === 27) {
      const length = ansiCodeLength(str, i);
      if (length === 0)
        return -1;
      i += length;
    } else {
      return -1;
    }
  }
  return width;
}
function ansiCodeLength(str, pos) {
  if (pos >= str.length || str.charCodeAt(pos) !== 27)
    return 0;
  const next = str[pos + 1];
  if (next === "[") {
    for (let j = pos + 2; j < str.length; j++) {
      const c = str.charCodeAt(j);
      if (c === 109 || c === 71 || c === 75 || c === 72 || c === 74)
        return j + 1 - pos;
    }
    return 0;
  }
  if (next === "]" || next === "_") {
    for (let j = pos + 2; j < str.length; j++) {
      const c = str.charCodeAt(j);
      if (c === 7)
        return j + 1 - pos;
      if (c === 27 && str[j + 1] === "\\")
        return j + 2 - pos;
    }
    return 0;
  }
  return 0;
}
function parseOsc8Hyperlink(ansiCode) {
  if (!ansiCode.startsWith("\x1B]8;")) {
    return void 0;
  }
  const terminator = ansiCode.endsWith("\x07") ? "\x07" : "\x1B\\";
  const body = ansiCode.slice(4, terminator === "\x07" ? -1 : -2);
  const separatorIndex = body.indexOf(";");
  if (separatorIndex === -1) {
    return void 0;
  }
  const params = body.slice(0, separatorIndex);
  const url = body.slice(separatorIndex + 1);
  if (!url) {
    return null;
  }
  return { params, url, terminator };
}
function formatOsc8Hyperlink(hyperlink) {
  return `\x1B]8;${hyperlink.params};${hyperlink.url}${hyperlink.terminator}`;
}
function formatOsc8Close(terminator) {
  return `\x1B]8;;${terminator}`;
}
var AnsiCodeTracker = class {
  // Track individual attributes separately so we can reset them specifically
  bold = false;
  dim = false;
  italic = false;
  underline = false;
  blink = false;
  inverse = false;
  hidden = false;
  strikethrough = false;
  fgColor = null;
  // Stores the full code like "31" or "38;5;240"
  bgColor = null;
  // Stores the full code like "41" or "48;5;240"
  activeHyperlink = null;
  process(ansiCode) {
    const hyperlink = parseOsc8Hyperlink(ansiCode);
    if (hyperlink !== void 0) {
      this.activeHyperlink = hyperlink;
      return;
    }
    if (!ansiCode.endsWith("m")) {
      return;
    }
    const match = ansiCode.match(/\x1b\[([\d;]*)m/);
    if (!match)
      return;
    const params = match[1];
    if (params === "" || params === "0") {
      this.reset();
      return;
    }
    const parts = params.split(";");
    let i = 0;
    while (i < parts.length) {
      const code = Number.parseInt(parts[i], 10);
      if (code === 38 || code === 48) {
        if (parts[i + 1] === "5" && parts[i + 2] !== void 0) {
          const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]}`;
          if (code === 38) {
            this.fgColor = colorCode;
          } else {
            this.bgColor = colorCode;
          }
          i += 3;
          continue;
        } else if (parts[i + 1] === "2" && parts[i + 4] !== void 0) {
          const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]};${parts[i + 3]};${parts[i + 4]}`;
          if (code === 38) {
            this.fgColor = colorCode;
          } else {
            this.bgColor = colorCode;
          }
          i += 5;
          continue;
        }
      }
      switch (code) {
        case 0:
          this.reset();
          break;
        case 1:
          this.bold = true;
          break;
        case 2:
          this.dim = true;
          break;
        case 3:
          this.italic = true;
          break;
        case 4:
          this.underline = true;
          break;
        case 5:
          this.blink = true;
          break;
        case 7:
          this.inverse = true;
          break;
        case 8:
          this.hidden = true;
          break;
        case 9:
          this.strikethrough = true;
          break;
        case 21:
          this.bold = false;
          break;
        // Some terminals
        case 22:
          this.bold = false;
          this.dim = false;
          break;
        case 23:
          this.italic = false;
          break;
        case 24:
          this.underline = false;
          break;
        case 25:
          this.blink = false;
          break;
        case 27:
          this.inverse = false;
          break;
        case 28:
          this.hidden = false;
          break;
        case 29:
          this.strikethrough = false;
          break;
        case 39:
          this.fgColor = null;
          break;
        // Default fg
        case 49:
          this.bgColor = null;
          break;
        // Default bg
        default:
          if (code >= 30 && code <= 37 || code >= 90 && code <= 97) {
            this.fgColor = String(code);
          } else if (code >= 40 && code <= 47 || code >= 100 && code <= 107) {
            this.bgColor = String(code);
          }
          break;
      }
      i++;
    }
  }
  reset() {
    this.bold = false;
    this.dim = false;
    this.italic = false;
    this.underline = false;
    this.blink = false;
    this.inverse = false;
    this.hidden = false;
    this.strikethrough = false;
    this.fgColor = null;
    this.bgColor = null;
  }
  /** Clear all state for reuse. */
  clear() {
    this.reset();
    this.activeHyperlink = null;
  }
  getActiveCodes() {
    const codes = [];
    if (this.bold)
      codes.push("1");
    if (this.dim)
      codes.push("2");
    if (this.italic)
      codes.push("3");
    if (this.underline)
      codes.push("4");
    if (this.blink)
      codes.push("5");
    if (this.inverse)
      codes.push("7");
    if (this.hidden)
      codes.push("8");
    if (this.strikethrough)
      codes.push("9");
    if (this.fgColor)
      codes.push(this.fgColor);
    if (this.bgColor)
      codes.push(this.bgColor);
    let result = codes.length > 0 ? `\x1B[${codes.join(";")}m` : "";
    if (this.activeHyperlink) {
      result += formatOsc8Hyperlink(this.activeHyperlink);
    }
    return result;
  }
  getActiveBackgroundCode() {
    return this.bgColor ? `\x1B[${this.bgColor}m` : "";
  }
  hasActiveCodes() {
    return this.bold || this.dim || this.italic || this.underline || this.blink || this.inverse || this.hidden || this.strikethrough || this.fgColor !== null || this.bgColor !== null || this.activeHyperlink !== null;
  }
  /**
   * Get reset codes for attributes that need to be turned off at line end.
   * Underline must be closed to prevent bleeding into padding.
   * Active OSC 8 hyperlinks must be closed and re-opened on the next line.
   * Returns empty string if no attributes need closing.
   */
  getLineEndReset() {
    let result = "";
    if (this.underline) {
      result += "\x1B[24m";
    }
    if (this.activeHyperlink) {
      result += formatOsc8Close(this.activeHyperlink.terminator);
    }
    return result;
  }
};
function updateTrackerFromText(text, tracker) {
  let i = text.indexOf("\x1B");
  while (i !== -1) {
    const length = ansiCodeLength(text, i);
    if (length > 0) {
      tracker.process(text.substring(i, i + length));
      i += length;
    } else {
      i++;
    }
    i = text.indexOf("\x1B", i);
  }
}
function* graphemeSegments(text) {
  for (const { segment } of graphemeSegmenter.segment(text))
    yield segment;
}
function splitIntoTokensWithAnsi(text) {
  const tokens = [];
  let current = "";
  let pendingAnsi = "";
  let currentKind = null;
  let i = 0;
  const flushCurrent = () => {
    if (!current) {
      return;
    }
    tokens.push(current);
    current = "";
    currentKind = null;
  };
  while (i < text.length) {
    const ansiResult = extractAnsiCode(text, i);
    if (ansiResult) {
      pendingAnsi += ansiResult.code;
      i += ansiResult.length;
      continue;
    }
    let end = text.indexOf("\x1B", i + 1);
    while (end !== -1 && ansiCodeLength(text, end) === 0) {
      end = text.indexOf("\x1B", end + 1);
    }
    if (end === -1)
      end = text.length;
    const chunk = text.slice(i, end);
    const ascii = isPrintableAscii(chunk);
    for (const segment of ascii ? chunk : graphemeSegments(chunk)) {
      const segmentIsSpace = segment === " ";
      if (!ascii && !segmentIsSpace && cjkBreakRegex.test(segment)) {
        flushCurrent();
        const token = pendingAnsi + segment;
        pendingAnsi = "";
        tokens.push(token);
        continue;
      }
      const segmentKind = segmentIsSpace ? "space" : "word";
      if (current && currentKind !== segmentKind) {
        flushCurrent();
      }
      if (pendingAnsi) {
        current += pendingAnsi;
        pendingAnsi = "";
      }
      currentKind = segmentKind;
      current += segment;
    }
    i = end;
  }
  if (pendingAnsi) {
    if (current) {
      current += pendingAnsi;
    } else if (tokens.length > 0) {
      tokens[tokens.length - 1] += pendingAnsi;
    } else {
      current = pendingAnsi;
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}
function wrapTextWithAnsi(text, width) {
  if (!text) {
    return [""];
  }
  const inputLines = text.split(/\r\n|\r|\n/);
  const result = [];
  const tracker = new AnsiCodeTracker();
  for (const inputLine of inputLines) {
    const prefix = result.length > 0 ? tracker.getActiveCodes() : "";
    const wrappedLines = wrapSingleLine(prefix + inputLine, width);
    for (const wrappedLine of wrappedLines) {
      result.push(wrappedLine);
    }
    updateTrackerFromText(inputLine, tracker);
  }
  return result.length > 0 ? result : [""];
}
function wrapSingleLine(line, width) {
  if (!line) {
    return [""];
  }
  const visibleLength = visibleWidth(line);
  if (visibleLength <= width) {
    return [line];
  }
  const wrapped = [];
  const tracker = new AnsiCodeTracker();
  const tokens = splitIntoTokensWithAnsi(line);
  let currentLine = "";
  let currentVisibleLength = 0;
  for (const token of tokens) {
    const tokenVisibleLength = visibleWidth(token);
    const isWhitespace = token.trim() === "";
    if (tokenVisibleLength > width && !isWhitespace) {
      if (currentLine) {
        const lineEndReset = tracker.getLineEndReset();
        if (lineEndReset) {
          currentLine += lineEndReset;
        }
        wrapped.push(currentLine);
        currentLine = "";
        currentVisibleLength = 0;
      }
      const broken = breakLongWord(token, width, tracker);
      for (let i = 0; i < broken.length - 1; i++) {
        wrapped.push(broken[i]);
      }
      currentLine = broken[broken.length - 1];
      currentVisibleLength = visibleWidth(currentLine);
      continue;
    }
    const totalNeeded = currentVisibleLength + tokenVisibleLength;
    if (totalNeeded > width && currentVisibleLength > 0) {
      let lineToWrap = currentLine.trimEnd();
      const lineEndReset = tracker.getLineEndReset();
      if (lineEndReset) {
        lineToWrap += lineEndReset;
      }
      wrapped.push(lineToWrap);
      if (isWhitespace) {
        currentLine = tracker.getActiveCodes();
        currentVisibleLength = 0;
      } else {
        currentLine = tracker.getActiveCodes() + token;
        currentVisibleLength = tokenVisibleLength;
      }
    } else {
      currentLine += token;
      currentVisibleLength += tokenVisibleLength;
    }
    updateTrackerFromText(token, tracker);
  }
  if (currentLine) {
    wrapped.push(currentLine);
  }
  return wrapped.length > 0 ? wrapped.map((line2) => line2.trimEnd()) : [""];
}
function breakLongWord(word, width, tracker) {
  const lines = [];
  let currentLine = tracker.getActiveCodes();
  let currentWidth = 0;
  let i = 0;
  const segments = [];
  while (i < word.length) {
    const ansiResult = extractAnsiCode(word, i);
    if (ansiResult) {
      segments.push({ type: "ansi", value: ansiResult.code });
      i += ansiResult.length;
    } else {
      let end = i;
      while (end < word.length) {
        const nextAnsi = extractAnsiCode(word, end);
        if (nextAnsi)
          break;
        end++;
      }
      const textPortion = word.slice(i, end);
      for (const seg of graphemeSegmenter.segment(textPortion)) {
        segments.push({ type: "grapheme", value: seg.segment });
      }
      i = end;
    }
  }
  for (const seg of segments) {
    if (seg.type === "ansi") {
      currentLine += seg.value;
      tracker.process(seg.value);
      continue;
    }
    const grapheme = seg.value;
    if (!grapheme)
      continue;
    const graphemeWidth2 = visibleWidth(grapheme);
    if (currentWidth + graphemeWidth2 > width) {
      const lineEndReset = tracker.getLineEndReset();
      if (lineEndReset) {
        currentLine += lineEndReset;
      }
      lines.push(currentLine);
      currentLine = tracker.getActiveCodes();
      currentWidth = 0;
    }
    currentLine += grapheme;
    currentWidth += graphemeWidth2;
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [""];
}
var pooledStyleTracker = new AnsiCodeTracker();

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/format.ts
var section = (title, items) => {
  if (items.length === 0) return "";
  const body = items.map((i) => `- ${i}`).join("\n");
  return `[${title}]
${body}`;
};
var BRIEF_MAX_LINES = 120;
var TUI_SAFE_LINE_CHARS = 120;
function wrapLineWithContinuation(line, maxChars) {
  const indent = line.match(/^\s*(?:[-*]\s+|\d+\.\s+)?/)?.[0] ?? "";
  const continuationIndent = indent ? " ".repeat(Math.min(indent.length, 8)) : "";
  const safeMaxChars = continuationIndent ? maxChars - continuationIndent.length : maxChars;
  const wrapped = wrapTextWithAnsi(line, safeMaxChars);
  if (wrapped.length <= 1 || !continuationIndent) return wrapped;
  return [wrapped[0], ...wrapped.slice(1).map((l) => continuationIndent + l)];
}
var wrapLongLines = (text, maxChars = TUI_SAFE_LINE_CHARS) => text.split("\n").flatMap((line) => wrapLineWithContinuation(line, maxChars)).join("\n");
var capBrief = (text) => {
  const lines = text.split("\n");
  if (lines.length <= BRIEF_MAX_LINES) return text;
  const kept = lines.slice(-BRIEF_MAX_LINES);
  let firstHeader = kept.findIndex((l) => /^\[.+\]/.test(l));
  if (firstHeader < 0) {
    const anyAnchor = kept.findIndex((l) => /^\[[^\]]+\]/.test(l));
    if (anyAnchor > 0) firstHeader = anyAnchor;
  }
  const clean = firstHeader > 0 ? kept.slice(firstHeader) : kept;
  const omitted = lines.length - clean.length;
  return `...(${omitted} earlier lines omitted)

${clean.join("\n")}`;
};
var formatSummary = (data) => {
  const headerParts = [
    section("Session Goal", data.sessionGoal),
    section("Files And Changes", data.filesAndChanges),
    section("Commits", data.commits),
    section("Outstanding Context", data.outstandingContext),
    section("User Preferences", data.userPreferences)
  ].filter(Boolean);
  const parts = [];
  if (headerParts.length > 0) {
    parts.push(headerParts.join("\n\n"));
  }
  if (data.briefTranscript) {
    parts.push(capBrief(data.briefTranscript));
  }
  if (parts.length === 0) return "";
  return wrapLongLines(parts.join("\n\n---\n\n"));
};

// ../../.pi/agent/npm/node_modules/pi-blackhole/src/core/summarize.ts
var compileFresh = (input) => {
  const blocks = filterNoise(normalize(input.messages, input.sourceIndices));
  const data = buildSections({
    blocks,
    messages: input.touchMessages ?? input.messages,
    fileOps: input.fileOps,
    cwd: input.cwd,
    gitTags: input.gitTags
  });
  return formatSummary(data);
};
var compileSegment = (input) => {
  const fresh = compileFresh(input);
  return fresh ? wrapLongLines(fresh) : "";
};
export {
  compileSegment
};
