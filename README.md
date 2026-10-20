# SpaceSense AI

A local campus reservation MVP for classrooms, labs, study spaces, and shared equipment. Search by requirements, check live availability, create or change bookings, and explore a 50-event room allocation scenario.

## Run locally

Requirements: .NET SDK 10, [Node.js 20.19+ or 22.12+](https://v7.vite.dev/guide/migration#node-js-support), and npm.

Start the API in one terminal:

```powershell
dotnet run --project backend/SpaceSense.Api.csproj --urls http://localhost:5080
```

Start the React app in another terminal:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`. On macOS or Linux, use `npm` instead of `npm.cmd`. Vite forwards `/api` requests to the local API on port 5080.

## What the MVP does

- Search a seeded campus catalog by type, size, features, accessibility, and time window.
- Check availability and create, edit, or cancel reservations. The API rejects overlapping bookings for the same resource, including concurrent requests handled by one API process.
- Create weekly reservation series with up to 12 occurrences. Every occurrence is checked in one transaction; a conflict leaves the entire series unchanged. Individual occurrences or the full series can be cancelled later.
- Submit laboratory and equipment bookings for staff approval. Pending requests hold their time; administrators can approve or decline them in the operations view.
- Schedule temporary maintenance windows from the operations view. Maintenance blocks search, booking, approvals, allocation, and available utilization hours; a window cannot be placed over an active reservation.
- Review in-app notifications for booking requests, approvals, declines, updates, and cancellations. Notifications can be marked read and are saved locally.
- Turn a natural-language request into structured search filters, then run those filters through the same reservation search engine.
- View upcoming reservations and seven-day room utilization.
- Save favorite spaces in the browser, filter reservations by text, status, type, and date, switch between list and week-calendar views, and export the current reservation view as CSV.
- Explore a 14-day room-demand outlook by day and room type. It uses the previous eight matching weekdays, gives recent bookings more weight, adjusts for the academic term, and includes confirmed upcoming bookings as a floor. A fresh installation includes fictional history for the demo.
- Load 50 fictional, overlapping events and calculate a feasible, priority-aware room plan. The planner checks capacity, required features, accessibility, existing reservations, and overlapping events; it reports unassigned events and seat-use metrics. Its bounded search does not prove global optimality.

Reservation data is saved locally in `backend/Data/reservations.json` and seeded on first launch. Maintenance windows use `backend/Data/maintenance.json`; notifications are saved in `backend/Data/notifications.json`. Delete the reservation file while the API is stopped to restore the sample reservations.

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API readiness and campus time zone |
| GET | `/api/resources` | Catalog search and availability filtering |
| GET | `/api/resources/{id}/availability` | Conflicts for a time window |
| GET | `/api/reservations` | Reservations, optionally filtered by `from`, `to`, `status`, and `seriesId` |
| POST | `/api/reservations` | Create a reservation or weekly series (`repeatWeeks`: 1–12) |
| PUT | `/api/reservations/{id}` | Change a reservation |
| DELETE | `/api/reservations/{id}` | Cancel a reservation |
| DELETE | `/api/reservations/series/{seriesId}` | Cancel all occurrences in a series |
| GET | `/api/maintenance` | List maintenance windows, optionally filtered by `resourceId` |
| POST | `/api/maintenance` | Schedule a maintenance window |
| DELETE | `/api/maintenance/{id}` | Remove a maintenance window |
| POST | `/api/reservations/{id}/approve` | Approve a pending reservation |
| POST | `/api/reservations/{id}/reject` | Decline a pending reservation |
| GET | `/api/notifications` | Notification feed and unread count |
| POST | `/api/notifications/{id}/read` | Mark one notification as read |
| POST | `/api/notifications/read-all` | Mark all notifications as read |
| POST | `/api/search/natural` | Interpret a request and find matching resources |
| GET | `/api/stats/utilization` | Resource utilization for a time window |
| GET | `/api/stats/forecast?days=14` | Room-demand outlook for 1–30 days |
| GET | `/api/allocations/sample` | Fictional 50-event dataset |
| POST | `/api/allocations/solve` | Feasible room assignments for supplied events |

Times are ISO 8601 timestamps with UTC offsets. Date phrases in natural-language search use the `America/New_York` campus time zone.

Natural-language search works without credentials through a local parser. To enable optional LLM extraction, set `OPENAI_API_KEY` in the API process environment before starting it. `OPENAI_MODEL` can override the default `gpt-4.1-mini`. The API requests [structured JSON from the OpenAI Responses API](https://developers.openai.com/api/docs/guides/structured-outputs), validates the extracted filters, and falls back to the local parser on API errors. Keep API keys on the server; the React app does not need one.

## MVP boundaries

This is a local demonstration, with single-process JSON storage and no user accounts or role enforcement. The administrator view demonstrates the approval workflow but is not protected by authentication, and the in-app notification feed is shared by the local demo. For a multi-user deployment, move reservations and notifications to a transactional database such as PostgreSQL, add identity and authorization, and deliver user-specific notifications. The demand outlook is a transparent seasonal baseline, not a trained machine-learning model; the academic-term dates are approximate. Email and push notifications and a trained forecasting model remain future work.
