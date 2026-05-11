FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

ARG NEXT_PUBLIC_GATEWAY_URL
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
ARG NEXT_PUBLIC_IMAGE_REMOTE_HOSTS
ENV NEXT_PUBLIC_IMAGE_REMOTE_HOSTS=$NEXT_PUBLIC_IMAGE_REMOTE_HOSTS

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["npm", "start"]
