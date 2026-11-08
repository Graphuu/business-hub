"""Generates the mock 'orders' operational SQLite database used by the
demo seed — stands in for a client's real Postgres/MySQL order system.
Deterministic (fixed seed) so re-running the seed produces identical
demo numbers every time.
"""

import random
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

PRODUCTS = [
    ("Aurora Desk", "Furniture", 429.00),
    ("Kestrel Chair", "Furniture", 189.00),
    ("Halo Monitor 27in", "Electronics", 349.00),
    ("Nimbus Keyboard", "Electronics", 89.00),
    ("Drift Mouse", "Electronics", 45.00),
    ("Ledger Notebook", "Stationery", 14.00),
    ("Compass Pen Set", "Stationery", 22.00),
    ("Atlas Backpack", "Accessories", 79.00),
    ("Solace Lamp", "Furniture", 59.00),
    ("Ridge Water Bottle", "Accessories", 19.00),
    ("Vertex Standing Mat", "Furniture", 65.00),
    ("Pulse Webcam", "Electronics", 75.00),
]

CITIES = [
    ("Lisbon", "Portugal"), ("Porto", "Portugal"), ("Madrid", "Spain"),
    ("Barcelona", "Spain"), ("Paris", "France"), ("Berlin", "Germany"),
    ("Amsterdam", "Netherlands"), ("Dublin", "Ireland"), ("Milan", "Italy"),
    ("London", "United Kingdom"),
]

STATUSES = ["completed", "completed", "completed", "completed", "shipped", "pending", "cancelled"]


def generate_mock_orders_db(path: Path, n_orders: int = 650, seed: int = 42) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()

    rng = random.Random(seed)
    conn = sqlite3.connect(str(path))
    conn.execute("""
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            customer_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            category TEXT NOT NULL,
            unit_price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            status TEXT NOT NULL,
            city TEXT NOT NULL,
            country TEXT NOT NULL,
            order_date TEXT NOT NULL
        )
    """)

    start = datetime(2025, 1, 1)
    rows = []
    for i in range(1, n_orders + 1):
        product, category, price = rng.choice(PRODUCTS)
        city, country = rng.choice(CITIES)
        status = rng.choice(STATUSES)
        qty = rng.randint(1, 5)
        days_offset = rng.randint(0, 264)
        order_date = (start + timedelta(days=days_offset, hours=rng.randint(0, 23))).isoformat()
        customer_id = rng.randint(1, 10)  # aligns with JSONPlaceholder's 10 mock users
        rows.append((i, customer_id, product, category, price, qty, status, city, country, order_date))

    conn.executemany("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
    conn.commit()
    conn.close()
    return path
