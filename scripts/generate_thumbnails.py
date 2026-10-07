#!/usr/bin/env python3
"""
Generate WebP thumbnails for portfolio images and update README.md references.
Target width: 640px (optimal for 2x Retina display at 320px rendered width).
"""

import os
import re
import sys
from pathlib import Path
from PIL import Image

TARGET_WIDTH = 640
WEBP_QUALITY = 82
ROOT_DIR = Path(__file__).resolve().parent.parent
THUMBS_DIR = ROOT_DIR / "thumbs"
README_PATH = ROOT_DIR / "README.md"
SUPPORTED_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def process_image(src_path: Path, dest_path: Path, force: bool = False) -> bool:
    """
    Generate thumbnail if dest doesn't exist, is older than src, or force=True.
    Returns True if an image was newly generated.
    """
    if not force and dest_path.exists():
        if dest_path.stat().st_mtime >= src_path.stat().st_mtime:
            return False

    with Image.open(src_path) as img:
        # Convert color mode
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")

        # Resize if width exceeds TARGET_WIDTH
        orig_w, orig_h = img.size
        if orig_w > TARGET_WIDTH:
            target_h = int(orig_h * (TARGET_WIDTH / orig_w))
            img = img.resize((TARGET_WIDTH, target_h), Image.Resampling.LANCZOS)

        img.save(dest_path, format="WEBP", quality=WEBP_QUALITY, method=6)

    return True


def update_readme(readme_path: Path, thumbs_dir: Path) -> bool:
    """
    Update image src references in README.md from original portfolio-* to ./thumbs/*.webp.
    Returns True if README.md was modified.
    """
    if not readme_path.exists():
        return False

    content = readme_path.read_text(encoding="utf-8")

    # Pattern matches src="./portfolio-..." or src="portfolio-..."
    # Avoids matching if already in thumbs/
    pattern = re.compile(r'src="(?:\./)?(portfolio-[^"]+?)\.(png|jpg|jpeg|webp)"')

    def replacer(match):
        stem = match.group(1)
        thumb_name = f"{stem}.webp"
        if (thumbs_dir / thumb_name).exists():
            return f'src="./thumbs/{thumb_name}"'
        return match.group(0)

    new_content = pattern.sub(replacer, content)

    if new_content != content:
        readme_path.write_text(new_content, encoding="utf-8")
        return True
    return False


def main():
    force = "--force" in sys.argv
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)

    # Collect all portfolio-* images
    image_files = []
    for item in ROOT_DIR.iterdir():
        if item.is_file() and item.name.startswith("portfolio-") and item.suffix.lower() in SUPPORTED_EXTS:
            image_files.append(item)

    image_files.sort(key=lambda p: p.name)

    generated_count = 0
    skipped_count = 0
    orig_total_size = 0
    thumb_total_size = 0

    print(f"Found {len(image_files)} portfolio images to check.")

    for img_path in image_files:
        dest_path = THUMBS_DIR / f"{img_path.stem}.webp"
        orig_size = img_path.stat().st_size
        orig_total_size += orig_size

        was_generated = process_image(img_path, dest_path, force=force)
        thumb_size = dest_path.stat().st_size
        thumb_total_size += thumb_size

        if was_generated:
            generated_count += 1
            ratio = (thumb_size / orig_size) * 100 if orig_size > 0 else 100
            print(f" [Generated] {img_path.name} ({orig_size / 1024:.1f} KB) -> {dest_path.name} ({thumb_size / 1024:.1f} KB, -{100 - ratio:.1f}%)")
        else:
            skipped_count += 1

    readme_updated = update_readme(README_PATH, THUMBS_DIR)

    print("\n" + "=" * 50)
    print(f"Summary:")
    print(f"  - Newly generated: {generated_count}")
    print(f"  - Up to date:      {skipped_count}")
    print(f"  - Total original:  {orig_total_size / 1024 / 1024:.2f} MB")
    print(f"  - Total thumbs:    {thumb_total_size / 1024 / 1024:.2f} MB")
    if orig_total_size > 0:
        saved_pct = (1 - thumb_total_size / orig_total_size) * 100
        print(f"  - Space saved:     {saved_pct:.1f}%")
    print(f"  - README.md:       {'Updated' if readme_updated else 'No changes needed'}")
    print("=" * 50)


if __name__ == "__main__":
    main()
