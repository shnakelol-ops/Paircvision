"""Builds the committed artefact set: page images (JPEG) for the PDFs a reviewer
needs to see, plus a SHA-256 manifest of every PDF the runs produced."""
import hashlib, json, pathlib, shutil, sys
from PIL import Image

root = pathlib.Path(sys.argv[1])
keep_pdf = {
    "A": ["A-HT-snapshot-live", "A-FT-snapshot-live", "A-FullReview-live"],
    "B": ["B-HT-snapshot-live", "B-FT-snapshot-live", "B-FullReview-live", "B-HT-snapshot-reopened", "B-FT-snapshot-reopened", "B-FullReview-reopened"],
    "C": ["C-HT-snapshot-live", "C-FT-snapshot-live", "C-FullReview-live"],
    "A-legacy": ["L-HT-snapshot-legacy", "L-FT-snapshot-legacy", "L-FullReview-legacy"],
}
manifest = {}
out_pdf = root / "pdfs"; out_img = root / "pdf-images"
out_pdf.mkdir(exist_ok=True); out_img.mkdir(exist_ok=True)
for run, names in keep_pdf.items():
    rdir = root / "runs" / run
    for pdf in sorted((rdir / "pdf").glob("*.pdf")):
        manifest[f"{run}/{pdf.name}"] = {"sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(), "bytes": pdf.stat().st_size, "committed": pdf.stem in names}
        if pdf.stem in names:
            shutil.copy2(pdf, out_pdf / pdf.name)
            for png in sorted((rdir / "pdf-images").glob(f"{pdf.stem}-*.png")):
                page = png.stem.rsplit("-", 1)[1]
                Image.open(png).convert("RGB").save(out_img / f"{pdf.stem}-p{int(page):02d}.jpg", "JPEG", quality=72, optimize=True)
(root / "pdfs" / "MANIFEST.json").write_text(json.dumps(manifest, indent=1))
print(len(list(out_img.glob("*.jpg"))), "images;", len(list(out_pdf.glob("*.pdf"))), "pdfs")
