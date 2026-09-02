"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const ModalAccess = require("../src/modules/modal-accessibility");

class Element {
  constructor(documentRef) {
    this.documentRef = documentRef;
    this.hidden = false;
    this.isConnected = true;
    this.attributes = new Map();
    this.items = [];
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || null; }
  hasAttribute(name) { return this.attributes.has(name); }
  getClientRects() { return [{}]; }
  focus() { this.documentRef.activeElement = this; }
  contains(element) { return this === element || this.items.includes(element); }
  querySelector(selector) { return selector === '[aria-modal="true"]' ? this.modal || null : selector === "[autofocus]" ? null : null; }
  querySelectorAll() { return this.items; }
}

class DocumentRef {
  constructor() {
    this.activeElement = null;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

function event(key, shiftKey = false) {
  return { key, shiftKey, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
}

test("modal controller restores focus, traps tabs, and closes on escape", () => {
  const documentRef = new DocumentRef();
  const trigger = new Element(documentRef);
  const overlay = new Element(documentRef);
  const modal = new Element(documentRef);
  const first = new Element(documentRef);
  const last = new Element(documentRef);
  overlay.modal = modal;
  modal.items = [first, last];
  documentRef.activeElement = trigger;
  overlay.hidden = true;
  const controller = ModalAccess.createController({ documentRef, overlay, trigger });
  controller.open();
  assert.equal(overlay.hidden, false);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(documentRef.activeElement, first);
  last.focus();
  const tab = event("Tab");
  documentRef.dispatch("keydown", tab);
  assert.equal(tab.prevented, true);
  assert.equal(documentRef.activeElement, first);
  const escape = event("Escape");
  documentRef.dispatch("keydown", escape);
  assert.equal(escape.prevented, true);
  assert.equal(overlay.hidden, true);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(documentRef.activeElement, trigger);
});
