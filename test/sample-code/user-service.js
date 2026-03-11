import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

// --- Constants ---
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '24h'; // JWT duration string — see https://github.com/vercel/ms for valid formats
const MIN_PASSWORD_LENGTH = 8;
const MIN_JWT_SECRET_LENGTH = 32;
const MAX_SEARCH_LIMIT = 100;
const MAX_QUERY_LENGTH = 100;
const MAX_NAME_LENGTH = 100;
const ROLES = Object.freeze({ ADMIN: 'admin', USER: 'user' });
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (value.trim().length > MAX_NAME_LENGTH) {
      return { valid: false, message: `${name} must be at most ${MAX_NAME_LENGTH} characters` };
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
 * @typedef {Object} IUserRepository
 * @property {(email: string) => Object|undefined} findByEmail
 * @property {(id: string) => Object|undefined} findById
 * @property {() => Object[]} findAll
 * @property {(user: Object) => Object} save - Upserts: inserts if new, updates if existing.
 * @property {(id: string) => boolean} deleteById
 * @property {(query: string, limit?: number) => Object[]} search - Searches by name only (case-insensitive).
 */

/**
 * In-memory user repository implementing IUserRepository.
 * Encapsulates storage and provides controlled access methods.
 * Replace with a database adapter for production.
 * @implements {IUserRepository}
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

  /**
   * Upserts a user: updates an existing record by ID, or inserts a new one.
   * @param {Object} user
   * @returns {Object} The saved user.
   */
  save(user) {
    const index = this._users.findIndex(u => u.id === user.id);
    if (index !== -1) {
      this._users[index] = { ...this._users[index], ...user };
    } else {
      this._users.push(user);
    }
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

  /**
   * Searches users by name only (case-insensitive). Does not search by email.
   * @param {string} query
   * @param {number} [limit=50]
   * @returns {{ id: string, name: string }[]}
   */
  search(query, limit = 50) {
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
      console.error('JWT verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

/**
 * Creates a role-check middleware that restricts access to the specified role.
 * @param {string} requiredRole - The role required to access the route.
 * @returns {Function} Express middleware.
 */
function requireRole(requiredRole) {
  return function roleMiddleware(req, res, next) {
    if (!req.user || req.user.role !== requiredRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// --- Service layer (business logic) ---

/**
 * Handles user-related business logic with injected dependencies.
 */
class UserService {
  /**
   * @param {IUserRepository} userRepository
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
    const user = { id: uuidv4(), name, email: normalisedEmail, password: hashedPassword, role: ROLES.USER };
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
   * Returns all users with sensitive fields excluded. Admin-only endpoint.
   * @returns {Promise<{ id: string, name: string }[]>}
   */
  async getAll() {
    const users = this._repo.findAll();
    return users.map(({ id, name }) => ({ id, name }));
  }

  /**
   * Deletes a user by ID if the requester is authorised (self or admin).
   * @param {string} userId - ID of the user to delete.
   * @param {string} requesterId - ID of the authenticated user.
   * @param {string} requesterRole - Role of the authenticated user.
   * @returns {Promise<boolean>}
   */
  async deleteUser(userId, requesterId, requesterRole) {
    if (userId !== requesterId && requesterRole !== ROLES.ADMIN) {
      throw new ForbiddenError('You can only delete your own account');
    }

    const deleted = this._repo.deleteById(userId);
    if (!deleted) {
      throw new NotFoundError('User not found');
    }

    return true;
  }

  /**
   * Searches users by name (case-insensitive). Does not search by email.
   * @param {string} query
   * @returns {Promise<{ id: string, name: string }[]>}
   */
  async searchUsers(query) {
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

  async getUsers(req, res) {
    try {
      const users = await this._service.getAll();
      res.json(users);
    } catch (err) {
      this._handleError(err, res);
    }
  }

  async deleteUser(req, res) {
    try {
      const { id } = req.params;
      await this._service.deleteUser(id, req.user.id, req.user.role);
      res.json({ success: true });
    } catch (err) {
      this._handleError(err, res);
    }
  }

  async searchUsers(req, res) {
    try {
      const { query } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query parameter is required' });
      }

      const results = await this._service.searchUsers(query);
      res.json(results);
    } catch (err) {
      this._handleError(err, res);
    }
  }

  _handleError(err, res) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Unexpected error:', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// --- Factory function for testability (no module-level side effects) ---

/**
 * Creates and configures the user router with all dependencies.
 * Validates configuration at call time rather than import time.
 * @param {Object} [config] - Optional configuration overrides.
 * @param {string} [config.jwtSecret] - JWT secret (defaults to process.env.JWT_SECRET).
 * @returns {import('express').Router} Configured Express router.
 */
export function createUserRouter(config = {}) {
  const jwtSecret = config.jwtSecret ?? process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET is required and must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  const userRepository = new UserRepository();
  const userService = new UserService(userRepository, SALT_ROUNDS, jwtSecret, TOKEN_EXPIRY);
  const userController = new UserController(userService);
  const authMiddleware = createAuthMiddleware(jwtSecret);

  const router = express.Router();

  router.post('/users', userController.createUser);
  router.post('/login', userController.login);
  router.get('/users/search', authMiddleware, userController.searchUsers);
  router.get('/users', authMiddleware, requireRole(ROLES.ADMIN), userController.getUsers);
  router.delete('/users/:id', authMiddleware, userController.deleteUser);

  return router;
}

// Export classes for testing
export { UserRepository, UserService, UserController, AppError, AuthError, ForbiddenError, NotFoundError, ConflictError, ROLES };
