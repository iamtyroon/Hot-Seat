FROM node:24-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY server.ts tsconfig.json ./
COPY migrations ./migrations
COPY src ./src
COPY worker ./worker

CMD ["npm", "run", "arena:worker"]
