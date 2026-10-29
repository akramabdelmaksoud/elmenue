FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    APP_VERSION=$APP_VERSION
# Run as the unprivileged "node" user that ships with the image. The data folder holds push keys / local fallbacks.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
VOLUME /app/data
HEALTHCHECK --interval=15s --timeout=4s --start-period=25s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1
# Single-restaurant installs: run with  -e SINGLE_RESTAURANT=1  (multi-restaurant is the default).
CMD ["node", "server.js"]
