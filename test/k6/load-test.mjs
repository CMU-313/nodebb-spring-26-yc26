import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 50,          // 50 virtual users
  duration: '60s',  // run for 60 seconds
};

export default function () {
  // Test homepage
  let res = http.get('http://localhost:4567/');
  check(res, {
    'homepage status is 200': (r) => r.status === 200,
    'homepage loads in < 500ms': (r) => r.timings.duration < 500,
  });

  // Test recent topics
  let recent = http.get('http://localhost:4567/recent');
  check(recent, {
    'recent topics status is 200': (r) => r.status === 200,
    'recent topics loads in < 500ms': (r) => r.timings.duration < 500,
  });

  // Test popular topics
  let popular = http.get('http://localhost:4567/popular');
  check(popular, {
    'popular topics status is 200': (r) => r.status === 200,
  });

  // Test categories page
  let categories = http.get('http://localhost:4567/categories');
  check(categories, {
    'categories status is 200': (r) => r.status === 200,
    'categories loads in < 500ms': (r) => r.timings.duration < 500,
  });

  // Test API endpoint
  let api = http.get('http://localhost:4567/api/recent');
  check(api, {
    'api/recent status is 200': (r) => r.status === 200,
    'api responds in < 300ms': (r) => r.timings.duration < 300,
  });

  sleep(1);
}