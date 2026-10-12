/* Local account system (browser localStorage). Passwords are salted + SHA-256 hashed.
   Roles: student | staff | admin.  NOTE: this is client-side only, so it is fine for a
   demo or classroom but is NOT real security. Move it to a server before real use. */
const Auth = (() => {
  const USERS = 'plc.users', SESSION = 'plc.session';
  const ROLES = ['student', 'staff', 'admin'];

  // ---- Configure these ----
  const STAFF_CODE = 'STAFF2026';                                   // needed to create a staff account
  const DEFAULT_ADMIN = { username: 'admin', email: 'admin@plc.local', password: 'admin123' }; // change me

  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

  async function hash(pw, salt) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pw));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return btoa(salt + pw);
  }
  const makeSalt = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const roleOf = u => u.role || 'student';   // accounts made before roles existed are students

  async function seedAdmin() {
    const users = read(USERS, {});
    if (Object.values(users).some(u => roleOf(u) === 'admin')) return;
    const salt = makeSalt();
    users[DEFAULT_ADMIN.username] = {
      username: DEFAULT_ADMIN.username, email: DEFAULT_ADMIN.email, org: 'Administration',
      role: 'admin', salt, hash: await hash(DEFAULT_ADMIN.password, salt)
    };
    localStorage.setItem(USERS, JSON.stringify(users));
  }

  async function register({ username, email, password, org, role = 'student', code }) {
    if (role === 'admin' || !ROLES.includes(role)) throw new Error('Admin accounts cannot be created here.');
    await seedAdmin();
    username = (username || '').trim(); email = (email || '').trim().toLowerCase();
    if (username.length < 3) throw new Error('Username needs at least 3 characters.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
    if ((password || '').length < 6) throw new Error('Password needs at least 6 characters.');
    if (role === 'staff' && (code || '').trim().toUpperCase() !== STAFF_CODE.toUpperCase())
      throw new Error('Invalid staff access code. Ask your administrator.');
    const users = read(USERS, {});
    const key = username.toLowerCase();
    if (users[key]) throw new Error('That username is taken. Pick another or sign in.');
    if (Object.values(users).some(u => u.email === email)) throw new Error('An account with that email already exists.');
    const salt = makeSalt();
    users[key] = { username, email, org: (org || '').trim(), role, salt, hash: await hash(password, salt) };
    localStorage.setItem(USERS, JSON.stringify(users));
    return start(users[key]);
  }

  async function login(id, password, role = 'student') {
    await seedAdmin();
    id = (id || '').trim().toLowerCase();
    const users = read(USERS, {});
    const u = users[id] || Object.values(users).find(x => x.email === id);
    if (!u || u.hash !== await hash(password || '', u.salt)) throw new Error('Username or password is incorrect.');
    if (roleOf(u) !== role) throw new Error(`This is a ${roleOf(u)} account. Switch to the ${roleOf(u)} tab to sign in.`);
    return start(u);
  }

  function start(u) {
    const s = { username: u.username, org: u.org || '', role: roleOf(u), guest: false };
    localStorage.setItem(SESSION, JSON.stringify(s));
    return s;
  }
  function guest() {
    const s = { username: 'Guest Learner', org: '', role: 'student', guest: true };
    localStorage.setItem(SESSION, JSON.stringify(s));
    return s;
  }
  const session = () => read(SESSION, null);
  const logout = () => localStorage.removeItem(SESSION);
  function require(...allowed) {
    const s = session();
    if (!s || (allowed.length && !allowed.includes(s.role || 'student'))) location.replace('login.html');
    return s;
  }

  return { register, login, guest, session, logout, require, ROLES };
})();
