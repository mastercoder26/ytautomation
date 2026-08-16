import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { buildBrandPreflightServer } from "../../src/mcp/server.js";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const connect = async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildBrandPreflightServer({ allowedRoots: [process.cwd()] });
  const client = new Client({ name: "brandpreflight-test", version: "0.1.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
};

describe("BrandPreflight MCP", () => {
  it("exposes the local review workflow as discoverable tools", async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "brandpreflight_doctor",
        "brandpreflight_extract_requirements",
        "brandpreflight_build_review_packet",
        "brandpreflight_prepare_video",
        "brandpreflight_score"
      ])
    );
  });

  it("extracts a brief and returns structured content", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "brandpreflight_extract_requirements",
      arguments: {
        campaignId: "campaign-mcp",
        name: "MCP campaign",
        briefText: "- Must say \"Made with Acme\"\n- Include promo code SAVE20"
      }
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      campaignId: "campaign-mcp",
      requirements: [{ category: "exact_phrase" }, { category: "promo_code" }]
    });
  });

  it("rejects unknown fields at the protocol boundary", async () => {
    const client = await connect();
    await expect(
      client.callTool({
        name: "brandpreflight_extract_requirements",
        arguments: {
          campaignId: "campaign-mcp",
          name: "MCP campaign",
          briefText: "- Say hello",
          command: "rm -rf /"
        }
      })
    ).rejects.toThrow();
  });
});
