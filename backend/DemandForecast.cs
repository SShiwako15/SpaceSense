namespace SpaceSense.Api;

public sealed record ForecastDay(
    DateOnly Date,
    string Term,
    double PredictedRoomHours,
    double BookedRoomHours,
    double AvailableRoomHours,
    double DemandPercentage);

public sealed record ForecastResourceType(
    string Type,
    double PredictedRoomHours,
    double BookedRoomHours,
    double AvailableRoomHours,
    double DemandPercentage);

public sealed record DemandForecastResult(
    string Method,
    int HistoryReservations,
    string Note,
    ForecastDay[] Days,
    ForecastResourceType[] ByType);

/// <summary>
/// A transparent seasonal time-series baseline for the local demo. It uses the
/// last eight matching weekdays, weights recent observations more heavily,
/// adjusts for the academic term, and never predicts fewer hours than are
/// already booked. It does not claim to be a trained machine-learning model.
/// </summary>
public static class DemandForecast
{
    private const int HistoryWeeks = 8;
    private static readonly TimeZoneInfo CampusZone = FindCampusZone();

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/stats/forecast", (HttpRequest request, ReservationStore store) =>
        {
            var rawDays = request.Query["days"].ToString();
            if (rawDays.Length > 0 && (!int.TryParse(rawDays, out var parsed) || parsed is < 1 or > 30))
                return Results.BadRequest(new { error = "days must be between 1 and 30." });

            var days = rawDays.Length == 0 ? 14 : int.Parse(rawDays);
            return Results.Ok(Build(ResourceCatalog.All, store.List(), CampusTime.Today, days, store.MaintenanceList()));
        });
    }

    public static DemandForecastResult Build(
        IEnumerable<Resource> resources,
        IEnumerable<Reservation> reservations,
        DateOnly today,
        int days = 14,
        IEnumerable<MaintenanceWindow>? maintenanceWindows = null)
    {
        ArgumentNullException.ThrowIfNull(resources);
        ArgumentNullException.ThrowIfNull(reservations);
        if (days is < 1 or > 30) throw new ArgumentOutOfRangeException(nameof(days));

        var rooms = resources.Where(resource => resource.Type != "equipment")
            .ToDictionary(resource => resource.Id, StringComparer.OrdinalIgnoreCase);
        var types = rooms.Values.GroupBy(resource => resource.Type, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);
        var historyStart = today.AddDays(-7 * HistoryWeeks);
        var todayStart = CampusTime.At(today, 0);
        var confirmed = reservations
            .Where(reservation => reservation.Status == "confirmed" &&
                reservation.End > reservation.Start && rooms.ContainsKey(reservation.ResourceId))
            .ToArray();

        // A booking only trains the baseline after it has fully ended. Splitting
        // its hours across campus dates must not inflate the reservation count.
        var historicalReservations = confirmed.Where(reservation =>
            CampusDate(reservation.Start) >= historyStart && reservation.End <= todayStart).ToArray();
        var historical = historicalReservations
            .SelectMany(reservation => SplitBooking(reservation, rooms[reservation.ResourceId].Type))
            .Where(sample => sample.Date >= historyStart && sample.Date < today)
            .ToArray();
        var hoursByDayAndType = historical
            .GroupBy(sample => (sample.Date, sample.Type))
            .ToDictionary(group => group.Key, group => group.Sum(sample => sample.Hours));
        var futureBookings = confirmed
            .SelectMany(reservation => SplitBooking(reservation, rooms[reservation.ResourceId].Type))
            .Where(sample => sample.Date >= today && sample.Date < today.AddDays(days))
            .GroupBy(sample => (sample.Date, sample.Type))
            .ToDictionary(group => group.Key, group => group.Sum(sample => sample.Hours));
        var maintenanceHours = (maintenanceWindows ?? Array.Empty<MaintenanceWindow>())
            .Where(window => rooms.ContainsKey(window.ResourceId) && window.End > window.Start)
            .SelectMany(window => SplitWindow(window.Start, window.End, rooms[window.ResourceId].Type))
            .Where(sample => sample.Date >= today && sample.Date < today.AddDays(days))
            .GroupBy(sample => (sample.Date, sample.Type))
            .ToDictionary(group => group.Key, group => group.Sum(sample => sample.Hours));

        var totalsByType = types.Keys.ToDictionary(type => type,
            type => new TypeTotals(), StringComparer.OrdinalIgnoreCase);
        var forecastDays = new List<ForecastDay>(days);

        for (var dayOffset = 0; dayOffset < days; dayOffset++)
        {
            var date = today.AddDays(dayOffset);
            var hoursInDay = (CampusTime.At(date.AddDays(1), 0) - CampusTime.At(date, 0)).TotalHours;
            var totalPredicted = 0.0;
            var totalBooked = 0.0;
            var totalCapacity = 0.0;

            foreach (var (type, count) in types)
            {
                var grossCapacity = count * hoursInDay;
                var capacity = Math.Max(0, grossCapacity -
                    Math.Min(grossCapacity, maintenanceHours.GetValueOrDefault((date, type))));
                var booked = Math.Min(capacity, futureBookings.GetValueOrDefault((date, type)));
                var samples = Enumerable.Range(0, 7 * HistoryWeeks)
                    .Select(back => today.AddDays(-1 - back))
                    .Where(previous => previous.DayOfWeek == date.DayOfWeek)
                    .Take(HistoryWeeks)
                    .ToArray();

                var weightedHours = 0.0;
                var weightTotal = 0.0;
                for (var index = 0; index < samples.Length; index++)
                {
                    var previous = samples[index];
                    var weight = Math.Pow(0.8, index);
                    var observed = hoursByDayAndType.GetValueOrDefault((previous, type));
                    weightedHours += observed / TermFactor(previous) * TermFactor(date) * weight;
                    weightTotal += weight;
                }

                var predicted = weightTotal == 0 ? 0 : weightedHours / weightTotal;
                predicted = Math.Min(capacity, Math.Max(booked, predicted));
                totalPredicted += predicted;
                totalBooked += booked;
                totalCapacity += capacity;
                totalsByType[type].Predicted += predicted;
                totalsByType[type].Booked += booked;
                totalsByType[type].Capacity += capacity;
            }

            forecastDays.Add(new ForecastDay(date, Term(date), Round(totalPredicted),
                Round(totalBooked), Round(totalCapacity), Percent(totalPredicted, totalCapacity)));
        }

        var byType = totalsByType.OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase)
            .Select(pair => new ForecastResourceType(pair.Key, Round(pair.Value.Predicted),
                Round(pair.Value.Booked), Round(pair.Value.Capacity),
                Percent(pair.Value.Predicted, pair.Value.Capacity)))
            .ToArray();

        var note = historicalReservations.Length switch
        {
            0 => "No completed room bookings in the past eight weeks. The outlook reflects confirmed upcoming bookings only.",
            < 20 => $"Only {historicalReservations.Length} completed room bookings are available; treat this outlook as a rough estimate.",
            _ => $"Based on {historicalReservations.Length} completed room bookings in the past eight weeks. Fictional demo history may be present on a new installation."
        };

        return new DemandForecastResult(
            "Recency-weighted same-weekday average with academic-term adjustment and a confirmed-booking floor.",
            historicalReservations.Length, note, forecastDays.ToArray(), byType);
    }

    private static IEnumerable<BookingSample> SplitBooking(Reservation reservation, string type)
        => SplitWindow(reservation.Start, reservation.End, type);

    private static IEnumerable<BookingSample> SplitWindow(DateTimeOffset start, DateTimeOffset end, string type)
    {
        var cursor = start;
        while (cursor < end)
        {
            var date = CampusDate(cursor);
            var nextMidnight = CampusTime.At(date.AddDays(1), 0);
            var segmentEnd = nextMidnight < end ? nextMidnight : end;
            yield return new BookingSample(date, type, (segmentEnd - cursor).TotalHours);
            cursor = segmentEnd;
        }
    }

    private static DateOnly CampusDate(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, CampusZone).DateTime);

    private static string Term(DateOnly date) => date.Month switch
    {
        1 when date.Day < 15 => "break",
        1 or 2 or 3 or 4 => "spring",
        5 when date.Day <= 15 => "spring",
        5 or 6 or 7 => "summer",
        8 when date.Day <= 15 => "summer",
        8 or 9 or 10 or 11 => "fall",
        12 when date.Day <= 20 => "fall",
        _ => "break"
    };

    private static double TermFactor(DateOnly date) => Term(date) switch
    {
        "spring" => 0.95,
        "summer" => 0.55,
        "break" => 0.3,
        _ => 1.0
    };

    private static double Round(double value) => Math.Round(value, 1);
    private static double Percent(double value, double total) =>
        total == 0 ? 0 : Math.Round(value / total * 100, 1);

    private static TimeZoneInfo FindCampusZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(CampusTime.ZoneName); }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
        }
    }

    private sealed record BookingSample(DateOnly Date, string Type, double Hours);

    private sealed class TypeTotals
    {
        public double Predicted { get; set; }
        public double Booked { get; set; }
        public double Capacity { get; set; }
    }
}
