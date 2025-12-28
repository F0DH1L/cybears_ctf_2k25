FROM python:3.9-slim

WORKDIR /app

# Install SQLite3 (usually included in slim images)
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create directory for SQLite database
RUN mkdir -p /app/data

# Set environment variable for database path
ENV DATABASE=/app/data/flagshop.db

EXPOSE 5000

CMD ["python", "-u", "app.py"]
