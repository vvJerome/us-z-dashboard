FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN apt-get update && apt-get install --no-install-recommends -y curl && \
    rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir psycopg2-binary

COPY . /app/backend/

# ponytail: root user; job dispatch reads SSH keys bind-mounted at /root/.ssh/*,
# switch to a non-root user once those paths move under a dedicated home dir.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
