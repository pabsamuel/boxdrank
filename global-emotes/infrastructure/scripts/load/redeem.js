import http from 'k6/http';
import { check } from 'k6';

// Code redemption under brute-force pressure: expect 400/429, never 5xx.
export const options = {
  vus: 30,
  duration: '1m',
  thresholds: { http_req_failed: ['rate<0.01'] },
};

export default function () {
  const res = http.post(
    `${__ENV.BASE}/v1/codes/redeem`,
    JSON.stringify({ code: `FAKE-${Math.random().toString(36).slice(2, 6).toUpperCase()}-CODE` }),
    { headers: { 'content-type': 'application/json', cookie: __ENV.COOKIE } },
  );
  check(res, { 'no 5xx': (r) => r.status < 500, 'rejected or limited': (r) => [400, 429].includes(r.status) });
}
