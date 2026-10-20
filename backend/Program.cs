using System.Globalization;
using SpaceSense.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<ReservationStore>();
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
    return Results.Ok(ResourceSearch.Find(filters!, store.List()));
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
    return Results.Ok(new { resourceId = resource.Id, available = conflicts.Count == 0, conflicts });
});

app.MapGet("/api/reservations", (HttpRequest request, ReservationStore store) =>
{
    if (!ApiQueries.TryWindow(request, "from", "to", false, out var from, out var to, out var error))
        return Results.BadRequest(new { error });
    var status = request.Query["status"].ToString();
    if (status.Length > 0 && status is not ("pending" or "confirmed" or "rejected"))
        return Results.BadRequest(new { error = "status must be pending, confirmed, or rejected." });
    var result = store.List().Where(r => (status.Length == 0 || r.Status == status) &&
        (!from.HasValue || r.End > from.Value) &&
        (!to.HasValue || r.Start < to.Value)).OrderBy(r => r.Start).ToArray();
    return Results.Ok(result);
});

app.MapPost("/api/reservations", (ReservationInput input, ReservationStore store) =>
{
    var errors = ApiQueries.ValidateReservation(input);
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var canonicalInput = input with { ResourceId = ResourceCatalog.Find(input.ResourceId!)!.Id };
    var result = store.Save(canonicalInput);
    return result.Reservation is null
        ? Results.Conflict(new { error = "Resource is already booked for this time.", conflicts = result.Conflicts })
        : Results.Created($"/api/reservations/{result.Reservation.Id}", result.Reservation);
});

app.MapPut("/api/reservations/{id}", (string id, ReservationInput input, ReservationStore store) =>
{
    var errors = ApiQueries.ValidateReservation(input);
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var canonicalInput = input with { ResourceId = ResourceCatalog.Find(input.ResourceId!)!.Id };
    var result = store.Save(canonicalInput, id);
    if (result.NotFound) return Results.NotFound();
    return result.Reservation is null
        ? Results.Conflict(new { error = "Resource is already booked for this time.", conflicts = result.Conflicts })
        : Results.Ok(result.Reservation);
});

app.MapDelete("/api/reservations/{id}", (string id, ReservationStore store) =>
    store.Delete(id) ? Results.NoContent() : Results.NotFound());

app.MapPost("/api/reservations/{id}/approve", (string id, ReservationStore store) =>
{
    var result = store.Approve(id);
    if (result.NotFound) return Results.NotFound();
    if (result.InvalidState) return Results.Conflict(new { error = "Only pending reservations can be approved." });
    if (result.Reservation is null)
        return Results.Conflict(new { error = "The reservation conflicts with another active booking.", conflicts = result.Conflicts });
    return Results.Ok(result.Reservation);
});

app.MapPost("/api/reservations/{id}/reject", (string id, ReservationStore store) =>
{
    var result = store.Reject(id);
    if (result.NotFound) return Results.NotFound();
    if (result.InvalidState) return Results.Conflict(new { error = "Only pending reservations can be rejected." });
    return Results.Ok(result.Reservation);
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
    var resources = ResourceSearch.Find(filters, store.List());
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
    var rooms = ResourceCatalog.All.Where(r => r.Type != "equipment").ToArray();
    var utilization = rooms.Select(resource =>
    {
        var reservedHours = reservations.Where(r => r.ResourceId.Equals(resource.Id, StringComparison.OrdinalIgnoreCase))
            .Sum(r => Math.Max(0, ((r.End < to.Value ? r.End : to.Value) -
                (r.Start > from.Value ? r.Start : from.Value)).TotalHours));
        return new
        {
            resourceId = resource.Id,
            reservedHours = Math.Round(reservedHours, 2),
            availableHours = Math.Round(availableHours, 2),
            utilizationPercentage = Math.Round(reservedHours / availableHours * 100, 1)
        };
    }).ToArray();
    return Results.Ok(new
    {
        from,
        to,
        overallPercentage = Math.Round(utilization.Sum(r => r.reservedHours) /
            (availableHours * rooms.Length) * 100, 1),
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
    return Results.Ok(AllocationPlanner.Plan(ResourceCatalog.All, store.List(), input.Events));
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
            return errors;
        }
    }
}
