namespace SpaceSense.Api;

public static class CampusTime
{
    public const string ZoneName = "America/New_York";
    private static readonly TimeZoneInfo Zone = FindZone();

    public static DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, Zone).DateTime);

    public static DateTimeOffset At(DateOnly date, int hour, int minute = 0)
    {
        var local = date.ToDateTime(new TimeOnly(hour, minute), DateTimeKind.Unspecified);
        if (Zone.IsInvalidTime(local)) local = local.AddHours(1);
        return new DateTimeOffset(local, Zone.GetUtcOffset(local));
    }

    private static TimeZoneInfo FindZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(ZoneName); }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
        }
    }
}
