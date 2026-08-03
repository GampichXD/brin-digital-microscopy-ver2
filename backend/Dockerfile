# Gunakan image Python resmi yang ringan
FROM python:3.11-slim

# Install library sistem yang dibutuhkan oleh OpenCV dan psutil
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Tentukan working directory di dalam container
WORKDIR /app

# Copy file requirements dan install library Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy seluruh kode backend ke dalam container
COPY . .

# Expose port yang digunakan FastAPI
EXPOSE 8000

# Jalankan server Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]