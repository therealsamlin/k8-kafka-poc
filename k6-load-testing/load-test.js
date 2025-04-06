// k6-load-testing/load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Test configuration
export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 5 },    // Ramp up to 5 users
        { duration: '1m', target: 5 },     // Stay at 5 users for 1 minute
        { duration: '30s', target: 20 },   // Ramp up to 20 users
        { duration: '1m', target: 20 },    // Stay at 20 users for 1 minute
        { duration: '30s', target: 50 },   // Ramp up to 50 users
        { duration: '1m', target: 50 },    // Stay at 50 users for 1 minute
        { duration: '30s', target: 0 },    // Ramp down to 0 users
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should complete within 500ms
    http_req_failed: ['rate<0.01'],   // Less than 1% of requests should fail
  },
};

// Generate a random order
function generateOrder() {
  const customerId = `customer-${randomString(8)}`;
  const numItems = Math.floor(Math.random() * 5) + 1;
  
  const items = [];
  let totalAmount = 0;
  
  for (let i = 0; i < numItems; i++) {
    const price = Math.round((Math.random() * 100 + 10) * 100) / 100; // Random price between 10 and 110
    const quantity = Math.floor(Math.random() * 3) + 1; // Random quantity between 1 and 3
    
    const item = {
      productId: `product-${randomString(6)}`,
      name: `Product ${i+1}`,
      price,
      quantity,
      subtotal: price * quantity
    };
    
    items.push(item);
    totalAmount += item.subtotal;
  }
  
  // Round to 2 decimal places
  totalAmount = Math.round(totalAmount * 100) / 100;
  
  return {
    customerId,
    items,
    totalAmount
  };
}

// Main test function
export default function() {
  // Create an order
  const orderPayload = JSON.stringify(generateOrder());
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  // Get the ORDER_SERVICE_URL from environment or use default
  const ORDER_SERVICE_URL = __ENV.ORDER_SERVICE_URL || 'http://order-service/api/orders';
  
  // Send the order creation request
  const response = http.post(ORDER_SERVICE_URL, orderPayload, params);
  
  // Verify the response
  check(response, {
    'Status is 202 Accepted': (r) => r.status === 202,
    'Response has orderId': (r) => r.json('orderId') !== undefined,
  });
  
  // Random sleep between requests (0.5 to 2 seconds)
  sleep(Math.random() * 1.5 + 0.5);
}

// k6-load-testing/Dockerfile
