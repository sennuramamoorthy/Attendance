import csv
from io import StringIO


def parse_csv(content: bytes) -> list[dict[str, str]]:
    text = content.decode("utf-8")
    reader = csv.DictReader(StringIO(text))
    return [
        {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        for row in reader
    ]
