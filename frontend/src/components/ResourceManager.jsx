import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "../icons.jsx";
import { api } from "../api";

const blankResource = {
  id: "",
  name: "",
  type: "classroom",
  building: "",
  capacity: 30,
  features: "",
  accessible: true,
  description: "",
  requiresApproval: false,
};

const inputClass = "w-full rounded-md border border-line bg-white px-2.5 py-2 text-[13px] text-ink";
const labelClass = "grid gap-1 text-[12px] font-bold text-[#587079]";

export function ResourceManager({ resources, onChanged }) {
  const [form, setForm] = useState(blankResource);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function beginEdit(resource) {
    setEditingId(resource.id);
    setForm({ ...resource, features: (resource.features || []).join(", ") });
    setError("");
  }

  function reset() {
    setEditingId("");
    setForm(blankResource);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      capacity: Number(form.capacity),
      features: String(form.features).split(",").map((feature) => feature.trim()).filter(Boolean),
    };
    try {
      if (editingId) await api.updateResource(editingId, payload);
      else await api.createResource(payload);
      reset();
      await onChanged();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(resource) {
    if (!globalThis.confirm(`Delete ${resource.name}? Resources referenced by reservations, maintenance, or waitlist entries cannot be deleted.`)) return;
    setError("");
    try {
      await api.deleteResource(resource.id);
      await onChanged();
    } catch (reason) {
      setError(reason.message);
    }
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <section id="catalog" className="mb-5 rounded-[15px] border border-line bg-white p-6">
      <div className="mb-4 flex items-end justify-between gap-3 max-[600px]:items-start max-[600px]:flex-col">
        <div>
          <span className="font-display text-[12px] font-extrabold tracking-[1.55px] text-[#228474] uppercase">CAMPUS CATALOG</span>
          <h2 className="m-0 mt-1 font-display text-[20px] font-bold text-ink">Manage resources</h2>
          <p className="mt-1 text-[13px] text-muted">Add rooms and equipment, or update their capacity and booking requirements.</p>
        </div>
        <span className="text-[13px] text-muted">{resources.length} resources</span>
      </div>

      {error && <div className="mb-3 rounded-lg bg-[#fff2ec] p-2.5 text-[13px] text-[#b85c45]" role="alert">{error}</div>}

      <form className="mb-5 rounded-lg bg-[#f6f9f7] p-4" onSubmit={submit}>
        <div className="mb-3 flex items-center justify-between">
          <strong className="text-[13px] text-ink">{editingId ? `Edit ${editingId}` : "Add a resource"}</strong>
          {editingId && <button type="button" className="inline-flex items-center gap-1 text-[12px] font-bold text-muted" onClick={reset}><X size={14} /> Cancel edit</button>}
        </div>
        <div className="grid grid-cols-3 gap-3 max-[700px]:grid-cols-2 max-[540px]:grid-cols-1">
          {!editingId && <label className={labelClass}><span>Resource ID</span><input className={inputClass} value={form.id} onChange={(event) => update("id", event.target.value)} placeholder="e.g. north-lab-101" pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,49}" title="Use 2–50 letters, numbers, or hyphens." required /></label>}
          <label className={labelClass}><span>Name</span><input className={inputClass} value={form.name} onChange={(event) => update("name", event.target.value)} maxLength={100} required /></label>
          <label className={labelClass}><span>Type</span><select className={inputClass} value={form.type} onChange={(event) => update("type", event.target.value)}><option value="classroom">Classroom</option><option value="lab">Lab</option><option value="study">Study</option><option value="equipment">Equipment</option></select></label>
          <label className={labelClass}><span>Building / location</span><input className={inputClass} value={form.building} onChange={(event) => update("building", event.target.value)} maxLength={100} required /></label>
          <label className={labelClass}><span>Capacity</span><input className={inputClass} type="number" min="1" max="500" value={form.capacity} onChange={(event) => update("capacity", event.target.value)} required /></label>
          <label className={labelClass}><span>Features (comma-separated)</span><input className={inputClass} value={form.features} onChange={(event) => update("features", event.target.value)} placeholder="projector, whiteboard" /></label>
          <label className={labelClass}><span>Description</span><input className={inputClass} value={form.description} onChange={(event) => update("description", event.target.value)} maxLength={300} /></label>
          <label className="flex items-center gap-2 text-[12px] font-bold text-[#587079]"><input type="checkbox" checked={Boolean(form.accessible)} onChange={(event) => update("accessible", event.target.checked)} /> Accessible</label>
          <label className="flex items-center gap-2 text-[12px] font-bold text-[#587079]"><input type="checkbox" checked={Boolean(form.requiresApproval)} onChange={(event) => update("requiresApproval", event.target.checked)} /> Require staff approval</label>
        </div>
        <div className="mt-3 flex justify-end">
          <button className="inline-flex items-center gap-1.5 rounded-md border-0 bg-[#07354e] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50" type="submit" disabled={saving}>{editingId ? <Pencil size={13} /> : <Plus size={13} />}{saving ? "Saving…" : editingId ? "Save changes" : "Add resource"}</button>
        </div>
      </form>

      <div className="grid gap-2">
        {resources.map((resource) => (
          <article key={resource.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e8eeea] p-3">
            <div className="min-w-0">
              <strong className="block truncate text-[13px] text-ink">{resource.name} <span className="font-normal text-muted">· {resource.id}</span></strong>
              <span className="text-[12px] text-muted">{resource.building} · {resource.type} · {resource.capacity} {resource.type === "equipment" ? "units" : "seats"}{resource.requiresApproval ? " · approval required" : ""}</span>
            </div>
            <div className="flex gap-1.5">
              <button type="button" className="rounded-md border border-line bg-white p-2 text-teal" aria-label={`Edit ${resource.name}`} onClick={() => beginEdit(resource)}><Pencil size={14} /></button>
              <button type="button" className="rounded-md border border-line bg-white p-2 text-[#ad654d]" aria-label={`Delete ${resource.name}`} onClick={() => remove(resource)}><Trash2 size={14} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
