using System.Text.Json;

namespace SpaceSense.Api;

public sealed class ReservationStore
{
    private readonly object _gate = new();
    private readonly string _path;
    private List<Reservation> _reservations;

    public ReservationStore(IHostEnvironment environment)
    {
        _path = Path.Combine(environment.ContentRootPath, "Data", "reservations.json");
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        if (File.Exists(_path))
        {
            _reservations = JsonSerializer.Deserialize<List<Reservation>>(File.ReadAllText(_path))
                ?? throw new InvalidDataException("Reservation data is empty or invalid.");
        }
        else
        {
            _reservations = SeedReservations();
            Persist(_reservations);
        }
    }

    public IReadOnlyList<Reservation> List()
    {
        lock (_gate) return _reservations.ToArray();
    }

    public Reservation? Get(string id)
    {
        lock (_gate) return _reservations.FirstOrDefault(r => r.Id == id);
    }

    public IReadOnlyList<Reservation> Conflicts(string resourceId, DateTimeOffset start, DateTimeOffset end, string? excludeId = null)
    {
        lock (_gate)
            return _reservations.Where(r => r.ResourceId.Equals(resourceId, StringComparison.OrdinalIgnoreCase) && r.Id != excludeId &&
                IsBlocking(r.Status) && r.Start < end && start < r.End).ToArray();
    }

    // The conflict check and persistence happen under one lock. The saved list is only
    // published after its replacement file has been written successfully.
    public SaveResult Save(ReservationInput input, string? id = null)
    {
        lock (_gate)
        {
            var existing = id is null ? null : _reservations.FirstOrDefault(r => r.Id == id);
            if (id is not null && existing is null) return new(null, Array.Empty<Reservation>(), true);

            var conflicts = _reservations.Where(r => r.ResourceId.Equals(input.ResourceId, StringComparison.OrdinalIgnoreCase) && r.Id != id &&
                IsBlocking(r.Status) && r.Start < input.End && input.Start < r.End).ToArray();
            if (conflicts.Length > 0) return new(null, conflicts, false);

            var requiresApproval = ResourceCatalog.Find(input.ResourceId!)?.RequiresApproval == true;
            var status = existing?.Status == "pending" || requiresApproval ? "pending" : "confirmed";
            var saved = new Reservation(id ?? Guid.NewGuid().ToString("N"), input.ResourceId!,
                input.Title!.Trim(), input.Organizer!.Trim(), input.Start, input.End,
                input.Attendees, status);
            var next = _reservations.Where(r => r.Id != id).Append(saved)
                .OrderBy(r => r.Start).ToList();
            Persist(next);
            _reservations = next;
            return new(saved, Array.Empty<Reservation>(), false);
        }
    }

    public bool Delete(string id)
    {
        lock (_gate)
        {
            if (!_reservations.Any(r => r.Id == id)) return false;
            var next = _reservations.Where(r => r.Id != id).ToList();
            Persist(next);
            _reservations = next;
            return true;
        }
    }

    private void Persist(List<Reservation> reservations)
    {
        var temp = _path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temp, JsonSerializer.Serialize(reservations, new JsonSerializerOptions
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

    private static List<Reservation> SeedReservations()
    {
        var today = CampusTime.Today;
        var date = today.AddDays(1);
        var reservations = new List<Reservation>
        {
            Seed("seminar", "Intro to Data Science", "Dr. Morgan Lee", date, 10, 12, 27),
            Seed("study-a", "Graduate study group", "Maya Chen", date, 14, 16, 6),
            Seed("lab-east", "Robotics lab session", "Prof. Reed", date.AddDays(1), 13, 16, 22),
            Seed("lecture-a", "Campus research forum", "Research Office", date.AddDays(2), 9, 11, 75),
            Seed("studio", "Design workshop", "Alex Rivera", date.AddDays(3), 15, 17, 18)
        };

        // Eight completed weeks give the demo a repeatable weekday demand pattern.
        // Each room appears at most once per day, so these reservations never overlap.
        for (var offset = -56; offset < 0; offset++)
        {
            var day = today.AddDays(offset);
            if (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) continue;

            var week = (offset + 56) / 7;
            reservations.Add(History("class-201", "Applied Mathematics", "Academic Scheduling",
                day, 9, 11, 26 + week % 5));
            reservations.Add(History("study-a", "Student study session", "Student Groups",
                day, 15, 17, 4 + week % 4));

            if (day.DayOfWeek is DayOfWeek.Monday or DayOfWeek.Wednesday or DayOfWeek.Friday)
                reservations.Add(History("seminar", "Faculty seminar", "Academic Scheduling",
                    day, 12, 14, 18 + week % 6));
            if (day.DayOfWeek is DayOfWeek.Tuesday or DayOfWeek.Thursday)
                reservations.Add(History("lab-east", "Programming laboratory", "Computer Science",
                    day, 13, 16, 19 + week % 7));
            if (day.DayOfWeek is DayOfWeek.Monday or DayOfWeek.Thursday)
                reservations.Add(History("lecture-b", "Campus lecture", "Academic Scheduling",
                    day, 10, 12, 52 + week % 9));
            if (day.DayOfWeek is DayOfWeek.Wednesday or DayOfWeek.Friday)
                reservations.Add(History("studio", "Collaborative workshop", "Student Groups",
                    day, 14, 16, 12 + week % 7));
            if (day.DayOfWeek is DayOfWeek.Tuesday)
                reservations.Add(History("lab-maker", "Maker skills workshop", "Innovation Center",
                    day, 9, 11, 10 + week % 6));
        }

        return reservations.OrderBy(r => r.Start).ToList();
    }

    public DecisionResult Approve(string id)
    {
        lock (_gate)
        {
            var existing = _reservations.FirstOrDefault(r => r.Id == id);
            if (existing is null) return new(null, Array.Empty<Reservation>(), true, false);
            if (existing.Status != "pending") return new(existing, Array.Empty<Reservation>(), false, true);

            var conflicts = _reservations.Where(r => r.Id != id &&
                r.ResourceId.Equals(existing.ResourceId, StringComparison.OrdinalIgnoreCase) &&
                IsBlocking(r.Status) && r.Start < existing.End && existing.Start < r.End).ToArray();
            if (conflicts.Length > 0) return new(null, conflicts, false, false);

            var approved = existing with { Status = "confirmed" };
            var next = _reservations.Select(r => r.Id == id ? approved : r).ToList();
            Persist(next);
            _reservations = next;
            return new(approved, Array.Empty<Reservation>(), false, false);
        }
    }

    public DecisionResult Reject(string id)
    {
        lock (_gate)
        {
            var existing = _reservations.FirstOrDefault(r => r.Id == id);
            if (existing is null) return new(null, Array.Empty<Reservation>(), true, false);
            if (existing.Status != "pending") return new(existing, Array.Empty<Reservation>(), false, true);

            var rejected = existing with { Status = "rejected" };
            var next = _reservations.Select(r => r.Id == id ? rejected : r).ToList();
            Persist(next);
            _reservations = next;
            return new(rejected, Array.Empty<Reservation>(), false, false);
        }
    }

    private static Reservation Seed(string resourceId, string title, string organizer,
        DateOnly date, int startHour, int endHour, int attendees) =>
        new(Guid.NewGuid().ToString("N"), resourceId, title, organizer,
            CampusTime.At(date, startHour), CampusTime.At(date, endHour), attendees, "confirmed");

    private static Reservation History(string resourceId, string title, string organizer,
        DateOnly date, int startHour, int endHour, int attendees) =>
        new($"history-{date:yyyyMMdd}-{resourceId}", resourceId, title, organizer,
            CampusTime.At(date, startHour), CampusTime.At(date, endHour), attendees, "confirmed");

    private static bool IsBlocking(string status) => status is "confirmed" or "pending";
}

public sealed record SaveResult(Reservation? Reservation, IReadOnlyList<Reservation> Conflicts, bool NotFound);
public sealed record DecisionResult(Reservation? Reservation, IReadOnlyList<Reservation> Conflicts,
    bool NotFound, bool InvalidState);
