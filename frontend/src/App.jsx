import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Building2, CalendarDays,
  Check, CheckCircle2, ChevronDown, CircleAlert, Clock3, Compass, Filter,
  FlaskConical, LayoutDashboard, Lightbulb, MapPin, Menu, MonitorPlay,
  MoreHorizontal, Pencil, Plus, Search, Send, ShieldCheck, SlidersHorizontal,
  Sparkles, Trash2, Users, WandSparkles, X,
} from './icons.jsx';
import { api } from './api';
import {
  dateRange, durationHours, formatDate, formatDateTime, formatTime,
  initialSearchTime, searchWindow, toApiTime, toLocalInput,
} from './dates';

const fallbackFeatures = ['Projector', 'Whiteboard', 'Video conferencing', 'Computers'];
const examplePrompts = [
  'Find a room for 20 students with a projector next Tuesday afternoon',
  'I need an accessible study space for 8 people tomorrow morning',
];

function resourceIcon(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('lab')) return FlaskConical;
  if (value.includes('equipment')) return MonitorPlay;
  if (value.includes('study')) return Lightbulb;
  return Building2;
}

function resourceTone(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('lab')) return 'lavender';
  if (value.includes('study')) return 'peach';
  if (value.includes('equipment')) return 'blue';
  return 'mint';
}

function shortName(name) {
  return String(name || 'SP').split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase();
}

function formatPercent(value) {
  const number = Number(value);
  return `${Number.isFinite(number) ? Math.round(number) : 0}%`;
}

function PanelTitle({ eyebrow, title, description, action }) {
  return (
    <div className="panel-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon = Search, title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={26} strokeWidth={1.7} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function ResourceCard({ resource, onBook, windowLabel }) {
  const Icon = resourceIcon(resource.type);
  const tone = resourceTone(resource.type);
  return (
    <article className="resource-card">
      <div className={`resource-visual visual-${tone}`}>
        <div className="visual-orbit orbit-one" />
        <div className="visual-orbit orbit-two" />
        <div className="visual-lines" />
        <div className="visual-icon"><Icon size={42} strokeWidth={1.35} /></div>
        <span className="visual-code">{shortName(resource.name)} / {String(resource.id).slice(0, 3).toUpperCase()}</span>
        <span className="visual-capacity"><Users size={13} /> {resource.capacity} seats</span>
      </div>
      <div className="resource-content">
        <div className="resource-meta">
          <span>{resource.type || 'Campus space'}</span>
          {resource.accessible && <span className="accessible-mark" title="Accessible space"><ShieldCheck size={14} /> Accessible</span>}
        </div>
        <h3>{resource.name}</h3>
        <p className="resource-building"><MapPin size={14} /> {resource.building || 'Campus'}</p>
        <p className="resource-description">{resource.description || 'A flexible space for campus activities and collaboration.'}</p>
        <div className="feature-list">
          {(resource.features || []).slice(0, 3).map((feature) => <span key={feature}>{feature}</span>)}
          {(resource.features || []).length > 3 && <span>+{resource.features.length - 3}</span>}
        </div>
        <div className="resource-footer">
          <span className="available-label"><span className="status-dot" /> Available {windowLabel}</span>
          <button className="icon-action" type="button" onClick={() => onBook(resource)} aria-label={`Book ${resource.name}`}><ArrowUpRight size={20} /></button>
        </div>
      </div>
    </article>
  );
}

function BookingModal({ modal, resources, defaultWindow, onClose, onSaved }) {
  const booking = modal.booking;
  const [form, setForm] = useState(() => ({
    resourceId: String(booking?.resourceId ?? modal.resource?.id ?? ''),
    title: booking?.title || '',
    organizer: booking?.organizer || '',
    attendees: booking?.attendees || 1,
    start: booking ? toLocalInput(booking.start) : defaultWindow.start,
    end: booking ? toLocalInput(booking.end) : defaultWindow.end,
  }));
  const [availability, setAvailability] = useState({ state: 'checking', conflicts: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedResource = resources.find((item) => String(item.id) === form.resourceId) || modal.resource;
  const startIso = toApiTime(form.start);
  const endIso = toApiTime(form.end);
  const validWindow = Boolean(startIso && endIso && new Date(endIso) > new Date(startIso));

  useEffect(() => {
    if (!form.resourceId || !validWindow) {
      setAvailability({ state: 'invalid', conflicts: [] });
      return undefined;
    }
    let active = true;
    setAvailability({ state: 'checking', conflicts: [] });
    api.availability(form.resourceId, startIso, endIso)
      .then((result) => {
        if (!active) return;
        const conflicts = (result.conflicts || []).filter((item) => String(item.id) !== String(booking?.id));
        setAvailability({ state: conflicts.length === 0 && (result.available || Boolean(booking)) ? 'available' : 'unavailable', conflicts });
      })
      .catch((reason) => {
        if (active) setAvailability({ state: 'error', conflicts: [], message: reason.message });
      });
    return () => { active = false; };
  }, [form.resourceId, startIso, endIso, booking?.id, validWindow]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (availability.state !== 'available') return;
    if (Number(form.attendees) > Number(selectedResource?.capacity || 0)) {
      setError('The attendee count exceeds this space’s capacity.');
      return;
    }
    setBusy(true);
    setError('');
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
      await onSaved(booking ? 'Reservation updated.' : 'Reservation confirmed.');
    } catch (reason) {
      setError(reason.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-heading">
        <div className="modal-header">
          <div><span className="eyebrow">RESERVATIONS</span><h2 id="booking-heading">{booking ? 'Edit reservation' : 'Reserve a space'}</h2></div>
          <button type="button" className="plain-icon" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>
        </div>
        <p className="modal-intro">{booking ? 'Change the details below. Availability is checked before you save.' : 'Choose the details for your campus gathering.'}</p>
        <form onSubmit={submit}>
          <label className="field"><span>Space</span><select value={form.resourceId} onChange={(event) => update('resourceId', event.target.value)} required>
            {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} · {resource.capacity} seats</option>)}
          </select></label>
          <label className="field"><span>Event name</span><input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Design seminar" maxLength={120} required /></label>
          <div className="field-grid">
            <label className="field"><span>Organizer</span><input value={form.organizer} onChange={(event) => update('organizer', event.target.value)} placeholder="Your name or group" maxLength={100} required /></label>
            <label className="field"><span>Attendees</span><input type="number" min="1" max={selectedResource?.capacity || undefined} value={form.attendees} onChange={(event) => update('attendees', event.target.value)} required /></label>
          </div>
          <div className="field-grid">
            <label className="field"><span>Starts</span><input type="datetime-local" value={form.start} onChange={(event) => update('start', event.target.value)} required /></label>
            <label className="field"><span>Ends</span><input type="datetime-local" value={form.end} onChange={(event) => update('end', event.target.value)} required /></label>
          </div>
          <div className={`availability-note availability-${availability.state}`}>
            {availability.state === 'available' ? <CheckCircle2 size={18} /> : availability.state === 'checking' ? <Clock3 size={18} /> : <CircleAlert size={18} />}
            <span>{availability.state === 'available' ? 'This space is available for your selected time.' : availability.state === 'checking' ? 'Checking live availability…' : availability.state === 'unavailable' ? 'This space is booked during the selected time. Choose another time or space.' : availability.state === 'invalid' ? 'Choose an end time after the start time.' : availability.message || 'Availability could not be checked.'}</span>
          </div>
          {error && <div className="form-error" role="alert"><CircleAlert size={16} /> {error}</div>}
          <div className="modal-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy || availability.state !== 'available'}>{busy ? 'Saving…' : booking ? 'Save changes' : 'Confirm booking'} <ArrowRight size={16} /></button></div>
        </form>
      </div>
    </div>
  );
}

function CustomEventImport({ value, onChange, onImport }) {
  return (
    <details className="custom-import">
      <summary><span><Plus size={17} /> Provide your own events</span><ChevronDown size={18} /></summary>
      <div className="custom-import-body">
        <p>Paste an array of event objects, or an object with an <code>events</code> array. Times must be ISO 8601 timestamps. Priority is 1 (lowest) through 5 (highest).</p>
        <textarea aria-label="Custom allocation events JSON" spellCheck="false" value={value} onChange={(event) => onChange(event.target.value)} rows={7} placeholder={'[{\n  "id": "seminar-1",\n  "title": "Design seminar",\n  "start": "2026-10-20T14:00:00-04:00",\n  "end": "2026-10-20T16:00:00-04:00",\n  "attendees": 20,\n  "requiredFeatures": ["Projector"],\n  "accessible": true,\n  "priority": 3\n}]'} />
        <div className="custom-import-footer"><span>Required: id, title, start, end, attendees, requiredFeatures, accessible, priority</span><button type="button" className="button button-outline" onClick={onImport} disabled={!value.trim()}>Use these events <ArrowRight size={15} /></button></div>
      </div>
    </details>
  );
}

function App() {
  const [tab, setTab] = useState('explore');
  const [mobileNav, setMobileNav] = useState(false);
  const [filters, setFilters] = useState(() => ({ query: '', type: '', minCapacity: '', features: [], accessible: false, ...initialSearchTime() }));
  const [resources, setResources] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [searchLoading, setSearchLoading] = useState(true);
  const [searchError, setSearchError] = useState('');
  const [dataError, setDataError] = useState('');
  const [naturalPrompt, setNaturalPrompt] = useState('');
  const [naturalLoading, setNaturalLoading] = useState(false);
  const [interpretation, setInterpretation] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [utilization, setUtilization] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [sampleEvents, setSampleEvents] = useState([]);
  const [eventSource, setEventSource] = useState('sample');
  const [customEventsText, setCustomEventsText] = useState('');
  const [sampleLoading, setSampleLoading] = useState(false);
  const [allocation, setAllocation] = useState(null);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationError, setAllocationError] = useState('');

  const featureOptions = useMemo(() => {
    const fromApi = [...new Set(allResources.flatMap((resource) => resource.features || []))];
    return fromApi.length ? fromApi.slice(0, 8) : fallbackFeatures;
  }, [allResources]);
  const typeOptions = useMemo(() => [...new Set(allResources.map((resource) => resource.type).filter(Boolean))], [allResources]);
  const byId = useMemo(() => new Map(allResources.map((resource) => [String(resource.id), resource])), [allResources]);
  const selectedWindow = useMemo(() => searchWindow(filters), [filters]);
  const windowIsValid = Boolean(selectedWindow.start && selectedWindow.end && new Date(selectedWindow.end) > new Date(selectedWindow.start));
  const windowLabel = `${formatTime(selectedWindow.start)}–${formatTime(selectedWindow.end)}`;
  const defaultModalWindow = { start: `${filters.date}T${filters.startTime}`, end: `${filters.date}T${filters.endTime}` };
  const upcomingCount = reservations.filter((reservation) => new Date(reservation.end) >= new Date()).length;

  const loadReservations = useCallback(async () => {
    const range = dateRange(30);
    const data = await api.reservations(range.from, range.to);
    setReservations(Array.isArray(data) ? data : []);
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const range = dateRange(7);
      setUtilization(await api.utilization(range.from, range.to));
    } catch (reason) {
      setUtilization({ error: reason.message });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (nextFilters) => {
    const selected = searchWindow(nextFilters);
    if (!selected.start || !selected.end || new Date(selected.end) <= new Date(selected.start)) {
      setSearchError('Choose an end time after the start time.');
      return;
    }
    setSearchLoading(true);
    setSearchError('');
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
      setResources(Array.isArray(result) ? result : []);
    } catch (reason) {
      setSearchError(reason.message);
      setResources([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    runSearch(filters);
    api.resources().then((data) => setAllResources(Array.isArray(data) ? data : [])).catch((reason) => setDataError(reason.message));
    loadReservations().catch((reason) => setDataError(reason.message));
  // Initial loading uses the first render's filter values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'operations' && !utilization) loadStats();
  }, [tab, utilization, loadStats]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function toggleFeature(feature) {
    setFilters((current) => ({ ...current, features: current.features.includes(feature) ? current.features.filter((item) => item !== feature) : [...current.features, feature] }));
  }

  async function handleNaturalSearch(event) {
    event.preventDefault();
    const prompt = naturalPrompt.trim();
    if (!prompt) return;
    setNaturalLoading(true);
    setSearchError('');
    try {
      const result = await api.naturalSearch(prompt);
      const parsed = result.interpretation || {};
      const nextFilters = {
        ...filters,
        query: parsed.query ?? '',
        type: parsed.type ?? '',
        minCapacity: parsed.minCapacity ?? '',
        features: Array.isArray(parsed.features) ? parsed.features : [],
        accessible: Boolean(parsed.accessible),
        date: parsed.start ? toLocalInput(parsed.start).slice(0, 10) : filters.date,
        startTime: parsed.start ? toLocalInput(parsed.start).slice(11, 16) : filters.startTime,
        endTime: parsed.end ? toLocalInput(parsed.end).slice(11, 16) : filters.endTime,
      };
      const selected = searchWindow(nextFilters);
      if (!selected.start || !selected.end || new Date(selected.end) <= new Date(selected.start)) throw new Error('The request produced an invalid time window. Try a more specific date and time.');
      const available = await api.resources({
        query: nextFilters.query.trim(), type: nextFilters.type, minCapacity: nextFilters.minCapacity,
        features: nextFilters.features, accessible: nextFilters.accessible ? true : undefined, ...selected,
      });
      setFilters(nextFilters);
      setResources(Array.isArray(available) ? available : []);
      setInterpretation({ explanation: result.explanation, source: result.source, parsed });
      setTab('explore');
    } catch (reason) {
      setSearchError(reason.message);
    } finally {
      setNaturalLoading(false);
    }
  }

  async function afterSave(message) {
    setModal(null);
    setToast(message);
    await Promise.allSettled([runSearch(filters), loadReservations(), loadStats()]);
  }

  async function cancelReservation(reservation) {
    if (!globalThis.confirm(`Cancel “${reservation.title}”? This will release the space.`)) return;
    try {
      await api.cancelReservation(reservation.id);
      setToast('Reservation cancelled.');
      await Promise.allSettled([runSearch(filters), loadReservations(), loadStats()]);
    } catch (reason) {
      setToast(`Could not cancel reservation: ${reason.message}`);
    }
  }

  async function loadSample() {
    setSampleLoading(true);
    setAllocationError('');
    try {
      const data = await api.allocationSample();
      const events = Array.isArray(data) ? data : data.events;
      if (!Array.isArray(events) || !events.length) throw new Error('No example events were returned.');
      setSampleEvents(events);
      setEventSource('sample');
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
    setAllocationError('');
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
    setAllocationError('');
    try {
      const parsed = JSON.parse(customEventsText);
      const events = Array.isArray(parsed) ? parsed : parsed.events;
      if (!Array.isArray(events) || !events.length) throw new Error('Paste a non-empty JSON array of events, or an object with an events array.');
      const ids = new Set();
      events.forEach((event, index) => {
        if (!event || typeof event !== 'object') throw new Error(`Event ${index + 1} must be an object.`);
        if (!event.id || !event.title) throw new Error(`Event ${index + 1} needs an id and title.`);
        if (ids.has(String(event.id))) throw new Error(`Event id ${event.id} is repeated.`);
        ids.add(String(event.id));
        if (!event.start || !event.end || Number.isNaN(new Date(event.start).getTime()) || Number.isNaN(new Date(event.end).getTime()) || new Date(event.end) <= new Date(event.start)) throw new Error(`Event ${index + 1} needs valid start and end timestamps.`);
        if (!Number.isInteger(event.attendees) || event.attendees < 1) throw new Error(`Event ${index + 1} needs a positive integer attendee count.`);
        if (!Array.isArray(event.requiredFeatures) || !event.requiredFeatures.every((feature) => typeof feature === 'string')) throw new Error(`Event ${index + 1} needs a requiredFeatures string array (use [] if none).`);
        if (typeof event.accessible !== 'boolean') throw new Error(`Event ${index + 1} needs accessible: true or false.`);
        if (!Number.isInteger(event.priority) || event.priority < 1 || event.priority > 5) throw new Error(`Event ${index + 1} needs priority from 1 to 5.`);
      });
      setSampleEvents(events);
      setEventSource('custom');
      setAllocation(null);
      setToast(`${events.length} custom events loaded.`);
    } catch (reason) {
      setAllocationError(reason instanceof SyntaxError ? `Invalid JSON: ${reason.message}` : reason.message);
    }
  }

  function navigate(nextTab) {
    setTab(nextTab);
    setMobileNav(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><span /></span><span className="brand-name">SpaceSense <strong>AI</strong><small>CAMPUS INTELLIGENCE</small></span></div>
        <div className="side-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button type="button" onClick={() => navigate('explore')} className={tab === 'explore' ? 'active' : ''}><Compass size={19} /> Explore spaces <ArrowRight size={15} className="nav-arrow" /></button>
          <button type="button" onClick={() => navigate('bookings')} className={tab === 'bookings' ? 'active' : ''}><CalendarDays size={19} /> Reservations <span className="nav-count">{upcomingCount}</span></button>
          <button type="button" onClick={() => navigate('operations')} className={tab === 'operations' ? 'active' : ''}><LayoutDashboard size={19} /> Operations <ArrowRight size={15} className="nav-arrow" /></button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-callout"><div className="callout-icon"><Sparkles size={20} /></div><h3>Smarter campus days</h3><p>Find the right space, avoid conflicts, and make every seat count.</p><button type="button" onClick={() => navigate('operations')}>Explore insights <ArrowUpRight size={15} /></button></div>
        <div className="sidebar-footer"><span className="avatar">SS</span><span><strong>Campus workspace</strong><small>SpaceSense AI</small></span><MoreHorizontal size={18} /></div>
      </aside>

      {mobileNav && <button className="mobile-overlay" type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar"><button type="button" className="menu-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={22} /></button><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{tab === 'explore' ? 'Explore spaces' : tab === 'bookings' ? 'Reservations' : 'Operations'}</strong></div><div className="topbar-right"><span className="top-date"><CalendarDays size={16} /> {formatDate(new Date(), { weekday: 'long', month: 'short', day: 'numeric' })}</span><span className="top-avatar">SS</span></div></header>

        {dataError && <div className="service-banner" role="alert"><CircleAlert size={18} /> {dataError} <button type="button" onClick={() => { setDataError(''); api.resources().then(setAllResources).catch((reason) => setDataError(reason.message)); loadReservations().catch((reason) => setDataError(reason.message)); }}>Retry</button></div>}

        {tab === 'explore' && <div className="page-content explore-page">
          <div className="page-hero"><div><div className="hero-eyebrow"><span className="eyebrow-dot" /> THE CAMPUS, BETTER CONNECTED</div><h1>Find your place<br /><em>to make things happen.</em></h1><p>Discover the right room for your next class, collaboration, or big idea.</p></div><div className="hero-decoration" aria-hidden="true"><span className="hero-circle hero-circle-one" /><span className="hero-circle hero-circle-two" /><span className="hero-map-dot dot-one" /><span className="hero-map-dot dot-two" /><span className="hero-map-dot dot-three" /><div className="hero-floating-card"><span><Check size={16} /></span><div><strong>Room ready</strong><small>Campus spaces, in sync</small></div></div></div></div>

          <div className="overview-row"><div className="overview-card"><span className="metric-icon metric-mint"><Building2 size={19} /></span><div><strong>{allResources.length}</strong><span>Campus resources</span></div><ArrowUpRight size={17} /></div><div className="overview-card"><span className="metric-icon metric-peach"><CheckCircle2 size={19} /></span><div><strong>{searchLoading ? '—' : resources.length}</strong><span>Available for your time</span></div><ArrowUpRight size={17} /></div><div className="overview-card"><span className="metric-icon metric-blue"><CalendarDays size={19} /></span><div><strong>{upcomingCount}</strong><span>Upcoming reservations</span></div><ArrowUpRight size={17} /></div></div>

          <div className="search-layout"><section className="search-panel"><div className="search-panel-heading"><span className="search-heading-icon"><SlidersHorizontal size={21} /></span><div><span className="eyebrow">FIND A SPACE</span><h2>Search campus resources</h2></div></div><form onSubmit={(event) => { event.preventDefault(); runSearch(filters); }}><div className="search-input-wrap"><Search size={19} /><input aria-label="Search resources" value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} placeholder="Search by room name, building, or purpose" /><button type="submit" className="button button-primary">Find spaces <ArrowRight size={16} /></button></div><div className="filter-grid"><label className="field"><span>Date</span><input type="date" value={filters.date} onChange={(event) => updateFilter('date', event.target.value)} required /></label><label className="field"><span>From</span><input type="time" value={filters.startTime} onChange={(event) => updateFilter('startTime', event.target.value)} required /></label><label className="field"><span>Until</span><input type="time" value={filters.endTime} onChange={(event) => updateFilter('endTime', event.target.value)} required /></label><label className="field"><span>People</span><input type="number" min="1" value={filters.minCapacity} onChange={(event) => updateFilter('minCapacity', event.target.value)} placeholder="Any size" /></label><label className="field"><span>Space type</span><select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="">All types</option>{typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label></div><div className="feature-filter"><span className="feature-label"><Filter size={15} /> Features</span><div className="feature-options">{featureOptions.map((feature) => <button type="button" key={feature} className={`filter-chip ${filters.features.includes(feature) ? 'selected' : ''}`} onClick={() => toggleFeature(feature)}>{filters.features.includes(feature) && <Check size={13} />}{feature}</button>)}<button type="button" className={`filter-chip ${filters.accessible ? 'selected' : ''}`} onClick={() => updateFilter('accessible', !filters.accessible)}>{filters.accessible && <Check size={13} />}Accessible</button></div></div></form></section>

          <section className="assistant-panel"><div className="assistant-top"><span className="assistant-icon"><WandSparkles size={22} /></span><span className="assistant-tag">AI ASSISTANT</span></div><h2>Just ask for<br />what you need.</h2><p>Describe the space in your own words. We’ll turn it into a precise search.</p><form onSubmit={handleNaturalSearch}><textarea aria-label="Describe your space needs" value={naturalPrompt} onChange={(event) => setNaturalPrompt(event.target.value)} placeholder="Try: Find a room for 20 students with a projector next Tuesday afternoon" rows={3} /><button type="submit" disabled={naturalLoading || !naturalPrompt.trim()}>{naturalLoading ? 'Searching…' : 'Ask SpaceSense'} <Send size={16} /></button></form><div className="assistant-example"><span>TRY AN EXAMPLE</span><button type="button" onClick={() => setNaturalPrompt(examplePrompts[0])}>{examplePrompts[0]} <ArrowUpRight size={14} /></button></div></section></div>

          <section className="results-section"><PanelTitle eyebrow="EXPLORE THE CAMPUS" title="Spaces for your schedule" description={windowIsValid ? `${formatDate(selectedWindow.start, { weekday: 'long', month: 'long', day: 'numeric' })} · ${windowLabel} · Live availability` : 'Choose a valid time to see available spaces.'} action={<span className="result-count">{resources.length} {resources.length === 1 ? 'space' : 'spaces'} found</span>} />{interpretation && <div className="interpretation-banner"><Sparkles size={19} /><div><strong>{interpretation.explanation || 'We translated your request into search filters.'}</strong><span>{interpretation.source === 'llm' ? 'AI interpreted your request' : 'Search assistant interpreted your request'} · Review the filters above to refine it.</span></div><button type="button" aria-label="Dismiss assistant result" onClick={() => setInterpretation(null)}><X size={17} /></button></div>}{searchError && <div className="inline-error" role="alert"><CircleAlert size={17} /> {searchError}</div>}{searchLoading ? <div className="resource-grid">{[1, 2, 3].map((item) => <div className="resource-skeleton" key={item}><div /><span /><span /></div>)}</div> : resources.length ? <div className="resource-grid">{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} windowLabel={windowLabel} onBook={(selected) => setModal({ resource: selected })} />)}</div> : !searchError && <EmptyState icon={Search} title="No spaces match this search" description="Try a different time, a smaller group, or fewer feature filters." action={<button className="button button-outline" type="button" onClick={() => { const reset = { query: '', type: '', minCapacity: '', features: [], accessible: false, ...initialSearchTime() }; setFilters(reset); runSearch(reset); }}>Reset filters <ArrowRight size={16} /></button>} />}</section>
        </div>}

        {tab === 'bookings' && <div className="page-content bookings-page"><div className="page-heading"><div><span className="eyebrow">CAMPUS SCHEDULE</span><h1>Reservations</h1><p>Keep every gathering on track. Review, update, or release booked spaces.</p></div><button type="button" className="button button-primary" onClick={() => navigate('explore')}><Plus size={17} /> New reservation</button></div><div className="bookings-summary"><div><CalendarDays size={20} /><span><strong>{upcomingCount} upcoming</strong><small>Over the next 30 days</small></span></div><div><ShieldCheck size={20} /><span><strong>Conflict checks built in</strong><small>Availability is checked again before saving</small></span></div></div><section className="bookings-panel"><PanelTitle eyebrow="YOUR CAMPUS CALENDAR" title="Upcoming reservations" description="Reservations across the campus for the next 30 days." action={<button type="button" className="text-button" onClick={() => loadReservations().catch((reason) => setDataError(reason.message))}>Refresh <ArrowRight size={15} /></button>} />{reservations.length ? <div className="booking-list">{[...reservations].sort((a, b) => new Date(a.start) - new Date(b.start)).map((reservation) => { const resource = byId.get(String(reservation.resourceId)); const day = formatDate(reservation.start, { day: '2-digit' }); const month = formatDate(reservation.start, { month: 'short' }); return <article className="booking-row" key={reservation.id}><div className="booking-date"><strong>{day}</strong><span>{month}</span></div><div className="booking-main"><div className="booking-title-line"><h3>{reservation.title}</h3><span className="confirmed-pill"><span /> {reservation.status || 'Confirmed'}</span></div><p><MapPin size={14} /> {resource?.name || 'Campus resource'} <span className="booking-separator">·</span> {resource?.building || 'Campus'}</p></div><div className="booking-details"><span><Clock3 size={15} /> {formatTime(reservation.start)}–{formatTime(reservation.end)}</span><span><Users size={15} /> {reservation.attendees} attendees</span></div><div className="booking-actions"><button type="button" title="Edit reservation" aria-label={`Edit ${reservation.title}`} onClick={() => setModal({ booking: reservation, resource })}><Pencil size={17} /></button><button type="button" title="Cancel reservation" aria-label={`Cancel ${reservation.title}`} onClick={() => cancelReservation(reservation)}><Trash2 size={17} /></button></div></article>; })}</div> : <EmptyState icon={CalendarDays} title="No upcoming reservations" description="Your booked spaces will appear here once a reservation is confirmed." action={<button type="button" className="button button-primary" onClick={() => navigate('explore')}>Explore spaces <ArrowRight size={16} /></button>} />}</section></div>}

        {tab === 'operations' && <div className="page-content operations-page"><div className="page-heading"><div><span className="eyebrow">CAMPUS OPERATIONS</span><h1>Space intelligence</h1><p>Understand how rooms are used and plan events around real constraints.</p></div><span className="admin-badge"><BarChart3 size={17} /> Administrator view</span></div><section className="operations-stats"><div className="operations-stat"><span className="metric-icon metric-mint"><BarChart3 size={20} /></span><span>7-day utilization</span><strong>{statsLoading ? '…' : formatPercent(utilization?.overallPercentage)}</strong><small>Booked time / available time</small></div><div className="operations-stat"><span className="metric-icon metric-peach"><Building2 size={20} /></span><span>Managed resources</span><strong>{allResources.length}</strong><small>Rooms and shared spaces</small></div><div className="operations-stat"><span className="metric-icon metric-blue"><Clock3 size={20} /></span><span>Booked hours</span><strong>{utilization?.resources ? Math.round(utilization.resources.reduce((total, item) => total + Number(item.reservedHours || 0), 0)) : '—'}</strong><small>Across the next 7 days</small></div></section><div className="operations-grid"><section className="usage-panel"><PanelTitle eyebrow="CAPACITY PULSE" title="Room utilization" description="Booked hours compared with available hours over the next 7 days." action={<button className="text-button" type="button" onClick={loadStats}>Refresh <ArrowRight size={15} /></button>} />{utilization?.error ? <div className="inline-error"><CircleAlert size={16} /> {utilization.error}</div> : utilization?.resources?.length ? <div className="usage-list">{[...utilization.resources].sort((a, b) => b.utilizationPercentage - a.utilizationPercentage).map((item) => { const resource = byId.get(String(item.resourceId)); return <div className="usage-row" key={item.resourceId}><div className="usage-row-top"><span>{resource?.name || `Resource ${item.resourceId}`}</span><strong>{formatPercent(item.utilizationPercentage)}</strong></div><div className="progress-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(item.utilizationPercentage) || 0))}%` }} /></div><small>{Number(item.reservedHours || 0).toFixed(1)} of {Number(item.availableHours || 0).toFixed(1)} hours booked</small></div>; })}</div> : <EmptyState icon={BarChart3} title="No utilization data yet" description="Usage will appear as rooms receive reservations." />}</section><aside className="insight-panel"><span className="insight-icon"><Lightbulb size={22} /></span><span className="eyebrow">PLANNING INSIGHT</span><h3>Right room.<br />Right moment.</h3><p>Usage reports and allocation recommendations help campus teams give each event the space it needs.</p><div className="insight-bottom"><span className="insight-line" /><span>SPACE IS A SHARED RESOURCE</span></div></aside></div><section className="allocator-panel"><div className="allocator-intro"><div><span className="eyebrow"><Sparkles size={14} /> INTELLIGENT ALLOCATION</span><h2>Plan 50 events in one move.</h2><p>Load a fictional campus schedule with overlapping needs. The solver finds feasible rooms while respecting capacity, equipment, accessibility, and existing bookings.</p></div><div className="allocator-actions"><button className="button button-outline" type="button" onClick={loadSample} disabled={sampleLoading || allocationLoading}>{sampleLoading ? 'Loading…' : sampleEvents.length ? 'Reload 50 events' : 'Load 50 sample events'}</button><button className="button button-primary" type="button" onClick={solveSample} disabled={sampleLoading || allocationLoading}>{allocationLoading ? 'Calculating…' : 'Calculate allocation'} <ArrowRight size={16} /></button></div></div><CustomEventImport value={customEventsText} onChange={setCustomEventsText} onImport={importEvents} />{allocationError && <div className="inline-error" role="alert"><CircleAlert size={16} /> {allocationError}</div>}{sampleEvents.length > 0 && !allocation && <div className="sample-loaded"><CheckCircle2 size={20} /><div><strong>{sampleEvents.length} events ready to allocate</strong><span>{eventSource === 'custom' ? 'Your uploaded schedule is ready for the solver.' : 'Includes overlapping times, different group sizes, and room requirements.'}</span></div></div>}{allocation && <AllocationResults result={allocation} />}</section></div>}

        <footer className="app-footer"><span>SpaceSense AI</span><span>Thoughtful spaces for a connected campus.</span></footer>
      </main>

      {modal && <BookingModal key={modal.booking?.id || modal.resource?.id} modal={modal} resources={allResources.length ? allResources : resources} defaultWindow={defaultModalWindow} onClose={() => setModal(null)} onSaved={afterSave} />}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} /> {toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </div>
  );
}

function AllocationResults({ result }) {
  const summary = result.summary || {};
  const assignments = result.assignments || [];
  const unassigned = result.unassigned || [];
  const rooms = result.rooms || [];
  return <div className="allocation-results"><div className="allocation-heading"><div><span className="eyebrow">ALLOCATION COMPLETE</span><h3>{summary.assignedEvents ?? assignments.length} of {summary.totalEvents ?? assignments.length + unassigned.length} events placed</h3><p>{result.method || 'Constraint-aware planning'} · Existing reservations included</p></div><span className="allocation-success"><CheckCircle2 size={16} /> Feasible plan generated</span></div><div className="allocation-metrics"><div><span>Allocation rate</span><strong>{formatPercent(summary.allocationRatePercent)}</strong><small>Events with a suitable room</small></div><div><span>Seat fill</span><strong>{formatPercent(summary.seatFillPercent)}</strong><small>Attendees / assigned seats</small></div><div><span>Room time use</span><strong>{formatPercent(summary.roomTimeUtilizationPercent)}</strong><small>Booked time in planning window</small></div><div><span>Unassigned</span><strong>{summary.unassignedEvents ?? unassigned.length}</strong><small>Need manual review</small></div></div><div className="allocation-columns"><div className="allocation-table-wrap"><div className="allocation-subhead"><h4>Recommended assignments</h4><span>{assignments.length} matches</span></div><div className="allocation-table-scroll"><table><thead><tr><th>Event</th><th>Assigned room</th><th>Schedule</th><th>Seats</th></tr></thead><tbody>{assignments.map((item) => <tr key={item.eventId}><td><strong>{item.eventTitle || item.title || item.eventId}</strong><small>{item.attendees} attendees</small></td><td>{item.resourceName || item.resourceId}</td><td>{formatDateTime(item.start)}<small>{durationHours(item.start, item.end).toFixed(1)} hours</small></td><td><span className="table-seat">{item.capacity} <ArrowDownRight size={13} /> {item.seatWaste ?? Math.max(0, (item.capacity || 0) - (item.attendees || 0))} spare</span></td></tr>)}</tbody></table>{!assignments.length && <p className="table-empty">No events could be assigned in this planning window.</p>}</div></div><div className="allocation-side"><div className="allocation-subhead"><h4>Room use</h4><span>{rooms.length} rooms</span></div><div className="allocation-room-list">{rooms.map((room) => <div className="allocation-room" key={room.resourceId}><div><strong>{room.resourceName || room.resourceId}</strong><span>{formatPercent(room.utilizationPercent)}</span></div><div className="progress-track"><span style={{ width: `${Math.min(100, Math.max(0, Number(room.utilizationPercent) || 0))}%` }} /></div></div>)}</div>{unassigned.length > 0 && <div className="unassigned-box"><h4><CircleAlert size={17} /> Needs review ({unassigned.length})</h4>{unassigned.slice(0, 5).map((item) => <p key={item.eventId}><strong>{item.eventTitle || item.eventId}</strong><span>{item.reason}</span></p>)}{unassigned.length > 5 && <small>+{unassigned.length - 5} more events</small>}</div>}</div></div></div>;
}

export default App;
