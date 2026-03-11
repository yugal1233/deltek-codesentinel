import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

// --- Constants ---
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '24h';
const MIN_PASSWORD_LENGTH = 8;
const MAX_SEARCH_LIMIT = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Startup validation ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// --- Custom error classes (defined before use) ---

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

class AuthError extends AppError {
  constructor(message) { super(message, 401); }
}

class ForbiddenError extends AppError {
  constructor(message) { super(message, 403); }
}

class NotFoundError extends AppError {
  constructor(message) { super(message, 404); }
}

class ConflictError extends AppError {
  constructor(message) { super(message, 409); }
}

// --- Validation utilities (decoupled from HTTP layer) ---

/**
 * Validates that all required fields are non-empty strings.
 * @param {Record<string, unknown>} fields - Key-value pairs to validate.
 * @returns {{ valid: boolean, message?: string }} Validation result.
 */
function validateFields(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      return { valid: false, message: `${name} is required` };
    }
  }
  return { valid: true };
}

/**
 * Validates email format.
 * @param {string} email
 * @returns {{ valid: boolean, message?: string }}
 */
function validateEmail(email) {
  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, message: 'Invalid email format' };
  }
  return { valid: true };
}

/**
 * Validates password strength.
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  return { valid: true };
}

// --- Repository layer (data access, encapsulated state) ---

/**
 * In-memory user repository. Encapsulates storage and provides
 * controlled access methods. Replace with a database adapter for production.
 */
class UserRepository {
  constructor() {
    this._users = [];
  }

  findByEmail(email) {
    return this._users.find(u => u.email === email.toLowerCase());
  }

  findById(id) {
    return this._users.find(u => u.id === id);
  }

  findAll() {
    return [...this._users];
  }

  save(user) {
    this._users.push(user);
    return user;
  }

  deleteById(id) {
    const index = this._users.findIndex(u => u.id === id);
    if (index === -1) {
      return false;
    }
    this._users.splice(index, 1);
    return true;
  }

  search(query, limit = 50) {
    const MAX_QUERY_LENGTH = 100;
    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
    const normalised = query.slice(0, MAX_QUERY_LENGTH).toLowerCase();
    return this._users
      .filter(u => u.name.toLowerCase().includes(normalised))
      .slice(0, safeLimit)
      .map(({ id, name }) => ({ id, name }));
  }
}

// --- Auth middleware factory (dependency-injected) ---

/**
 * Creates a JWT authentication middleware with the given secret.
 * @param {string} jwtSecret - Secret key for JWT verification.
 * @returns {Function} Express middleware that verifies Bearer tokens.
 */
function createAuthMiddleware(jwtSecret) {
  return function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, jwtSecret);
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

// --- Service layer (business logic) ---

/**
 * Handles user-related business logic with injected dependencies.
 */
class UserService {
  /**
   * @param {UserRepository} userRepository
   * @param {number} saltRounds - bcrypt salt rounds.
   * @param {string} jwtSecret - Secret key for JWT signing.
   * @param {string} tokenExpiry - JWT token expiry duration.
   */
  constructor(userRepository, saltRounds, jwtSecret, tokenExpiry) {
    this._repo = userRepository;
    this._saltRounds = saltRounds;
    this._jwtSecret = jwtSecret;
    this._tokenExpiry = tokenExpiry;
  }

  /**
   * Creates a new user with hashed password.
   * @param {string} name
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ id: string, name: string, email: string }>}
   */
  async createUser(name, email, password) {
    const normalisedEmail = email.toLowerCase();
    const existing = this._repo.findByEmail(normalisedEmail);
    if (existing) {
      throw new ConflictError('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(password, this._saltRounds);
    const user = { id: uuidv4(), name, email: normalisedEmail, password: hashedPassword, role: 'user' };
    this._repo.save(user);

    return { id: user.id, name: user.name, email: user.email };
  }

  /**
   * Authenticates a user and returns a JWT token.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<string>} Signed JWT token.
   */
  async login(email, password) {
    const user = this._repo.findByEmail(email.toLowerCase());
    if (!user) {
      throw new AuthError('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AuthError('Invalid credentials');
    }

    return jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      this._jwtSecret,
      { expiresIn: this._tokenExpiry }
    );
  }

  /**
   * Returns all users with sensitive fields excluded.
   * @returns {{ id: string, name: string }[]}
   */
  getAll() {
    return this._repo.findAll().map(({ id, name }) => ({ id, name }));
  }

  /**
   * Deletes a user by ID if the requester is authorised (self or admin).
   * @param {string} userId - ID of the user to delete.
   * @param {string} requesterId - ID of the authenticated user.
   * @param {string} requesterRole - Role of the authenticated user.
   * @returns {boolean}
   */
  deleteUser(userId, requesterId, requesterRole) {
    if (userId !== requesterId && requesterRole !== 'admin') {
      throw new ForbiddenError('You can only delete your own account');
    }

    const deleted = this._repo.deleteById(userId);
    if (!deleted) {
      throw new NotFoundError('User not found');
    }

    return true;
  }

  /**
   * Searches users by name (case-insensitive).
   * @param {string} query
   * @returns {{ id: string, name: string }[]}
   */
  searchUsers(query) {
    if (!query || typeof query !== 'string') {
      return [];
    }
    return this._repo.search(query);
  }
}

// --- Controller layer (HTTP handling) ---

/**
 * Express controller that delegates to UserService.
 * Methods are bound in the constructor to ensure safe callback usage.
 */
class UserController {
  /**
   * @param {UserService} userService
   */
  constructor(userService) {
    this._service = userService;

    this.createUser = this.createUser.bind(this);
    this.login = this.login.bind(this);
    this.getUsers = this.getUsers.bind(this);
    this.deleteUser = this.deleteUser.bind(this);
    this.searchUsers = this.searchUsers.bind(this);
  }

  async createUser(req, res) {
    try {
      const { name, email, password } = req.body;

      const fieldCheck = validateFields({ name, email, password });
      if (!fieldCheck.valid) {
        return res.status(400).json({ error: fieldCheck.message });
      }

      const emailCheck = validateEmail(email);
      if (!emailCheck.valid) {
        return res.status(400).json({ error: emailCheck.message });
      }

      const passwordCheck = validatePassword(password);
      if (!passwordCheck.valid) {
        return res.status(400).json({ error: passwordCheck.message });
      }

      const user = await this._service.createUser(name, email, password);
      res.status(201).json({ success: true, user });
    } catch (err) {
      this._handleError(err, res);
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      const fieldCheck = validateFields({ email, password });
      if (!fieldCheck.valid) {
        return res.status(400).json({ error: fieldCheck.message });
      }

      const token = await this._service.login(email, password);
      res.json({ token });
    } catch (err) {
      this._handleError(err, res);
    }
  }

  getUsers(req, res) {
    try {
      const users = this._service.getAll();
      res.json(users);
    } catch (err) {
      this._handleError(err, res);
    }
  }

  deleteUser(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      this._service.deleteUser(id, req.user.id, req.user.role);
      res.json({ success: true });
    } catch (err) {
      this._handleError(err, res);
    }
  }

  searchUsers(req, res) {
    try {
      const { query } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query parameter is required' });
      }

      const results = this._service.searchUsers(query);
      res.json(results);
    } catch (err) {
      this._handleError(err, res);
    }
  }

  _handleError(err, res) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// --- Dependency injection and router wiring ---

const userRepository = new UserRepository();
const userService = new UserService(userRepository, SALT_ROUNDS, JWT_SECRET, TOKEN_EXPIRY);
const userController = new UserController(userService);
const authMiddleware = createAuthMiddleware(JWT_SECRET);

const router = express.Router();

// Specific routes before parameterized ones
router.post('/users', (req, res) => userController.createUser(req, res));
router.post('/login', (req, res) => userController.login(req, res));
router.get('/users/search', authMiddleware, (req, res) => userController.searchUsers(req, res));
router.get('/users', authMiddleware, (req, res) => userController.getUsers(req, res));
router.delete('/users/:id', authMiddleware, (req, res) => userController.deleteUser(req, res));

export default router;
