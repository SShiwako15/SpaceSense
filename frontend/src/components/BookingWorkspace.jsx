import { useRef } from "react";
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, Search, Send, SlidersHorizontal, Sparkles, X } from "../icons.jsx";
import { initialSearchTime, toDateInput } from "../dates";

const suggestions = [
  "Find a room for 20 students with a projector next Tuesday afternoon",
  "I need an accessible study space for 8 people tomorrow morning",
];

export function BookingWorkspace({ filters, updateFilter, runSearch, typeOptions, featureOptions, toggleFeature, naturalPrompt, setNaturalPrompt, naturalLoading, handleNaturalSearch, interpretation, setInterpretation, searchLoading, filtersChanged, resetFilters }) {
  const promptRef = useRef(null);
  function focusAssistant(prompt) {
    if (typeof prompt === "string") setNaturalPrompt(prompt);
    promptRef.current?.focus();
    promptRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
  }
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">A little space for your next big idea</span><h1>{filters.type === "equipment" ? "Find the right equipment." : "Find a space. Make it yours."}</h1><p>Rooms, study spots, and equipment. All in one place.</p></div>
      <button className="button button-primary assistant-shortcut" type="button" onClick={() => focusAssistant()}><Sparkles size={17} />Let AI find a space</button>
    </div>
    <div className="booking-workspace">
      <section className="search-panel" aria-labelledby="search-heading">
        <div className="search-panel-heading"><h2 id="search-heading">What are you looking for?</h2><SlidersHorizontal size={18} /></div>
        <form className="resource-search" onSubmit={(event) => { event.preventDefault(); runSearch(filters); }}>
          <div className="search-field"><Search size={19} /><input aria-label="Search resources" placeholder="Room, building, or keyword" value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} /></div>
          <div className="field-grid">
            <label className="field"><span>Space type</span><select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)}><option value="">All spaces & equipment</option>{typeOptions.map((type) => <option key={type} value={type}>{type === "study" ? "Study space" : type.charAt(0).toUpperCase() + type.slice(1)}</option>)}</select></label>
            <label className="field"><span>{filters.type === "equipment" ? "Minimum units" : "People"}</span><input type="number" min="1" value={filters.minCapacity} onChange={(event) => updateFilter("minCapacity", event.target.value)} placeholder="Any size" /></label>
          </div>
          <label className="field date-field"><span>Date</span><input type="date" required value={filters.date} onChange={(event) => updateFilter("date", event.target.value)} /></label>
          <div className="date-shortcuts" aria-label="Date shortcuts"><button type="button" aria-pressed={filters.date === toDateInput(new Date())} onClick={() => updateFilter("date", toDateInput(new Date()))}>Today</button><button type="button" aria-pressed={filters.date === initialSearchTime().date} onClick={() => updateFilter("date", initialSearchTime().date)}>Tomorrow</button><span>Eastern time</span></div>
          <div className="field-grid time-fields"><label className="field"><span>From</span><input type="time" value={filters.startTime} onChange={(event) => updateFilter("startTime", event.target.value)} required /></label><label className="field"><span>Until</span><input type="time" value={filters.endTime} onChange={(event) => updateFilter("endTime", event.target.value)} required /></label></div>
          <details className="more-filters"><summary>Features & accessibility<span>{filters.features.length + Number(filters.accessible) || <SlidersHorizontal size={15} />}</span></summary><div className="filter-options">{featureOptions.map((feature) => <button type="button" key={feature} className={`filter-chip ${filters.features.includes(feature) ? "selected" : ""}`} aria-pressed={filters.features.includes(feature)} onClick={() => toggleFeature(feature)}>{filters.features.includes(feature) && <Check size={13} />}{feature}</button>)}<button type="button" className={`filter-chip ${filters.accessible ? "selected" : ""}`} aria-pressed={filters.accessible} onClick={() => updateFilter("accessible", !filters.accessible)}>{filters.accessible && <Check size={13} />}Accessible</button></div></details>
          <div className="search-submit"><button className="button button-primary" type="submit" disabled={searchLoading}>{searchLoading ? "Finding spaces…" : "Find spaces"}<Search size={17} /></button><button className="text-button" type="button" onClick={resetFilters}>Reset</button></div>
          {filtersChanged && <p className="filter-notice" role="status">Filters changed. Select Find spaces to update results.</p>}
        </form>
      </section>
      <section className="assistant-panel" aria-labelledby="assistant-heading" aria-busy={naturalLoading}>
        <div className="assistant-topline"><span><span className="assistant-mini-icon"><Sparkles size={16} /></span>YOUR BOOKING COMPANION</span><span className="assistant-status"><span />Ready to help</span></div>
        <div className="assistant-intro"><span className="assistant-orb"><Sparkles size={28} strokeWidth={1.5} /></span><h2 id="assistant-heading">Less searching.<br />More getting together.</h2><p>Tell your AI Assistant what you have in mind.<br className="desktop-break" /> We’ll find available spaces that fit.</p></div>
        <div className="assistant-suggestions"><span>Not sure where to start? Try one of these.</span><div>{suggestions.map((prompt) => <button key={prompt} type="button" onClick={() => focusAssistant(prompt)}>{prompt}<ArrowUpRight size={17} /></button>)}</div></div>
        {interpretation && <div className="assistant-response" role="status"><CheckCircle2 size={19} /><div><strong>{interpretation.explanation || "Your search is ready."}</strong><p>I’ve updated your filters and results. Review a space below to book it.</p></div><button type="button" className="icon-button" aria-label="Dismiss assistant result" onClick={() => setInterpretation(null)}><X size={16} /></button></div>}
        <form className="assistant-composer" onSubmit={handleNaturalSearch}><label htmlFor="assistant-prompt" className="sr-only">Describe your space needs</label><textarea id="assistant-prompt" ref={promptRef} value={naturalPrompt} onChange={(event) => setNaturalPrompt(event.target.value)} placeholder="A quiet room for 8 people tomorrow, with a whiteboard…" rows={2} required maxLength={500} /><div><span><Sparkles size={13} />Your words. A smarter search.</span><button className="button button-primary" type="submit" disabled={naturalLoading || !naturalPrompt.trim()}>{naturalLoading ? "Searching…" : "Ask SpaceSense"}<Send size={15} /></button></div></form>
        <p className="assistant-footnote">You review the details and confirm every booking.</p>
      </section>
    </div>
  </>;
}
