import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const BASE_URL = "https://iss.moex.com/iss";

type Env = {
  OPENAI_APPS_CHALLENGE?: string;
};

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  destructiveHint: false,
};

function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function normalizeIss(payload: Record<string, any>) {
  const result: Record<string, any> = {};

  for (const [name, block] of Object.entries(payload)) {
    if (
      block &&
      typeof block === "object" &&
      Array.isArray(block.columns) &&
      Array.isArray(block.data)
    ) {
      result[name] = block.data.map((row: any[]) =>
        Object.fromEntries(
          block.columns.map((col: string, i: number) => [
            col,
            row[i],
          ])
        )
      );
    } else {
      result[name] = block;
    }
  }

  return result;
}

async function moexGet(
  path: string,
  params: Record<
    string,
    string | number | boolean | undefined
  > = {}
) {
  const url = new URL(
    `${BASE_URL}/${path.replace(/^\/+/, "")}`
  );

  url.searchParams.set("iss.meta", "off");
  url.searchParams.set("lang", "en");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "moex-analytics-mcp/1.1",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `MOEX ISS HTTP ${response.status}: ${url}`
    );
  }

  return normalizeIss(
    (await response.json()) as Record<string, any>
  );
}

function trimRows(rows: any[], limit: number) {
  return rows.slice(
    0,
    Math.max(1, Math.min(limit, 1000))
  );
}

function createServer() {
  const server = new McpServer({
    name: "MOEX Analytics",
    version: "1.1.0",
  });

  server.registerTool(
    "search_securities",
    {
      description:
        "Search Moscow Exchange instruments by ticker, ISIN, registration number or issuer/name. Use this when the exact MOEX security code is unknown.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Ticker, ISIN or security/issuer name."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ query, limit }) => {
      const data = await moexGet(
        "securities.json",
        {
          q: query,
          "iss.only": "securities",
        }
      );

      return jsonContent({
        query,
        results: trimRows(
          data.securities ?? [],
          limit
        ),
      });
    }
  );

  server.registerTool(
    "get_security",
    {
      description:
        "Get the official MOEX security specification, descriptive fields and board mappings for a security code.",
      inputSchema: {
        security: z
          .string()
          .describe(
            "MOEX security code, for example SBER."
          ),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ security }) =>
      jsonContent(
        await moexGet(
          `securities/${security}.json`
        )
      )
  );

  server.registerTool(
    "get_quote",
    {
      description:
        "Get the latest quote/market-data fields exposed by MOEX ISS for an instrument. MOEX ISS public data may be delayed and should not be described as guaranteed real-time.",
      inputSchema: {
        security: z
          .string()
          .describe(
            "MOEX security code, for example SBER."
          ),
        engine: z.string().default("stock"),
        market: z.string().default("shares"),
        board: z.string().default("TQBR"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({
      security,
      engine,
      market,
      board,
    }) => {
      const path =
        `engines/${engine}/markets/${market}` +
        `/boards/${board}/securities/${security}.json`;

      return jsonContent(
        await moexGet(path, {
          "iss.only":
            "securities,marketdata",
        })
      );
    }
  );

  server.registerTool(
    "get_candles",
    {
      description:
        "Get OHLCV candles from MOEX ISS for technical analysis. Dates use YYYY-MM-DD. Common daily interval is 24.",
      inputSchema: {
        security: z.string(),
        interval: z
          .number()
          .int()
          .default(24),
        from_date: z
          .string()
          .optional()
          .describe("YYYY-MM-DD"),
        till_date: z
          .string()
          .optional()
          .describe("YYYY-MM-DD"),
        engine: z.string().default("stock"),
        market: z.string().default("shares"),
        board: z.string().default("TQBR"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({
      security,
      interval,
      from_date,
      till_date,
      engine,
      market,
      board,
    }) => {
      const path =
        `engines/${engine}/markets/${market}` +
        `/boards/${board}/securities/${security}` +
        `/candles.json`;

      const data = await moexGet(path, {
        interval,
        from: from_date,
        till: till_date,
        "iss.only": "candles",
      });

      return jsonContent({
        security,
        engine,
        market,
        board,
        interval,
        rows: data.candles ?? [],
      });
    }
  );

  server.registerTool(
    "get_trades",
    {
      description:
        "Get anonymous trades available through MOEX ISS for a security and trading board.",
      inputSchema: {
        security: z.string(),
        engine: z.string().default("stock"),
        market: z.string().default("shares"),
        board: z.string().default("TQBR"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .default(100),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({
      security,
      engine,
      market,
      board,
      limit,
    }) => {
      const path =
        `engines/${engine}/markets/${market}` +
        `/boards/${board}/securities/${security}` +
        `/trades.json`;

      const data = await moexGet(path, {
        "iss.only": "trades",
      });

      return jsonContent({
        security,
        trades: trimRows(
          data.trades ?? [],
          limit
        ),
      });
    }
  );

  server.registerTool(
    "get_history",
    {
      description:
        "Get end-of-day historical trading results from MOEX ISS for a specified date range.",
      inputSchema: {
        security: z.string(),
        from_date: z
          .string()
          .optional()
          .describe("YYYY-MM-DD"),
        till_date: z
          .string()
          .optional()
          .describe("YYYY-MM-DD"),
        engine: z.string().default("stock"),
        market: z.string().default("shares"),
        board: z.string().default("TQBR"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({
      security,
      from_date,
      till_date,
      engine,
      market,
      board,
    }) => {
      const path =
        `history/engines/${engine}` +
        `/markets/${market}/boards/${board}` +
        `/securities/${security}.json`;

      const data = await moexGet(path, {
        from: from_date,
        till: till_date,
        "iss.only": "history",
      });

      return jsonContent({
        security,
        rows: data.history ?? [],
      });
    }
  );

  server.registerTool(
    "get_index",
    {
      description:
        "Get MOEX index specification and market data, for example IMOEX or RTSI.",
      inputSchema: {
        index: z
          .string()
          .default("IMOEX"),
        include_marketdata: z
          .boolean()
          .default(true),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({
      index,
      include_marketdata,
    }) => {
      const path =
        `engines/stock/markets/index` +
        `/securities/${index}.json`;

      const only = include_marketdata
        ? "securities,marketdata"
        : "securities";

      return jsonContent(
        await moexGet(path, {
          "iss.only": only,
        })
      );
    }
  );

  server.registerTool(
    "get_futures_contract",
    {
      description:
        "Get FORTS futures contract specification and market data from MOEX ISS.",
      inputSchema: {
        security: z
          .string()
          .describe(
            "MOEX futures contract code, for example SiZ6."
          ),
        board: z.string().default("RFUD"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ security, board }) => {
      const path =
        `engines/futures/markets/forts` +
        `/boards/${board}/securities/${security}.json`;

      return jsonContent(
        await moexGet(path, {
          "iss.only":
            "securities,marketdata",
        })
      );
    }
  );

  server.registerTool(
    "get_bond",
    {
      description:
        "Get bond specification and market data from MOEX ISS. Use search_securities first if the exact bond code or board is unknown.",
      inputSchema: {
        security: z.string(),
        board: z.string().default("TQCB"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ security, board }) => {
      const path =
        `engines/stock/markets/bonds` +
        `/boards/${board}/securities/${security}.json`;

      return jsonContent(
        await moexGet(path, {
          "iss.only":
            "securities,marketdata",
        })
      );
    }
  );

  server.registerTool(
    "get_dividends",
    {
      description:
        "Get dividend history available from MOEX ISS for a security.",
      inputSchema: {
        security: z.string(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .default(100),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ security, limit }) => {
      const data = await moexGet(
        `securities/${security}/dividends.json`
      );

      const rows = data.dividends ?? [];

      return jsonContent({
        security,
        dividends: trimRows(
          rows,
          limit
        ),
      });
    }
  );

  server.registerTool(
    "get_market_structure",
    {
      description:
        "List markets available for a MOEX trading engine. Useful for discovering valid engine/market combinations.",
      inputSchema: {
        engine: z
          .string()
          .default("stock"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ engine }) =>
      jsonContent(
        await moexGet(
          `engines/${engine}/markets.json`
        )
      )
  );

  return server;
}

const mcpHandler =
  createMcpHandler(createServer);

const PRIVACY_TEXT = `MOEX Analytics Privacy Policy

Effective date: 2026-09-07

MOEX Analytics is a read-only market-data plugin that retrieves public information from the Moscow Exchange Information & Statistical Server (MOEX ISS).

Data handling:
- MOEX Analytics does not require user registration.
- MOEX Analytics does not access brokerage accounts.
- MOEX Analytics does not place, modify or cancel trades.
- MOEX Analytics does not intentionally collect names, email addresses, payment information or other account credentials.
- Requests sent to the service may be processed by the hosting provider (Cloudflare) and by Moscow Exchange infrastructure as necessary to provide the requested market data.
- Standard technical logs may be retained by infrastructure providers according to their own policies.

Third-party data:
Market data is retrieved from MOEX ISS and remains subject to Moscow Exchange terms and data policies.

Contact:
For support or privacy questions, use the MOEX Analytics project repository on GitHub.
`;

const TERMS_TEXT = `MOEX Analytics Terms of Use

Effective date: 2026-09-07

MOEX Analytics provides read-only access to public Moscow Exchange market data through MOEX ISS.

The service is provided for informational and analytical purposes only. It does not execute transactions, access brokerage accounts or provide personalized investment advice.

Market data may be delayed, incomplete, unavailable or contain errors. Users should verify time-sensitive or trade-sensitive information with an appropriate licensed market-data source or broker before acting.

Use of Moscow Exchange data remains subject to applicable MOEX terms, licensing conditions and data policies.

The service is provided without warranty of uninterrupted availability, accuracy or fitness for a particular purpose.
`;

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "moex-analytics-mcp",
        version: "1.1.0",
      });
    }

    if (url.pathname === "/privacy") {
      return new Response(
        PRIVACY_TEXT,
        {
          status: 200,
          headers: {
            "content-type":
              "text/plain; charset=utf-8",
            "cache-control":
              "public, max-age=3600",
          },
        }
      );
    }

    if (url.pathname === "/terms") {
      return new Response(
        TERMS_TEXT,
        {
          status: 200,
          headers: {
            "content-type":
              "text/plain; charset=utf-8",
            "cache-control":
              "public, max-age=3600",
          },
        }
      );
    }

    if (
      url.pathname ===
      "/.well-known/openai-apps-challenge"
    ) {
      if (!env.OPENAI_APPS_CHALLENGE) {
        return new Response(
          "OPENAI_APPS_CHALLENGE is not configured yet.",
          {
            status: 404,
            headers: {
              "content-type":
                "text/plain; charset=utf-8",
            },
          }
        );
      }

      return new Response(
        env.OPENAI_APPS_CHALLENGE,
        {
          status: 200,
          headers: {
            "content-type":
              "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        }
      );
    }

    if (url.pathname === "/mcp") {
      return mcpHandler(
        request,
        env,
        ctx
      );
    }

    return new Response(
      [
        "MOEX Analytics MCP",
        "",
        "MCP endpoint: /mcp",
        "Health: /health",
        "Privacy: /privacy",
        "Terms: /terms",
      ].join("\n"),
      {
        status: 200,
        headers: {
          "content-type":
            "text/plain; charset=utf-8",
        },
      }
    );
  },
} satisfies ExportedHandler<Env>;
    
