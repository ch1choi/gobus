/**
 * cctv_viewer Express Server
 * Netlify Functions를 로컬 Express 서버로 대체
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8888;

// 경로 설정
const PUBLIC_DIR = path.join(__dirname);
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');

// 시작 시 파일 확인
console.log('=== Server Configuration ===');
console.log('Working directory:', __dirname);
console.log('Public directory:', PUBLIC_DIR);
console.log('Index.html path:', INDEX_HTML);
console.log('Index.html exists:', fs.existsSync(INDEX_HTML));
console.log('============================');

// CORS 활성화
app.use(cors());
app.use(express.json());

// 요청 로깅 미들웨어
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Netlify Functions 임포트
const cctvRoute = require('./netlify/functions/cctv-route');
const cctvRefresh = require('./netlify/functions/cctv-refresh');
const cctvDiagnostics = require('./netlify/functions/cctv-diagnostics');

// API 라우트 설정
app.get('/api/cctv-route', async (req, res) => {
  const started = Date.now();
  try {
    const result = await cctvRoute.handler({
      queryStringParameters: req.query,
      headers: req.headers
    });
    const body = JSON.parse(result.body);
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      tag: 'http',
      message: 'GET /api/cctv-route',
      meta: {
        route: req.query.route,
        status: result.statusCode,
        cctvCount: body.cctvCount,
        ms: Date.now() - started,
        debug: req.query.debug === '1',
      },
    }));
    res.status(result.statusCode).json(body);
  } catch (error) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      tag: 'http',
      message: 'GET /api/cctv-route failed',
      meta: { route: req.query.route, error: error.message, ms: Date.now() - started },
    }));
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

app.get('/api/cctv-diagnostics', async (req, res) => {
  try {
    const result = await cctvDiagnostics.handler({
      queryStringParameters: req.query,
      headers: req.headers,
    });
    res.status(result.statusCode).type('json').send(result.body);
  } catch (error) {
    console.error('API Error (cctv-diagnostics):', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

app.get('/api/cctv-refresh', async (req, res) => {
  try {
    const result = await cctvRefresh.handler({
      queryStringParameters: req.query,
      headers: req.headers
    });
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error('API Error (cctv-refresh):', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// 정적 파일 서빙 (API 라우트 이후)
app.use(express.static(PUBLIC_DIR, {
  index: false,  // 자동 index.html 서빙 비활성화 (명시적 라우트 사용)
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

// 루트 경로 - index.html 서빙
app.get('/', (req, res) => {
  try {
    if (!fs.existsSync(INDEX_HTML)) {
      console.error('ERROR: index.html not found at', INDEX_HTML);
      return res.status(500).send(`
        <h1>500 - Server Error</h1>
        <p>index.html not found</p>
        <p>Path: ${INDEX_HTML}</p>
      `);
    }
    res.sendFile(INDEX_HTML);
  } catch (error) {
    console.error('Error serving index.html:', error);
    res.status(500).send(`
      <h1>500 - Server Error</h1>
      <p>Error: ${error.message}</p>
    `);
  }
});

// 404 처리
app.use((req, res) => {
  console.log('404 Not Found:', req.url);
  res.status(404).json({ 
    error: 'Not Found',
    path: req.url,
    message: 'The requested resource was not found'
  });
});

// 전역 에러 핸들러
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CCTV Viewer Server running on http://0.0.0.0:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`API Endpoints:`);
  console.log(`  - GET /api/cctv-route?route={route}&debug=1`);
  console.log(`  - GET /api/cctv-diagnostics?route={route}`);
  console.log(`  - GET /api/cctv-refresh`);
  console.log(`  - LOG_LEVEL=${process.env.LOG_LEVEL || 'info'}`);
});
