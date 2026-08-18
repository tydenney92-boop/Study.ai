FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app/backend

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend ./
COPY css /app/css
COPY js /app/js
COPY *.html /app/

EXPOSE 3000
CMD ["npm", "run", "start:production"]
