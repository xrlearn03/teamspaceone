import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'health status is 200': (r) => r.status === 200,
  });

  const suffix = randomString(8);
  const register = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({
      email: `loadtest+${suffix}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Load',
      lastName: 'Test',
    }),
    { headers: { 'content-type': 'application/json' } },
  );
  check(register, {
    'register returns 201 or 200': (r) => r.status === 201 || r.status === 200,
  });

  const body = register.json() || {};
  const token = body.tokens?.accessToken;

  if (token) {
    const listOrgs = http.get(`${BASE_URL}/organisations`, {
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });
    check(listOrgs, {
      'list organisations status is 200': (r) => r.status === 200,
    });
  }

  sleep(1);
}
