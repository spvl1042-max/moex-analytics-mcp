from __future__ import annotations

import os
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.requests import Request
from starlette.responses import JSONResponse

from .client import MoexClient

mcp = FastMCP(
    "MOEX Analytics",
    instructions=(
        "Read-only Moscow Exchange market-data tools backed by official MOEX ISS. "
        "Use these tools for Russian equities, bonds, futures, FX and indices. "
        "Data availability and latency depend on MOEX permissions/subscription."
    ),
)

client = MoexClient(timeout=float(os.getenv("MOEX_TIMEOUT", "20")))

def _trim(rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    return rows[: max(1, min(limit, 1000))]

@mcp.custom_route("/health", methods=["GET"])
async def health(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "moex-analytics-mcp"})

@mcp.tool()
async def search_securities(query: str, limit: int = 20) -> dict[str, Any]:
    data = await client.get("securities.json", {"q": query, "iss.only": "securities"})
    return {"query": query, "results": _trim(data.get("securities", []), limit)}

@mcp.tool()
async def get_security(security: str) -> dict[str, Any]:
    return await client.get(f"securities/{security}.json")

@mcp.tool()
async def get_quote(security: str, engine: str = "stock", market: str = "shares", board: str = "TQBR") -> dict[str, Any]:
    path = f"engines/{engine}/markets/{market}/boards/{board}/securities/{security}.json"
    return await client.get(path, {"iss.only": "securities,marketdata"})

@mcp.tool()
async def get_candles(
    security: str,
    interval: int = 24,
    from_date: str | None = None,
    till_date: str | None = None,
    engine: str = "stock",
    market: str = "shares",
    board: str = "TQBR",
    limit: int = 1000,
) -> dict[str, Any]:
    params: dict[str, Any] = {"interval": interval, "iss.only": "candles"}
    if from_date:
        params["from"] = from_date
    if till_date:
        params["till"] = till_date
    path = f"engines/{engine}/markets/{market}/boards/{board}/securities/{security}/candles.json"
    rows = await client.paged(path, "candles", params=params, max_rows=min(limit, 5000))
    return {"security": security, "engine": engine, "market": market, "board": board, "interval": interval, "rows": rows}

@mcp.tool()
async def get_trades(security: str, engine: str = "stock", market: str = "shares", board: str = "TQBR", limit: int = 100) -> dict[str, Any]:
    path = f"engines/{engine}/markets/{market}/boards/{board}/securities/{security}/trades.json"
    data = await client.get(path, {"iss.only": "trades"})
    return {"security": security, "trades": _trim(data.get("trades", []), limit)}

@mcp.tool()
async def get_history(
    security: str,
    from_date: str | None = None,
    till_date: str | None = None,
    engine: str = "stock",
    market: str = "shares",
    board: str = "TQBR",
    limit: int = 1000,
) -> dict[str, Any]:
    params: dict[str, Any] = {"iss.only": "history"}
    if from_date:
        params["from"] = from_date
    if till_date:
        params["till"] = till_date
    path = f"history/engines/{engine}/markets/{market}/boards/{board}/securities/{security}.json"
    rows = await client.paged(path, "history", params=params, max_rows=min(limit, 5000))
    return {"security": security, "rows": rows}

@mcp.tool()
async def get_index(index: str = "IMOEX", include_marketdata: bool = True) -> dict[str, Any]:
    path = f"engines/stock/markets/index/securities/{index}.json"
    only = "securities,marketdata" if include_marketdata else "securities"
    return await client.get(path, {"iss.only": only})

@mcp.tool()
async def get_futures_contract(security: str, board: str = "RFUD") -> dict[str, Any]:
    path = f"engines/futures/markets/forts/boards/{board}/securities/{security}.json"
    return await client.get(path, {"iss.only": "securities,marketdata"})

@mcp.tool()
async def get_bond(security: str, board: str = "TQCB") -> dict[str, Any]:
    path = f"engines/stock/markets/bonds/boards/{board}/securities/{security}.json"
    return await client.get(path, {"iss.only": "securities,marketdata"})

@mcp.tool()
async def get_dividends(security: str, limit: int = 100) -> dict[str, Any]:
    data = await client.get(f"securities/{security}/dividends.json")
    key = "dividends" if "dividends" in data else next((k for k, v in data.items() if isinstance(v, list)), "dividends")
    return {"security": security, "dividends": _trim(data.get(key, []), limit)}

@mcp.tool()
async def get_market_structure(engine: str = "stock") -> dict[str, Any]:
    return await client.get(f"engines/{engine}/markets.json")

def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    security = TransportSecuritySettings(
        allowed_hosts=[
            "*.onrender.com",
            "*.onrender.com:*",
            "localhost",
            "localhost:*",
            "127.0.0.1",
            "127.0.0.1:*",
        ],
        allowed_origins=[
            "https://chatgpt.com",
            "https://chat.openai.com",
            "http://localhost:*",
            "http://127.0.0.1:*",
        ],
    )

    mcp.run(
        transport="streamable-http",
        host=host,
        port=port,
        stateless_http=True,
        json_response=True,
        transport_security=security,
    )

if __name__ == "__main__":
    main()
