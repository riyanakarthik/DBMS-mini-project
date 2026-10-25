"""Phase 2: embed company descriptions into companies.description_embedding.

Model: sentence-transformers/all-MiniLM-L6-v2 (384 dimensions), run locally.
  - normalize_embeddings=True -> every vector has length 1, so cosine
    distance (pgvector <=>) is a pure measure of direction (meaning).
  - The model reads at most 256 word-pieces; longer descriptions are
    truncated (the opening sentences, which say what the company does, are kept).
  - ONLY the description text is embedded. Sector/industry are deliberately
    left out so the "do embeddings recover sector structure?" report is not
    circular.

By default only rows with a NULL embedding are processed (new companies, or
ones whose description changed, see load_data.py). --all re-embeds everything.

Usage:  .venv/bin/python embed_descriptions.py [--all]
"""

import argparse
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

HERE = Path(__file__).resolve().parent
MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def to_pgvector(vec) -> str:
    # pgvector accepts the text form '[0.1,0.2,...]', cast with ::vector in SQL
    return "[" + ",".join(f"{x:.7f}" for x in vec) + "]"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="re-embed every company")
    args = ap.parse_args()

    load_dotenv(HERE.parent / ".env.local")
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set (see .env.local.example)")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT cik, description FROM companies "
            "WHERE description IS NOT NULL "
            + ("" if args.all else "AND description_embedding IS NULL ")
            + "ORDER BY cik"
        )
        rows = cur.fetchall()
        if not rows:
            print("nothing to embed")
            return

        model = SentenceTransformer(MODEL)
        print(f"model {MODEL}: dim={model.get_embedding_dimension()}, "
              f"max_seq_length={model.max_seq_length}")
        vectors = model.encode([d for _, d in rows], normalize_embeddings=True,
                               batch_size=32, show_progress_bar=False)

        # One transaction for all updates (committed when the `with` block exits).
        cur.executemany(
            "UPDATE companies SET description_embedding = %s::vector WHERE cik = %s",
            [(to_pgvector(v), cik) for (cik, _), v in zip(rows, vectors)],
        )
        print(f"embedded {len(rows)} companies")

        # Sanity check inside the DB: dimension and unit length of what was stored.
        cur.execute("""
            SELECT count(*), min(vector_dims(description_embedding)),
                   round(min(vector_norm(description_embedding))::numeric, 4),
                   round(max(vector_norm(description_embedding))::numeric, 4)
            FROM companies WHERE description_embedding IS NOT NULL""")
        n, dims, nmin, nmax = cur.fetchone()
        print(f"stored: {n} vectors, dims={dims}, norm range=[{nmin}, {nmax}]")


if __name__ == "__main__":
    main()
