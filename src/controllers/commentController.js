const Comment = require('../models/Comment');
const Ticket = require('../models/Ticket');

// @desc    Add a comment to a ticket
// @route   POST /tickets/:id/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) {
      return res.status(400).json({ message: 'Comment body is required' });
    }

    const comment = await Comment.create({
      ticketId: req.params.id,
      authorId: req.user.id,
      body
    });

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get comments for a ticket
// @route   GET /tickets/:id/comments
// @access  Private
const getCommentsByTicket = async (req, res) => {
  try {
    const comments = await Comment.find({ ticketId: req.params.id })
      .populate('authorId', 'name email role')
      .sort({ createdAt: 1 })
      .lean();

    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a comment
// @route   PATCH /comments/:id
// @access  Private
const updateComment = async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) {
      return res.status(400).json({ message: 'Comment body is required' });
    }

    const query = req.user.role === 'agent'
      ? { _id: req.params.id }
      : { _id: req.params.id, authorId: req.user.id };

    const comment = await Comment.findOneAndUpdate(
      query,
      { $set: { body } },
      { new: true, lean: true }
    );

    if (!comment) {
      const exists = await Comment.exists({ _id: req.params.id });
      if (!exists) {
        return res.status(404).json({ message: 'Comment not found' });
      }
      return res.status(403).json({ message: 'Not authorized to update this comment' });
    }

    res.json(comment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a comment
// @route   DELETE /comments/:id
// @access  Private
const deleteComment = async (req, res) => {
  try {
    const query = req.user.role === 'agent'
      ? { _id: req.params.id }
      : { _id: req.params.id, authorId: req.user.id };

    const comment = await Comment.findOneAndDelete(query);

    if (!comment) {
      const exists = await Comment.exists({ _id: req.params.id });
      if (!exists) {
        return res.status(404).json({ message: 'Comment not found' });
      }
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    res.json({ message: 'Comment removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addComment,
  getCommentsByTicket,
  updateComment,
  deleteComment
};
