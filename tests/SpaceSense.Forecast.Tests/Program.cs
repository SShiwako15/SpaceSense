using SpaceSense.Api;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

static Reservation Booking(string id, string resourceId, DateOnly day, int start, int end) =>
    new(id, resourceId, id, "Test", CampusTime.At(day, start), CampusTime.At(day, end),
        1, "confirmed");

var room = new Resource("room", "Room", "classroom", "Test", 30, [], true, "");
var lab = new Resource("lab", "Lab", "lab", "Test", 20, [], true, "");
var kit = new Resource("kit", "Kit", "equipment", "Test", 1, [], true, "");
var today = new DateOnly(2026, 10, 19); // Monday in the fall term.
var history = Enumerable.Range(1, 8)
    .Select(week => Booking($"room-{week}", "room", today.AddDays(-7 * week), 9, 11))
    .ToList();
history.Add(Booking("equipment", "kit", today.AddDays(-7), 9, 17));
history.Add(Booking("upcoming", "room", today, 13, 16));

var forecast = DemandForecast.Build([room, lab, kit], history, today, 2);
Check(forecast.HistoryReservations == 8,
    "The training count must include completed room bookings only.");
Check(forecast.Days[0].PredictedRoomHours == 3 && forecast.Days[0].BookedRoomHours == 3,
    "A forecast must never fall below an existing future booking.");
Check(forecast.Days[1].PredictedRoomHours == 0,
    "The forecast should preserve weekday seasonality, including empty days.");
Check(forecast.Days[0].AvailableRoomHours == 48 && forecast.ByType.Length == 2,
    "Equipment must not count as a room or available room hours.");

var overnight = new Reservation("overnight", "room", "Overnight", "Test",
    CampusTime.At(today, 22), CampusTime.At(today.AddDays(1), 2), 1, "confirmed");
var overnightForecast = DemandForecast.Build([room], [overnight], today, 2);
Check(overnightForecast.HistoryReservations == 0 &&
      overnightForecast.Days[0].BookedRoomHours == 2 &&
      overnightForecast.Days[1].BookedRoomHours == 2,
    "An overnight booking must add hours to both campus dates without entering history.");

var fallBackDay = new DateOnly(2026, 11, 1);
var fullFallBackDay = DemandForecast.Build([room],
    [
        Booking("fall-early", "room", fallBackDay, 0, 11),
        Booking("fall-day", "room", fallBackDay, 11, 23),
        new Reservation("fall-late", "room", "Fall late", "Test",
            CampusTime.At(fallBackDay, 23), CampusTime.At(fallBackDay.AddDays(1), 0),
            1, "confirmed")
    ], fallBackDay, 1);
Check(fullFallBackDay.Days[0].AvailableRoomHours == 25 &&
      fullFallBackDay.Days[0].BookedRoomHours == 25 &&
      fullFallBackDay.Days[0].PredictedRoomHours == 25 &&
      fullFallBackDay.Days[0].DemandPercentage == 100,
    "A fully booked fall-back day must retain its twenty-fifth hour.");
var springForwardDay = new DateOnly(2026, 3, 8);
Check(DemandForecast.Build([room], [], springForwardDay, 1).Days[0].AvailableRoomHours == 23,
    "A spring-forward day must have only twenty-three calendar hours.");

var summerHistory = Enumerable.Range(1, 8)
    .Select(week => Booking($"summer-{week}", "room",
        new DateOnly(2026, 8, 17).AddDays(-7 * week), 9, 11));
var fallForecast = DemandForecast.Build([room], summerHistory,
    new DateOnly(2026, 8, 17), 1);
Check(fallForecast.Days[0].Term == "fall" &&
      fallForecast.Days[0].PredictedRoomHours > 2,
    "The fall forecast should adjust a summer weekday baseline upward.");

var emptyForecast = DemandForecast.Build([room],
    [Booking("future", "room", today, 8, 10)], today, 1);
Check(emptyForecast.HistoryReservations == 0 &&
      emptyForecast.Days[0].PredictedRoomHours == 2 &&
      emptyForecast.Note.Contains("No completed", StringComparison.Ordinal),
    "Sparse history must be identified without hiding confirmed future bookings.");

Console.WriteLine("Forecast checks passed.");
