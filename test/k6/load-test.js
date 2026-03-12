// test file for k6 load testing

import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 10,          // 10 virtual users
  duration: '30s',  // run for 30 seconds
};

export default function () {
  // Test homepage
  let res = http.get('http://localhost:4567/');
  check(res, {
    'homepage status is 200': (r) => r.status === 200,
    'homepage loads in < 500ms': (r) => r.timings.duration < 500,
  });

  // Test a topic listing page
  let topics = http.get('http://localhost:4567/recent');
  check(topics, {
    'recent topics status is 200': (r) => r.status === 200,
  });

  sleep(1);
}