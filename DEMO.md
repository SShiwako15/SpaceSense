# Local Docker demo

The demo runs the React UI and Node.js API in one container, with PostgreSQL in a second container. The application is available at **http://localhost:8080**.

## What you need

- Docker Desktop running with Linux containers and Docker Compose.
- A web browser and an available local port 8080.
- Internet access for the first image build. Subsequent starts reuse downloaded images.
- PowerShell for the launcher below. Node.js and a separately installed database are not required for the Docker demo.

The demo does not require AWS credentials or an OpenAI API key. Natural-language search uses its local parser by default. To enable optional OpenAI extraction, add `OPENAI_API_KEY` to the private `.env` file and recreate the app with `docker compose up -d app`.

## Start and sign in

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Start-Demo.ps1
```

The launcher creates `.env` once with randomly generated passwords, builds the image, and waits for both services to be healthy. Existing settings are preserved on subsequent runs. For another port on the first run, append `-DemoPort 8090`; for an existing demo, edit `SPACESENSE_PORT` in `.env`.

Open the local URL and use the account details in `.env`:

The sign-in screen uses a blue nebula background and a translucent form with the supplied SpaceSense logo. Email and password are the only sign-in method. The password visibility toggle and student registration work on desktop and mobile. Artwork files are listed in `frontend/ASSETS.md`.

| Role          | Email setting                   | Password setting                   |
| ------------- | ------------------------------- | ---------------------------------- |
| Administrator | `SPACESENSE_ADMIN_EMAIL`        | `SPACESENSE_ADMIN_PASSWORD`        |
| Student       | `SPACESENSE_DEMO_STUDENT_EMAIL` | `SPACESENSE_DEMO_STUDENT_PASSWORD` |

The generated emails are `admin@spacesense.local` and `student@spacesense.local`. Keep `.env` private; it is excluded from Git and the Docker build. In local demo mode, the administrator and demo student passwords are synchronized from these settings at startup. To change one, edit `.env` and run `docker compose up -d app`; sessions for the changed account are ended. This synchronization is specific to `SPACESENSE_DEMO_MODE=true`.

Keep `SPACESENSE_DB_PASSWORD` unchanged once the database volume exists: PostgreSQL uses that value only when it first creates the database, and changing the environment setting alone does not change the database user's password.

A fresh Docker database contains 15 resources, eight weeks of fictional booking history, five upcoming campus bookings, and two example student bookings: one confirmed study group and one lab request awaiting administrator approval. Student registration is also available from the sign-in screen.

## Demo walkthrough

1. Sign in as the student. The redesigned workspace places booking filters beside the AI Assistant, with available spaces listed below. Search by room, size, type, date, and time; expand **Features & accessibility** for more options. Use Today / Tomorrow for a quick date change. Select **Let AI find a space** or try an example in the assistant, such as “Find a room for 20 students with a projector next Tuesday afternoon.” Save a space with its star and filter to saved spaces.
2. Book a classroom. Edit or cancel it from Reservations. Create a weekly series, edit a single occurrence or the upcoming series, switch to the week calendar, apply reservation filters, and export CSV.
3. Request a laboratory booking, or open **Find equipment** in the top navigation to reserve a kit. These bookings remain pending and hold the time until an administrator reviews them.
4. Sign in as the administrator in another browser profile or private window. Open Operations and use its section links to jump to resources, maintenance, approvals, waitlist, reports, forecast, or event allocation. Approve or decline requests, manage resources, and add or remove maintenance windows. Referenced resources cannot be deleted.
5. To show the waitlist, reserve a resource, then search for that exact resource and occupied time as the student. Join the waitlist from the empty search results. Cancel or decline the blocking reservation as the administrator. Open student Notifications and claim the available slot. Claims recheck availability and follow the resource's approval rule.
6. In Operations, review room utilization and the 14-day demand outlook. Load the 50 sample events and calculate their allocation. The expandable event importer accepts custom event JSON as well.
7. Review notifications, mark one or all as read, and sign out. The UI also supports mobile navigation.

## Verify the application

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-Demo.ps1 -BrowserOnHost
```

This builds an isolated `spacesense-check` stack on port 8081, runs the backend and PostgreSQL suite inside Docker, and uses the installed Windows Edge browser for student and administrator workflows against that Docker app. Host browser checks require Node.js, the root dependencies (`npm ci`), and Microsoft Edge; these are already installed on this demo machine. The script verifies that a fresh report confirms all six workflows passed, then removes the test stack and database. Your `spacesense-demo` data is preserved. Reports, screenshots, and failure traces are saved under `test-results/`.

Omit `-BrowserOnHost` to run Chromium inside Docker as well. That Linux browser runtime currently crashes on this Windows Docker host, so the command above is the verified path here.

You can run the components separately with `docker compose --profile test run --build --rm test` and `docker compose --profile test run --build --rm browser`. The browser checks create and modify records; use the isolated test script for a clean demo database.

## Stop, restart, and inspect

Verification includes API and PostgreSQL checks inside Docker and six Windows Edge browser workflows against the isolated Docker application. Reports are saved in test-results/browser-results.json; screenshots are available in test-results/.

```powershell
docker compose ps
docker compose logs --tail 80 app
docker compose down
docker compose up -d --wait
```

PostgreSQL data, accounts, sessions, and reservations persist in the `spacesense-demo_postgres_data` Docker volume. Ordinary stop/start commands preserve it. Docker demo data is separate from the legacy JSON files in `backend/Data/`. The database has no published host port; the web application binds to the local machine at `127.0.0.1`.

If Docker cannot be contacted, start Docker Desktop and check that its Linux engine is running. If port 8080 is in use, change `SPACESENSE_PORT` in `.env`. For startup failures, inspect both `docker compose logs --tail 80 app` and `docker compose logs --tail 80 db`.
