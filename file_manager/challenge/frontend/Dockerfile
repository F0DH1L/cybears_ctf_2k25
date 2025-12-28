# Use the official Node.js image as the base image
FROM node:23.9-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY ./package* .

# Install dependencies
RUN npm install

# Install a simple HTTP server to serve the build
RUN npm install -g serve

COPY . .

ENV NEXT_PUBLIC_API_URL=http://172.21.0.2:5000

# Build the application
RUN npm run build


# Expose the port the app runs on
EXPOSE 3000

# Define the command to serve the application
CMD ["npm", "run", "start"]