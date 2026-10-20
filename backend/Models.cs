namespace SpaceSense.Api;

public sealed record Resource(
    string Id,
    string Name,
    string Type,
    string Building,
    int Capacity,
    string[] Features,
    bool Accessible,
    string Description,
    bool RequiresApproval = false);

public sealed record Reservation(
    string Id,
    string ResourceId,
    string Title,
    string Organizer,
    DateTimeOffset Start,
    DateTimeOffset End,
    int Attendees,
    string Status,
    string? SeriesId = null);

public sealed record ReservationInput(
    string? ResourceId,
    string? Title,
    string? Organizer,
    DateTimeOffset Start,
    DateTimeOffset End,
    int Attendees,
    int RepeatWeeks = 1);

public sealed record MaintenanceWindow(
    string Id,
    string ResourceId,
    DateTimeOffset Start,
    DateTimeOffset End,
    string Reason);

public sealed record MaintenanceInput(
    string? ResourceId,
    DateTimeOffset Start,
    DateTimeOffset End,
    string? Reason);

public sealed record ResourceFilters(
    string? Query,
    string? Type,
    int? MinCapacity,
    string[] Features,
    bool? Accessible,
    DateTimeOffset? Start,
    DateTimeOffset? End);

public sealed record NaturalSearchInput(string? Prompt);

public sealed record NaturalInterpretation(
    string? Query,
    string? Type,
    int? MinCapacity,
    string[] Features,
    bool? Accessible,
    DateTimeOffset? Start,
    DateTimeOffset? End);
