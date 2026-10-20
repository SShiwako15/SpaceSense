using SpaceSense.Api;

var day = new DateOnly(2026, 10, 20);
var start = CampusTime.At(day, 9);
var end = CampusTime.At(day, 10);

var small = new Resource("small", "Small", "classroom", "Test", 20,
    ["projector", "whiteboard"], true, "");
var large = new Resource("large", "Large", "classroom", "Test", 40,
    ["projector"], false, "");
var equipment = new Resource("kit", "Kit", "equipment", "Test", 100,
    ["projector"], true, "");

AllocationEvent Event(string id, DateTimeOffset from, DateTimeOffset to,
    int attendees = 15, string[]? features = null, bool accessible = false,
    int priority = 3) => new(id, id, from, to, attendees,
    features ?? ["projector"], accessible, priority);

void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

var existing = new Reservation("booked", "small", "Existing", "Test",
    start, end, 15, "confirmed");
var blocked = AllocationPlanner.Plan([small, large, equipment], [existing],
    [Event("needs-access", start, end, accessible: true)]);
Check(blocked.Assignments.Length == 0 && blocked.Unassigned.Length == 1,
    "Existing booking, accessibility, and equipment constraints must block the event.");

var adjacent = AllocationPlanner.Plan([small, large], [existing],
    [Event("adjacent", end, end.AddHours(1), accessible: true)]);
Check(adjacent.Assignments.Single().ResourceId == "small",
    "An event starting when a reservation ends should be assignable.");

var priorityPlan = AllocationPlanner.Plan([small, large], [],
    [Event("high", start, end, 18, priority: 5),
     Event("low", start, end, 35, priority: 1)]);
Check(priorityPlan.Assignments.Length == 2 &&
      priorityPlan.Assignments.Single(a => a.EventId == "high").ResourceId == "small" &&
      priorityPlan.Assignments.Single(a => a.EventId == "low").ResourceId == "large",
    "The planner should fit both overlapping events without wasting capacity.");

var conflictingPriorities = AllocationPlanner.Plan([small], [],
    [Event("low", start, end, priority: 1),
     Event("high", start, end, priority: 5)]);
Check(conflictingPriorities.Assignments.Single().EventId == "high",
    "Higher-priority events should win when both cannot be assigned.");

var reassigned = AllocationPlanner.Plan([small, large], [],
    [Event("flexible-high", start, end, 18, priority: 5),
     Event("small-only", start, end, 18, ["whiteboard"], priority: 1)]);
Check(reassigned.Assignments.Length == 2 &&
      reassigned.Assignments.Single(a => a.EventId == "flexible-high").ResourceId == "large" &&
      reassigned.Assignments.Single(a => a.EventId == "small-only").ResourceId == "small",
    "The search should move a flexible event so a constrained event can fit.");

var invalidFirst = Event("repeat", start, end) with { Title = "" };
var validSecond = Event("repeat", start, end);
var validation = AllocationPlanner.Plan([small], [],
    [invalidFirst, validSecond,
     Event("invalid-feature", start, end) with { RequiredFeatures = [""] },
     Event("wrong-day", start.AddDays(1), end.AddDays(1)) with { Title = "" }]);
Check(validation.Assignments.Length == 1 && validation.Assignments[0].EventId == "repeat",
    "An invalid event should not consume its ID or block a later valid event.");
Check(validation.Rooms.Single().PlanningMinutes == 600,
    "Invalid events should not expand the utilization window.");
Check(validation.Unassigned.Any(item => item.EventId == "invalid-feature" &&
    item.Reason.Contains("features", StringComparison.OrdinalIgnoreCase)),
    "Blank required features should receive a validation error.");

var utcMorning = new DateTimeOffset(2026, 10, 20, 10, 0, 0, TimeSpan.Zero);
var easternMorning = new DateTimeOffset(2026, 10, 20, 10, 0, 0,
    TimeSpan.FromHours(-4));
var mixedOffsets = AllocationPlanner.Plan([small], [],
    [Event("early", utcMorning, utcMorning.AddHours(1)),
     Event("later", easternMorning, easternMorning.AddHours(1))]);
Check(mixedOffsets.Rooms.Single().PlanningMinutes == 720,
    "Mixed timestamp offsets should share the correct campus-day window.");

var demoEvents = AllocationPlanner.CreateDemoEvents(CampusTime.At(day, 9));
var demoBooking = new Reservation("demo-booked", "seminar", "Existing", "Test",
    demoEvents[0].Start, demoEvents[0].End, 20, "confirmed");
var demoPlan = AllocationPlanner.Plan(ResourceCatalog.All, [demoBooking], demoEvents);
Check(demoEvents.Length == 50 &&
      demoPlan.Summary.AssignedEvents + demoPlan.Summary.UnassignedEvents == 50,
    "The demo must produce and account for 50 events.");
foreach (var assignment in demoPlan.Assignments)
{
    var resource = ResourceCatalog.Find(assignment.ResourceId)!;
    var requested = demoEvents.Single(item => item.Id == assignment.EventId);
    Check(resource.Type != "equipment" && resource.Capacity >= requested.Attendees &&
          (!requested.Accessible || resource.Accessible) &&
          requested.RequiredFeatures.All(feature => resource.Features.Contains(feature,
              StringComparer.OrdinalIgnoreCase)),
        $"Invalid room requirements for {requested.Id}.");
    Check(!demoPlan.Assignments.Any(other => other.EventId != assignment.EventId &&
          other.ResourceId == assignment.ResourceId &&
          assignment.Start < other.End && other.Start < assignment.End),
        $"Overlapping assignments for {requested.Id}.");
    Check(assignment.ResourceId != demoBooking.ResourceId ||
          assignment.Start >= demoBooking.End || assignment.End <= demoBooking.Start,
        $"Assignment for {requested.Id} conflicts with an existing booking.");
}

Console.WriteLine($"Allocation checks passed. Demo assigned {demoPlan.Assignments.Length}/50 events.");
