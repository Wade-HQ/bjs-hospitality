FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install server dependencies
COPY package.json ./
RUN npm install --omit=dev

# Build React client
COPY client/package.json ./client/
RUN cd client && npm install

COPY client/ ./client/
RUN cd client && npm run build

# Copy server files
COPY . .

EXPOSE 3101

RUN mkdir -p /opt/bjs-hospitality/database /opt/bjs-hospitality/uploads

CMD ["node", "server.js"]
