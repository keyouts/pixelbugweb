const path = require("path");
const { net, protocol } = require("electron");
const { pathToFileURL } = require("url");

const SCHEME = "pixelbug";
const APP_HOST = "app";
const MOD_HOST = "mod";
const APP_URL = `${SCHEME}://${APP_HOST}/index.html`;
const MOD_URL = `${SCHEME}://${MOD_HOST}/runner.html`;
const MOD_FILES = new Set(["runner.html", "mod-runner.js"]);
const APP_FILES = new Set(["index.html", "renderer.js", "styles.css", "styles-workspaces.css", "theme.js"]);
const APP_PREFIXES = ["modules/", "workers/"];

function registerScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      stream: true
    }
  }]);
}

function cleanRelativePath(url) {
  let value;
  try {
    value = decodeURIComponent(url.pathname || "/");
  } catch (_error) {
    throw new Error("Invalid application path");
  }
  value = value.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!value || value.includes("\0") || value.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid application path");
  return value;
}

function targetPath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(resolvedRoot, relativePath);
  const prefix = `${resolvedRoot}${path.sep}`;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(prefix)) throw new Error("Invalid application path");
  return resolvedTarget;
}

function registerHandler(srcRoot) {
  protocol.handle(SCHEME, request => {
    const url = new URL(request.url);
    const relativePath = cleanRelativePath(url);
    const appFileAllowed = APP_FILES.has(relativePath) || APP_PREFIXES.some(prefix => relativePath.startsWith(prefix));
    if (url.hostname === APP_HOST && appFileAllowed) return net.fetch(pathToFileURL(targetPath(srcRoot, relativePath)).toString());
    if (url.hostname === MOD_HOST && MOD_FILES.has(relativePath)) return net.fetch(pathToFileURL(targetPath(srcRoot, relativePath)).toString());
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  });
}

module.exports = { APP_URL, MOD_URL, registerHandler, registerScheme };
