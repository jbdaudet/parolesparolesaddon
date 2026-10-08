FROM python:3.12-slim-bookworm

WORKDIR /app
COPY . .

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends git \
  && pip install --upgrade pip \
  && pip install -r requirements.txt \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

CMD python src/main.py






