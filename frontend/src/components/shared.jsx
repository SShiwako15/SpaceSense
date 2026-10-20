import { ArrowUpRight, Building2, FlaskConical, Lightbulb, MapPin, MonitorPlay, Search, ShieldCheck, Users } from '../icons.jsx';
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
  const unit =
    String(resource.type).toLowerCase() === "equipment" ? "unit" : "seat";
  return `${resource.capacity} ${unit}${Number(resource.capacity) === 1 ? "" : "s"}`;
}

export function shortName(name) {
  return String(name || "SP")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export function formatPercent(value) {
  const number = Number(value);
  return `${Number.isFinite(number) ? Math.round(number) : 0}%`;
}

export function PanelTitle({ eyebrow, title, description, action, className = "" }) {
  return (
    <div className={`mb-[18px] flex items-end justify-between gap-4 max-[540px]:items-start ${className}`}>
      <div>
        {eyebrow && <span className="inline-flex items-center gap-[5px] font-display text-[9px] font-extrabold tracking-[1.55px] text-[#228474] uppercase">{eyebrow}</span>}
        <h2 className="mt-[5px] mb-1 font-display text-[21px] font-bold tracking-[-0.65px] text-[#1b353d] max-[540px]:text-[18px]">{title}</h2>
        {description && <p className="m-0 text-[11px] text-[#839296]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon = Search, title, description, action }) {
  return (
    <div className="grid justify-items-center rounded-[13px] border border-dashed border-[#d7e3dd] bg-white px-5 py-[55px] text-center">
      <span className="mb-[15px] grid size-[54px] place-items-center rounded-2xl bg-[#e9f4ef] text-[#248674]">
        <Icon size={26} strokeWidth={1.7} />
      </span>
      <h3 className="mt-0 mb-1.5 font-display text-[17px] font-bold">{title}</h3>
      <p className="mt-0 mb-3.5 max-w-[320px] text-[11px] leading-[1.5] text-[#849397]">{description}</p>
      {action}
    </div>
  );
}

export function ResourceCard({ resource, onBook, windowLabel }) {
  const Icon = resourceIcon(resource.type);
  const tone = resourceTone(resource.type);
  const visualTone = {
    mint: "bg-[linear-gradient(115deg,#c3dcd3,#a6c9bd)]",
    peach: "bg-[linear-gradient(115deg,#f0d5c3,#ebc4a9)]",
    lavender: "bg-[linear-gradient(115deg,#dcdde9,#c9cbe2)]",
    blue: "bg-[linear-gradient(115deg,#c9dce9,#afcbdc)]",
  };
  const iconTone = {
    mint: "text-[#245e56]",
    peach: "text-[#8e5d41]",
    lavender: "text-[#606985]",
    blue: "text-[#476e84]",
  };
  const featureClass = "rounded-[5px] border border-[#e7eeea] bg-[#f0f4f1] px-[7px] py-[5px] text-[9px] whitespace-nowrap text-[#617980]";
  return (
    <article className="min-w-0 overflow-hidden rounded-[13px] border border-[#e2e8e5] bg-white shadow-[0_5px_17px_#16343b09] transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px] hover:shadow-[0_14px_25px_#16343b16]">
      <div className={`relative h-[134px] overflow-hidden max-[540px]:h-[150px] ${visualTone[tone]}`}>
        <div aria-hidden="true" className="absolute top-[7px] left-[35%] h-[105px] w-[180px] -rotate-30 rounded-full border border-[#ffffff8c]" />
        <div aria-hidden="true" className="absolute -top-[11px] left-1/4 h-[145px] w-[270px] -rotate-30 rounded-full border border-[#ffffff75]" />
        <div aria-hidden="true" className="absolute inset-0 bg-[repeating-linear-gradient(115deg,transparent_0_26px,#ffffff1d_27px_28px)] [mask-image:linear-gradient(90deg,transparent,black)]" />
        <div className={`absolute top-[26px] left-[calc(50%-38px)] grid size-[76px] -rotate-6 place-items-center rounded-[20px] border border-[#ffffff88] bg-[#ffffff3c] shadow-[0_10px_28px_#28534720] backdrop-blur-[4px] ${iconTone[tone]}`}>
          <Icon size={42} strokeWidth={1.35} />
        </div>
        <span className="absolute top-4 left-4 text-[9px] font-extrabold tracking-[1px] text-[#315f58]">
          {shortName(resource.name)} /{" "}
          {String(resource.id).slice(0, 3).toUpperCase()}
        </span>
        <span className="absolute right-[13px] bottom-3 flex items-center gap-1 rounded-md bg-[#fffffff0] px-2 py-1.5 text-[9px] font-extrabold text-[#2a5b53]">
          <Users size={13} /> {capacityText(resource)}
        </span>
      </div>
      <div className="px-[18px] pt-[17px] pb-[13px] max-[1250px]:px-[13px] max-[1250px]:pt-[15px] max-[1250px]:pb-3">
        <div className="flex items-center justify-between gap-1.5 text-[9px] font-extrabold tracking-[0.9px] text-[#278372] uppercase">
          <span>{resource.type || "Campus space"}</span>
          {resource.accessible && (
            <span className="flex items-center gap-[3px] text-[8px] tracking-normal text-[#78938d] normal-case" title="Accessible space">
              <ShieldCheck size={14} /> Accessible
            </span>
          )}
        </div>
        <h3 className="mt-[9px] mb-[7px] font-display text-base leading-[1.2] font-bold tracking-[-0.3px] text-[#213b43]">{resource.name}</h3>
        <p className="mt-0 mb-[11px] flex items-center gap-1 text-[10px] text-[#819397]">
          <MapPin size={14} /> {resource.building || "Campus"}
        </p>
        <p className="mt-0 mb-3 line-clamp-2 min-h-[31px] text-[10px] leading-[1.55] text-[#6d8086] max-[540px]:min-h-0">
          {resource.description ||
            "A flexible space for campus activities and collaboration."}
        </p>
        <div className="flex min-h-[25px] flex-wrap gap-[5px]">
          {(resource.features || []).slice(0, 3).map((feature) => (
            <span className={featureClass} key={feature}>{feature}</span>
          ))}
          {(resource.features || []).length > 3 && (
            <span className={featureClass}>+{resource.features.length - 3}</span>
          )}
        </div>
        <div className="mt-[13px] flex items-center justify-between border-t border-[#edf0ee] pt-[11px]">
          <span className="flex items-center gap-1.5 text-[9px] font-extrabold text-[#288475]">
            <span className="inline-block size-1.5 rounded-full bg-[#47af86] shadow-[0_0_0_3px_#def3e9]" /> Available {windowLabel}
          </span>
          <button
            className="grid size-[29px] place-items-center rounded-[7px] border-0 bg-[#1e8374] text-white hover:bg-[#136d61]"
            type="button"
            onClick={() => onBook(resource)}
            aria-label={`Book ${resource.name}`}
          >
            <ArrowUpRight size={20} />
          </button>
        </div>
      </div>
    </article>
  );
}

