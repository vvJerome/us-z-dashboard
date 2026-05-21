FROM python:3.12-slim

# /srv is the working dir; backend package lives at /srv/backend/
WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir psycopg2-binary

COPY . backend/

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
