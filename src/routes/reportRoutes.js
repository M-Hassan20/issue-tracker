const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getResolvedPerAgent,
  getAvgResolutionTime,
  getTicketListWithCommentCounts
} = require('../controllers/reportController');

// All report routes require authentication
router.use(protect);

router.get('/resolved-per-agent', getResolvedPerAgent);
router.get('/avg-resolution-time', getAvgResolutionTime);
router.get('/ticket-list-with-comment-counts', getTicketListWithCommentCounts);

module.exports = router;
