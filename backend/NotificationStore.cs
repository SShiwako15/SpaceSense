using System.Text.Json;

namespace SpaceSense.Api;

public sealed record CampusNotification(
    string Id,
    string Type,
    string Title,
    string Message,
    DateTimeOffset CreatedAt,
    bool IsRead,
    string? ReservationId,
    string? SeriesId);

public sealed class NotificationStore
{
    private const int MaximumNotifications = 250;
    private readonly object _gate = new();
    private readonly string _path;
    private List<CampusNotification> _notifications;

    public NotificationStore(IHostEnvironment environment)
    {
        var directory = Path.Combine(environment.ContentRootPath, "Data");
        Directory.CreateDirectory(directory);
        _path = Path.Combine(directory, "notifications.json");
        _notifications = File.Exists(_path)
            ? JsonSerializer.Deserialize<List<CampusNotification>>(File.ReadAllText(_path)) ?? []
            : [];
    }

    public (IReadOnlyList<CampusNotification> Notifications, int UnreadCount) List()
    {
        lock (_gate)
        {
            var sorted = _notifications.OrderByDescending(item => item.CreatedAt).ToArray();
            return (sorted, sorted.Count(item => !item.IsRead));
        }
    }

    public CampusNotification Add(string type, string title, string message,
        string? reservationId = null, string? seriesId = null)
    {
        lock (_gate)
        {
            var notification = new CampusNotification(Guid.NewGuid().ToString("N"), type,
                title, message, DateTimeOffset.UtcNow, false, reservationId, seriesId);
            var next = _notifications.Append(notification)
                .OrderByDescending(item => item.CreatedAt)
                .Take(MaximumNotifications)
                .ToList();
            Persist(next);
            _notifications = next;
            return notification;
        }
    }

    public bool MarkRead(string id)
    {
        lock (_gate)
        {
            var index = _notifications.FindIndex(item => item.Id == id);
            if (index < 0) return false;
            if (_notifications[index].IsRead) return true;
            var next = _notifications.ToList();
            next[index] = next[index] with { IsRead = true };
            Persist(next);
            _notifications = next;
            return true;
        }
    }

    public void MarkAllRead()
    {
        lock (_gate)
        {
            if (_notifications.All(item => item.IsRead)) return;
            var next = _notifications.Select(item => item with { IsRead = true }).ToList();
            Persist(next);
            _notifications = next;
        }
    }

    private void Persist(List<CampusNotification> notifications)
    {
        var temp = _path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temp, JsonSerializer.Serialize(notifications, new JsonSerializerOptions
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
