using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using SpaceSense.Api;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

var tempRoot = Path.GetFullPath(Path.GetTempPath());
var testRoot = Path.GetFullPath(Path.Combine(tempRoot, $"spacesense-reservations-{Guid.NewGuid():N}"));
Check(testRoot.StartsWith(tempRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar,
    StringComparison.OrdinalIgnoreCase), "Test data must stay within the temporary directory.");

try
{
    var store = new ReservationStore(new TestHostEnvironment(testRoot));
    var seeds = store.List();
    Check(seeds.Count == 165 && seeds.Count(r => r.Id.StartsWith("history-", StringComparison.Ordinal)) == 160,
        "A fresh store should contain eight weeks of history and five upcoming bookings.");
    foreach (var byResource in seeds.GroupBy(r => r.ResourceId))
    {
        var ordered = byResource.OrderBy(r => r.Start).ToArray();
        for (var i = 1; i < ordered.Length; i++)
            Check(ordered[i - 1].End <= ordered[i].Start,
                $"Historical seed bookings overlap for {byResource.Key}.");
    }

    var search = NaturalLanguageSearch.Interpret(
        "Find a room for 20 students with a projector next Tuesday afternoon");
    Check(search.Type == "room" && search.MinCapacity == 20 &&
        search.Features.Contains("projector") && search.Start?.DayOfWeek == DayOfWeek.Tuesday &&
        search.Start?.Hour == 12 && search.End?.Hour == 17,
        "The portfolio example should produce usable structured search filters.");

    var date = CampusTime.Today.AddDays(10);
    var input = new ReservationInput("class-306", "Concurrency check", "Test organizer",
        CampusTime.At(date, 18), CampusTime.At(date, 19), 12);
    var attempts = Enumerable.Range(0, 16)
        .Select(_ => Task.Run(() => store.Save(input))).ToArray();
    await Task.WhenAll(attempts);
    var results = attempts.Select(task => task.Result).ToArray();
    Check(results.Count(result => result.Reservation is not null) == 1 &&
        results.Count(result => result.Conflicts.Count == 1) == 15,
        "Concurrent requests for one slot should create exactly one reservation.");

    var booking = results.Single(result => result.Reservation is not null).Reservation!;
    var filters = new ResourceFilters(null, "classroom", 20, ["projector"], null,
        input.Start, input.End);
    Check(!ResourceSearch.Find(filters, store.List()).Any(r => r.Id == input.ResourceId),
        "Search must hide rooms that have a conflicting booking.");
    Check(store.Conflicts(input.ResourceId!, input.Start, input.End, booking.Id).Count == 0,
        "The availability check must be able to exclude the reservation being edited.");

    var adjacent = input with { Title = "Adjacent booking", Start = input.End,
        End = CampusTime.At(date, 20) };
    var adjacentResult = store.Save(adjacent);
    Check(adjacentResult.Reservation is not null,
        "A booking that starts exactly when another ends should be allowed.");
    var adjacentBooking = adjacentResult.Reservation!;
    var overlappingEdit = store.Save(input with { Title = "Overlapping edit" }, adjacentBooking.Id);
    Check(overlappingEdit.Reservation is null && overlappingEdit.Conflicts.Count == 1,
        "Editing into an occupied slot must be rejected without losing the prior booking.");
    Check(store.Get(adjacentBooking.Id)?.Start == adjacent.Start,
        "A rejected edit must preserve the original reservation.");

    Check(store.Delete(booking.Id) && store.Delete(adjacentBooking.Id),
        "Bookings should be cancellable.");
    Check(store.Conflicts(input.ResourceId!, input.Start, input.End).Count == 0,
        "Cancelling a booking should release its slot.");
    Check(new ReservationStore(new TestHostEnvironment(testRoot)).List().Count == seeds.Count,
        "Changes should persist after reopening the store.");

    Console.WriteLine("Reservation and search checks passed.");
}
finally
{
    if (Directory.Exists(testRoot)) Directory.Delete(testRoot, recursive: true);
}

file sealed class TestHostEnvironment(string contentRootPath) : IHostEnvironment
{
    public string EnvironmentName { get; set; } = Environments.Development;
    public string ApplicationName { get; set; } = "SpaceSense.Reservations.Tests";
    public string ContentRootPath { get; set; } = contentRootPath;
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}
