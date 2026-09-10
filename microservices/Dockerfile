FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 MPLCONFIGDIR=/tmp/matplotlib YOLO_CONFIG_DIR=/tmp/ultralytics OMP_NUM_THREADS=2
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY microservices/requirements.txt /app/microservices/requirements.txt
RUN pip install torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cpu && pip install -r microservices/requirements.txt
COPY microservices /app/microservices
COPY models /app/models
WORKDIR /app/microservices
CMD ["sh", "-c", "python prepare_models.py && exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1"]
