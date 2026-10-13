"""Command-line entry point.

python -m app.ingestion fetch [--refresh]   download raw sources (cached)
python -m app.ingestion build               parse, cross-check, validate, write
python -m app.ingestion load                load the corpus into Postgres + embed
python -m app.ingestion all                 fetch, build and load
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.ingestion import pipeline


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.ingestion")
    sub = parser.add_subparsers(dest="command", required=True)
    fetch = sub.add_parser("fetch", help="download raw source files")
    fetch.add_argument("--refresh", action="store_true", help="re-download cached files")
    sub.add_parser("build", help="parse, cross-check and validate into data/processed")
    load = sub.add_parser("load", help="load data/processed into Postgres and embed")
    load.add_argument("--reembed", action="store_true", help="recompute all embeddings")
    sub.add_parser("all", help="fetch, build and load")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if args.command in ("fetch", "all"):
        pipeline.fetch_all(refresh=getattr(args, "refresh", False))
        print("Fetched raw sources into data/raw/.")

    if args.command in ("build", "all"):
        report = pipeline.build()
        print(
            f"Passages: {report.stats.get('passages', 0)}  Provenance: {report.stats.get('provenance', {})}"
        )
        print(f"Needs review: {len(report.warnings)}  Errors: {len(report.errors)}")
        print("Report: data/processed/validation_report.md")
        if not report.ok:
            for error in report.errors[:50]:
                print(f"  ERROR {error}", file=sys.stderr)
            return 1

    if args.command in ("load", "all"):
        from app.storage.loader import load_into_postgres

        summary = load_into_postgres(reembed=getattr(args, "reembed", False))
        print(summary)

    return 0


if __name__ == "__main__":
    sys.exit(main())
