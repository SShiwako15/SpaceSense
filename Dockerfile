FROM node:22-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS backend-dependencies
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS test
WORKDIR /workspace
COPY --from=backend-dependencies /app/node_modules/ ./backend/node_modules/
COPY backend/package.json ./backend/package.json
COPY backend/src/ ./backend/src/
COPY backend/schema.sql ./backend/schema.sql
COPY tests/ ./tests/
CMD ["node", "--test", "tests/*.test.js"]

FROM backend-dependencies AS runtime
COPY backend/src/ ./src/
COPY backend/schema.sql ./schema.sql
COPY scripts/Check-Search.mjs ./scripts/Check-Search.mjs
COPY --from=frontend-build /src/frontend/dist/ ./wwwroot/
RUN mkdir -p /app/Data && chown -R node:node /app
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]

FROM mcr.microsoft.com/playwright:v1.64.1-noble AS browser-test
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY playwright.config.js ./
COPY tests/browser/ ./tests/browser/
RUN node -e "for (const p of ['playwright.config.js', 'tests/browser/auth.spec.js', 'tests/browser/demo.spec.js']) { if (require('node:fs').statSync(p).size === 0) throw new Error('Empty browser test file: ' + p); }"
CMD ["npx", "playwright", "test"]

# Keep the application as the default image for docker build and AWS deployment.
FROM runtime AS production
