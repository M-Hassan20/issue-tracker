const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Comment = require('../models/Comment');

// @desc    Create a ticket
// @route   POST /tickets
// @access  Private
const createTicket = async (req, res) => {
  try {
    const { title, description, priority, status, assignedTo } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const ticketData = {
      title,
      description,
      priority: priority || 'medium',
      status: status || 'open',
      createdBy: req.user.id,
      assignedTo: assignedTo || null
    };

    if (ticketData.status === 'resolved') {
      ticketData.resolvedAt = new Date();
    }

    const ticket = await Ticket.create(ticketData);
    res.status(201).json(ticket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a single ticket
// @route   GET /tickets/:id
// @access  Private
const getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .lean();

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a ticket
// @route   PATCH /tickets/:id
// @access  Private
const updateTicket = async (req, res) => {
  try {
    const updateData = { ...req.body };
    const commentBody = updateData.comment;
    delete updateData.comment; // Prevent saving comment string directly on ticket document

    const ticketIdObj = new mongoose.Types.ObjectId(req.params.id);
    const updateFields = {
      $set: {
        ...updateData,
        updatedAt: new Date()
      }
    };

    // Set or clear resolvedAt if status is updated
    if (updateData.status !== undefined) {
      if (updateData.status === 'resolved') {
        updateFields.$set.resolvedAt = new Date();
      } else {
        updateFields.$set.resolvedAt = null;
      }
    }

    let updatedTicket;

    if (commentBody) {
      const authorIdObj = new mongoose.Types.ObjectId(req.user.id);
      // Execute ticket update and raw comment insert in parallel for maximum concurrency performance
      const [ticketResult] = await Promise.all([
        Ticket.collection.findOneAndUpdate(
          { _id: ticketIdObj },
          updateFields,
          { returnDocument: 'after' }
        ),
        Comment.collection.insertOne({
          ticketId: ticketIdObj,
          authorId: authorIdObj,
          body: commentBody,
          createdAt: new Date()
        })
      ]);
      updatedTicket = ticketResult;
    } else {
      updatedTicket = await Ticket.collection.findOneAndUpdate(
        { _id: ticketIdObj },
        updateFields,
        { returnDocument: 'after' }
      );
    }

    if (!updatedTicket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json(updatedTicket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a ticket
// @route   DELETE /tickets/:id
// @access  Private
const deleteTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Delete all comments associated with this ticket
    await Comment.deleteMany({ ticketId: req.params.id });

    res.json({ message: 'Ticket and associated comments deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    List and filter tickets
// @route   GET /tickets
// @access  Private
const getTickets = async (req, res) => {
  try {
    const { status, priority, assignedTo, from, to } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }
    if (priority) {
      filter.priority = priority;
    }
    if (assignedTo !== undefined) {
      filter.assignedTo = assignedTo === 'null' || assignedTo === '' ? null : assignedTo;
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        filter.createdAt.$gte = new Date(from);
      }
      if (to) {
        filter.createdAt.$lte = new Date(to);
      }
    }

    // Apply pagination defaults (100 per page) to eliminate transferring full collections
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const tickets = await Ticket.find(filter)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Full-text search over tickets title and description
// @route   GET /tickets/search
// @access  Private
const searchTickets = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ message: 'Search query q is required' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const tickets = await Ticket.find({ $text: { $search: q } })
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .skip(skip)
      .limit(limit)
      .lean();

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createTicket,
  getTicketById,
  updateTicket,
  deleteTicket,
  getTickets,
  searchTickets
};
