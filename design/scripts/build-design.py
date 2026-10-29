#!/usr/bin/env python3
"""Generate artwork locally; validate and package committed assets for the site."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from asset_library import ROOT, DESIGN, asset_records, copy_changed, logo_source

STATE = DESIGN / "build-state.json"
CACHE = DESIGN / ".cache"
ACTIONS = ("idle", "wave", "point", "celebrate", "think", "step")


def digest(paths):
    result = hashlib.sha256()
    for path in sorted(set(paths)):
        result.update(str(path.relative_to(ROOT)).encode() + b"\0")
        result.update(path.read_bytes() if path.is_file() else b"MISSING")
        result.update(b"\0")
    return result.hexdigest()


def files(pattern):
    return sorted(ROOT.glob(pattern))


def groups():
    """Conservative shared dependencies; action-local edits rebuild only that action."""
    static_source = DESIGN / "assets/mascot/source/static-poses.json"
    static_poses = (json.loads((DESIGN / "assets/mascot/source/poses.json").read_text())
                    | json.loads(static_source.read_text()))
    action_files = {DESIGN / f"motion/src/mascots/{action.title()}{suffix}.tsx"
                    for action in ACTIONS for suffix in ("", "Rig")}
    # Unknown/new helpers are conservatively shared. This also catches new nested
    # modules and imported artwork rather than silently missing their changes.
    shared = [p for p in files("design/motion/src/**/*") if p.is_file() and p not in action_files]
    shared += [DESIGN / "assets/mascot/source/poses.json", DESIGN / "motion/package.json",
               DESIGN / "motion/package-lock.json", DESIGN / "motion/remotion.config.ts",
               DESIGN / "motion/tsconfig.json"]
    shared = [p for p in shared if not p.name.endswith((".test.ts", ".test.tsx"))]
    logo_outputs = [ROOT / "src/assets/site" / name for name in
                    ("logo.svg", "logo-dark.svg", "logo-lockup.svg", "logo-lockup-dark.svg",
                     "logo-small.svg", "logo.png", "logo-lockup.png", "og-image.png")]
    logo_outputs += [ROOT / "public" / name for name in
                     ("favicon.svg", "favicon.png", "favicon.ico", "apple-touch-icon.png", "icon-192.png", "icon-512.png")]
    result = {
        "logo": {
            "inputs": [logo_source(), DESIGN / "scripts/build-brand-assets.py",
                       DESIGN / "requirements.txt"],
            "outputs": logo_outputs,
        },
        "stills": {
            "inputs": [ROOT / "src/assets/site/logo.svg", DESIGN / "assets/mascot/source/poses.json",
                        static_source,
                       DESIGN / "scripts/build-mascot-kit.py", DESIGN / "requirements.txt",
                       ROOT / "src/assets/fonts/ClarityCity-Regular.ttf"],
            "outputs": [ROOT / "src/assets/mascot/overview.png"]
                       + [ROOT / f"src/assets/mascot/static/{treatment}/{pose}.{extension}"
                           for treatment in ("ink", "linen") for pose in static_poses
                          for extension in ("svg", "png")],
        },
    }
    for action in ACTIONS:
        name = action.title()
        inputs = shared + [DESIGN / f"motion/src/mascots/{name}.tsx",
                           DESIGN / f"motion/src/mascots/{name}Rig.tsx"]
        for kind, extension in (("lottie", "json"), ("video", "mov")):
            result[f"{kind}:{action}"] = {
                "inputs": inputs + ([DESIGN / "motion/scripts/export-lotties.mjs"] if kind == "lottie" else []),
                "outputs": [ROOT / f"src/assets/mascot/{kind}/green-fix-{action}-{t}.{extension}"
                            for t in ("ink", "linen")],
            }
    # Changes to shared build logic invalidate all products, not just packaging.
    for group in result.values():
        group["inputs"] += [Path(__file__)]
    result["logo"]["inputs"].append(DESIGN / "scripts/asset_library.py")
    return result


def snapshot(group):
    return {"inputs": digest(group["inputs"]), "outputs": digest(group["outputs"])}


def read_state():
    # Freshness must describe what is committed, never an ignored local/CI cache.
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def dirty(name, group, state):
    return (any(not p.is_file() for p in group["outputs"])
            or state.get(name) != snapshot(group))


def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)


def publish():
    """Refresh disposable public outputs without touching an existing handoff release."""
    CACHE.mkdir(parents=True, exist_ok=True)
    records = asset_records()
    spec = importlib.util.spec_from_file_location("package_brand_kit", DESIGN / "scripts/package-brand-kit.py")
    package = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(package)
    target = ROOT / "public/brand-assets"
    target.mkdir(parents=True, exist_ok=True)
    # Only files listed by our last catalogue are eligible for pruning.
    catalogue = target / "catalog.json"
    previous = json.loads(catalogue.read_text()) if catalogue.exists() else []
    expected = {record["file"] for record in records}
    for record in previous:
        relative = Path(record["file"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Unsafe generated catalogue entry")
        path = target / "files" / relative
        if record["file"] not in expected and path.is_file():
            path.unlink()
    for record in records:
        copy_changed(ROOT / record["source"], target / "files" / record["file"])
    text = json.dumps(records, indent=2) + "\n"
    release_key = hashlib.sha256((text + (DESIGN / "scripts/package-brand-kit.py").read_text()).encode()).hexdigest()
    stamp = CACHE / "release-key"
    # The catalogue also fingerprints packaging inputs, so guide/font/photo edits
    # refresh the ZIP without re-rendering artwork.
    if (not catalogue.exists() or catalogue.read_text() != text
            or not stamp.exists() or stamp.read_text() != release_key
            or not (target / "city-changers-brand-kit.zip").exists()):
        with tempfile.TemporaryDirectory(prefix="brand-release-", dir=CACHE) as temporary:
            package.build(Path(temporary))
            copy_changed(Path(temporary) / "city-changers-brand-kit.zip", target / "city-changers-brand-kit.zip")
        catalogue.write_text(text)
        stamp.write_text(release_key)


def build(plan_only=False, check=False, prepare=False, stills_only=False):
    if not (plan_only or check or prepare) and os.environ.get("CI", "").lower() in {"true", "1"}:
        raise SystemExit("CI must not generate artwork. Run npm run design:build locally and commit the results.")
    state = read_state()
    current = groups()
    changed = [name for name, group in current.items() if dirty(name, group, state)]
    # A changed logo feeds stills; list this dependency even before its new output exists.
    if "logo" in changed and "stills" not in changed:
        changed.append("stills")
    if stills_only:
        if "logo" in changed:
            raise SystemExit("Logo outputs are stale; rebuild the logo before generating stills.")
        changed = [name for name in changed if name == "stills"]
    if plan_only:
        print(json.dumps(changed))
        return
    if check or prepare:
        if changed:
            raise SystemExit("Stale design outputs: " + ", ".join(changed)
                             + ". Run npm run design:build locally, review the artwork, and commit"
                               " the sources, generated assets and design/build-state.json together.")
        if prepare:
            publish()
        return
    print("Design rebuild: " + (", ".join(changed) or "none; sources and outputs match"), flush=True)
    if "logo" in changed:
        run([sys.executable, "design/scripts/build-brand-assets.py"])
    if "stills" in changed:
        run([sys.executable, "design/scripts/build-mascot-kit.py"])
    motion = [name for name in changed if ":" in name]
    if motion:
        # npm ci is needed only when a motion product actually needs rebuilding.
        run(["npm", "ci"], DESIGN / "motion")
        lotties = [name.split(":")[1] for name in motion if name.startswith("lottie:")]
        if lotties:
            run(["npm", "run", "export:lottie", "--", *lotties], DESIGN / "motion")
        for name in motion:
            if not name.startswith("video:"):
                continue
            action = name.split(":")[1]
            for treatment in ("ink", "linen"):
                output = ROOT / f"src/assets/mascot/video/green-fix-{action}-{treatment}.mov"
                output.parent.mkdir(parents=True, exist_ok=True)
                # Render beside, then atomically replace, the approved working export.
                temporary = output.with_name(output.stem + ".building.mov")
                try:
                    run(["npx", "remotion", "render", "src/index.ts", f"Mascot-{action.title()}", str(temporary),
                         "--codec=prores", "--prores-profile=4444", "--pixel-format=yuva444p10le",
                         "--image-format=png", "--props=" + json.dumps({"treatment": treatment}),
                         "--concurrency=2"], DESIGN / "motion")
                    temporary.replace(output)
                finally:
                    temporary.unlink(missing_ok=True)
    # Save state only after every dependent build succeeded.
    state.update({name: snapshot(group) for name, group in groups().items()
                  if not stills_only or name == "stills"})
    missing = [str(path.relative_to(ROOT)) for group in groups().values()
               for path in group["outputs"] if not path.is_file()]
    if missing:
        raise FileNotFoundError("Generation did not produce required assets: " + ", ".join(missing))
    STATE.write_text(json.dumps(state, indent=2) + "\n")
    publish()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--plan", action="store_true", help="Print stale product groups without changing files")
    mode.add_argument("--check", action="store_true", help="Validate assets against the committed freshness record")
    mode.add_argument("--prepare", action="store_true", help="Validate and package committed assets; never regenerate artwork")
    mode.add_argument("--stills", action="store_true", help="Generate static poses only; never install motion dependencies or render animations")
    args = parser.parse_args()
    build(args.plan, args.check, args.prepare, args.stills)
