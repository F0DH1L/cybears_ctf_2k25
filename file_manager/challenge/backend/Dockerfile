# Use an official lightweight Python image
FROM python:3.12-slim



# Set the working directory
WORKDIR /app

# Copy the application files

COPY ./requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt 
RUN playwright install chromium && playwright install-deps

COPY . .
# Set environment variables
# Set environment variables for development/debug mode
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Expose the port Flask runs on
EXPOSE 5000

# Run the application
CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]



# FROM mcr.microsoft.com/playwright/python:v1.55.0-noble

# # Set the working directory
# WORKDIR /app

# # Copy the application files

# COPY ./requirements.txt .

# # Install dependencies
# RUN pip install --no-cache-dir -r requirements.txt 
# COPY . .
# # Set environment variables
# ENV FLASK_APP=app.py
# ENV FLASK_RUN_HOST=0.0.0.0
# ENV FLASK_ENV=production
# ENV PYTHONUNBUFFERED=1
# ENV PYTHONDONTWRITEBYTECODE=1
# # ENV FLASK_ENV=production 

# # Expose the port Flask runs on
# EXPOSE 5000

# # Run the application
# CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]
