import http from 'k6/http';
import { check } from 'k6';

// Keyboard sync manifest — the hottest authenticated read path.
export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${__ENV.BASE}/v1/sync/manifest`, {
    headers: { cookie: __ENV.COOKIE },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
}
