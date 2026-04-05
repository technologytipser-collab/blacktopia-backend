const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// ================================================
// PASTE YOUR SUPABASE DETAILS HERE
// ================================================
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
const JWT_SECRET   = 'blocktopia-super-secret-key-change-this';
// ================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------------------------------------
// POST /api/register
// Called by Minecraft plugin when player registers
// ------------------------------------------------
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }

  // Check if player already exists
  const { data: existing } = await supabase
    .from('players')
    .select('username')
    .eq('username', username)
    .single();

  if (existing) {
    return res.status(409).json({ message: 'Username already registered' });
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Save to Supabase
  const { error } = await supabase
    .from('players')
    .insert([{ username, password: hashedPassword }]);

  if (error) {
    return res.status(500).json({ message: 'Registration failed', error });
  }

  res.json({ success: true, message: `${username} registered successfully!` });
});

// ------------------------------------------------
// POST /api/authenticate
// Called by your website login form
// ------------------------------------------------
app.post('/api/authenticate', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }

  // Find player in database
  const { data: player, error } = await supabase
    .from('players')
    .select('*')
    .eq('username', username)
    .single();

  if (error || !player) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  // Check password
  const passwordMatch = await bcrypt.compare(password, player.password);
  if (!passwordMatch) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  // Update last login
  await supabase
    .from('players')
    .update({ last_login: new Date().toISOString() })
    .eq('username', username);

  // Create JWT token
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ success: true, token, username });
});

// ------------------------------------------------
// GET /api/user/profile
// Returns player profile info
// ------------------------------------------------
app.get('/api/user/profile', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ message: 'No token' });

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { data: player } = await supabase
      .from('players')
      .select('username, registered_at, last_login')
      .eq('username', decoded.username)
      .single();

    res.json(player);
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// ------------------------------------------------
// GET /api/user/last-username-change
// ------------------------------------------------
app.get('/api/user/last-username-change', async (req, res) => {
  res.json({ lastChange: null });
});

// ------------------------------------------------
// POST /api/user/change-username
// ------------------------------------------------
app.post('/api/user/change-username', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ message: 'No token' });

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const { newUsername } = req.body;

    const { error } = await supabase
      .from('players')
      .update({ username: newUsername })
      .eq('username', decoded.username);

    if (error) return res.status(500).json({ message: 'Failed to change username' });

    res.json({ success: true });
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Health check
app.get('/', (req, res) => res.json({ status: 'Blocktopia Backend Running!' }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
