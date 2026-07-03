FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
RUN npm ci --workspace @watchgether/server
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
COPY apps/server/src ./apps/server/src
RUN npm run build --workspace @watchgether/server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
RUN npm ci --omit=dev --workspace @watchgether/server
COPY --from=build /app/apps/server/dist ./apps/server/dist
EXPOSE 8787
CMD ["node", "apps/server/dist/index.js"]
