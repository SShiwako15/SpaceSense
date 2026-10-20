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
                r.Status == "confirmed" && r.Start < end && start < r.End).ToArray();
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
                r.Status == "confirmed" && r.Start < input.End && input.Start < r.End).ToArray();
            if (conflicts.Length > 0) return new(null, conflicts, false);

            var saved = new Reservation(id ?? Guid.NewGuid().ToString("N"), input.ResourceId!,
                input.Title!.Trim(), input.Organizer!.Trim(), input.Start, input.End,
                input.Attendees, "confirmed");
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
        var date = CampusTime.Today.AddDays(1);
        return new List<Reservation>
        {
            Seed("seminar", "Intro to Data Science", "Dr. Morgan Lee", date, 10, 12, 27),
            Seed("study-a", "Graduate study group", "Maya Chen", date, 14, 16, 6),
            Seed("lab-east", "Robotics lab session", "Prof. Reed", date.AddDays(1), 13, 16, 22),
            Seed("lecture-a", "Campus research forum", "Research Office", date.AddDays(2), 9, 11, 75),
            Seed("studio", "Design workshop", "Alex Rivera", date.AddDays(3), 15, 17, 18)
        };
    }

    private static Reservation Seed(string resourceId, string title, string organizer,
        DateOnly date, int startHour, int endHour, int attendees) =>
        new(Guid.NewGuid().ToString("N"), resourceId, title, organizer,
            CampusTime.At(date, startHour), CampusTime.At(date, endHour), attendees, "confirmed");
}

public sealed record SaveResult(Reservation? Reservation, IReadOnlyList<Reservation> Conflicts, bool NotFound);
