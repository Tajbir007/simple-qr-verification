// Security regression checks. They start the real server against a THROWAWAY database:
//
//   TEST_MONGO_URI=mongodb://localhost:27017/qr-test npm test
//
// Never point TEST_MONGO_URI at a database you care about. The checks only touch their own
// admin and tickets, but they also lock the login rate limiter for this machine.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const uri = process.env.TEST_MONGO_URI;
const port = process.env.TEST_PORT || '3999';
const base = `http://localhost:${port}`;
const admin = { username: `test-admin-${Date.now()}`, password: 'correct horse battery staple' };
const holder = {
    name: '<img src=x onerror="window.xss=1">',
    email: `xss-${Date.now()}@security-test.invalid`,
    phone: '0123456789',
    segments: 'Movie Quiz + Others',
    group: 'Junior',
    institute: '',
    class: ''
};
const someId = '00000000-0000-4000-8000-000000000000';

const post = (path, body, headers = {}) => fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
});

describe('security', { skip: !uri && 'set TEST_MONGO_URI to a throwaway database to run' }, () => {
    let server;
    let auth; // { Cookie } header of a logged-in admin

    before(async () => {
        await mongoose.connect(uri);
        await mongoose.connection.collection('admins')
            .insertOne({ username: admin.username, password: await bcrypt.hash(admin.password, 10) });
        // Explicit env wins over any local .env, so the server can only ever use the test database
        server = spawn(process.execPath, ['server.js'], {
            env: { ...process.env, MONGO_URI: uri, PORT: port, NODE_ENV: 'production', TRUST_PROXY: '' },
            stdio: 'inherit'
        });
        for (let attempt = 0; ; attempt++) {
            try { await fetch(base + '/login'); break; } catch (error) {
                if (attempt > 50) throw error;
                await sleep(200);
            }
        }
    });

    after(async () => {
        server?.kill();
        const db = mongoose.connection;
        await db.collection('admins').deleteOne({ username: admin.username });
        await db.collection('sessions').deleteMany({ username: admin.username });
        await db.collection('users').deleteMany({ email: holder.email });
        await mongoose.disconnect();
    });

    test('security headers are set', async () => {
        const res = await fetch(base + '/login');
        const csp = res.headers.get('content-security-policy');
        const scriptSrc = csp.split(';').find(directive => directive.trim().startsWith('script-src '));
        assert.equal(scriptSrc.trim(), "script-src 'self' https://cdn.tailwindcss.com"); // no 'unsafe-inline'
        assert.match(csp, /frame-ancestors 'none'/);
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
        assert.ok(res.headers.get('strict-transport-security'));
        assert.equal(res.headers.get('x-powered-by'), null);
        assert.equal(res.headers.get('access-control-allow-origin'), null); // no cross-origin access
    });

    test('admin API and admin page reject unauthenticated requests', async () => {
        const adminCalls = [
            ['GET', '/api/tickets'],
            ['POST', '/api/generate-tickets'],
            ['POST', '/api/reset-all-tickets'],
            ['POST', `/api/reset-ticket/${someId}`],
            ['DELETE', `/api/delete-ticket/${someId}`]
        ];
        for (const [method, path] of adminCalls) {
            // the old hardcoded token must no longer open anything
            const res = await fetch(base + path, { method, headers: { Authorization: 'Bearer secret-admin-token' } });
            assert.equal(res.status, 401, `${method} ${path}`);
        }
        // direct, re-cased, encoded and traversal URLs: none may return the dashboard
        for (const path of ['/admin', '/admin.html', '/admin.js', '/ADMIN.HTML', '/%61dmin.html',
            '/private/admin.html', '/..%2fprivate/admin.html']) {
            const res = await fetch(base + path, { redirect: 'manual' });
            assert.notEqual(res.status, 200, path);
            assert.ok(!(await res.text()).includes('Ticket Dashboard'), path);
        }
        const res = await fetch(base + '/admin.html', { redirect: 'manual' });
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), '/login');
    });

    test('login rejects operator injection, malformed bodies and wrong credentials', async () => {
        let res = await post('/api/login', { username: { $ne: null }, password: { $ne: null } });
        assert.equal(res.status, 400);

        res = await post('/api/login', '{not json');
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), { message: 'Invalid request.' }); // no stack trace

        const wrongPassword = await post('/api/login', { username: admin.username, password: 'wrong' });
        const unknownUser = await post('/api/login', { username: 'no-such-user', password: 'wrong' });
        assert.equal(wrongPassword.status, 401);
        assert.equal(unknownUser.status, 401);
        assert.deepEqual(await wrongPassword.json(), await unknownUser.json()); // no account enumeration
    });

    test('login sets a hardened session cookie and returns no token', async () => {
        const res = await post('/api/login', admin);
        assert.equal(res.status, 200);
        assert.equal((await res.json()).token, undefined);
        const setCookie = res.headers.get('set-cookie');
        assert.match(setCookie, /^__Host-session=[0-9a-f]{64};/);
        for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) {
            assert.ok(setCookie.includes(attribute), `${attribute} missing in: ${setCookie}`);
        }
        auth = { Cookie: setCookie.split(';')[0] };
    });

    test('logged-in admin keeps full ticket functionality; hostile requests are refused', async () => {
        let res = await post('/api/generate-tickets', { ticketHolders: [holder] }, { ...auth, Origin: 'https://evil.example' });
        assert.equal(res.status, 403, 'cross-site request with a valid cookie');

        res = await post('/api/generate-tickets', { ticketHolders: [{ ...holder, email: { $ne: '' } }] }, auth);
        assert.equal(res.status, 400, 'operator object instead of an email');

        res = await post('/api/generate-tickets', { ticketHolders: [holder] }, auth);
        assert.equal(res.status, 200);
        const [ticket] = (await res.json()).tickets;

        res = await post('/api/generate-tickets', { ticketHolders: [holder] }, auth);
        assert.equal(res.status, 409, 'duplicate email');

        res = await fetch(base + '/api/tickets', { headers: auth });
        assert.equal(res.status, 200);
        assert.ok((await res.json()).tickets.some(t => t.id === ticket.id && t.name === holder.name));

        res = await fetch(`${base}/api/verify/${ticket.id}`);
        assert.equal((await res.json()).status, 'authentic');
        res = await fetch(`${base}/api/verify/${ticket.id}`);
        assert.equal((await res.json()).status, 'used');
        res = await fetch(`${base}/api/verify/${someId}`);
        assert.equal(res.status, 404);

        res = await post(`/api/reset-ticket/${ticket.id}`, {}, auth);
        assert.equal(res.status, 200);
        res = await fetch(`${base}/api/delete-ticket/${ticket.id}`, { method: 'DELETE', headers: auth });
        assert.equal(res.status, 200);

        res = await fetch(base + '/admin.html', { headers: auth });
        assert.equal(res.status, 200);
        assert.ok((await res.text()).includes('Ticket Dashboard'));
    });

    test('logout invalidates the session on the server', async () => {
        let res = await post('/api/logout', {}, auth);
        assert.equal(res.status, 200);
        res = await fetch(base + '/api/tickets', { headers: auth }); // replay the old cookie
        assert.equal(res.status, 401);
    });

    // Keep last: it locks login for this client for 15 minutes of server uptime
    test('repeated failed logins get 429, even with the right password afterwards', async () => {
        let res;
        for (let attempt = 0; attempt < 12; attempt++) {
            res = await post('/api/login', { username: admin.username, password: 'wrong' });
        }
        assert.equal(res.status, 429);
        assert.ok(res.headers.get('retry-after'));
        res = await post('/api/login', admin);
        assert.equal(res.status, 429);
    });
});
