from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import httpx


BASE_URL = "https://iss.moex.com/iss"


class MoexError(RuntimeError):
    pass


def normalize_iss(payload: dict[str, Any]) -> dict[str, Any]:
    """Convert MOEX ISS column/data blocks into lists of dictionaries."""
    result: dict[str, Any] = {}
    for name, block in payload.items():
        if isinstance(block, dict) and "columns" in block and "data" in block:
            columns = block.get("columns") or []
            rows = block.get("data") or []
            result[name] = [dict(zip(columns, row)) for row in rows]
        else:
            result[name] = block
    return result


@dataclass(slots=True)
class MoexClient:
    timeout: float = 20.0
    base_url: str = BASE_URL

    async def get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        p = dict(params or {})
        p.setdefault("iss.meta", "off")
        p.setdefault("lang", "en")
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            response = await client.get(url, params=p)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise MoexError(f"MOEX ISS returned HTTP {response.status_code} for {response.url}") from exc
            try:
                return normalize_iss(response.json())
            except ValueError as exc:
                raise MoexError(f"MOEX ISS returned non-JSON response for {response.url}") from exc

    async def paged(
        self,
        path: str,
        block: str,
        params: dict[str, Any] | None = None,
        max_rows: int = 5000,
        page_size_guess: int = 100,
    ) -> list[dict[str, Any]]:
        """Fetch paginated ISS block by advancing the `start` parameter."""
        out: list[dict[str, Any]] = []
        start = 0
        while len(out) < max_rows:
            p = dict(params or {})
            p["start"] = start
            data = await self.get(path, p)
            rows = data.get(block, [])
            if not isinstance(rows, list) or not rows:
                break
            remaining = max_rows - len(out)
            out.extend(rows[:remaining])
            if len(rows) < page_size_guess:
                break
            start += len(rows)
        return out
