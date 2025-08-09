import { readFileSync, writeFileSync, existsSync } from 'fs';

const usersFile = './users.json';

// Load users from file
function loadUsers() {
  if (!existsSync(usersFile)) return [];
  return JSON.parse(readFileSync(usersFile));
}

// Save users to file
function saveUsers(users) {
  writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// Generate a random 5-digit link code
export function generateLinkCode(jid) {
  const users = loadUsers();
  const code = Math.floor(10000 + Math.random() * 90000).toString();

  // Add or update user
  const existing = users.find(u => u.jid === jid);
  if (existing) {
    existing.linkCode = code;
  } else {
    users.push({ jid, role: 'user', linkCode: code });
  }

  saveUsers(users);
  return code;
}

// Verify link code
export function verifyLinkCode(jid, code) {
  const users = loadUsers();
  const existing = users.find(u => u.linkCode === code);

  if (!existing) return false;

  existing.jid = jid; // Update JID if linking from another device
  existing.linkCode = null; // Remove code after use
  saveUsers(users);
  return true;
}

// Check if user is linked
export function isUserLinked(jid) {
  const users = loadUsers();
  return users.some(u => u.jid === jid);
}
