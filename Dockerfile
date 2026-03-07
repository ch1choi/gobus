# Proxmox 서버가 x86_64이므로 플랫폼 고정 (선택 사항; sql.js는 네이티브 모듈 없음)
FROM --platform=linux/amd64 node:20-alpine

WORKDIR /app

COPY server/package*.json server/
RUN cd server && npm ci --omit=dev

COPY server/ server/
COPY gobus.html sw.js manifest.json ./
COPY img/ img/

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
VOLUME /app/data

CMD ["node", "server/index.js"]
