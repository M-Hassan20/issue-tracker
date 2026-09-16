const Ticket = require('../models/Ticket');
const Comment = require('../models/Comment');

// @desc    Get tickets resolved per agent per day
// @route   GET /reports/resolved-per-agent
// @access  Private (Agent role recommended, but accessible for load-testing)
const getResolvedPerAgent = async (req, res) => {
  try {
    const results = await Ticket.aggregate([
      // 1. Match resolved tickets with assignees
      {
        $match: {
          status: 'resolved',
          resolvedAt: { $ne: null },
          assignedTo: { $ne: null }
        }
      },
      // 2. Group by agent and resolution date first (reduces document volume before $lookup)
      {
        $group: {
          _id: {
            agentId: '$assignedTo',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$resolvedAt' } }
          },
          count: { $sum: 1 }
        }
      },
      // 3. Sort by date descending so the nested resolution arrays are ordered
      {
        $sort: { '_id.date': -1 }
      },
      // 4. Regroup by agentId to collect resolution date counts into array
      {
        $group: {
          _id: '$_id.agentId',
          resolutions: {
            $push: {
              date: '$_id.date',
              count: '$count'
            }
          }
        }
      },
      // 5. Lookup agent user details only once per agent
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'agent'
        }
      },
      {
        $unwind: '$agent'
      },
      // 6. Project final shape
      {
        $project: {
          _id: 0,
          agentId: '$_id',
          agentName: '$agent.name',
          resolutions: 1
        }
      }
    ]);

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get average resolution time, overall and by priority
// @route   GET /reports/avg-resolution-time
// @access  Private
const getAvgResolutionTime = async (req, res) => {
  try {
    const results = await Ticket.aggregate([
      {
        $match: {
          status: 'resolved',
          resolvedAt: { $ne: null },
          createdAt: { $ne: null }
        }
      },
      {
        $project: {
          priority: 1,
          resolutionTimeMs: { $subtract: ['$resolvedAt', '$createdAt'] }
        }
      },
      {
        $facet: {
          overall: [
            {
              $group: {
                _id: null,
                avgMs: { $avg: '$resolutionTimeMs' },
                count: { $sum: 1 }
              }
            }
          ],
          byPriority: [
            {
              $group: {
                _id: '$priority',
                avgMs: { $avg: '$resolutionTimeMs' }
              }
            }
          ]
        }
      }
    ]);

    const overallData = results[0].overall[0] || { avgMs: 0, count: 0 };
    const byPriorityData = results[0].byPriority || [];

    const overallAverageHours = (overallData.avgMs || 0) / (1000 * 60 * 60);
    const totalResolvedCount = overallData.count || 0;

    const byPriority = {
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0
    };

    for (const item of byPriorityData) {
      if (byPriority[item._id] !== undefined) {
        byPriority[item._id] = (item.avgMs || 0) / (1000 * 60 * 60);
      }
    }

    res.json({
      overallAverageHours,
      byPriorityHours: byPriority,
      totalResolvedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    List tickets with comment count per ticket
// @route   GET /reports/ticket-list-with-comment-counts
// @access  Private
const getTicketListWithCommentCounts = async (req, res) => {
  try {
    // Add pagination: support query parameters page & limit
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100; // Default to 100 to avoid returning full collection at once
    const skip = (page - 1) * limit;

    const results = await Ticket.aggregate([
      // 1. Sort by creation date descending to keep newest tickets first
      { $sort: { createdAt: -1 } },

      // 2. Pagination: skip and limit
      { $skip: skip },
      { $limit: limit },

      // 3. Lookup comment count efficiently using subpipeline count
      {
        $lookup: {
          from: 'comments',
          let: { ticketId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$ticketId', '$$ticketId'] } } },
            { $count: 'count' }
          ],
          as: 'commentData'
        }
      },
      // 4. Calculate comment count
      {
        $addFields: {
          commentCount: {
            $ifNull: [{ $arrayElemAt: ['$commentData.count', 0] }, 0]
          }
        }
      },
      // 5. Lookup createdBy user
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'createdBy'
        }
      },
      {
        $unwind: {
          path: '$createdBy',
          preserveNullAndEmptyArrays: true
        }
      },
      // 6. Lookup assignedTo user
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignedTo'
        }
      },
      {
        $unwind: {
          path: '$assignedTo',
          preserveNullAndEmptyArrays: true
        }
      },
      // 7. Project final response shape matching original populated documents
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          status: 1,
          priority: 1,
          resolvedAt: 1,
          createdAt: 1,
          updatedAt: 1,
          commentCount: 1,
          createdBy: {
            $cond: {
              if: '$createdBy._id',
              then: {
                _id: '$createdBy._id',
                name: '$createdBy.name',
                email: '$createdBy.email',
                role: '$createdBy.role'
              },
              else: null
            }
          },
          assignedTo: {
            $cond: {
              if: '$assignedTo._id',
              then: {
                _id: '$assignedTo._id',
                name: '$assignedTo.name',
                email: '$assignedTo.email',
                role: '$assignedTo.role'
              },
              else: null
            }
          }
        }
      }
    ]);

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getResolvedPerAgent,
  getAvgResolutionTime,
  getTicketListWithCommentCounts
};
