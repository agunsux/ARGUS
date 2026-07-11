# ARGUS v1.0 Production Dockerfile
FROM node:18-alpine

# Set environment
ENV NODE_ENV=production
WORKDIR /usr/src/app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application source code
COPY src/ ./src/
COPY fixtures/ ./fixtures/

# Expose port (default standard HTTP gateway port)
EXPOSE 3000

# Start server
CMD ["node", "src/server.js"]
