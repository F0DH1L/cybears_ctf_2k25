import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [2, 'Username must be at least 2 characters long'],
    maxlength: [50, 'Username cannot exceed 50 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  secret: { 
    type: String, 
    required: [true, 'Secret is required'],
    trim: true
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt fields
  collection: 'users'
});

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

// Instance method to hide sensitive data
userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

// Static method to find user by email or username
userSchema.statics.findByEmailOrUsername = function(emailOrUsername) {
  return this.findOne({
    $or: [
      { email: emailOrUsername },
      { username: emailOrUsername }
    ]
  });
};

export default mongoose.model('User', userSchema);
