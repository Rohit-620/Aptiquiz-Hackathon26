/**
 * AptiQuiz - Main Express & Socket.IO Server
 */

require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const db = require('./db');
const apiRoutes = require('./routes/apiRoutes');
const { registerSocketHandlers } = require('./sockets/gameSocket');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS & ping thresholds
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes
app.use('/api', apiRoutes);

// Register Socket handlers
registerSocketHandlers(io);

// Catch-all route to serve Single Page Application
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  await db.initDB();
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 AptiQuiz Server live at: http://localhost:${PORT}`);
    console.log(`📡 Real-Time Socket.IO: Activated`);
    console.log(`🎯 Ready for 50-player multiplayer arena matches!`);
    console.log(`====================================================`);
  });
}

startServer();

module.exports = { app, server, io };
