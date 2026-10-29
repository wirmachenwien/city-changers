"""Read shared colors without allowing direct Python entrypoints to ship stale data."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_colors(root: Path = ROOT) -> dict:
    source = root / "design/colors.json"
    output = root / "src/data/colors.generated.json"
    if not output.is_file():
        raise ValueError("Generated colors are missing; run npm run colors:generate")
    colors = json.loads(output.read_text(encoding="utf-8"))
    if colors.get("registrySha256") != hashlib.sha256(source.read_bytes()).hexdigest():
        raise ValueError("Generated colors are outdated; run npm run colors:generate")
    return colors
