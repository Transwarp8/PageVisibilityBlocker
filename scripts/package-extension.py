#!/usr/bin/env python3
import hashlib
import json
import os
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
MANIFEST_PATH = ROOT / 'manifest.json'

REQUIRED_FILES = [
    'manifest.json',
    'background.js',
    'blocker.js',
    'popup.html',
    'popup.js',
    'icon-16.png',
    'icon-48.png',
    'icon-128.png'
]


def sha256sum(file_path: Path) -> str:
    h = hashlib.sha256()
    with file_path.open('rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    if not MANIFEST_PATH.exists():
        raise SystemExit('manifest.json not found')

    manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
    version = manifest.get('version', '0.0.0')

    missing = [f for f in REQUIRED_FILES if not (ROOT / f).exists()]
    if missing:
        raise SystemExit(f'Missing required files: {missing}')

    DIST.mkdir(parents=True, exist_ok=True)

    pkg_name = f'PageVisibilityBlocker-v{version}'
    staging_dir = DIST / pkg_name
    zip_path = DIST / f'{pkg_name}.zip'

    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    if zip_path.exists():
        zip_path.unlink()

    staging_dir.mkdir(parents=True, exist_ok=True)

    for rel in REQUIRED_FILES:
        src = ROOT / rel
        dst = staging_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for rel in REQUIRED_FILES:
            src = staging_dir / rel
            zf.write(src, arcname=rel)

    package_sha = sha256sum(zip_path)

    summary = {
        'package': str(zip_path),
        'sha256': package_sha,
        'version': version,
        'files': REQUIRED_FILES
    }

    summary_path = DIST / f'{pkg_name}.json'
    summary_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')

    print(f'Created package: {zip_path}')
    print(f'SHA256: {package_sha}')
    print(f'Metadata: {summary_path}')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
