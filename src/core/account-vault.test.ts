import { describe, it, expect } from "vitest";
import { sealReview, openReview } from "../../worker/review-vault";
import { createRules, realisticSession, DEFAULT_CHECKS } from "./fixtures";
import { reviewSession } from "./review";
const secret = Buffer.alloc(32, 7).toString("base64");
const fixture = () => ({
  id: "vault-test",
  name: "Fictional account review",
  source: "sample",
  strategyName: "QA",
  focus: "risk-plan",
  savedAt: new Date().toISOString(),
  review: reviewSession(
    createRules(3, "11:00", DEFAULT_CHECKS),
    realisticSession(),
  ),
});
describe("Private review vault", () => {
  it("encrypts content and recomputes findings when restoring", async () => {
    const entry = fixture();
    const sealed = await sealReview(secret, "owner-a", entry.id, {
      ...entry,
      review: { ...entry.review, findings: [] },
    });
    expect(sealed).not.toContain(entry.name);
    const restored = await openReview(secret, "owner-a", entry.id, sealed);
    expect(restored.review.findings.length).toBeGreaterThan(0);
    expect(restored.focus).toBe(entry.focus);
  });
  it("uses a fresh nonce for each write", async () => {
    const entry = fixture();
    expect(await sealReview(secret, "owner-a", entry.id, entry)).not.toBe(
      await sealReview(secret, "owner-a", entry.id, entry),
    );
  });
  it("rejects another owner, review ID or key", async () => {
    const entry = fixture();
    const sealed = await sealReview(secret, "owner-a", entry.id, entry);
    await expect(
      openReview(secret, "owner-b", entry.id, sealed),
    ).rejects.toThrow();
    await expect(
      openReview(secret, "owner-a", "wrong-review", sealed),
    ).rejects.toThrow();
    await expect(
      openReview(
        Buffer.alloc(32, 8).toString("base64"),
        "owner-a",
        entry.id,
        sealed,
      ),
    ).rejects.toThrow();
  });
  it("detects ciphertext changes", async () => {
    const entry = fixture();
    const encrypted = JSON.parse(
      await sealReview(secret, "owner-a", entry.id, entry),
    );
    encrypted.data =
      (encrypted.data[0] === "A" ? "B" : "A") + encrypted.data.slice(1);
    await expect(
      openReview(secret, "owner-a", entry.id, JSON.stringify(encrypted)),
    ).rejects.toThrow();
  });
  it("rejects invalid persisted trade records", async () => {
    const entry = fixture();
    entry.review.session.positions[0].executions[0].quantity = Number.NaN;
    const encrypted = await sealReview(secret, "owner-a", entry.id, entry);
    await expect(
      openReview(secret, "owner-a", entry.id, encrypted),
    ).rejects.toThrow();
  });
});
