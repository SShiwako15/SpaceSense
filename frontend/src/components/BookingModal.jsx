import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, Clock3, X } from '../icons.jsx';
import { api } from '../api';
import { durationHours, toApiTime, toLocalInput } from '../dates';
import { capacityText } from './shared';

const fieldClass = "grid min-w-0 gap-[7px]";
const labelClass = "text-[10px] font-extrabold text-[#5f747a]";
const inputClass =
  "h-[41px] min-w-0 w-full rounded-[7px] border border-[#e0e8e4] bg-white px-[11px] text-xs text-[#2a444b] placeholder:text-[#a3b0af] focus:border-[#5daf9f] focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#77c8b9]";
const buttonClass =
  "inline-flex min-h-[41px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent px-[15px] py-[9px] text-[11px] font-extrabold transition duration-150 enabled:cursor-pointer enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.58] focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#77c8b9] max-[540px]:flex-1";
const availabilityClasses = {
  checking: "bg-[#f0f4f2] text-[#657d7a]",
  available: "bg-[#e8f6ee] text-[#258572]",
  unavailable: "bg-[#fff0e9] text-[#ad654d]",
  invalid: "bg-[#fff0e9] text-[#ad654d]",
  error: "bg-[#fff0e9] text-[#ad654d]",
};

export function BookingModal({
  modal,
  resources,
  defaultWindow,
  suggestedAttendees,
  onClose,
  onSaved,
}) {
  const booking = modal.booking;
  const dialogRef = useRef(null);
  const [form, setForm] = useState(() => ({
    resourceId: String(booking?.resourceId ?? modal.resource?.id ?? ""),
    title: booking?.title || "",
    organizer: booking?.organizer || "",
    attendees: booking?.attendees || suggestedAttendees || 1,
    start: booking ? toLocalInput(booking.start) : defaultWindow.start,
    end: booking ? toLocalInput(booking.end) : defaultWindow.end,
  }));
  const [availability, setAvailability] = useState({
    state: "checking",
    conflicts: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedResource =
    resources.find((item) => String(item.id) === form.resourceId) ||
    modal.resource;
  const startIso = toApiTime(form.start);
  const endIso = toApiTime(form.end);
  const validWindow = Boolean(
    startIso &&
    endIso &&
    new Date(endIso) > new Date(startIso) &&
    durationHours(startIso, endIso) <= 12,
  );

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
        ) || [],
      );
    focusable()[0]?.focus();
    function handleKeys(event) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0].focus();
      }
    }
    document.addEventListener("keydown", handleKeys);
    return () => {
      document.removeEventListener("keydown", handleKeys);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (!form.resourceId || !validWindow) {
      setAvailability({ state: "invalid", conflicts: [] });
      return undefined;
    }
    let active = true;
    setAvailability({ state: "checking", conflicts: [] });
    api
      .availability(form.resourceId, startIso, endIso, booking?.id)
      .then((result) => {
        if (!active) return;
        setAvailability({
          state: result.available ? "available" : "unavailable",
          conflicts: result.conflicts || [],
        });
      })
      .catch((reason) => {
        if (active)
          setAvailability({
            state: "error",
            conflicts: [],
            message: reason.message,
          });
      });
    return () => {
      active = false;
    };
  }, [form.resourceId, startIso, endIso, booking?.id, validWindow]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (availability.state !== "available") return;
    if (Number(form.attendees) > Number(selectedResource?.capacity || 0)) {
      setError("The requested count exceeds this resource’s capacity.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        resourceId: form.resourceId,
        title: form.title.trim(),
        organizer: form.organizer.trim(),
        attendees: Number(form.attendees),
        start: startIso,
        end: endIso,
      };
      if (booking) await api.updateReservation(booking.id, payload);
      else await api.createReservation(payload);
      await onSaved(
        booking ? "Reservation updated." : "Reservation confirmed.",
      );
    } catch (reason) {
      setError(reason.message);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d2939a1] p-5 backdrop-blur-[4px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[min(94dvh,800px)] w-full max-w-[520px] overflow-auto rounded-2xl bg-white px-7 py-[25px] font-sans text-ink shadow-[0_28px_90px_#03192358] max-[540px]:px-[17px] max-[540px]:py-[23px]"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-heading"
      >
        <div className="flex items-start justify-between gap-[15px]">
          <div>
            <span className="inline-flex items-center gap-[5px] font-display text-[9px] font-extrabold tracking-[1.55px] text-[#228474] uppercase">
              RESERVATIONS
            </span>
            <h2
              id="booking-heading"
              className="mt-1.5 font-display text-[22px] font-bold tracking-[-0.6px]"
            >
              {booking ? "Edit reservation" : "Reserve a space"}
            </h2>
          </div>
          <button
            type="button"
            className="grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-[7px] border-0 bg-[#f4f7f5] text-[#66807f] transition-colors hover:bg-[#eaf0ed] focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#77c8b9]"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="mt-2 mb-[19px] text-[11px] leading-normal text-[#829296]">
          {booking
            ? "Change the details below. Availability is checked before you save."
            : "Choose the details for your campus gathering."}{" "}
          All times are Eastern campus time.
        </p>
        <form className="grid gap-[15px]" onSubmit={submit}>
          <label className={fieldClass}>
            <span className={labelClass}>Space</span>
            <select
              className={inputClass}
              value={form.resourceId}
              onChange={(event) => update("resourceId", event.target.value)}
              required
            >
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name} · {capacityText(resource)}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldClass}>
            <span className={labelClass}>Event name</span>
            <input
              className={inputClass}
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="e.g. Design seminar"
              maxLength={120}
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3 max-[540px]:grid-cols-1">
            <label className={fieldClass}>
              <span className={labelClass}>Organizer</span>
              <input
                className={inputClass}
                value={form.organizer}
                onChange={(event) => update("organizer", event.target.value)}
                placeholder="Your name or group"
                maxLength={100}
                required
              />
            </label>
            <label className={fieldClass}>
              <span className={labelClass}>
                {selectedResource?.type === "equipment" ? "Units" : "Attendees"}
              </span>
              <input
                className={inputClass}
                type="number"
                min="1"
                max={selectedResource?.capacity || undefined}
                value={form.attendees}
                onChange={(event) => update("attendees", event.target.value)}
                required
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 max-[540px]:grid-cols-1">
            <label className={fieldClass}>
              <span className={labelClass}>Starts</span>
              <input
                className={inputClass}
                type="datetime-local"
                value={form.start}
                onChange={(event) => update("start", event.target.value)}
                required
              />
            </label>
            <label className={fieldClass}>
              <span className={labelClass}>Ends</span>
              <input
                className={inputClass}
                type="datetime-local"
                value={form.end}
                onChange={(event) => update("end", event.target.value)}
                required
              />
            </label>
          </div>
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-[11px] text-[10px] leading-normal [&>svg]:shrink-0 ${availabilityClasses[availability.state]}`}
            role="status"
          >
            {availability.state === "available" ? (
              <CheckCircle2 size={18} />
            ) : availability.state === "checking" ? (
              <Clock3 size={18} />
            ) : (
              <CircleAlert size={18} />
            )}
            <span>
              {availability.state === "available"
                ? "This space is available for your selected time."
                : availability.state === "checking"
                  ? "Checking live availability…"
                  : availability.state === "unavailable"
                    ? "This space is booked during the selected time. Choose another time or space."
                    : availability.state === "invalid"
                      ? "Choose a valid time window of no more than 12 hours."
                      : availability.message ||
                        "Availability could not be checked."}
            </span>
          </div>
          {error && (
            <div
              className="flex items-center gap-[7px] rounded-lg bg-[#fff2ec] p-2.5 text-[11px] text-[#b85c45] [&>svg]:shrink-0"
              role="alert"
            >
              <CircleAlert size={16} /> {error}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-[#e9eeea] pt-[17px]">
            <button
              type="button"
              className={`${buttonClass} bg-[#f5f7f5] text-[#52656b] enabled:hover:bg-[#eaf0ed]`}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${buttonClass} bg-[#1d8374] text-white shadow-[0_4px_10px_#18807125] enabled:hover:bg-[#136d61] enabled:hover:shadow-[0_7px_16px_#18807130]`}
              disabled={busy || availability.state !== "available"}
            >
              {busy ? "Saving…" : booking ? "Save changes" : "Confirm booking"}{" "}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

