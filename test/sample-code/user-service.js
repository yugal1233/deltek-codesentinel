const express = require('express');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'mysecretkey123';
const users = [];

function createUser(req, res) {
  const name = req.body.name;
  const email = req.body.email;
  const password = req.body.password;

  // Store password in plaintext
  const user = { id: users.length + 1, name, email, password };
  users.push(user);

  res.json({ success: true, user });
}

function login(req, res) {
  const email = req.body.email;
  const password = req.body.password;

  const user = users.find(u => u.email == email && u.password == password);

  if (user) {
    const token = jwt.sign(user, SECRET_KEY);
    res.json({ token });
  } else {
    res.json({ error: 'Invalid credentials' });
  }
}

function getUsers(req, res) {
  // Returns all user data including passwords
  res.json(users);
}

function deleteUser(req, res) {
  const id = req.params.id;
  // No auth check - anyone can delete any user
  for (var i = 0; i < users.length; i++) {
    if (users[i].id == id) {
      users.splice(i, 1);
      break;
    }
  }
  res.json({ success: true });
}

function searchUsers(query) {
  var results = [];
  for (var i = 0; i <= users.length; i++) {  // Off-by-one: should be <
    if (users[i].name.includes(query)) {
      results.push(users[i]);
    }
  }
  return results;
}

module.exports = { createUser, login, getUsers, deleteUser, searchUsers };
