# Issue Tracker API

A production-ready, scalable RESTful API built with **Node.js**, **Express**, and **MongoDB (Mongoose)** designed for enterprise issue and customer support ticket lifecycle management, high-volume performance benchmarking, and load testing with **k6**.

---

## 📌 Project Overview

The **Issue Tracker API** powers multi-tenant support workflow systems. It manages users (Agents and Customers), ticket lifecycles, nested comment threads, and analytical reporting metrics with high-concurrency database optimizations and comprehensive k6 load/stress testing suites.

### Key Capabilities
- **Role-Based Access Control (RBAC):** Distinct permissions and workflows for `customer`, `agent`, and `admin` roles.
- **Authentication & Security:** Secure password hashing via `bcryptjs` and stateless session handling via `jsonwebtoken` (JWT).
- **Ticket Lifecycle Management:** Full CRUD support with status tracking (`open`, `in-progress`, `resolved`, `closed`), priority assignment (`low`, `medium`, `high`, `urgent`), full-text search, and pagination.
- **Comment Threads:** Collaborative discussions per ticket with authorization guards for authors and support agents.
- **Aggregated Reporting & Metrics:** Optimized MongoDB aggregation pipelines for agent resolution throughput, average resolution time, and ticket comment counters.
- **High-Concurrency Load & Stress Testing:** Automated [k6](https://k6.io/) test suites simulating real-world traffic patterns, peak concurrency ramps, and burst spike/soak scenarios.

---

## 📁 Project Structure

```text
Issue Tracker API/
├── load-tests/                         # k6 Load & Performance Testing Scripts
│   ├── break_it_control_test.js        # Baseline control benchmark test
│   ├── break_it_test.js                # Sudden spike and soak stress test
│   └── load_test.js                    # Multi-stage ramping VU load test
├── src/
│   ├── config/                         # Database and environment configurations
│   ├── controllers/                    # Request handlers & business logic
│   │   ├── authController.js           # User registration and login
│   │   ├── commentController.js        # Comment creation, retrieval, updates
│   │   ├── reportController.js         # Analytical aggregation reports
│   │   └── ticketController.js         # Ticket CRUD and text search
│   ├── middleware/                     # Express middlewares (JWT Auth, RBAC)
│   │   └── auth.js                     # Token verification and role protection
│   ├── models/                         # Mongoose schemas & data models
│   │   ├── Comment.js                  # Ticket comment model
│   │   ├── Ticket.js                   # Issue ticket model & indexes
│   │   └── User.js                     # User authentication & role schema
│   ├── routes/                         # Express API route declarations
│   │   ├── authRoutes.js               # /auth endpoints
│   │   ├── commentRoutes.js            # /comments endpoints
│   │   ├── reportRoutes.js             # /reports endpoints
│   │   └── ticketRoutes.js             # /tickets endpoints
│   ├── scripts/                        # Database utilities & seeders
│   │   └── seed.js                     # High-volume synthetic data generator
│   └── app.js                          # Express app configuration & middleware pipeline
├── .env.example                        # Environment variables template
├── package.json                        # Project metadata, dependencies, and scripts
└── server.js                           # Application entry point & DB connection
```

---

## ⚙️ Prerequisites

Ensure you have the following installed on your system:
- **Node.js** (v16.x or higher recommended)
- **npm** (v8.x or higher)
- **MongoDB** (Local instance or MongoDB Atlas cluster URI)
- **k6** (Optional, required for executing load tests: [Install k6](https://k6.io/docs/get-started/installation/))

---

## 🚀 Getting Started & Setup

### 1. Clone & Navigate to the Project

```bash
git clone https://github.com/M-Hassan20/issue-tracker.git
cd "Issue Tracker API"
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory by copying the sample configuration:

```bash
cp .env.example .env
```

Edit `.env` with your preferred settings:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/issue_tracker
JWT_SECRET=your_super_secret_jwt_key
```

### 4. Seed the Database (Optional but Recommended)

Populate the database with synthetic data (10 Agents, 40 Customers, 6,000 Tickets, and 25,000 Comments) for development and performance testing:

```bash
npm run seed
```

> **Default Seed Credentials:**
> - **Agents:** `agent1@example.com` to `agent10@example.com` (Password: `password123`)
> - **Customers:** `customer1@example.com` to `customer40@example.com` (Password: `password123`)

### 5. Start the Server

- **Production Mode:**
  ```bash
  npm start
  ```
- **Development Mode (with live reload via nodemon):**
  ```bash
  npm run dev
  ```

The server will start at `http://localhost:5000`.

---

## 📡 API Reference Summary

### Authentication (`/auth`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/auth/register` | Register a new user | Public |
| `POST` | `/auth/login` | Login user & receive JWT token | Public |

### Tickets (`/tickets`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/tickets` | List tickets (with pagination & filtering) | Authenticated |
| `POST` | `/tickets` | Create a new ticket | Authenticated |
| `GET` | `/tickets/search?q=query` | Full-text search across tickets | Authenticated |
| `GET` | `/tickets/:id` | Get ticket details | Authenticated |
| `PATCH` | `/tickets/:id` | Update ticket details/status | Authenticated |
| `DELETE` | `/tickets/:id` | Delete ticket | Authenticated (Admin/Creator) |
| `GET` | `/tickets/:id/comments` | Get all comments for a ticket | Authenticated |
| `POST` | `/tickets/:id/comments` | Post a comment to a ticket | Authenticated |

### Comments (`/comments`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `PATCH` | `/comments/:id` | Update existing comment | Authenticated (Author) |
| `DELETE` | `/comments/:id` | Delete comment | Authenticated (Author/Admin) |

### Reports & Analytics (`/reports`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/reports/resolved-per-agent` | Count of tickets resolved per agent | Authenticated |
| `GET` | `/reports/avg-resolution-time` | Average resolution duration metrics | Authenticated |
| `GET` | `/reports/ticket-list-with-comment-counts` | Aggregated tickets with comment counts | Authenticated |

### Health Check
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/health` | Server uptime & status check | Public |

---

## 🧪 Running Load & Performance Tests

The repository includes performance test suites written for **[k6](https://k6.io/)** to validate latency, throughput, and error rates under heavy concurrency.

### Prerequisites for Testing
Ensure the API server is running and the database is seeded:
```bash
# Terminal 1: Start API
npm run dev

# Terminal 2: Seed data (if not already done)
npm run seed
```

### 1. Standard Ramping Load Test
Simulates a gradual ramp-up from 1 to 150+ Virtual Users (VUs) to test system scalability and p95 latency thresholds (< 800ms):

```bash
k6 run load-tests/load_test.js
```

*Customizing Target Host or Peak VUs:*
```bash
k6 run -e BASE_URL=http://localhost:5000 -e MAX_VUS=200 load-tests/load_test.js
```

### 2. Sudden Spike & Soak Test
Tests resilience against sudden bursts (0 to 200 VUs in 10s) followed by a 3-minute sustained soak load:

```bash
k6 run load-tests/break_it_test.js
```

### 3. Control / Baseline Test
Runs a controlled scenario to compare system behavior and baseline response times:

```bash
k6 run load-tests/break_it_control_test.js
```

### 4. Extended Concurrency Suite (150 to 1,000 VUs with Live Telemetry)
Executes an automated multi-tier sweep across 150, 250, 500, 750, and 1,000 concurrent VUs while capturing live Node.js process CPU, RSS/Heap memory, MongoDB connection pool utilization, and P99 latency:

```bash
node load-tests/run_extended_benchmarks.js
```

Full benchmark analysis, telemetry charts, and degradation findings are detailed in [SCALABILITY_ANALYSIS_REPORT.md](./SCALABILITY_ANALYSIS_REPORT.md).

