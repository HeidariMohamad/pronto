#!/usr/bin/env python3
"""Create a smaller, separate server-data snapshot. Never edits the source.

Install Pillow first. Stop writes to the application while making the snapshot.
Example: python optimize_snapshot.py --database /var/www/pronto-server/pronto.db
         --uploads /var/www/pronto-server/uploads --output /secure/pronto-optimized
"""
import argparse
import base64
import io
import json
import shutil
import sqlite3
from pathlib import Path

from PIL import Image, ImageOps


def optimize(raw):
    with Image.open(io.BytesIO(raw)) as original:
        original_format = original.format
        if original_format not in ('JPEG', 'PNG', 'WEBP'):
            return raw
        image = ImageOps.exif_transpose(original)
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        if original_format == 'JPEG' and image.mode not in ('RGB', 'L'):
            image = image.convert('RGB')
        output = io.BytesIO()
        options = {'optimize': True}
        if original_format in ('JPEG', 'WEBP'):
            options['quality'] = 75
        image.save(output, format=original_format, **options)
        candidate = output.getvalue()
        return candidate if len(candidate) < len(raw) else raw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--uploads', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    database = args.database.resolve(strict=True)
    uploads = args.uploads.resolve(strict=True)
    output = args.output.resolve()
    if output.exists() or output == uploads or uploads in output.parents or output in uploads.parents or output in database.parents:
        parser.error('Output must be a new directory outside the source data directories')
    output.mkdir(parents=True)
    snapshot_db = output / 'pronto.db'
    source = sqlite3.connect(f'{database.as_uri()}?mode=ro', uri=True)
    target = sqlite3.connect(snapshot_db)
    try:
        source.backup(target)
    finally:
        source.close()
    shutil.copytree(uploads, output / 'uploads', symlinks=False)
    saved = count = skipped = 0
    try:
        rows = target.execute('SELECT user_id, date, entries FROM records').fetchall()
        for user, day, raw_entries in rows:
            try:
                entries = json.loads(raw_entries or '[]')
                if not isinstance(entries, list):
                    continue
                changed = False
                for entry in entries:
                    photo = entry.get('photo') if isinstance(entry, dict) else None
                    if not isinstance(photo, str) or not photo.startswith('data:image/') or ';base64,' not in photo:
                        continue
                    header, data = photo.split(',', 1)
                    original = base64.b64decode(data, validate=True)
                    optimized = optimize(original)
                    if len(optimized) < len(original):
                        entry['photo'] = header + ',' + base64.b64encode(optimized).decode('ascii')
                        saved += len(photo) - len(entry['photo'])
                        count += 1
                        changed = True
                if changed:
                    target.execute('UPDATE records SET entries = ? WHERE user_id = ? AND date = ?', (json.dumps(entries, ensure_ascii=False, separators=(',', ':')), user, day))
            except (ValueError, OSError, TypeError) as exc:
                skipped += 1
                print(f'Skipped record {day}: {exc}')
        for file_id, user, filename in target.execute('SELECT id, user_id, filename FROM files').fetchall():
            try:
                if Path(user).name != user or Path(filename).name != filename:
                    raise ValueError('Invalid file path')
                file = output / 'uploads' / user / filename
                original = file.read_bytes()
                optimized = optimize(original)
                if len(optimized) < len(original):
                    file.write_bytes(optimized)
                    target.execute('UPDATE files SET size_bytes = ? WHERE id = ? AND user_id = ?', (len(optimized), file_id, user))
                    saved += len(original) - len(optimized)
                    count += 1
            except (ValueError, OSError) as exc:
                skipped += 1
                print(f'Skipped file {file_id}: {exc}')
        target.commit()
    finally:
        target.close()
    print(f'Optimized {count} photos; saved {saved} bytes; skipped {skipped}.')
    print(f'Snapshot: {output}. Original database and uploads were not changed.')


if __name__ == '__main__':
    main()
