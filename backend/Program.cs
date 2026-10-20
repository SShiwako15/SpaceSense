using System.Globalization;
using SpaceSense.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<ReservationStore>();
builder.Services.AddSingleton<NotificationStore>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .SetIsOriginAllowed(origin => Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
        (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || uri.Host == "127.0.0.1"))
    .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", timeZone = CampusTime.ZoneName }));

app.MapGet("/api/resources", (HttpRequest request, ReservationStore store) =>
{
    if (!ApiQueries.TryFilters(request, out var filters, out var error)) return Results.BadRequest(new { error });
    return Results.Ok(ResourceSearch.Find(filters!, store.List(), store.MaintenanceList()));
});

app.MapGet("/api/resources/{id}", (string id) =>
    ResourceCatalog.Find(id) is { } resource ? Results.Ok(resource) : Results.NotFound());

app.MapGet("/api/resources/{id}/availability", (string id, HttpRequest request, ReservationStore store) =>
{
    if (ResourceCatalog.Find(id) is not { } resource) return Results.NotFound();
    if (!ApiQueries.TryWindow(request, "start", "end", true, out var start, out var end, out var error))
        return Results.BadRequest(new { error });
    if (end!.Value - start!.Value > ApiQueries.MaxReservationDuration)
        return Results.BadRequest(new { error = "Reservations cannot exceed 12 hours." });
    var excludeId = request.Query["excludeId"].ToString();
    var conflicts = store.Conflicts(resource.Id, start.Value, end.Value,
        string.IsNullOrWhiteSpace(excludeId) ? null : excludeId);
    var maintenance = store.MaintenanceConflicts(resource.Id, start.Value, end.Value);
    return Results.Ok(new { resourceId = resource.Id, available = conflicts.Count == 0 && maintenance.Count == 0, conflicts, maintenanceConflicts = maintenance });
});

app.MapGet("/api/reservations", (HttpRequest request, ReservationStore store) =>
{
    if (!ApiQueries.TryWindow(request, "from", "to", false, out var from, out var to, out var error))
        return Results.BadRequest(new { error });
    var status = request.Query["status"].ToString();
    if (status.Length > 0 && status is not ("pending" or "confirmed" or "rejected"))
        return Results.BadRequest(new { error = "status must be pending, confirmed, or rejected." });
    var seriesId = request.Query["seriesId"].ToString();
    var result = store.List().Where(r => (status.Length == 0 || r.Status == status) &&
        (seriesId.Length == 0 || r.SeriesId == seriesId) &&
        (!from.HasValue || r.End > from.Value) &&
        (!to.HasValue || r.Start < to.Value)).OrderBy(r => r.Start).ToArray();
    return Results.Ok(result);
});

app.MapPost("/api/reservations", (ReservationInput input, ReservationStore store, NotificationStore notifications) =>
{
    var errors = ApiQueries.ValidateReservation(input);
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var canonicalInput = input with { ResourceId = ResourceCatalog.Find(input.ResourceId!)!.Id };
    if (canonicalInput.RepeatWeeks > 1)
    {
        var series = store.SaveSeries(canonicalInput);
        if (series.Invalid)
            return Results.BadRequest(new { error = "The repeated time window is invalid or exceeds 12 hours after a campus time change." });
        if (series.MaintenanceConflicts.Count > 0)
            return Results.Conflict(new { error = "One or more occurrences fall during scheduled maintenance.", maintenanceConflicts = series.MaintenanceConflicts });
        if (series.SeriesId is null)
            return Results.Conflict(new { error = "One or more occurrences are already booked.", conflicts = series.Conflicts });
        var first = series.Reservations[0];
        var resourceName = ResourceCatalog.Find(first.ResourceId)?.Name ?? "campus resource";
        notifications.Add(first.Status == "pending" ? "approval" : "reservation",
            first.Status == "pending" ? "Weekly series needs approval" : "Weekly series confirmed",
            $"{first.Title} in {resourceName}: {series.Reservations.Count} weekly occurrences starting {first.Start:MMM d, h:mm tt}.",
            first.Id, series.SeriesId);
        return Results.Created($"/api/reservations?seriesId={Uri.EscapeDataString(series.SeriesId)}",
            new { seriesId = series.SeriesId, reservations = series.Reservations });
    }
    var result = store.Save(canonicalInput);
    if (result.Reservation is null)
    {
        if (result.MaintenanceConflicts?.Count > 0)
            return Results.Conflict(new { error = "The selected time overlaps scheduled maintenance.", maintenanceConflicts = result.MaintenanceConflicts });
        return Results.Conflict(new { error = "Resource is already booked for this time.", conflicts = result.Conflicts });
    }
    var saved = result.Reservation;
    notifications.Add(saved.Status == "pending" ? "approval" : "reservation",
        saved.Status == "pending" ? "Reservation needs approval" : "Reservation confirmed",
        $"{saved.Title} in {ResourceCatalog.Find(saved.ResourceId)?.Name ?? "campus resource"} for {saved.Start:MMM d, h:mm tt}.",
        saved.Id, saved.SeriesId);
    return Results.Created($"/api/reservations/{saved.Id}", saved);
});

app.MapPut("/api/reservations/{id}", (string id, ReservationInput input, ReservationStore store, NotificationStore notifications) =>
{
    var errors = ApiQueries.ValidateReservation(input);
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var canonicalInput = input with { ResourceId = ResourceCatalog.Find(input.ResourceId!)!.Id };
    var result = store.Save(canonicalInput, id);
    if (result.NotFound) return Results.NotFound();
    if (result.Reservation is null)
    {
        if (result.MaintenanceConflicts?.Count > 0)
            return Results.Conflict(new { error = "The selected time overlaps scheduled maintenance.", maintenanceConflicts = result.MaintenanceConflicts });
        return Results.Conflict(new { error = "Resource is already booked for this time.", conflicts = result.Conflicts });
    }
    notifications.Add(result.Reservation.Status == "pending" ? "approval" : "reservation",
        result.Reservation.Status == "pending" ? "Reservation update needs approval" : "Reservation updated",
        $"{result.Reservation.Title} was updated for {result.Reservation.Start:MMM d, h:mm tt}.",
        result.Reservation.Id, result.Reservation.SeriesId);
    return Results.Ok(result.Reservation);
});

app.MapDelete("/api/reservations/{id}", (string id, ReservationStore store, NotificationStore notifications) =>
{
    var reservation = store.Get(id);
    if (reservation is null || !store.Delete(id)) return Results.NotFound();
    notifications.Add("cancellation", "Reservation cancelled",
        $"{reservation.Title} for {reservation.Start:MMM d, h:mm tt} was cancelled.", reservation.Id, reservation.SeriesId);
    return Results.NoContent();
});

app.MapDelete("/api/reservations/series/{seriesId}", (string seriesId, ReservationStore store, NotificationStore notifications) =>
{
    var series = store.List().Where(item => item.SeriesId == seriesId).ToArray();
    var deleted = store.DeleteSeries(seriesId);
    if (deleted == 0) return Results.NotFound();
    var first = series.FirstOrDefault();
    notifications.Add("cancellation", "Weekly series cancelled",
        $"{first?.Title ?? "Reservation series"}: {deleted} occurrences were cancelled.", first?.Id, seriesId);
    return Results.NoContent();
});

app.MapGet("/api/maintenance", (HttpRequest request, ReservationStore store) =>
{
    var resourceId = request.Query["resourceId"].ToString();
    var windows = store.MaintenanceList();
    return Results.Ok(resourceId.Length == 0 ? windows : windows.Where(window =>
        window.ResourceId.Equals(resourceId, StringComparison.OrdinalIgnoreCase)).ToArray());
});

app.MapPost("/api/maintenance", (MaintenanceInput input, ReservationStore store) =>
{
    var resource = input.ResourceId is null ? null : ResourceCatalog.Find(input.ResourceId);
    if (resource is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["resourceId"] = ["Choose an existing resource."] });
    if (input.Start == default || input.End <= input.Start || input.End - input.Start > TimeSpan.FromDays(90))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["end"] = ["Choose a valid maintenance window of up to 90 days."] });
    if (string.IsNullOrWhiteSpace(input.Reason) || input.Reason.Length > 200)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["reason"] = ["Reason is required and must be 200 characters or fewer."] });

    var result = store.CreateMaintenance(input with { ResourceId = resource.Id });
    return result.Window is null
        ? Results.Conflict(new { error = "Maintenance cannot overlap an active reservation.", conflicts = result.Conflicts })
        : Results.Created($"/api/maintenance/{result.Window.Id}", result.Window);
});

app.MapDelete("/api/maintenance/{id}", (string id, ReservationStore store) =>
    store.DeleteMaintenance(id) ? Results.NoContent() : Results.NotFound());

app.MapPost("/api/reservations/{id}/approve", (string id, ReservationStore store, NotificationStore notifications) =>
{
    var result = store.Approve(id);
    if (result.NotFound) return Results.NotFound();
    if (result.InvalidState) return Results.Conflict(new { error = "Only pending reservations can be approved." });
    if (result.MaintenanceConflicts?.Count > 0)
        return Results.Conflict(new { error = "The reservation overlaps scheduled maintenance.", maintenanceConflicts = result.MaintenanceConflicts });
    if (result.Reservation is null)
        return Results.Conflict(new { error = "The reservation conflicts with another active booking.", conflicts = result.Conflicts });
    notifications.Add("approval", "Reservation approved",
        $"{result.Reservation.Title} for {result.Reservation.Start:MMM d, h:mm tt} is confirmed.",
        result.Reservation.Id, result.Reservation.SeriesId);
    return Results.Ok(result.Reservation);
});

app.MapPost("/api/reservations/{id}/reject", (string id, ReservationStore store, NotificationStore notifications) =>
{
    var result = store.Reject(id);
    if (result.NotFound) return Results.NotFound();
    if (result.InvalidState) return Results.Conflict(new { error = "Only pending reservations can be rejected." });
    notifications.Add("approval", "Reservation declined",
        $"{result.Reservation!.Title} for {result.Reservation.Start:MMM d, h:mm tt} was declined.",
        result.Reservation.Id, result.Reservation.SeriesId);
    return Results.Ok(result.Reservation);
});

app.MapGet("/api/notifications", (NotificationStore notifications) =>
{
    var result = notifications.List();
    return Results.Ok(new { notifications = result.Notifications, unreadCount = result.UnreadCount });
});

app.MapPost("/api/notifications/{id}/read", (string id, NotificationStore notifications) =>
    notifications.MarkRead(id) ? Results.NoContent() : Results.NotFound());

app.MapPost("/api/notifications/read-all", (NotificationStore notifications) =>
{
    notifications.MarkAllRead();
    return Results.NoContent();
});

app.MapPost("/api/search/natural", async (NaturalSearchInput input, ReservationStore store,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(input.Prompt))
        return Results.BadRequest(new { error = "Prompt is required." });
    if (input.Prompt.Length > 500)
        return Results.BadRequest(new { error = "Prompt must be 500 characters or fewer." });

    var localInterpretation = NaturalLanguageSearch.Interpret(input.Prompt);
    var llmInterpretation = await OpenAiBookingExtractor.TryInterpretAsync(
        input.Prompt, localInterpretation, cancellationToken);
    var interpretation = llmInterpretation ?? localInterpretation;
    if (interpretation.Start.HasValue && interpretation.End!.Value - interpretation.Start.Value > ApiQueries.MaxReservationDuration)
        return Results.BadRequest(new { error = "Reservations cannot exceed 12 hours." });
    var filters = new ResourceFilters(interpretation.Query, interpretation.Type,
        interpretation.MinCapacity, interpretation.Features, interpretation.Accessible,
        interpretation.Start, interpretation.End);
    var resources = ResourceSearch.Find(filters, store.List(), store.MaintenanceList());
    var explanation = interpretation.Start.HasValue
        ? $"Found {resources.Count} available matching resources for {interpretation.Start:MMM d, h:mm tt} to {interpretation.End:h:mm tt} ({CampusTime.ZoneName})."
        : $"Found {resources.Count} matching resources. Add a date and time to check availability.";
    return Results.Ok(new
    {
        interpretation,
        resources,
        explanation,
        source = llmInterpretation is null ? "rule-based" : "openai+rules"
    });
});

app.MapGet("/api/stats/utilization", (HttpRequest request, ReservationStore store) =>
{
    if (!ApiQueries.TryWindow(request, "from", "to", false, out var from, out var to, out var error))
        return Results.BadRequest(new { error });
    from ??= CampusTime.At(CampusTime.Today, 8);
    to ??= CampusTime.At(CampusTime.Today.AddDays(7), 20);
    if (to <= from) return Results.BadRequest(new { error = "to must be after from." });
    var availableHours = (to.Value - from.Value).TotalHours;
    var reservations = store.List().Where(r => r.Status == "confirmed").ToArray();
    var maintenance = store.MaintenanceList();
    var rooms = ResourceCatalog.All.Where(r => r.Type != "equipment").ToArray();
    var utilization = rooms.Select(resource =>
    {
        var maintenanceHours = maintenance.Where(window => window.ResourceId.Equals(resource.Id, StringComparison.OrdinalIgnoreCase))
            .Sum(window => Math.Max(0, ((window.End < to.Value ? window.End : to.Value) -
                (window.Start > from.Value ? window.Start : from.Value)).TotalHours));
        var resourceAvailableHours = Math.Max(0, availableHours - Math.Min(availableHours, maintenanceHours));
        var reservedHours = reservations.Where(r => r.ResourceId.Equals(resource.Id, StringComparison.OrdinalIgnoreCase))
            .Sum(r => Math.Max(0, ((r.End < to.Value ? r.End : to.Value) -
                (r.Start > from.Value ? r.Start : from.Value)).TotalHours));
        return new
        {
            resourceId = resource.Id,
            reservedHours = Math.Round(reservedHours, 2),
            availableHours = Math.Round(resourceAvailableHours, 2),
            utilizationPercentage = resourceAvailableHours <= 0 ? 0 : Math.Round(reservedHours / resourceAvailableHours * 100, 1)
        };
    }).ToArray();
    var totalAvailableHours = utilization.Sum(resource => resource.availableHours);
    return Results.Ok(new
    {
        from,
        to,
        overallPercentage = totalAvailableHours <= 0 ? 0 : Math.Round(utilization.Sum(r => r.reservedHours) /
            totalAvailableHours * 100, 1),
        resources = utilization
    });
});

DemandForecast.Map(app);

app.MapGet("/api/allocations/sample", () =>
{
    var firstDay = CampusTime.Today.AddDays(1);
    while (firstDay.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
        firstDay = firstDay.AddDays(1);
    return Results.Ok(new { events = AllocationPlanner.CreateDemoEvents(CampusTime.At(firstDay, 9)) });
});

app.MapPost("/api/allocations/solve", (AllocationSolveInput input, ReservationStore store) =>
{
    if (input.Events is null) return Results.BadRequest(new { error = "events is required." });
    if (input.Events.Length > 200) return Results.BadRequest(new { error = "A plan can contain at most 200 events." });
    var maintenanceBlocks = store.MaintenanceList().Select(window => new Reservation(
        window.Id, window.ResourceId, window.Reason, "Campus maintenance",
        window.Start, window.End, 0, "confirmed"));
    return Results.Ok(AllocationPlanner.Plan(ResourceCatalog.All, store.List().Concat(maintenanceBlocks), input.Events));
});

app.Run();

namespace SpaceSense.Api
{
    public sealed record AllocationSolveInput(AllocationEvent[]? Events);

    internal static class ApiQueries
    {
        public static readonly TimeSpan MaxReservationDuration = TimeSpan.FromHours(12);

        public static bool TryFilters(HttpRequest request, out ResourceFilters? filters, out string? error)
        {
            filters = null;
            error = null;
            if (!TryWindow(request, "start", "end", false, out var start, out var end, out error))
                return false;
            if (start.HasValue && end!.Value - start.Value > MaxReservationDuration)
            {
                error = "Reservations cannot exceed 12 hours.";
                return false;
            }

            int? capacity = null;
            if (request.Query.TryGetValue("minCapacity", out var capacityRaw))
            {
                if (!int.TryParse(capacityRaw, out var parsed) || parsed < 1)
                {
                    error = "minCapacity must be a positive integer.";
                    return false;
                }
                capacity = parsed;
            }

            bool? accessible = null;
            if (request.Query.TryGetValue("accessible", out var accessibleRaw))
            {
                if (!bool.TryParse(accessibleRaw, out var parsed))
                {
                    error = "accessible must be true or false.";
                    return false;
                }
                accessible = parsed;
            }

            var features = request.Query.TryGetValue("features", out var featuresRaw)
                ? featuresRaw.ToString().Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                : Array.Empty<string>();
            filters = new ResourceFilters(request.Query["query"].ToString(), request.Query["type"].ToString(),
                capacity, features, accessible, start, end);
            return true;
        }

        public static bool TryWindow(HttpRequest request, string startName, string endName,
            bool required, out DateTimeOffset? start, out DateTimeOffset? end, out string? error)
        {
            start = end = null;
            error = null;
            var startRaw = request.Query[startName].ToString();
            var endRaw = request.Query[endName].ToString();
            if (required && (startRaw.Length == 0 || endRaw.Length == 0))
            {
                error = $"{startName} and {endName} are required.";
                return false;
            }
            if ((startRaw.Length == 0) != (endRaw.Length == 0) &&
                startName == "start")
            {
                error = "start and end must be provided together.";
                return false;
            }
            if (startRaw.Length > 0)
            {
                if (!TryDateTime(startRaw, out var value))
                {
                    error = $"{startName} must be a valid ISO date and time.";
                    return false;
                }
                start = value;
            }
            if (endRaw.Length > 0)
            {
                if (!TryDateTime(endRaw, out var value))
                {
                    error = $"{endName} must be a valid ISO date and time.";
                    return false;
                }
                end = value;
            }
            if (start.HasValue && end.HasValue && end <= start)
            {
                error = $"{endName} must be after {startName}.";
                return false;
            }
            return true;
        }

        private static bool TryDateTime(string raw, out DateTimeOffset value) =>
            DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.AssumeUniversal, out value);

        public static Dictionary<string, string[]> ValidateReservation(ReservationInput input)
        {
            var errors = new Dictionary<string, string[]>();
            var resource = input.ResourceId is null ? null : ResourceCatalog.Find(input.ResourceId);
            if (resource is null) errors["resourceId"] = ["Choose an existing resource."];
            if (string.IsNullOrWhiteSpace(input.Title) || input.Title.Length > 120)
                errors["title"] = ["Title is required and must be 120 characters or fewer."];
            if (string.IsNullOrWhiteSpace(input.Organizer) || input.Organizer.Length > 120)
                errors["organizer"] = ["Organizer is required and must be 120 characters or fewer."];
            if (input.Start == default || input.End <= input.Start)
                errors["end"] = ["End time must be after start time."];
            else if (input.End - input.Start > MaxReservationDuration)
                errors["end"] = ["Reservations cannot exceed 12 hours."];
            if (input.Attendees < 1 || (resource is not null && input.Attendees > resource.Capacity))
                errors["attendees"] = ["Attendees must be between 1 and the resource capacity."];
            if (input.RepeatWeeks is < 1 or > 12)
                errors["repeatWeeks"] = ["Repeat weeks must be between 1 and 12."];
            return errors;
        }
    }
}
