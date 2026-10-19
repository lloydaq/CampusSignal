FROM python:3.14.4-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/app/data/campussignal.db

WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.lock \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin campussignal \
    && mkdir -p /app/data \
    && chown -R campussignal:campussignal /app

COPY app ./app
RUN chown -R campussignal:campussignal /app

USER campussignal
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
