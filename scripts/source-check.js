"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const sourceRoots = ["src", "scripts", "integrations"];
const scanRoots = ["src", "scripts", "integrations", "test"];
const codeExtensions = new Set([".js", ".css", ".html", ".py"]);
const forbiddenWords = [String.fromCharCode(65, 73), String.fromCharCode(79, 112, 101, 110, 65, 73), String.fromCharCode(67, 104, 97, 116, 71, 80, 84), "C" + "opilot", "A" + "nthropic", "C" + "laude", "G" + "emini", "L" + "LM"];
const forbiddenPhrases = ["machine" + " learning", "artificial" + " intelligence"];
const forbiddenReferences = new RegExp(`(?<![A-Za-z0-9_])(?:${forbiddenWords.join("|")})(?![A-Za-z0-9_])|${forbiddenPhrases.join("|")}`, "i");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function twoWords(text, filePath, line) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length !== 2) throw new Error(`Comment policy failed for ${relative(filePath)}:${line}`);
}

function commentPolicy(filePath, source) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".js") {
    source.split(/\r?\n/).forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("// ")) twoWords(trimmed.slice(3), filePath, index + 1);
    });
    for (const match of source.matchAll(/\/\*([\s\S]*?)\*\//g)) twoWords(match[1].replace(/\s+/g, " "), filePath, source.slice(0, match.index).split("\n").length);
  }
  if (extension === ".css") {
    for (const match of source.matchAll(/\/\*([\s\S]*?)\*\//g)) twoWords(match[1].replace(/\s+/g, " "), filePath, source.slice(0, match.index).split("\n").length);
  }
  if (extension === ".html") {
    for (const match of source.matchAll(/<!--([\s\S]*?)-->/g)) twoWords(match[1].replace(/\s+/g, " "), filePath, source.slice(0, match.index).split("\n").length);
  }
  if (extension === ".py") {
    source.split(/\r?\n/).forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("# ")) twoWords(trimmed.slice(2), filePath, index + 1);
    });
  }
}

const sourceFiles = sourceRoots.flatMap(folder => walk(path.join(root, folder)));
const jsFiles = sourceFiles.filter(filePath => filePath.endsWith(".js"));
for (const filePath of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", filePath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Syntax check failed for ${relative(filePath)}: ${result.stderr || result.stdout}`);
}
for (const filePath of sourceFiles.filter(filePath => codeExtensions.has(path.extname(filePath).toLowerCase()))) commentPolicy(filePath, fs.readFileSync(filePath, "utf8"));

const referenceFiles = scanRoots.flatMap(folder => walk(path.join(root, folder))).filter(filePath => codeExtensions.has(path.extname(filePath).toLowerCase()));
referenceFiles.push(path.join(root, "package.json"));
for (const filePath of referenceFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  if (forbiddenReferences.test(source)) throw new Error(`Reference policy failed for ${relative(filePath)}`);
}

process.stdout.write(`Source check passed for ${jsFiles.length} JavaScript files.\n`);
