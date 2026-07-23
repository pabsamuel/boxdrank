import http from 'k6/http';
import { check } from 'k6';

// Public pack page API — the unauthenticated funnel top (viral spike shape).
export const options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '1m', target: 300 }, // creator-goes-live spike
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${__ENV.BASE}/v1/public/creators/demo-creator/packs/free-pack`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
