FROM node:20-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

RUN useradd -r -u 10001 gridstate
USER gridstate

EXPOSE 3000
CMD ["node", "src/index.js"]
