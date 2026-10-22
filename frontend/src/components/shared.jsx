import { ArrowUpRight, Building2, Clock3, FlaskConical, Lightbulb, MapPin, MonitorPlay, Search, ShieldCheck, Star, Users } from '../icons.jsx';

export function resourceIcon(type) {
  const value = String(type || "").toLowerCase();
  if (value.includes("lab")) return FlaskConical;
  if (value.includes("equipment")) return MonitorPlay;
  if (value.includes("study")) return Lightbulb;
  return Building2;
}
export function resourceTone(type) {
  const value = String(type || "").toLowerCase();
  if (value.includes("lab")) return "lavender";
  if (value.includes("study")) return "peach";
  if (value.includes("equipment")) return "blue";
  return "mint";
}
export function capacityText(resource) {
  const unit = String(resource.type).toLowerCase() === "equipment" ? "unit" : "seat";
  return `${resource.capacity} ${unit}${Number(resource.capacity) === 1 ? "" : "s"}`;
}
export function shortName(name) {
  return String(name || "SP").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
export function formatPercent(value) {
  const number = Number(value);
  return `${Number.isFinite(number) ? Math.round(number) : 0}%`;
}
export function PanelTitle({ eyebrow, title, description, action, className = "" }) {
  return <div className={`panel-title ${className}`}>
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>
    {action && <div className="panel-actions">{action}</div>}
  </div>;
}
export function EmptyState({ icon: Icon = Search, title, description, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={25} strokeWidth={1.7} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function ResourceCard({ resource, onBook, windowLabel, isFavorite, onToggleFavorite }) {
  const Icon = resourceIcon(resource.type);
  return <article className="resource-card">
    <div className={`resource-symbol ${resourceTone(resource.type)}`} aria-hidden="true"><Icon size={30} strokeWidth={1.5} /></div>
    <div className="resource-information">
      <div className="resource-title-row"><span className="type-badge">{resource.type === "study" ? "Study space" : resource.type}</span>{resource.requiresApproval && <span className="approval-badge">Staff approval</span>}</div>
      <h3>{resource.name}</h3>
      <p className="resource-description">{resource.description || "A flexible space for campus activities and collaboration."}</p>
      <div className="resource-meta"><span><MapPin size={16} />{resource.building || "Campus"}</span><span><Users size={16} />{capacityText(resource)}</span>{resource.accessible && <span><ShieldCheck size={16} />Accessible</span>}</div>
      <div className="resource-features">{(resource.features || []).map((feature) => <span key={feature}>{feature}</span>)}</div>
    </div>
    <div className="resource-actions">
      <button className={`icon-button favorite-button ${isFavorite ? "is-saved" : ""}`} type="button" onClick={() => onToggleFavorite(resource.id)} aria-label={`${isFavorite ? "Remove" : "Save"} ${resource.name} ${isFavorite ? "from" : "to"} favorites`} aria-pressed={Boolean(isFavorite)} title={isFavorite ? "Remove from saved spaces" : "Save this space"}><Star size={19} fill={isFavorite ? "currentColor" : "none"} /></button>
      <span className="availability-label"><span />Available for your time</span>
      <span className="availability-time"><Clock3 size={15} />{windowLabel}</span>
      <button className="button button-primary" type="button" onClick={() => onBook(resource)} aria-label={`Book ${resource.name}`}>{resource.type === "equipment" ? "Book equipment" : "Book this space"}<ArrowUpRight size={17} /></button>
    </div>
  </article>;
}
