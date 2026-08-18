FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend ./
COPY css /app/css
COPY js /app/js
COPY *.html /app/

EXPOSE 3000
CMD ["npm", "run", "start:production"]
