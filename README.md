# MOEX Analytics MCP

Read-only MCP server for official Moscow Exchange ISS market data.

## What it exposes

- `search_securities` — search by ticker, ISIN or name
- `get_security` — instrument specification and board mappings
- `get_quote` — current/delayed market data
- `get_candles` — OHLCV candles
- `get_trades` — anonymous trades available through ISS
- `get_history` — end-of-day history, subject to MOEX permissions
- `get_index` — MOEX indices such as IMOEX/RTSI
- `get_futures_contract` — FORTS futures
- `get_bond` — bonds
- `get_dividends` — dividend history
- `get_market_structure` — markets for a trading engine

The server does not place orders and does not connect to brokerage accounts.

## Data source

Official MOEX ISS:

`https://iss.moex.com/iss`

MOEX states that ISS provides market structure, instrument descriptions, candles,
anonymous trades, quotes, historical data and metadata. Delayed data can be available
without authorization; real-time and some historical/order-book data depend on
subscription and permissions.

## Local run

Python 3.10+:

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -e ".[dev]"
moex-mcp
```

The MCP endpoint is:

`http://localhost:8000/mcp`

## Docker

```bash
docker build -t moex-analytics-mcp .
docker run --rm -p 8000:8000 moex-analytics-mcp
```

## Example tool usage

Typical prompts after connecting the MCP server:

- "Get the current MOEX market data for SBER."
- "Get daily candles for GMKN from 2026-06-01 through 2026-09-01."
- "Show IMOEX market data."
- "Find MOEX instruments matching OFZ 26248."
- "Get the contract specification for a FORTS futures ticker."

## Deployment

Any public HTTPS service that can run a Docker container can host this server.
The ChatGPT-side MCP URL should point to:

`https://YOUR_HOST/mcp`

For production, verify the current MCP SDK deployment guidance, host validation,
authentication requirements and your MOEX market-data licensing/redistribution terms.

## Important data/licensing note

This project is a technical connector, not a license to redistribute exchange data.
MOEX access rights vary by dataset, delay, authentication and intended use. Use the
server in accordance with the exchange's current market-data terms.

## Next planned modules

1. Central Bank of Russia macro data
2. RUONIA / key rate / FX reference data
3. issuer disclosures and corporate actions
4. bond yield-curve helpers
5. technical-analysis convenience tools built from raw MOEX candles
