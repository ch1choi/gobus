# cctv_viewer Dockerfile
# Node.js 기반으로 정적 파일 + Netlify Functions를 Express로 서빙

FROM node:18-alpine AS base

# 작업 디렉토리 설정
WORKDIR /app

# 패키지 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 애플리케이션 소스 복사
COPY . .

# Express 서버 설치 (Netlify Functions를 대체)
RUN npm install express cors dotenv

# 포트 노출
EXPOSE 8888

# 환경 변수 기본값 설정
ENV NODE_ENV=production \
    PORT=8888

# 서버 시작
CMD ["node", "server.js"]
