FROM node:latest

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./

RUN npm install

# Copy application code
COPY . .

# Expose the application port
EXPOSE 4000
CMD ["npm", "start"]