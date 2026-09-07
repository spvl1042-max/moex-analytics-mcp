import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const BASE_URL = "https://iss.moex.com/iss";

function jsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function normalizeIss(payload: Record<string, any>) {
  const result: Record<string, any> = {};
  for (const [name, block] of Object.entries(payload)) {
    if (block && typeof block === "object" && Array.isArray(block.columns) && Array.isArray(block.data)) {
      result[name] = block.data.map((row: any[]) =>
        Object.fromEntries(block.columns.map((col: string, i: number) => [col, row[i]]))
      );
    } else {
      result[name] = block;
    }
  }
  return result;
}

async function moexGet(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
  const url = new URL(`${BASE_URL}/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("iss.meta", "off");
  url.searchParams.set("lang", "en");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "moex-analytics-mcp/1.0" },
  });

  if (!res.ok) {
    throw new Error(`MOEX ISS HTTP ${res.status}: ${url}`);
  }
  return normalizeIss(await res.json() as Record<string, any>);
}

function trimRows(rows: any[], limit: number) {
  return rows.slice(0, Math.max(1, Math.min(limit, 1000)));
}

function createServer() {
  const server = new McpServer({
    name: "MOEX Analytics",
    version: "1.0.0",
  });

  server.registerTool(
    "search_securities",
    {
      description: "Search MOEX instruments by ticker, ISIN or name.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ query, limit }) => {
      const data = await moexGet("securities.json", { q: query, "iss.only": "securities" });
      return jsonContent({ query, results: trimRows(data.securities ?? [], limit) });
    }
  );

  server.registerTool(
    "get_security",
    {
      description: "Get MOEX security specification, descriptions and board mappings.",
      inputSchema: { security: z.string() },
    },
    async ({ security }) => jsonContent(await moexGet(`securities/${security}.json`))
  );

  server.registerTool(
    "get_quote",
    {
      description: "Get current or delayed quote and instrument fields.",
      inputSchema: {
        security: z.string(),
        engine: z.string().default("stock"),
        market: z.string().default("shares"),
        board: z.string().default("TQBR"),
      },
    },
    async ({ security, engine, market, board }) => {
      const path = `engines/${engine}/markets/${market}/boards/${board}/securities/${security}.json`;
      return jsonContent(await moexGet(path, { "iss.only": "securities,marketdata" }));
    }
  );

  server.registerTool(
    "get_candles",
    {
      description: "Get OHLCV candles from MOEX ISS. Dates use YYYY-MM-DD.",
      inputSchema: {
        security: z.string(),
        interval: z.number().int().default(24),
        from_date: z.string().optional(),
        till_date: z.string().optional(),
        engine: z.string().default("stock"),
        market: z.string().default("shares"),
        board: z.string().default("TQBR"),
      },
    },
    async ({ security, interval, from_date, till_date, engine, market, board }) => {
      const path = `engines/${engine}/markets/${market}/boards/${board}/securities/${security}/candles.json`;
      const data = await moexGet(path, {
        interval,
        from: from_date,
        till: till_date,
        "iss.only": "candles",
      });
      return jsonContent({
        security, engine, market, board, interval,
        rows: data.candles ?? [],
      });
    }
  );

  server.registerTool(
    "get_trades",
    {
      description: "Get anonymous trades available through MOEX ISS.",
      inputSchema: {
        security: z.string(),
        engine: z.string().default("stock"),
        market: z.string().default("shares"),
        board: z.string().default("TQBR"),
        limit: z.number().int().min(1).max(1000).default(100),
      },
    },
    async ({ security, engine, market, board, limit }) => {
      const path = `engines/${engine}/markets/${market}/boards/${board}/securities/${security}/trades.json`;
      const data = await moexGet(path, { "iss.only": "trades" });
      return jsonContent({ security, trades: trimRows(data.trades ?? [], limit) });
    }
  );

  server.registerTool(
    "get_history",
    {
      description: "Get end-of-day historical trading results from MOEX ISS.",
      inputSchema: {
        security: z.string(),
        from_date: z.string().optional(),
        till_date: z.string().optional(),
        engine: z.string().default("stock"),
        market: z.string().default("shares"),
        board: z.string().default("TQBR"),
      },
    },
    async ({ security, from_date, till_date, engine, market, board }) => {
      const path = `history/engines/${engine}/markets/${market}/boards/${board}/securities/${security}.json`;
      const data = await moexGet(path, {
        from: from_date,
        till: till_date,
        "iss.only": "history",
      });
      return jsonContent({ security, rows: data.history ?? [] });
    }
  );

  server.registerTool(
    "get_index",
    {
      description: "Get Moscow Exchange index data, e.g. IMOEX or RTSI.",
      inputSchema: {
        index: z.string().default("IMOEX"),
        include_marketdata: z.boolean().default(true),
      },
    },
    async ({ index, include_marketdata }) => {
      const path = `engines/stock/markets/index/securities/${index}.json`;
      const only = include_marketdata ? "securities,marketdata" : "securities";
      return jsonContent(await moexGet(path, { "iss.only": only }));
    }
  );

  server.registerTool(
    "get_futures_contract",
    {
      description: "Get FORTS futures contract specification and market data.",
      inputSchema: {
        security: z.string(),
        board: z.string().default("RFUD"),
      },
    },
    async ({ security, board }) => {
      const path = `engines/futures/markets/forts/boards/${board}/securities/${security}.json`;
      return jsonContent(await moexGet(path, { "iss.only": "securities,marketdata" }));
    }
  );

  server.registerTool(
    "get_bond",
    {
      description: "Get bond specification and market data.",
      inputSchema: {
        security: z.string(),
        board: z.string().default("TQCB"),
      },
    },
    async ({ security, board }) => {
      const path = `engines/stock/markets/bonds/boards/${board}/securities/${security}.json`;
      return jsonContent(await moexGet(path, { "iss.only": "securities,marketdata" }));
    }
  );

  server.registerTool(
    "get_dividends",
    {
      description: "Get dividend history available from MOEX ISS.",
      inputSchema: {
        security: z.string(),
        limit: z.number().int().min(1).max(1000).default(100),
      },
    },
    async ({ security, limit }) => {
      const data = await moexGet(`securities/${security}/dividends.json`);
      const rows = data.dividends ?? [];
      return jsonContent({ security, dividends: trimRows(rows, limit) });
    }
  );

  server.registerTool(
    "get_market_structure",
    {
      description: "List markets available for a MOEX trading engine.",
      inputSchema: { engine: z.string().default("stock") },
    },
    async ({ engine }) => jsonContent(await moexGet(`engines/${engine}/markets.json`))
  );

  return server;
}

const mcpHandler = createMcpHandler(createServer);

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "moex-analytics-mcp" });
    }

    if (url.pathname === "/mcp") {
      return mcpHandler(request, env, ctx);
    }

    return new Response("MOEX Analytics MCP\nUse /mcp for MCP and /health for health check.", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
} satisfies ExportedHandler;
