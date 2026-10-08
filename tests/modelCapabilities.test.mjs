import assert from "node:assert/strict";
import test from "node:test";
import { isDecisionModel } from "../lib/modelCapabilities.ts";

test("decision capability identifies custom names, including vision models", () => {
  assert.equal(isDecisionModel("my-classifier:v2", ["vision", "decision"]), true);
  assert.equal(isDecisionModel("local/custom", [" DECISION "]), true);
  assert.equal(isDecisionModel("qwen3.6:35b-a3b", ["completion", "tools"]), false);
});

test("Clef fallback handles namespaces and tags only when capabilities are unavailable", () => {
  for (const name of ["clef", "clef:latest", "clef-flash", "clef-flash:q8_0", "library/clef", "localhost:11434/library/clef-flash:latest"]) {
    assert.equal(isDecisionModel(name), true, name);
    assert.equal(isDecisionModel(name, []), true, name);
  }
  assert.equal(isDecisionModel("clef", ["completion"]), false);
  assert.equal(isDecisionModel("clef-flash", ["vision"]), false);
});

test("Clef fallback never matches a substring or namespace", () => {
  for (const name of ["clef-chat", "clef-flash-custom", "not-clef", "clef/llama:latest", "treble-clef", "qwen3.6:35b-a3b"]) {
    assert.equal(isDecisionModel(name), false, name);
  }
});
