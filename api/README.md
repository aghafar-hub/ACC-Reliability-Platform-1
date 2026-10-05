# ACC Reliability Platform — API (local setup)

A Node/Express API over MySQL — the new backend being built to eventually
replace the Google Apps Script backends in `backend/`. **Nothing here is
live yet.** The real app still runs on GitHub Pages + Apps Script + Google
Sheets, completely unaffected by any of this. This is for building and
testing the new system on your own machine before any real migration
happens.

## What you need installed

- **Node.js** (v20 or later) — [nodejs.org](https://nodejs.org)
- **MySQL** (v8.0 or later) — either:
  - a direct install ([dev.mysql.com/downloads](https://dev.mysql.com/downloads/)), or
  - **Docker Desktop** + run MySQL in a container (cleaner — easy to wipe and
    restart if something goes wrong):
    ```
    docker run --name acc-mysql -e MYSQL_ROOT_PASSWORD=yourpassword -p 3306:3306 -d mysql:8.0
    ```
- Optionally, a GUI to browse the data: **MySQL Workbench** (free, official)
  or **TablePlus**/**DBeaver**.

## 1. Set up the database

From the repo root:

```bash
mysql -u root -p -e "CREATE DATABASE acc_reliability CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p < database/schema/00_core.sql
mysql -u root -p < database/schema/01_oil_lubrication.sql
mysql -u root -p < database/schema/02_vibration_analysis.sql
```

(The `00_core.sql` file includes its own `CREATE DATABASE IF NOT EXISTS`, so
the first explicit `CREATE DATABASE` line above is optional — it's there for
clarity on what's happening.)

Create a dedicated database user for the API to connect as — **never use
the MySQL root account from application code**:

```sql
CREATE USER 'acc_api'@'127.0.0.1' IDENTIFIED BY 'choose-a-real-password';
GRANT ALL PRIVILEGES ON acc_reliability.* TO 'acc_api'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Use `127.0.0.1` here, not `localhost` — MySQL treats them as genuinely
different hosts for user matching (`localhost` only matches Unix-socket
connections), and Node's `mysql2` driver always connects over TCP, even to
`127.0.0.1` on the same machine. A user created as `'acc_api'@'localhost'`
will silently fail to authenticate from the API even though `.env`'s
`DB_HOST=127.0.0.1` looks like it should match "localhost." (If connecting
from a Docker container, use that container's actual host/IP, or `@'%'`
for any host — fine for local development, not for anything
internet-facing.)

Verify the schema came in correctly:

```bash
mysql -u root -p acc_reliability -e "SHOW TABLES;"
```

You should see 32 tables and 6 views (38 rows total, since `SHOW TABLES`
lists both).

## 2. Set up and run the API

```bash
cd api
npm install
cp .env.example .env
```

Edit `.env` with the database user/password you created above and a real
random `JWT_SECRET` (generate one with `openssl rand -hex 32`, or any long
random string — this signs login sessions, so don't reuse the placeholder
in `.env.example`).

```bash
npm start
```

You should see `API listening on http://localhost:3001`. Verify:

```bash
curl http://localhost:3001/health
# {"status":"ok","time":"..."}
```

For development, `npm run dev` restarts the server automatically when you
edit a file (uses Node's built-in `--watch`, no extra tool needed).

## 3. Create your first user

The database starts completely empty — there's no built-in admin account.
Create your first organization and user directly in MySQL (every endpoint
after this works through the API itself):

```sql
USE acc_reliability;
INSERT INTO organizations (org_code, org_name, org_type) VALUES ('ACC', 'Arabian Cement Company', 'ACC');
INSERT INTO roles (role_name) VALUES ('App Admin'), ('Technician'), ('Contractor Engineer'), ('Reliability Engineer'), ('Manager');
```

Then hash a real password and insert the user (run this with Node, from
the `api/` directory, so it uses the same bcrypt version as the app):

```bash
node -e "require('bcryptjs').hash('YourRealPassword123!', 12).then(console.log)"
```

Copy the output hash into:

```sql
INSERT INTO users (email, password_hash, password_salt, org_id)
  VALUES ('you@example.com', '<paste the hash here>', 'bcrypt-self-salted',
          (SELECT org_id FROM organizations WHERE org_code='ACC'));
INSERT INTO user_roles (user_id, role_id)
  VALUES ((SELECT user_id FROM users WHERE email='you@example.com'),
          (SELECT role_id FROM roles WHERE role_name='App Admin'));
```

Now log in through the real API:

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourRealPassword123!"}'
```

That returns a token — use it as `Authorization: Bearer <token>` on every
other request. From here, every endpoint documented below (organizations,
equipment, users, etc.) works, including creating further users through
`POST /users` instead of raw SQL.

## What's implemented

See `database/README.md` for the schema design and reasoning. The API
covers, fully tested end-to-end against a local database:

- **Platform Core**: `/auth` (login, session), `/organizations`, `/users`,
  `/roles`, `/settings`, `/audit-log`, `/equipment` (the shared table)
- **Oil Lubrication**: `/lubrication-points`, `/oil-samples`,
  `/oil-actions`, `/routines` (+ `/routine-items`), `/oil-inventory`,
  `/route-templates`, `/action-phrases`, `/module-responsibilities`,
  `/notify-reviewers`, `/in-app-notifications`
- **Vibration Analysis**: `/vib-points`, `/rms-register`, `/spm-register`,
  `/rms-readings`, `/spm-readings`, `/last-rms-reading`,
  `/last-spm-reading`, `/compliance`, `/vib-actions`

Every endpoint requires a valid session token (`Authorization: Bearer
<token>` from `/auth/login`) except `/health` and `/auth/login` itself.
Several admin-only actions (creating equipment, managing users, viewing the
audit log) require the `App Admin` role.

## What's NOT done yet

- No real data migration from the live Google Sheets — the database starts
  empty every time you set it up from these files.
- No automated API tests (everything so far has been verified by hand with
  `curl` during development — see the git log for the specific test
  sequences run for each endpoint).
- No deployment config (Cloud Run, Docker image for the API itself, CI).
- The audit log mechanism (`src/auditLog.js`) is only wired into one
  endpoint (`routines.js`'s approve action) as a proof of concept — which
  other actions should write an audit trail is a product decision, not yet
  made.

None of this blocks running everything described above locally, right now.
