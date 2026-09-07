from moex_mcp.client import normalize_iss


def test_normalize_iss():
    raw = {
        "securities": {
            "columns": ["SECID", "SHORTNAME"],
            "data": [["SBER", "Sberbank"], ["GMKN", "Nornickel"]],
        },
        "meta": {"x": 1},
    }
    out = normalize_iss(raw)
    assert out["securities"][0] == {"SECID": "SBER", "SHORTNAME": "Sberbank"}
    assert out["securities"][1]["SECID"] == "GMKN"
    assert out["meta"] == {"x": 1}
