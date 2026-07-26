#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
"""Verify input-manifest.yaml's recorded pins match the real submodule gitlinks.

The manifest duplicates each pinned commit so humans and tools can read it
without git; this check is what keeps those duplicates honest. It walks EVERY
git-submodule input and compares that entry's own `commit` against the gitlink
at the path the same entry declares -- so adding, removing or reordering
inputs cannot silently leave one unvalidated.

git ls-tree reads gitlinks straight out of the tree, so the submodules do not
need to be initialised or checked out (CI's security job does neither).

Run locally before pushing a pin bump:  python3 tools/check-input-manifest.py
"""

import subprocess
import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")

MANIFEST = "input-manifest.yaml"


def gitlink(path):
    """The commit a submodule path is pinned to in HEAD's tree, or ""."""
    out = subprocess.run(
        ["git", "ls-tree", "HEAD", path],
        capture_output=True, text=True, check=False,
    ).stdout.split()
    # "160000 commit <sha>\t<path>" -- anything else (missing path, or a path
    # that is a normal file rather than a gitlink) is not a valid pin.
    if len(out) < 3 or out[0] != "160000" or out[1] != "commit":
        return ""
    return out[2]


def main():
    with open(MANIFEST, encoding="utf-8") as fh:
        manifest = yaml.safe_load(fh)

    inputs = (manifest or {}).get("inputs") or []
    checked, failures = 0, 0

    for entry in inputs:
        if entry.get("mechanism") != "git-submodule":
            continue
        checked += 1
        name = entry.get("name", "<unnamed>")
        path, want = entry.get("path"), entry.get("commit")
        # A 40-char all-digit sha is valid git but YAML loads it as an int, so
        # normalise before comparing rather than reporting a bogus type error.
        want = "" if want is None else str(want).strip()
        if not path or not want:
            print(f"::error file={MANIFEST}::{name}: a git-submodule input needs "
                  f"both `path` and `commit` (got path={path!r} commit={want!r})")
            failures += 1
            continue
        got = gitlink(path)
        print(f"{name}: manifest={want} gitlink={got}")
        if want != got:
            print(f"::error file={MANIFEST}::{name}: manifest commit ({want}) != "
                  f"{path} submodule gitlink ({got or 'none'}). Update "
                  f"{MANIFEST} in the same commit as the pin bump.")
            failures += 1

    if not checked:
        print(f"::error file={MANIFEST}::no git-submodule inputs found -- this "
              f"check is validating nothing. Did an entry lose its `mechanism`?")
        failures += 1

    matched = max(checked - failures, 0)
    print(f"{matched}/{checked} submodule pin(s) match the manifest")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
