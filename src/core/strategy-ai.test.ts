import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeStrategy, validateStrategyAnalysis } from "./strategy-ai";

const result = {
  rules: [{ ruleId: "planned-risk", value: 500 }],
  questions: [],
  unsupported: [],
  model: "gemini-3.5-flash-lite",
};
afterEach(() => vi.unstubAllGlobals());
describe("bounded strategy AI", () => {
  it("sends only description and clarification to the local route", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal("fetch", transport);
    expect(
      await analyzeStrategy("Risk at most INR 500", "Per position"),
    ).toEqual(result);
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe("/strategy-api/strategy");
    expect(JSON.parse(init.body)).toEqual({
      description: "Risk at most INR 500",
      answers: "Per position",
    });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });
  it("preserves missing values and unsupported capabilities without making rules", () => {
    expect(
      validateStrategyAnalysis({
        ...result,
        rules: [{ ruleId: "planned-risk", value: null }],
        questions: ["What INR amount per position?"],
        unsupported: ["RSI signals are not supported."],
      }).rules[0].value,
    ).toBeNull();
    expect(validateStrategyAnalysis({ ...result, rules: [] }).rules).toEqual(
      [],
    );
  });
  it.each(
    [
      [{ ruleId: "rsi", value: 30 }],
      [{ ruleId: "daily-limit", value: 1.5 }],
      [{ ruleId: "daily-limit", value: 51 }],
      [{ ruleId: "planned-risk", value: -1 }],
      [{ ruleId: "entry-cutoff", value: "25:00" }],
      [{ ruleId: "stop-before-entry", value: "yes" }],
      [
        { ruleId: "reward-risk", value: 2 },
        { ruleId: "reward-risk", value: 3 },
      ],
    ].map((rules) => ({ rules })),
  )("rejects invalid/duplicate rule output %j", ({ rules }) => {
    expect(() => validateStrategyAnalysis({ ...result, rules })).toThrow();
  });
  it("does not call transport for blank or oversized text", async () => {
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    await expect(analyzeStrategy(" ")).rejects.toThrow("Describe");
    await expect(analyzeStrategy("a".repeat(6001))).rejects.toThrow("Describe");
    expect(transport).not.toHaveBeenCalled();
  });
  it("reports honest unavailable and sanitized provider failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("private provider error", { status: 503 }),
        ),
    );
    await expect(analyzeStrategy("my strategy")).rejects.toThrow(
      "not configured",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("secret credential")),
    );
    await expect(analyzeStrategy("my strategy")).rejects.toThrow(
      "AI is unavailable",
    );
  });
  it("rejects malformed JSON and wrong response shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>")));
    await expect(analyzeStrategy("my strategy")).rejects.toThrow("unreadable");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...result, questions: "none" })),
        ),
    );
    await expect(analyzeStrategy("my strategy")).rejects.toThrow(
      "invalid strategy",
    );
  });
});

describe("local API with fake provider", () => {
  async function run(
    options: Record<string, unknown>,
    test: (url: string) => Promise<void>,
  ) {
    const serverPath = "../../server/strategy-api.mjs";
    const { createStrategyServer } = await import(serverPath);
    const server = createStrategyServer(options);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      await test(`http://127.0.0.1:${server.address().port}/strategy`);
    } finally {
      await new Promise<void>((resolve) => server.close(resolve));
    }
  }
  const post = (
    url: string,
    body = { description: "fictional plan" },
    origin = "http://127.0.0.1:5173",
  ) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  it("returns unavailable without invoking provider when key is absent", async () => {
    const transport = vi.fn();
    await run({ transport }, async (url) =>
      expect((await post(url)).status).toBe(503),
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it("validates origins, bodies, and provider JSON; never forwards extra fields", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      ...result,
                      model: undefined,
                      inventedFinding: "bad",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    await run({ apiKey: "fake-key", transport }, async (url) => {
      expect((await post(url, undefined, "https://evil.example")).status).toBe(
        403,
      );
      expect((await post(url, { description: "" })).status).toBe(400);
      const response = await post(url);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(result);
    });
    expect(transport).toHaveBeenCalledTimes(1);
    const [, init] = transport.mock.calls[0];
    expect(init.headers["x-goog-api-key"]).toBe("fake-key");
    expect(
      JSON.parse(init.body).generationConfig.responseJsonSchema.properties.rules
        .maxItems,
    ).toBe(5);
  });
  it("rejects model-invented rules and incomplete output", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      ...result,
                      rules: [{ ruleId: "profit", value: 500 }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    await run({ apiKey: "fake-key", transport }, async (url) =>
      expect((await post(url)).status).toBe(502),
    );
  });
  it("rejects oversized bodies before invoking the provider", async () => {
    const transport = vi.fn();
    await run({ apiKey: "fake-key", transport }, async (url) => {
      expect((await post(url, { description: "a".repeat(33000) })).status).toBe(
        413,
      );
    });
    expect(transport).not.toHaveBeenCalled();
  });
  it("sanitizes provider quota errors and connection failures", async () => {
    await run(
      {
        apiKey: "fake-key",
        transport: vi
          .fn()
          .mockResolvedValue(
            new Response("secret provider body", { status: 429 }),
          ),
      },
      async (url) => {
        const response = await post(url);
        expect(response.status).toBe(429);
        expect(await response.text()).not.toContain("secret");
      },
    );
    await run(
      {
        apiKey: "fake-key",
        transport: vi.fn().mockRejectedValue(new Error("secret credential")),
      },
      async (url) => {
        const response = await post(url);
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain("secret");
      },
    );
  });
  it("rejects truncated model content instead of accepting partial rules", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "MAX_TOKENS",
              content: { parts: [{ text: JSON.stringify(result) }] },
            },
          ],
        }),
      ),
    );
    await run({ apiKey: "fake-key", transport }, async (url) =>
      expect((await post(url)).status).toBe(502),
    );
  });
  it("rejects daily position limit 51 at the server boundary", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      ...result,
                      rules: [{ ruleId: "daily-limit", value: 51 }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    await run({ apiKey: "fake-key", transport }, async (url) =>
      expect((await post(url)).status).toBe(502),
    );
  });
});
