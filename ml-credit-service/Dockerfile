FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CREDIT_MODEL_DIR=/models/champion

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY credit_risk ./credit_risk
COPY scripts ./scripts

RUN useradd --create-home --uid 10001 modeluser
USER modeluser
EXPOSE 8000
CMD ["uvicorn", "credit_risk.api:app", "--host", "0.0.0.0", "--port", "8000"]

