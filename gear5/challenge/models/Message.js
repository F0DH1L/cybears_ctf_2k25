import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Sender is required'],
    index: true
  },
  receiver: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Receiver is required'],
    index: true
  },
  content: { 
    type: String, 
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, {
  collection: 'messages'
});

// Compound indexes for efficient queries
messageSchema.index({ sender: 1, receiver: 1, createdAt: 1 });
messageSchema.index({ receiver: 1, createdAt: -1 });

// Static method to find messages between two users
messageSchema.statics.findBetweenUsers = function(user1Id, user2Id) {
  return this.find({
    $or: [
      { sender: user1Id, receiver: user2Id },
      { sender: user2Id, receiver: user1Id }
    ]
  }).sort({ createdAt: 1 });
};

// Static method to mark messages as read
messageSchema.statics.markAsRead = function(senderId, receiverId) {
  return this.updateMany(
    { sender: senderId, receiver: receiverId, isRead: false },
    { isRead: true }
  );
};

// Instance method to format message for API response
messageSchema.methods.toAPIResponse = function() {
  return {
    id: this._id.toString(),
    sender: this.sender.toString(),
    receiver: this.receiver.toString(),
    content: this.content,
    createdAt: this.createdAt.toISOString(),
    isRead: this.isRead
  };
};

export default mongoose.model('Message', messageSchema);
