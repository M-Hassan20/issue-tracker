const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createTicket,
  getTicketById,
  updateTicket,
  deleteTicket,
  getTickets,
  searchTickets
} = require('../controllers/ticketController');
const {
  addComment,
  getCommentsByTicket
} = require('../controllers/commentController');

// All ticket routes require authentication
router.use(protect);

router.get('/search', searchTickets);

router.route('/')
  .get(getTickets)
  .post(createTicket);

router.route('/:id/comments')
  .get(getCommentsByTicket)
  .post(addComment);

router.route('/:id')
  .get(getTicketById)
  .patch(updateTicket)
  .delete(deleteTicket);

module.exports = router;
