import http from 'k6/http';
import { check, sleep } from 'k6';

// k6 options defining stages, scenarios, and thresholds for the stress test
export const options = {
  scenarios: {
    sudden_spike_and_soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 200 }, // Sudden traffic spike: 0 to 200 VUs in 10s
        { duration: '1m', target: 200 },  // Sustain peak stress load for 1 minute
        { duration: '10s', target: 50 },  // Ramp down to moderate soak load
        { duration: '3m', target: 50 },   // Soak load: sustain 50 VUs for 3 minutes
        { duration: '10s', target: 0 },   // Cool down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'], // Slightly higher threshold (1.5s) allowed under burst concurrency
    http_req_failed: ['rate<0.10'],   // Allow up to 10% error rate under extreme stress test
  },
};

// setup() runs once before the load test. It logs in users and creates a shared ticket for concurrent writes.
export function setup() {
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
  const agentTokens = [];
  const customerTokens = [];

  console.log(`Setting up authentication tokens pool targeting: ${BASE_URL}...`);

  // Log in agents
  for (let i = 1; i <= 10; i++) {
    const payload = JSON.stringify({
      email: `agent${i}@example.com`,
      password: 'password123'
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const res = http.post(`${BASE_URL}/auth/login`, payload, params);

    if (res.status === 200) {
      agentTokens.push(res.json().token);
    }
  }

  // Log in customers
  for (let i = 1; i <= 40; i++) {
    const payload = JSON.stringify({
      email: `customer${i}@example.com`,
      password: 'password123'
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const res = http.post(`${BASE_URL}/auth/login`, payload, params);

    if (res.status === 200) {
      customerTokens.push(res.json().token);
    }
  }

  if (agentTokens.length === 0 || customerTokens.length === 0) {
    throw new Error('Authentication setup failed. Please make sure the API is running and seeded.');
  }

  console.log(`Authentication setup complete. Cached ${agentTokens.length} agent tokens and ${customerTokens.length} customer tokens.`);
  console.log('Creating a shared ticket for concurrent write stress testing...');

  const ticketPayload = JSON.stringify({
    title: 'Shared Concurrency Test Ticket',
    description: 'This ticket is updated simultaneously by multiple VUs to test race conditions and database write locking under high concurrency.',
    priority: 'urgent',
    status: 'open'
  });

  const ticketParams = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${customerTokens[0]}`
    }
  };

  const resTicket = http.post(`${BASE_URL}/tickets`, ticketPayload, ticketParams);

  if (resTicket.status === 201) {
    const sharedTicketId = resTicket.json()._id;
    console.log(`Successfully created shared ticket for concurrency testing: ${sharedTicketId}`);
    return { agentTokens, customerTokens, sharedTicketId };
  } else {
    throw new Error(`Failed to create shared test ticket: Status ${resTicket.status}`);
  }
}

// default function executed in loops by all VUs
export default function (data) {
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
  const ticketId = data.sharedTicketId;

  if (!ticketId) return;

  // Distribute customer tokens across VUs
  const customerToken = data.customerTokens[__VU % data.customerTokens.length];

  // Rotate ticket status among open, in_progress, resolved, closed
  const statuses = ['open', 'in_progress', 'resolved', 'closed'];
  const newStatus = statuses[__VU % statuses.length];

  const updatePayload = JSON.stringify({
    status: newStatus,
    comment: `Simultaneous write update from VU ${__VU} in iteration ${__ITER} at timestamp ${new Date().toISOString()}`
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${customerToken}`
    },
    tags: { name: 'concurrent_write' }
  };

  // Perform PATCH update (triggers ticket status update and comment creation in two non-atomic separate steps)
  const res = http.patch(`${BASE_URL}/tickets/${ticketId}`, updatePayload, params);

  check(res, {
    'update concurrent ticket status is 200': (r) => r.status === 200,
  });

  // Short random pacing delay (up to 500ms) to ensure continuous overlapping writes
  sleep(Math.random() * 0.5);
}
