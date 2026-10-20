namespace SpaceSense.Api;

public sealed record Resource(
    string Id,
    string Name,
    string Type,
    string Building,
    int Capacity,
    string[] Features,
    bool Accessible,
    string Description);

public sealed record Reservation(
    string Id,
    string ResourceId,
    string Title,
    string Organizer,
    DateTimeOffset Start,
    DateTimeOffset End,
    int Attendees,
    string Status);

public sealed record ReservationInput(
    string? ResourceId,
    string? Title,
    string? Organizer,
    DateTimeOffset Start,
    DateTimeOffset End,
    int Attendees);

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
