// server.js
// Main entry point — starts Express, connects to MongoDB, sets up sessions and routes

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Force Google DNS

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

// Connect to MongoDB
connectDB();

// Set EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Parse form data and JSON using body-parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static files (CSS)
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration — sessions stored in MongoDB
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 2 // 2 hours
  }
}));

// Make session data available in all EJS templates
app.use((req, res, next) => {
  res.locals.user = req.session.userId ? {
    id: req.session.userId,
    username: req.session.username,
    role: req.session.userRole
  } : null;
  next();
});

// Routes
const authRoutes = require('./routes/authRoutes');
const requesterRoutes = require('./routes/requesterRoutes');
const approverRoutes = require('./routes/approverRoutes');

app.use('/', authRoutes);
app.use('/', requesterRoutes);
app.use('/', approverRoutes);

// Start the server — bind to 0.0.0.0 for external access
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
