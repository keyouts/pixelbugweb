"use strict";

const fs = require("node:fs");
const path = require("node:path");

const BLOCKED_RELEASES = new Set([
  "keyv@6.0.0",
  "flat-cache@6.1.24",
  "file-entry-cache@11.1.6",
  "cacheable-request@13.0.20",
  "@cacheable/utils@2.5.1",
  "cacheable@2.5.1",
  "@cacheable/memory@2.2.1",
  "cache-manager@7.2.10",
  "@cacheable/node-cache@3.1.2",
  "ecto@5.0.1",
  "@cacheable/net@2.1.1"
]);
const ALLOWED_INSTALL_SCRIPTS = new Set(["electron-winstaller@5.4.0"]);
const ALLOWED_MISSING_INTEGRITY = new Set(["electron@42.9.1"]);
const REQUIRED_OVERRIDES = Object.freeze({ "@xmldom/xmldom": "0.8.15" });

function packageName(packagePath) {
  let name = packagePath.slice("node_modules/".length);
  const nested = name.lastIndexOf("/node_modules/");
  if (nested >= 0) name = name.slice(nested + "/node_modules/".length);
  return name;
}

function fail(message) {
  throw new Error(`Install guard: ${message}`);
}

function verify(root = path.join(__dirname, "..")) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  if (lock.lockfileVersion !== 3) fail("package-lock.json must use lockfile version 3");
  if (Object.keys(manifest.dependencies || {}).length) fail("runtime dependencies are not permitted");
  const declared = manifest.devDependencies || {};
  if (JSON.stringify(manifest.overrides || {}) !== JSON.stringify(REQUIRED_OVERRIDES)) fail("security overrides changed");
  for (const [name, version] of Object.entries(declared)) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) fail(`${name} must use an exact version`);
  }
  if (JSON.stringify(lock.packages?.[""]?.devDependencies || {}) !== JSON.stringify(declared)) fail("manifest and lockfile dependencies differ");
  if (lock.packages?.["node_modules/@xmldom/xmldom"]?.version !== REQUIRED_OVERRIDES["@xmldom/xmldom"]) fail("xmldom security floor changed");
  const seenScripts = [];
  const seenMissingIntegrity = [];
  for (const [packagePath, record] of Object.entries(lock.packages || {})) {
    if (!packagePath.startsWith("node_modules/") || !record?.version) continue;
    const identifier = `${packageName(packagePath)}@${record.version}`;
    if (BLOCKED_RELEASES.has(identifier)) fail(`${identifier} is blocked`);
    if (!/^https:\/\/registry\.npmjs\.org\//.test(record.resolved || "")) fail(`${identifier} uses an untrusted registry source`);
    if (!record.integrity) seenMissingIntegrity.push(identifier);
    if (record.hasInstallScript) seenScripts.push(identifier);
  }
  if (seenMissingIntegrity.some(identifier => !ALLOWED_MISSING_INTEGRITY.has(identifier))) fail(`unexpected missing integrity: ${seenMissingIntegrity.join(", ")}`);
  if (seenMissingIntegrity.some(identifier => !ALLOWED_MISSING_INTEGRITY.has(identifier)) || seenMissingIntegrity.length !== ALLOWED_MISSING_INTEGRITY.size) fail("missing-integrity exceptions changed");
  if (seenScripts.some(identifier => !ALLOWED_INSTALL_SCRIPTS.has(identifier)) || seenScripts.length !== ALLOWED_INSTALL_SCRIPTS.size) fail(`install-script allowlist changed: ${seenScripts.join(", ")}`);
  return Object.freeze({ packages: Object.keys(lock.packages || {}).length, installScripts: seenScripts.slice(), missingIntegrity: seenMissingIntegrity.slice() });
}

if (require.main === module) {
  const result = verify();
  process.stdout.write(`Install guard passed for ${result.packages} locked package records.\n`);
}

module.exports = Object.freeze({ verify });
