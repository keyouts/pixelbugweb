"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const ProjectStore = require("../src/main/project-store");

function fakeApp(root) {
  return { getPath: name => name === "userData" ? root : root };
}

function record(index, projectId = `project-${index}`) {
  return {
    projectId,
    name: `Project ${index}`,
    savedAt: 1000 + index,
    thumbnail: "data:image/png;base64,AA==",
    meta: `${16 + index} × ${16 + index}`,
    project: { name: `Project ${index}`, width: 16 + index, height: 16 + index, frames: [{ layers: [] }] }
  };
}

test("disk project store saves, replaces, and verifies gallery projects", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pixelbug-store-"));
  const app = fakeApp(root);
  try {
    const first = await ProjectStore.saveStoredProject(app, "gallery", record(1, "same-project"));
    await ProjectStore.saveStoredProject(app, "gallery", record(2, "same-project"));
    const list = await ProjectStore.listStoredProjects(app, "gallery");
    assert.equal(list.length, 1);
    assert.equal(list[0].id, first.id);
    assert.equal(list[0].name, "Project 2");
    assert.equal(Object.hasOwn(list[0], "project"), false);
    const loaded = await ProjectStore.loadStoredProject(app, "gallery", first.id);
    assert.equal(loaded.project.name, "Project 2");
    const files = await fs.readdir(path.join(root, "project-store", "gallery", "items"));
    await fs.writeFile(path.join(root, "project-store", "gallery", "items", files[0]), JSON.stringify(record(9)));
    await assert.rejects(() => ProjectStore.loadStoredProject(app, "gallery", first.id), /integrity check failed/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("disk project store prunes snapshots to the bounded history", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pixelbug-snapshots-"));
  const app = fakeApp(root);
  try {
    for (let index = 0; index < 40; index++) await ProjectStore.saveStoredProject(app, "snapshots", record(index));
    const list = await ProjectStore.listStoredProjects(app, "snapshots");
    assert.equal(list.length, ProjectStore.STORE_LIMITS.snapshots.count);
    assert.equal(list[0].name, "Project 39");
    assert.equal(list.at(-1).name, "Project 4");
    const selected = list[5];
    await ProjectStore.deleteStoredProject(app, "snapshots", selected.id);
    const afterDelete = await ProjectStore.listStoredProjects(app, "snapshots");
    assert.equal(afterDelete.some(item => item.id === selected.id), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("disk project store rejects invalid collections and records", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pixelbug-limits-"));
  const app = fakeApp(root);
  try {
    assert.throws(() => ProjectStore.saveStoredProject(app, "unknown", record(1)), /collection is not valid/);
    const circular = record(1);
    circular.project.loop = circular.project;
    await assert.rejects(() => ProjectStore.saveStoredProject(app, "gallery", circular), /could not be serialized/);
    const unsafe = record(2);
    unsafe.project = JSON.parse('{"nested":{"__proto__":{"polluted":true}}}');
    await assert.rejects(() => ProjectStore.saveStoredProject(app, "gallery", unsafe), /unsafe property/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
