FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY server.ts tsconfig.json ./
COPY migrations ./migrations
COPY src ./src
COPY worker ./worker

CMD ["npm", "run", "arena:worker"]
