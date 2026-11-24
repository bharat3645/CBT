FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
ARG WITH_DOCLING=false
ENV DOCPARSE_USE_DOCLING=${WITH_DOCLING}
COPY requirements.txt requirements-docling.txt ./
RUN if [ "$WITH_DOCLING" = "true" ]; then pip install -r requirements-docling.txt; else pip install -r requirements.txt; fi
COPY docparse ./docparse
RUN useradd -m app && chown -R app /app
USER app
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "docparse.main:app", "--host", "0.0.0.0", "--port", "8000"]
