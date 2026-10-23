"""Extract only the audited 26.3 environment profile from an explicitly provided official client jar."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def main():
    """Verify the source and reproduce the existing manifest's bounded original files byte for byte."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("client", type=Path, help="Already acquired official Java 26.3 client.jar")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2] / "resources/minecraft/26.3"
    manifest = json.loads((root / "environment-manifest.json").read_text(encoding="utf-8"))
    if hashlib.sha1(args.client.read_bytes()).hexdigest() != manifest["clientSha1"]:
        raise ValueError("wrong-client-version")
    with zipfile.ZipFile(args.client) as jar:
        for entry in manifest["entries"]:
            name = entry["entry"]
            if ".." in Path(name).parts or not name.startswith(("assets/minecraft/", "data/minecraft/")):
                raise ValueError("invalid-resource-path")
            body = jar.read(name)
            if len(body) != entry["size"] or hashlib.sha256(body).hexdigest() != entry["sha256"]:
                raise ValueError("resource-integrity:" + name)
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.read_bytes() != body:
                target.write_bytes(body)
    print("Verified/extracted", len(manifest["entries"]), "original environment files")


if __name__ == "__main__":
    main()
