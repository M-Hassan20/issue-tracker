const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  updateComment,
  deleteComment
} = require('../controllers/commentController');

// All comment routes require authentication
router.use(protect);

router.route('/:id')
  .patch(updateComment)
  .delete(deleteComment);

module.exports = router;
