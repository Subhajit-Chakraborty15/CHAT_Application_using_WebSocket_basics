const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const JWT_SECRET = 'your_secret_key'; // Replace with your actual secret key

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/chatapp', { useNewUrlParser: true, useUnifiedTopology: true });

// User and Message models
const UserSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const MessageSchema = new mongoose.Schema({
  room: String,
  sender: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);

app.use(express.json());

// User registration
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashedPassword });
  await user.save();
  res.send({ message: 'User registered successfully' });
});

// User login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ username: user.username }, JWT_SECRET);
    res.send({ token });
  } else {
    res.status(401).send({ message: 'Invalid credentials' });
  }
});

// Middleware to authenticate WebSocket connections
io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (token) {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return next(new Error('Authentication error'));
      }
      socket.username = decoded.username;
      next();
    });
  } else {
    next(new Error('Authentication error'));
  }
});

// Handle WebSocket connections
io.on('connection', (socket) => {
  console.log('User connected:', socket.username);

  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(`${socket.username} joined room: ${room}`);
  });

  socket.on('leaveRoom', (room) => {
    socket.leave(room);
    console.log(`${socket.username} left room: ${room}`);
  });

  socket.on('message', async (data) => {
    const { room, message } = data;
    const msg = new Message({ room, sender: socket.username, message });
    await msg.save();
    io.to(room).emit('message', { sender: socket.username, message });
  });

  socket.on('privateMessage', async (data) => {
    const { recipient, message } = data;
    const msg = new Message({ room: `private-${socket.username}-${recipient}`, sender: socket.username, message });
    await msg.save();
    socket.to(recipient).emit('privateMessage', { sender: socket.username, message });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.username);
  });
});

// Start the server
server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
