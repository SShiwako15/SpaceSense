import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Lightbulb,
  MapPin,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from "./icons.jsx";
import { api } from "./api";
import {
  dateRange,
  durationHours,
  formatDate,
  formatDateTime,
  formatTime,
  initialSearchTime,
  searchWindow,
  toApiTime,
  toDateInput,
  toLocalInput,
} from "./dates";

const fallbackFeatures = [
  "Projector",
  "Whiteboard",
  "Video conferencing",
  "Computers",
];
function addCalendarDays(value, offset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function mondayWeek(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return [];
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(date);
    current.setUTCDate(date.getUTCDate() + index);
    return current.toISOString().slice(0, 10);
  });
}

import { EmptyState, PanelTitle, ResourceCard, formatPercent } from './components/shared';
import { BookingModal } from './components/BookingModal';
import { AllocationResults, CustomEventImport, ForecastPanel } from './components/PlanningPanels';
import { ResourceManager } from './components/ResourceManager';
import { AuthScreen } from './components/AuthScreen';
import { AppHeader } from "./components/AppHeader";
import { BookingWorkspace } from "./components/BookingWorkspace";

function App() {
  const [tab, setTab] = useState("explore");
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [filters, setFilters] = useState(() => ({
    query: "",
    type: "",
    minCapacity: "",
    features: [],
    accessible: false,
    ...initialSearchTime(),
  }));
  const [favoriteIds, setFavoriteIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("spacesense-favorites") || "[]");
      return new Set(Array.isArray(saved) ? saved.map(String) : []);
    } catch {
      return new Set();
    }
  });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [bookingFilters, setBookingFilters] = useState({ query: "", status: "active", type: "", from: "", to: "" });
  const [bookingView, setBookingView] = useState("list");
  const [selectedWeekDate, setSelectedWeekDate] = useState(() => toDateInput(new Date()));
  const [weekReservations, setWeekReservations] = useState([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState("");
  const [appliedFilters, setAppliedFilters] = useState(null);
  const searchRequestId = useRef(0);
  const [resources, setResources] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [pendingApprovals, setPendingApprovals] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const [maintenanceWindows, setMaintenanceWindows] = useState(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState("");
  const [maintenanceForm, setMaintenanceForm] = useState(() => {
    const window = initialSearchTime();
    return { resourceId: "", start: `${window.date}T${window.startTime}`, end: `${window.date}T${window.endTime}`, reason: "" };
  });
  const [waitlistEntries, setWaitlistEntries] = useState(null);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistError, setWaitlistError] = useState("");
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({ resourceId: "", title: "", organizer: "", attendees: 1 });
  const [waitlistSubmitError, setWaitlistSubmitError] = useState("");
  const [searchLoading, setSearchLoading] = useState(true);
  const [searchError, setSearchError] = useState("");
  const [dataError, setDataError] = useState("");
  const [naturalPrompt, setNaturalPrompt] = useState("");
  const [naturalLoading, setNaturalLoading] = useState(false);
  const [interpretation, setInterpretation] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [utilization, setUtilization] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [sampleEvents, setSampleEvents] = useState([]);
  const [eventSource, setEventSource] = useState("sample");
  const [customEventsText, setCustomEventsText] = useState("");
  const [sampleLoading, setSampleLoading] = useState(false);
  const [allocation, setAllocation] = useState(null);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationError, setAllocationError] = useState("");

  const featureOptions = useMemo(() => {
    const fromApi = [
      ...new Set(allResources.flatMap((resource) => resource.features || [])),
    ];
    return fromApi.length ? fromApi.slice(0, 8) : fallbackFeatures;
  }, [allResources]);
  const typeOptions = useMemo(
    () => [
      ...new Set(allResources.map((resource) => resource.type).filter(Boolean)),
    ],
    [allResources],
  );
  const byId = useMemo(
    () =>
      new Map(allResources.map((resource) => [String(resource.id), resource])),
    [allResources],
  );
  const resultsFilters = appliedFilters || filters;
  const filtersChanged =
    appliedFilters &&
    JSON.stringify(filters) !== JSON.stringify(appliedFilters);
  const selectedWindow = useMemo(
    () => searchWindow(resultsFilters),
    [resultsFilters],
  );
  const windowIsValid = Boolean(
    selectedWindow.start &&
    selectedWindow.end &&
    new Date(selectedWindow.end) > new Date(selectedWindow.start),
  );
  const windowLabel = `${formatTime(selectedWindow.start)}–${formatTime(selectedWindow.end)}`;
  const defaultModalWindow = {
    start: `${resultsFilters.date}T${resultsFilters.startTime}`,
    end: `${resultsFilters.date}T${resultsFilters.endTime}`,
  };
  const upcomingCount = reservations.filter(
    (reservation) => new Date(reservation.end) >= new Date() && reservation.status !== "rejected",
  ).length;
  const visibleReservations = reservations;
  const displayedResources = favoritesOnly
    ? resources.filter((resource) => favoriteIds.has(String(resource.id)))
    : resources;
  const waitlistResources = allResources.filter((resource) => {
    const query = String(resultsFilters.query || "").trim().toLowerCase();
    const matchesType = !resultsFilters.type ||
      (resultsFilters.type === "room" ? resource.type !== "equipment" : resource.type === resultsFilters.type);
    const matchesQuery = !query || [resource.name, resource.type, resource.building, resource.description, ...(resource.features || [])]
      .some((value) => String(value || "").toLowerCase().includes(query));
    return matchesType && matchesQuery &&
      (!resultsFilters.minCapacity || resource.capacity >= Number(resultsFilters.minCapacity)) &&
      (!resultsFilters.accessible || resource.accessible) &&
      (resultsFilters.features || []).every((feature) =>
        (resource.features || []).some((item) => item.toLowerCase() === feature.toLowerCase()));
  });
  const weekDates = useMemo(() => mondayWeek(selectedWeekDate), [selectedWeekDate]);
  const matchesBookingFilters = (reservation) => {
    const resource = byId.get(String(reservation.resourceId));
    const query = bookingFilters.query.trim().toLowerCase();
    const date = toLocalInput(reservation.start).slice(0, 10);
    return (bookingFilters.status === "all" ||
      (bookingFilters.status === "active" ? reservation.status !== "rejected" : reservation.status === bookingFilters.status)) &&
      (!bookingFilters.type || resource?.type === bookingFilters.type) &&
      (!bookingFilters.from || date >= bookingFilters.from) &&
      (!bookingFilters.to || date <= bookingFilters.to) &&
      (!query || [reservation.title, reservation.organizer, resource?.name, resource?.building]
        .some((value) => String(value || "").toLowerCase().includes(query)));
  };
  const filteredReservations = visibleReservations.filter(matchesBookingFilters);
  const filteredWeekReservations = weekReservations.filter(matchesBookingFilters);
  const exportReservations = bookingView === "week" ? filteredWeekReservations : filteredReservations;

  const loadReservations = useCallback(async () => {
    const range = dateRange(30);
    const data = await api.reservations(range.from, range.to);
    setReservations(Array.isArray(data) ? data : []);
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotificationLoading(true);
    setNotificationError("");
    try {
      const result = await api.notifications();
      setNotifications(Array.isArray(result.notifications) ? result.notifications : []);
      setUnreadNotificationCount(Number(result.unreadCount) || 0);
    } catch (reason) {
      setNotificationError(reason.message);
    } finally {
      setNotificationLoading(false);
    }
  }, []);

  const loadWeekReservations = useCallback(async (startDate, endDate) => {
    setWeekLoading(true);
    setWeekError("");
    try {
      const result = await api.reservations(
        toApiTime(`${startDate}T00:00`),
        toApiTime(`${endDate}T00:00`),
      );
      setWeekReservations(Array.isArray(result) ? result : []);
    } catch (reason) {
      setWeekError(reason.message);
      setWeekReservations([]);
    } finally {
      setWeekLoading(false);
    }
  }, []);

  const refreshWeekReservations = useCallback(() => {
    if (bookingView !== "week" || weekDates.length !== 7) return Promise.resolve();
    return loadWeekReservations(weekDates[0], addCalendarDays(weekDates[6], 1));
  }, [bookingView, weekDates, loadWeekReservations]);

  const loadApprovals = useCallback(async () => {
    if (authUser?.role !== "Admin") return;
    setApprovalLoading(true);
    setApprovalError("");
    try {
      const data = await api.reservations(undefined, undefined, "pending");
      setPendingApprovals(Array.isArray(data) ? data : []);
    } catch (reason) {
      setApprovalError(reason.message);
    } finally {
      setApprovalLoading(false);
    }
  }, [authUser?.role]);

  const loadMaintenance = useCallback(async () => {
    if (authUser?.role !== "Admin") return;
    setMaintenanceLoading(true);
    setMaintenanceError("");
    try {
      const data = await api.maintenance();
      setMaintenanceWindows(Array.isArray(data) ? data : []);
    } catch (reason) {
      setMaintenanceError(reason.message);
    } finally {
      setMaintenanceLoading(false);
    }
  }, [authUser?.role]);

  const loadWaitlist = useCallback(async () => {
    if (authUser?.role !== "Admin") return;
    setWaitlistLoading(true);
    setWaitlistError("");
    try {
      const data = await api.waitlist();
      setWaitlistEntries(Array.isArray(data) ? data : []);
    } catch (reason) {
      setWaitlistError(reason.message);
    } finally {
      setWaitlistLoading(false);
    }
  }, [authUser?.role]);

  const loadStats = useCallback(async () => {
    if (authUser?.role !== "Admin") return;
    setStatsLoading(true);
    try {
      const range = dateRange(7);
      setUtilization(await api.utilization(range.from, range.to));
    } catch (reason) {
      setUtilization({ error: reason.message });
    } finally {
      setStatsLoading(false);
    }
  }, [authUser?.role]);

  const loadForecast = useCallback(async () => {
    if (authUser?.role !== "Admin") return;
    setForecastLoading(true);
    try {
      setForecast(await api.forecast(14));
    } catch (reason) {
      setForecast({ error: reason.message });
    } finally {
      setForecastLoading(false);
    }
  }, [authUser?.role]);

  const runSearch = useCallback(async (nextFilters) => {
    const requestId = ++searchRequestId.current;
    const selected = searchWindow(nextFilters);
    if (
      !selected.start ||
      !selected.end ||
      new Date(selected.end) <= new Date(selected.start)
    ) {
      setSearchError(
        "Choose a valid end time after the start time. Times use the campus time zone.",
      );
      setResources([]);
      setAppliedFilters(null);
      setSearchLoading(false);
      setInterpretation(null);
      return;
    }
    setSearchLoading(true);
    setSearchError("");
    setInterpretation(null);
    try {
      const result = await api.resources({
        query: nextFilters.query.trim(),
        type: nextFilters.type,
        minCapacity: nextFilters.minCapacity,
        features: nextFilters.features,
        accessible: nextFilters.accessible ? true : undefined,
        ...selected,
      });
      if (requestId !== searchRequestId.current) return;
      setResources(Array.isArray(result) ? result : []);
      setAppliedFilters({
        ...nextFilters,
        features: [...nextFilters.features],
      });
    } catch (reason) {
      if (requestId !== searchRequestId.current) return;
      setSearchError(reason.message);
      setResources([]);
      setAppliedFilters(null);
    } finally {
      if (requestId === searchRequestId.current) setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.me().then((user) => {
      if (active) setAuthUser(user);
    }).catch(() => {
      if (active) setAuthUser(null);
    }).finally(() => {
      if (active) setAuthLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authUser) return;
    runSearch(filters);
    api
      .resources()
      .then((data) => setAllResources(Array.isArray(data) ? data : []))
      .catch((reason) => setDataError(reason.message));
    loadReservations().catch((reason) => setDataError(reason.message));
    loadNotifications();
    // Initial loading uses the authenticated user's first filter values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  useEffect(() => {
    if (tab !== "operations" || authUser?.role !== "Admin") return;
    if (!utilization) loadStats();
    if (!forecast) loadForecast();
    if (!pendingApprovals) loadApprovals();
    if (!maintenanceWindows) loadMaintenance();
    if (!waitlistEntries) loadWaitlist();
  }, [tab, authUser, utilization, forecast, pendingApprovals, maintenanceWindows, waitlistEntries, loadStats, loadForecast, loadApprovals, loadMaintenance, loadWaitlist]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    try { localStorage.setItem("spacesense-favorites", JSON.stringify([...favoriteIds])); }
    catch { /* Favorites remain available for this session if storage is disabled. */ }
  }, [favoriteIds]);

  useEffect(() => {
    if (tab !== "bookings" || bookingView !== "week" || weekDates.length !== 7) return;
    loadWeekReservations(weekDates[0], addCalendarDays(weekDates[6], 1));
  }, [tab, bookingView, weekDates, loadWeekReservations]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function toggleFeature(feature) {
    setFilters((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((item) => item !== feature)
        : [...current.features, feature],
    }));
  }

  async function handleNaturalSearch(event) {
    event.preventDefault();
    const prompt = naturalPrompt.trim();
    if (!prompt) return;
    const requestId = ++searchRequestId.current;
    setNaturalLoading(true);
    setSearchLoading(true);
    setSearchError("");
    try {
      const result = await api.naturalSearch(prompt);
      if (requestId !== searchRequestId.current) return;
      const parsed = result.interpretation || {};
      const nextFilters = {
        ...filters,
        query: parsed.query ?? "",
        type: parsed.type ?? "",
        minCapacity: parsed.minCapacity ?? "",
        features: Array.isArray(parsed.features) ? parsed.features : [],
        accessible: Boolean(parsed.accessible),
        date: parsed.start
          ? toLocalInput(parsed.start).slice(0, 10)
          : filters.date,
        startTime: parsed.start
          ? toLocalInput(parsed.start).slice(11, 16)
          : filters.startTime,
        endTime: parsed.end
          ? toLocalInput(parsed.end).slice(11, 16)
          : filters.endTime,
      };
      const selected = searchWindow(nextFilters);
      if (
        !selected.start ||
        !selected.end ||
        new Date(selected.end) <= new Date(selected.start)
      )
        throw new Error(
          "The request produced an invalid time window. Try a more specific date and time.",
        );
      const available = await api.resources({
        query: nextFilters.query.trim(),
        type: nextFilters.type,
        minCapacity: nextFilters.minCapacity,
        features: nextFilters.features,
        accessible: nextFilters.accessible ? true : undefined,
        ...selected,
      });
      if (requestId !== searchRequestId.current) return;
      setFilters(nextFilters);
      setResources(Array.isArray(available) ? available : []);
      setAppliedFilters(nextFilters);
      setInterpretation({
        explanation: result.explanation,
        source: result.source,
        parsed,
      });
      setTab("explore");
    } catch (reason) {
      if (requestId === searchRequestId.current) {
        setSearchError(reason.message);
        setResources([]);
        setAppliedFilters(null);
      }
    } finally {
      setNaturalLoading(false);
      if (requestId === searchRequestId.current) setSearchLoading(false);
    }
  }

  async function markNotificationRead(notification) {
    if (notification.isRead) return;
    try {
      await api.markNotificationRead(notification.id);
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
      setUnreadNotificationCount((count) => Math.max(0, count - 1));
    } catch (reason) {
      setNotificationError(reason.message);
    }
  }

  async function claimWaitlistNotification(notification) {
    try {
      const reservation = await api.claimWaitlistRequest(notification.waitlistId);
      setToast(reservation.status === "pending" ? "The opening was claimed and sent for approval." : "The waitlisted slot is booked.");
      setAllocation(null);
      setTab("bookings");
      await Promise.allSettled([
        loadReservations(),
        loadNotifications(),
        loadApprovals(),
        loadStats(),
        loadForecast(),
        loadWaitlist(),
      ]);
    } catch (reason) {
      setNotificationError(reason.message);
    }
  }

  function toggleFavorite(resourceId) {
    const id = String(resourceId);
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportReservationsCsv() {
    const rows = [
      ["Date", "Start", "End", "Title", "Resource", "Building", "Organizer", "Attendees or units", "Status", "Series ID"],
      ...exportReservations.map((reservation) => {
        const resource = byId.get(String(reservation.resourceId));
        return [
          toLocalInput(reservation.start).slice(0, 10),
          formatTime(reservation.start),
          formatTime(reservation.end),
          reservation.title,
          resource?.name || reservation.resourceId,
          resource?.building || "",
          reservation.organizer,
          reservation.attendees,
          reservation.status,
          reservation.seriesId || "",
        ];
      }),
    ];
    const csv = rows.map((row) => row.map((value) => {
      let text = String(value ?? "");
      if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `spacesense-reservations-${toDateInput(new Date())}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function markAllNotificationsRead() {
    try {
      await api.markAllNotificationsRead();
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
      setUnreadNotificationCount(0);
    } catch (reason) {
      setNotificationError(reason.message);
    }
  }

  async function afterSave(message) {
    setModal(null);
    setToast(message);
    setAllocation(null);
    await Promise.allSettled([
      runSearch(resultsFilters),
      loadReservations(),
      refreshWeekReservations(),
      loadNotifications(),
      loadApprovals(),
      loadStats(),
      loadForecast(),
    ]);
  }

  async function cancelReservation(reservation) {
    if (
      !globalThis.confirm(
        `Cancel “${reservation.title}”? This will release the space.`,
      )
    )
      return;
    try {
      await api.cancelReservation(reservation.id);
      setToast("Reservation cancelled.");
      setAllocation(null);
      await Promise.allSettled([
        runSearch(resultsFilters),
        loadReservations(),
        refreshWeekReservations(),
        loadNotifications(),
        loadApprovals(),
        loadStats(),
        loadForecast(),
      ]);
    } catch (reason) {
      setToast(`Could not cancel reservation: ${reason.message}`);
    }
  }

  async function decideApproval(reservation, decision) {
    try {
      if (decision === "approve") await api.approveReservation(reservation.id);
      else await api.rejectReservation(reservation.id);
      setToast(decision === "approve" ? "Reservation approved." : "Reservation declined.");
      setAllocation(null);
      await Promise.allSettled([
        loadApprovals(),
        loadNotifications(),
        loadReservations(),
        refreshWeekReservations(),
        runSearch(resultsFilters),
        loadStats(),
        loadForecast(),
      ]);
    } catch (reason) {
      setApprovalError(reason.message);
    }
  }

  async function createMaintenanceWindow(event) {
    event.preventDefault();
    const start = toApiTime(maintenanceForm.start);
    const end = toApiTime(maintenanceForm.end);
    if (!start || !end || new Date(end) <= new Date(start)) {
      setMaintenanceError("Choose a valid end time after the start time.");
      return;
    }
    try {
      await api.createMaintenance({
        resourceId: maintenanceForm.resourceId,
        start,
        end,
        reason: maintenanceForm.reason.trim(),
      });
      setMaintenanceForm((current) => ({ ...current, reason: "" }));
      setToast("Maintenance window scheduled.");
      setAllocation(null);
      await Promise.allSettled([
        loadMaintenance(),
        runSearch(resultsFilters),
        refreshWeekReservations(),
        loadStats(),
        loadForecast(),
      ]);
    } catch (reason) {
      setMaintenanceError(reason.message);
    }
  }

  async function removeMaintenanceWindow(window) {
    try {
      await api.deleteMaintenance(window.id);
      setToast("Maintenance window removed.");
      setAllocation(null);
      await Promise.allSettled([
        loadMaintenance(),
        runSearch(resultsFilters),
        refreshWeekReservations(),
        loadStats(),
        loadForecast(),
        loadWaitlist(),
        loadNotifications(),
      ]);
    } catch (reason) {
      setMaintenanceError(reason.message);
    }
  }

  async function joinWaitlist(event) {
    event.preventDefault();
    setWaitlistSubmitting(true);
    setWaitlistSubmitError("");
    try {
      const result = await api.createWaitlistRequest({
        ...waitlistForm,
        attendees: Number(waitlistForm.attendees),
        start: selectedWindow.start,
        end: selectedWindow.end,
      });
      setToast(result.duplicate ? "You are already on the waitlist for this slot." : "Added to the waitlist. We’ll notify you if it opens.");
      setWaitlistOpen(false);
      setWaitlistForm({ resourceId: "", title: "", organizer: "", attendees: Number(resultsFilters.minCapacity) || 1 });
    } catch (reason) {
      setWaitlistSubmitError(reason.message);
    } finally {
      setWaitlistSubmitting(false);
    }
  }

  async function removeWaitlistEntry(entry) {
    try {
      await api.deleteWaitlistRequest(entry.id);
      await loadWaitlist();
    } catch (reason) {
      setWaitlistError(reason.message);
    }
  }

  async function cancelReservationSeries(reservation) {
    if (!reservation.seriesId) return;
    if (!globalThis.confirm(`Cancel the entire weekly series for “${reservation.title}”?`)) return;
    try {
      await api.cancelReservationSeries(reservation.seriesId);
      setToast("Weekly reservation series cancelled.");
      setAllocation(null);
      await Promise.allSettled([
        runSearch(resultsFilters),
        loadReservations(),
        refreshWeekReservations(),
        loadNotifications(),
        loadApprovals(),
        loadStats(),
        loadForecast(),
      ]);
    } catch (reason) {
      setToast(`Could not cancel reservation series: ${reason.message}`);
    }
  }

  async function loadSample() {
    setSampleLoading(true);
    setAllocationError("");
    try {
      const data = await api.allocationSample();
      const events = Array.isArray(data) ? data : data.events;
      if (!Array.isArray(events) || !events.length)
        throw new Error("No example events were returned.");
      setSampleEvents(events);
      setEventSource("sample");
      setAllocation(null);
      return events;
    } catch (reason) {
      setAllocationError(reason.message);
      return null;
    } finally {
      setSampleLoading(false);
    }
  }

  async function solveSample() {
    setAllocationLoading(true);
    setAllocationError("");
    try {
      const events = sampleEvents.length ? sampleEvents : await loadSample();
      if (!events) return;
      const result = await api.solveAllocation(events);
      setAllocation(result);
    } catch (reason) {
      setAllocationError(reason.message);
    } finally {
      setAllocationLoading(false);
    }
  }

  function importEvents() {
    setAllocationError("");
    try {
      const parsed = JSON.parse(customEventsText);
      const events = Array.isArray(parsed) ? parsed : parsed.events;
      if (!Array.isArray(events) || !events.length)
        throw new Error(
          "Paste a non-empty JSON array of events, or an object with an events array.",
        );
      const ids = new Set();
      events.forEach((event, index) => {
        if (!event || typeof event !== "object")
          throw new Error(`Event ${index + 1} must be an object.`);
        if (!event.id || !event.title)
          throw new Error(`Event ${index + 1} needs an id and title.`);
        if (ids.has(String(event.id)))
          throw new Error(`Event id ${event.id} is repeated.`);
        ids.add(String(event.id));
        if (
          !event.start ||
          !event.end ||
          Number.isNaN(new Date(event.start).getTime()) ||
          Number.isNaN(new Date(event.end).getTime()) ||
          new Date(event.end) <= new Date(event.start)
        )
          throw new Error(
            `Event ${index + 1} needs valid start and end timestamps.`,
          );
        if (!Number.isInteger(event.attendees) || event.attendees < 1)
          throw new Error(
            `Event ${index + 1} needs a positive integer attendee count.`,
          );
        if (
          !Array.isArray(event.requiredFeatures) ||
          !event.requiredFeatures.every(
            (feature) => typeof feature === "string",
          )
        )
          throw new Error(
            `Event ${index + 1} needs a requiredFeatures string array (use [] if none).`,
          );
        if (typeof event.accessible !== "boolean")
          throw new Error(
            `Event ${index + 1} needs accessible: true or false.`,
          );
        if (
          !Number.isInteger(event.priority) ||
          event.priority < 1 ||
          event.priority > 5
        )
          throw new Error(`Event ${index + 1} needs priority from 1 to 5.`);
      });
      setSampleEvents(events);
      setEventSource("custom");
      setAllocation(null);
      setToast(`${events.length} custom events loaded.`);
    } catch (reason) {
      setAllocationError(
        reason instanceof SyntaxError
          ? `Invalid JSON: ${reason.message}`
          : reason.message,
      );
    }
  }

  function navigate(nextTab) {
    if (nextTab === "operations" && authUser?.role !== "Admin") return;
    setTab(nextTab);
    setMobileNav(false);
    if (nextTab === "notifications") loadNotifications();
  }

  function resetSearch() {
    const reset = { query: "", type: "", minCapacity: "", features: [], accessible: false, ...initialSearchTime() };
    setFilters(reset);
    setInterpretation(null);
    setFavoritesOnly(false);
    runSearch(reset);
  }

  function browse(equipment) {
    navigate("explore");
    const type = equipment ? "equipment" : "";
    if (filters.type === "equipment" || equipment) {
      const next = { ...filters, type, query: "", minCapacity: "", features: [], accessible: false };
      setFilters(next);
      setInterpretation(null);
      setFavoritesOnly(false);
      runSearch(next);
    }
  }

  const closeModal = useCallback(() => setModal(null), []);

  function onAuthenticated(user) {
    setTab("explore");
    setAuthUser(user);
  }

  async function signOut() {
    try { await api.logout(); }
    finally {
      setAuthUser(null);
      setTab("explore");
      setNotifications([]);
      setReservations([]);
      setPendingApprovals(null);
      setMaintenanceWindows(null);
      setWaitlistEntries(null);
      setUtilization(null);
      setForecast(null);
      setAllocation(null);
      setAllResources([]);
      setResources([]);
      setDataError("");
      setApprovalError("");
      setMaintenanceError("");
      setWaitlistError("");
    }
  }

  if (authLoading) return <div className="grid min-h-screen place-items-center bg-[#f2f6f3] text-sm text-muted">Checking your account…</div>;
  if (!authUser) return <AuthScreen onAuthenticated={onAuthenticated} />;

  return (
    <div className="app-shell">
      <AppHeader tab={tab} authUser={authUser} mobileNav={mobileNav} setMobileNav={setMobileNav} navigate={navigate} upcomingCount={upcomingCount} unreadNotificationCount={unreadNotificationCount} equipmentOnly={filters.type === "equipment"} browse={browse} signOut={signOut} />
      <main id="main-content" className="app-content" tabIndex={-1}>
        {dataError && (
          <div className="flex items-center gap-2 border-b border-[#f1d2c8] bg-[#fff5f1] px-10 py-2.5 text-[14px] text-[#a45140] max-[900px]:px-5" role="alert">
            <CircleAlert size={18} /> {dataError}{" "}
            <button
              type="button"
              onClick={() => {
                setDataError("");
                api
                  .resources()
                  .then(setAllResources)
                  .catch((reason) => setDataError(reason.message));
                loadReservations().catch((reason) =>
                  setDataError(reason.message),
                );
              }}
            >
              Retry
            </button>
          </div>
        )}

        {tab === "explore" && (
          <div className="page-content explore-page">
            <BookingWorkspace filters={filters} updateFilter={updateFilter} runSearch={runSearch} typeOptions={typeOptions} featureOptions={featureOptions} toggleFeature={toggleFeature} naturalPrompt={naturalPrompt} setNaturalPrompt={setNaturalPrompt} naturalLoading={naturalLoading} handleNaturalSearch={handleNaturalSearch} interpretation={interpretation} setInterpretation={setInterpretation} searchLoading={searchLoading} filtersChanged={filtersChanged} resetFilters={resetSearch} />
            <section className="mt-8">
              <PanelTitle
                eyebrow="MAKE ROOM FOR WHAT MATTERS"
                title="Available spaces"
                description={
                  windowIsValid
                    ? `${formatDate(selectedWindow.start, { weekday: "long", month: "long", day: "numeric" })} · ${windowLabel} Eastern · ${filtersChanged ? "Results from your last search" : "Availability at last search"}`
                    : "Choose a valid time to see available spaces."
                }
                action={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[12px] font-bold ${favoritesOnly ? "border-[#e8c99f] bg-[#fff8ed] text-[#9d6d31]" : "border-line bg-white text-muted"}`}
                      onClick={() => setFavoritesOnly((value) => !value)}
                      aria-pressed={favoritesOnly}
                    >
                      <Star size={13} fill={favoritesOnly ? "currentColor" : "none"} /> Saved spaces ({favoriteIds.size})
                    </button>
                    <span className="text-[14px] text-muted">{displayedResources.length} {displayedResources.length === 1 ? "space" : "spaces"} found</span>
                  </div>
                }
              />
              {searchError && (
                <div className="mt-3 rounded-lg bg-[#fff2ec] p-2.5 text-[14px] text-[#b85c45]" role="alert">
                  <CircleAlert size={17} /> {searchError}
                </div>
              )}
              {searchLoading ? (
                <div className="resource-list">
                  {[1, 2, 3].map((item) => (
                    <div className="resource-skeleton animate-pulse" key={item}>
                      <div />
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              ) : displayedResources.length ? (
                <div className="resource-list">
                  {displayedResources.map((resource) => (
                    <ResourceCard
                      key={resource.id}
                      resource={resource}
                      windowLabel={windowLabel}
                      onBook={(selected) => setModal({ resource: selected })}
                      isFavorite={favoriteIds.has(String(resource.id))}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              ) : (
                !searchError && (
                  <EmptyState
                    icon={Search}
                    title={favoritesOnly && resources.length ? "No saved spaces match this search" : "No spaces match this search"}
                    description={favoritesOnly && resources.length ? "Save a resource with the star button, or turn off the saved spaces filter." : "Try a different time, a smaller group, or fewer feature filters."}
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          className="inline-flex items-center justify-center gap-2 rounded-lg border-0 px-4 py-2.5 text-[14px] font-extrabold border border-[#cbdcd5] bg-white text-teal hover:bg-[#edf7f2]"
                          type="button"
                          onClick={resetSearch}
                        >Reset filters <ArrowRight size={16} /></button>
                        <button className="inline-flex items-center justify-center gap-2 rounded-lg border-0 bg-[#07354e] px-4 py-2.5 text-[14px] font-extrabold text-white" type="button" onClick={() => { setWaitlistOpen((open) => !open); setWaitlistSubmitError(""); }}>Join the waitlist <ArrowRight size={16} /></button>
                      </div>
                    }
                  />
                )
              )}
              {!searchLoading && !resources.length && !searchError && waitlistOpen && (
                <form className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[#d7e8df] bg-[#f5faf7] p-4 max-[600px]:grid-cols-1" onSubmit={joinWaitlist}>
                  <div className="col-span-full">
                    <h3 className="m-0 text-sm font-bold text-ink">Waitlist for {formatDate(selectedWindow.start, { weekday: "long", month: "short", day: "numeric" })}, {windowLabel}</h3>
                    <p className="mt-1 text-[13px] text-muted">We’ll add your request to the selected resource and notify you when the slot may have opened.</p>
                  </div>
                  <label className="grid gap-1 text-[12px] font-bold text-[#587079]">
                    <span>Resource matching your requirements</span>
                    <select className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px]" value={waitlistForm.resourceId} onChange={(event) => setWaitlistForm((current) => ({ ...current, resourceId: event.target.value }))} required>
                      <option value="">Choose a resource</option>{waitlistResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} · {resource.capacity} capacity</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[12px] font-bold text-[#587079]"><span>Event name</span><input className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px]" value={waitlistForm.title} onChange={(event) => setWaitlistForm((current) => ({ ...current, title: event.target.value }))} maxLength={120} required /></label>
                  <label className="grid gap-1 text-[12px] font-bold text-[#587079]"><span>Organizer</span><input className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px]" value={waitlistForm.organizer} onChange={(event) => setWaitlistForm((current) => ({ ...current, organizer: event.target.value }))} maxLength={120} required /></label>
                  <label className="grid gap-1 text-[12px] font-bold text-[#587079]"><span>{waitlistResources.find((resource) => resource.id === waitlistForm.resourceId)?.type === "equipment" ? "Units" : "Attendees"}</span><input className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px]" type="number" min="1" max={waitlistResources.find((resource) => resource.id === waitlistForm.resourceId)?.capacity || undefined} value={waitlistForm.attendees} onChange={(event) => setWaitlistForm((current) => ({ ...current, attendees: event.target.value }))} required /></label>
                  {waitlistSubmitError && <div className="col-span-full rounded-lg bg-[#fff2ec] p-2 text-[13px] text-[#b85c45]" role="alert">{waitlistSubmitError}</div>}
                  <div className="col-span-full flex justify-end"><button className="rounded-md border-0 bg-[#07354e] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50" type="submit" disabled={waitlistSubmitting || !waitlistResources.length}>{waitlistSubmitting ? "Adding…" : "Join waitlist"}</button></div>
                </form>
              )}
            </section>
          </div>
        )}

        {tab === "bookings" && (
          <div className="page-content bookings-page">
            <div className="mb-6 flex items-end justify-between gap-5 max-[600px]:items-start max-[600px]:flex-col">
              <div>
                <span className="inline-flex items-center gap-[5px] font-display text-[12px] font-extrabold tracking-[1.55px] text-[#228474] uppercase">CAMPUS SCHEDULE</span>
                <h1 className="m-0 font-display text-[34px] font-extrabold leading-[1.08] tracking-[-1.2px] text-ink max-[540px]:text-[28px]">Reservations</h1>
                <p>
                  Keep every gathering on track. Review, update, or release
                  booked spaces.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border-0 px-4 py-2.5 text-[14px] font-extrabold bg-[#07354e] text-white hover:bg-[#104a65]"
                onClick={() => navigate("explore")}
              >
                <Plus size={17} /> New reservation
              </button>
            </div>
            <div className="booking-summary mb-5 grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
              <div>
                <CalendarDays size={20} />
                <span>
                  <strong>{upcomingCount} upcoming</strong>
                  <small>Over the next 30 days</small>
                </span>
              </div>
              <div>
                <ShieldCheck size={20} />
                <span>
                  <strong>Conflict checks built in</strong>
                  <small>Availability is checked again before saving</small>
                </span>
              </div>
            </div>
            <section className="mb-5 rounded-[13px] border border-line bg-white p-4">
              <div className="grid grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(120px,1fr))] gap-3 max-[900px]:grid-cols-2 max-[540px]:grid-cols-1">
                <label className="grid gap-1 text-[12px] font-bold text-[#587079]">
                  <span>Search reservations</span>
                  <input className="rounded-md border border-line px-2.5 py-2 text-[13px]" value={bookingFilters.query} onChange={(event) => setBookingFilters((value) => ({ ...value, query: event.target.value }))} placeholder="Title, organizer, or room" />
                </label>
                <label className="grid gap-1 text-[12px] font-bold text-[#587079]">
                  <span>Status</span>
                  <select className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px]" value={bookingFilters.status} onChange={(event) => setBookingFilters((value) => ({ ...value, status: event.target.value }))}>
                    <option value="active">Active bookings</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="rejected">Declined</option><option value="all">All statuses</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[12px] font-bold text-[#587079]">
                  <span>Resource type</span>
                  <select className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px]" value={bookingFilters.type} onChange={(event) => setBookingFilters((value) => ({ ...value, type: event.target.value }))}>
                    <option value="">All types</option>{typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-[12px] font-bold text-[#587079]">
                  <span>From date</span>
                  <input className="rounded-md border border-line px-2.5 py-2 text-[13px]" type="date" value={bookingFilters.from} onChange={(event) => setBookingFilters((value) => ({ ...value, from: event.target.value }))} />
                </label>
                <label className="grid gap-1 text-[12px] font-bold text-[#587079]">
                  <span>Through date</span>
                  <input className="rounded-md border border-line px-2.5 py-2 text-[13px]" type="date" value={bookingFilters.to} onChange={(event) => setBookingFilters((value) => ({ ...value, to: event.target.value }))} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#edf1ef] pt-3">
                <div className="flex gap-1 rounded-lg bg-[#f2f6f3] p-1" role="group" aria-label="Reservation view">
                  <button type="button" className={`rounded-md px-3 py-1.5 text-[12px] font-bold ${bookingView === "list" ? "bg-white text-teal shadow-sm" : "text-muted"}`} onClick={() => setBookingView("list")}>List</button>
                  <button type="button" className={`rounded-md px-3 py-1.5 text-[12px] font-bold ${bookingView === "week" ? "bg-white text-teal shadow-sm" : "text-muted"}`} onClick={() => setBookingView("week")}>Week calendar</button>
                </div>
                <div className="flex items-center gap-3 text-[13px] text-muted">
                  <span>{exportReservations.length} reservations</span>
                  <button type="button" className="border-0 bg-transparent text-[12px] font-bold text-muted underline" onClick={() => setBookingFilters({ query: "", status: "active", type: "", from: "", to: "" })}>Clear filters</button>
                  <button type="button" className="rounded-md border-0 bg-[#07354e] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50" onClick={exportReservationsCsv} disabled={!exportReservations.length}>Export CSV</button>
                </div>
              </div>
            </section>
            <section className="rounded-[15px] border border-line bg-white p-6">
              <PanelTitle
                eyebrow="CAMPUS CALENDAR"
                title={bookingView === "week" ? "Weekly reservation calendar" : "Upcoming reservations"}
                description={bookingView === "week" ? "Select any week to review bookings by day." : authUser.role === "Admin" ? "Campus reservations and requests for the next 30 days." : "Your reservations and requests for the next 30 days."}
                action={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-bold text-teal"
                    onClick={() => bookingView === "week"
                      ? loadWeekReservations(weekDates[0], addCalendarDays(weekDates[6], 1))
                      : loadReservations().catch((reason) => setDataError(reason.message))}
                  >
                    Refresh <ArrowRight size={15} />
                  </button>
                }
              />
              {bookingView === "week" ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button type="button" className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px] font-bold text-teal" onClick={() => setSelectedWeekDate(addCalendarDays(weekDates[0], -7))} aria-label="Previous week">← Previous</button>
                      <button type="button" className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px] font-bold text-teal" onClick={() => setSelectedWeekDate(addCalendarDays(weekDates[0], 7))} aria-label="Next week">Next →</button>
                    </div>
                    <label className="flex items-center gap-2 text-[12px] font-bold text-[#587079]">Choose a date<input className="rounded-md border border-line px-2 py-1.5 text-[13px]" type="date" value={selectedWeekDate} onChange={(event) => { if (event.target.value) setSelectedWeekDate(event.target.value); }} /></label>
                  </div>
                  {weekError && <div className="mb-3 rounded-lg bg-[#fff2ec] p-2.5 text-[13px] text-[#b85c45]" role="alert">{weekError}</div>}
                  {weekLoading ? <p className="py-8 text-center text-sm text-muted" role="status">Loading weekly schedule…</p> : (
                    <div className="overflow-x-auto rounded-lg border border-line">
                      <div className="grid min-w-[980px] grid-cols-7 divide-x divide-[#e8eeea]">
                        {weekDates.map((date) => {
                          const dayReservations = filteredWeekReservations.filter((item) => toLocalInput(item.start).slice(0, 10) === date);
                          return (
                            <section key={date} className="min-h-[300px] bg-[#fbfdfb] p-2">
                              <h3 className="mb-2 border-b border-[#e8eeea] pb-2 text-center text-[13px] font-bold text-ink">{formatDate(`${date}T12:00:00Z`, { weekday: "short", month: "short", day: "numeric" })}</h3>
                              <div className="grid gap-1.5">
                                {dayReservations.map((reservation) => {
                                  const resource = byId.get(String(reservation.resourceId));
                                  return <button key={reservation.id} type="button" className={`grid gap-1 rounded-md border p-2 text-left ${reservation.status === "pending" ? "border-[#eed9b9] bg-[#fff8ed]" : "border-[#cfe6dc] bg-[#eff8f3]"}`} onClick={() => setModal({ booking: reservation, resource })}>
                                    <span className="text-[11px] font-bold text-teal">{formatTime(reservation.start)}–{formatTime(reservation.end)}</span>
                                    <strong className="line-clamp-2 text-[12px] text-ink">{reservation.title}</strong>
                                    <span className="line-clamp-2 text-[11px] text-muted">{resource?.name || "Campus resource"}</span>
                                    <span className="text-[11px] font-bold uppercase text-muted">{reservation.status}</span>
                                  </button>;
                                })}
                                {!dayReservations.length && <p className="py-4 text-center text-[11px] text-[#9aabaa]">No bookings</p>}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : filteredReservations.length ? (
                <div className="grid gap-2">
                  {[...filteredReservations]
                    .sort((a, b) => new Date(a.start) - new Date(b.start))
                    .map((reservation) => {
                      const resource = byId.get(String(reservation.resourceId));
                      const day = formatDate(reservation.start, {
                        day: "2-digit",
                      });
                      const month = formatDate(reservation.start, {
                        month: "short",
                      });
                      return (
                        <article className="reservation-row grid grid-cols-[55px_minmax(0,1fr)_180px_145px] items-center gap-4 border-b border-[#edf1ef] py-4 max-[800px]:grid-cols-[50px_minmax(0,1fr)_auto] max-[600px]:grid-cols-[48px_1fr]" key={reservation.id}>
                          <div className="grid place-items-center rounded-[10px] bg-[#edf7f2] py-2 text-teal">
                            <strong>{day}</strong>
                            <span>{month}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="m-0 min-w-0 truncate font-display text-[14px] font-bold text-ink">{reservation.title}</h3>
                              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold ${reservation.status === "pending" ? "bg-[#fff3e3] text-[#9b7042]" : reservation.status === "rejected" ? "bg-[#fff0e9] text-[#ad654d]" : "bg-[#e9f6ef] text-[#32856f]"}`}>
                                {reservation.status || "confirmed"}
                              </span>
                              {reservation.seriesId && <span className="rounded-md bg-[#edf2fb] px-1.5 py-1 text-[11px] font-bold text-[#6279a2]">weekly</span>}
                            </div>
                            <p>
                              <MapPin size={14} />{" "}
                              {resource?.name || "Campus resource"}{" "}
                              <span className="text-[#bac7c2]">·</span>{" "}
                              {resource?.building || "Campus"}
                            </p>
                          </div>
                          <div className="grid gap-1 text-[13px] text-muted max-[600px]:col-start-2">
                            <span>
                              <Clock3 size={15} />{" "}
                              {formatTime(reservation.start)}–
                              {formatTime(reservation.end)}
                            </span>
                            <span>
                              <Users size={15} /> {reservation.attendees}{" "}
                              attendees
                            </span>
                          </div>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              title="Edit reservation"
                              aria-label={`Edit ${reservation.title}`}
                              onClick={() =>
                                setModal({ booking: reservation, resource })
                              }
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              type="button"
                              title="Cancel reservation"
                              aria-label={`Cancel ${reservation.title}`}
                              onClick={() => cancelReservation(reservation)}
                            >
                              <Trash2 size={17} />
                            </button>
                            {reservation.seriesId && (
                              <button
                                type="button"
                                title="Edit upcoming occurrences in this series"
                                aria-label={`Edit weekly series for ${reservation.title}`}
                                onClick={() => setModal({ booking: reservation, resource, seriesId: reservation.seriesId })}
                              >
                                <CalendarDays size={16} />
                              </button>
                            )}
                            {reservation.seriesId && (
                              <button
                                type="button"
                                title="Cancel entire weekly series"
                                aria-label={`Cancel entire weekly series for ${reservation.title}`}
                                onClick={() => cancelReservationSeries(reservation)}
                              >
                                <X size={17} />
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                </div>
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="No upcoming reservations"
                  description={visibleReservations.length ? "No reservations match these filters. Adjust or clear your filters to see more." : "Campus bookings and pending requests will appear here once submitted."}
                  action={
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-lg border-0 px-4 py-2.5 text-[14px] font-extrabold bg-[#07354e] text-white hover:bg-[#104a65]"
                      onClick={() => navigate("explore")}
                    >
                      Explore spaces <ArrowRight size={16} />
                    </button>
                  }
                />
              )}
            </section>
          </div>
        )}

        {tab === "notifications" && (
          <div className="page-content notifications-page">
            <div className="mb-6 flex items-end justify-between gap-4 max-[600px]:items-start max-[600px]:flex-col">
              <div>
                <span className="inline-flex items-center gap-[5px] font-display text-[12px] font-extrabold tracking-[1.55px] text-[#228474] uppercase">CAMPUS ACTIVITY</span>
                <h1 className="m-0 font-display text-[34px] font-extrabold leading-[1.08] tracking-[-1.2px] text-ink max-[540px]:text-[28px]">Notifications</h1>
                <p>Booking requests, decisions, and cancellations from this campus demo.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-bold text-teal" onClick={loadNotifications} disabled={notificationLoading}>Refresh</button>
                <button type="button" className="rounded-lg border-0 bg-[#07354e] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50" onClick={markAllNotificationsRead} disabled={unreadNotificationCount === 0}>Mark all read</button>
              </div>
            </div>
            {notificationError && <div className="mb-3 rounded-lg bg-[#fff2ec] p-3 text-[14px] text-[#b85c45]" role="alert">{notificationError}</div>}
            {notifications.length ? (
              <div className="grid gap-2">
                {notifications.map((item) => (
                  <article key={item.id} className={`flex items-start gap-3 rounded-xl border p-4 ${item.isRead ? "border-line bg-white" : "border-[#b9ded2] bg-[#f1faf6]"}`}>
                    <span className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${item.type === "cancellation" ? "bg-[#fff0e9] text-[#ad654d]" : item.type === "approval" ? "bg-[#fff3e3] text-[#9b7042]" : "bg-[#e3f3ec] text-teal"}`}><Bell size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="m-0 text-sm font-bold text-ink">{item.title}</h2>
                        {!item.isRead && <span className="size-1.5 rounded-full bg-teal" aria-label="Unread" />}
                      </div>
                      <p className="my-1 text-[14px] leading-relaxed text-[#61777b]">{item.message}</p>
                      <time className="text-[12px] text-muted" dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                    </div>
                    {(!item.isRead || (item.type === "waitlist" && item.waitlistId)) && (
                      <div className="flex shrink-0 gap-1.5">
                        {item.type === "waitlist" && item.claimable && <button type="button" className="rounded-md border-0 bg-[#07354e] px-2.5 py-1.5 text-[12px] font-bold text-white" onClick={() => claimWaitlistNotification(item)}>Claim slot</button>}
                        {!item.isRead && <button type="button" className="rounded-md border-0 bg-white px-2.5 py-1.5 text-[12px] font-bold text-teal" onClick={() => markNotificationRead(item)}>Mark read</button>}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : notificationLoading ? (
              <p className="py-8 text-center text-sm text-muted" role="status">Loading campus activity…</p>
            ) : (
              <EmptyState icon={Bell} title="You’re all caught up" description="Reservation updates will appear here as bookings are created, approved, declined, or cancelled." />
            )}
          </div>
        )}

        {tab === "operations" && authUser.role === "Admin" && (
          <div className="page-content operations-page">
            <div className="mb-6 flex items-end justify-between gap-5 max-[600px]:items-start max-[600px]:flex-col">
              <div>
                <span className="inline-flex items-center gap-[5px] font-display text-[12px] font-extrabold tracking-[1.55px] text-[#228474] uppercase">CAMPUS OPERATIONS</span>
                <h1 className="m-0 font-display text-[34px] font-extrabold leading-[1.08] tracking-[-1.2px] text-ink max-[540px]:text-[28px]">Space intelligence</h1>
                <p>
                  Understand how rooms are used and plan events around real
                  constraints.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#e9f4ef] px-2.5 py-1.5 text-[13px] font-bold text-teal">
                <BarChart3 size={17} /> Administrator view
              </span>
            </div>
            <nav className="operations-jumps" aria-label="Operations sections">
              <a href="#catalog">Resources</a><a href="#maintenance">Maintenance</a><a href="#approvals">Approvals</a><a href="#waitlist">Waitlist</a><a href="#reports">Reports</a><a href="#forecast">Forecast</a><a href="#allocation">Event allocation</a>
            </nav>
            <ResourceManager
              resources={allResources}
              onChanged={async () => {
                setAllocation(null);
                const data = await api.adminResources();
                setAllResources(Array.isArray(data) ? data : []);
                await Promise.allSettled([
                  runSearch(resultsFilters),
                  loadStats(),
                  loadForecast(),
                  loadMaintenance(),
                  loadWaitlist(),
                ]);
              }}
            />
            <section className="operations-metrics mb-5 grid grid-cols-3 gap-3 max-[700px]:grid-cols-1">
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 rounded-[13px] border border-line bg-white p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#e0f2eb] text-[#248674]">
                  <BarChart3 size={20} />
                </span>
                <span>7-day utilization</span>
                <strong>
                  {statsLoading
                    ? "…"
                    : formatPercent(utilization?.overallPercentage)}
                </strong>
                <small>Booked time / calendar time</small>
              </div>
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 rounded-[13px] border border-line bg-white p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#fff0e7] text-[#b36b4c]">
                  <Building2 size={20} />
                </span>
                <span>Managed resources</span>
                <strong>{allResources.length}</strong>
                <small>Rooms and equipment</small>
              </div>
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 rounded-[13px] border border-line bg-white p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#e5eef5] text-[#4c7891]">
                  <Clock3 size={20} />
                </span>
                <span>Booked hours</span>
                <strong>
                  {utilization?.resources
                    ? Math.round(
                        utilization.resources.reduce(
                          (total, item) =>
                            total + Number(item.reservedHours || 0),
                          0,
                        ),
                      )
                    : "—"}
                </strong>
                <small>Across the next 7 days</small>
              </div>
            </section>
            <section id="maintenance" className="mb-5 rounded-[15px] border border-line bg-white p-6">
              <PanelTitle
                eyebrow="RESOURCE RESTRICTIONS"
                title="Maintenance windows"
                description="Close a resource temporarily. Search, booking, and allocation checks will respect the closure."
                action={<button type="button" className="text-[13px] font-bold text-teal" onClick={loadMaintenance} disabled={maintenanceLoading}>{maintenanceLoading ? "Refreshing…" : "Refresh"}</button>}
              />
              {maintenanceError && <div className="mb-3 rounded-lg bg-[#fff2ec] p-2.5 text-[13px] text-[#b85c45]" role="alert">{maintenanceError}</div>}
              <form className="grid grid-cols-2 gap-3 rounded-lg bg-[#f6f9f7] p-4 max-[700px]:grid-cols-1" onSubmit={createMaintenanceWindow}>
                <label className="grid gap-1 text-[12px] font-bold text-[#587079]">
                  <span>Resource</span>
                  <select className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px]" value={maintenanceForm.resourceId} onChange={(event) => setMaintenanceForm((current) => ({ ...current, resourceId: event.target.value }))} required>
                    <option value="">Choose a resource</option>{allResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-[12px] font-bold text-[#587079]">
                  <span>Reason</span>
                  <input className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px]" value={maintenanceForm.reason} onChange={(event) => setMaintenanceForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Equipment service, room repair…" maxLength={200} required />
                </label>
                <label className="grid gap-1 text-[12px] font-bold text-[#587079]">
                  <span>Starts (Eastern campus time)</span>
                  <input className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px]" type="datetime-local" value={maintenanceForm.start} onChange={(event) => setMaintenanceForm((current) => ({ ...current, start: event.target.value }))} required />
                </label>
                <label className="grid gap-1 text-[12px] font-bold text-[#587079]">
                  <span>Ends</span>
                  <input className="rounded-md border border-line bg-white px-2.5 py-2 text-[13px]" type="datetime-local" value={maintenanceForm.end} onChange={(event) => setMaintenanceForm((current) => ({ ...current, end: event.target.value }))} required />
                </label>
                <div className="col-span-full flex flex-wrap items-center justify-between gap-3">
                  <small className="text-[12px] text-muted">Up to 90 days. New maintenance cannot overlap an active booking.</small>
                  <button type="submit" className="rounded-md border-0 bg-[#07354e] px-3 py-2 text-[12px] font-bold text-white" disabled={maintenanceLoading}>Schedule maintenance</button>
                </div>
              </form>
              <div className="mt-4 grid gap-2">
                {maintenanceWindows?.some((window) => new Date(window.end) >= new Date()) ? maintenanceWindows.filter((window) => new Date(window.end) >= new Date()).map((window) => {
                  const resource = byId.get(String(window.resourceId));
                  return <article key={window.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#f0e4d7] bg-[#fffaf4] p-3">
                    <div className="min-w-0"><strong className="block text-[13px] text-ink">{resource?.name || "Campus resource"} · {window.reason}</strong><span className="text-[12px] text-muted">{formatDateTime(window.start)} – {formatDateTime(window.end)}</span></div>
                    <button type="button" className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#ad654d]" onClick={() => removeMaintenanceWindow(window)}>Remove</button>
                  </article>;
                }) : maintenanceLoading ? <p className="py-3 text-center text-[13px] text-muted">Loading maintenance schedule…</p> : <p className="py-3 text-center text-[13px] text-muted">No upcoming maintenance windows.</p>}
              </div>
            </section>
            <section id="approvals" className="mb-5 rounded-[15px] border border-line bg-white p-6">
              <PanelTitle
                eyebrow="REVIEW QUEUE"
                title="Pending approvals"
                description="Laboratory and equipment requests hold their time until reviewed."
                action={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-bold text-teal"
                    onClick={loadApprovals}
                    disabled={approvalLoading}
                  >
                    {approvalLoading ? "Refreshing…" : "Refresh"} <ArrowRight size={15} />
                  </button>
                }
              />
              {approvalError && (
                <div className="mb-3 rounded-lg bg-[#fff2ec] p-2.5 text-[14px] text-[#b85c45]" role="alert">
                  <CircleAlert size={16} /> {approvalError}
                </div>
              )}
              {pendingApprovals?.length ? (
                <div className="grid gap-2">
                  {pendingApprovals.map((reservation) => {
                    const resource = byId.get(String(reservation.resourceId));
                    return (
                      <article key={reservation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#f0e4d7] bg-[#fffaf4] p-3">
                        <div className="min-w-0">
                          <strong className="block truncate text-sm text-ink">{reservation.title}</strong>
                          <span className="block text-[13px] text-muted">
                            {resource?.name || "Campus resource"} · {reservation.organizer} · {formatDateTime(reservation.start)} to {formatTime(reservation.end)} · {reservation.attendees} {resource?.type === "equipment" ? "units" : "attendees"}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-md border-0 bg-[#e8f6ee] px-3 py-2 text-[13px] font-bold text-[#258572] hover:bg-[#d8eee3]"
                            onClick={() => decideApproval(reservation, "approve")}
                          >Approve</button>
                          <button
                            type="button"
                            className="rounded-md border-0 bg-[#fff0e9] px-3 py-2 text-[13px] font-bold text-[#ad654d] hover:bg-[#fbe2d7]"
                            onClick={() => decideApproval(reservation, "reject")}
                          >Decline</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : approvalLoading ? (
                <p className="py-4 text-sm text-muted" role="status">Loading approval requests…</p>
              ) : (
                <p className="py-4 text-sm text-muted">No reservations are waiting for approval.</p>
              )}
            </section>
            <section id="waitlist" className="mb-5 rounded-[15px] border border-line bg-white p-6">
              <PanelTitle
                eyebrow="DEMAND QUEUE"
                title="Slot waitlist"
                description="Requests are notified when a matching booking or maintenance block is removed. Users still recheck and book the slot themselves."
                action={<button type="button" className="text-[13px] font-bold text-teal" onClick={loadWaitlist} disabled={waitlistLoading}>{waitlistLoading ? "Refreshing…" : "Refresh"}</button>}
              />
              {waitlistError && <div className="mb-3 rounded-lg bg-[#fff2ec] p-2.5 text-[13px] text-[#b85c45]" role="alert">{waitlistError}</div>}
              {waitlistEntries?.length ? (
                <div className="grid gap-2">
                  {waitlistEntries.map((entry) => {
                    const resource = byId.get(String(entry.resourceId));
                    return <article key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e6ece8] bg-[#fbfdfb] p-3">
                      <div className="min-w-0"><div className="flex items-center gap-2"><strong className="truncate text-[13px] text-ink">{entry.title}</strong><span className={`rounded px-1.5 py-1 text-[11px] font-bold ${entry.status === "notified" ? "bg-[#e6f4ee] text-teal" : "bg-[#edf2fb] text-[#6279a2]"}`}>{entry.status}</span></div><span className="block text-[12px] text-muted">{resource?.name || entry.resourceId} · {entry.organizer} · {formatDateTime(entry.start)} – {formatTime(entry.end)} · {entry.attendees} {resource?.type === "equipment" ? "units" : "attendees"}</span></div>
                      <button type="button" className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#ad654d]" onClick={() => removeWaitlistEntry(entry)}>Remove</button>
                    </article>;
                  })}
                </div>
              ) : waitlistLoading ? <p className="py-3 text-center text-[13px] text-muted">Loading waitlist…</p> : <p className="py-3 text-center text-[13px] text-muted">No waitlist requests.</p>}
            </section>
            <div className="grid grid-cols-[1.4fr_.8fr] gap-5 max-[1000px]:grid-cols-1">
              <section id="reports" className="rounded-[15px] border border-line bg-white p-6">
                <PanelTitle
                  eyebrow="CAPACITY PULSE"
                  title="Room utilization"
                  description="Booked hours as a share of calendar hours over the next 7 days."
                  action={
                    <button
                      className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-bold text-teal"
                      type="button"
                      onClick={loadStats}
                    >
                      Refresh <ArrowRight size={15} />
                    </button>
                  }
                />
                {utilization?.error ? (
                  <div className="mt-3 rounded-lg bg-[#fff2ec] p-2.5 text-[14px] text-[#b85c45]">
                    <CircleAlert size={16} /> {utilization.error}
                  </div>
                ) : utilization?.resources?.length ? (
                  <div className="grid gap-3">
                    {[...utilization.resources]
                      .sort(
                        (a, b) =>
                          b.utilizationPercentage - a.utilizationPercentage,
                      )
                      .map((item) => {
                        const resource = byId.get(String(item.resourceId));
                        return (
                          <div className="grid gap-1" key={item.resourceId}>
                            <div className="flex items-center justify-between text-[13px]">
                              <span>
                                {resource?.name ||
                                  `Resource ${item.resourceId}`}
                              </span>
                              <strong>
                                {formatPercent(item.utilizationPercentage)}
                              </strong>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#edf1ef]">
                              <span
                                style={{
                                  width: `${Math.max(0, Math.min(100, Number(item.utilizationPercentage) || 0))}%`,
                                }}
                              />
                            </div>
                            <small>
                              {Number(item.reservedHours || 0).toFixed(1)} of{" "}
                              {Number(item.availableHours || 0).toFixed(1)}{" "}
                              hours booked
                            </small>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <EmptyState
                    icon={BarChart3}
                    title="No utilization data yet"
                    description="Usage will appear as rooms receive reservations."
                  />
                )}
              </section>
              <aside className="rounded-[15px] bg-[#dceee8] p-6">
                <span className="mb-3 grid size-9 place-items-center rounded-[10px] bg-[#c7e4da] text-teal">
                  <Lightbulb size={22} />
                </span>
                <span className="inline-flex items-center gap-[5px] font-display text-[12px] font-extrabold tracking-[1.55px] text-[#228474] uppercase">PLANNING INSIGHT</span>
                <h3>
                  Right room.
                  <br />
                  Right moment.
                </h3>
                <p>
                  Usage reports and allocation recommendations help campus teams
                  give each event the space it needs.
                </p>
                <div className="mt-6 flex items-center gap-2">
                  <span className="h-px flex-1 bg-[#afd4c7]" />
                  <span>SPACE IS A SHARED RESOURCE</span>
                </div>
              </aside>
            </div>
            <ForecastPanel
              forecast={forecast}
              loading={forecastLoading}
              onRefresh={loadForecast}
            />
            <section id="allocation" className="mt-5 rounded-[15px] border border-line bg-white p-6">
              <div className="flex items-start justify-between gap-4 max-[600px]:flex-col">
                <div>
                  <span className="inline-flex items-center gap-[5px] font-display text-[12px] font-extrabold tracking-[1.55px] text-[#228474] uppercase">
                    <Sparkles size={14} /> INTELLIGENT ALLOCATION
                  </span>
                  <h2 className="m-0 font-display text-[21px] font-bold tracking-[-.65px] text-ink">Plan 50 events in one move.</h2>
                  <p>
                    Load a fictional campus schedule with overlapping needs. The
                    solver finds feasible rooms while respecting capacity,
                    equipment, accessibility, and existing bookings.
                  </p>
                </div>
                <div className="flex gap-2 max-[600px]:w-full">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-0 px-4 py-2.5 text-[14px] font-extrabold border border-[#cbdcd5] bg-white text-teal hover:bg-[#edf7f2]"
                    type="button"
                    onClick={loadSample}
                    disabled={sampleLoading || allocationLoading}
                  >
                    {sampleLoading
                      ? "Loading…"
                      : sampleEvents.length
                        ? "Reload 50 events"
                        : "Load 50 sample events"}
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-0 px-4 py-2.5 text-[14px] font-extrabold bg-[#07354e] text-white hover:bg-[#104a65]"
                    type="button"
                    onClick={solveSample}
                    disabled={sampleLoading || allocationLoading}
                  >
                    {allocationLoading
                      ? "Calculating…"
                      : "Calculate allocation"}{" "}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
              <CustomEventImport
                value={customEventsText}
                onChange={setCustomEventsText}
                onImport={importEvents}
              />
              {allocationError && (
                <div className="mt-3 rounded-lg bg-[#fff2ec] p-2.5 text-[14px] text-[#b85c45]" role="alert">
                  <CircleAlert size={16} /> {allocationError}
                </div>
              )}
              {sampleEvents.length > 0 && !allocation && (
                <div className="mt-3 text-[13px] text-teal">
                  <CheckCircle2 size={20} />
                  <div>
                    <strong>
                      {sampleEvents.length} events ready to allocate
                    </strong>
                    <span>
                      {eventSource === "custom"
                        ? "Your uploaded schedule is ready for the solver."
                        : "Includes overlapping times, different group sizes, and room requirements."}
                    </span>
                  </div>
                </div>
              )}
              {allocation && <AllocationResults result={allocation} />}
            </section>
          </div>
        )}

        <footer className="app-footer">
          <span>SpaceSense AI</span>
          <span>A fictional campus. Real possibilities.</span><span>All booking times are Eastern.</span>
        </footer>
      </main>

      {modal && (
        <BookingModal
          key={modal.booking?.id || modal.resource?.id}
          modal={modal}
          resources={allResources.length ? allResources : resources}
          defaultWindow={defaultModalWindow}
          suggestedAttendees={Number(resultsFilters.minCapacity) || 1}
          onClose={closeModal}
          onSaved={afterSave}
        />
      )}
      {toast && (
        <div className="app-toast fixed right-5 bottom-5 z-50 rounded-lg bg-navy px-4 py-3 text-white shadow-lg" role="status">
          <CheckCircle2 size={18} /> {toast}
          <button
            type="button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
