# MOEX Analytics MCP

Read-only MCP server for official Moscow Exchange ISS market data.

## Files

- `app.py` - MCP server and MOEX ISS client
- `requirements.txt` - Python dependencies
- `Dockerfile` - container image
- `render.yaml` - Render deployment configuration

## MCP endpoint

After deployment:

`https://<your-render-host>/mcp`

Health check:

`https://<your-render-host>/health`
