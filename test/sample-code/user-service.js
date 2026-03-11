import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '24h';
const users = [];

/**
 * Validates that required fields are present and non-empty strings.
 */
function validateFields(fields, res) {
  for (const [name, value] of Object.entries(fields)) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      res.status(400).json({ error: `${name} is required` });
      return false;
    }
  }
  return true;
}

/**
 * Creates a new user with hashed password.
 */
async function createUser(req, res) {
  const { name, email, password } = req.body;

  if (!validateFields({ name, email, password }, res)) return;

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = { id: users.length + 1, name, email, password: hashedPassword };
  users.push(user);

  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
}

/**
 * Authenticates a user and returns a signed JWT token.
 */
async function login(req, res) {
  const { email, password } = req.body;

  if (!validateFields({ email, password }, res)) return;

  const user = users.find(u => u.email === email);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  res.json({ token });
}

/**
 * Returns all users with sensitive fields excluded.
 */
function getUsers(req, res) {
  const safeUsers = users.map(({ id, name, email }) => ({ id, name, email }));
  res.json(safeUsers);
}

/**
 * Deletes a user by ID. Requires authentication and authorization.
 */
function deleteUser(req, res) {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (req.user.id !== id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const index = users.findIndex(user => user.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  users.splice(index, 1);
  res.json({ success: true });
}

/**
 * Searches users by name. Returns only safe fields.
 */
function searchUsers(query) {
  if (!query || typeof query !== 'string') {
    return [];
  }

  const results = [];
  for (let i = 0; i < users.length; i++) {
    if (users[i].name.includes(query)) {
      const { id, name, email } = users[i];
      results.push({ id, name, email });
    }
  }
  return results;
}

export { createUser, login, getUsers, deleteUser, searchUsers };
