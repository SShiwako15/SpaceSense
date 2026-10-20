namespace SpaceSense.Api;

public static class ResourceSearch
{
    public static IReadOnlyList<Resource> Find(ResourceFilters filters, IEnumerable<Reservation> reservations)
    {
        var requiredFeatures = filters.Features.Where(f => !string.IsNullOrWhiteSpace(f))
            .Select(f => f.Trim()).ToArray();
        var bookings = reservations.Where(r => r.Status is "confirmed" or "pending").ToArray();

        return ResourceCatalog.All.Where(resource =>
            MatchesText(resource, filters.Query) &&
            MatchesType(resource, filters.Type) &&
            (!filters.MinCapacity.HasValue || resource.Capacity >= filters.MinCapacity.Value) &&
            (!filters.Accessible.HasValue || resource.Accessible == filters.Accessible.Value) &&
            requiredFeatures.All(f => resource.Features.Contains(f, StringComparer.OrdinalIgnoreCase)) &&
            (!filters.Start.HasValue || !filters.End.HasValue ||
                !bookings.Any(r => r.ResourceId.Equals(resource.Id, StringComparison.OrdinalIgnoreCase) &&
                    r.Start < filters.End.Value && filters.Start.Value < r.End))
        ).ToArray();
    }

    private static bool MatchesText(Resource resource, string? query) =>
        string.IsNullOrWhiteSpace(query) ||
        new[] { resource.Name, resource.Type, resource.Building, resource.Description }
            .Concat(resource.Features)
            .Any(part => part.Contains(query.Trim(), StringComparison.OrdinalIgnoreCase));

    private static bool MatchesType(Resource resource, string? type) =>
        string.IsNullOrWhiteSpace(type) ||
        (type.Equals("room", StringComparison.OrdinalIgnoreCase) && resource.Type != "equipment") ||
        resource.Type.Equals(type, StringComparison.OrdinalIgnoreCase);
}
