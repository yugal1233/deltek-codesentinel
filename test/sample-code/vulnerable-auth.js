// Sample file with intentional security issues for testing

const express = require('express');
const mysql = require('mysql');
const app = express();

app.use(express.json());

// Security Issue: SQL Injection vulnerability
app.post('/login', (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  // VULNERABLE: Direct string concatenation in SQL query
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;

  connection.query(query, (error, results) => {
    if (error) throw error;

    if (results.length > 0) {
      // Security Issue: Storing password in session
      req.session.password = password;
      res.json({ success: true, user: results[0] });
    } else {
      res.status(401).json({ success: false });
    }
  });
});

// Security Issue: No input validation
app.post('/update-email', (req, res) => {
  const userId = req.body.userId;
  const email = req.body.email;

  // VULNERABLE: No authentication check
  // VULNERABLE: SQL injection
  const query = `UPDATE users SET email = '${email}' WHERE id = ${userId}`;

  connection.query(query, (error) => {
    if (error) throw error;
    res.json({ success: true });
  });
});

// Bug: Null pointer issue
app.get('/user/:id', (req, res) => {
  const userId = req.params.id;

  connection.query('SELECT * FROM users WHERE id = ?', [userId], (error, results) => {
    if (error) throw error;

    // BUG: No check if results[0] exists
    res.json({
      name: results[0].name,
      email: results[0].email
    });
  });
});

// Performance Issue: N+1 query problem
app.get('/users-with-posts', async (req, res) => {
  connection.query('SELECT * FROM users', async (error, users) => {
    if (error) throw error;

    // PERFORMANCE ISSUE: Making a query for each user
    for (let user of users) {
      connection.query('SELECT * FROM posts WHERE userId = ?', [user.id], (err, posts) => {
        user.posts = posts;
      });
    }

    res.json(users);
  });
});

app.listen(3000);
