# --- Build stage -------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --omit=dev

# --- Runtime stage -----------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./

ENV DISCORD_TOKEN=""
ENV DISCORD_GUILD_ID=""
ENV PORT=3000
EXPOSE 3000

# Default to the HTTP streamable transport for container/self-host scenarios.
# For stdio, override the command with: node build/index.js
ENTRYPOINT ["node", "build/app.js"]
CMD ["--transport", "http", "--port", "3000"]
