using System.Text.Json;

namespace SpaceSense.Api;

public sealed record WaitlistInput(
    string? ResourceId,
    string? Title,
    string? Organizer,
    DateTimeOffset Start,
    DateTimeOffset End,
    int Attendees);

public sealed record WaitlistEntry(
    string Id,
    string ResourceId,
    string Title,
    string Organizer,
    DateTimeOffset Start,
    DateTimeOffset End,
    int Attendees,
    DateTimeOffset CreatedAt,
    string Status);

public sealed class WaitlistStore
{
    private readonly object _gate = new();
    private readonly string _path;
    private List<WaitlistEntry> _entries;

    public WaitlistStore(IHostEnvironment environment)
    {
        var directory = Path.Combine(environment.ContentRootPath, "Data");
        Directory.CreateDirectory(directory);
        _path = Path.Combine(directory, "waitlist.json");
        _entries = File.Exists(_path)
            ? JsonSerializer.Deserialize<List<WaitlistEntry>>(File.ReadAllText(_path)) ?? []
            : [];
    }

    public IReadOnlyList<WaitlistEntry> List()
    {
        lock (_gate) return _entries.OrderBy(entry => entry.CreatedAt).ToArray();
    }

    public (WaitlistEntry? Entry, bool Duplicate) Add(WaitlistInput input)
    {
        lock (_gate)
        {
            var duplicate = _entries.FirstOrDefault(entry =>
                entry.Status == "waiting" &&
                entry.ResourceId.Equals(input.ResourceId, StringComparison.OrdinalIgnoreCase) &&
                entry.Start == input.Start && entry.End == input.End &&
                entry.Organizer.Equals(input.Organizer!.Trim(), StringComparison.OrdinalIgnoreCase));
            if (duplicate is not null) return (duplicate, true);

            var entry = new WaitlistEntry(Guid.NewGuid().ToString("N"), input.ResourceId!,
                input.Title!.Trim(), input.Organizer!.Trim(), input.Start, input.End,
                input.Attendees, DateTimeOffset.UtcNow, "waiting");
            var next = _entries.Append(entry).OrderBy(item => item.CreatedAt).ToList();
            Persist(next);
            _entries = next;
            return (entry, false);
        }
    }

    public IReadOnlyList<WaitlistEntry> Matching(string resourceId, DateTimeOffset start, DateTimeOffset end)
    {
        lock (_gate) return _entries.Where(entry => entry.Status == "waiting" &&
            entry.ResourceId.Equals(resourceId, StringComparison.OrdinalIgnoreCase) &&
            entry.Start < end && start < entry.End).OrderBy(entry => entry.CreatedAt).ToArray();
    }

    public bool MarkNotified(string id)
    {
        lock (_gate)
        {
            var index = _entries.FindIndex(entry => entry.Id == id && entry.Status == "waiting");
            if (index < 0) return false;
            var next = _entries.ToList();
            next[index] = next[index] with { Status = "notified" };
            Persist(next);
            _entries = next;
            return true;
        }
    }

    public bool Delete(string id)
    {
        lock (_gate)
        {
            var next = _entries.Where(entry => entry.Id != id).ToList();
            if (next.Count == _entries.Count) return false;
            Persist(next);
            _entries = next;
            return true;
        }
    }

    private void Persist(List<WaitlistEntry> entries)
    {
        var temp = _path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temp, JsonSerializer.Serialize(entries, new JsonSerializerOptions
            {
                WriteIndented = true
            }));
            File.Move(temp, _path, true);
        }
        finally
        {
            if (File.Exists(temp)) File.Delete(temp);
        }
    }
}

public static class WaitlistNotifier
{
    public static void NotifyAvailable(WaitlistStore waitlist, ReservationStore reservations,
        NotificationStore notifications, string resourceId, DateTimeOffset start, DateTimeOffset end)
    {
        foreach (var entry in waitlist.Matching(resourceId, start, end))
        {
            if (reservations.Conflicts(entry.ResourceId, entry.Start, entry.End).Count > 0 ||
                reservations.MaintenanceConflicts(entry.ResourceId, entry.Start, entry.End).Count > 0)
                continue;
            if (!waitlist.MarkNotified(entry.Id)) continue;

            var resourceName = ResourceCatalog.Find(entry.ResourceId)?.Name ?? "campus resource";
            notifications.Add("waitlist", "A waitlisted time may be available",
                $"{entry.Organizer}: {entry.Title} in {resourceName} for {entry.Start:MMM d, h:mm tt} may now be booked. Search again to confirm availability.");
        }
    }
}
