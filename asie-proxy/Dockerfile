FROM node:20-bookworm-slim

# Install Chromium and system dependencies required by Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the system chromium and skip its own download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_PRODUCT=chrome \
    NODE_ENV=production \
    PORT=3001

WORKDIR /app

# Install deps (use npm install since we don't have package-lock.json in repo)
COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
