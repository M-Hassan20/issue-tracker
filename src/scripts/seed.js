const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const Comment = require('../models/Comment');
const bcrypt = require('bcryptjs');

const NUM_AGENTS = 10;
const NUM_CUSTOMERS = 40;
const NUM_TICKETS = 6000;
const NUM_COMMENTS = 25000;

// Helper to generate a random date between start and end
const randomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const commentTemplates = [
  "Let me look into this.",
  "Any updates on this ticket?",
  "I am still facing this issue.",
  "Please verify if it works now.",
  "Issue resolved, thanks!",
  "Can you provide the logs?",
  "We are working on a fix.",
  "This has been escalated to tier-2.",
  "Please restart the server.",
  "I have updated the settings.",
  "Is there an ETA for the fix?",
  "Can you reproduce this consistently?",
  "This seems to be a network error.",
  "We will need a bit more time to debug.",
  "Thanks for the update.",
  "Verified the fix, looks good.",
  "Could you try clearing your cache?",
  "We are experiencing some database issues currently.",
  "The system looks stable now.",
  "Please let us know if this happens again."
];

const ticketTitles = [
  "Cannot log in to console",
  "API returning 500 Internal Server Error",
  "Database connection timeout on query",
  "Slow page load on dashboard dashboard",
  "Payment gateway failing on checkout",
  "Email confirmation not sent",
  "Incorrect billing amount on invoice",
  "Mobile app crashes on startup",
  "Session token expires too quickly",
  "Search feature not returning results",
  "UI layout broken on Safari",
  "Cannot update user profile",
  "API docs link is broken",
  "Webhook notifications not received",
  "Export to CSV failing for large tables",
  "SSO integration failing",
  "Password reset link expired immediately",
  "File upload fails with payload too large",
  "Two-factor authentication code rejected",
  "Reports taking too long to generate"
];

const ticketDescriptions = [
  "When I try to login, it spins forever and then shows server error.",
  "The GET /users endpoint returns 500 status code starting from today morning.",
  "We are seeing mongoose connection pool exhausted errors in logs.",
  "The dashboard page takes more than 10 seconds to load UI widgets.",
  "Customers complain that stripe payment errors out with bad token.",
  "New users registering on the site do not receive confirmation emails.",
  "My invoice shows double the price of my monthly subscription.",
  "Opening the app on iOS 16.5 crashes immediately after splash screen.",
  "The session expires in 5 minutes instead of the configured 24 hours.",
  "Typing exact matching queries in search returns empty array list.",
  "The header and sidebar overlap when viewed on Safari mobile browser.",
  "Trying to change email in settings returns permission denied.",
  "The developer portal links to an old v1 API documentation page.",
  "Payments are processed but webhooks are not arriving at endpoints.",
  "Downloading reports with >1000 rows results in network timeout error.",
  "Okta login returns saml validation signature mismatch error.",
  "The link sent to email says token expired even if clicked in 10s.",
  "Uploading 5MB attachment results in payload too large express error.",
  "Entering Google Authenticator code fails with code invalid message.",
  "Generating the monthly usage report takes 40 seconds and blocks API."
];

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) {
      console.error('Error: MONGODB_URI is not set in environment.');
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully.');

    // Clear existing data
    console.log('Clearing existing collections...');
    await User.deleteMany({});
    await Ticket.deleteMany({});
    await Comment.deleteMany({});
    console.log('Collections cleared.');

    // Generate single password hash to reuse for speed
    console.log('Generating reusable password hash for speed...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);
    console.log('Password hash generated.');

    // 1. Create Users
    console.log('Generating users...');
    const users = [];

    // Create Agents
    for (let i = 1; i <= NUM_AGENTS; i++) {
      users.push({
        name: `Agent ${i}`,
        email: `agent${i}@example.com`,
        passwordHash,
        role: 'agent',
        createdAt: randomDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      });
    }

    // Create Customers
    for (let i = 1; i <= NUM_CUSTOMERS; i++) {
      users.push({
        name: `Customer ${i}`,
        email: `customer${i}@example.com`,
        passwordHash,
        role: 'customer',
        createdAt: randomDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      });
    }

    const createdUsers = await User.insertMany(users);
    console.log(`Successfully created ${createdUsers.length} users.`);

    const agents = createdUsers.filter(u => u.role === 'agent');
    const customers = createdUsers.filter(u => u.role === 'customer');

    // 2. Create Tickets
    console.log('Generating tickets...');
    const tickets = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < NUM_TICKETS; i++) {
      const createdBy = customers[Math.floor(Math.random() * customers.length)];
      const createdAt = randomDate(thirtyDaysAgo, now);

      // Status distributions: 10% open, 20% in_progress, 60% resolved, 10% closed
      const statusRand = Math.random();
      let status = 'open';
      if (statusRand >= 0.1 && statusRand < 0.3) {
        status = 'in_progress';
      } else if (statusRand >= 0.3 && statusRand < 0.9) {
        status = 'resolved';
      } else if (statusRand >= 0.9) {
        status = 'closed';
      }

      // Priority distributions: 40% low, 30% medium, 20% high, 10% urgent
      const priorityRand = Math.random();
      let priority = 'low';
      if (priorityRand >= 0.4 && priorityRand < 0.7) {
        priority = 'medium';
      } else if (priorityRand >= 0.7 && priorityRand < 0.9) {
        priority = 'high';
      } else if (priorityRand >= 0.9) {
        priority = 'urgent';
      }

      // Assignee rules
      let assignedTo = null;
      if (status === 'open') {
        assignedTo = Math.random() > 0.5 ? agents[Math.floor(Math.random() * agents.length)]._id : null;
      } else {
        assignedTo = agents[Math.floor(Math.random() * agents.length)]._id;
      }

      // Resolution time rules (between 1 hour and 5 days after creation, capped at current time)
      let resolvedAt = null;
      if (status === 'resolved' || status === 'closed') {
        const hoursToAdd = 1 + Math.random() * 120; // 1 to 120 hours
        const computedResolvedAt = new Date(createdAt.getTime() + hoursToAdd * 60 * 60 * 1000);
        resolvedAt = computedResolvedAt > now ? now : computedResolvedAt;
      }

      // Random ticket content
      const titleIndex = Math.floor(Math.random() * ticketTitles.length);
      const title = `${ticketTitles[titleIndex]} #${i + 1}`;
      const description = ticketDescriptions[titleIndex];

      // Random updatedAt between createdAt and resolvedAt (or now if not resolved)
      const maxUpdateDate = resolvedAt || now;
      const updatedAt = randomDate(createdAt, maxUpdateDate);

      tickets.push({
        title,
        description,
        status,
        priority,
        createdBy: createdBy._id,
        assignedTo,
        createdAt,
        updatedAt,
        resolvedAt
      });
    }

    // Insert tickets in batches
    console.log('Inserting tickets to DB in batches...');
    const ticketBatchSize = 2000;
    const createdTickets = [];
    for (let i = 0; i < tickets.length; i += ticketBatchSize) {
      const batch = tickets.slice(i, i + ticketBatchSize);
      const inserted = await Ticket.insertMany(batch);
      createdTickets.push(...inserted);
    }
    console.log(`Successfully created ${createdTickets.length} tickets.`);

    // 3. Create Comments
    console.log('Generating comments...');
    const comments = [];

    for (let i = 0; i < NUM_COMMENTS; i++) {
      const ticket = createdTickets[Math.floor(Math.random() * createdTickets.length)];
      
      // Author could be anyone (the creator, assignee, or random user)
      const randAuthor = Math.random();
      let authorId = createdUsers[Math.floor(Math.random() * createdUsers.length)]._id;
      if (randAuthor < 0.4) {
        authorId = ticket.createdBy;
      } else if (randAuthor < 0.8 && ticket.assignedTo) {
        authorId = ticket.assignedTo;
      }

      // Body text template
      const body = commentTemplates[Math.floor(Math.random() * commentTemplates.length)];

      // Comment date between ticket creation and ticket resolution (or now)
      const maxDate = ticket.resolvedAt || now;
      const createdAt = randomDate(ticket.createdAt, maxDate);

      comments.push({
        ticketId: ticket._id,
        authorId,
        body,
        createdAt
      });
    }

    // Insert comments in batches
    console.log('Inserting comments to DB in batches...');
    const commentBatchSize = 5000;
    let commentCount = 0;
    for (let i = 0; i < comments.length; i += commentBatchSize) {
      const batch = comments.slice(i, i + commentBatchSize);
      await Comment.insertMany(batch);
      commentCount += batch.length;
    }
    console.log(`Successfully created ${commentCount} comments.`);

    console.log('Data Seeding Complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error during data seeding:', error);
    process.exit(1);
  }
}

seed();
