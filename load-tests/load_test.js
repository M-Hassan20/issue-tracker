import http from 'k6/http';
import { check, sleep } from 'k6';

// k6 options defining stages, scenarios, and thresholds
export const options = {
  scenarios: {
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '1m', target: 10 }, // Hold at 10 VUs
        { duration: '1m', target: 25 },
        { duration: '1m', target: 25 }, // Hold at 25 VUs
        { duration: '1m', target: 50 },
        { duration: '1m', target: 50 }, // Hold at 50 VUs
        { duration: '1m', target: 100 },
        { duration: '1m', target: 100 }, // Hold at 100 VUs
        { duration: '1m', target: 150 },
        { duration: '1m', target: 150 }, // Hold at 150 VUs
        { duration: '2m', target: parseInt(__ENV.MAX_VUS || '150') }, // Configurable peak load
        { duration: '2m', target: parseInt(__ENV.MAX_VUS || '150') }, // Hold at peak load
        { duration: '1m', target: 0 },   // Cool down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'], // P95 response times must be < 800ms
    http_req_failed: ['rate<0.05'],   // Error rate must be < 5%
  },
};

// setup() runs once before the load test. It logs in users to fetch reusable JWT tokens.
export function setup() {
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
  const agentTokens = [];
  const customerTokens = [];

  console.log(`Setting up authentication tokens pool targeting: ${BASE_URL}...`);

  // Log in agents (agent1@example.com to agent10@example.com)
  for (let i = 1; i <= 10; i++) {
    const payload = JSON.stringify({
      email: `agent${i}@example.com`,
      password: 'password123'
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const res = http.post(`${BASE_URL}/auth/login`, payload, params);
    
    if (res.status === 200) {
      agentTokens.push(res.json().token);
    } else {
      console.warn(`Failed to log in agent${i}: Status ${res.status}`);
    }
  }

  // Log in customers (customer1@example.com to customer40@example.com)
  for (let i = 1; i <= 40; i++) {
    const payload = JSON.stringify({
      email: `customer${i}@example.com`,
      password: 'password123'
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const res = http.post(`${BASE_URL}/auth/login`, payload, params);

    if (res.status === 200) {
      customerTokens.push(res.json().token);
    } else {
      console.warn(`Failed to log in customer${i}: Status ${res.status}`);
    }
  }

  if (agentTokens.length === 0 || customerTokens.length === 0) {
    throw new Error('Authentication setup failed. Please make sure the API is running and seeded.');
  }

  console.log(`Authentication setup complete. Cached ${agentTokens.length} agent tokens and ${customerTokens.length} customer tokens.`);
  return { agentTokens, customerTokens };
}

// default function is executed by VUs in loops
export default function (data) {
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
  
  // Select user token based on VU index
  const customerToken = data.customerTokens[__VU % data.customerTokens.length];
  const agentToken = data.agentTokens[__VU % data.agentTokens.length];

  const customerParams = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${customerToken}`
    }
  };

  const agentParams = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agentToken}`
    }
  };

  const rand = Math.random();

  // Weighted Workload mix (~70% reads / ~30% writes)
  if (rand < 0.35) {
    // 1. Read tickets list & fetch single ticket details (Read - 35%)
    const params = Object.assign({}, customerParams, { tags: { name: 'ticket_list' } });
    const resList = http.get(`${BASE_URL}/tickets`, params);
    const successList = check(resList, {
      'list tickets status is 200': (r) => r.status === 200,
    });

    if (successList) {
      const tickets = resList.json();
      if (Array.isArray(tickets) && tickets.length > 0) {
        const randomTicket = tickets[Math.floor(Math.random() * tickets.length)];
        const readParams = Object.assign({}, customerParams, { tags: { name: 'ticket_read' } });
        
        const resDetail = http.get(`${BASE_URL}/tickets/${randomTicket._id}`, readParams);
        check(resDetail, {
          'read ticket status is 200': (r) => r.status === 200,
          'read ticket contains id': (r) => r.json()._id === randomTicket._id
        });
      }
    }
  } else if (rand < 0.60) {
    // 2. Fetch comments for a random ticket (Read - 25%)
    const listParams = Object.assign({}, customerParams, { tags: { name: 'comment_ticket_list' } });
    const resList = http.get(`${BASE_URL}/tickets`, listParams);
    
    if (resList.status === 200) {
      const tickets = resList.json();
      if (Array.isArray(tickets) && tickets.length > 0) {
        const randomTicket = tickets[Math.floor(Math.random() * tickets.length)];
        const commentsParams = Object.assign({}, customerParams, { tags: { name: 'comment_read' } });
        
        const resComments = http.get(`${BASE_URL}/tickets/${randomTicket._id}/comments`, commentsParams);
        check(resComments, {
          'get comments status is 200': (r) => r.status === 200,
          'comments list is array': (r) => Array.isArray(r.json())
        });
      }
    }
  } else if (rand < 0.70) {
    // 3. Search and Filter endpoints (Read - 10%)
    if (Math.random() > 0.5) {
      // Search
      const searchTerms = ['console', 'timeout', 'Stripe', 'gateway', 'auth', 'email', 'crash', 'Safari', 'SSO', 'upload', 'report'];
      const q = searchTerms[Math.floor(Math.random() * searchTerms.length)];
      const searchParams = Object.assign({}, customerParams, { tags: { name: 'ticket_search' } });
      
      const resSearch = http.get(`${BASE_URL}/tickets/search?q=${q}`, searchParams);
      check(resSearch, {
        'search status is 200': (r) => r.status === 200,
        'search returns results array': (r) => Array.isArray(r.json())
      });
    } else {
      // Filter
      const statuses = ['open', 'in_progress', 'resolved', 'closed'];
      const priorities = ['low', 'medium', 'high', 'urgent'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const priority = priorities[Math.floor(Math.random() * priorities.length)];
      const filterParams = Object.assign({}, customerParams, { tags: { name: 'ticket_filter' } });

      const resFilter = http.get(`${BASE_URL}/tickets?status=${status}&priority=${priority}`, filterParams);
      check(resFilter, {
        'filter status is 200': (r) => r.status === 200
      });
    }
  } else if (rand < 0.80) {
    // 4. Create a ticket (Write - 10%)
    const ticketPayload = JSON.stringify({
      title: `k6 Load Test Ticket VU ${__VU} iteration ${__ITER}`,
      description: 'Automatically generated load testing ticket description to evaluate write speeds and index-less scan effects.',
      priority: ['low', 'medium', 'high', 'urgent'][Math.floor(Math.random() * 4)],
      status: 'open'
    });
    const writeParams = Object.assign({}, customerParams, { tags: { name: 'ticket_create' } });
    
    const resCreate = http.post(`${BASE_URL}/tickets`, ticketPayload, writeParams);
    check(resCreate, {
      'create ticket status is 201': (r) => r.status === 201,
      'create ticket returns _id': (r) => r.json()._id !== undefined
    });
  } else if (rand < 0.88) {
    // 5. Update a ticket - non-atomic write candidate (Write - 8%)
    const listParams = Object.assign({}, customerParams, { tags: { name: 'update_ticket_list' } });
    const resList = http.get(`${BASE_URL}/tickets`, listParams);
    
    if (resList.status === 200) {
      const tickets = resList.json();
      if (Array.isArray(tickets) && tickets.length > 0) {
        const randomTicket = tickets[Math.floor(Math.random() * tickets.length)];
        const updatePayload = JSON.stringify({
          status: ['open', 'in_progress', 'resolved', 'closed'][Math.floor(Math.random() * 4)],
          priority: ['low', 'medium', 'high', 'urgent'][Math.floor(Math.random() * 4)],
          comment: `Updating priority and status from load testing VU ${__VU}`
        });
        const updateParams = Object.assign({}, agentParams, { tags: { name: 'ticket_update' } });

        const resUpdate = http.patch(`${BASE_URL}/tickets/${randomTicket._id}`, updatePayload, updateParams);
        check(resUpdate, {
          'update ticket status is 200': (r) => r.status === 200
        });
      }
    }
  } else if (rand < 0.95) {
    // 6. Add comment to a ticket (Write - 7%)
    const listParams = Object.assign({}, customerParams, { tags: { name: 'add_comment_ticket_list' } });
    const resList = http.get(`${BASE_URL}/tickets`, listParams);

    if (resList.status === 200) {
      const tickets = resList.json();
      if (Array.isArray(tickets) && tickets.length > 0) {
        const randomTicket = tickets[Math.floor(Math.random() * tickets.length)];
        const commentPayload = JSON.stringify({
          body: `Automated load test comment added by VU ${__VU} in iteration ${__ITER}.`
        });
        const commentParams = Object.assign({}, customerParams, { tags: { name: 'comment_add' } });

        const resComment = http.post(`${BASE_URL}/tickets/${randomTicket._id}/comments`, commentPayload, commentParams);
        check(resComment, {
          'add comment status is 201': (r) => r.status === 201
        });
      }
    }
  } else {
    // 7. Hit Reporting/Metrics bottleneck endpoints (Analytics Stress - 5%)
    // Resolved per agent
    const r1Params = Object.assign({}, agentParams, { tags: { name: 'report_resolved_per_agent' } });
    const resR1 = http.get(`${BASE_URL}/reports/resolved-per-agent`, r1Params);
    check(resR1, { 'report resolved-per-agent is 200': (r) => r.status === 200 });

    // Avg resolution time
    const r2Params = Object.assign({}, agentParams, { tags: { name: 'report_avg_resolution' } });
    const resR2 = http.get(`${BASE_URL}/reports/avg-resolution-time`, r2Params);
    check(resR2, { 'report avg-resolution-time is 200': (r) => r.status === 200 });

    // List tickets with comment counts (N+1 query loop)
    const r3Params = Object.assign({}, agentParams, { tags: { name: 'report_ticket_comment_counts' } });
    const resR3 = http.get(`${BASE_URL}/reports/ticket-list-with-comment-counts`, r3Params);
    check(resR3, { 'report ticket-list-with-comment-counts is 200': (r) => r.status === 200 });
  }

  // Pacing control: wait 1 second between iterations per VU to avoid spamming
  sleep(1);
}
