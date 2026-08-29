# Czech Web Explorer — self-hosted image.
# Chrome/Chromium sandbox needs --no-sandbox in containers. (Playwright chromium.

FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json./
RUN npm ci --omit=dev
RUN npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

VOLUME [/app/data]

EXPOSE 3000

CMD ["node", "server/server.js"]