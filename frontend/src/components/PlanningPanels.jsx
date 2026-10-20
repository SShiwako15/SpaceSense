import { ArrowDownRight, ArrowRight, BarChart3, CheckCircle2, ChevronDown, CircleAlert, Lightbulb, Plus } from '../icons.jsx';
import { durationHours, formatDate, formatDateTime } from '../dates';
import { EmptyState, PanelTitle, formatPercent } from './shared';
export function CustomEventImport({ value, onChange, onImport }) {
  return (
    <details className="group mt-5 rounded-xl border border-[#e5ece7] bg-[#f9fbf9]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-extrabold text-teal [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Plus size={17} /> Provide your own events
        </span>
        <ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#e5ece7] p-4">
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Paste an array of event objects, or an object with an{" "}
          <code className="font-mono text-teal">events</code> array. Times must be ISO 8601 timestamps. Priority
          is 1 (lowest) through 5 (highest).
        </p>
        <textarea
          className="min-h-36 w-full resize-y rounded-lg border border-[#dce7e0] bg-white px-3 py-3 font-mono text-xs leading-relaxed text-ink placeholder:text-muted"
          aria-label="Custom allocation events JSON"
          spellCheck="false"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={7}
          placeholder={
            '[{\n  "id": "seminar-1",\n  "title": "Design seminar",\n  "start": "2026-10-20T14:00:00-04:00",\n  "end": "2026-10-20T16:00:00-04:00",\n  "attendees": 20,\n  "requiredFeatures": ["Projector"],\n  "accessible": true,\n  "priority": 3\n}]'
          }
        />
        <div className="mt-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <span className="text-[10px] leading-relaxed text-muted">
            Required: id, title, start, end, attendees, requiredFeatures,
            accessible, priority
          </span>
          <button
            type="button"
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#cddcd8] bg-white px-4 py-2 text-xs font-extrabold whitespace-nowrap text-teal transition hover:enabled:-translate-y-0.5 hover:enabled:bg-[#f2faf6] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            onClick={onImport}
            disabled={!value.trim()}
          >
            Use these events <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </details>
  );
}

export function ForecastPanel({ forecast, loading, onRefresh }) {
  const days = Array.isArray(forecast?.days) ? forecast.days.slice(0, 14) : [];
  const types = Array.isArray(forecast?.byType) ? forecast.byType : [];
  const peak = days.reduce(
    (highest, day) =>
      Number(day.demandPercentage) > Number(highest?.demandPercentage ?? -1)
        ? day
        : highest,
    null,
  );
  return (
    <section className="mb-5 min-w-0 rounded-2xl border border-[#e5ebe8] bg-white px-4 py-5 shadow-[0_4px_22px_#1e394307] sm:px-6 sm:py-6">
      <PanelTitle
        eyebrow="DEMAND OUTLOOK"
        title="The next 14 days"
        description="Estimated room demand as a share of available room hours."
        action={
          <button
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-extrabold whitespace-nowrap text-teal hover:enabled:underline disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onRefresh}
            disabled={loading}
          >
            Refresh <ArrowRight size={15} />
          </button>
        }
      />
      {forecast?.error ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-[#f2d7ca] bg-[#fff3ee] px-3.5 py-3 text-xs text-[#a45e46]" role="alert">
          <CircleAlert size={16} className="shrink-0" /> {forecast.error}
        </div>
      ) : loading && !days.length ? (
        <p className="py-6 text-xs text-muted" role="status">Calculating the demand outlook…</p>
      ) : days.length ? (
        <>
          <div className="flex flex-wrap gap-6 border-b border-[#edf1ee] pt-2 pb-4 sm:gap-8">
            <div className="grid gap-1">
              <strong className="font-display text-xl leading-tight font-bold text-teal sm:text-2xl">
                {peak ? formatPercent(peak.demandPercentage) : "—"}
              </strong>
              <span className="text-xs font-extrabold text-[#3d535a]">Highest daily demand</span>
              <small className="text-[10px] text-muted">
                {peak
                  ? formatDate(`${peak.date}T12:00:00Z`, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : ""}
              </small>
            </div>
            <div className="grid gap-1">
              <strong className="font-display text-xl leading-tight font-bold text-teal sm:text-2xl">{Number(forecast.historyReservations || 0)}</strong>
              <span className="text-xs font-extrabold text-[#3d535a]">Historical reservations</span>
              <small className="text-[10px] text-muted">Used to estimate the pattern</small>
            </div>
          </div>
          <div
            className="overflow-x-auto"
            aria-label="Fourteen-day predicted room demand chart"
            role="region"
            tabIndex={0}
          >
            <div className="grid h-48 min-w-[440px] grid-cols-[repeat(14,minmax(0,1fr))] gap-2 px-0.5 pt-4">
            {days.map((day, index) => {
              const percent = Math.max(0, Number(day.demandPercentage) || 0);
              const label = formatDate(`${day.date}T12:00:00Z`, {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              return (
                <div
                  className="flex min-w-0 flex-col items-center gap-1 text-center"
                  key={day.date}
                  role="img"
                  aria-label={`${label}: ${formatPercent(percent)} predicted demand, ${Number(day.predictedRoomHours || 0).toFixed(1)} predicted room hours`}
                >
                  <span className="flex h-28 w-full items-end justify-center overflow-hidden rounded-t-md rounded-b-sm bg-[#f1f5f2]">
                    <span
                      className={`block min-h-0.5 w-full rounded-t-md rounded-b-sm bg-linear-to-t ${index % 7 >= 5 ? "from-[#6995a2] to-[#a6bec3]" : "from-[#279980] to-[#6cc2a3]"}`}
                      style={{ height: `${Math.min(100, percent)}%` }}
                    />
                  </span>
                  <strong className="text-[10px] font-bold text-[#546e72]">
                    {formatDate(`${day.date}T12:00:00Z`, { weekday: "short" })}
                  </strong>
                  <small className="text-[10px] text-muted">
                    {formatDate(`${day.date}T12:00:00Z`, { day: "numeric" })}
                  </small>
                </div>
              );
            })}
            </div>
          </div>
          {types.length > 0 && (
            <div className="flex flex-col items-start gap-2 border-t border-[#edf1ee] pt-3.5 text-xs text-[#536c70] sm:flex-row sm:gap-5">
              <strong className="font-bold whitespace-nowrap text-[#294b50]">By room type</strong>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {types.map((item) => (
                  <span className="whitespace-nowrap" key={item.type}>
                    <b className="font-bold text-teal capitalize">{item.type}</b> {formatPercent(item.demandPercentage)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-[#f3f8f4] px-3 py-3 text-xs leading-relaxed text-muted">
            <Lightbulb size={16} className="shrink-0 text-[#4a9a7e]" />
            <span>
              {forecast.note ||
                "Estimates use recent reservations, weekday patterns, and the academic calendar."}{" "}
              <strong className="font-bold text-[#536c66]">Method:</strong>{" "}
              {forecast.method || "Historical pattern estimate."}
            </span>
          </p>
        </>
      ) : (
        <EmptyState
          icon={BarChart3}
          title="No forecast yet"
          description="A demand outlook will appear when the forecast service responds."
        />
      )}
    </section>
  );
}

export function AllocationResults({ result }) {
  const summary = result.summary || {};
  const assignments = result.assignments || [];
  const unassigned = result.unassigned || [];
  const rooms = result.rooms || [];
  return (
    <div className="mt-6 border-t border-[#e7ece9] pt-5">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <span className="font-display text-[10px] font-extrabold tracking-[1.55px] text-teal uppercase">ALLOCATION COMPLETE</span>
          <h3 className="my-1 font-display text-lg font-bold">
            {summary.assignedEvents ?? assignments.length} of{" "}
            {summary.totalEvents ?? assignments.length + unassigned.length}{" "}
            events placed
          </h3>
          <p className="text-xs text-muted">
            {result.method || "Constraint-aware planning"} · Existing
            reservations included
          </p>
        </div>
        {assignments.length ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9f6ee] px-2.5 py-2 text-[10px] font-extrabold whitespace-nowrap text-[#288670]">
            <CheckCircle2 size={16} /> Feasible plan generated
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff0e9] px-2.5 py-2 text-[10px] font-extrabold whitespace-nowrap text-[#ad654d]">
            <CircleAlert size={16} /> No assignments
          </span>
        )}
      </div>
      <div className="mt-5 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 [&>div]:grid [&>div]:gap-1.5 [&>div]:rounded-lg [&>div]:border [&>div]:border-[#e6ece7] [&>div]:bg-[#f5f8f5] [&>div]:p-3 [&_span]:text-[10px] [&_span]:font-bold [&_span]:text-muted [&_strong]:font-display [&_strong]:text-xl [&_strong]:font-bold [&_strong]:text-[#2b665b] [&_small]:text-[10px] [&_small]:text-muted">
        <div>
          <span>Allocation rate</span>
          <strong>{formatPercent(summary.allocationRatePercent)}</strong>
          <small>Events with a suitable room</small>
        </div>
        <div>
          <span>Seat fill</span>
          <strong>{formatPercent(summary.seatFillPercent)}</strong>
          <small>Attendees / assigned seats</small>
        </div>
        <div>
          <span>Room time use</span>
          <strong>{formatPercent(summary.roomTimeUtilizationPercent)}</strong>
          <small>Booked time in planning window</small>
        </div>
        <div>
          <span>Unassigned</span>
          <strong>{summary.unassignedEvents ?? unassigned.length}</strong>
          <small>Need manual review</small>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span>Spare seat-hours</span>
          <strong>{Number(summary.wastedSeatHours || 0).toFixed(1)}</strong>
          <small>Capacity above attendance</small>
        </div>
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(200px,0.8fr)]">
        <div className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h4 className="text-xs font-extrabold">Recommended assignments</h4>
            <span className="text-[10px] text-muted">{assignments.length} matches</span>
          </div>
          <div className="max-h-[350px] overflow-auto rounded-lg border border-[#e5ebe8]" role="region" aria-label="Recommended event assignments" tabIndex={0}>
            <table className="w-full min-w-[560px] border-collapse text-xs [&_th]:sticky [&_th]:top-0 [&_th]:bg-[#f6f9f6] [&_th]:p-3 [&_th]:text-left [&_th]:text-[10px] [&_th]:font-bold [&_th]:tracking-wide [&_th]:text-muted [&_th]:uppercase [&_td]:border-t [&_td]:border-[#edf1ee] [&_td]:p-3 [&_td]:align-top [&_td]:text-[#597078] [&_td_small]:mt-1 [&_td_small]:block [&_td_small]:text-[10px] [&_td_small]:text-muted">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Assigned room</th>
                  <th>Schedule</th>
                  <th>Seats</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((item) => (
                  <tr key={item.eventId}>
                    <td>
                      <strong className="block max-w-44 font-bold text-[#314b52]">
                        {item.eventTitle || item.title || item.eventId}
                      </strong>
                      <small>{item.attendees} attendees</small>
                    </td>
                    <td>{item.resourceName || item.resourceId}</td>
                    <td>
                      {formatDateTime(item.start)}
                      <small>
                        {durationHours(item.start, item.end).toFixed(1)} hours
                      </small>
                    </td>
                    <td>
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        {item.capacity} <ArrowDownRight size={13} className="shrink-0 text-[#d29068]" />{" "}
                        {item.seatWaste ??
                          Math.max(
                            0,
                            (item.capacity || 0) - (item.attendees || 0),
                          )}{" "}
                        spare
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!assignments.length && (
              <p className="p-5 text-center text-xs text-muted">
                No events could be assigned in this planning window.
              </p>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h4 className="text-xs font-extrabold">Room use</h4>
            <span className="text-[10px] text-muted">{rooms.length} rooms</span>
          </div>
          <div className="grid max-h-[250px] gap-4 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-1">
            {[...rooms]
              .sort((a, b) => b.utilizationPercent - a.utilizationPercent)
              .map((room) => (
                <div className="min-w-0" key={room.resourceId}>
                  <div className="mb-1.5 flex justify-between gap-2 text-xs">
                    <strong className="font-bold text-[#4d6569]">{room.resourceName || room.resourceId}</strong>
                    <span className="text-teal">{formatPercent(room.utilizationPercent)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#edf1ef]">
                    <span
                      className="block h-full rounded-full bg-linear-to-r from-[#4db599] to-[#238877]"
                      style={{
                        width: `${Math.min(100, Math.max(0, Number(room.utilizationPercent) || 0))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
          {unassigned.length > 0 && (
            <div className="mt-4 max-h-48 overflow-auto rounded-lg border border-[#f2e2d7] bg-[#fff8f4] p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#bc7351]">
                <CircleAlert size={17} className="shrink-0" /> Needs review ({unassigned.length})
              </h4>
              {unassigned.map((item) => (
                <p className="grid gap-1 border-t border-[#f3e8e0] py-2 text-xs" key={item.eventId}>
                  <strong className="font-bold text-[#73584b]">{item.eventTitle || item.eventId}</strong>
                  <span className="text-[10px] text-[#a48879]">{item.reason}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

