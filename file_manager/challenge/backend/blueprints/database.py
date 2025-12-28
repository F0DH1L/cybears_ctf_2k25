import sqlite3
from werkzeug.security import generate_password_hash
DB_NAME = "data/app.db"
import os

from dotenv import load_dotenv

load_dotenv()

def init_db():
    """Initialize the database and create tables if they don't exist."""
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                admin INTEGER NOT NULL DEFAULT 0
            )
        """)
        print(os.environ['ADMIN_PASSWORD'])
        hashed_password = generate_password_hash(os.environ['ADMIN_PASSWORD'])

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                content TEXT NOT NULL,
                visits INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Check if admin user exists before inserting
        cursor.execute("DELETE FROM users WHERE username = 'admin'")
        cursor.execute("""
            INSERT INTO users (username, password, admin) VALUES (?, ?, ?)
        """, ('admin', hashed_password, 1))

        conn.commit()

def get_db_connection():
    """Create and return a database connection."""
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row  # Allows dictionary-like row access
    return conn
