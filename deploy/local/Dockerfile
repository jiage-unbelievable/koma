ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force \
    && node -e 'require("node:fs").chmodSync(require("@ffprobe-installer/ffprobe").path,0o755)' \
    && mkdir -p /app/data && chown node:node /app/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 3000
CMD ["node", "dist-server/index.js"]
