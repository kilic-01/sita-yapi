import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "./auth.js";

test("encryptSecret/decryptSecret round-trips a password", () => {
  const original = "gizli-sifre-123";
  const encrypted = encryptSecret(original);
  assert.notEqual(encrypted, original);
  assert.equal(decryptSecret(encrypted), original);
});

test("encryptSecret produces different ciphertext each time (random IV)", () => {
  const a = encryptSecret("aynı-şifre");
  const b = encryptSecret("aynı-şifre");
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), "aynı-şifre");
  assert.equal(decryptSecret(b), "aynı-şifre");
});

test("decryptSecret throws on corrupted input", () => {
  const encrypted = encryptSecret("test");
  const corrupted = encrypted.slice(0, -4) + "abcd";
  assert.throws(() => decryptSecret(corrupted));
});
