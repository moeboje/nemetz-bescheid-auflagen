import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOrCreateInFlight } from "./inFlightDedupe";

describe("in-flight dedupe", () => {
  it("shares one promise for parallel calls with the same key", async () => {
    const inFlight = new Map<string, Promise<string>>();
    let calls = 0;
    const create = async () => {
      calls += 1;
      return "project-1";
    };

    const first = getOrCreateInFlight(inFlight, "project-1", create);
    const second = getOrCreateInFlight(inFlight, "project-1", create);

    assert.equal(first, second);
    assert.equal(await first, "project-1");
    assert.equal(calls, 1);
    assert.equal(inFlight.has("project-1"), false);
  });

  it("does not mix different keys", async () => {
    const inFlight = new Map<string, Promise<string>>();
    let calls = 0;

    const first = getOrCreateInFlight(inFlight, "PROJECT:one", async () => {
      calls += 1;
      return "one";
    });
    const second = getOrCreateInFlight(inFlight, "PROJECT:two", async () => {
      calls += 1;
      return "two";
    });

    assert.notEqual(first, second);
    assert.deepEqual(await Promise.all([first, second]), ["one", "two"]);
    assert.equal(calls, 2);
  });

  it("cleans failed requests so the next call can retry", async () => {
    const inFlight = new Map<string, Promise<string>>();
    let calls = 0;

    await assert.rejects(
      getOrCreateInFlight(inFlight, "PROJECT:failed", async () => {
        calls += 1;
        throw new Error("failed");
      })
    );
    assert.equal(inFlight.has("PROJECT:failed"), false);

    const retry = await getOrCreateInFlight(inFlight, "PROJECT:failed", async () => {
      calls += 1;
      return "ok";
    });

    assert.equal(retry, "ok");
    assert.equal(calls, 2);
  });
});
