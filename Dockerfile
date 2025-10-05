FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S appuser -u 1001 -G nodejs
RUN chown -R appuser:nodejs /app
USER appuser

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/api/movies', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start server
CMD ["node", "server.js"]
