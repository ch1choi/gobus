# dongin-bus-admin — Node 20 (Alpine). 실행 서버 예: Ubuntu x86_64 (linux/amd64).
# 런타임에 호스트 dongin_bus 디렉터리를 마운트: -v /project2/gimmeQUIZ2.0/public/dongin_bus:/srv/dongin_bus
# 환경변수 DONGIN_BUS_DIR 기본값은 /srv/dongin_bus (아래 ENV).

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY server.js ./
COPY public ./public

RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=3000
ENV DONGIN_BUS_DIR=/srv/dongin_bus

EXPOSE 3000

# server.js 의 GET /health 와 대응(cookie-session 미통과).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',(r)=>{r.resume();r.on('end',()=>process.exit(r.statusCode===200?0:1));}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
